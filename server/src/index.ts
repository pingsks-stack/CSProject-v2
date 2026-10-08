import { createApp } from './app.js'
import { config } from './config.js'
import { connectDb, disconnectDb } from './db.js'
import { startReminderSchedule } from './lib/reminders.js'
import { User } from './models/User.js'
import { seedDemo } from './seed.js'

await connectDb()

// ฐานข้อมูลว่าง (รันครั้งแรก) ใส่ข้อมูลตัวอย่างให้ล็อกอินทดลองได้ทันที
if (!config.isProd && (await User.estimatedDocumentCount()) === 0) {
  await seedDemo()
}

const server = createApp().listen(config.port, () => {
  console.log(`[server] พร้อมใช้งานที่ http://localhost:${config.port}`)
})
startReminderSchedule()

async function shutdown() {
  server.close()
  await disconnectDb()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
