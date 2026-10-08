import fs from 'node:fs'
import path from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config.js'

// ส่งอีเมล
//   ตั้ง SMTP_HOST แล้ว → ส่งจริงผ่าน SMTP
//   ไม่ได้ตั้ง + เครื่องพัฒนา → บันทึกเป็นไฟล์ .html ใน server/data/mail (เปิดดูลิงก์ได้) และเก็บไว้ในหน่วยความจำให้ชุดทดสอบตรวจ
//   ไม่ได้ตั้ง + เซิร์ฟเวอร์จริง → ไม่ส่ง (ฟีเจอร์ที่ต้องใช้อีเมลจะแจ้งผู้ใช้ให้ติดต่อผู้ดูแลระบบ)

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

let transporter: Transporter | null = null
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })
}

export const mailEnabled = () => !!transporter || !config.isProd

// อีเมลล่าสุด (เฉพาะโหมดที่ไม่ได้ส่งจริง) ให้ชุดทดสอบอ่านได้
export const devMailbox: Mail[] = []

export async function sendMail(mail: Mail) {
  if (transporter) {
    await transporter.sendMail({ from: config.smtp.from, ...mail })
    return
  }
  if (config.isProd) return
  devMailbox.push(mail)
  if (devMailbox.length > 50) devMailbox.shift()
  try {
    fs.mkdirSync(config.devMailDir, { recursive: true })
    const file = path.join(config.devMailDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${mail.to.replace(/[^\w.@-]/g, '_')}.html`)
    fs.writeFileSync(file, `<!-- To: ${mail.to}\nSubject: ${mail.subject} -->\n${mail.html}`)
    if (process.env.NODE_ENV !== 'test') console.log(`[mail] ${mail.to}: ${mail.subject} (บันทึกที่ ${file})`)
  } catch {
    // บันทึกไฟล์ไม่ได้ก็ไม่เป็นไร
  }
}

// ส่งแบบไม่รอผล (ใช้ในจุดที่อีเมลไม่ควรทำให้คำสั่งหลักล้มเหลว)
export function queueMail(mail: Mail) {
  sendMail(mail).catch((e) => console.error('[mail] ส่งไม่สำเร็จ', mail.to, e instanceof Error ? e.message : e))
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const absoluteLink = (link: string) => (link && config.appUrl ? config.appUrl + link : '')

// แม่แบบอีเมล: หัวเรื่อง ข้อความ และปุ่มลิงก์เข้าระบบ
export function buildMail(to: string, { subject, lines, link, linkLabel = 'เปิดในระบบ' }: { subject: string; lines: string[]; link?: string; linkLabel?: string }): Mail {
  const url = link ? (link.startsWith('http') ? link : absoluteLink(link)) : ''
  const text = [...lines, url ? `\n${linkLabel}: ${url}` : ''].join('\n')
  const html = `<!doctype html><html lang="th"><body style="margin:0;background:#f7f5fb;font-family:'Noto Sans Thai',Tahoma,sans-serif;color:#1e1430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e4deee;border-radius:16px;overflow:hidden">
<tr><td style="background:#5b2c8c;color:#fff;padding:16px 24px;font-size:16px;font-weight:600">CS Project · มหาวิทยาลัยพะเยา</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:18px">${esc(subject)}</h1>
${lines.map((l) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.6">${esc(l)}</p>`).join('')}
${url ? `<p style="margin:20px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#5b2c8c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px">${esc(linkLabel)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:12px 24px;border-top:1px solid #e4deee;font-size:12px;color:#6e6482">อีเมลนี้ส่งอัตโนมัติจากระบบติดตามโครงงาน ปิดการแจ้งเตือนทางอีเมลได้ที่หน้าโปรไฟล์</td></tr>
</table></td></tr></table></body></html>`
  return { to, subject, text, html }
}
