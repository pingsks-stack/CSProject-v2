// ชุดเครื่องมือทดสอบ API: MongoDB ในหน่วยความจำ + แอป Express จริงบนพอร์ตสุ่ม + ตัวเรียก HTTP ที่จำคุกกี้ได้
//
// config.ts อ่านค่า env ตอน import จึงต้องตั้ง process.env ให้เสร็จก่อน import โมดูลใดใน src/
// ไฟล์นี้จึง import แบบ static เฉพาะโมดูลของ Node แล้วค่อยโหลดแอปด้วย import() ใน startTestServer()
import { once } from 'node:events'
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import type { Mail } from '../src/lib/mail.js'

export const PASSWORD = 'Demo@1234'
export const WEBHOOK_SECRET = 'test-webhook-secret'
export const APP_URL = 'http://app.test'

// ไฟล์อัปโหลดและอีเมลทดสอบอยู่ในโฟลเดอร์ชั่วคราว ไม่แตะ server/uploads หรือ server/data
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csproject-test-'))

// ตั้งค่าเป็นสตริงว่างไว้ด้วย เพื่อไม่ให้ dotenv เอาค่าจาก server/.env ของเครื่องพัฒนามาใช้ (dotenv ไม่ทับค่าที่มีอยู่แล้ว)
Object.assign(process.env, {
  NODE_ENV: 'test',
  REMINDERS: 'off',
  JWT_SECRET: 'test-jwt-secret',
  UPLOAD_DIR: path.join(tmpRoot, 'uploads'),
  MONGODB_URI: '',
  SMTP_HOST: '',
  APP_URL,
  COOKIE_SECURE: 'false',
  GITHUB_TOKEN: '',
  GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
})

// กันไม่ให้ชุดทดสอบออกอินเทอร์เน็ต (เช่น GitHub API): fetch ไปที่อื่นนอกจากเครื่องตัวเองจะล้มทันทีและถูกจดไว้
const realFetch = globalThis.fetch.bind(globalThis)
export const externalFetches: string[] = []
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    externalFetches.push(url)
    throw new TypeError(`network access is disabled in tests: ${url}`)
  }
  return realFetch(input, init)
}) as typeof fetch

// ค่าที่ API ตอบกลับเป็น JSON อิสระ ให้ชุดทดสอบเข้าถึงฟิลด์ได้สะดวก
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any

export interface JsonResponse {
  status: number
  data: Json
  headers: Headers
}

export interface RawResponse {
  status: number
  headers: Headers
  body: Buffer
  text: string
}

type Body = FormData | string | Record<string, unknown> | unknown[]

// ตัวเรียก API ที่จำคุกกี้ (session) ไว้เหมือนเบราว์เซอร์
export class Client {
  private cookies = new Map<string, string>()

  constructor(readonly base: string) {}

