import fs from 'node:fs'
import mongoose from 'mongoose'
import { config } from './config.js'

let memoryServer: { stop: () => Promise<boolean> } | undefined

// เชื่อมต่อ MongoDB ตาม MONGODB_URI
// ถ้าไม่ได้ตั้งไว้ จะเปิด mongod ของ mongodb-memory-server เอง
//   เครื่องพัฒนา: เก็บข้อมูลถาวรใน server/data/db
//   โหมดเดโม: เก็บในโฟลเดอร์ชั่วคราว (หายเมื่อเริ่มใหม่) และจำกัดหน่วยความจำให้พอกับ container ขนาดเล็ก
export async function connectDb() {
  let uri = config.mongoUri
  if (!uri) {
    if (config.isProd && !config.demoMode) throw new Error('ต้องตั้ง MONGODB_URI ใน server/.env')
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    let server
    if (config.demoMode) {
      server = await MongoMemoryServer.create({ instance: { storageEngine: 'wiredTiger', args: ['--wiredTigerCacheSizeGB', '0.25'] } })
      console.log('[db] โหมดเดโม: ใช้ MongoDB ชั่วคราวใน container')
    } else {
      fs.mkdirSync(config.devDbDir, { recursive: true })
      server = await MongoMemoryServer.create({ instance: { dbPath: config.devDbDir, storageEngine: 'wiredTiger' } })
      console.log(`[db] ใช้ MongoDB ในเครื่อง (ข้อมูลอยู่ที่ ${config.devDbDir})`)
    }
    memoryServer = server
    uri = server.getUri('csproject')
  }
  await mongoose.connect(uri)
}

export async function disconnectDb() {
  await mongoose.disconnect()
  await memoryServer?.stop()
}
