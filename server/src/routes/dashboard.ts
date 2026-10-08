import { Router } from 'express'
import type { Types } from 'mongoose'
import { me, requireAuth } from '../lib/auth.js'
import { monthLabels, monthlyCounts, userRef } from '../lib/serialize.js'
import { Project, statusLabel, teachers } from '../models/Project.js'
import { ProjectRequest } from '../models/Request.js'
import { Submission } from '../models/Submission.js'
import { User, type UserDoc } from '../models/User.js'
import { Activity, Deadline, ProjectFile, orderedTypes } from '../models/misc.js'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

const UPLOAD_TYPES = ['file.add', 'file.replace', 'chapter.submit']
const DAY = 24 * 60 * 60 * 1000

async function recentActivity(projectIds: Types.ObjectId[] | null, limit = 7) {
  const list = await Activity.find(projectIds ? { project: { $in: projectIds } } : {})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'name')
    .populate('project', 'nameTh')
  return list.map((a) => ({
    id: a.id,
    type: a.type,
    detail: a.detail,
    actor: userRef(a.actor),
    project: a.project && typeof a.project === 'object' && 'nameTh' in a.project ? { id: String(a.project._id), nameTh: String(a.project.nameTh) } : null,
    createdAt: a.createdAt,
  }))
}

// บทที่เลยกำหนดส่งแล้วแต่ยังไม่มีไฟล์ ของโครงงานในขอบเขต
async function overdue(projects: { _id: Types.ObjectId; nameTh: string; term: string }[]) {
  const terms = [...new Set(projects.map((p) => p.term))]
  const now = new Date()
  const [deadlines, sent] = await Promise.all([
    Deadline.find({ term: { $in: terms }, dueDate: { $lt: now } }).sort({ dueDate: 1 }),
    Submission.aggregate<{ _id: { p: Types.ObjectId; c: string } }>([
      { $match: { project: { $in: projects.map((p) => p._id) } } },
      { $group: { _id: { p: '$project', c: '$chapter' } } },
    ]),
  ])
  const done = new Set(sent.map((s) => `${s._id.p}|${s._id.c}`))
  const rows = []
  for (const d of deadlines) {
    for (const p of projects.filter((x) => x.term === d.term)) {
      if (!done.has(`${p._id}|${d.chapter}`)) {
        rows.push({ project: { id: String(p._id), nameTh: p.nameTh }, chapter: d.chapter, dueDate: d.dueDate, lateDays: Math.floor((now.getTime() - d.dueDate.getTime()) / DAY) + 1 })
      }
    }
  }
  return { items: rows.slice(0, 8), total: rows.length }
}

async function typeDistribution() {
  const [types, rows] = await Promise.all([
    orderedTypes(),
    Project.aggregate<{ _id: Types.ObjectId | null; n: number }>([{ $group: { _id: '$type', n: { $sum: 1 } } }]),
  ])
  const counts = new Map(rows.map((r) => [String(r._id), r.n]))
  const list = types.map((t) => ({ id: t.id as string, name: t.name, count: counts.get(t.id) ?? 0 }))
  const none = counts.get('null') ?? 0
  if (none) list.push({ id: 'none', name: 'ยังไม่ระบุประเภท', count: none })
  return list
}

function lite(p: InstanceType<typeof Project>) {
  return { id: p.id as string, nameTh: p.nameTh, nameEn: p.nameEn, status: p.status, passCount: p.passCount, statusLabel: statusLabel(p), term: p.term, teacherCount: teachers(p).length, type: p.type && typeof p.type === 'object' && 'name' in p.type ? String(p.type.name) : null, createdAt: p.createdAt }
}

dashboardRouter.get('/', async (req, res) => {
  const user = me(req)
  if (user.role === 'admin') res.json(await adminDashboard())
  else if (user.role === 'teacher') res.json(await teacherDashboard(user))
  else res.json(await studentDashboard(user))
})

