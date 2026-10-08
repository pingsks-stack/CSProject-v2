// กู้คืนข้อมูลจากชุดสำรอง (แทนที่ข้อมูลปัจจุบันทั้งหมด!) ต้องหยุด server ก่อน
//   npm run restore -- backups/2026-10-08T02-00-00 --yes
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { config } from '../config.js'
import { connectDb, disconnectDb } from '../db.js'
// โหลด model ทุกตัว เพื่อสร้าง index คืนหลังกู้ข้อมูล
import '../models/Project.js'
import '../models/Request.js'
import '../models/Submission.js'
import '../models/User.js'
import '../models/misc.js'

const EJSON = mongoose.mongo.BSON.EJSON
const { values, positionals } = parseArgs({ allowPositionals: true, options: { yes: { type: 'boolean' } } })
// รับได้ทั้งพาธเต็ม พาธจากโฟลเดอร์โปรเจค หรือแค่ชื่อชุดในโฟลเดอร์ backups
const arg = positionals[0] ?? ''
const src = arg
  ? [path.resolve(arg), path.resolve(config.backupDir, '..', arg), path.resolve(config.backupDir, arg)].find((p) => fs.existsSync(path.join(p, 'manifest.json'))) ?? ''
  : ''

if (!src || !fs.existsSync(path.join(src, 'manifest.json'))) {
  console.error('ระบุโฟลเดอร์ชุดสำรอง เช่น npm run restore -- backups/2026-10-08T02-00-00 --yes')
  process.exit(1)
}
if (!values.yes) {
  console.error('การกู้คืนจะลบข้อมูลปัจจุบันทั้งหมดแล้วแทนด้วยชุดสำรอง ถ้าแน่ใจให้เพิ่ม --yes')
  process.exit(1)
}

await connectDb()
try {
  const db = mongoose.connection.db!
  for (const file of fs.readdirSync(path.join(src, 'db')).filter((f) => f.endsWith('.jsonl'))) {
    const name = file.replace(/\.jsonl$/, '')
    await db.collection(name).deleteMany({})
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(src, 'db', file)), crlfDelay: Infinity })
    let batch: mongoose.mongo.Document[] = []
    let n = 0
    for await (const line of rl) {
      if (!line.trim()) continue
      batch.push(EJSON.parse(line, { relaxed: false }) as mongoose.mongo.Document)
      if (batch.length === 500) {
        await db.collection(name).insertMany(batch)
        n += batch.length
        batch = []
      }
    }
    if (batch.length) {
      await db.collection(name).insertMany(batch)
      n += batch.length
    }
    console.log(`  ${name}: ${n}`)
  }
  // สร้าง index ตาม model อีกครั้ง
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()))
  if (fs.existsSync(path.join(src, 'uploads'))) {
    fs.rmSync(config.uploadDir, { recursive: true, force: true })
    fs.cpSync(path.join(src, 'uploads'), config.uploadDir, { recursive: true })
  }
  console.log(`กู้คืนจาก ${src} แล้ว`)
} catch (e) {
  console.error('กู้คืนไม่สำเร็จ:', e)
  process.exitCode = 1
} finally {
  await disconnectDb()
}
