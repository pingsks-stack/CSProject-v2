import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { loadProject, projectFor, relation } from '../lib/access.js'
import { me, requireAuth } from '../lib/auth.js'
import { badRequest, forbidden, notFound, objectId, parse } from '../lib/http.js'
import { logActivity, notify } from '../lib/notify.js'
import { containsRe, userRef } from '../lib/serialize.js'
import { originalName, removeStored, sendStored, uploader } from '../lib/uploads.js'
import { Project, findMember, memberUserId, students, teachers } from '../models/Project.js'
import { CHAPTERS, Submission } from '../models/Submission.js'
import { Code, Comment, Deadline, ProjectFile } from '../models/misc.js'

// API ที่อยู่ใต้โครงงาน: /api/projects/:id/...
export const projectContentRouter = Router({ mergeParams: true })
// API ที่อ้างด้วย id ของตัวเอง: /api/submissions/:sid, /api/codes/:cid
export const contentRouter = Router()
projectContentRouter.use(requireAuth)
contentRouter.use(['/submissions', '/codes'], requireAuth)

// :id ของโครงงานมาจาก router แม่ (mergeParams) ซึ่ง type ของ Express ไม่รู้จัก
const pid = (req: Request) => String((req.params as Record<string, string>).id)

// ตรวจสิทธิ์ก่อนให้ multer เขียนไฟล์ลงดิสก์
const guard = (need: 'edit' | 'student') => async (req: Request, _res: Response, next: NextFunction) => {
  await projectFor(pid(req), me(req), need)
  next()
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// ===================== ไฟล์ของโครงงาน =====================
projectContentRouter.get('/files', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'view')
  const files = await ProjectFile.find({ project: p._id }).sort({ fileName: 1 }).populate('uploadedBy', 'name')
  res.json({
    files: files.map((f) => ({ id: f.id, fileName: f.fileName, size: f.size, uploadedBy: userRef(f.uploadedBy), updatedAt: f.updatedAt })),
  })
})

// อัปโหลดได้ครั้งละไม่เกิน 10 ไฟล์ ถ้าชื่อซ้ำกับไฟล์เดิมในโครงงาน = แทนที่ไฟล์เดิม
projectContentRouter.post('/files', guard('edit'), uploader('files', 10).array('files', 10), async (req, res) => {
  const user = me(req)
  const projectId = String(pid(req))
  const uploaded = (req.files as Express.Multer.File[] | undefined) ?? []
  if (uploaded.length === 0) throw badRequest('ยังไม่ได้เลือกไฟล์')
  for (const f of uploaded) {
    const fileName = originalName(f)
    const existing = await ProjectFile.findOne({ project: projectId, fileName })
    if (existing) {
      removeStored('files', projectId, existing.storedName)
      existing.storedName = f.filename
      existing.size = f.size
      existing.uploadedBy = user._id
      await existing.save()
      await logActivity(projectId, 'file.replace', user._id, fileName)
    } else {
      await ProjectFile.create({ project: projectId, fileName, storedName: f.filename, size: f.size, uploadedBy: user._id })
      await logActivity(projectId, 'file.add', user._id, fileName)
    }
  }
  res.status(201).json({ count: uploaded.length })
})

projectContentRouter.delete('/files/:fileId', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(pid(req), user, 'edit')
  const f = await ProjectFile.findOneAndDelete({ _id: objectId(req.params.fileId), project: p._id })
  if (!f) throw notFound('ไม่พบไฟล์')
  removeStored('files', p.id, f.storedName)
  await logActivity(p._id, 'file.delete', user._id, f.fileName)
  res.status(204).end()
})

for (const mode of ['download', 'view'] as const) {
  projectContentRouter.get(`/files/:fileId/${mode}`, async (req, res) => {
    const { p } = await projectFor(pid(req), me(req), 'view')
    const f = await ProjectFile.findOne({ _id: objectId(req.params.fileId), project: p._id })
    if (!f) throw notFound('ไม่พบไฟล์')
    sendStored(res, 'files', p.id, f.storedName, f.fileName, mode === 'view')
  })
}

// ===================== เอกสารรายบท =====================
projectContentRouter.get('/chapters', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(pid(req), user, 'view')
  const [deadlines, subs] = await Promise.all([
    Deadline.find({ term: p.term }),
    Submission.find({ project: p._id }).sort({ version: -1 }).populate('uploadedBy reviews.reviewer', 'name'),
  ])
  const today = startOfToday()
  const chapters = CHAPTERS.map((chapter) => {
    const d = deadlines.find((x) => x.chapter === chapter)
    const versions = subs.filter((s) => s.chapter === chapter)
    const latest = versions[0]
    let status: 'not_submitted' | 'overdue' | 'waiting' | 'revise' | 'passed' = 'not_submitted'
    if (!latest) status = d && d.dueDate < today ? 'overdue' : 'not_submitted'
    else if (latest.reviews.some((x) => x.verdict === 'revise')) status = 'revise'
    else if (latest.reviews.length > 0) status = 'passed'
    else status = 'waiting'
    return {
      chapter,
      deadline: d ? { dueDate: d.dueDate, note: d.note } : null,
      status,
      passCount: latest?.reviews.filter((x) => x.verdict === 'pass').length ?? 0,
      versions: versions.map((s) => ({
        id: s.id,
        version: s.version,
        fileName: s.fileName,
        size: s.size,
        note: s.note,
        uploadedBy: userRef(s.uploadedBy),
        createdAt: s.createdAt,
        late: !!d && s.createdAt > d.dueDate,
        reviews: s.reviews.map((x) => ({ reviewer: userRef(x.reviewer), verdict: x.verdict, comment: x.comment, createdAt: x.createdAt })),
      })),
    }
  })
  res.json({ term: p.term, chapters, canUpload: r.isStudent, canReview: r.isTeacher })
})

