import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BookOpen, CodeXml, GitBranch, Library, X } from 'lucide-react'
import { Link } from 'react-router'
import { SearchBox, useUrlFilters } from '../../components/filters'
import { PublicLayout } from '../../components/PublicLayout'
import { Async, Badge, Empty, cx } from '../../components/ui'
import { api, qs } from '../../lib/api'
import type { PublicProject } from '../../lib/types'

const FILTERS = ['q', 'type', 'term'] as const

// คลังโครงงานสาธารณะ: รุ่นน้องดูโครงงานที่ผ่านแล้วของรุ่นพี่ได้โดยไม่ต้องล็อกอิน
export default function Showcase() {
  const [f, set] = useUrlFilters(FILTERS)
  const meta = useQuery({
    queryKey: ['public', 'meta'],
    queryFn: () => api.get<{ types: { id: string; name: string }[]; terms: string[]; total: number }>('/public/meta'),
    staleTime: 5 * 60_000,
  })
  const list = useQuery({
    queryKey: ['public', 'projects', f],
    queryFn: () => api.get<{ projects: PublicProject[] }>(`/public/projects${qs(f)}`),
    placeholderData: keepPreviousData,
  })
  const filtered = !!(f.q || f.type || f.term)

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
            <SearchBox value={f.q} onChange={(v) => set({ q: v })} placeholder="ค้นหาชื่อโครงงาน ชื่อรุ่นพี่ หรืออาจารย์" className="flex-1" />
            <select className="input sm:w-48" value={f.type} onChange={(e) => set({ type: e.target.value })} aria-label="ประเภทโครงงาน">
              <option value="">ทุกประเภท</option>
              {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="input sm:w-44" value={f.term} onChange={(e) => set({ term: e.target.value })} aria-label="ปีการศึกษา">
              <option value="">ทุกปีการศึกษา</option>
              {meta.data?.terms.map((t) => <option key={t} value={t}>ปีการศึกษา {t}</option>)}
            </select>
          </div>
        </div>
      </section>

      <Async q={list}>
        {({ projects }) => (
          <>
            <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted">
              <span>{filtered ? `พบ ${projects.length} โครงงาน` : `ทั้งหมด ${projects.length} โครงงาน`}</span>
              {filtered && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ q: '', type: '', term: '' })}><X /> ล้างตัวกรอง</button>
              )}
            </div>
            {projects.length === 0 ? (
              <div className="panel"><Empty icon={Library} title={filtered ? 'ไม่พบโครงงานที่ค้นหา' : 'ยังไม่มีโครงงานในคลัง'} /></div>
            ) : (
              <div className={cx('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', list.isFetching && 'opacity-70')}>
                {projects.map((p) => <ProjectCard key={p.id} p={p} />)}
              </div>
            )}
          </>
        )}
      </Async>
    </PublicLayout>
  )
}

function ProjectCard({ p }: { p: PublicProject }) {
  return (
    <Link to={`/showcase/${p.id}`} className="panel group flex flex-col p-5 no-underline transition hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone="accent">{p.type?.name ?? 'ไม่ระบุประเภท'}</Badge>
        <Badge>ปีการศึกษา {p.term}</Badge>
      </div>
      <h2 className="line-clamp-2 text-base leading-snug group-hover:text-accent">{p.nameTh}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{p.nameEn}</p>
      <dl className="mt-4 flex flex-col gap-1 text-sm">
        <div className="flex gap-2"><dt className="shrink-0 text-muted">ผู้จัดทำ</dt><dd className="min-w-0 text-ink">{p.students.join(', ')}</dd></div>
        {p.advisor && <div className="flex gap-2"><dt className="shrink-0 text-muted">ที่ปรึกษา</dt><dd className="min-w-0 truncate text-ink">{p.advisor}</dd></div>}
      </dl>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        {p.hasBook && <Badge tone="ok"><BookOpen className="size-3.5" /> เล่มสมบูรณ์</Badge>}
        {p.github && <Badge tone="info"><GitBranch className="size-3.5" /> GitHub{p.github.languages.length ? ` · ${p.github.languages.slice(0, 2).join(', ')}` : ''}</Badge>}
        {!!p.codeCount && <Badge><CodeXml className="size-3.5" /> {p.codeCount} ฟังก์ชัน</Badge>}
      </div>
    </Link>
  )
}
