import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Eye, SearchX, X } from 'lucide-react'
import { Link } from 'react-router'
import { SearchBox, advisorName, studentNames, useUrlFilters } from '../components/filters'
import { Pagination, scrollToTop, toPage } from '../components/Pagination'
import { Async, Badge, Empty, PageHeader, Panel, Spinner, StatusBadge, cx } from '../components/ui'
import { api, qs } from '../lib/api'
import { useMe } from '../lib/auth'
import { useMeta } from '../lib/queries'
import type { PageInfo, Project } from '../lib/types'

// ===================== หน้า "ค้นหาโครงงาน" (แทน Search_Doc.aspx) =====================

const STATUS = [
  { value: 'passed', label: 'ผ่านครบ 3/3' },
  { value: 'partial', label: 'ผ่านบางส่วน' },
  { value: 'pending', label: 'รอพิจารณา' },
  { value: 'failed', label: 'ไม่ผ่าน' },
]
const PAGE_SIZE = 25

export default function Search() {
  const me = useMe()
  const meta = useMeta()
  const [f, setF] = useUrlFilters(['q', 'type', 'status', 'page'] as const)
  const page = toPage(f.page)
  const res = useQuery({
    queryKey: ['projects', 'search', { ...f, page }],
    queryFn: () => api.get<{ projects: Project[] } & PageInfo>(`/projects${qs({ scope: 'search', ...f, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })
  const filtered = !!(f.q || f.type || f.status)
  const goPage = (p: number) => {
    setF({ page: p > 1 ? String(p) : '' })
    scrollToTop()
  }

  return (
    <>
      <PageHeader
        title="ค้นหาโครงงาน"
        subtitle={
          me.role === 'admin'
            ? 'ผู้ดูแลระบบค้นหาได้จากโครงงานทั้งหมดในระบบทุกสถานะ'
            : 'ค้นหาจากคลังโครงงานที่ผ่านครบ 3/3 และโครงงานที่คุณเกี่ยวข้อง (โครงงานอื่นที่ยังไม่ผ่านจะไม่แสดง)'
        }
      />

      <div className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_11rem_auto]">
        <SearchBox
          className="sm:col-span-2 lg:col-span-1"
          value={f.q}
          onChange={(q) => setF({ q })}
          placeholder="ชื่อโครงงาน (ไทย/อังกฤษ) ชื่อนิสิต หรือชื่ออาจารย์"
        />
        <select className="input" value={f.type} onChange={(e) => setF({ type: e.target.value })} aria-label="ประเภทโครงงาน">
          <option value="">ทุกประเภท</option>
          {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="none">ยังไม่ระบุประเภท</option>
        </select>
        <select className="input" value={f.status} onChange={(e) => setF({ status: e.target.value })} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {filtered && (
          <button type="button" className="btn btn-ghost" onClick={() => setF({ q: '', type: '', status: '' })}>
            <X /> ล้างตัวกรอง
          </button>
        )}
      </div>

      <Async q={res}>
        {({ projects, total, pageSize }) => (
          <Panel
            title={`พบ ${total.toLocaleString('th-TH')} โครงงาน`}
            actions={res.isFetching && <Spinner />}
            bodyClass=""
          >
            {total === 0 ? (
              <Empty icon={SearchX} title="ไม่พบโครงงานที่ตรงกับเงื่อนไข">
                {filtered ? 'ลองเปลี่ยนคำค้น หรือล้างตัวกรองแล้วค้นหาใหม่' : 'ยังไม่มีโครงงานที่คุณค้นหาได้'}
              </Empty>
            ) : (
              <div className={cx('overflow-x-auto transition-opacity', res.isPlaceholderData && 'opacity-60')}>
                <ResultTable projects={projects} myId={me.id} />
              </div>
            )}
            <Pagination className="border-t border-line px-5 py-3" page={page} pageSize={pageSize} total={total} onChange={goPage} />
          </Panel>
        )}
      </Async>
    </>
  )
}

function ResultTable({ projects, myId }: { projects: Project[]; myId: string }) {
  return (
    <table className="table min-w-[60rem]">
      <thead>
        <tr>
          <th>โครงงาน</th>
          <th>นิสิต</th>
          <th>อาจารย์ที่ปรึกษา</th>
          <th>ประเภท</th>
          <th>ปีการศึกษา</th>
          <th>สถานะ</th>
          <th className="w-0"><span className="sr-only">ดูรายละเอียด</span></th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const mine = p.members.some((m) => m.user.id === myId)
          return (
            <tr key={p.id}>
              <td className="max-w-[24rem]">
                <Link to={`/projects/${p.id}`} className="font-medium text-ink no-underline hover:text-accent">{p.nameTh}</Link>
                <div className="text-xs text-muted">{p.nameEn}</div>
                {mine && <Badge tone="accent" className="mt-1">โครงงานของคุณ</Badge>}
              </td>
              <td>
                {studentNames(p).map((n) => <div key={n} className="whitespace-nowrap">{n}</div>)}
              </td>
              <td className="whitespace-nowrap">{advisorName(p) ?? <span className="text-muted">-</span>}</td>
              <td>{p.type?.name ?? <span className="text-muted">ยังไม่ระบุ</span>}</td>
              <td className="whitespace-nowrap">{p.term}</td>
              <td><StatusBadge status={p.status} passCount={p.passCount} label={p.statusLabel} /></td>
              <td>
                <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm whitespace-nowrap"><Eye /> ดู</Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