projectContentRouter.post('/submissions', guard('student'), uploader('submissions').single('file'), async (req, res) => {
  const user = me(req)
  const p = await loadProject(pid(req))
  const file = req.file
  if (!file) throw badRequest('ยังไม่ได้เลือกไฟล์')
  const body = z.object({ chapter: z.enum(CHAPTERS), note: z.string().trim().max(500).default('') }).safeParse(req.body)
  if (!body.success) {
    removeStored('submissions', p.id, file.filename)
    throw badRequest('กรุณาเลือกบทที่จะส่ง')
  }
  const last = await Submission.findOne({ project: p._id, chapter: body.data.chapter }).sort({ version: -1 })
  const version = (last?.version ?? 0) + 1
  await Submission.create({
    project: p._id, chapter: body.data.chapter, version, fileName: originalName(file), storedName: file.filename,
    size: file.size, note: body.data.note, uploadedBy: user._id,
  })
  await logActivity(p._id, 'chapter.submit', user._id, `${body.data.chapter} v${version}`)
  await notify(teachers(p).map(memberUserId), {
    icon: 'file-check', title: `เอกสารรอตรวจ: ${body.data.chapter} v${version}`, detail: p.nameTh, link: `/projects/${p.id}/chapters`,
  })
  res.status(201).json({ chapter: body.data.chapter, version })
})

// download = บันทึกไฟล์, view = เปิดอ่านในเบราว์เซอร์ (PDF)
for (const mode of ['download', 'view'] as const) {
  contentRouter.get(`/submissions/:sid/${mode}`, async (req, res) => {
    const s = await Submission.findById(objectId(req.params.sid))
    if (!s) throw notFound('ไม่พบไฟล์')
    const { p } = await projectFor(s.project, me(req), 'view')
    sendStored(res, 'submissions', p.id, s.storedName, s.fileName, mode === 'view')
  })
}

// อาจารย์ในโครงงานให้ความเห็นได้เฉพาะเวอร์ชันล่าสุด (ให้ซ้ำ = แก้ความเห็นเดิมของตัวเอง)
contentRouter.post('/submissions/:sid/review', async (req, res) => {
  const user = me(req)
  const s = await Submission.findById(objectId(req.params.sid))
  if (!s) throw notFound('ไม่พบเอกสาร')
  const { p } = await projectFor(s.project, user, 'teacher')
  const body = parse(z.object({ verdict: z.enum(['pass', 'revise']), comment: z.string().trim().max(1000).default('') }), req.body)
  if (body.verdict === 'revise' && !body.comment) throw badRequest('ระบุสิ่งที่ต้องแก้ไขให้นิสิตด้วย')
  const latest = await Submission.findOne({ project: s.project, chapter: s.chapter }).sort({ version: -1 }).select('_id')
  if (String(latest?._id) !== String(s._id)) throw badRequest('มีเวอร์ชันใหม่กว่านี้แล้ว')
  const existing = s.reviews.find((x) => String(x.reviewer) === String(user._id))
  if (existing) {
    existing.verdict = body.verdict
    existing.comment = body.comment
    existing.createdAt = new Date()
  } else {
    s.reviews.push({ reviewer: user._id, verdict: body.verdict, comment: body.comment })
  }
  await s.save()
  await logActivity(p._id, 'chapter.review', user._id, `${s.chapter} v${s.version}: ${body.verdict === 'pass' ? 'ผ่าน' : 'ต้องแก้ไข'}`)
  await notify(students(p).map(memberUserId), {
    icon: body.verdict === 'pass' ? 'circle-check' : 'pencil',
    title: body.verdict === 'pass' ? `${user.name} ให้ผ่าน ${s.chapter}` : `${user.name} ขอให้แก้ไข ${s.chapter}`,
    detail: body.comment.slice(0, 80) || p.nameTh,
    link: `/projects/${p.id}/chapters`,
  })
  res.status(204).end()
})

// ===================== ซอร์สโค้ด =====================
const codeBody = z.object({
  language: z.string().trim().min(1).max(30),
  functionName: z.string().trim().min(1, 'กรุณากรอกชื่อฟังก์ชัน').max(100),
  code: z.string().min(1, 'กรุณาใส่โค้ด').max(200_000),
})

projectContentRouter.get('/codes', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'view')
  const codes = await Code.find({ project: p._id }).sort({ updatedAt: -1 }).populate('updatedBy', 'name')
  res.json({ codes: codes.map((c) => codeDto(c)) })
})

