import fs from 'node:fs'
import mongoose from 'mongoose'
import { config } from './config.js'

let memoryServer: { stop: () => Promise<boolean> } | undefined

// เชื่อมต่อ MongoDB ตาม MONGODB_URI
// ถ้าไม่ได้ตั้งไว้ (เครื่องพัฒนา) จะเปิด mongod ของ mongodb-memory-server ที่เก็บข้อมูลถาวรใน server/data/db
export async function connectDb() {
  let uri = config.mongoUri
  if (!uri) {
    if (config.isProd) throw new Error('ต้องตั้ง MONGODB_URI ใน server/.env')
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    fs.mkdirSync(config.devDbDir, { recursive: true })
    const server = await MongoMemoryServer.create({
      instance: { dbPath: config.devDbDir, storageEngine: 'wiredTiger' },
    })
    memoryServer = server
    uri = server.getUri('csproject')
    console.log(`[db] ใช้ MongoDB ในเครื่อง (ข้อมูลอยู่ที่ ${config.devDbDir})`)
  }
  await mongoose.connect(uri)
}

export async function disconnectDb() {
  await mongoose.disconnect()
  await memoryServer?.stop()
}
