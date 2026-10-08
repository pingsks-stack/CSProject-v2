import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CodeXml, FileText, Globe, GraduationCap, Library as LibraryIcon, SearchX, Users, X } from 'lucide-react'
import { Link } from 'react-router'
import { Async, Badge, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { api, qs } from '../lib/api'
import { useMeta } from '../lib/queries'
import type { PageInfo, Project } from '../lib/types'
import { SearchBox, advisorName, studentNames, useUrlFilters } from '../components/filters'
import { Pagination, scrollToTop, toPage } from '../components/Pagination'

const CLASS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8]
// การ์ดเรียง 2–3 คอลัมน์ 24 ใบจึงเต็มแถวพอดี
const PAGE_SIZE = 24

// หน้า "คลังโครงงาน" โครงงานที่ผ่านครบ 3/3 (แทน Doc_All.aspx)
export default function Library() {
  const meta = useMeta()
  const [f, setF] = useUrlFilters(['q', 'type', 'term', 'classLevel', 'page'] as const)
  const page = toPage(f.page)
  const res = useQuery({
    queryKey: ['projects', 'library', { ...f, page }],
    queryFn: () => api.get<{ projects: Project[] } & PageInfo>(`/projects${qs({ scope: 'library', ...f, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })
  const filtered = !!(f.q || f.type || f.term || f.classLevel)
  const goPage = (p: number) => {
    setF({ page: p > 1 ? String(p) : '' })
    scrollToTop()
  }

  return (
    <>
      <PageHeader
        title="คลังโครงงาน"
        subtitle="โครงงานที่ผ่านการพิจารณาจากอาจารย์ครบ 3/3 แล้ว ใช้เป็นแนวทางและอ้างอิงได้"
        actions={
          <>
            <Link to="/code" className="btn btn-ghost"><CodeXml /> คลังซอร์สโค้ด</Link>
            <Link to="/showcase" className="btn btn-primary"><Globe /> หน้าสาธารณะสำหรับรุ่นน้อง</Link>
          </>
        }
      />

      <div className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_9rem_auto]">
        <SearchBox
          className="sm:col-span-2 lg:col-span-1"
          value={f.q}
          onChange={(q) => setF({ q })}
          placeholder="ชื่อโครงงาน ชื่อนิสิต หรือชื่ออาจารย์"
        />
        <select className="input" value={f.type} onChange={(e) => setF({ type: e.target.value })} aria-label="ประเภทโครงงาน">
          <option value="">ทุกประเภท</option>
          {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="none">ยังไม่ระบุประเภท</option>
        </select>
        <select className="input" value={f.term} onChange={(e) => setF({ term: e.target.value })} aria-label="ปีการศึกษา">
          <option value="">ทุกปีการศึกษา</option>
          {meta.data?.terms.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" value={f.classLevel} onChange={(e) => setF({ classLevel: e.target.value })} aria-label="ชั้นปี">
          <option value="">ทุกชั้นปี</option>
          {CLASS_LEVELS.map((n) => <option key={n} value={n}>ชั้นปีที่ {n}</option>)}
        </select>
        {filtered && (
          <button type="button" className="btn btn-ghost" onClick={() => setF({ q: '', type: '', term: '', classLevel: '' })}>
            <X /> ล้างตัวกรอง
          </button>
        )}
      </div>

      <Async q={res}>
        {({ projects, total, pageSize }) =>
          total === 0 ? (
            <div className="panel">
              {filtered ? (
                <Empty icon={SearchX} title="ไม่พบโครงงานที่ตรงกับเงื่อนไข">ลองเปลี่ยนคำค้น หรือล้างตัวกรองแล้วค้นหาใหม่</Empty>
              ) : (
                <Empty icon={LibraryIcon} title="ยังไม่มีโครงงานในคลัง">โครงงานจะเข้าคลังเมื่อผ่านการพิจารณาจากอาจารย์ครบ 3 ท่าน</Empty>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-sm text-muted">
                พบ {total.toLocaleString('th-TH')} โครงงาน
                {res.isFetching && <Spinner className="size-4" />}
              </div>
              <div className={cx('grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3', res.isPlaceholderData && 'opacity-60')}>
                {projects.map((p) => <LibraryCard key={p.id} p={p} />)}
              </div>
              <Pagination className="mt-6" page={page} pageSize={pageSize} total={total} onChange={goPage} />
            </>
          )
        }
      </Async>
    </>
  )
}

function LibraryCard({ p }: { p: Project }) {
  const codes = p.codeCount ?? 0
  return (
    <article className="panel flex min-w-0 flex-col p-5">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone="accent">{p.type?.name ?? 'ยังไม่ระบุประเภท'}</Badge>
        <Badge>ปีการศึกษา {p.term}</Badge>
      </div>
      <Link to={`/projects/${p.id}`} className="line-clamp-2 font-semibold text-ink no-underline hover:text-accent">{p.nameTh}</Link>
      <div className="mt-0.5 line-clamp-2 text-sm text-muted">{p.nameEn}</div>

      <dl className="mt-4 flex flex-1 flex-col gap-1.5 text-sm">
        <div className="flex gap-2">
          <dt><Users className="mt-0.5 size-4 text-muted" aria-label="นิสิต" /></dt>
          <dd className="min-w-0">{studentNames(p).join(', ') || '-'}</dd>
        </div>
        <div className="flex gap-2">
          <dt><GraduationCap className="mt-0.5 size-4 text-muted" aria-label="อาจารย์ที่ปรึกษา" /></dt>
          <dd className="min-w-0">
            <span className="text-muted">ที่ปรึกษา: </span>
            {advisorName(p) ?? '-'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
        <span className="inline-flex items-center gap-1 text-muted"><FileText className="size-4" /> {p.fileCount ?? 0} ไฟล์</span>
        {codes > 0 ? (
          <Link to={`/code?project=${p.id}`} className="inline-flex items-center gap-1 no-underline hover:underline">
            <CodeXml className="size-4" /> {codes} ฟังก์ชัน
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted"><CodeXml className="size-4" /> 0 ฟังก์ชัน</span>
        )}
        <Link to={`/projects/${p.id}`} className="btn btn-primary btn-sm ml-auto">ดูรายละเอียด</Link>
      </div>
    </article>
  )
}