projectContentRouter.post('/codes', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(pid(req), user, 'edit')
  const body = parse(codeBody, req.body)
  const c = await Code.create({ ...body, project: p._id, updatedBy: user._id })
  await logActivity(p._id, 'code.add', user._id, body.functionName)
  res.status(201).json({ id: c.id })
})

function codeDto(c: InstanceType<typeof Code>, project?: { id: string; nameTh: string } | null) {
  return {
    id: c.id as string,
    language: c.language,
    functionName: c.functionName,
    code: c.code,
    lines: c.code.split('\n').length,
    githubPath: c.githubPath ?? null,
    updatedBy: userRef(c.updatedBy),
    updatedAt: c.updatedAt,
    project: project ?? undefined,
  }
}

// คลังซอร์สโค้ด: แอดมินเห็นทั้งหมด คนอื่นเห็นโครงงานที่ผ่านแล้วและโครงงานของตัวเอง
contentRouter.get('/codes', async (req, res) => {
  const user = me(req)
  const q = parse(
    z.object({
      q: z.string().optional(),
      lang: z.string().optional(),
      project: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  )
  const projFilter: Record<string, unknown> = user.role === 'admin' ? {} : { $or: [{ status: 'passed' }, { 'members.user': user._id }] }
  const projects = await Project.find(projFilter).select('nameTh')
  const names = new Map(projects.map((p) => [p.id as string, p.nameTh]))
  const filter: Record<string, unknown> = { project: { $in: projects.map((p) => p._id) } }
  if (q.project) {
    if (!names.has(q.project)) throw forbidden()
    filter.project = objectId(q.project)
  }
  if (q.lang) filter.language = q.lang
  if (q.q?.trim()) {
    const re = containsRe(q.q)
    const matchProjects = projects.filter((p) => re.test(p.nameTh)).map((p) => p._id)
    filter.$or = [{ functionName: re }, { code: re }, { project: { $in: matchProjects } }]
  }
  const [codes, total] = await Promise.all([
    Code.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).populate('updatedBy', 'name'),
    Code.countDocuments(filter),
  ])
  res.json({
    codes: codes.map((c) => codeDto(c, { id: String(c.project), nameTh: names.get(String(c.project)) ?? '' })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  })
})

async function codeFor(req: Request, need: 'view' | 'edit') {
  const c = await Code.findById(objectId(req.params.cid))
  if (!c) throw notFound('ไม่พบโค้ด')
  const { p } = await projectFor(c.project, me(req), need)
  return { c, p }
}

contentRouter.put('/codes/:cid', async (req, res) => {
  const { c, p } = await codeFor(req, 'edit')
  if (c.githubPath) throw badRequest('โค้ดนี้อัปเดตจาก GitHub อัตโนมัติ ให้แก้ไขใน repository แทน')
  Object.assign(c, parse(codeBody, req.body), { updatedBy: me(req)._id })
  await c.save()
  await logActivity(p._id, 'code.update', me(req)._id, c.functionName)
  res.status(204).end()
})

contentRouter.delete('/codes/:cid', async (req, res) => {
  const { c, p } = await codeFor(req, 'edit')
  await c.deleteOne()
  await logActivity(p._id, 'code.delete', me(req)._id, c.functionName)
  res.status(204).end()
})

// ===================== ความเห็นอาจารย์ (เธรดละ 1 อาจารย์ต่อโครงงาน) =====================
async function threadFor(req: Request) {
  const user = me(req)
  const p = await loadProject(pid(req))
  const r = relation(p, user)
  const teacher = findMember(p, req.params.teacherId)
  if (!teacher || teacher.kind !== 'teacher') throw notFound('ไม่พบอาจารย์ในโครงงาน')
  const isThatTeacher = memberUserId(teacher) === String(user._id)
  if (!(r.isAdmin || r.isStudent || isThatTeacher)) throw forbidden()
  return { p, teacherId: memberUserId(teacher), isThatTeacher }
}

projectContentRouter.get('/comments/:teacherId', async (req, res) => {
  const { p, teacherId } = await threadFor(req)
  const list = await Comment.find({ project: p._id, teacher: teacherId }).sort({ createdAt: 1 }).populate('author', 'name role')
  res.json({ comments: list.map((c) => ({ id: c.id, text: c.text, author: userRef(c.author), createdAt: c.createdAt })) })
})

projectContentRouter.post('/comments/:teacherId', async (req, res) => {
  const user = me(req)
  const { p, teacherId, isThatTeacher } = await threadFor(req)
  const { text } = parse(z.object({ text: z.string().trim().min(1, 'กรุณาพิมพ์ความเห็นก่อนกดบันทึก').max(1000) }), req.body)
  await Comment.create({ project: p._id, teacher: teacherId, author: user._id, text })
  const to = isThatTeacher ? students(p).map(memberUserId) : [teacherId]
  await notify(to, { icon: 'message-square', title: `ความเห็นจาก ${user.name}`, detail: text.slice(0, 80), link: `/projects/${p.id}/comments/${teacherId}` }, user._id)
  res.status(201).end()
})
