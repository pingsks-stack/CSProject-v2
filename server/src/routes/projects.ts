import { Router } from 'express'
import { z } from 'zod'
import { projectFor, relation } from '../lib/access.js'
import { me, requireAuth, requireRole } from '../lib/auth.js'
import { badRequest, forbidden, notFound, objectId, parse } from '../lib/http.js'
import { logActivity, notify } from '../lib/notify.js'
import { PROJECT_POPULATE, containsRe, countByProject, escapeRegex, projectDto, userRef } from '../lib/serialize.js'
import {
  MAX_STUDENTS, MAX_TEACHERS, Project, TEACHER_ROLES, TEACHER_ROLE_TH, advisorOf, classLevelOf, currentTerm,
  findMember, memberUserId, recomputeStatus, students, teachers, type ProjectDoc,
} from '../models/Project.js'
import { ProjectRequest } from '../models/Request.js'
import { Submission } from '../models/Submission.js'
import { User } from '../models/User.js'
import { Activity, Code, ProjectFile, ProjectType } from '../models/misc.js'

export const projectsRouter = Router()
projectsRouter.use(requireAuth)

const nameTh = z.string().trim().min(1, 'กรุณากรอกชื่อโครงงาน (ภาษาไทย)').max(200)
const nameEn = z.string().trim().min(1, 'กรุณากรอกชื่อโครงงาน (ภาษาอังกฤษ)').max(200)
export const exactRe = (s: string) => new RegExp(`^${escapeRegex(s.trim())}$`, 'i')

async function assertNamesFree(th: string, en: string, exceptId?: unknown) {
  const clash = await Project.exists({
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    $or: [{ nameTh: exactRe(th) }, { nameEn: exactRe(en) }],
  })
  if (clash) throw badRequest('ชื่อโครงงาน (ภาษาไทย) หรือ (ภาษาอังกฤษ) ซ้ำกับโครงงานอื่น')
}

async function assertTypeExists(typeId: string | null | undefined) {
  if (!typeId) return null
  const t = await ProjectType.findById(objectId(typeId))
  if (!t) throw badRequest('ไม่พบประเภทโครงงานนี้')
  return t._id
}

// นิสิตอยู่ได้ทีละ 1 โครงงาน
async function assertStudentFree(userId: unknown) {
  if (await Project.exists({ members: { $elemMatch: { user: userId, kind: 'student' } } })) {
    throw badRequest('นิสิตคนนี้มีโครงงานอยู่แล้ว')
  }
}

async function populated(p: ProjectDoc) {
  return p.populate(PROJECT_POPULATE)
}

// ผู้ที่ต้องอนุมัติคำขอของโครงงาน: อาจารย์ที่ปรึกษา (ถ้ายังไม่มีที่ปรึกษา แจ้งแอดมิน)
async function approversOf(p: ProjectDoc) {
  const adv = advisorOf(p)
  if (adv) return [memberUserId(adv)]
  return (await User.find({ role: 'admin' }).select('_id')).map((u) => String(u._id))
}

const studentIds = (p: ProjectDoc) => students(p).map(memberUserId)
const teacherIds = (p: ProjectDoc) => teachers(p).map(memberUserId)

