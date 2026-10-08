import path from 'node:path'
import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { notFound, objectId, parse } from '../lib/http.js'
import { containsRe, countByProject, githubDto, showcaseDto } from '../lib/serialize.js'
import { sendImage } from '../lib/uploads.js'
import { Project, type ProjectDoc } from '../models/Project.js'
import { CHAPTERS, Submission } from '../models/Submission.js'
import { User } from '../models/User.js'
import { Code, ProjectFile, orderedTypes } from '../models/misc.js'
import { mailEnabled } from '../lib/mail.js'

// คลังโครงงานสาธารณะ (ไม่ต้องล็อกอิน) ให้รุ่นน้องดูโครงงานที่ผ่านแล้วของรุ่นพี่
// แสดงเฉพาะโครงงานที่ผ่าน 3/3 และไม่ส่งข้อมูลส่วนตัว (อีเมล เบอร์โทร รหัสนิสิต)
// ตัวไฟล์เอกสารยังต้องล็อกอินก่อนเปิด (ผ่าน /api/submissions/:id/view และ /api/projects/:id/files/:fid/view)
export const publicRouter = Router()

const POPULATE = [
  { path: 'members.user', select: 'name' },
  { path: 'type', select: 'name' },
]
const nameOf = (u: unknown) => (u && typeof u === 'object' && 'name' in u ? String(u.name) : '')
const isPdf = (name: string) => path.extname(name).toLowerCase() === '.pdf'

function summary(p: ProjectDoc) {
  const teachers = p.members.filter((m) => m.kind === 'teacher')
  return {
    id: p.id as string,
    nameTh: p.nameTh,
    nameEn: p.nameEn,
    type: p.type && typeof p.type === 'object' && 'name' in p.type ? { id: String(p.type._id), name: String(p.type.name) } : null,
    term: p.term,
    classLevel: p.classLevel,
    passedAt: p.passedAt,
    students: p.members.filter((m) => m.kind === 'student').map((m) => nameOf(m.user)),
    advisor: nameOf(teachers.find((m) => m.teacherRole === 'advisor')?.user) || null,
    committee: teachers.filter((m) => m.teacherRole !== 'advisor').map((m) => nameOf(m.user)),
    github: p.github
      ? { owner: p.github.owner, repo: p.github.repo, htmlUrl: p.github.htmlUrl, description: p.github.description, stars: p.github.stars, languages: p.github.languages.slice(0, 4).map((l) => l.name ?? '') }
      : null,
    abstract: (p.showcase?.abstract ?? '').slice(0, 220),
    keywords: p.showcase?.keywords ?? [],
    coverImage: p.showcase?.images[0] ? String(p.showcase.images[0]._id) : null,
  }
}

// ค่าที่หน้าเว็บต้องรู้ก่อนล็อกอิน
publicRouter.get('/config', (_req, res) => {
  res.json({ mailEnabled: mailEnabled() })
})

publicRouter.get('/meta', async (_req, res) => {
  const [types, terms, total] = await Promise.all([
    orderedTypes(),
    Project.distinct('term', { status: 'passed' }),
    Project.countDocuments({ status: 'passed' }),
  ])
  res.json({ types: types.map((t) => ({ id: t.id, name: t.name })), terms: terms.sort().reverse(), total })
})

publicRouter.get('/projects', async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().optional(),
      type: z.string().optional(),
      term: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(60).default(24),
    }),
    req.query,
  )
  const filter: Record<string, unknown> = { status: 'passed' }
  if (q.q?.trim()) {
    const re = containsRe(q.q)
    const people = await User.find({ name: re }).select('_id')
    filter.$or = [
      { nameTh: re }, { nameEn: re }, { 'github.repo': re }, { 'showcase.keywords': re }, { 'showcase.abstract': re },
      { 'members.user': { $in: people.map((u) => u._id) } },
    ]
  }
  if (q.type === 'none') filter.type = null
  else if (q.type) filter.type = objectId(q.type)
  if (q.term) filter.term = q.term
  const [list, total] = await Promise.all([
    Project.find(filter).sort({ passedAt: -1, createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).populate(POPULATE),
    Project.countDocuments(filter),
  ])
  const ids = list.map((p) => p._id)
  const [codes, books] = await Promise.all([
    countByProject(Code, ids),
    countByProject(Submission, ids, { chapter: 'เล่มสมบูรณ์' }),
  ])
  res.json({
    projects: list.map((p) => ({ ...summary(p), codeCount: codes.get(p.id) ?? 0, hasBook: (books.get(p.id) ?? 0) > 0 })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  })
})

publicRouter.get('/projects/:id', async (req, res) => {
  const p = await Project.findOne({ _id: objectId(req.params.id), status: 'passed' }).populate(POPULATE)
  if (!p) throw notFound('ไม่พบโครงงานนี้ในคลัง')
  const [subs, files, codes] = await Promise.all([
    Submission.aggregate<{ _id: string; sub: { _id: Types.ObjectId; version: number; fileName: string; size: number; createdAt: Date } }>([
      { $match: { project: p._id } },
      { $sort: { version: -1 } },
      { $group: { _id: '$chapter', sub: { $first: { _id: '$_id', version: '$version', fileName: '$fileName', size: '$size', createdAt: '$createdAt' } } } },
    ]),
    ProjectFile.find({ project: p._id }).sort({ fileName: 1 }),
    Code.find({ project: p._id }).sort({ functionName: 1 }),
  ])
  const byChapter = new Map(subs.map((s) => [s._id, s.sub]))
  res.json({
    project: summary(p),
    showcase: showcaseDto(p),
    github: p.github ? githubDto(p.github, true) : null,
    chapters: CHAPTERS.filter((c) => byChapter.has(c)).map((c) => {
      const s = byChapter.get(c)!
      return { id: String(s._id), chapter: c, version: s.version, fileName: s.fileName, size: s.size, createdAt: s.createdAt, isPdf: isPdf(s.fileName) }
    }),
    files: files.map((f) => ({ id: f.id as string, fileName: f.fileName, size: f.size, isPdf: isPdf(f.fileName) })),
    codes: codes.map((c) => ({ id: c.id as string, language: c.language, functionName: c.functionName, code: c.code, lines: c.code.split('\n').length, githubPath: c.githubPath, updatedAt: c.updatedAt })),
    loggedIn: !!req.user,
  })
})

// ภาพหน้าจอของโครงงานที่ผ่านแล้ว (เปิดได้โดยไม่ต้องล็อกอิน)
publicRouter.get('/projects/:id/images/:imageId', async (req, res) => {
  const p = await Project.findOne({ _id: objectId(req.params.id), status: 'passed' }).select('showcase')
  const img = p?.showcase?.images.id(String(req.params.imageId))
  if (!p || !img) throw notFound('ไม่พบรูปภาพ')
  sendImage(res, p.id, img.storedName ?? '', 86_400)
})
