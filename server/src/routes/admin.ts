import { Router } from 'express'
import { z } from 'zod'
import { me, requireAuth, requireRole, revokeSessions } from '../lib/auth.js'
import { badRequest, notFound, objectId, parse } from '../lib/http.js'
import { hashPassword, tempPassword } from '../lib/password.js'
import { csvDate, sendCsv, toCsv } from '../lib/csv.js'
import { PROJECT_POPULATE, containsRe, escapeRegex } from '../lib/serialize.js'
import { Project, currentTerm } from '../models/Project.js'
import { CHAPTERS, Submission } from '../models/Submission.js'
import { ROLES, User, publicUser } from '../models/User.js'
import { Deadline, ProjectType, getSettings, orderedTypes } from '../models/misc.js'
import { assertUnique, emailRule, mobileRule, nameRule, passwordRule, studentIdRule, usernameRule } from './auth.js'
import { listQuery, projectListFilter } from './projects.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('admin'))

// ===================== ผู้ใช้งาน =====================
adminRouter.get('/users', async (req, res) => {
  const q = parse(
    z.object({
      role: z.enum(ROLES).optional(),
      q: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    req.query,
  )
  const filter: Record<string, unknown> = {}
  if (q.role) filter.role = q.role
  if (q.q?.trim()) {
    const re = containsRe(q.q)
    filter.$or = [{ name: re }, { username: re }, { email: re }, { studentId: re }]
  }
  const [users, total, counts, projectCounts] = await Promise.all([
    User.find(filter).sort({ role: -1, name: 1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize),
    User.countDocuments(filter),
    User.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Project.aggregate<{ _id: unknown; n: number }>([{ $unwind: '$members' }, { $group: { _id: '$members.user', n: { $sum: 1 } } }]),
  ])
  const pc = new Map(projectCounts.map((r) => [String(r._id), r.n]))
  res.json({
    users: users.map((u) => ({ ...publicUser(u), projects: pc.get(u.id) ?? 0 })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    total,
    page: q.page,
    pageSize: q.pageSize,
  })
})

adminRouter.post('/users', async (req, res) => {
  const body = parse(
    z.object({
      role: z.enum(ROLES),
      name: nameRule,
      username: usernameRule,
      email: emailRule,
      mobile: z.union([mobileRule, z.literal('')]).default(''),
      studentId: z.union([studentIdRule, z.literal('')]).default(''),
      password: passwordRule,
    }),
    req.body,
  )
  if (body.role === 'student' && !body.studentId) throw badRequest('บัญชีนิสิตต้องมีรหัสนิสิต')
  if (body.role !== 'student') body.studentId = ''
  await assertUnique(body)
  const user = await User.create({ ...body, passwordHash: await hashPassword(body.password) })
  res.status(201).json({ user: publicUser(user) })
})

adminRouter.patch('/users/:id', async (req, res) => {
  const user = await User.findById(objectId(req.params.id))
  if (!user) throw notFound('ไม่พบผู้ใช้')
  const body = parse(
    z.object({
      role: z.enum(ROLES).optional(),
      name: nameRule.optional(),
      email: emailRule.optional(),
      mobile: z.union([mobileRule, z.literal('')]).optional(),
      studentId: z.union([studentIdRule, z.literal('')]).optional(),
    }),
    req.body,
  )
  if (body.role && body.role !== user.role) {
    if (user.id === me(req).id) throw badRequest('เปลี่ยนบทบาทของตัวเองไม่ได้')
    // คนที่อยู่ในโครงงานแล้วห้ามเปลี่ยนบทบาท ไม่งั้นสมาชิกนิสิต/อาจารย์ของโครงงานจะไม่ตรงกับบทบาทจริง
    if (await Project.exists({ 'members.user': user._id })) throw badRequest('ผู้ใช้นี้อยู่ในโครงงาน เปลี่ยนบทบาทไม่ได้')
  }
  await assertUnique({ email: body.email, mobile: body.mobile || undefined, studentId: body.studentId || undefined }, user._id)
  Object.assign(user, body)
  await user.save()
  res.json({ user: publicUser(user) })
})

adminRouter.post('/users/:id/reset-password', async (req, res) => {
  const user = await User.findById(objectId(req.params.id))
  if (!user) throw notFound('ไม่พบผู้ใช้')
  const { password } = parse(z.object({ password: passwordRule.optional() }), req.body ?? {})
  const pw = password ?? tempPassword()
  user.passwordHash = await hashPassword(pw)
  revokeSessions(user)
  await user.save()
  res.json({ password: pw })
})

adminRouter.delete('/users/:id', async (req, res) => {
  const user = await User.findById(objectId(req.params.id))
  if (!user) throw notFound('ไม่พบผู้ใช้')
  if (user.id === me(req).id) throw badRequest('ลบบัญชีของตัวเองไม่ได้')
  if (await Project.exists({ 'members.user': user._id })) throw badRequest('ผู้ใช้นี้อยู่ในโครงงาน ลบไม่ได้')
  await user.deleteOne()
  res.status(204).end()
})

// ===================== ประเภทโครงงาน =====================
adminRouter.get('/types', async (_req, res) => {
  const [types, used] = await Promise.all([
    orderedTypes(),
    Project.aggregate<{ _id: unknown; n: number }>([{ $group: { _id: '$type', n: { $sum: 1 } } }]),
  ])
  const counts = new Map(used.map((u) => [String(u._id), u.n]))
  res.json({ types: types.map((t) => ({ id: t.id, name: t.name, order: t.order, used: counts.get(t.id) ?? 0 })) })
})

const typeName = z.string().trim().min(1, 'กรุณากรอกชื่อประเภท').max(50)
const typeExists = (name: string, except?: unknown) =>
  ProjectType.exists({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), ...(except ? { _id: { $ne: except } } : {}) })

adminRouter.post('/types', async (req, res) => {
  const { name } = parse(z.object({ name: typeName }), req.body)
  if (await typeExists(name)) throw badRequest('มีประเภทนี้อยู่แล้ว')
  const last = await ProjectType.findOne().sort({ order: -1 })
  const t = await ProjectType.create({ name, order: (last?.order ?? 0) + 1 })
  res.status(201).json({ id: t.id })
})

adminRouter.patch('/types/:id', async (req, res) => {
  const { name } = parse(z.object({ name: typeName }), req.body)
  const t = await ProjectType.findById(objectId(req.params.id))
  if (!t) throw notFound()
  if (await typeExists(name, t._id)) throw badRequest('มีประเภทชื่อนี้อยู่แล้ว')
  t.name = name
  await t.save()
  res.status(204).end()
})

adminRouter.delete('/types/:id', async (req, res) => {
  const id = objectId(req.params.id)
  if (await Project.exists({ type: id })) throw badRequest('มีโครงงานใช้ประเภทนี้อยู่')
  await ProjectType.deleteOne({ _id: id })
  res.status(204).end()
})

// ===================== กำหนดส่งงาน =====================
function nextTerm(term: string) {
  const [y, t] = term.split('/').map(Number)
  return t >= 3 ? `${y + 1}/1` : `${y}/${t + 1}`
}

adminRouter.get('/deadlines', async (_req, res) => {
  const [deadlines, projectTerms, submitted] = await Promise.all([
    Deadline.find().sort({ term: -1, dueDate: 1 }),
    Project.aggregate<{ _id: string; n: number; ids: unknown[] }>([{ $group: { _id: '$term', n: { $sum: 1 }, ids: { $push: '$_id' } } }]),
    Submission.aggregate<{ _id: { p: unknown; c: string } }>([{ $group: { _id: { p: '$project', c: '$chapter' } } }]),
  ])
  const termOf = new Map<string, string>()
  for (const t of projectTerms) for (const id of t.ids) termOf.set(String(id), t._id)
  const sentCount = new Map<string, number>()
  for (const s of submitted) {
    const key = `${termOf.get(String(s._id.p))}|${s._id.c}`
    sentCount.set(key, (sentCount.get(key) ?? 0) + 1)
  }
  const projectsPerTerm = new Map(projectTerms.map((t) => [t._id, t.n]))
  const cur = currentTerm()
  const terms = [...new Set([...projectTerms.map((t) => t._id), ...deadlines.map((d) => d.term), cur, nextTerm(cur)])].filter(Boolean).sort().reverse()
  res.json({
    currentTerm: cur,
    terms,
    deadlines: deadlines.map((d) => ({
      id: d.id,
      term: d.term,
      chapter: d.chapter,
      dueDate: d.dueDate,
      note: d.note,
      projects: projectsPerTerm.get(d.term) ?? 0,
      submitted: sentCount.get(`${d.term}|${d.chapter}`) ?? 0,
    })),
  })
})

// บันทึกแบบ upsert: บทเดิมในภาคการศึกษาเดิม = อัปเดตวันที่
adminRouter.put('/deadlines', async (req, res) => {
  const body = parse(
    z.object({
      term: z.string().regex(/^\d{4}\/[1-3]$/, 'รูปแบบปีการศึกษาไม่ถูกต้อง'),
      chapter: z.enum(CHAPTERS),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาเลือกวันที่'),
      note: z.string().trim().max(300).default(''),
    }),
    req.body,
  )
  // ครบกำหนดตอนสิ้นวันตามเวลาประเทศไทย
  const dueDate = new Date(`${body.date}T23:59:59+07:00`)
  if (Number.isNaN(dueDate.getTime())) throw badRequest('วันที่ไม่ถูกต้อง')
  await Deadline.findOneAndUpdate({ term: body.term, chapter: body.chapter }, { dueDate, note: body.note }, { upsert: true })
  res.status(204).end()
})

adminRouter.delete('/deadlines/:id', async (req, res) => {
  await Deadline.deleteOne({ _id: objectId(req.params.id) })
  res.status(204).end()
})

// ===================== ค่าตั้งระบบ (ข้อความในแบบฟอร์มยืนยันโครงงาน) =====================
const settingsBody = z.object({
  courseCode: z.string().trim().max(20),
  courseName: z.string().trim().max(200),
  programName: z.string().trim().max(200),
  facultyName: z.string().trim().max(200),
  universityName: z.string().trim().max(200),
  chairName: z.string().trim().max(200),
  chairTitle: z.string().trim().max(300),
})

adminRouter.get('/settings', async (_req, res) => {
  const s = await getSettings()
  res.json({ settings: settingsBody.parse(s.toObject()) })
})

adminRouter.put('/settings', async (req, res) => {
  const body = parse(settingsBody, req.body)
  const s = await getSettings()
  Object.assign(s, body)
  await s.save()
  res.status(204).end()
})

// ===================== ส่งออกเป็นไฟล์ CSV (เปิดด้วย Excel ได้) =====================
const STATUS_TH = (p: { status: string; passCount: number }) =>
  p.status === 'passed' ? 'ผ่านครบ 3/3' : p.status === 'failed' ? 'ไม่ผ่าน' : p.passCount ? `ผ่าน ${p.passCount}/3` : 'รอพิจารณา'
const nameOf = (u: unknown) => (u && typeof u === 'object' && 'name' in u ? String(u.name) : '')
const sidOf = (u: unknown) => (u && typeof u === 'object' && 'studentId' in u ? String(u.studentId ?? '') : '')
const stamp = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

// รายชื่อโครงงาน (ใช้ตัวกรองเดียวกับหน้า "โครงงานทั้งหมด")
adminRouter.get('/export/projects.csv', async (req, res) => {
  const q = parse(listQuery, { ...req.query, scope: 'all' })
  const projects = await Project.find(await projectListFilter(q, me(req))).sort({ term: -1, createdAt: 1 }).populate(PROJECT_POPULATE)
  const ids = projects.map((p) => p._id)
  const [sent, deadlines] = await Promise.all([
    Submission.aggregate<{ _id: { p: unknown; c: string } }>([{ $match: { project: { $in: ids } } }, { $group: { _id: { p: '$project', c: '$chapter' } } }]),
    Deadline.find({ term: { $in: [...new Set(projects.map((p) => p.term))] }, dueDate: { $lt: new Date() } }),
  ])
  const sentSet = new Set(sent.map((s) => `${s._id.p}|${s._id.c}`))
  const rows = projects.map((p, i) => {
    const studs = p.members.filter((m) => m.kind === 'student')
    const advisor = p.members.find((m) => m.kind === 'teacher' && m.teacherRole === 'advisor')
    const committee = p.members.filter((m) => m.kind === 'teacher' && m.teacherRole !== 'advisor')
    const chaptersSent = CHAPTERS.filter((c) => sentSet.has(`${p._id}|${c}`)).length
    const overdue = deadlines.filter((d) => d.term === p.term && !sentSet.has(`${p._id}|${d.chapter}`)).length
    return [
      i + 1, p.nameTh, p.nameEn, p.type && typeof p.type === 'object' && 'name' in p.type ? String(p.type.name) : '', p.term, p.classLevel || '',
      nameOf(studs[0]?.user), sidOf(studs[0]?.user), nameOf(studs[1]?.user), sidOf(studs[1]?.user),
      nameOf(advisor?.user), nameOf(committee[0]?.user), nameOf(committee[1]?.user),
      STATUS_TH(p), p.passCount, chaptersSent, overdue, p.github ? `https://github.com/${p.github.owner}/${p.github.repo}` : '',
      csvDate(p.createdAt), csvDate(p.passedAt),
    ]
  })
  const csv = toCsv(
    ['ลำดับ', 'ชื่อโครงงาน (ไทย)', 'ชื่อโครงงาน (อังกฤษ)', 'ประเภท', 'ปีการศึกษา', 'ชั้นปี', 'นิสิตคนที่ 1', 'รหัสนิสิต 1', 'นิสิตคนที่ 2', 'รหัสนิสิต 2',
      'อาจารย์ที่ปรึกษา', 'กรรมการ 1', 'กรรมการ 2', 'สถานะ', 'อาจารย์ให้ผ่าน (ท่าน)', 'ส่งเอกสารแล้ว (บท)', 'เลยกำหนดยังไม่ส่ง (บท)', 'GitHub', 'วันที่สร้าง', 'วันที่ผ่าน'],
    rows,
  )
  sendCsv(res, `โครงงาน-${q.term ? q.term.replace('/', '-') + '-' : ''}${stamp()}.csv`, csv)
})

// สถานะการส่งเอกสารรายบทของทุกโครงงานในภาคการศึกษา
adminRouter.get('/export/submissions.csv', async (req, res) => {
  const { term } = parse(z.object({ term: z.string().regex(/^\d{4}\/[1-3]$/, 'กรุณาเลือกปีการศึกษา') }), req.query)
  const [projects, deadlines] = await Promise.all([
    Project.find({ term }).sort({ nameTh: 1 }).populate(PROJECT_POPULATE),
    Deadline.find({ term }),
  ])
  const subs = await Submission.find({ project: { $in: projects.map((p) => p._id) } }).sort({ version: -1 })
  const now = new Date()
  const rows: (string | number)[][] = []
  for (const p of projects) {
    const studs = p.members.filter((m) => m.kind === 'student').map((m) => nameOf(m.user)).join(', ')
    for (const chapter of CHAPTERS) {
      const d = deadlines.find((x) => x.chapter === chapter)
      const latest = subs.find((s) => String(s.project) === String(p._id) && s.chapter === chapter)
      let status = 'ยังไม่ส่ง'
      if (!latest) status = d && d.dueDate < now ? 'เลยกำหนด' : 'ยังไม่ส่ง'
      else if (latest.reviews.some((r) => r.verdict === 'revise')) status = 'ต้องแก้ไข'
      else if (latest.reviews.length) status = `ผ่าน (${latest.reviews.length})`
      else status = 'รอตรวจ'
      if (!d && !latest) continue
      rows.push([
        p.nameTh, studs, chapter, csvDate(d?.dueDate), latest ? `v${latest.version}` : '', csvDate(latest?.createdAt, true),
        latest && d && latest.createdAt > d.dueDate ? 'ส่งช้า' : '', status,
      ])
    }
  }
  sendCsv(res, `การส่งเอกสาร-${term.replace('/', '-')}-${stamp()}.csv`, toCsv(['โครงงาน', 'นิสิต', 'บท', 'กำหนดส่ง', 'เวอร์ชันล่าสุด', 'ส่งเมื่อ', 'ส่งช้า', 'ผลตรวจ'], rows))
})

adminRouter.get('/export/users.csv', async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(ROLES).optional() }), req.query)
  const users = await User.find(role ? { role } : {}).sort({ role: -1, name: 1 })
  const ROLE_TH: Record<string, string> = { student: 'นิสิต', teacher: 'อาจารย์', admin: 'ผู้ดูแลระบบ' }
  const rows = users.map((u, i) => [i + 1, u.name, u.username, u.email, ROLE_TH[u.role] ?? u.role, u.studentId, u.mobile, csvDate(u.createdAt)])
  sendCsv(res, `ผู้ใช้งาน-${stamp()}.csv`, toCsv(['ลำดับ', 'ชื่อ-นามสกุล', 'ชื่อผู้ใช้', 'อีเมล', 'บทบาท', 'รหัสนิสิต', 'เบอร์โทร', 'วันที่สร้างบัญชี'], rows))
})
