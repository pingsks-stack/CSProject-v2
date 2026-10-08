import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock, Award, CalendarClock, CircleCheck, CircleX, Clock, FileText, FolderKanban, GraduationCap, Hourglass, Inbox,
  Library, Plus, Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { BarList, LineChart } from '../components/charts'
import { Icon } from '../components/Icon'
import { Async, Badge, Empty, Kpi, PageHeader, Panel, StatusBadge, TONE, cx } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { ACTIVITY, daysUntil, thaiDate, timeAgo, type Tone } from '../lib/format'
import type { Activity, OverdueItem, ProjectLite, Series, TypeCount } from '../lib/types'

interface StudentData {
  role: 'student'
  kpis: { projects: number; passed: number; files: number; teachers: number; pendingInvites: number; library: number }
  deadlines: { project: { id: string; nameTh: string }; chapter: string; dueDate: string; note: string; lastVersion: number | null }[]
  monthly: Series
  types: TypeCount[]
  projects: ProjectLite[]
  activity: Activity[]
}
interface TeacherData {
  role: 'teacher'
  kpis: { projects: number; advising: number; pending: number; passed: number; myPasses: number; files: number }
  overdue: { items: OverdueItem[]; total: number }
  monthly: Series
  statusDist: { key: string; label: string; count: number }[]
  pending: { kind: string; title: string; detail: string; link: string; at: string }[]
  activity: Activity[]
}
interface AdminData {
  role: 'admin'
  kpis: { projects: number; untyped: number; students: number; teachers: number; passed: number; passedPct: number | null; files: number; filesAvg: number }
  overdue: { items: OverdueItem[]; total: number }
  monthly: Series
  types: TypeCount[]
  latest: ProjectLite[]
  activity: Activity[]
}
type DashboardData = StudentData | TeacherData | AdminData

// คำแรกของชื่อที่ไม่ใช่คำนำหน้า
function firstName(name: string) {
  const parts = name.split(/\s+/)
  const word = parts.find((p) => !['นาย', 'นาง', 'นางสาว', 'อาจารย์', 'ดร.', 'ผศ.', 'รศ.', 'ศ.', 'ผศ.ดร.', 'รศ.ดร.'].includes(p)) ?? parts[0]
  return word.replace(/^(นาย|นางสาว|นาง)/, '')
}

export default function Dashboard() {
  const user = useMe()
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard') })
  return (
    <Async q={q}>
      {(d) => (
        <>
          {d.role === 'student' && <StudentDashboard d={d} name={user.name} />}
          {d.role === 'teacher' && <TeacherDashboard d={d} name={user.name} />}
          {d.role === 'admin' && <AdminDashboard d={d} />}
        </>
      )}
    </Async>
  )
}

