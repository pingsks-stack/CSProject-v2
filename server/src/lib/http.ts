import type { ErrorRequestHandler } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'

// error ที่ตั้งใจส่งกลับให้ผู้ใช้ (ข้อความภาษาไทยแสดงบนหน้าเว็บได้เลย)
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg)
export const forbidden = (msg = 'ไม่มีสิทธิ์ทำรายการนี้') => new HttpError(403, msg)
export const notFound = (msg = 'ไม่พบข้อมูล') => new HttpError(404, msg)

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) throw badRequest(r.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
  return r.data
}

export function objectId(id: unknown) {
  if (id instanceof mongoose.Types.ObjectId) return id
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw notFound()
  return new mongoose.Types.ObjectId(id)
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'ไฟล์ใหญ่เกินกำหนด' })
    return
  }
  if (err?.code === 11000) {
    res.status(409).json({ error: 'ข้อมูลนี้มีอยู่แล้ว' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' })
}
