import crypto from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2 = promisify(crypto.pbkdf2)

// PBKDF2-SHA256 + salt รูปแบบเดียวกับระบบเดิม: pbkdf2$<รอบ>$<salt base64>$<hash base64>
// จึงนำ hash จากฐานข้อมูลเดิมมาใช้ต่อได้ทันที
const PREFIX = 'pbkdf2$'
const ITERATIONS = 100_000

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const hash = await pbkdf2(password, salt, ITERATIONS, 32, 'sha256')
  return `${PREFIX}${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`
}

// รหัสผ่านชั่วคราว 10 ตัว (ตัดตัวที่สับสนง่ายออก เช่น 0/O, 1/l/I)
export function tempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('')
}

export async function verifyPassword(password: string, stored: string | undefined | null) {
  if (!stored || !stored.startsWith(PREFIX)) return false
  const [, rounds, salt, expected] = stored.split('$')
  const n = Number(rounds)
  if (!Number.isInteger(n) || !salt || !expected) return false
  const expectedBuf = Buffer.from(expected, 'base64')
  const actual = await pbkdf2(password, Buffer.from(salt, 'base64'), n, expectedBuf.length, 'sha256')
  return crypto.timingSafeEqual(actual, expectedBuf)
}
