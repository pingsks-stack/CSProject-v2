import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Eye, FileSpreadsheet, FolderKanban, X } from 'lucide-react'
import { Link } from 'react-router'
import { SearchBox, useUrlFilters } from '../../components/filters'
import { Pagination, scrollToTop, toPage } from '../../components/Pagination'
import { Async, Empty, PageHeader, Panel, StatusBadge, cx } from '../../components/ui'
import { api, qs } from '../../lib/api'
import { thaiDate } from '../../lib/format'
import { useMeta } from '../../lib/queries'
import type { PageInfo, Project } from '../../lib/types'

const FILTERS = ['q', 'classLevel', 'status', 'type', 'term'] as const
type Filter = (typeof FILTERS)[number]
const PAGE_SIZE = 50

const STATUS_OPTIONS = [
  { value: 'passed', label: 'ผ่านครบ 3/3' },
  { value: 'partial', label: 'ผ่านบางส่วน' },
  { value: 'pending', label: 'รอพิจารณา' },
  { value: 'failed', label: 'ไม่ผ่าน' },
]

// หน้า "โครงงานทั้งหมด" ของแอดมิน (แทน Admin_infor.aspx) ตัวกรองเก็บไว้ในลิงก์ ส่งต่อ/รีเฟรชได้
export default function AdminProjects() {
  const meta = useMeta()
  const [values, setValues] = useUrlFilters([...FILTERS, 'page'] as const)
  const { page: pageParam, ...f } = values
  const page = toPage(pageParam)
  const active = FILTERS.some((k) => f[k])
  const setFilter = (k: Filter, v: string) => setValues({ [k]: v })
  const clear = () => setValues(Object.fromEntries(FILTERS.map((k) => [k, ''])))
  const goPage = (p: number) => {
    setValues({ page: p > 1 ? String(p) : '' })
    scrollToTop()
  }

  const q = useQuery({
    queryKey: ['projects', 'all', { ...f, page }],
    queryFn: () => api.get<{ projects: Project[] } & PageInfo>(`/projects${qs({ scope: 'all', ...f, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })
  // ไฟล์ส่งออกใช้ตัวกรองชุดเดียวกับที่เห็นอยู่ (ทุกหน้า ไม่แบ่งหน้า)
  const exportUrl = `/api/admin/export/projects.csv${qs(f)}`

  // ปีการศึกษาในลิงก์ที่ไม่มีในรายการ (เช่น ลิงก์เก่า) ก็ยังเลือกค้างไว้ได้
  const terms = [...new Set([...(meta.data?.terms ?? []), f.term].filter(Boolean))]

  return (
    <>
      <PageHeader
        title="โครงงานทั้งหมด"
        subtitle="ดูและกรองโครงงานทุกโครงงานในระบบ กดดูข้อมูลเพื่อเปิดรายละเอียดของโครงงาน"
        actions={
          <>
            {active && (
              <button type="button" className="btn btn-ghost" onClick={clear}>
                <X /> ล้างตัวกรอง
              </button>
            )}
            <a href={exportUrl} className="btn btn-ghost" title="ดาวน์โหลดไฟล์ CSV เปิดด้วย Excel ได้ (รองรับภาษาไทย)">
              <FileSpreadsheet /> ส่งออก Excel
            </a>
          </>
        }
      />

      <div className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <SearchBox value={f.q} onChange={(v) => setFilter('q', v)} placeholder="ชื่อโครงงาน ชื่อนิสิต หรืออาจารย์" />
        <select className="input" aria-label="ชั้นปี" value={f.classLevel} onChange={(e) => setFilter('classLevel', e.target.value)}>
          <option value="">ทุกชั้นปี</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>ชั้นปีที่ {n}</option>)}
        </select>
        <select className="input" aria-label="สถานะ" value={f.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="input" aria-label="ประเภท" value={f.type} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">ทุกประเภท</option>
          <option value="none">ยังไม่ระบุประเภท</option>
          {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="input" aria-label="ปีการศึกษา" value={f.term} onChange={(e) => setFilter('term', e.target.value)}>
          <option value="">ทุกปีการศึกษา</option>
          {terms.map((t) => <option key={t} value={t}>ปีการศึกษา {t}</option>)}
        </select>
      </div>

      <Async q={q}>
        {({ projects, total, pageSize }) => (
          <Panel
            title={`พบ ${total.toLocaleString('th-TH')} โครงงาน`}
            sub={total > 0 && `ส่งออก Excel ได้ทั้ง ${total.toLocaleString('th-TH')} โครงงาน${active ? 'ตามตัวกรองนี้' : ''} (ไฟล์ CSV เปิดด้วย Excel ได้ รองรับภาษาไทย)`}
            bodyClass=""
          >
            {total === 0 ? (
              <Empty icon={FolderKanban} title="ไม่มีข้อมูลที่จะแสดง">
                {active ? 'ไม่พบโครงงานที่ตรงกับตัวกรอง ลองเปลี่ยนหรือล้างตัวกรอง' : 'ยังไม่มีโครงงานในระบบ'}
              </Empty>
            ) : (
              <div className={cx('overflow-x-auto transition-opacity', q.isPlaceholderData && 'opacity-60')}>
                <table className="table min-w-[880px]">
                  <thead>
                    <tr>
                      <th>โครงงาน</th>
                      <th>นิสิต</th>
                      <th>อาจารย์ที่ปรึกษา</th>
                      <th>ประเภท</th>
                      <th>ปีการศึกษา / ชั้นปี</th>
                      <th>สถานะ</th>
                      <th>วันที่สร้าง</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => <ProjectRow key={p.id} p={p} />)}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination className="border-t border-line px-5 py-3" page={page} pageSize={pageSize} total={total} onChange={goPage} />
          </Panel>
        )}
      </Async>
    </>
  )
}

function ProjectRow({ p }: { p: Project }) {
  const students = p.members.filter((m) => m.kind === 'student')
  const advisor = p.members.find((m) => m.kind === 'teacher' && m.teacherRole === 'advisor')
  return (
    <tr>
      <td>
        <div className="max-w-80 min-w-48">
          <Link to={`/projects/${p.id}`} className="font-medium text-ink no-underline hover:text-accent">{p.nameTh}</Link>
          {p.nameEn && <div className="text-xs text-muted">{p.nameEn}</div>}
        </div>
      </td>
      <td>
        {students.length ? students.map((m) => <div key={m.user.id}>{m.user.name}</div>) : <span className="text-muted">-</span>}
      </td>
      <td>{advisor ? advisor.user.name : <span className="text-muted">ยังไม่มี</span>}</td>
      <td>{p.type?.name ?? <span className="text-muted">ยังไม่ระบุ</span>}</td>
      <td className="whitespace-nowrap">
        <div>{p.term || '-'}</div>
        {p.classLevel > 0 && <div className="text-xs text-muted">ชั้นปีที่ {p.classLevel}</div>}
      </td>
      <td><StatusBadge status={p.status} passCount={p.passCount} label={p.statusLabel} /></td>
      <td className="whitespace-nowrap text-muted">{thaiDate(p.createdAt)}</td>
      <td className="text-right">
        <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm whitespace-nowrap"><Eye /> ดูข้อมูล</Link>
      </td>
    </tr>
  )
}
