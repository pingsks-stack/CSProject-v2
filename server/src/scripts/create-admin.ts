// สร้างบัญชีผู้ดูแลระบบ (ใช้ตอนติดตั้งครั้งแรก หรือเมื่อลืมรหัสแอดมิน)
//   npm run create-admin
//   npm run create-admin -- --username admin --name "ผู้ดูแลระบบ" --email admin@up.ac.th [--password ...]
// ถ้าชื่อผู้ใช้นี้มีอยู่แล้ว จะตั้งเป็นแอดมินและเปลี่ยนรหัสผ่านให้ใหม่
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { connectDb, disconnectDb } from '../db.js'
import { hashPassword, tempPassword } from '../lib/password.js'
import { User } from '../models/User.js'

const { values } = parseArgs({
  options: { username: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } },
})

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = async (label: string, fallback?: string) => (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback || ''

const username = values.username ?? (await ask('ชื่อผู้ใช้', 'admin'))
const existing0 = { name: values.name, email: values.email }
await connectDb()
try {
  const existing = await User.findOne({ username })
  const name = existing0.name ?? (existing ? existing.name : await ask('ชื่อ-นามสกุล', 'ผู้ดูแลระบบ'))
  const email = (existing0.email ?? (existing ? existing.email : await ask('อีเมล'))).toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง')
  if (await User.exists({ email, ...(existing ? { _id: { $ne: existing._id } } : {}) })) throw new Error('อีเมลนี้มีผู้ใช้อื่นใช้แล้ว')
  const password = values.password ?? tempPassword()
  if (password.length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร')

  if (existing) {
    Object.assign(existing, { role: 'admin', name, email, passwordHash: await hashPassword(password), sessionVersion: (existing.sessionVersion ?? 0) + 1 })
    await existing.save()
    console.log(`\nตั้ง "${username}" เป็นผู้ดูแลระบบและเปลี่ยนรหัสผ่านแล้ว`)
  } else {
    await User.create({ username, name, email, role: 'admin', passwordHash: await hashPassword(password) })
    console.log(`\nสร้างบัญชีผู้ดูแลระบบ "${username}" แล้ว`)
  }
  if (!values.password) console.log(`รหัสผ่านชั่วคราว: ${password}  (เข้าสู่ระบบแล้วเปลี่ยนที่หน้า "เปลี่ยนรหัสผ่าน")`)
} catch (e) {
  console.error(`\nไม่สำเร็จ: ${e instanceof Error ? e.message : e}`)
  process.exitCode = 1
} finally {
  rl.close()
  await disconnectDb()
}
