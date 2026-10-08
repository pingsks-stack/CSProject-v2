import { Project, findMember, type ProjectDoc } from '../models/Project.js'
import type { UserDoc } from '../models/User.js'
import { forbidden, notFound, objectId } from './http.js'

// ความสัมพันธ์ของผู้ใช้กับโครงงาน ใช้ตัดสินสิทธิ์ทุก API ของโครงงาน (ตรวจที่ server เสมอ)
export function relation(p: ProjectDoc, user: UserDoc) {
  const m = findMember(p, user._id)
  const isAdmin = user.role === 'admin'
  const isStudent = m?.kind === 'student'
  const isTeacher = m?.kind === 'teacher'
  return {
    member: m,
    isAdmin,
    isStudent,
    isTeacher,
    isAdvisor: isTeacher && m?.teacherRole === 'advisor',
    isMember: !!m,
    // ดูรายละเอียดได้: แอดมิน สมาชิก หรือทุกคนเมื่อโครงงานผ่านแล้ว (อยู่ในคลังโครงงาน)
    canView: isAdmin || !!m || p.status === 'passed',
    // ดูข้อมูลติดต่อของสมาชิก (อีเมล/เบอร์โทร): เฉพาะแอดมินและสมาชิก
    canSeeContacts: isAdmin || !!m,
    // แก้ไขข้อมูลโครงงาน: นิสิตในโครงงาน หรือแอดมิน
    canEdit: isAdmin || isStudent,
  }
}

export type Relation = ReturnType<typeof relation>

export async function loadProject(id: unknown) {
  const p = await Project.findById(objectId(id))
  if (!p) throw notFound('ไม่พบโครงงาน')
  return p
}

export async function projectFor(id: unknown, user: UserDoc, need: 'view' | 'edit' | 'student' | 'teacher' | 'member' = 'view') {
  const p = await loadProject(id)
  const r = relation(p, user)
  const ok =
    need === 'view' ? r.canView
    : need === 'edit' ? r.canEdit
    : need === 'student' ? r.isStudent
    : need === 'teacher' ? r.isTeacher
    : r.isMember || r.isAdmin
  if (!ok) throw forbidden()
  return { p, r }
}
