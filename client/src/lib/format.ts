import type { ActivityType, ChapterStatus, ProjectStatus, RequestStatus, RequestType, Role, TeacherRole } from './types'

const TZ = 'Asia/Bangkok'

// วันที่แบบไทย (พ.ศ.) เช่น "8 ต.ค. 69" / "8 ต.ค. 69 14:05"
export function thaiDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return '-'
  const d = new Date(value)
  return d.toLocaleString('th-TH', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function thaiDateLong(value: string | Date | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
}

export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const min = diff / 60000
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${Math.floor(min)} นาที`
  if (min < 60 * 24) return `${Math.floor(min / 60)} ชม.`
  if (min < 60 * 24 * 30) return `${Math.floor(min / 60 / 24)} วัน`
  return thaiDate(value)
}

// จำนวนวันจากวันนี้ถึงวันที่กำหนด นับตามวันที่ในประเทศไทย (ติดลบ = เลยกำหนด)
export function daysUntil(value: string | Date) {
  const bkkDay = (d: Date) => Date.parse(d.toLocaleDateString('en-CA', { timeZone: TZ }))
  return Math.round((bkkDay(new Date(value)) - bkkDay(new Date())) / 86400000)
}

export function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export const ROLE_TH: Record<Role, string> = { student: 'นิสิต', teacher: 'อาจารย์', admin: 'ผู้ดูแลระบบ' }
export const TEACHER_ROLE_TH: Record<TeacherRole, string> = { advisor: 'ที่ปรึกษา', committee: 'กรรมการ' }

// อักษรย่อชื่อ: ข้ามคำนำหน้าชื่อ (ทั้งแบบแยกคำและติดกับชื่อ เช่น "นายกิตติ") และสระหน้า เ แ โ ใ ไ
const TITLES = ['นาย', 'นาง', 'นางสาว', 'อาจารย์', 'ดร.', 'ผศ.', 'รศ.', 'ศ.', 'ผศ.ดร.', 'รศ.ดร.']
const firstLetter = (w: string) => w.replace(/^(นางสาว|นาย|นาง)(?=.)/, '').replace(/^[เแโใไ]/, '').slice(0, 1)
export function initials(name: string | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const words = parts.filter((p) => !TITLES.includes(p))
  const use = words.length ? words : parts
  if (!use.length) return '?'
  return (firstLetter(use[0]) + (use[1] ? firstLetter(use[1]) : '')).toUpperCase()
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'gold' | 'muted'

export function projectTone(status: ProjectStatus, passCount: number): Tone {
  if (status === 'passed') return 'ok'
  if (status === 'failed') return 'bad'
  return passCount > 0 ? 'info' : 'warn'
}

export const CHAPTER_STATUS: Record<ChapterStatus, { label: string; tone: Tone }> = {
  not_submitted: { label: 'ยังไม่ส่ง', tone: 'muted' },
  overdue: { label: 'เลยกำหนด', tone: 'bad' },
  waiting: { label: 'รอตรวจ', tone: 'info' },
  revise: { label: 'ต้องแก้ไข', tone: 'warn' },
  passed: { label: 'ผ่าน', tone: 'ok' },
}

export const REQUEST_TYPE_TH: Record<RequestType, string> = {
  teacher_invite: 'เชิญอาจารย์',
  rename: 'ขอเปลี่ยนชื่อโครงงาน',
  member_change: 'ขอเปลี่ยนคู่โปรเจค',
  member_remove: 'ขอลบคู่โปรเจค',
}

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: 'รอการยืนยัน', tone: 'warn' },
  approved: { label: 'ยืนยันแล้ว', tone: 'ok' },
  rejected: { label: 'ถูกปฏิเสธ', tone: 'bad' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'muted' },
}

// ป้ายและไอคอน (ชื่อไอคอน lucide) ของประวัติแต่ละประเภท
export const ACTIVITY: Record<ActivityType, { label: string; icon: string }> = {
  'project.create': { label: 'สร้างโครงงาน', icon: 'folder-plus' },
  'project.rename': { label: 'เปลี่ยนชื่อโครงงาน', icon: 'pencil-line' },
  'project.type': { label: 'เปลี่ยนประเภทโครงงาน', icon: 'tag' },
  'project.resubmit': { label: 'ส่งโครงงานใหม่', icon: 'rotate-ccw' },
  'member.add': { label: 'เพิ่มคู่โปรเจค', icon: 'user-plus' },
  'member.change': { label: 'เปลี่ยนคู่โปรเจค', icon: 'users' },
  'member.remove': { label: 'ลบคู่โปรเจค', icon: 'user-minus' },
  'teacher.join': { label: 'อาจารย์เข้าร่วม', icon: 'user-check' },
  'teacher.remove': { label: 'นำอาจารย์ออก', icon: 'user-minus' },
  'teacher.vote': { label: 'อาจารย์พิจารณาโครงงาน', icon: 'gavel' },
  'file.add': { label: 'อัปโหลดไฟล์', icon: 'file-up' },
  'file.replace': { label: 'แทนที่ไฟล์', icon: 'refresh-cw' },
  'file.delete': { label: 'ลบไฟล์', icon: 'trash-2' },
  'code.add': { label: 'เพิ่มซอร์สโค้ด', icon: 'code-xml' },
  'code.update': { label: 'แก้ไขซอร์สโค้ด', icon: 'code-xml' },
  'code.delete': { label: 'ลบซอร์สโค้ด', icon: 'trash-2' },
  'chapter.submit': { label: 'ส่งเอกสารรายบท', icon: 'file-check' },
  'chapter.review': { label: 'ให้ความเห็นเอกสาร', icon: 'message-square-text' },
  'github.link': { label: 'เชื่อม GitHub', icon: 'git-branch' },
  'github.unlink': { label: 'ยกเลิกการเชื่อม GitHub', icon: 'unlink' },
  'github.sync': { label: 'อัปเดตงานจาก GitHub', icon: 'git-commit-horizontal' },
}

// ภาษาโปรแกรมของคลังซอร์สโค้ด (ค่าเดียวกับระบบเดิม)
export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'C#', label: 'C#' },
  { value: 'vbnet', label: 'VB.NET' },
  { value: 'cpp', label: 'C/C++' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'PHP', label: 'PHP' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'dart', label: 'Dart' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'other', label: 'อื่น ๆ' },
]
export const languageLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label ?? (v || 'อื่น ๆ')

export const ALLOWED_EXT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.jpg,.jpeg,.png,.gif'
export const MAX_UPLOAD_MB = 30
