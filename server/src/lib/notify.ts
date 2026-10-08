import type { Types } from 'mongoose'
import { Activity, Notification, ACTIVITY_TYPES } from '../models/misc.js'
import { User } from '../models/User.js'
import { buildMail, queueMail } from './mail.js'

type Id = Types.ObjectId | string

export interface Notice {
  icon?: string
  title: string
  detail?: string
  link?: string
}

// ส่งการแจ้งเตือนให้หลายคนพร้อมกัน (ข้ามผู้ที่ทำรายการเอง)
// ส่งอีเมลด้วยโดยค่าเริ่มต้น (ผู้ใช้ปิดได้ที่โปรไฟล์) เรื่องที่เกิดบ่อยให้ส่ง { email: false }
export async function notify(users: Id[], notice: Notice, except?: Id, opts: { email?: boolean } = {}) {
  const targets = [...new Set(users.map(String))].filter((u) => u !== String(except ?? ''))
  if (targets.length === 0) return
  await Notification.insertMany(targets.map((user) => ({ user, ...notice })))
  if (opts.email === false) return
  const recipients = await User.find({ _id: { $in: targets }, emailNotifications: { $ne: false } }).select('email')
  for (const u of recipients) {
    if (u.email) queueMail(buildMail(u.email, { subject: notice.title, lines: notice.detail ? [notice.detail] : [], link: notice.link }))
  }
}

export async function logActivity(project: Id, type: (typeof ACTIVITY_TYPES)[number], actor: Id | null, detail = '') {
  await Activity.create({ project, type, actor, detail })
}