async function studentDashboard(user: UserDoc) {
  const projects = await Project.find({ 'members.user': user._id }).sort({ createdAt: -1 }).populate('type', 'name')
  const ids = projects.map((p) => p._id)
  const [files, pendingInvites, library, deadlines, lastVersions, up, edits, types, activity] = await Promise.all([
    ProjectFile.countDocuments({ project: { $in: ids } }),
    ProjectRequest.countDocuments({ project: { $in: ids }, type: 'teacher_invite', status: 'pending' }),
    Project.countDocuments({ status: 'passed' }),
    Deadline.find({ term: { $in: projects.map((p) => p.term) } }).sort({ dueDate: 1 }),
    Submission.aggregate<{ _id: { p: Types.ObjectId; c: string }; v: number }>([
      { $match: { project: { $in: ids } } },
      { $group: { _id: { p: '$project', c: '$chapter' }, v: { $max: '$version' } } },
    ]),
    monthlyCounts(Activity, { project: { $in: ids }, type: { $in: UPLOAD_TYPES } }),
    monthlyCounts(Activity, { project: { $in: ids }, type: { $nin: UPLOAD_TYPES } }),
    typeDistribution(),
    recentActivity(ids),
  ])
  const versions = new Map(lastVersions.map((r) => [`${r._id.p}|${r._id.c}`, r.v]))
  const teacherIds = new Set(projects.flatMap((p) => teachers(p).map((m) => String(m.user))))
  return {
    role: 'student',
    kpis: {
      projects: projects.length,
      passed: projects.filter((p) => p.status === 'passed').length,
      files,
      teachers: teacherIds.size,
      pendingInvites,
      library,
    },
    deadlines: projects.flatMap((p) =>
      deadlines.filter((d) => d.term === p.term).map((d) => ({
        project: { id: p.id as string, nameTh: p.nameTh },
        chapter: d.chapter,
        dueDate: d.dueDate,
        note: d.note,
        lastVersion: versions.get(`${p._id}|${d.chapter}`) ?? null,
      })),
    ),
    monthly: { labels: monthLabels(), series: [{ name: 'อัปโหลดไฟล์/ส่งเอกสาร', data: up }, { name: 'แก้ไขโครงงาน', data: edits }] },
    types,
    projects: projects.map(lite),
    activity,
  }
}

