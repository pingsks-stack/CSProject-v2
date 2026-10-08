import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cx } from './ui'

const SERIES_COLORS = ['var(--viz-1)', 'var(--viz-2)']

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

// ช่วงห่างของแกนที่อ่านง่าย (1, 2, 5 × 10^n) แบ่งประมาณ 4 ช่อง
function niceTicks(max: number) {
  const raw = Math.max(1, max / 4)
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p
  const top = Math.max(step, Math.ceil(max / step) * step)
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
}

const fmt = (n: number) => n.toLocaleString('th-TH')

function TableView({ labels, series }: { labels: string[]; series: { name: string; data: number[] }[] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-muted hover:text-accent">ดูเป็นตาราง</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>เดือน</th>
              {series.map((s) => <th key={s.name} className="text-right">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}>
                <td>{l}</td>
                {series.map((s) => <td key={s.name} className="text-right tabular-nums">{fmt(s.data[i])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// กราฟเส้นตามเวลา (สูงสุด 2 ชุดข้อมูล) มีเส้นนำสายตา + tooltip ตามตำแหน่งเมาส์/ปุ่มลูกศร
export function LineChart({ labels, series, height = 220 }: { labels: string[]; series: { name: string; data: number[] }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { top: 16, right: 40, bottom: 28, left: 36 }
  const w = Math.max(width, 240)
  const innerW = w - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const ticks = niceTicks(Math.max(0, ...series.flatMap((s) => s.data)))
  const max = ticks[ticks.length - 1]
  const n = labels.length
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number) => pad.top + innerH - (v / max) * innerH
  const labelEvery = innerW / n < 38 ? 2 : 1

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1))
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1))
  }

  // ป้ายค่าที่ปลายเส้น: ถ้าซ้อนกันเกินไปแสดงเฉพาะชุดแรก (ค่าที่เหลือดูใน tooltip/ตาราง)
  const ends = series.map((s) => y(s.data[n - 1] ?? 0))
  const showEnd = series.map((_, i) => i === 0 || Math.abs(ends[i] - ends[0]) >= 14)

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES_COLORS[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={w}
            height={height}
            role="img"
            aria-label={series.map((s) => s.name).join(', ')}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">{fmt(t)}</text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % labelEvery === (n - 1) % labelEvery ? (
                <text key={l} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">{l}</text>
              ) : null,
            )}
            {series.map((s, si) => (
              <g key={s.name}>
                {series.length === 1 && (
                  <path
                    d={`M${x(0)},${y(0)} ${s.data.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)} Z`}
                    fill={SERIES_COLORS[si]}
                    opacity={0.1}
                  />
                )}
                <polyline
                  points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                  fill="none"
                  stroke={SERIES_COLORS[si]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx={x(n - 1)} cy={y(s.data[n - 1] ?? 0)} r={4} fill={SERIES_COLORS[si]} stroke="rgb(var(--c-surface))" strokeWidth={2} />
                {showEnd[si] && (
                  <text x={x(n - 1) + 8} y={y(s.data[n - 1] ?? 0)} dy="0.32em" className="fill-ink text-[11px] font-medium tabular-nums">
                    {fmt(s.data[n - 1] ?? 0)}
                  </text>
                )}
              </g>
            ))}
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--viz-axis)" strokeWidth={1} />
                {series.map((s, si) => (
                  <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r={4} fill={SERIES_COLORS[si]} stroke="rgb(var(--c-surface))" strokeWidth={2} />
                ))}
              </g>
            )}
            <rect
              x={pad.left}
              y={pad.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(hover) - 72, 0), Math.max(0, w - 160)), top: 0 }}
          >
            <div className="mb-1 text-muted">{labels[hover]}</div>
            {series.map((s, si) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[si] }} />
                <span className="font-semibold text-ink tabular-nums">{fmt(s.data[hover])}</span>
                <span className="text-muted">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <TableView labels={labels} series={series} />
    </div>
  )
}

// กราฟแท่งแนวนอนชุดเดียว (เทียบจำนวน) ค่าอยู่ที่ปลายแท่ง
export function BarList({ items, unit = '' }: { items: { label: string; value: number; muted?: boolean }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const [active, setActive] = useState<number | null>(null)
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li
          key={it.label}
          tabIndex={0}
          onPointerEnter={() => setActive(i)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
          title={`${it.label}: ${fmt(it.value)}${unit}`}
          className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className={cx('truncate text-sm', it.muted ? 'text-muted' : 'text-ink')}>{it.label}</span>
          <span className="flex items-center gap-2">
            <span
              className={cx('h-3.5 rounded-r transition', active === i && 'brightness-110')}
              style={{
                width: `${(it.value / max) * 85}%`,
                minWidth: it.value > 0 ? 4 : 0,
                background: it.muted ? 'var(--viz-axis)' : 'rgb(var(--c-accent))',
              }}
            />
            <span className="text-xs font-medium text-ink tabular-nums">{fmt(it.value)}{unit}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