// ===================== รายการ / ค้นหา / คลังโครงงาน =====================
projectsRouter.get('/', async (req, res) => {
  const user = me(req)
  const q = parse(
    z.object({
      scope: z.enum(['library', 'search', 'mine', 'all']).default('search'),
      q: z.string().optional(),
      type: z.string().optional(),
      status: z.enum(['passed', 'partial', 'pending', 'failed']).optional(),
      term: z.string().optional(),
      classLevel: z.coerce.number().int().optional(),
    }),
    req.query,
  )
  const and: Record<string, unknown>[] = []
  if (q.scope === 'library') and.push({ status: 'passed' })
  else if (q.scope === 'mine') and.push({ 'members.user': user._id })
  else if (q.scope === 'all') {
    if (user.role !== 'admin') throw forbidden()
  } else if (user.role !== 'admin') and.push({ $or: [{ status: 'passed' }, { 'members.user': user._id }] })

  if (q.q?.trim()) {
    const re = containsRe(q.q)
    const people = await User.find({ name: re }).select('_id')
    and.push({ $or: [{ nameTh: re }, { nameEn: re }, { 'members.user': { $in: people.map((u) => u._id) } }] })
  }
  if (q.type === 'none') and.push({ type: null })
  else if (q.type) and.push({ type: objectId(q.type) })
  if (q.status === 'passed') and.push({ status: 'passed' })
  if (q.status === 'failed') and.push({ status: 'failed' })
  if (q.status === 'partial') and.push({ status: 'pending', passCount: { $gt: 0 } })
  if (q.status === 'pending') and.push({ status: 'pending', passCount: 0 })
  if (q.term) and.push({ term: q.term })
  if (q.classLevel) and.push({ classLevel: q.classLevel })

  const list = await Project.find(and.length ? { $and: and } : {})
    .sort({ createdAt: -1 })
    .limit(q.scope === 'mine' ? 50 : 300)
    .populate(PROJECT_POPULATE)
  const ids = list.map((p) => p._id)
  const [files, codes] = await Promise.all([countByProject(ProjectFile, ids), countByProject(Code, ids)])

  // หน้า "โครงงานของฉัน" ต้องการข้อมูลความคืบหน้าเพิ่ม
  let chapters = new Map<string, number>()
  let invites = new Map<string, number>()
  if (q.scope === 'mine') {
    const rows: { _id: unknown; n: number }[] = await Submission.aggregate([
      { $match: { project: { $in: ids } } },
      { $group: { _id: { p: '$project', c: '$chapter' } } },
      { $group: { _id: '$_id.p', n: { $sum: 1 } } },
    ])
    chapters = new Map(rows.map((r) => [String(r._id), r.n]))
    invites = await countByProject(ProjectRequest, ids, { type: 'teacher_invite', status: 'pending' })
  }

  res.json({
    projects: list.map((p) => ({
      ...projectDto(p, relation(p, user)),
      fileCount: files.get(p.id) ?? 0,
      codeCount: codes.get(p.id) ?? 0,
      chapterCount: chapters.get(p.id) ?? 0,
      pendingInvites: invites.get(p.id) ?? 0,
    })),
  })
})

// ===================== สร้างโครงงาน (นิสิต) =====================
projectsRouter.post('/', requireRole('student'), async (req, res) => {
  const user = me(req)
  const body = parse(z.object({ nameTh, nameEn, typeId: z.string().nullish() }), req.body)
  if (await Project.exists({ members: { $elemMatch: { user: user._id, kind: 'student' } } })) {
    throw badRequest('ไม่สามารถสร้างได้ เนื่องจากคุณมีโครงงานอยู่แล้ว')
  }
  await assertNamesFree(body.nameTh, body.nameEn)
  const p = await Project.create({
    nameTh: body.nameTh,
    nameEn: body.nameEn,
    type: await assertTypeExists(body.typeId),
    term: currentTerm(),
    classLevel: classLevelOf(user.studentId ?? ''),
    members: [{ user: user._id, kind: 'student', isOwner: true }],
    createdBy: user._id,
  })
  await logActivity(p._id, 'project.create', user._id, p.nameTh)
  res.status(201).json({ id: p.id })
})

// ===================== รายละเอียดโครงงาน =====================
projectsRouter.get('/:id', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(req.params.id, user, 'view')
  await populated(p)
  const [fileCount, codeCount] = await Promise.all([
    ProjectFile.countDocuments({ project: p._id }),
    Code.countDocuments({ project: p._id }),
  ])
  res.json({
    project: { ...projectDto(p, r), fileCount, codeCount },
    viewer: {
      isAdmin: r.isAdmin,
      isStudent: r.isStudent,
      isTeacher: r.isTeacher,
      isAdvisor: r.isAdvisor,
      isMember: r.isMember,
      canEdit: r.canEdit,
      myVote: r.isTeacher ? (r.member?.vote ?? null) : null,
    },
  })
})

