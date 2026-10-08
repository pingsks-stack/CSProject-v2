// สำรองข้อมูลทั้งหมด: ฐานข้อมูล (ทุก collection เป็นไฟล์ EJSON) + ไฟล์ที่อัปโหลด
//   npm run backup                → backups/2026-10-08T02-00-00/
// เก็บไว้ล่าสุด BACKUP_KEEP ชุด (ค่าเริ่มต้น 14) ชุดที่เก่ากว่าจะถูกลบ
// ตั้งให้รันทุกคืนด้วย Task Scheduler (Windows) หรือ cron (Linux) ดู docs/INSTALL.md
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { config } from '../config.js'
import { connectDb, disconnectDb } from '../db.js'

const EJSON = mongoose.mongo.BSON.EJSON
const stampName = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
const dir = path.join(config.backupDir, stampName)

await connectDb()
try {
  const db = mongoose.connection.db!
  fs.mkdirSync(path.join(dir, 'db'), { recursive: true })
  const counts: Record<string, number> = {}
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (c.name.startsWith('system.')) continue
    const out = fs.createWriteStream(path.join(dir, 'db', `${c.name}.jsonl`))
    let n = 0
    for await (const doc of db.collection(c.name).find()) {
      out.write(EJSON.stringify(doc, { relaxed: false }) + '\n')
      n++
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    counts[c.name] = n
  }
  if (fs.existsSync(config.uploadDir)) fs.cpSync(config.uploadDir, path.join(dir, 'uploads'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ app: 'csproject', version: 2, createdAt: new Date(), collections: counts }, null, 2))
  console.log(`สำรองข้อมูลแล้ว: ${dir}`)
  console.log(Object.entries(counts).map(([k, v]) => `  ${k}: ${v}`).join('\n'))

  // ลบชุดเก่าเกินจำนวนที่เก็บ
  const sets = fs.readdirSync(config.backupDir).filter((d) => fs.existsSync(path.join(config.backupDir, d, 'manifest.json'))).sort()
  for (const old of sets.slice(0, Math.max(0, sets.length - config.backupKeep))) {
    fs.rmSync(path.join(config.backupDir, old), { recursive: true, force: true })
    console.log(`ลบชุดเก่า: ${old}`)
  }
} catch (e) {
  console.error('สำรองข้อมูลไม่สำเร็จ:', e)
  process.exitCode = 1
} finally {
  await disconnectDb()
}