// ===================== นิสิต =====================
function StudentDashboard({ d, name }: { d: StudentData; name: string }) {
  const overdue = d.deadlines.filter((x) => x.lastVersion === null && daysUntil(x.dueDate) < 0).length
  return (
    <>
      <PageHeader
        title={`สวัสดี ${firstName(name)}`}
        subtitle="ภาพรวมโครงงานและกำหนดส่งของคุณ"
        actions={d.kpis.projects === 0 && <Link to="/projects/new" className="btn btn-primary"><Plus /> เพิ่มโครงงาน</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={FolderKanban} label="โครงงานของฉัน" value={d.kpis.projects} note={`ผ่านครบ 3/3 แล้ว ${d.kpis.passed}`} />
        <Kpi icon={GraduationCap} tone="gold" label="อาจารย์ที่ดูแล" value={d.kpis.teachers} note={d.kpis.pendingInvites ? `รออาจารย์ตอบรับ ${d.kpis.pendingInvites} คำเชิญ` : 'ไม่มีคำเชิญค้างอยู่'} />
        <Kpi icon={FileText} tone="info" label="ไฟล์ในโครงงาน" value={d.kpis.files} />
        <Kpi icon={Library} tone="ok" label="คลังโครงงาน" value={d.kpis.library} note="โครงงานที่ผ่านแล้วทั้งระบบ" />
      </div>

      {d.deadlines.length > 0 && (
        <Panel
          className="mt-6"
          title="กำหนดส่งเอกสาร"
          sub={overdue ? <span className="text-bad">มี {overdue} บทที่เลยกำหนดแล้ว</span> : 'ตามปีการศึกษาของโครงงาน'}
          actions={<Link to={`/projects/${d.deadlines[0].project.id}/chapters`} className="btn btn-primary btn-sm"><FileText /> ส่งเอกสาร</Link>}
          bodyClass="p-0"
        >
          <ul className="grid md:grid-cols-2">
            {d.deadlines.map((x) => {
              const days = daysUntil(x.dueDate)
              const [tone, text]: [Tone, string] =
                x.lastVersion !== null ? ['ok', `ส่งแล้ว v${x.lastVersion}`]
                : days < 0 ? ['bad', `เลยกำหนด ${-days} วัน`]
                : days === 0 ? ['warn', 'ครบกำหนดวันนี้']
                : days <= 7 ? ['warn', `อีก ${days} วัน`]
                : ['info', `อีก ${days} วัน`]
              return (
                <li key={`${x.project.id}${x.chapter}`} className="border-b border-line md:odd:border-r">
                  <Link to={`/projects/${x.project.id}/chapters`} className="flex items-center gap-3 px-5 py-3 no-underline hover:bg-surface-2">
                    <span className={cx('kpi-icon', TONE[tone])}><CalendarClock /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{x.chapter}</span>
                      <span className="block truncate text-xs text-muted">กำหนด {thaiDate(x.dueDate)}{x.note ? ` · ${x.note}` : ''}</span>
                    </span>
                    <Badge tone={tone}>{text}</Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="ความเคลื่อนไหวในโครงงาน" sub="12 เดือนล่าสุด">
          <LineChart labels={d.monthly.labels} series={d.monthly.series} />
        </Panel>
        <TypesPanel types={d.types} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="โครงงานของฉัน" bodyClass="p-0">
          {d.projects.length === 0 ? (
            <Empty icon={FolderKanban} title="ยังไม่มีโครงงาน">
              <Link to="/projects/new">สร้างโครงงาน</Link> แล้วเชิญคู่โปรเจคและอาจารย์ที่ปรึกษา
            </Empty>
          ) : (
            <ProjectTable projects={d.projects} showTeachers />
          )}
        </Panel>
        <ActivityPanel items={d.activity} />
      </div>
    </>
  )
}

// ===================== อาจารย์ =====================
const STATUS_ROWS: Record<string, { icon: typeof CircleCheck; tone: Tone }> = {
  passed: { icon: Award, tone: 'ok' },
  partial: { icon: CircleCheck, tone: 'info' },
  pending: { icon: Hourglass, tone: 'warn' },
  failed: { icon: CircleX, tone: 'bad' },
}

function TeacherDashboard({ d, name }: { d: TeacherData; name: string }) {
  const total = d.statusDist.reduce((s, x) => s + x.count, 0)
  return (
    <>
      <PageHeader
        title={`สวัสดี ${firstName(name)}`}
        subtitle="ภาพรวมโครงงานที่คุณดูแล"
        actions={<Link to="/requests" className="btn btn-primary"><Inbox /> คำขอรอยืนยัน</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={FolderKanban} label="โครงงานที่ดูแล" value={d.kpis.projects} note={`เป็นอาจารย์ที่ปรึกษา ${d.kpis.advising} โครงงาน`} />
        <Kpi icon={Inbox} tone="warn" label="รอดำเนินการ" value={d.kpis.pending} note="คำเชิญ คำขอ และเอกสารรอตรวจ" />
        <Kpi icon={Award} tone="ok" label="ผ่านครบ 3/3" value={d.kpis.passed} note={`คุณกดผ่านไปแล้ว ${d.kpis.myPasses} โครงงาน`} />
        <Kpi icon={FileText} tone="info" label="ไฟล์เอกสาร" value={d.kpis.files} note="ในโครงงานที่ดูแล" />
      </div>

      <OverduePanel overdue={d.overdue} />

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="ความเคลื่อนไหวในโครงงานที่ดูแล" sub="12 เดือนล่าสุด">
          <LineChart labels={d.monthly.labels} series={d.monthly.series} />
        </Panel>
        <Panel title="สถานะโครงงาน" sub={`ทั้งหมด ${total} โครงงาน`}>
          <ul className="flex flex-col gap-4">
            {d.statusDist.map((s) => {
              const r = STATUS_ROWS[s.key]
              return (
                <li key={s.key}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <r.icon className={cx('size-4', TONE[r.tone].split(' ')[1])} />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </div>
                  <div className={cx('h-2 overflow-hidden rounded-full', TONE[r.tone].split(' ')[0])}>
                    <div className="h-full rounded-full bg-current" style={{ width: total ? `${(s.count / total) * 100}%` : 0, color: `rgb(var(--c-${r.tone}))` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="รายการรอดำเนินการ" actions={<Link to="/teacher/projects" className="btn btn-ghost btn-sm">โครงงานที่รับผิดชอบ</Link>} bodyClass="p-0">
          {d.pending.length === 0 ? (
            <Empty icon={CircleCheck} title="ไม่มีรายการรอดำเนินการ" />
          ) : (
            <ul>
              {d.pending.map((p, i) => (
                <li key={i} className="border-b border-line last:border-0">
                  <Link to={p.link} className="flex items-center gap-3 px-5 py-3 no-underline hover:bg-surface-2">
                    <span className={cx('kpi-icon', p.kind === 'review' ? TONE.info : TONE.warn)}>
                      {p.kind === 'review' ? <FileText /> : <Inbox />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{p.title}</span>
                      <span className="block truncate text-xs text-muted">{p.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(p.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <ActivityPanel items={d.activity} />
      </div>
    </>
  )
}

// ===================== แอดมิน =====================
function AdminDashboard({ d }: { d: AdminData }) {
  return (
    <>
      <PageHeader
        title="ภาพรวมระบบ"
        subtitle="สรุปโครงงาน ผู้ใช้ และกิจกรรมล่าสุดของทั้งระบบ"
        actions={<Link to="/admin/types" className="btn btn-ghost">จัดการประเภทโครงงาน</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={FolderKanban} label="โครงงานทั้งหมด" value={d.kpis.projects} note={`ยังไม่ระบุประเภท ${d.kpis.untyped} โครงงาน`} />
        <Kpi icon={Users} tone="gold" label="ผู้ใช้งาน" value={d.kpis.students + d.kpis.teachers} note={`นิสิต ${d.kpis.students} · อาจารย์ ${d.kpis.teachers}`} />
        <Kpi icon={Award} tone="ok" label="ผ่านครบ 3/3" value={d.kpis.passed} note={d.kpis.passedPct === null ? '-' : `${d.kpis.passedPct}% ของโครงงานทั้งหมด`} />
        <Kpi icon={FileText} tone="info" label="ไฟล์เอกสาร" value={d.kpis.files} note={`เฉลี่ย ${d.kpis.filesAvg} ไฟล์ต่อโครงงาน`} />
      </div>

      <OverduePanel overdue={d.overdue} />

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="โครงงานใหม่และการอัปโหลดไฟล์" sub="12 เดือนล่าสุด">
          <LineChart labels={d.monthly.labels} series={d.monthly.series} />
        </Panel>
        <TypesPanel types={d.types} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="โครงงานล่าสุด" actions={<Link to="/admin/projects" className="btn btn-ghost btn-sm">ดูทั้งหมด</Link>} bodyClass="p-0">
          {d.latest.length === 0 ? <Empty icon={FolderKanban} title="ยังไม่มีโครงงาน" /> : <ProjectTable projects={d.latest} showDate />}
        </Panel>
        <ActivityPanel items={d.activity} />
      </div>
    </>
  )
}

// ===================== ส่วนที่ใช้ร่วมกัน =====================
function ProjectTable({ projects, showTeachers, showDate }: { projects: ProjectLite[]; showTeachers?: boolean; showDate?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {showDate && <th>วันที่สร้าง</th>}
            <th>โครงงาน</th>
            <th>ประเภท</th>
            {showTeachers && <th>อาจารย์</th>}
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              {showDate && <td className="whitespace-nowrap text-muted">{thaiDate(p.createdAt)}</td>}
              <td className="min-w-48">
                <Link to={`/projects/${p.id}`} className="font-medium">{p.nameTh}</Link>
              </td>
              <td className="text-muted">{p.type ?? 'ยังไม่ระบุ'}</td>
              {showTeachers && <td className="tabular-nums">{p.teacherCount}/3</td>}
              <td><StatusBadge status={p.status} passCount={p.passCount} label={p.statusLabel} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TypesPanel({ types }: { types: TypeCount[] }) {
  return (
    <Panel title="โครงงานตามประเภท" actions={<Link to="/stats" className="text-sm">ดูสถิติ</Link>}>
      {types.length === 0 ? (
        <Empty title="ยังไม่มีประเภทโครงงาน" />
      ) : (
        <BarList items={[...types].sort((a, b) => b.count - a.count).map((t) => ({ label: t.name, value: t.count, muted: t.id === 'none' }))} />
      )}
    </Panel>
  )
}

function OverduePanel({ overdue }: { overdue: { items: OverdueItem[]; total: number } }) {
  if (overdue.items.length === 0) return null
  return (
    <Panel className="mt-6" title="งานเลยกำหนด" sub={<span className="text-bad">{overdue.total} รายการที่เลยกำหนดส่งแล้วยังไม่ส่ง</span>} bodyClass="p-0">
      <ul className="grid md:grid-cols-2">
        {overdue.items.map((x) => (
          <li key={`${x.project.id}${x.chapter}`} className="border-b border-line md:odd:border-r">
            <Link to={`/projects/${x.project.id}/chapters`} className="flex items-center gap-3 px-5 py-3 no-underline hover:bg-surface-2">
              <span className={cx('kpi-icon', TONE.bad)}><AlarmClock /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{x.project.nameTh}</span>
                <span className="block text-xs text-muted">{x.chapter} · กำหนด {thaiDate(x.dueDate)}</span>
              </span>
              <Badge tone="bad">เลย {x.lateDays} วัน</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ActivityPanel({ items }: { items: Activity[] }) {
  return (
    <Panel title="กิจกรรมล่าสุด" bodyClass="p-0">
      {items.length === 0 ? (
        <Empty icon={Clock} title="ยังไม่มีกิจกรรม" />
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id} className="flex gap-3 border-b border-line px-5 py-3 last:border-0">
              <span className="kpi-icon size-8 bg-surface-2 text-muted"><Icon name={ACTIVITY[a.type]?.icon ?? 'clock'} className="size-4" /></span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium text-ink">{ACTIVITY[a.type]?.label ?? a.type}</div>
                <div className="truncate text-xs text-muted">
                  {[a.detail, a.project?.nameTh, a.actor?.name].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