// แก้ประเภท (นิสิตในโครงงาน/แอดมิน) และชื่อ (แอดมินเท่านั้น นิสิตต้องส่งคำขอ)
projectsRouter.patch('/:id', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(req.params.id, user, 'edit')
  const body = parse(z.object({ typeId: z.string().nullish(), nameTh: nameTh.optional(), nameEn: nameEn.optional() }), req.body)
  if (body.typeId !== undefined) {
    p.type = await assertTypeExists(body.typeId)
    await logActivity(p._id, 'project.type', user._id)
  }
  if (body.nameTh || body.nameEn) {
    if (!r.isAdmin) throw forbidden('นิสิตต้องส่งคำขอเปลี่ยนชื่อให้อาจารย์ที่ปรึกษาอนุมัติ')
    const th = body.nameTh ?? p.nameTh
    const en = body.nameEn ?? p.nameEn
    await assertNamesFree(th, en, p._id)
    await logActivity(p._id, 'project.rename', user._id, `${p.nameTh} → ${th}`)
    p.nameTh = th
    p.nameEn = en
  }
  await p.save()
  res.status(204).end()
})

// ส่งโครงงานใหม่หลังไม่ผ่าน: ย้ายไปภาคการศึกษาปัจจุบันและล้างผลพิจารณาของอาจารย์ทุกคน
projectsRouter.post('/:id/resubmit', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(req.params.id, user, 'edit')
  if (p.status !== 'failed') throw badRequest('ส่งใหม่ได้เฉพาะโครงงานที่ไม่ผ่าน')
  for (const m of teachers(p)) {
    m.vote = null
    m.votedAt = null
  }
  p.term = currentTerm()
  recomputeStatus(p)
  await p.save()
  await logActivity(p._id, 'project.resubmit', user._id, p.term)
  await notify(teacherIds(p), { icon: 'rotate-ccw', title: 'นิสิตส่งโครงงานใหม่เพื่อพิจารณา', detail: p.nameTh, link: `/projects/${p.id}` }, r.isAdmin ? undefined : user._id)
  res.status(204).end()
})

// ===================== ผลพิจารณาของอาจารย์ =====================
projectsRouter.post('/:id/vote', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(req.params.id, user, 'teacher')
  const { vote } = parse(z.object({ vote: z.enum(['pass', 'fail']) }), req.body)
  const m = r.member!
  if (m.vote) throw badRequest(m.vote === 'pass' ? 'คุณได้กดผ่านโครงงานนี้แล้ว' : 'คุณได้กดไม่ผ่านโครงงานนี้แล้ว')
  if (p.status === 'passed') throw badRequest('โครงงานนี้ผ่านครบแล้ว')
  if (p.status === 'failed') throw badRequest('โครงงานนี้ไม่ผ่านแล้ว รอนิสิตส่งโครงงานใหม่')
  m.vote = vote
  m.votedAt = new Date()
  const nowPassed = recomputeStatus(p) === 'passed'
  await p.save()
  await logActivity(p._id, 'teacher.vote', user._id, vote === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน')
  await notify(studentIds(p), {
    icon: vote === 'pass' ? 'circle-check' : 'circle-x',
    title: vote === 'pass' ? `${user.name} ให้ผ่านโครงงาน` : `${user.name} ให้โครงงานไม่ผ่าน`,
    detail: p.nameTh,
    link: `/projects/${p.id}`,
  })
  if (nowPassed) {
    await notify([...studentIds(p), ...teacherIds(p)], { icon: 'award', title: 'โครงงานผ่านครบ 3/3 แล้ว', detail: p.nameTh, link: `/projects/${p.id}` })
  }
  res.status(204).end()
})

