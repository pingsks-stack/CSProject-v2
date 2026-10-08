import type { Response } from 'express'

type Cell = string | number | null | undefined

// CSV ที่เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (ขึ้นต้นด้วย BOM) และกันสูตรอันตรายในข้อความ (CSV injection)
export function toCsv(headers: string[], rows: Cell[][]) {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function sendCsv(res: Response, fileName: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  res.send(csv)
}

const TZ = 'Asia/Bangkok'
export const csvDate = (d: Date | null | undefined, withTime = false) =>
  d ? d.toLocaleString('th-TH', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }) : ''
