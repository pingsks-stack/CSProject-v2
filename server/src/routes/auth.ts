import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { assertNotDemo, clearSession, me, requireAuth, revokeSessions, setSession } from '../lib/auth.js'
import { badRequest, HttpError, parse } from '../lib/http.js'
import { buildMail, mailEnabled, queueMail } from '../lib/mail.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { Project } from '../models/Project.js'
import { Message, PasswordReset } from '../models/misc.js'
import { User, publicUser } from '../models/User.js'

export const authRouter = Router()

// กันเดารหัสผ่าน: ผิดเกิน 10 ครั้งใน 15 นาทีต่อ IP+ชื่อผู้ใช้ ให้รอ
const attempts = new Map<string, { count: number; until: number }>()
function tooMany(key: string) {
  const a = attempts.get(key)
  return !!a && a.count >= 10 && a.until > Date.now()
}
function fail(key: string) {
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k)
  }
  const a = attempts.get(key)
  const fresh = !a || a.until < Date.now()
  attempts.set(key, { count: fresh ? 1 : a.count + 1, until: Date.now() + 15 * 60 * 1000 })
}

export const passwordRule = z.string().min(6, 'รหัสผ่านต้องยาว 6–50 ตัวอักษร').max(50, 'รหัสผ่านต้องยาว 6–50 ตัวอักษร')
export const mobileRule = z.string().trim().regex(/^0\d{9}$/, 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0')
export const studentIdRule = z.string().trim().regex(/^\d{8}$/, 'รหัสนิสิตต้องเป็นตัวเลข 8 หลัก')
export const emailRule = z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง').max(100)
export const nameRule = z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล').max(100)
export const usernameRule = z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้').max(50).regex(/^\S+$/, 'ชื่อผู้ใช้ต้องไม่มีช่องว่าง')

authRouter.post('/login', async (req, res) => {
  const body = parse(z.object({ username: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'), password: z.string().min(1, 'กรุณากรอกรหัสผ่าน') }), req.body)
  const key = `${req.ip}|${body.username.toLowerCase()}`
  if (tooMany(key)) throw new HttpError(429, 'ลองเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาที')
  const user = await User.findOne({ username: body.username }).select('+passwordHash')
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    fail(key)
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
  }
  attempts.delete(key)
  setSession(res, user)
  res.json({ user: publicUser(user) })
})

authRouter.post('/logout', (_req, res) => {
  clearSession(res)
  res.status(204).end()
})

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null })
})

// นิสิตสมัครสมาชิกเอง (บัญชีอาจารย์/แอดมินสร้างโดยแอดมิน)
authRouter.post('/register', async (req, res) => {
  const body = parse(
    z.object({
      username: usernameRule,
      password: passwordRule,
      name: nameRule,
      email: emailRule,
      studentId: studentIdRule,
      mobile: mobileRule,
    }),
    req.body,
  )
  await assertUnique(body)
  const user = await User.create({ ...body, passwordHash: await hashPassword(body.password), role: 'student' })
  setSession(res, user)
  res.status(201).json({ user: publicUser(user) })
})

// ตรวจข้อมูลซ้ำทีละช่องเพื่อบอกผู้ใช้ได้ชัดว่าช่องไหนซ้ำ
export async function assertUnique(
  v: { username?: string; email?: string; studentId?: string; mobile?: string },
  exceptId?: unknown,
) {
  const not = exceptId ? { _id: { $ne: exceptId } } : {}
  const checks: [keyof typeof v, string][] = [
    ['username', 'ชื่อผู้ใช้งานนี้ถูกใช้งานแล้ว'],
    ['email', 'อีเมลนี้ถูกใช้งานแล้ว'],
    ['studentId', 'รหัสนิสิตนี้ถูกใช้งานแล้ว'],
    ['mobile', 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว'],
  ]
  for (const [field, msg] of checks) {
    const value = v[field]
    if (value && (await User.exists({ [field]: value, ...not }))) throw badRequest(msg)
  }
}

authRouter.get('/profile', requireAuth, async (req, res) => {
  const user = me(req)
  const [projects, messages] = await Promise.all([
    Project.countDocuments({ 'members.user': user._id }),
    Message.countDocuments({ sender: user._id }),
  ])
  res.json({ user: publicUser(user), stats: { projects, messages } })
})

authRouter.put('/profile', requireAuth, async (req, res) => {
  const user = me(req)
  const body = parse(z.object({ name: nameRule, mobile: z.union([mobileRule, z.literal('')]), emailNotifications: z.boolean().optional() }), req.body)
  if (body.mobile) await assertUnique({ mobile: body.mobile }, user._id)
  user.name = body.name
  user.mobile = body.mobile
  if (body.emailNotifications !== undefined) user.emailNotifications = body.emailNotifications
  await user.save()
  res.json({ user: publicUser(user) })
})

authRouter.post('/password', requireAuth, async (req, res) => {
  assertNotDemo()
  const body = parse(z.object({ current: z.string(), password: passwordRule }), req.body)
  const user = await User.findById(me(req)._id).select('+passwordHash')
  if (!user || !(await verifyPassword(body.current, user.passwordHash))) throw badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง')
  user.passwordHash = await hashPassword(body.password)
  revokeSessions(user)
  await user.save()
  // เครื่องอื่นที่ล็อกอินค้างไว้จะหลุด แต่เครื่องนี้ได้ token ใหม่ใช้งานต่อได้
  setSession(res, user)
  res.status(204).end()
})

// ===================== ลืมรหัสผ่าน: ส่งลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล =====================
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

authRouter.post('/forgot', async (req, res) => {
  assertNotDemo()
  const { login } = parse(z.object({ login: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้หรืออีเมล').max(100) }), req.body)
  const key = `forgot|${req.ip}`
  if (tooMany(key)) throw new HttpError(429, 'ขอบ่อยเกินไป กรุณารอ 15 นาที')
  fail(key)
  if (!mailEnabled()) throw badRequest('ระบบยังไม่ได้ตั้งค่าการส่งอีเมล กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน')
  const user = await User.findOne({ $or: [{ username: login }, { email: login.toLowerCase() }] })
  // ตอบเหมือนกันทุกกรณี ไม่บอกว่ามีบัญชีนี้หรือไม่
  if (user?.email) {
    await PasswordReset.deleteMany({ user: user._id })
    const token = crypto.randomBytes(32).toString('base64url')
    await PasswordReset.create({ user: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
    const base = config.appUrl || `${req.protocol}://${req.get('host')}`
    queueMail(buildMail(user.email, {
      subject: 'ตั้งรหัสผ่านใหม่ · CS Project',
      lines: [
        `สวัสดี ${user.name}`,
        `มีคำขอตั้งรหัสผ่านใหม่ของบัญชี "${user.username}" กดปุ่มด้านล่างภายใน 1 ชั่วโมง`,
        'ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
      ],
      link: `${base}/reset-password?token=${token}`,
      linkLabel: 'ตั้งรหัสผ่านใหม่',
    }))
  }
  res.status(204).end()
})

authRouter.post('/reset', async (req, res) => {
  assertNotDemo()
  const body = parse(z.object({ token: z.string().min(20).max(200), password: passwordRule }), req.body)
  const r = await PasswordReset.findOne({ tokenHash: sha256(body.token), expiresAt: { $gt: new Date() } })
  const user = r ? await User.findById(r.user).select('+passwordHash') : null
  if (!r || !user) throw badRequest('ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่')
  user.passwordHash = await hashPassword(body.password)
  revokeSessions(user)
  await user.save()
  await PasswordReset.deleteMany({ user: user._id })
  res.status(204).end()
})
