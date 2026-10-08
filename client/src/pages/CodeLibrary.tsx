import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, CodeXml, Copy, FolderOpen, SearchX, Settings2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Async, Badge, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { api, qs } from '../lib/api'
import { useMe } from '../lib/auth'
import { LANGUAGES, languageLabel, thaiDate } from '../lib/format'
import { useProject } from '../lib/queries'
import type { CodeItem, PageInfo } from '../lib/types'
import { SearchBox, useUrlFilters } from '../components/filters'
import { Pagination, toPage } from '../components/Pagination'

// แยกบรรทัด (ไม่นับบรรทัดว่างท้ายโค้ด)
const splitLines = (code: string) => code.replace(/\r?\n$/, '').split(/\r?\n/)

const PAGE_SIZE = 50

// หน้า "คลังซอร์สโค้ด" (แทน Code.aspx) แอดมินเห็นทั้งหมด คนอื่นเห็นโครงงานที่ผ่านแล้วและโครงงานของตัวเอง
export default function CodeLibrary() {
  const me = useMe()
  const [f, setF] = useUrlFilters(['q', 'lang', 'project', 'id', 'page'] as const)
  const page = toPage(f.page)
  const res = useQuery({
    queryKey: ['codes', { q: f.q, lang: f.lang, project: f.project, page }],
    queryFn: () => api.get<{ codes: CodeItem[] } & PageInfo>(`/codes${qs({ q: f.q, lang: f.lang, project: f.project, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })
  const project = useProject(f.project || undefined)
  const all = res.data?.codes ?? []
  const selected = all.find((c) => c.id === f.id) ?? all[0]
  const viewerRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // เปลี่ยนหน้า: เลื่อนรายการกลับขึ้นบนสุด (ถ้าหัวแถบรายการเลื่อนพ้นจอไปแล้วก็เลื่อนหน้าขึ้นมาด้วย)
  const goPage = (p: number) => {
    setF({ page: p > 1 ? String(p) : '', id: '' })
    listRef.current?.scrollTo({ top: 0 })
    const top = paneRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) window.scrollBy({ top: top - 80 })
  }

  const select = (id: string) => {
    setF({ id }, { keepPage: true })
    // จอเล็ก: เลื่อนลงไปที่ส่วนแสดงโค้ด
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  return (
    <>
      <PageHeader
        title="คลังซอร์สโค้ด"
        subtitle="ฟังก์ชันและโค้ดตัวอย่างจากโครงงานที่ผ่านแล้ว และโครงงานที่คุณเกี่ยวข้อง"
        actions={me.role === 'student' && <Link to="/my-projects" className="btn btn-primary"><Settings2 /> จัดการโค้ดของโครงงาน</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section ref={paneRef} className="panel flex min-w-0 flex-col overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)]">
          <div className="flex flex-col gap-2 border-b border-line p-4">
            <SearchBox value={f.q} onChange={(q) => setF({ q, id: '' })} placeholder="ค้นหาชื่อฟังก์ชัน โค้ด หรือชื่อโครงงาน" />
            <select className="input" value={f.lang} onChange={(e) => setF({ lang: e.target.value, id: '' })} aria-label="ภาษา">
              <option value="">ทุกภาษา</option>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            {f.project && (
              <div className="flex items-center gap-2 rounded-xl bg-accent/10 py-1.5 pr-1.5 pl-3 text-sm text-accent">
                <FolderOpen className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{project.data?.project.nameTh ?? 'โครงงานที่เลือก'}</span>
                <button
                  type="button"
                  className="rounded-lg p-1 hover:bg-accent/15"
                  onClick={() => setF({ project: '', id: '' })}
                  aria-label="ยกเลิกการกรองตามโครงงาน"
                  title="แสดงทุกโครงงาน"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
          <Async q={res}>
            {({ codes, total, pageSize }) => (
              <>
                <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted">
                  พบ {total.toLocaleString('th-TH')} รายการ
                  {res.isFetching && <Spinner className="size-3.5" />}
                </div>
                {total === 0 ? (
                  <Empty icon={SearchX} title="ไม่พบโค้ด">ลองเปลี่ยนคำค้นหรือภาษา</Empty>
                ) : (
                  <ul
                    ref={listRef}
                    className={cx('max-h-96 overflow-y-auto transition-opacity lg:max-h-none lg:min-h-0 lg:flex-1', res.isPlaceholderData && 'opacity-60')}
                  >
                    {codes.map((c) => {
                      const active = c.id === selected?.id
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => select(c.id)}
                            className={cx(
                              'block w-full border-b border-line px-4 py-3 text-left transition',
                              active ? 'bg-accent/10' : 'hover:bg-surface-2',
                            )}
                            aria-current={active || undefined}
                          >
                            <span className={cx('block truncate font-mono text-sm font-medium', active ? 'text-accent' : 'text-ink', !c.functionName && 'italic')}>
                              {c.functionName || '(ไม่มีชื่อ)'}
                            </span>
                            <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                              <Badge className="px-2 py-0">{languageLabel(c.language)}</Badge>
                              <span className="shrink-0">{splitLines(c.code).length} บรรทัด</span>
                            </span>
                            {c.project && <span className="mt-1 block truncate text-xs text-muted">{c.project.nameTh}</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Pagination compact className="shrink-0 border-t border-line px-3 py-2.5" page={page} pageSize={pageSize} total={total} onChange={goPage} />
              </>
            )}
          </Async>
        </section>

        <div ref={viewerRef} className="min-w-0 scroll-mt-20">
          {selected ? (
            <Viewer c={selected} />
          ) : (
            <div className="panel hidden lg:block">
              <Empty icon={CodeXml} title="ยังไม่มีโค้ดให้แสดง">เลือกรายการทางซ้ายเพื่อดูโค้ด</Empty>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Viewer({ c }: { c: CodeItem }) {
  const [copied, setCopied] = useState(false)
  const lines = splitLines(c.code)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.code)
      toast.success('คัดลอกโค้ดแล้ว')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง')
    }
  }

  return (
    <article className="panel overflow-hidden">
      <div className="panel-head">
        <div className="min-w-0">
          <h2 className={cx('panel-title truncate font-mono', !c.functionName && 'italic')}>{c.functionName || '(ไม่มีชื่อ)'}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <Badge tone="accent">{languageLabel(c.language)}</Badge>
            <span>{lines.length} บรรทัด</span>
            <span>
              แก้ไขล่าสุด {thaiDate(c.updatedAt, true)}
              {c.updatedBy?.name && ` โดย ${c.updatedBy.name}`}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
      {c.project && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-sm">
          <FolderOpen className="size-4 shrink-0 text-muted" />
          <span className="text-muted">โครงงาน:</span>
          <Link to={`/projects/${c.project.id}`} className="min-w-0 font-medium no-underline hover:underline">{c.project.nameTh}</Link>
        </div>
      )}
      <pre className="max-h-[70vh] overflow-auto bg-surface-2 py-3 font-mono text-[13px] leading-6 text-ink">
        <code className="block w-max min-w-full">
          {lines.map((line, i) => (
            <span key={i} className="flex">
              <span className="sticky left-0 w-12 shrink-0 bg-surface-2 pr-4 text-right text-muted select-none">{i + 1}</span>
              <span className="pr-5">{line || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
    </article>
  )
}