// ===================== สมาชิก =====================
// เพิ่มคู่โปรเจค (มีผลทันที) นิสิตคนนั้นต้องยังไม่มีโครงงาน
projectsRouter.post('/:id/partner', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(req.params.id, user, 'edit')
  const { userId } = parse(z.object({ userId: z.string() }), req.body)
  if (students(p).length >= MAX_STUDENTS) throw badRequest('โครงงานมีนิสิตครบ 2 คนแล้ว')
  const partner = await User.findById(objectId(userId))
  if (!partner || partner.role !== 'student') throw badRequest('ต้องเลือกบัญชีนิสิต')
  if (findMember(p, partner._id)) throw badRequest('นิสิตคนนี้อยู่ในโครงงานแล้ว')
  await assertStudentFree(partner._id)
  p.members.push({ user: partner._id, kind: 'student' })
  await p.save()
  await logActivity(p._id, 'member.add', user._id, partner.name)
  await notify([partner._id], { icon: 'user-plus', title: `${user.name} เพิ่มคุณเป็นคู่โปรเจค`, detail: p.nameTh, link: `/projects/${p.id}` })
  res.status(204).end()
})

// เพิ่มอาจารย์: นิสิตส่งคำเชิญ (อาจารย์ต้องตอบรับ) / แอดมินเพิ่มได้ทันที
projectsRouter.post('/:id/teachers', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(req.params.id, user, 'edit')
  const body = parse(z.object({ userId: z.string(), role: z.enum(TEACHER_ROLES) }), req.body)
  const teacher = await User.findById(objectId(body.userId))
  if (!teacher || teacher.role !== 'teacher') throw badRequest('ต้องเลือกบัญชีอาจารย์')
  const pending = await ProjectRequest.find({ project: p._id, type: 'teacher_invite', status: 'pending' })
  assertCanAddTeacher(p, String(teacher._id), body.role, pending)

  if (r.isAdmin) {
    p.members.push({ user: teacher._id, kind: 'teacher', teacherRole: body.role })
    recomputeStatus(p)
    await p.save()
    await logActivity(p._id, 'teacher.join', user._id, `${teacher.name} (${TEACHER_ROLE_TH[body.role]})`)
    await notify([teacher._id], { icon: 'user-plus', title: `คุณถูกเพิ่มเป็น${TEACHER_ROLE_TH[body.role]}โครงงาน`, detail: p.nameTh, link: `/projects/${p.id}` })
  } else {
    await ProjectRequest.create({ project: p._id, type: 'teacher_invite', requestedBy: user._id, target: teacher._id, teacherRole: body.role })
    await notify([teacher._id], { icon: 'mail', title: `คำเชิญเป็นอาจารย์${TEACHER_ROLE_TH[body.role]}`, detail: `โครงงาน: ${p.nameTh}`, link: '/requests' })
  }
  res.status(204).end()
})

// ตรวจเงื่อนไขอาจารย์ (นับคำเชิญที่ยังรอตอบรับด้วย กันอาจารย์เกิน 3 คน/ที่ปรึกษาซ้ำ)
export function assertCanAddTeacher(p: ProjectDoc, teacherId: string, role: string, pendingInvites: { target?: unknown; teacherRole?: string | null; _id: unknown }[], exceptRequest?: unknown) {
  const others = pendingInvites.filter((x) => String(x._id) !== String(exceptRequest ?? ''))
  if (findMember(p, teacherId)) throw badRequest('อาจารย์ท่านนี้อยู่ในโครงงานแล้ว')
  if (others.some((x) => String(x.target) === teacherId)) throw badRequest('มีคำเชิญอาจารย์ท่านนี้รอตอบรับอยู่แล้ว')
  if (teachers(p).length + others.length >= MAX_TEACHERS) throw badRequest('อาจารย์ครบ 3 ท่านแล้ว (นับรวมคำเชิญที่รอตอบรับ)')
  if (role === 'advisor' && (advisorOf(p) || others.some((x) => x.teacherRole === 'advisor'))) {
    throw badRequest('อาจารย์ที่ปรึกษามีได้ท่านเดียว')
  }
}

