import { Router } from 'express'
import { z } from 'zod'
import { projectFor } from '../lib/access.js'
import { me, requireAuth } from '../lib/auth.js'
import { badRequest, parse } from '../lib/http.js'
import { PROJECT_POPULATE, containsRe, projectDto } from '../lib/serialize.js'
import { Project, currentTerm } from '../models/Project.js'
import { CHAPTERS } from '../models/Submission.js'
import { User } from '../models/User.js'
import { getSettings, orderedTypes } from '../models/misc.js'

export const metaRouter = Router()
metaRouter.use(['/meta', '/users', '/teachers', '/projects'], requireAuth)

// ข้อมูลอ้างอิงที่หน้าเว็บใช้ร่วมกัน
metaRouter.get('/meta', async (_req, res) => {
  const types = await orderedTypes()
  const terms = await Project.distinct('term')
  res.json({
    types: types.map((t) => ({ id: t.id, name: t.name })),
    chapters: CHAPTERS,
    currentTerm: currentTerm(),
    terms: terms.sort().reverse(),
  })
})

// ค้นหาผู้ใช้เพื่อเลือกเป็นคู่โปรเจค/อาจารย์ (ไม่ส่งอีเมลและเบอร์โทรของคนที่ไม่เกี่ยวข้อง)
metaRouter.get('/users/search', async (req, res) => {
  const q = parse(z.object({ role: z.enum(['student', 'teacher']), q: z.string().default('') }), req.query)
  const filter: Record<string, unknown> = { role: q.role }
  if (q.q.trim()) {
    const re = containsRe(q.q)
    filter.$or = [{ name: re }, { email: re }, { studentId: re }, { username: re }]
  } else if (q.role === 'student') {
    res.json({ users: [] })
    return
  }
  const users = await User.find(filter).sort({ name: 1 }).limit(20)
  res.json({ users: users.map((u) => ({ id: u.id, name: u.name, studentId: u.studentId || undefined, email: u.email })) })
})

// รายชื่ออาจารย์ (หน้า "รายชื่ออาจารย์")
metaRouter.get('/teachers', async (_req, res) => {
  const teachers = await User.find({ role: 'teacher' }).sort({ name: 1 })
  res.json({ teachers: teachers.map((t) => ({ id: t.id, name: t.name, email: t.email, mobile: t.mobile })) })
})

// ข้อมูลสำหรับพิมพ์แบบฟอร์มยืนยันโครงงาน (เฉพาะโครงงานที่ผ่านครบแล้ว)
metaRouter.get('/projects/:id/print', async (req, res) => {
  const { p, r } = await projectFor(req.params.id, me(req), 'member')
  if (p.status !== 'passed') throw badRequest('พิมพ์แบบฟอร์มได้เมื่อโครงงานผ่านครบ 3/3 แล้ว')
  await p.populate(PROJECT_POPULATE)
  const s = await getSettings()
  res.json({ project: projectDto(p, r), settings: s.toObject() })
})
