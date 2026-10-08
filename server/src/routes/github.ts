import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { projectFor } from '../lib/access.js'
import { me, requireAuth } from '../lib/auth.js'
import { badRequest, parse } from '../lib/http.js'
import { fetchFile, fetchSnapshot, fetchTree, languageOf, parseRepo, syncByRepo, syncProject } from '../lib/github.js'
import { logActivity } from '../lib/notify.js'
import { githubDto } from '../lib/serialize.js'
import { Code } from '../models/misc.js'

// /api/projects/:id/github
export const projectGithubRouter = Router({ mergeParams: true })
projectGithubRouter.use(requireAuth)

const pid = (req: Request) => String((req.params as Record<string, string>).id)

projectGithubRouter.get('/', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'view')
  res.json({ github: p.github ? githubDto(p.github, true) : null })
})

// เชื่อม repository (ตรวจกับ GitHub ก่อนว่ามีอยู่จริงและเปิดสาธารณะ)
projectGithubRouter.put('/', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(pid(req), user, 'edit')
  const { url } = parse(z.object({ url: z.string().trim().min(1, 'กรุณาใส่ลิงก์ GitHub').max(300) }), req.body)
  const { owner, repo } = parseRepo(url)
  const snap = await fetchSnapshot(owner, repo).catch((e: Error) => {
    throw badRequest(e.message)
  })
  p.set('github', { owner, repo, linkedBy: user._id, linkedAt: new Date(), syncedAt: new Date(), error: '', ...snap })
  await p.save()
  await logActivity(p._id, 'github.link', user._id, `${owner}/${repo}`)
  res.json({ github: githubDto(p.github!, true) })
})

projectGithubRouter.delete('/', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(pid(req), user, 'edit')
  if (!p.github) throw badRequest('โครงงานนี้ยังไม่ได้เชื่อม GitHub')
  const name = `${p.github.owner}/${p.github.repo}`
  p.github = null
  await p.save()
  // ไฟล์โค้ดที่นำเข้าไว้ยังอยู่ แต่เลิกอัปเดตตาม GitHub (แก้ไขเองได้)
  await Code.updateMany({ project: p._id }, { githubPath: null })
  await logActivity(p._id, 'github.unlink', user._id, name)
  res.status(204).end()
})

projectGithubRouter.post('/sync', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(pid(req), user, 'member')
  const result = await syncProject(p, user._id)
  res.json({ ...result, github: githubDto(p.github!, true) })
})

projectGithubRouter.get('/tree', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'edit')
  if (!p.github) throw badRequest('โครงงานนี้ยังไม่ได้เชื่อม GitHub')
  const tree = await fetchTree(p.github.owner, p.github.repo, p.github.defaultBranch).catch((e: Error) => {
    throw badRequest(e.message)
  })
  const imported = new Set((await Code.find({ project: p._id, githubPath: { $ne: null } }).select('githubPath')).map((c) => c.githubPath))
  res.json({ ...tree, files: tree.files.map((f) => ({ ...f, imported: imported.has(f.path) })) })
})

// นำเข้าไฟล์จาก repository มาเป็นซอร์สโค้ดของโครงงาน (ครั้งละไม่เกิน 20 ไฟล์)
projectGithubRouter.post('/import', async (req, res) => {
  const user = me(req)
  const { p } = await projectFor(pid(req), user, 'edit')
  if (!p.github) throw badRequest('โครงงานนี้ยังไม่ได้เชื่อม GitHub')
  const { paths } = parse(z.object({ paths: z.array(z.string().min(1).max(500)).min(1, 'เลือกไฟล์อย่างน้อย 1 ไฟล์').max(20, 'นำเข้าได้ครั้งละไม่เกิน 20 ไฟล์') }), req.body)
  let count = 0
  for (const filePath of [...new Set(paths)]) {
    if (await Code.exists({ project: p._id, githubPath: filePath })) continue
    const code = await fetchFile(p.github.owner, p.github.repo, filePath, p.github.defaultBranch).catch((e: Error) => {
      throw badRequest(e.message)
    })
    if (!code.trim()) continue
    await Code.create({ project: p._id, language: languageOf(filePath), functionName: filePath.slice(0, 100), code, githubPath: filePath, updatedBy: user._id })
    await logActivity(p._id, 'code.add', user._id, `${filePath} (จาก GitHub)`)
    count++
  }
  res.status(201).json({ count })
})

// ===================== webhook จาก GitHub (ไม่ต้องล็อกอิน แต่ต้องมีลายเซ็นที่ถูกต้อง) =====================
// ต้องได้ body ดิบ (Buffer) เพื่อตรวจลายเซ็น จึงติดตั้งก่อน express.json ใน app.ts
export async function githubWebhook(req: Request, res: Response) {
  if (!config.githubWebhookSecret) {
    res.status(404).json({ error: 'ยังไม่ได้เปิดใช้ webhook' })
    return
  }
  const body = req.body as Buffer
  const sig = String(req.headers['x-hub-signature-256'] ?? '')
  const expected = 'sha256=' + crypto.createHmac('sha256', config.githubWebhookSecret).update(body).digest('hex')
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    res.status(401).json({ error: 'ลายเซ็นไม่ถูกต้อง' })
    return
  }
  const event = req.headers['x-github-event']
  if (event === 'ping') {
    res.json({ ok: true })
    return
  }
  if (event !== 'push') {
    res.status(202).json({ ignored: event })
    return
  }
  let fullName = ''
  try {
    fullName = JSON.parse(body.toString('utf8'))?.repository?.full_name ?? ''
  } catch {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' })
    return
  }
  // ตอบ GitHub ทันที แล้วค่อยซิงค์ (GitHub รอคำตอบไม่เกิน 10 วินาที)
  res.status(202).json({ ok: true })
  syncByRepo(fullName).catch((e) => console.error('[github] sync failed', e))
}
