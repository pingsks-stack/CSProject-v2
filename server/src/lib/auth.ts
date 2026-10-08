import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { User, type Role, type UserDoc } from '../models/User.js'
import { HttpError, forbidden } from './http.js'

const COOKIE = 'sid'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDoc
    }
  }
}

// ล็อกอินสำเร็จ: เก็บ token ในคุกกี้ httpOnly (JavaScript ในหน้าเว็บอ่านไม่ได้)
export function setSession(res: Response, user: { id: string; sessionVersion?: number | null }) {
  const token = jwt.sign({ sub: user.id, v: user.sessionVersion ?? 0 }, config.jwtSecret, { expiresIn: Math.floor(MAX_AGE_MS / 1000) })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' })
}

// อ่านผู้ใช้จากคุกกี้ทุกคำขอ (ดึงจากฐานข้อมูลเพื่อให้บทบาท/ชื่อเป็นค่าล่าสุดเสมอ)
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE]
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub: string; v?: number }
      const user = await User.findById(payload.sub)
      req.user = user && (payload.v ?? 0) === (user.sessionVersion ?? 0) ? user : undefined
    } catch {
      req.user = undefined
    }
  }
  next()
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ')
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ')
    if (!roles.includes(req.user.role as Role)) throw forbidden()
    next()
  }
}

// โหมดเดโม: รหัสผ่านของบัญชีทดสอบคงที่ (Demo@1234) ไม่ให้ใครเปลี่ยนจนคนอื่นเข้าไม่ได้
export const DEMO_LOCKED = 'ระบบทดลอง (เดโม) ล็อกรหัสผ่านไว้ เพื่อให้ทุกคนเข้าด้วยบัญชีทดสอบได้ตลอด'
export function assertNotDemo() {
  if (config.demoMode) throw forbidden(DEMO_LOCKED)
}
export const isDemoAccount = (username: string) => config.demoMode && username.startsWith('demo_')

// เปลี่ยนรหัสผ่านแล้ว: token ล็อกอินเดิมทุกเครื่องใช้ไม่ได้
export function revokeSessions(user: UserDoc) {
  user.sessionVersion = (user.sessionVersion ?? 0) + 1
}

// ใช้ใน handler ที่ผ่าน requireAuth แล้ว
export function me(req: Request): UserDoc {
  if (!req.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ')
  return req.user
}
