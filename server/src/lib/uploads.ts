import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Response } from 'express'
import multer from 'multer'
import { config } from '../config.js'
import { badRequest } from './http.js'

// นามสกุลไฟล์ที่อนุญาต (เหมือนระบบเดิม) กันการอัปโหลดสคริปต์ขึ้นเซิร์ฟเวอร์
const ALLOWED = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip', '.rar', '.7z', '.jpg', '.jpeg', '.png', '.gif']

export const allowedExtensions = ALLOWED

// ไฟล์เก็บที่ uploads/<kind>/<projectId>/<สุ่ม>.<นามสกุล> ไม่เปิดให้ดาวน์โหลดตรง
export function storageDir(kind: 'submissions' | 'files', projectId: string) {
  const dir = path.join(config.uploadDir, kind, projectId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function uploader(kind: 'submissions' | 'files', maxFiles = 1) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => cb(null, storageDir(kind, String(req.params.id))),
      filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: config.maxUploadBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED.includes(path.extname(file.originalname).toLowerCase())) cb(null, true)
      else cb(badRequest(`ไม่รองรับไฟล์ประเภทนี้ (${path.extname(file.originalname) || 'ไม่มีนามสกุล'})`))
    },
  })
}

// busboy อ่านชื่อไฟล์เป็น latin1 ถ้าชื่อยังไม่มีอักขระเกิน 0xFF แปลว่ายังไม่ได้ถอดรหัส UTF-8
export function originalName(file: Express.Multer.File) {
  const name = file.originalname
  const decoded = /[^\u0000-ÿ]/.test(name) ? name : Buffer.from(name, 'latin1').toString('utf8')
  return path.basename(decoded).slice(0, 255)
}

export function removeStored(kind: 'submissions' | 'files', projectId: string, storedName: string) {
  fs.rm(path.join(config.uploadDir, kind, projectId, path.basename(storedName)), { force: true }, () => {})
}

// inline=true เปิดอ่านในเบราว์เซอร์ได้เฉพาะ PDF (ไฟล์ชนิดอื่นดาวน์โหลดเสมอ)
export function sendStored(res: Response, kind: 'submissions' | 'files', projectId: string, storedName: string, downloadName: string, inline = false) {
  const file = path.join(config.uploadDir, kind, projectId, path.basename(storedName))
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: 'ไม่พบไฟล์' })
    return
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (inline && path.extname(storedName).toLowerCase() === '.pdf') {
    // ตัวอ่าน PDF ของเบราว์เซอร์ทำงานไม่ได้ภายใต้ CSP ของหน้าเว็บ (object-src 'none')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    res.sendFile(file)
    return
  }
  res.download(file, downloadName)
}