async function teacherDashboard(user: UserDoc) {
  const projects = await Project.find({ 'members.user': user._id }).sort({ createdAt: -1 }).populate('type', 'name')
  const ids = projects.map((p) => p._id)
  const advised = projects.filter((p) => p.members.some((m) => String(m.user) === String(user._id) && m.teacherRole === 'advisor'))
  const [requests, toReview, files, od, up, edits, activity] = await Promise.all([
    ProjectRequest.find({
      status: 'pending',
      $or: [{ type: 'teacher_invite', target: user._id }, { type: { $ne: 'teacher_invite' }, project: { $in: advised.map((p) => p._id) } }],
    }).populate('project', 'nameTh').populate('requestedBy target newMember', 'name'),
    Submission.aggregate<{ _id: { p: Types.ObjectId; c: string }; sub: { _id: Types.ObjectId; version: number; createdAt: Date; reviewers: Types.ObjectId[] } }>([
      { $match: { project: { $in: ids } } },
      { $sort: { version: -1 } },
      { $group: { _id: { p: '$project', c: '$chapter' }, sub: { $first: { _id: '$_id', version: '$version', createdAt: '$createdAt', reviewers: '$reviews.reviewer' } } } },
    ]),
    ProjectFile.countDocuments({ project: { $in: ids } }),
    overdue(projects),
    monthlyCounts(Activity, { project: { $in: ids }, type: { $in: UPLOAD_TYPES } }),
    monthlyCounts(Activity, { project: { $in: ids }, type: { $nin: UPLOAD_TYPES } }),
    recentActivity(ids),
  ])
  const names = new Map(projects.map((p) => [p.id as string, p.nameTh]))
  const reqLabel = (r: (typeof requests)[number]) => {
    const proj = r.project as unknown as { nameTh?: string }
    const by = (r.requestedBy as unknown as { name?: string })?.name ?? ''
    if (r.type === 'teacher_invite') return { title: `คำเชิญเป็นอาจารย์${r.teacherRole === 'advisor' ? 'ที่ปรึกษา' : 'กรรมการ'}`, detail: `${proj?.nameTh ?? ''} · โดย ${by}` }
    if (r.type === 'rename') return { title: 'ขอเปลี่ยนชื่อโครงงาน', detail: `ชื่อใหม่: ${r.nameTh}` }
    const target = (r.target as unknown as { name?: string })?.name ?? ''
    if (r.type === 'member_change') return { title: 'ขอเปลี่ยนคู่โปรเจค', detail: `${target} → ${(r.newMember as unknown as { name?: string })?.name ?? ''}` }
    return { title: 'ขอลบคู่โปรเจค', detail: `${target} · ${proj?.nameTh ?? ''}` }
  }
  const pending = [
    ...requests.map((r) => ({ kind: 'request', ...reqLabel(r), link: '/requests', at: r.createdAt })),
    ...toReview
      .filter((x) => !x.sub.reviewers.some((rv) => String(rv) === String(user._id)))
      .map((x) => ({ kind: 'review', title: `เอกสารรอตรวจ: ${x._id.c} v${x.sub.version}`, detail: names.get(String(x._id.p)) ?? '', link: `/projects/${x._id.p}/chapters`, at: x.sub.createdAt })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at))

  const statusDist = [
    { key: 'passed', label: 'ผ่านครบ 3/3', count: projects.filter((p) => p.status === 'passed').length },
    { key: 'partial', label: 'ผ่านบางส่วน', count: projects.filter((p) => p.status === 'pending' && p.passCount > 0).length },
    { key: 'pending', label: 'รอพิจารณา', count: projects.filter((p) => p.status === 'pending' && p.passCount === 0).length },
    { key: 'failed', label: 'ไม่ผ่าน', count: projects.filter((p) => p.status === 'failed').length },
  ]
  return {
    role: 'teacher',
    kpis: {
      projects: projects.length,
      advising: advised.length,
      pending: pending.length,
      passed: statusDist[0].count,
      myPasses: projects.filter((p) => p.members.some((m) => String(m.user) === String(user._id) && m.vote === 'pass')).length,
      files,
    },
    overdue: od,
    monthly: { labels: monthLabels(), series: [{ name: 'อัปโหลดไฟล์/ส่งเอกสาร', data: up }, { name: 'แก้ไขโครงงาน', data: edits }] },
    statusDist,
    pending: pending.slice(0, 10),
    activity,
  }
}

async function adminDashboard() {
  const all = await Project.find().sort({ createdAt: -1 }).populate('type', 'name')
  const [students, teacherCount, files, od, newProjects, uploads, types, activity] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'teacher' }),
    ProjectFile.countDocuments(),
    overdue(all),
    monthlyCounts(Project, {}),
    monthlyCounts(Activity, { type: { $in: UPLOAD_TYPES } }),
    typeDistribution(),
    recentActivity(null),
  ])
  const passed = all.filter((p) => p.status === 'passed').length
  return {
    role: 'admin',
    kpis: {
      projects: all.length,
      untyped: all.filter((p) => !p.type).length,
      students,
      teachers: teacherCount,
      passed,
      passedPct: all.length ? Math.round((passed * 100) / all.length) : null,
      files,
      filesAvg: all.length ? Math.round((files / all.length) * 10) / 10 : 0,
    },
    overdue: od,
    monthly: { labels: monthLabels(), series: [{ name: 'โครงงานใหม่', data: newProjects }, { name: 'อัปโหลดไฟล์/ส่งเอกสาร', data: uploads }] },
    types,
    latest: all.slice(0, 6).map(lite),
    activity,
  }
}

// สถิติจำนวนโครงงานตามประเภท (ทุกบทบาทดูได้)
export const statsRouter = Router()
statsRouter.get('/types', requireAuth, async (_req, res) => {
  res.json({ types: await typeDistribution() })
})
