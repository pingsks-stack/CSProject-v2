import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const MAX_STUDENTS = 2
export const MAX_TEACHERS = 3
// ต้องได้ "ผ่าน" จากอาจารย์ครบกี่คนจึงถือว่าโครงงานผ่าน (ที่ปรึกษา 1 + กรรมการ 2)
export const REQUIRED_PASSES = 3

export const TEACHER_ROLES = ['advisor', 'committee'] as const
export type TeacherRole = (typeof TEACHER_ROLES)[number]
export const TEACHER_ROLE_TH: Record<TeacherRole, string> = { advisor: 'ที่ปรึกษา', committee: 'กรรมการ' }

export const PROJECT_STATUSES = ['pending', 'passed', 'failed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

// สมาชิกโครงงาน (แทน Permission_TB) นิสิตไม่เกิน 2 คน อาจารย์ไม่เกิน 3 คน
const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['student', 'teacher'], required: true },
    teacherRole: { type: String, enum: [...TEACHER_ROLES, null], default: null },
    // ผลพิจารณาของอาจารย์คนนี้ (null = ยังไม่กด)
    vote: { type: String, enum: ['pass', 'fail', null], default: null },
    votedAt: { type: Date, default: null },
    isOwner: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
)

// ข้อมูลล่าสุดจาก GitHub repository ของโครงงาน (ดึงด้วย GitHub API เก็บไว้แสดงผล)
const githubSchema = new Schema(
  {
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    linkedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    linkedAt: { type: Date, default: Date.now },
    syncedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    description: { type: String, default: '' },
    htmlUrl: { type: String, default: '' },
    defaultBranch: { type: String, default: 'main' },
    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 },
    pushedAt: { type: Date, default: null },
    languages: { type: [{ _id: false, name: String, bytes: Number }], default: [] },
    commits: {
      type: [{ _id: false, sha: String, message: String, author: String, avatarUrl: String, date: Date, url: String }],
      default: [],
    },
    readmeHtml: { type: String, default: '' },
  },
  { _id: false },
)

// ภาพหน้าจอ (ประกาศ schema แยกเพื่อให้แต่ละรูปมี _id ไว้อ้างถึง)
const showcaseImageSchema = new Schema({
  fileName: String,
  storedName: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
})

// ข้อมูลแนะนำโครงงานสำหรับคลังโครงงาน (นิสิตกรอกเอง) ภาพแรกเป็นภาพปก
const showcaseSchema = new Schema(
  {
    abstract: { type: String, default: '' },
    keywords: { type: [String], default: [] },
    demoUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    images: { type: [showcaseImageSchema], default: [] },
  },
  { _id: false },
)

const projectSchema = new Schema(
  {
    nameTh: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    type: { type: Schema.Types.ObjectId, ref: 'ProjectType', default: null },
    // ชั้นปีของผู้สร้างตอนสร้างโครงงาน (0 = คำนวณไม่ได้)
    classLevel: { type: Number, default: 0 },
    // ภาคการศึกษา เช่น "2569/1" ใช้จับคู่กำหนดส่ง
    term: { type: String, required: true },
    members: { type: [memberSchema], default: [] },
    // คำนวณจากผลโหวตทุกครั้งที่เปลี่ยน (ดู recomputeStatus)
    status: { type: String, enum: PROJECT_STATUSES, default: 'pending' },
    passCount: { type: Number, default: 0 },
    passedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    github: { type: githubSchema, default: null },
    showcase: { type: showcaseSchema, default: () => ({}) },
  },
  { timestamps: true },
)

projectSchema.index({ 'members.user': 1 })
projectSchema.index({ 'github.owner': 1, 'github.repo': 1 })
projectSchema.index({ status: 1, createdAt: -1 })
projectSchema.index({ term: 1 })

export type ProjectDoc = HydratedDocument<InferSchemaType<typeof projectSchema>>
export type Member = ProjectDoc['members'][number]
export const Project = model('Project', projectSchema)

// id ของผู้ใช้ในรายการสมาชิก (ใช้ได้ทั้งตอน populate แล้วและยังไม่ populate)
export const memberUserId = (m: { user: unknown }) => String((m.user as { _id?: unknown } | null)?._id ?? m.user)

export function findMember(p: ProjectDoc, userId: unknown) {
  return p.members.find((m) => memberUserId(m) === String(userId))
}
export const students = (p: ProjectDoc) => p.members.filter((m) => m.kind === 'student')
export const teachers = (p: ProjectDoc) => p.members.filter((m) => m.kind === 'teacher')
export const advisorOf = (p: ProjectDoc) => p.members.find((m) => m.kind === 'teacher' && m.teacherRole === 'advisor')

// ผลรวมของโครงงาน: มีอาจารย์ไม่ผ่านคนเดียว = ไม่ผ่าน, ผ่านครบ REQUIRED_PASSES คน = ผ่าน
export function recomputeStatus(p: ProjectDoc): ProjectStatus {
  const ts = teachers(p)
  const passCount = ts.filter((m) => m.vote === 'pass').length
  const failed = ts.some((m) => m.vote === 'fail')
  const status: ProjectStatus = failed ? 'failed' : passCount >= REQUIRED_PASSES ? 'passed' : 'pending'
  if (status === 'passed' && p.status !== 'passed') p.passedAt = new Date()
  if (status !== 'passed') p.passedAt = null
  p.passCount = passCount
  p.status = status
  return status
}

export function statusLabel(p: { status: string; passCount: number }) {
  if (p.status === 'passed') return `ผ่าน ${REQUIRED_PASSES}/${REQUIRED_PASSES}`
  if (p.status === 'failed') return 'ไม่ผ่าน'
  return p.passCount > 0 ? `ผ่าน ${p.passCount}/${REQUIRED_PASSES}` : 'รอพิจารณา'
}

// ภาคการศึกษาปัจจุบัน (พ.ศ.): มิ.ย.–ต.ค. = /1, พ.ย.–ธ.ค. = /2, ม.ค.–มี.ค. = ปีก่อน/2, เม.ย.–พ.ค. = ปีก่อน/3
export function currentTerm(now = new Date()) {
  const m = now.getMonth() + 1
  const be = now.getFullYear() + 543
  if (m >= 6 && m <= 10) return `${be}/1`
  if (m >= 11) return `${be}/2`
  if (m <= 3) return `${be - 1}/2`
  return `${be - 1}/3`
}

// ชั้นปี = ปีการศึกษา (2 หลักท้าย) − 2 หลักแรกของรหัสนิสิต + 1 (ใช้ได้ 1–8)
export function classLevelOf(studentId: string, now = new Date()) {
  const entry = Number(studentId.slice(0, 2))
  if (!Number.isInteger(entry) || studentId.length < 2) return 0
  const be = now.getFullYear() + 543 - (now.getMonth() + 1 >= 6 ? 0 : 1)
  const level = (be % 100) - entry + 1
  return level >= 1 && level <= 8 ? level : 0
}
