import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BookOpen, CodeXml, GitBranch, Library, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { SearchBox, useUrlFilters } from '../../components/filters'
import { Pagination } from '../../components/Pagination'
import { PublicLayout } from '../../components/PublicLayout'
import { Async, Badge, Empty, cx } from '../../components/ui'
import { api, qs } from '../../lib/api'
import type { PageInfo, PublicProject } from '../../lib/types'

const FILTERS = ['q', 'type', 'term', 'page'] as const

// คลังโครงงานสาธารณะ: รุ่นน้องดูโครงงานที่ผ่านแล้วของรุ่นพี่ได้โดยไม่ต้องล็อกอิน
export default function Showcase() {
  const [f, set] = useUrlFilters(FILTERS)
  const top = useRef<HTMLDivElement>(null)
  const page = Math.max(1, Number.parseInt(f.page, 10) || 1)
  const meta = useQuery({
    queryKey: ['public', 'meta'],
    queryFn: () => api.get<{ types: { id: string; name: string }[]; terms: string[]; total: number }>('/public/meta'),
    staleTime: 5 * 60_000,
  })
  const params = { q: f.q, type: f.type, term: f.term, page: page > 1 ? page : undefined }
  const list = useQuery({
    queryKey: ['public', 'projects', params],
    queryFn: () => api.get<{ projects: PublicProject[] } & PageInfo>(`/public/projects${qs(params)}`),
    placeholderData: keepPreviousData,
  })
  const filtered = !!(f.q || f.type || f.term)
  // เปลี่ยนตัวกรอง = กลับไปหน้า 1
  const filter = (patch: Partial<Record<'q' | 'type' | 'term', string>>) => set({ ...patch, page: '' })
  const goPage = (p: number) => {
    set({ page: p > 1 ? String(p) : '' })
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <PublicLayout>
      <section className="mb-8 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative px-6 py-10 sm:px-10">
          <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-accent/10" />
          <div className="pointer-events-none absolute -bottom-28 right-40 size-56 rounded-full bg-gold/10" />
          <Badge tone="gold" className="relative mb-3"><Library className="size-3.5" /> ผลงานรุ่นพี่</Badge>
          <h1 className="relative text-3xl leading-tight sm:text-4xl">คลังโครงงานวิทยาการคอมพิวเตอร์</h1>
          <p className="relative mt-2 max-w-2xl text-muted">
            โครงงานที่ผ่านการพิจารณาแล้ว{meta.data ? ` ${meta.data.total} โครงงาน` : ''} — ดูไอเดีย เล่มรายงาน ซอร์สโค้ด และงานบน GitHub
            ของรุ่นพี่ เพื่อเป็นแนวทางทำโครงงานของคุณ
          </p>
          <div className="relative mt-6 flex flex-col gap-2 sm:flex-row">
            <SearchBox value={f.q} onChange={(v) => filter({ q: v })} placeholder="ค้นหาชื่อโครงงาน คำสำคัญ ชื่อรุ่นพี่ หรืออาจารย์" className="flex-1" />
            <select className="input sm:w-48" value={f.type} onChange={(e) => filter({ type: e.target.value })} aria-label="ประเภทโครงงาน">
              <option value="">ทุกประเภท</option>
              {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="input sm:w-44" value={f.term} onChange={(e) => filter({ term: e.target.value })} aria-label="ปีการศึกษา">
              <option value="">ทุกปีการศึกษา</option>
              {meta.data?.terms.map((t) => <option key={t} value={t}>ปีการศึกษา {t}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div ref={top} className="scroll-mt-20" />
      <Async q={list}>
        {({ projects, total, page: current, pageSize }) => {
          const from = (current - 1) * pageSize + 1
          return (
            <>
              <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted">
                <span>
                  {filtered ? `พบ ${total} โครงงาน` : `ทั้งหมด ${total} โครงงาน`}
                  {projects.length > 0 && total > pageSize && ` · แสดง ${from}–${from + projects.length - 1}`}
                </span>
                {filtered && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => filter({ q: '', type: '', term: '' })}><X /> ล้างตัวกรอง</button>
                )}
              </div>
              {projects.length === 0 ? (
                <div className="panel">
                  {total > 0 ? (
                    <Empty icon={Library} title="ไม่มีโครงงานในหน้านี้">
                      <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => goPage(1)}>กลับไปหน้าแรก</button>
                    </Empty>
                  ) : (
                    <Empty icon={Library} title={filtered ? 'ไม่พบโครงงานที่ค้นหา' : 'ยังไม่มีโครงงานในคลัง'} />
                  )}
                </div>
              ) : (
                <div className={cx('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', list.isFetching && 'opacity-70')}>
                  {projects.map((p) => <ProjectCard key={p.id} p={p} />)}
                </div>
              )}
              <Pagination page={current} pageSize={pageSize} total={total} onChange={goPage} />
            </>
          )
        }}
      </Async>
    </PublicLayout>
  )
}