projectsRouter.delete('/:id/teachers/:userId', async (req, res) => {
  const user = me(req)
  const { p, r } = await projectFor(req.params.id, user, 'edit')
  const m = findMember(p, req.params.userId)
  if (!m || m.kind !== 'teacher') throw notFound('ไม่พบอาจารย์ในโครงงาน')
  if (p.status === 'passed' && !r.isAdmin) throw badRequest('โครงงานผ่านแล้ว ลบอาจารย์ไม่ได้')
  p.members.pull(m)
  recomputeStatus(p)
  await p.save()
  const t = await User.findById(req.params.userId).select('name')
  await logActivity(p._id, 'teacher.remove', user._id, t?.name ?? '')
  await notify([req.params.userId], { icon: 'user-minus', title: 'คุณถูกนำออกจากโครงงาน', detail: p.nameTh, link: '/teacher/projects' })
  res.status(204).end()
})

// แอดมินนำนิสิตออกได้ทันที (นิสิตต้องส่งคำขอให้ที่ปรึกษาอนุมัติ)
projectsRouter.delete('/:id/students/:userId', requireRole('admin'), async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(req.params.id, user, 'edit')
  const userId = String(req.params.userId)
  const m = findMember(p, userId)
  if (!m || m.kind !== 'student') throw notFound('ไม่พบนิสิตในโครงงาน')
  if (students(p).length <= 1) throw badRequest('ต้องมีนิสิตในโครงงานอย่างน้อย 1 คน')
  removeStudent(p, userId)
  await p.save()
  await logActivity(p._id, 'member.remove', user._id, (await User.findById(req.params.userId).select('name'))?.name ?? '')
  res.status(204).end()
})

export function removeStudent(p: ProjectDoc, userId: string) {
  const m = findMember(p, userId)!
  const wasOwner = m.isOwner
  p.members.pull(m)
  if (wasOwner) {
    const next = students(p)[0]
    if (next) next.isOwner = true
  }
}

// ===================== คำขอที่ต้องให้ที่ปรึกษาอนุมัติ =====================
projectsRouter.post('/:id/requests/rename', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(req.params.id, user, 'student')
  const body = parse(z.object({ nameTh, nameEn }), req.body)
  if (body.nameTh === p.nameTh && body.nameEn === p.nameEn) throw badRequest('ชื่อใหม่เหมือนชื่อเดิม')
  if (await ProjectRequest.exists({ project: p._id, type: 'rename', status: 'pending' })) {
    throw badRequest('มีคำขอเปลี่ยนชื่อที่รออนุมัติอยู่แล้ว')
  }
  await assertNamesFree(body.nameTh, body.nameEn, p._id)
  await ProjectRequest.create({
    project: p._id, type: 'rename', requestedBy: user._id,
    nameTh: body.nameTh, nameEn: body.nameEn, oldNameTh: p.nameTh, oldNameEn: p.nameEn,
  })
  await notify(await approversOf(p), { icon: 'pencil-line', title: 'คำขอเปลี่ยนชื่อโครงงาน', detail: `ชื่อใหม่: ${body.nameTh}`, link: '/requests' })
  res.status(204).end()
})

