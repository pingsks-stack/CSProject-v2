import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { me, requireAuth, requireRole } from '../lib/auth.js'
import { badRequest, forbidden, objectId, parse } from '../lib/http.js'
import { Project } from '../models/Project.js'
import { User, type UserDoc } from '../models/User.js'
import { Message, Notification } from '../models/misc.js'

// แชทระหว่างนิสิตกับอาจารย์ (แทน ChatApi.ashx)
export const chatRouter = Router()
chatRouter.use(requireAuth, requireRole('student', 'teacher'))

// คู่สนทนาเก็บเป็น (student, teacher) เสมอ ไม่ว่าใครเป็นผู้ส่ง
const pairOf = (user: UserDoc, other: UserDoc) =>
  user.role === 'student' ? { student: user._id, teacher: other._id } : { student: other._id, teacher: user._id }
const myField = (user: UserDoc) => (user.role === 'student' ? 'student' : 'teacher')
const otherField = (user: UserDoc) => (user.role === 'student' ? 'teacher' : 'student')

// นิสิตของอาจารย์คนนี้ (นิสิตในโครงงานที่อาจารย์ดูแล)
async function studentsOfTeacher(teacherId: Types.ObjectId) {
  const projects = await Project.find({ 'members.user': teacherId }).select('members')
  return new Set(projects.flatMap((p) => p.members.filter((m) => m.kind === 'student').map((m) => String(m.user))))
}
async function teachersOfStudent(studentId: Types.ObjectId) {
  const projects = await Project.find({ 'members.user': studentId }).select('members')
  return new Set(projects.flatMap((p) => p.members.filter((m) => m.kind === 'teacher').map((m) => String(m.user))))
}

// นิสิตทักอาจารย์คนไหนก็ได้ / อาจารย์ทักได้เฉพาะนิสิตในโครงงานที่ดูแล หรือนิสิตที่เคยทักมาก่อน
async function partnerFor(user: UserDoc, otherId: string) {
  const other = await User.findById(objectId(otherId))
  const wanted = user.role === 'student' ? 'teacher' : 'student'
  if (!other || other.role !== wanted) throw badRequest('ไม่พบคู่สนทนา')
  if (user.role === 'teacher') {
    const mine = await studentsOfTeacher(user._id)
    if (!mine.has(String(other._id)) && !(await Message.exists(pairOf(user, other)))) throw forbidden()
  }
  return other
}

chatRouter.get('/conversations', async (req, res) => {
  const user = me(req)
  const mf = myField(user)
  const of = otherField(user)
  const rows: { _id: Types.ObjectId; last: { text: string; sender: Types.ObjectId; createdAt: Date }; unread: number }[] = await Message.aggregate([
    { $match: { [mf]: user._id } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: `$${of}`,
        last: { $first: { text: '$text', sender: '$sender', createdAt: '$createdAt' } },
        unread: { $sum: { $cond: [{ $and: [{ $ne: ['$sender', user._id] }, { $eq: ['$readAt', null] }] }, 1, 0] } },
      },
    },
    { $sort: { 'last.createdAt': -1 } },
  ])
  const people = await User.find({ _id: { $in: rows.map((r) => r._id) } }).select('name role')
  const names = new Map(people.map((u) => [String(u._id), u.name]))
  res.json({
    conversations: rows.map((r) => ({
      user: { id: String(r._id), name: names.get(String(r._id)) ?? '(ผู้ใช้ถูกลบ)' },
      lastText: r.last.text,
      lastMine: String(r.last.sender) === String(user._id),
      lastAt: r.last.createdAt,
      unread: r.unread,
    })),
  })
})

// รายชื่อที่เริ่มแชทได้ (related = อาจารย์/นิสิตในโครงงานเดียวกัน)
chatRouter.get('/contacts', async (req, res) => {
  const user = me(req)
  if (user.role === 'student') {
    const [teachers, related] = await Promise.all([User.find({ role: 'teacher' }).select('name').sort({ name: 1 }), teachersOfStudent(user._id)])
    const list = teachers.map((t) => ({ id: String(t._id), name: t.name, related: related.has(String(t._id)) }))
    list.sort((a, b) => Number(b.related) - Number(a.related))
    res.json({ contacts: list })
  } else {
    const ids = [...(await studentsOfTeacher(user._id))]
    const people = await User.find({ _id: { $in: ids } }).select('name studentId').sort({ name: 1 })
    res.json({ contacts: people.map((s) => ({ id: String(s._id), name: s.name, studentId: s.studentId, related: true })) })
  }
})

chatRouter.get('/thread/:userId', async (req, res) => {
  const user = me(req)
  const other = await partnerFor(user, String(req.params.userId))
  const { after } = parse(z.object({ after: z.string().optional() }), req.query)
  const filter: Record<string, unknown> = { ...pairOf(user, other) }
  if (after) filter.createdAt = { $gt: new Date(after) }
  const list = await Message.find(filter).sort({ createdAt: after ? 1 : -1 }).limit(300)
  if (!after) list.reverse()
  await Message.updateMany({ ...pairOf(user, other), sender: other._id, readAt: null }, { readAt: new Date() })
  res.json({
    partner: { id: other.id, name: other.name, role: other.role },
    messages: list.map((m) => ({ id: m.id, text: m.text, mine: String(m.sender) === String(user._id), createdAt: m.createdAt, read: !!m.readAt })),
  })
})

chatRouter.post('/thread/:userId', async (req, res) => {
  const user = me(req)
  const other = await partnerFor(user, String(req.params.userId))
  const { text } = parse(z.object({ text: z.string().trim().min(1, 'พิมพ์ข้อความก่อนส่ง').max(1000, 'ข้อความยาวเกิน 1000 ตัวอักษร') }), req.body)
  const m = await Message.create({ ...pairOf(user, other), sender: user._id, text })
  res.status(201).json({ id: m.id })
})

// ===================== การแจ้งเตือน =====================
export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', async (req, res) => {
  const user = me(req)
  const [items, unread, chatUnread] = await Promise.all([
    Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(20),
    Notification.countDocuments({ user: user._id, readAt: null }),
    user.role === 'admin' ? 0 : Message.countDocuments({ [myField(user)]: user._id, sender: { $ne: user._id }, readAt: null }),
  ])
  res.json({
    unread,
    chatUnread,
    items: items.map((n) => ({ id: n.id, icon: n.icon, title: n.title, detail: n.detail, link: n.link, read: !!n.readAt, createdAt: n.createdAt })),
  })
})

notificationsRouter.post('/read', async (req, res) => {
  const user = me(req)
  const { id } = parse(z.object({ id: z.string().optional() }), req.body ?? {})
  await Notification.updateMany({ user: user._id, readAt: null, ...(id ? { _id: objectId(id) } : {}) }, { readAt: new Date() })
  res.status(204).end()
})
