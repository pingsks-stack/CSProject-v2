import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { me, requireAuth, requireRole } from '../lib/auth.js'
import { badRequest, notFound, objectId, parse } from '../lib/http.js'
import { hashPassword } from '../lib/password.js'
import { containsRe, escapeRegex } from '../lib/serialize.js'
import { Project, currentTerm } from '../models/Project.js'
import { CHAPTERS, Submission } from '../models/Submission.js'
import { ROLES, User, publicUser } from '../models/User.js'
import { Deadline, ProjectType, getSettings, orderedTypes } from '../models/misc.js'
import { assertUnique, emailRule, mobileRule, nameRule, passwordRule, studentIdRule, usernameRule } from './auth.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('admin'))

// รหัสผ่านชั่วคราว 10 ตัว (ตัดตัวที่สับสนง่ายออก เช่น 0/O, 1/l/I)
export function tempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('')
}

// ===================== ผู้ใช้งาน =====================
adminRouter.get('/users', async (req, res) => {
  const q = parse(z.object({ role: z.enum(ROLES).optional(), q: z.string().optional() }), req.query)
  const filter: Record<string, unknown> = {}
  if (q.role) filter.role = q.role
  if (q.q?.trim()) {
    const re = containsRe(q.q)
    filter.$or = [{ name: re }, { username: re }, { email: re }, { studentId: re }]
  }
  const [users, counts, projectCounts] = await Promise.all([
    User.find(filter).sort({ role: -1, name: 1 }).limit(500),
    User.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Project.aggregate<{ _id: unknown; n: number }>([{ $unwind: '$members' }, { $group: { _id: '$members.user', n: { $sum: 1 } } }]),
  ])
  const pc = new Map(projectCounts.map((r) => [String(r._id), r.n]))
  res.json({
    users: users.map((u) => ({ ...publicUser(u), projects: pc.get(u.id) ?? 0 })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
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
