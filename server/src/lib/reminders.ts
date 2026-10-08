import { config } from '../config.js'
import { Project, memberUserId, students } from '../models/Project.js'
import { Submission } from '../models/Submission.js'
import { Deadline, Reminder } from '../models/misc.js'
import { notify } from './notify.js'

// เตือนนิสิตเรื่องกำหนดส่งรายบท (กระดิ่ง + อีเมล) เฉพาะบทที่ยังไม่ส่ง
//   before3 = อีก 3 วัน, before1 = พรุ่งนี้, overdue1 = เลยกำหนดมา 1 วัน
// แต่ละโครงงาน/กำหนดส่ง/ช่วงเวลา เตือนครั้งเดียว (บันทึกใน Reminder)

const TZ = 'Asia/Bangkok'
const dayNumber = (d: Date) => Math.floor(Date.parse(d.toLocaleDateString('en-CA', { timeZone: TZ })) / 86_400_000)
const KIND_BY_DAYS: Record<number, 'before3' | 'before1' | 'overdue1'> = { 3: 'before3', 1: 'before1', [-1]: 'overdue1' }

export async function runReminders(now = new Date()) {
  const today = dayNumber(now)
  // กำหนดส่งในช่วง เมื่อวาน .. อีก 3 วัน (เผื่อเขตเวลา)
  const deadlines = await Deadline.find({
    dueDate: { $gte: new Date(now.getTime() - 3 * 86_400_000), $lte: new Date(now.getTime() + 4 * 86_400_000) },
  })
  let sent = 0
  for (const d of deadlines) {
    const kind = KIND_BY_DAYS[dayNumber(d.dueDate) - today]
    if (!kind) continue
    const projects = await Project.find({ term: d.term, status: 'pending' })
    for (const p of projects) {
      if (await Submission.exists({ project: p._id, chapter: d.chapter })) continue
      // จองสิทธิ์เตือนก่อน (unique index) ถ้าเคยเตือนแล้วจะ error แล้วข้าม
      try {
        await Reminder.create({ project: p._id, deadline: d._id, kind })
      } catch {
        continue
      }
      const due = d.dueDate.toLocaleDateString('th-TH', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
      const title =
        kind === 'before3' ? `อีก 3 วันครบกำหนดส่ง ${d.chapter}`
        : kind === 'before1' ? `พรุ่งนี้ครบกำหนดส่ง ${d.chapter}`
        : `เลยกำหนดส่ง ${d.chapter} แล้ว`
      await notify(students(p).map(memberUserId), {
        icon: 'alarm-clock',
        title,
        detail: `${p.nameTh} · กำหนดส่ง ${due}${d.note ? ` · ${d.note}` : ''}`,
        link: `/projects/${p.id}/chapters`,
      })
      sent++
    }
  }
  return sent
}

// ตรวจทุกชั่วโมงระหว่าง 07:00–21:00 (เวลาไทย) ไม่ส่งตอนกลางคืน
export function startReminderSchedule() {
  if (!config.reminders) return
  const tick = () => {
    const hour = Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }))
    if (hour < 7 || hour >= 21) return
    runReminders()
      .then((n) => n && console.log(`[reminders] ส่งการเตือนกำหนดส่ง ${n} รายการ`))
      .catch((e) => console.error('[reminders]', e))
  }
  setTimeout(tick, 30_000).unref()
  setInterval(tick, 60 * 60 * 1000).unref()
}
