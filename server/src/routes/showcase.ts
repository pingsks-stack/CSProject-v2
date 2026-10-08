import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { loadProject, projectFor } from '../lib/access.js'
import { me, requireAuth } from '../lib/auth.js'
import { badRequest, notFound, parse } from '../lib/http.js'
import { showcaseDto } from '../lib/serialize.js'
import { imageUploader, originalName, removeStored, sendImage } from '../lib/uploads.js'

// /api/projects/:id/showcase — ข้อมูลแนะนำโครงงานสำหรับคลังโครงงาน (บทคัดย่อ คำสำคัญ ลิงก์ ภาพหน้าจอ)
export const projectShowcaseRouter = Router({ mergeParams: true })
projectShowcaseRouter.use(requireAuth)

const pid = (req: Request) => String((req.params as Record<string, string>).id)
const MAX_IMAGES = 6
const url = z.union([z.literal(''), z.string().trim().max(500).url('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://').refine((u) => /^https?:\/\//i.test(u), 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')])

projectShowcaseRouter.put('/', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'edit')
  const body = parse(
    z.object({
      abstract: z.string().trim().max(3000, 'บทคัดย่อยาวเกิน 3,000 ตัวอักษร'),
      keywords: z.array(z.string().trim().min(1).max(40, 'คำสำคัญแต่ละคำไม่เกิน 40 ตัวอักษร')).max(10, 'คำสำคัญไม่เกิน 10 คำ'),
      demoUrl: url,
      videoUrl: url,
    }),
    req.body,
  )
  p.set('showcase.abstract', body.abstract)
  p.set('showcase.keywords', [...new Set(body.keywords)])
  p.set('showcase.demoUrl', body.demoUrl)
  p.set('showcase.videoUrl', body.videoUrl)
  await p.save()
  res.json({ showcase: showcaseDto(p) })
})

// ตรวจสิทธิ์และจำนวนรูปก่อนให้ multer เขียนไฟล์
async function guard(req: Request, _res: Response, next: NextFunction) {
  const { p } = await projectFor(pid(req), me(req), 'edit')
  if ((p.showcase?.images.length ?? 0) >= MAX_IMAGES) throw badRequest(`ใส่รูปได้ไม่เกิน ${MAX_IMAGES} รูป`)
  next()
}

projectShowcaseRouter.post('/images', guard, imageUploader().array('images', MAX_IMAGES), async (req, res) => {
  const p = await loadProject(pid(req))
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length === 0) throw badRequest('ยังไม่ได้เลือกรูป')
  const room = MAX_IMAGES - (p.showcase?.images.length ?? 0)
  const accepted = files.slice(0, room)
  for (const f of files.slice(room)) removeStored('images', p.id, f.filename)
  p.showcase!.images.push(...accepted.map((f) => ({ fileName: originalName(f), storedName: f.filename, size: f.size })))
  await p.save()
  res.status(201).json({ showcase: showcaseDto(p), skipped: files.length - accepted.length })
})

projectShowcaseRouter.delete('/images/:imageId', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'edit')
  const img = p.showcase?.images.id(String(req.params.imageId))
  if (!img) throw notFound('ไม่พบรูปภาพ')
  removeStored('images', p.id, img.storedName ?? '')
  p.showcase!.images.pull(img._id)
  await p.save()
  res.json({ showcase: showcaseDto(p) })
})

// ตั้งเป็นภาพปก = ย้ายไปไว้ลำดับแรก
projectShowcaseRouter.post('/images/:imageId/cover', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'edit')
  const images = p.showcase?.images
  const img = images?.id(String(req.params.imageId))
  if (!images || !img) throw notFound('ไม่พบรูปภาพ')
  const plain = img.toObject()
  images.pull(img._id)
  images.unshift(plain)
  await p.save()
  res.json({ showcase: showcaseDto(p) })
})

// ดูรูป (สมาชิก/แอดมิน หรือทุกคนที่ล็อกอินเมื่อโครงงานผ่านแล้ว) ส่วนคนที่ไม่ได้ล็อกอินใช้ /api/public/projects/:id/images/:imageId
projectShowcaseRouter.get('/images/:imageId', async (req, res) => {
  const { p } = await projectFor(pid(req), me(req), 'view')
  const img = p.showcase?.images.id(String(req.params.imageId))
  if (!img) throw notFound('ไม่พบรูปภาพ')
  sendImage(res, p.id, img.storedName ?? '')
})
