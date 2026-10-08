import express from 'express'
import { createApp } from './app.js'
import { config } from './config.js'
import { connectDb, disconnectDb } from './db.js'
import { startReminderSchedule } from './lib/reminders.js'
import { User } from './models/User.js'
import { seedDemo } from './seed.js'

// เปิดพอร์ตก่อน แล้วค่อยเชื่อมฐานข้อมูล คำขอที่เข้ามาระหว่างนี้จะรอจนพร้อม
// (เดโมบน Cloudflare Containers ต้องเปิดพอร์ตให้ทันภายในเวลาที่กำหนด แม้ฐานข้อมูลยังเตรียมไม่เสร็จ)
const ready = (async () => {
  await connectDb()
  // ฐานข้อมูลว่าง (รันครั้งแรก / เดโมเริ่มใหม่) ใส่ข้อมูลตัวอย่างให้ล็อกอินทดลองได้ทันที
  if ((!config.isProd || config.demoMode) && (await User.estimatedDocumentCount()) === 0) {
    await seedDemo()
  }
})()

const root = express()
root.disable('x-powered-by')
root.use((_req, res, next) => {
  ready.then(() => next(), () => res.status(503).json({ error: 'ระบบยังไม่พร้อม กรุณาลองใหม่อีกครั้ง' }))
})
root.use(createApp())

const server = root.listen(config.port)

ready
  .then(() => {
    console.log(`[server] พร้อมใช้งานที่ http://localhost:${config.port}${config.demoMode ? ' (โหมดเดโม)' : ''}`)
    startReminderSchedule()
  })
  .catch((e) => {
    console.error('[server] เชื่อมต่อฐานข้อมูลไม่สำเร็จ', e)
    process.exit(1)
  })

async function shutdown() {
  server.close()
  await disconnectDb()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
