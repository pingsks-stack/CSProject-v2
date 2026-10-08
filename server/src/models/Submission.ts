import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const CHAPTERS = ['บทที่ 1', 'บทที่ 2', 'บทที่ 3', 'บทที่ 4', 'บทที่ 5', 'ภาคผนวก', 'เล่มสมบูรณ์'] as const
export type Chapter = (typeof CHAPTERS)[number]

// ความเห็นอาจารย์ต่อเวอร์ชันหนึ่ง อาจารย์ 1 คนมีได้ 1 ความเห็นต่อเวอร์ชัน (ส่งใหม่ = แก้ความเห็นเดิม)
const reviewSchema = new Schema(
  {
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verdict: { type: String, enum: ['pass', 'revise'], required: true },
    comment: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

// เอกสารรายบท (แทน Doc_Submission + Doc_Review) แต่ละครั้งที่ส่งเป็นเวอร์ชันใหม่
const submissionSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    chapter: { type: String, enum: CHAPTERS, required: true },
    version: { type: Number, required: true },
    fileName: { type: String, required: true },
    storedName: { type: String, required: true },
    size: { type: Number, required: true },
    note: { type: String, default: '' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviews: { type: [reviewSchema], default: [] },
  },
  { timestamps: true },
)

submissionSchema.index({ project: 1, chapter: 1, version: -1 }, { unique: true })

export type SubmissionDoc = HydratedDocument<InferSchemaType<typeof submissionSchema>>
export const Submission = model('Submission', submissionSchema)
