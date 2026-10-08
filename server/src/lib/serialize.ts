import type { Model, Types } from 'mongoose'
import { statusLabel, type ProjectDoc } from '../models/Project.js'
import type { Relation } from './access.js'

type Id = Types.ObjectId | string

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const containsRe = (q: string) => new RegExp(escapeRegex(q.trim()), 'i')

interface PopUser {
  _id: Types.ObjectId
  name?: string
  email?: string
  mobile?: string
  studentId?: string
  role?: string
}

export function userRef(u: unknown, withContacts = false) {
  if (!u || typeof u !== 'object' || !('_id' in u)) return u ? { id: String(u), name: '(ผู้ใช้ถูกลบ)' } : null
  const x = u as PopUser
  return {
    id: String(x._id),
    name: x.name ?? '',
    role: x.role,
    studentId: x.studentId || undefined,
    ...(withContacts ? { email: x.email, mobile: x.mobile } : {}),
  }
}

type GithubInfo = NonNullable<ProjectDoc['github']>

// ข้อมูล GitHub ของโครงงาน (README ส่งเฉพาะตอนขอรายละเอียด เพราะอาจใหญ่)
export function githubDto(g: GithubInfo, withReadme = false) {
  return {
    owner: g.owner,
    repo: g.repo,
    htmlUrl: g.htmlUrl || `https://github.com/${g.owner}/${g.repo}`,
    description: g.description,
    defaultBranch: g.defaultBranch,
    stars: g.stars,
    forks: g.forks,
    pushedAt: g.pushedAt,
    syncedAt: g.syncedAt,
    error: g.error,
    languages: g.languages.map((l) => ({ name: l.name ?? '', bytes: l.bytes ?? 0 })),
    commits: (withReadme ? g.commits : g.commits.slice(0, 5)).map((c) => ({
      sha: c.sha ?? '', message: c.message ?? '', author: c.author ?? '', avatarUrl: c.avatarUrl ?? '', date: c.date, url: c.url ?? '',
    })),
    ...(withReadme ? { readmeHtml: g.readmeHtml } : {}),
  }
}

// โครงงานพร้อมสมาชิก (ต้อง populate members.user และ type ก่อน)
export function projectDto(p: ProjectDoc, r?: Relation) {
  const contacts = r?.canSeeContacts ?? false
  return {
    id: p.id as string,
    nameTh: p.nameTh,
    nameEn: p.nameEn,
    type: p.type && typeof p.type === 'object' && 'name' in p.type ? { id: String(p.type._id), name: String(p.type.name) } : null,
    classLevel: p.classLevel,
    term: p.term,
    status: p.status,
    passCount: p.passCount,
    statusLabel: statusLabel(p),
    passedAt: p.passedAt,
    createdAt: (p as unknown as { createdAt: Date }).createdAt,
    members: p.members.map((m) => ({
      user: userRef(m.user, contacts),
      kind: m.kind,
      teacherRole: m.teacherRole ?? null,
      vote: m.vote ?? null,
      votedAt: m.votedAt,
      isOwner: m.isOwner,
    })),
    github: p.github ? githubDto(p.github) : null,
  }
}

export const PROJECT_POPULATE = [
  { path: 'members.user', select: 'name email mobile studentId role' },
  { path: 'type', select: 'name' },
]

// นับจำนวนเอกสารต่อโครงงาน เช่น จำนวนไฟล์/ฟังก์ชันของแต่ละโครงงานในรายการ
export async function countByProject(model: Model<any>, ids: Id[], extra: Record<string, unknown> = {}) {
  const rows: { _id: Types.ObjectId; n: number }[] = await model.aggregate([
    { $match: { project: { $in: ids }, ...extra } },
    { $group: { _id: '$project', n: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [String(r._id), r.n]))
}

// ชุดข้อมูลรายเดือน 12 เดือนล่าสุด (ป้ายเดือนแบบไทย เช่น "ต.ค. 69")
export function monthBuckets(now = new Date()) {
  const months: { key: string; label: string; start: Date }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
      start: d,
    })
  }
  return months
}

export async function monthlyCounts(model: Model<any>, match: Record<string, unknown>, dateField = 'createdAt') {
  const months = monthBuckets()
  const rows: { _id: { y: number; m: number }; n: number }[] = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: months[0].start } } },
    { $group: { _id: { y: { $year: { date: `$${dateField}`, timezone: 'Asia/Bangkok' } }, m: { $month: { date: `$${dateField}`, timezone: 'Asia/Bangkok' } } }, n: { $sum: 1 } } },
  ])
  const map = new Map(rows.map((r) => [`${r._id.y}-${r._id.m}`, r.n]))
  return months.map((m) => map.get(m.key) ?? 0)
}

export const monthLabels = () => monthBuckets().map((m) => m.label)
