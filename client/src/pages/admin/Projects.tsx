import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Eye, FolderKanban, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { SearchBox } from '../../components/filters'
import { Async, Empty, PageHeader, Panel, StatusBadge, cx } from '../../components/ui'
import { api, qs } from '../../lib/api'
import { thaiDate } from '../../lib/format'
import { useMeta } from '../../lib/queries'
import type { Project } from '../../lib/types'

const FILTERS = ['q', 'classLevel', 'status', 'type', 'term'] as const
type Filter = (typeof FILTERS)[number]

const STATUS_OPTIONS = [
  { value: 'passed', label: 'ผ่านครบ 3/3' },
  { value: 'partial', label: 'ผ่านบางส่วน' },
  { value: 'pending', label: 'รอพิจารณา' },
  { value: 'failed', label: 'ไม่ผ่าน' },
]

// server ส่งมาไม่เกิน 300 โครงงานล่าสุด
const LIMIT = 300

// หน้า "โครงงานทั้งหมด" ของแอดมิน (แทน Admin_infor.aspx) ตัวกรองเก็บไว้ในลิงก์ ส่งต่อ/รีเฟรชได้
export default function AdminProjects() {
  const meta = useMeta()
  const [params, setParams] = useSearchParams()
  const f = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ''])) as Record<Filter, string>
  const active = FILTERS.some((k) => f[k])

  const setFilter = (k: Filter, v: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (v) next.set(k, v)
      else next.delete(k)
      return next
    }, { replace: true })

  const q = useQuery({
    queryKey: ['projects', 'all', f],
    queryFn: () => api.get<{ projects: Project[] }>(`/projects${qs({ scope: 'all', ...f })}`),
    placeholderData: keepPreviousData,
  })

  // ปีการศึกษาในลิงก์ที่ไม่มีในรายการ (เช่น ลิงก์เก่า) ก็ยังเลือกค้างไว้ได้
  const terms = [...new Set([...(meta.data?.terms ?? []), f.term].filter(Boolean))]

  return (
    <>
      <PageHeader
        title="โครงงานทั้งหมด"
        subtitle="ดูและกรองโครงงานทุกโครงงานในระบบ กดดูข้อมูลเพื่อเปิดรายละเอียดของโครงงาน"
        actions={active && (
          <button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>
            <X /> ล้างตัวกรอง
          </button>
        )}
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
        {({ projects }) => (
          <Panel
            title={`พบ ${projects.length.toLocaleString('th-TH')} โครงงาน`}
            sub={projects.length >= LIMIT ? `แสดง ${LIMIT} โครงงานล่าสุด ใช้ตัวกรองเพื่อหาโครงงานที่เก่ากว่านี้` : undefined}
            bodyClass={cx('overflow-x-auto transition-opacity', q.isPlaceholderData && 'opacity-60')}
          >
            {projects.length === 0 ? (
              <Empty icon={FolderKanban} title="ไม่มีข้อมูลที่จะแสดง">
                {active ? 'ไม่พบโครงงานที่ตรงกับตัวกรอง ลองเปลี่ยนหรือล้างตัวกรอง' : 'ยังไม่มีโครงงานในระบบ'}
              </Empty>
            ) : (
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
            )}
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
