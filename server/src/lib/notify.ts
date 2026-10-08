import type { Types } from 'mongoose'
import { Activity, Notification, ACTIVITY_TYPES } from '../models/misc.js'

type Id = Types.ObjectId | string

export interface Notice {
  icon?: string
  title: string
  detail?: string
  link?: string
}

// ส่งการแจ้งเตือนให้หลายคนพร้อมกัน (ข้ามผู้ที่ทำรายการเอง)
export async function notify(users: Id[], notice: Notice, except?: Id) {
  const targets = [...new Set(users.map(String))].filter((u) => u !== String(except ?? ''))
  if (targets.length === 0) return
  await Notification.insertMany(targets.map((user) => ({ user, ...notice })))
}

export async function logActivity(project: Id, type: (typeof ACTIVITY_TYPES)[number], actor: Id | null, detail = '') {
  await Activity.create({ project, type, actor, detail })
}
