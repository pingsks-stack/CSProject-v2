import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const ROLES = ['student', 'teacher', 'admin'] as const
export type Role = (typeof ROLES)[number]

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    mobile: { type: String, trim: true, default: '' },
    studentId: { type: String, trim: true, default: '' },
    role: { type: String, enum: ROLES, required: true, default: 'student' },
    // รับการแจ้งเตือนทางอีเมล (ปิดได้ที่หน้าโปรไฟล์)
    emailNotifications: { type: Boolean, default: true },
    // เพิ่มขึ้นทุกครั้งที่เปลี่ยน/รีเซ็ตรหัสผ่าน token ล็อกอินรุ่นเก่าจะใช้ไม่ได้ (= ออกจากระบบทุกเครื่อง)
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)


export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>
export const User = model('User', userSchema)

// ข้อมูลผู้ใช้ที่ส่งให้หน้าเว็บ (ไม่มีรหัสผ่าน)
export function publicUser(u: UserDoc) {
  return {
    id: u.id as string,
    username: u.username,
    name: u.name,
    email: u.email,
    mobile: u.mobile,
    studentId: u.studentId,
    role: u.role as Role,
    emailNotifications: u.emailNotifications !== false,
  }
}
