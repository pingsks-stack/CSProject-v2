import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { CHAPTERS } from './Submission.js'

// ประเภทโครงงาน (แทน DocTypeTB)
const projectTypeSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  order: { type: Number, default: 0 },
})
export const ProjectType = model('ProjectType', projectTypeSchema)

// รายการประเภทเรียงตามลำดับ โดยให้ "Other" อยู่ท้ายเสมอ (เหมือนระบบเดิม)
export async function orderedTypes() {
  const types = await ProjectType.find().sort({ order: 1, name: 1 })
  return types.sort((a, b) => Number(a.name === 'Other') - Number(b.name === 'Other'))
}

// ไฟล์ของโครงงาน (แทน Doc_File) เก็บแยกโฟลเดอร์ตามโครงงาน ดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์
const projectFileSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    fileName: { type: String, required: true },
    storedName: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
export const ProjectFile = model('ProjectFile', projectFileSchema)

// ซอร์สโค้ดของโครงงาน (แทน Doc_List_TB)
const codeSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    language: { type: String, required: true },
    functionName: { type: String, required: true, trim: true },
    code: { type: String, required: true },
    // ไฟล์ที่นำเข้าจาก GitHub (path ใน repository) จะอัปเดตตาม GitHub ทุกครั้งที่ซิงค์
    githubPath: { type: String, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
export type CodeDoc = HydratedDocument<InferSchemaType<typeof codeSchema>>
export const Code = model('Code', codeSchema)

// ความเห็นอาจารย์–นิสิต แยกเธรดตามอาจารย์แต่ละคนในโครงงาน (แทน Comment_TB)
const commentSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
  },
  { timestamps: true },
)
commentSchema.index({ project: 1, teacher: 1, createdAt: 1 })
export const Comment = model('Comment', commentSchema)

// แชทนิสิต–อาจารย์ (แทน Talk_TB)
const messageSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
)
messageSchema.index({ student: 1, teacher: 1, createdAt: 1 })
export const Message = model('Message', messageSchema)

// กำหนดส่งรายบทตามภาคการศึกษา (แทน Deadline_TB)
const deadlineSchema = new Schema(
  {
    term: { type: String, required: true },
    chapter: { type: String, enum: CHAPTERS, required: true },
    dueDate: { type: Date, required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
)
deadlineSchema.index({ term: 1, chapter: 1 }, { unique: true })
export const Deadline = model('Deadline', deadlineSchema)

// ประวัติการเปลี่ยนแปลง (แทน MAS_DOC_LOG, Doc_File_Log, Doc_List_Log)
export const ACTIVITY_TYPES = [
  'project.create', 'project.rename', 'project.type', 'project.resubmit',
  'member.add', 'member.change', 'member.remove', 'teacher.join', 'teacher.remove', 'teacher.vote',
  'file.add', 'file.replace', 'file.delete',
  'code.add', 'code.update', 'code.delete',
  'chapter.submit', 'chapter.review',
  'github.link', 'github.unlink', 'github.sync',
] as const
const activitySchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    detail: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
activitySchema.index({ project: 1, createdAt: -1 })
activitySchema.index({ createdAt: -1 })
export const Activity = model('Activity', activitySchema)

// การแจ้งเตือนบนกระดิ่ง
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    icon: { type: String, default: 'bell' },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    link: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
notificationSchema.index({ user: 1, createdAt: -1 })
export const Notification = model('Notification', notificationSchema)

// ค่าตั้งระบบ (ข้อความในแบบฟอร์มยืนยันโครงงาน) มีเอกสารเดียว
const settingsSchema = new Schema({
  key: { type: String, default: 'main', unique: true },
  courseCode: { type: String, default: '225492' },
  courseName: { type: String, default: 'โครงงานวิทยาการคอมพิวเตอร์' },
  programName: { type: String, default: 'สาขาวิชาวิทยาการคอมพิวเตอร์' },
  facultyName: { type: String, default: 'คณะเทคโนโลยีสารสนเทศและการสื่อสาร' },
  universityName: { type: String, default: 'มหาวิทยาลัยพะเยา' },
  chairName: { type: String, default: '' },
  chairTitle: { type: String, default: 'ประธานหลักสูตรวิทยาศาสตรบัณฑิต สาขาวิชาวิทยาการคอมพิวเตอร์' },
})
export type SettingsDoc = HydratedDocument<InferSchemaType<typeof settingsSchema>>
export const Settings = model('Settings', settingsSchema)

export async function getSettings() {
  return (await Settings.findOne({ key: 'main' })) ?? (await Settings.create({ key: 'main' }))
}