  async fetch(method: string, url: string, body?: Body, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers }
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    let payload: FormData | string | undefined
    if (body instanceof FormData || typeof body === 'string') payload = body
    else if (body !== undefined) {
      payload = JSON.stringify(body)
      h['content-type'] ??= 'application/json'
    }
    const res = await realFetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' })
    for (const c of res.headers.getSetCookie()) this.storeCookie(c)
    return res
  }

  private storeCookie(setCookie: string) {
    const [pair, ...attrs] = setCookie.split(';')
    const i = pair.indexOf('=')
    if (i < 1) return
    const name = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()
    const expired = attrs.some((a) => {
      const [k, v = ''] = a.trim().split('=')
      if (k.toLowerCase() === 'max-age') return Number(v) <= 0
      if (k.toLowerCase() === 'expires') return Date.parse(v) <= Date.now()
      return false
    })
    if (!value || expired) this.cookies.delete(name)
    else this.cookies.set(name, value)
  }

  async call(method: string, url: string, body?: Body, headers?: Record<string, string>): Promise<JsonResponse> {
    const res = await this.fetch(method, url, body, headers)
    const text = await res.text()
    let data: Json = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { status: res.status, data, headers: res.headers }
  }

  // คำตอบแบบไบต์ดิบ (ไฟล์ CSV/PDF/รูป) ไว้ตรวจ BOM, header และเนื้อไฟล์
  async raw(method: string, url: string, body?: Body, headers?: Record<string, string>): Promise<RawResponse> {
    const res = await this.fetch(method, url, body, headers)
    const buf = Buffer.from(await res.arrayBuffer())
    return { status: res.status, headers: res.headers, body: buf, text: buf.toString('utf8') }
  }

  get(url: string) {
    return this.call('GET', url)
  }
  post(url: string, body?: Body) {
    return this.call('POST', url, body)
  }
  put(url: string, body?: Body) {
    return this.call('PUT', url, body)
  }
  patch(url: string, body?: Body) {
    return this.call('PATCH', url, body)
  }
  del(url: string) {
    return this.call('DELETE', url)
  }

  async login(username: string, password = PASSWORD) {
    const r = await this.post('/auth/login', { username, password })
    if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(r.data)}`)
    return r
  }
}

// id ของข้อมูลตัวอย่างจาก seedDemo() (ได้ใหม่ทุกครั้งที่ reset)
export interface Seed {
  // กำลังทำ: demo_student (เจ้าของ) + demo_student2, ที่ปรึกษา demo_teacher (ให้ผ่านแล้ว), กรรมการ demo_teacher2
  // มีคำเชิญ demo_teacher3 เป็นกรรมการ และคำขอเปลี่ยนชื่อรออนุมัติ
  p1: string
  // ผ่านแล้ว: demo_student3 + demo_student4, ที่ปรึกษา demo_teacher2, กรรมการ demo_teacher + demo_teacher3 (มีไฟล์ PDF และภาพปก)
  p2: string
  // ผ่านแล้ว: demo_student5, ที่ปรึกษา demo_teacher3
  p3: string
  // ไม่ผ่าน: demo_student6, ที่ปรึกษา demo_teacher3 (ให้ไม่ผ่าน), กรรมการ demo_teacher
  p4: string
  users: Record<string, string>
  types: Record<string, string>
  term: string
  lastTerm: string
}

type Config = typeof import('../src/config.js').config

export interface TestContext {
  base: string
  config: Config
  mailbox: Mail[]
  externalFetches: string[]
  client(): Client
  login(username: string, password?: string): Promise<Client>
  // ล้างฐานข้อมูลและไฟล์อัปโหลด แล้วใส่ข้อมูลตัวอย่างใหม่
  reset(): Promise<Seed>
  storedFiles(kind: 'submissions' | 'files' | 'images', projectId: string): string[]
  stop(): Promise<void>
}

export async function startTestServer(): Promise<TestContext> {
  const { MongoMemoryServer } = await import('mongodb-memory-server')
  const { default: mongoose } = await import('mongoose')
  // ไม่ระบุ dbPath = ข้อมูลอยู่ในโฟลเดอร์ชั่วคราวที่ถูกลบเมื่อ stop()
  const mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri('csproject-test'))

  const { config } = await import('../src/config.js')
  if (!config.uploadDir.startsWith(tmpRoot)) throw new Error(`UPLOAD_DIR is not the temp dir: ${config.uploadDir}`)
  // อีเมลในโหมดพัฒนาถูกบันทึกเป็นไฟล์ด้วย ย้ายไปไว้ในโฟลเดอร์ชั่วคราว
  config.devMailDir = path.join(tmpRoot, 'mail')

  const { createApp } = await import('../src/app.js')
  const { seedDemo } = await import('../src/seed.js')
  const { devMailbox } = await import('../src/lib/mail.js')
  const { Project, currentTerm } = await import('../src/models/Project.js')
  const { User } = await import('../src/models/User.js')
  const { ProjectType } = await import('../src/models/misc.js')
  // รอให้สร้าง index (unique) เสร็จก่อน ไม่งั้นการทดสอบข้อมูลซ้ำอาจไม่แน่นอน
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()))

  const server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`

  const client = () => new Client(base)

  return {
    base,
    config,
    mailbox: devMailbox,
    externalFetches,
    client,
    async login(username, password = PASSWORD) {
      const c = client()
      await c.login(username, password)
      return c
    },
    async reset() {
      await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
      fs.rmSync(config.uploadDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      devMailbox.length = 0
      const log = console.log
      console.log = () => {}
      try {
        await seedDemo()
      } finally {
        console.log = log
      }
      const [projects, users, types] = await Promise.all([
        Project.find().select('nameEn term'),
        User.find().select('username'),
        ProjectType.find().select('name'),
      ])
      const byName = (nameEn: string) => {
        const p = projects.find((x) => x.nameEn === nameEn)
        if (!p) throw new Error(`seed project not found: ${nameEn}`)
        return p
      }
      return {
        p1: byName('Elective Course Recommendation System using Machine Learning').id as string,
        p2: byName('Mobile Meeting Room Booking Application').id as string,
        p3: byName('Math Practice Game for Primary School Students').id as string,
        p4: byName('Air Quality Monitoring System with IoT').id as string,
        users: Object.fromEntries(users.map((u) => [u.username, u.id as string])),
        types: Object.fromEntries(types.map((t) => [t.name, t.id as string])),
        term: currentTerm(),
        lastTerm: byName('Mobile Meeting Room Booking Application').term,
      }
    },
    storedFiles(kind, projectId) {
      const dir = path.join(config.uploadDir, kind, projectId)
      return fs.existsSync(dir) ? fs.readdirSync(dir) : []
    },
    async stop() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await mongoose.disconnect()
      await mongod.stop()
      fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    },
  }
}

// รอจนเงื่อนไขเป็นจริง (เช่น ไฟล์ถูกลบจากดิสก์แบบ async หลังตอบคำขอแล้ว)
export async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const end = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > end) return false
    await new Promise((r) => setTimeout(r, 25))
  }
  return true
}

// PNG ที่ถูกต้องขนาดเล็ก (สีเดียว) ไว้ทดสอบอัปโหลดรูป
export function tinyPng(size = 4, rgb: [number, number, number] = [91, 44, 140]) {
  const row = Buffer.alloc(size * 3 + 1)
  for (let x = 0; x < size; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// FormData สำหรับอัปโหลด: files = [ชื่อฟิลด์, ชื่อไฟล์, เนื้อไฟล์, MIME]
export function form(fields: Record<string, string>, files: [field: string, name: string, content: string | Uint8Array, type?: string][] = []) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  for (const [field, name, content, type] of files) {
    const part = typeof content === 'string' ? content : new Uint8Array(content)
    fd.append(field, new Blob([part], { type: type ?? 'application/octet-stream' }), name)
  }
  return fd
}