// อักษรย่อจากชื่อภาษาอังกฤษ (ข้ามคำเชื่อม) ใช้บนภาพปกสำรอง
const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'using', 'by', 'via'])
function monogram(p: PublicProject) {
  const words = p.nameEn.split(/[^A-Za-z0-9]+/).filter((w) => w && !STOP.has(w.toLowerCase()))
  if (words.length) return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  return p.nameTh.replace(/^[เแโใไ]/, '').slice(0, 1) || '?'
}

function Cover({ p }: { p: PublicProject }) {
  const [broken, setBroken] = useState(false)
  if (p.coverImage && !broken) {
    return (
      <div className="aspect-video overflow-hidden border-b border-line bg-surface-2">
        <img
          src={`/api/public/projects/${p.id}/images/${p.coverImage}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
    )
  }
  return (
    <div aria-hidden className="relative flex aspect-video flex-col items-center justify-center gap-1 overflow-hidden border-b border-line bg-linear-to-br from-accent/20 via-accent/5 to-gold/15">
      <span className="absolute -top-12 -right-10 size-36 rounded-full bg-accent/10 transition duration-500 group-hover:scale-110" />
      <span className="absolute -bottom-14 -left-8 size-32 rounded-full bg-gold/10 transition duration-500 group-hover:scale-110" />
      <span className="relative text-4xl font-semibold tracking-tight text-accent/80">{monogram(p)}</span>
      <span className="relative max-w-[80%] truncate text-xs font-medium text-accent/70">{p.type?.name ?? 'โครงงาน'}</span>
    </div>
  )
}

function ProjectCard({ p }: { p: PublicProject }) {
  const keywords = p.keywords ?? []
  return (
    <Link to={`/showcase/${p.id}`} className="panel group flex flex-col overflow-hidden no-underline transition hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5">
      <Cover p={p} />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge tone="accent">{p.type?.name ?? 'ไม่ระบุประเภท'}</Badge>
          <Badge>ปีการศึกษา {p.term}</Badge>
        </div>
        <h2 className="line-clamp-2 text-base leading-snug group-hover:text-accent">{p.nameTh}</h2>
        <p className="mt-1 line-clamp-1 text-sm text-muted">{p.nameEn}</p>
        {p.abstract && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink/80">{p.abstract}</p>}
        {keywords.length > 0 && (
          <ul className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="คำสำคัญ">
            {keywords.slice(0, 3).map((k) => (
              <li key={k} className="max-w-full truncate rounded-full border border-line px-2 py-0.5 text-xs text-muted">{k}</li>
            ))}
            {keywords.length > 3 && <li className="text-xs text-muted">+{keywords.length - 3}</li>}
          </ul>
        )}
        <dl className="mt-4 flex flex-col gap-1 text-sm">
          <div className="flex gap-2"><dt className="shrink-0 text-muted">ผู้จัดทำ</dt><dd className="min-w-0 text-ink">{p.students.join(', ')}</dd></div>
          {p.advisor && <div className="flex gap-2"><dt className="shrink-0 text-muted">ที่ปรึกษา</dt><dd className="min-w-0 truncate text-ink">{p.advisor}</dd></div>}
        </dl>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {p.hasBook && <Badge tone="ok"><BookOpen className="size-3.5" /> เล่มสมบูรณ์</Badge>}
          {p.github && <Badge tone="info"><GitBranch className="size-3.5" /> GitHub{p.github.languages.length ? ` · ${p.github.languages.slice(0, 2).join(', ')}` : ''}</Badge>}
          {!!p.codeCount && <Badge><CodeXml className="size-3.5" /> {p.codeCount} ฟังก์ชัน</Badge>}
        </div>
      </div>
    </Link>
  )
}
