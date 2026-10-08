import { Container, getContainer } from '@cloudflare/containers'

interface Env {
  CSPROJECT_DEMO: DurableObjectNamespace<CSProjectDemo>
}

// container ที่รันระบบทั้งหมด (หน้าเว็บ + API + MongoDB ชั่วคราว) สร้างจาก Dockerfile ที่โฟลเดอร์หลัก
export class CSProjectDemo extends Container<Env> {
  defaultPort = 8080
  // ไม่มีผู้ใช้ 30 นาที → container หลับ (ไม่เสียค่าใช้จ่าย) ตื่นใหม่เมื่อมีคนเข้า ข้อมูลเดโมกลับเป็นค่าเริ่มต้น
  sleepAfter = '30m'
  envVars = {
    NODE_ENV: 'production',
    DEMO_MODE: 'true',
    PORT: '8080',
    TRUST_PROXY: 'true',
    REMINDERS: 'off',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ใช้ container เดียว ทุกคนเห็นข้อมูลชุดเดียวกัน
    return getContainer(env.CSPROJECT_DEMO, 'demo').fetch(request)
  },
} satisfies ExportedHandler<Env>
