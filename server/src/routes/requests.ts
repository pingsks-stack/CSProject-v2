import { Router } from 'express'
import { z } from 'zod'
import { loadProject } from '../lib/access.js'
import { me, requireAuth } from '../lib/auth.js'
import { badRequest, forbidden, notFound, objectId, parse } from '../lib/http.js'
import { logActivity, notify } from '../lib/notify.js'
import { Project, TEACHER_ROLE_TH, advisorOf, findMember, memberUserId, recomputeStatus, students, type TeacherRole } from '../models/Project.js'
import { ProjectRequest } from '../models/Request.js'
import { User } from '../models/User.js'
import { assertCanAddTeacher, exactRe, removeStudent, requestDto } from './projects.js'

export const requestsRouter = Router()
requestsRouter.use(requireAuth)

const POPULATE = [
  { path: 'project', select: 'nameTh' },
  { path: 'requestedBy target newMember decidedBy', select: 'name studentId' },
]

// คำขอที่ผู้ใช้เกี่ยวข้อง
//   อาจารย์: คำเชิญถึงตัวเอง + คำขอเปลี่ยนชื่อ/สมาชิกของโครงงานที่ตนเป็นที่ปรึกษา
//   นิสิต: คำขอทั้งหมดของโครงงานตัวเอง   แอดมิน: ทุกคำขอ
requestsRouter.get('/', async (req, res) => {
  const user = me(req)
  const { status } = parse(z.object({ status: z.enum(['pending', 'done']).default('pending') }), req.query)
  const statusFilter: Record<string, unknown> = status === 'pending' ? { status: 'pending' } : { status: { $ne: 'pending' } }
  let scope: Record<string, unknown> = {}
  if (user.role === 'teacher') {
    const advised = await Project.find({ members: { $elemMatch: { user: user._id, teacherRole: 'advisor' } } }).select('_id')
    scope = {
      $or: [
        { type: 'teacher_invite', target: user._id },
        { type: { $ne: 'teacher_invite' }, project: { $in: advised.map((p) => p._id) } },
      ],
    }
  } else if (user.role === 'student') {
    const mine = await Project.find({ 'members.user': user._id }).select('_id')
    scope = { project: { $in: mine.map((p) => p._id) } }
  }
  const list = await ProjectRequest.find({ ...scope, ...statusFilter })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate(POPULATE)
  res.json({ requests: list.map(requestDto) })
})

