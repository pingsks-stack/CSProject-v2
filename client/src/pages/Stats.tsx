import { useQuery } from '@tanstack/react-query'
import { ChartPie, FolderKanban, Tags, Trophy } from 'lucide-react'
import { Async, Empty, Kpi, PageHeader, cx } from '../components/ui'
import { api } from '../lib/api'
import type { TypeCount } from '../lib/types'

// หน้า "สถิติตามประเภท" จำนวนโครงงานแยกตามประเภท (แทน dashboard_Project.aspx)
export default function Stats() {
  const q = useQuery({ queryKey: ['stats', 'types'], queryFn: () => api.get<{ types: TypeCount[] }>('/stats/types') })
  return (
    <>
      <PageHeader title="สถิติตามประเภท" subtitle="จำนวนโครงงานทั้งหมดในระบบ แยกตามประเภทโครงงาน" />
      <Async q={q}>
        {({ types }) => {
          const total = types.reduce((s, t) => s + t.count, 0)
          const top = types.reduce<TypeCount | null>((a, t) => (t.count > (a?.count ?? 0) ? t : a), null)
          const pct = (n: number) => (total ? Math.round((n * 100) / total) : 0)
          if (types.length === 0) {
            return <div className="panel"><Empty icon={ChartPie} title="ยังไม่มีประเภทโครงงาน" /></div>
          }
          return (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Kpi icon={FolderKanban} label="โครงงานทั้งหมด" value={total.toLocaleString('th-TH')} />
                <Kpi icon={Tags} tone="info" label="จำนวนประเภท" value={types.filter((t) => t.id !== 'none').length} />
                <Kpi
                  icon={Trophy}
                  tone="gold"
                  label="ประเภทที่มีมากที่สุด"
                  value={<span className="block truncate text-lg">{top?.name ?? '-'}</span>}
                  note={top ? `${top.count} โครงงาน (${pct(top.count)}%)` : undefined}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {types.map((t) => (
                  <div key={t.id} className="panel p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={cx('truncate font-medium', t.id === 'none' ? 'text-muted' : 'text-ink')}>{t.name}</div>
                        <div className="text-sm text-muted">{t.count.toLocaleString('th-TH')} โครงงาน</div>
                      </div>
                      <div className="text-2xl font-semibold leading-none text-accent">{pct(t.count)}%</div>
                    </div>
                    <div
                      className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2"
                      role="progressbar"
                      aria-valuenow={pct(t.count)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t.name}
                    >
                      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct(t.count)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        }}
      </Async>
    </>
  )
}
