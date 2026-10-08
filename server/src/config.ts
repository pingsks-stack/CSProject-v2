import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// โฟลเดอร์ server/ (ใช้อ้างที่เก็บไฟล์อัปโหลดและข้อมูล MongoDB ตอนพัฒนา)
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isProd = process.env.NODE_ENV === 'production'

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me')) {
  throw new Error('ต้องตั้ง JWT_SECRET ใน server/.env ก่อนรันบนเซิร์ฟเวอร์จริง')
}

export const config = {
  isProd,
  // คุกกี้ล็อกอินส่งเฉพาะ HTTPS (ค่าเริ่มต้นเปิดในโหมด production) ตั้ง COOKIE_SECURE=false ถ้าเปิดใช้ผ่าน HTTP ภายใน
  secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI?.trim() || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR ?? 'uploads'),
  devDbDir: path.resolve(serverRoot, 'data', 'db'),
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
  maxUploadBytes: 30 * 1024 * 1024,
  // ไม่บังคับ: token ของ GitHub (เพิ่มโควตาการเรียก API) และรหัสลับของ webhook (ให้ GitHub แจ้งทันทีที่ push)
  githubToken: process.env.GITHUB_TOKEN?.trim() || '',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim() || '',
}