// อนุมัติ/ปฏิเสธ (ตรวจเงื่อนไขซ้ำตอนอนุมัติ เพราะโครงงานอาจเปลี่ยนไปแล้วตั้งแต่ส่งคำขอ)
requestsRouter.post('/:id/decision', async (req, res) => {
  const user = me(req)
  const { approve } = parse(z.object({ approve: z.boolean() }), req.body)
  const r = await ProjectRequest.findById(objectId(req.params.id))
  if (!r) throw notFound('ไม่พบคำขอ')
  if (r.status !== 'pending') throw badRequest('คำขอนี้ได้รับการพิจารณาแล้ว')
  const p = await loadProject(r.project)

  const isAdmin = user.role === 'admin'
  if (r.type === 'teacher_invite') {
    if (!isAdmin && String(r.target) !== String(user._id)) throw forbidden()
  } else {
    const adv = advisorOf(p)
    if (!isAdmin && !(adv && memberUserId(adv) === String(user._id))) throw forbidden('เฉพาะอาจารย์ที่ปรึกษาของโครงงานเท่านั้น')
  }

  const studentsBefore = students(p).map(memberUserId)
  const notes: { users: string[]; title: string; icon: string }[] = []

  if (approve) {
    if (r.type === 'teacher_invite') {
      const pending = await ProjectRequest.find({ project: p._id, type: 'teacher_invite', status: 'pending' })
      assertCanAddTeacher(p, String(r.target), r.teacherRole!, pending, r._id)
      p.members.push({ user: r.target, kind: 'teacher', teacherRole: r.teacherRole })
      recomputeStatus(p)
      const t = await User.findById(r.target).select('name')
      await logActivity(p._id, 'teacher.join', r.target ?? null, `${t?.name ?? ''} (${TEACHER_ROLE_TH[r.teacherRole as TeacherRole]})`)
      notes.push({ users: studentsBefore, icon: 'user-check', title: `${t?.name ?? 'อาจารย์'} ตอบรับคำเชิญเป็น${TEACHER_ROLE_TH[r.teacherRole as TeacherRole]}แล้ว` })
    } else if (r.type === 'rename') {
      const clash = await Project.exists({ _id: { $ne: p._id }, $or: [{ nameTh: exactRe(r.nameTh!) }, { nameEn: exactRe(r.nameEn!) }] })
      if (clash) throw badRequest('ชื่อใหม่ซ้ำกับโครงงานอื่นแล้ว')
      await logActivity(p._id, 'project.rename', r.requestedBy, `${p.nameTh} → ${r.nameTh}`)
      p.nameTh = r.nameTh!
      p.nameEn = r.nameEn!
      notes.push({ users: studentsBefore, icon: 'pencil-line', title: 'อนุมัติการเปลี่ยนชื่อโครงงานแล้ว' })
    } else if (r.type === 'member_change') {
      const m = findMember(p, r.target)
      if (!m || m.kind !== 'student') throw badRequest('นิสิตคนเดิมไม่ได้อยู่ในโครงงานแล้ว')
      if (findMember(p, r.newMember)) throw badRequest('นิสิตคนใหม่อยู่ในโครงงานแล้ว')
      if (await Project.exists({ _id: { $ne: p._id }, members: { $elemMatch: { user: r.newMember, kind: 'student' } } })) {
        throw badRequest('นิสิตคนใหม่มีโครงงานอื่นอยู่แล้ว')
      }
      m.user = r.newMember!
      m.addedAt = new Date()
      const [oldU, newU] = await Promise.all([User.findById(r.target).select('name'), User.findById(r.newMember).select('name')])
      await logActivity(p._id, 'member.change', user._id, `${oldU?.name ?? ''} → ${newU?.name ?? ''}`)
      notes.push({ users: [...studentsBefore, String(r.newMember)], icon: 'users', title: 'อนุมัติการเปลี่ยนคู่โปรเจคแล้ว' })
    } else {
      const m = findMember(p, r.target)
      if (!m || m.kind !== 'student') throw badRequest('นิสิตคนนี้ไม่ได้อยู่ในโครงงานแล้ว')
      if (students(p).length <= 1) throw badRequest('ต้องมีนิสิตในโครงงานอย่างน้อย 1 คน')
      removeStudent(p, String(r.target))
      const oldU = await User.findById(r.target).select('name')
      await logActivity(p._id, 'member.remove', user._id, oldU?.name ?? '')
      notes.push({ users: studentsBefore, icon: 'user-minus', title: 'อนุมัติการลบคู่โปรเจคแล้ว' })
    }
    await p.save()
  } else {
    const label = { teacher_invite: 'คำเชิญอาจารย์', rename: 'คำขอเปลี่ยนชื่อโครงงาน', member_change: 'คำขอเปลี่ยนคู่โปรเจค', member_remove: 'คำขอลบคู่โปรเจค' }[r.type]
    const title = r.type === 'teacher_invite' ? `${user.name} ปฏิเสธคำเชิญ` : `${label}ถูกปฏิเสธ`
    notes.push({ users: studentsBefore, icon: 'circle-x', title })
  }

  r.status = approve ? 'approved' : 'rejected'
  r.decidedBy = user._id
  r.decidedAt = new Date()
  await r.save()
  for (const n of notes) await notify(n.users, { icon: n.icon, title: n.title, detail: p.nameTh, link: `/projects/${p.id}` }, user._id)
  res.status(204).end()
})