projectsRouter.post('/:id/requests/member', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(req.params.id, user, 'student')
  const body = parse(z.object({ action: z.enum(['change', 'remove']), targetId: z.string(), newUserId: z.string().optional() }), req.body)
  const target = findMember(p, body.targetId)
  if (!target || target.kind !== 'student') throw badRequest('ไม่พบนิสิตคนนี้ในโครงงาน')
  if (body.targetId === String(user._id)) throw badRequest('ไม่สามารถทำรายการกับตัวเองได้')
  if (await ProjectRequest.exists({ project: p._id, type: { $in: ['member_change', 'member_remove'] }, target: target.user, status: 'pending' })) {
    throw badRequest('มีคำขอของนิสิตคนนี้รออนุมัติอยู่แล้ว')
  }
  let newMember = null
  if (body.action === 'change') {
    if (!body.newUserId) throw badRequest('กรุณาเลือกนิสิตคนใหม่')
    newMember = await User.findById(objectId(body.newUserId))
    if (!newMember || newMember.role !== 'student') throw badRequest('ต้องเลือกบัญชีนิสิต')
    if (findMember(p, newMember._id)) throw badRequest('นิสิตคนนี้อยู่ในโครงงานแล้ว')
    await assertStudentFree(newMember._id)
  }
  await ProjectRequest.create({
    project: p._id, type: body.action === 'change' ? 'member_change' : 'member_remove',
    requestedBy: user._id, target: target.user, newMember: newMember?._id ?? null,
  })
  await notify(await approversOf(p), {
    icon: 'users', title: body.action === 'change' ? 'คำขอเปลี่ยนคู่โปรเจค' : 'คำขอลบคู่โปรเจค', detail: p.nameTh, link: '/requests',
  })
  res.status(204).end()
})

projectsRouter.get('/:id/requests', async (req, res) => {
  const { p } = await projectFor(req.params.id, me(req), 'member')
  const list = await ProjectRequest.find({ project: p._id })
    .sort({ createdAt: -1 })
    .populate('requestedBy target newMember decidedBy', 'name studentId')
  res.json({ requests: list.map(requestDto) })
})

// นิสิตยกเลิกคำขอ/คำเชิญที่ยังรออยู่ได้
projectsRouter.delete('/:id/requests/:rid', async (req, res) => {
  const { p } = await projectFor(req.params.id, me(req), 'edit')
  const r = await ProjectRequest.findOne({ _id: objectId(req.params.rid), project: p._id, status: 'pending' })
  if (!r) throw notFound('ไม่พบคำขอที่รออยู่')
  r.status = 'cancelled'
  r.decidedBy = me(req)._id
  r.decidedAt = new Date()
  await r.save()
  res.status(204).end()
})

interface RequestLike {
  id?: string
  type: string
  status: string
  project: unknown
  requestedBy: unknown
  target?: unknown
  newMember?: unknown
  teacherRole?: string | null
  nameTh?: string | null
  nameEn?: string | null
  oldNameTh?: string | null
  oldNameEn?: string | null
  decidedBy?: unknown
  decidedAt?: Date | null
}

export function requestDto(r: RequestLike) {
  const proj = r.project as unknown as { _id?: unknown; nameTh?: string } | null
  return {
    id: String(r.id),
    type: r.type,
    status: r.status,
    project: proj && typeof proj === 'object' && 'nameTh' in proj ? { id: String(proj._id), nameTh: proj.nameTh } : { id: String(r.project) },
    requestedBy: userRef(r.requestedBy),
    target: userRef(r.target),
    newMember: userRef(r.newMember),
    teacherRole: r.teacherRole,
    nameTh: r.nameTh,
    nameEn: r.nameEn,
    oldNameTh: r.oldNameTh,
    oldNameEn: r.oldNameEn,
    decidedBy: userRef(r.decidedBy),
    decidedAt: r.decidedAt,
    createdAt: (r as unknown as { createdAt: Date }).createdAt,
  }
}

// ===================== ประวัติ =====================
projectsRouter.get('/:id/activity', async (req, res) => {
  const { p } = await projectFor(req.params.id, me(req), 'member')
  const list = await Activity.find({ project: p._id }).sort({ createdAt: -1 }).limit(200).populate('actor', 'name')
  res.json({
    activity: list.map((a) => ({ id: a.id, type: a.type, detail: a.detail, actor: userRef(a.actor), createdAt: a.createdAt })),
  })
})
