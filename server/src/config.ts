import crypto from 'node:crypto'
import path from 'node:path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// โฟลเดอร์ server/ (ใช้อ้างที่เก็บไฟล์อัปโหลดและข้อมูล MongoDB ตอนพัฒนา)
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// อ่าน server/.env เสมอ ไม่ว่าจะสั่งรันจากโฟลเดอร์ไหน
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true })

const isProd = process.env.NODE_ENV === 'production'
// โหมดเดโม (เช่นบน Cloudflare Containers): ใช้ MongoDB ในเครื่องที่ล้างทุกครั้งที่เริ่ม ใส่ข้อมูลตัวอย่างให้เอง
// และแสดงบัญชีทดสอบที่หน้าเข้าสู่ระบบ ห้ามใช้กับข้อมูลจริง
const demoMode = process.env.DEMO_MODE === 'true'

if (isProd && !demoMode && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me')) {
  throw new Error('ต้องตั้ง JWT_SECRET ใน server/.env ก่อนรันบนเซิร์ฟเวอร์จริง')
}

export const config = {
  isProd,
  demoMode,
  // คุกกี้ล็อกอินส่งเฉพาะ HTTPS (ค่าเริ่มต้นเปิดในโหมด production) ตั้ง COOKIE_SECURE=false ถ้าเปิดใช้ผ่าน HTTP ภายใน
  secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  port: Number(process.env.PORT ?? 4000),
  // reverse proxy ที่เชื่อถือได้ (ค่าเริ่มต้น: เครื่องเดียวกัน) เช่น 10.0.0.5 หรือ true
  trustProxy: process.env.TRUST_PROXY?.trim() || 'loopback',
  mongoUri: process.env.MONGODB_URI?.trim() || '',
  // เดโมไม่ได้ตั้ง JWT_SECRET = สุ่มใหม่ทุกครั้งที่เริ่ม (ข้อมูลก็ล้างใหม่อยู่แล้ว)
  jwtSecret: process.env.JWT_SECRET || (demoMode ? crypto.randomBytes(32).toString('hex') : 'dev-only-secret'),
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR ?? 'uploads'),
  devDbDir: path.resolve(serverRoot, 'data', 'db'),
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
  maxUploadBytes: 30 * 1024 * 1024,
  // ไม่บังคับ: token ของ GitHub (เพิ่มโควตาการเรียก API) และรหัสลับของ webhook (ให้ GitHub แจ้งทันทีที่ push)
  githubToken: process.env.GITHUB_TOKEN?.trim() || '',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim() || '',
  // ที่อยู่เว็บที่ผู้ใช้เปิด (ใช้ทำลิงก์ในอีเมล) เช่น https://csproject.up.ac.th
  appUrl: (process.env.APP_URL?.trim() || (isProd ? '' : 'http://localhost:5173')).replace(/\/+$/, ''),
  // ส่งอีเมลผ่าน SMTP (ไม่ตั้ง SMTP_HOST = เครื่องพัฒนาเก็บอีเมลเป็นไฟล์ใน server/data/mail, เซิร์ฟเวอร์จริงไม่ส่งอีเมล)
  smtp: {
    host: process.env.SMTP_HOST?.trim() || '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM?.trim() || 'CS Project <no-reply@localhost>',
  },
  devMailDir: path.resolve(serverRoot, 'data', 'mail'),
  backupDir: path.resolve(serverRoot, '..', process.env.BACKUP_DIR ?? 'backups'),
  backupKeep: Number(process.env.BACKUP_KEEP ?? 14),
  // เตือนกำหนดส่งอัตโนมัติ (ปิดได้ด้วย REMINDERS=off)
  reminders: process.env.REMINDERS !== 'off',
}
