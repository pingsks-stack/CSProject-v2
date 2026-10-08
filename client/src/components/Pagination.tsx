import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import { cx } from './ui'

// ===================== แบ่งหน้า (ใช้กับรายการที่ server แบ่งหน้าให้: page เริ่มที่ 1) =====================

// ค่า ?page= ในลิงก์ → เลขหน้า (ค่าผิดรูปแบบถือเป็นหน้า 1)
export function toPage(v: string | null | undefined) {
  const n = Number(v)
  return Number.isInteger(n) && n > 1 ? n : 1
}

// เลื่อนกลับขึ้นบนสุดหลังเปลี่ยนหน้า (ผู้ที่ตั้งค่าลดการเคลื่อนไหวจะเลื่อนทันที)
export function scrollToTop() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

// เลขหน้าแบบย่อ เช่น 1 … 4 5 6 … 20 (null = …) จำนวนช่องคงที่ ปุ่มจะได้ไม่กระโดดไปมา
function pageItems(page: number, last: number, siblings: number): (number | null)[] {
  if (last <= siblings * 2 + 5) return range(1, last)
  const start = Math.max(Math.min(page - siblings, last - siblings * 2 - 2), 3)
  const end = Math.min(Math.max(page + siblings, siblings * 2 + 3), last - 2)
  return [1, start > 3 ? null : 2, ...range(start, end), end < last - 2 ? null : last - 1, last]
}

export function Pagination({ page, pageSize, total, onChange, compact, className }: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  // พื้นที่แคบ (เช่นแถบรายการด้านข้าง): ปุ่มเล็กลงและแสดงเลขหน้าน้อยลง
  compact?: boolean
  className?: string
}) {
  const last = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))

  // หน้าเกินจำนวนที่มี (เช่นลบรายการสุดท้ายของหน้าสุดท้าย หรือเปิดลิงก์เก่า) → ไปหน้าสุดท้าย
  useEffect(() => {
    if (page > last) onChange(last)
  }, [page, last, onChange])

  if (last <= 1) return null

  const cur = Math.min(page, last)
  const from = (cur - 1) * pageSize + 1
  const to = Math.min(cur * pageSize, total)
  const n = (v: number) => v.toLocaleString('th-TH')
  const size = compact ? 'h-8 min-w-8' : 'h-9 min-w-9'
  const arrow = cx('btn btn-ghost px-2', size, !compact && 'sm:px-3')

  return (
    <nav aria-label="แบ่งหน้า" className={cx('flex flex-wrap items-center gap-x-4 gap-y-2', compact ? 'justify-center' : 'justify-between', className)}>
      <p className={cx('text-muted', compact ? 'w-full text-center text-xs' : 'text-sm')}>
        แสดง {n(from)}–{n(to)} จาก {n(total)} รายการ
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className={arrow} disabled={cur <= 1} onClick={() => onChange(cur - 1)} aria-label="หน้าก่อนหน้า">
          <ChevronLeft />
          {!compact && <span className="hidden sm:inline">ก่อนหน้า</span>}
        </button>

        {/* จอเล็กแสดงแค่ "หน้า x / y" ปุ่มเลขหน้าจะได้ไม่ล้นจอ */}
        {!compact && (
          <span className="px-2 text-sm whitespace-nowrap text-muted sm:hidden">
            หน้า <span className="font-medium text-ink">{n(cur)}</span> / {n(last)}
          </span>
        )}
        <ul className={cx('items-center gap-1', compact ? 'flex' : 'hidden sm:flex')}>
          {pageItems(cur, last, compact ? 0 : 1).map((p, i) =>
            p === null ? (
              <li key={`gap-${i}`} aria-hidden className="w-5 text-center text-sm text-muted select-none">…</li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => p !== cur && onChange(p)}
                  aria-label={`หน้า ${p}`}
                  aria-current={p === cur ? 'page' : undefined}
                  className={cx(
                    'inline-flex cursor-pointer items-center justify-center rounded-xl px-2 text-sm tabular-nums transition',
                    size,
                    p === cur ? 'bg-accent font-semibold text-accent-ink' : 'text-ink hover:bg-surface-2',
                  )}
                >
                  {n(p)}
                </button>
              </li>
            ),
          )}
        </ul>

        <button type="button" className={arrow} disabled={cur >= last} onClick={() => onChange(cur + 1)} aria-label="หน้าถัดไป">
          {!compact && <span className="hidden sm:inline">ถัดไป</span>}
          <ChevronRight />
        </button>
      </div>
    </nav>
  )
}
