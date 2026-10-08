import { Search as SearchIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Project } from '../lib/types'
import { cx } from './ui'

// ตัวกรองและช่องค้นหาที่ใช้ร่วมกันในหน้าค้นหา คลังโครงงาน และคลังซอร์สโค้ด

// ตัวกรองเก็บใน URL (?q=&type=…) เพื่อแชร์ลิงก์และกดย้อนกลับได้
// เปลี่ยนค่าอื่นเมื่อไร ?page= จะถูกล้าง (กลับไปหน้า 1) เว้นแต่ส่ง page มาด้วย หรือสั่ง keepPage (เช่นแค่เลือกรายการ)
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>
  const set = (patch: Partial<Record<K, string>>, opts: { keepPage?: boolean } = {}) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        let changed = false
        for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
          if (k !== 'page' && (prev.get(k) ?? '') !== (v ?? '')) changed = true
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (changed && !opts.keepPage && !('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )
  return [values, set] as const
}

// ช่องค้นหาที่อัปเดต URL เมื่อหยุดพิมพ์ครู่หนึ่ง (กด Enter = ค้นหาทันที)
export function SearchBox({ value, onChange, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  const [text, setText] = useState(value)
  const pushed = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // ค่าใน URL เปลี่ยนจากที่อื่น (เช่นช่องค้นหาด้านบน หรือปุ่มล้างตัวกรอง)
  useEffect(() => {
    if (value !== pushed.current) {
      pushed.current = value
      setText(value)
    }
  }, [value])

  const push = (v: string) => {
    pushed.current = v
    onChangeRef.current(v)
  }

  useEffect(() => {
    const v = text.trim()
    if (v === pushed.current) return
    const t = setTimeout(() => push(v), 350)
    return () => clearTimeout(t)
  }, [text])

  return (
    <form
      role="search"
      className={cx('relative', className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim() !== pushed.current) push(text.trim())
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input className="input pr-9 pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {text && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-muted hover:bg-line/60 hover:text-ink"
          onClick={() => { setText(''); push('') }}
          aria-label="ล้างคำค้น"
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  )
}

export const studentNames = (p: Project) =>
  p.members.filter((m) => m.kind === 'student').map((m) => m.user.name)

export const advisorName = (p: Project) =>
  p.members.find((m) => m.kind === 'teacher' && m.teacherRole === 'advisor')?.user.name
