// รูปแบบข้อมูลที่ server ส่งมา (ดู server/src/routes/*)

export type Role = 'student' | 'teacher' | 'admin'
export type TeacherRole = 'advisor' | 'committee'
export type ProjectStatus = 'pending' | 'passed' | 'failed'
export type Vote = 'pass' | 'fail' | null

export interface User {
  id: string
  username: string
  name: string
  email: string
  mobile: string
  studentId: string
  role: Role
  emailNotifications: boolean
}

export interface UserRef {
  id: string
  name: string
  role?: Role
  studentId?: string
  email?: string
  mobile?: string
}

export interface Member {
  user: UserRef
  kind: 'student' | 'teacher'
  teacherRole: TeacherRole | null
  vote: Vote
  votedAt: string | null
  isOwner: boolean
}

export interface GithubCommit {
  sha: string
  message: string
  author: string
  avatarUrl: string
  date: string | null
  url: string
}

export interface GithubInfo {
  owner: string
  repo: string
  htmlUrl: string
  description: string
  defaultBranch: string
  stars: number
  forks: number
  pushedAt: string | null
  syncedAt: string | null
  error: string
  languages: { name: string; bytes: number }[]
  commits: GithubCommit[]
  readmeHtml?: string
}

// ข้อมูลแนะนำโครงงานสำหรับคลังโครงงาน (ภาพแรกเป็นภาพปก)
// ภาพ: สมาชิก/ผู้ล็อกอิน /api/projects/:id/showcase/images/:imageId, สาธารณะ (โครงงานผ่านแล้ว) /api/public/projects/:id/images/:imageId
export interface Showcase {
  abstract: string
  keywords: string[]
  demoUrl: string
  videoUrl: string
  images: { id: string; fileName: string }[]
}

// ผลลัพธ์แบบแบ่งหน้า (page เริ่มที่ 1)
export interface PageInfo {
  total: number
  page: number
  pageSize: number
}

export interface Project {
  id: string
  nameTh: string
  nameEn: string
  type: { id: string; name: string } | null
  classLevel: number
  term: string
  status: ProjectStatus
  passCount: number
  statusLabel: string
  passedAt: string | null
  createdAt: string
  members: Member[]
  github: GithubInfo | null
  showcase: Showcase
  fileCount?: number
  codeCount?: number
  chapterCount?: number
  pendingInvites?: number
}

export interface Viewer {
  isAdmin: boolean
  isStudent: boolean
  isTeacher: boolean
  isAdvisor: boolean
  isMember: boolean
  canEdit: boolean
  myVote: Vote
}

export type RequestType = 'teacher_invite' | 'rename' | 'member_change' | 'member_remove'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface ProjectRequest {
  id: string
  type: RequestType
  status: RequestStatus
  project: { id: string; nameTh?: string }
  requestedBy: UserRef | null
  target: UserRef | null
  newMember: UserRef | null
  teacherRole: TeacherRole | null
  nameTh: string | null
  nameEn: string | null
  oldNameTh: string | null
  oldNameEn: string | null
  decidedBy: UserRef | null
  decidedAt: string | null
  createdAt: string
}

export type ActivityType =
  | 'project.create' | 'project.rename' | 'project.type' | 'project.resubmit'
  | 'member.add' | 'member.change' | 'member.remove' | 'teacher.join' | 'teacher.remove' | 'teacher.vote'
  | 'file.add' | 'file.replace' | 'file.delete'
  | 'code.add' | 'code.update' | 'code.delete'
  | 'chapter.submit' | 'chapter.review'
  | 'github.link' | 'github.unlink' | 'github.sync'

export interface Activity {
  id: string
  type: ActivityType
  detail: string
  actor: UserRef | null
  project?: { id: string; nameTh: string } | null
  createdAt: string
}

export interface ProjectFile {
  id: string
  fileName: string
  size: number
  uploadedBy: UserRef | null
  updatedAt: string
}

export interface CodeItem {
  id: string
  language: string
  functionName: string
  code: string
  lines: number
  githubPath?: string | null
  updatedBy: UserRef | null
  updatedAt: string
  project?: { id: string; nameTh: string }
}

export type ChapterStatus = 'not_submitted' | 'overdue' | 'waiting' | 'revise' | 'passed'

export interface Review {
  reviewer: UserRef | null
  verdict: 'pass' | 'revise'
  comment: string
  createdAt: string
}

export interface SubmissionVersion {
  id: string
  version: number
  fileName: string
  size: number
  note: string
  uploadedBy: UserRef | null
  createdAt: string
  late: boolean
  reviews: Review[]
}

export interface ChapterInfo {
  chapter: string
  deadline: { dueDate: string; note: string } | null
  status: ChapterStatus
  passCount: number
  versions: SubmissionVersion[]
}

export interface Notification {
  id: string
  icon: string
  title: string
  detail: string
  link: string
  read: boolean
  createdAt: string
}

export interface Meta {
  types: { id: string; name: string }[]
  chapters: string[]
  currentTerm: string
  terms: string[]
}

export interface Series {
  labels: string[]
  series: { name: string; data: number[] }[]
}

export interface OverdueItem {
  project: { id: string; nameTh: string }
  chapter: string
  dueDate: string
  lateDays: number
}

export interface ProjectLite {
  id: string
  nameTh: string
  nameEn: string
  status: ProjectStatus
  passCount: number
  statusLabel: string
  term: string
  teacherCount: number
  type: string | null
  createdAt: string
}

export interface TypeCount {
  id: string
  name: string
  count: number
}

// ===================== คลังโครงงานสาธารณะ (/api/public) =====================
export interface PublicProject {
  id: string
  nameTh: string
  nameEn: string
  type: { id: string; name: string } | null
  term: string
  classLevel: number
  passedAt: string | null
  students: string[]
  advisor: string | null
  committee: string[]
  github: { owner: string; repo: string; htmlUrl: string; description: string; stars: number; languages: string[] } | null
  codeCount?: number
  hasBook?: boolean
  abstract: string
  keywords: string[]
  coverImage: string | null
}

export interface PublicDetail {
  project: PublicProject
  showcase: Showcase
  github: GithubInfo | null
  chapters: { id: string; chapter: string; version: number; fileName: string; size: number; createdAt: string; isPdf: boolean }[]
  files: { id: string; fileName: string; size: number; isPdf: boolean }[]
  codes: { id: string; language: string; functionName: string; code: string; lines: number; githubPath: string | null; updatedAt: string }[]
  loggedIn: boolean
}
