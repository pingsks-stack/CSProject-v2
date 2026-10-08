import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { TEACHER_ROLES } from './Project.js'

// คำขอที่ต้องมีคนอนุมัติ (แทน SubAdd_AJ_TB, Sub_NPJ_TB, Status_Change_TB)
//   teacher_invite  นิสิตเชิญอาจารย์เป็นที่ปรึกษา/กรรมการ → อาจารย์ที่ถูกเชิญตอบรับ/ปฏิเสธ
//   rename          นิสิตขอเปลี่ยนชื่อโครงงาน → อาจารย์ที่ปรึกษาอนุมัติ
//   member_change   นิสิตขอเปลี่ยนคู่โปรเจค (target → newMember) → อาจารย์ที่ปรึกษาอนุมัติ
//   member_remove   นิสิตขอลบคู่โปรเจค (target) → อาจารย์ที่ปรึกษาอนุมัติ
// แอดมินอนุมัติแทนได้ทุกประเภท
export const REQUEST_TYPES = ['teacher_invite', 'rename', 'member_change', 'member_remove'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]
export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const

const requestSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: REQUEST_TYPES, required: true },
    status: { type: String, enum: REQUEST_STATUSES, default: 'pending' },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // teacher_invite: อาจารย์ที่ถูกเชิญ / member_*: นิสิตที่ถูกเปลี่ยนหรือลบ
    target: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    teacherRole: { type: String, enum: [...TEACHER_ROLES, null], default: null },
    // member_change: นิสิตคนใหม่
    newMember: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // rename: ชื่อใหม่ (และชื่อเดิมไว้แสดงประวัติ)
    nameTh: { type: String, default: null },
    nameEn: { type: String, default: null },
    oldNameTh: { type: String, default: null },
    oldNameEn: { type: String, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

requestSchema.index({ project: 1, createdAt: -1 })
requestSchema.index({ status: 1, type: 1 })
requestSchema.index({ target: 1, status: 1 })

export type RequestDoc = HydratedDocument<InferSchemaType<typeof requestSchema>>
export const ProjectRequest = model('Request', requestSchema)
