import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleX, ClipboardCheck, CodeXml, FileText, Gavel, Hourglass, Inbox, Printer, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Async, Badge, Empty, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { TEACHER_ROLE_TH } from '../lib/format'
import type { Member, Project } from '../lib/types'

type Show = 'all' | 'waiting' | 'voted'

// หน้า "โครงงานที่รับผิดชอบ" ของอาจารย์ (แทน Doc_Student.aspx)
export default function TeacherProjects() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const raw = params.get('show')
  const show: Show = raw === 'waiting' || raw === 'voted' ? raw : 'all'
  const q = useQuery({ queryKey: ['projects', 'mine'], queryFn: () => api.get<{ projects: Project[] }>('/projects?scope=mine') })

  const mineOf = (p: Project) => p.members.find((m) => m.kind === 'teacher' && m.user.id === me.id)

  return (
    <>
      <PageHeader title="โครงงานที่รับผิดชอบ" subtitle="โครงงานที่คุณเป็นอาจารย์ที่ปรึกษาหรือกรรมการ" />
      <Async q={q}>
        {({ projects }) => {
          const rows = projects
            .map((p) => ({ p, my: mineOf(p) }))
            .filter((r): r is { p: Project; my: Member } => !!r.my)
          // ยังไม่ได้พิจารณาขึ้นก่อน (sort แบบคงลำดับเดิมของ server = ใหม่ก่อน)
          rows.sort((a, b) => Number(a.my.vote !== null) - Number(b.my.vote !== null))
          const waiting = rows.filter((r) => r.my.vote === null)
          const voted = rows.filter((r) => r.my.vote !== null)
          const list = show === 'waiting' ? waiting : show === 'voted' ? voted : rows

          if (rows.length === 0) {
            return (
              <div className="panel">
                <Empty icon={ClipboardCheck} title="ยังไม่มีโครงงานที่คุณรับผิดชอบ">
                  คำเชิญเป็นอาจารย์ที่ปรึกษาหรือกรรมการจากนิสิตจะอยู่ที่เมนู “คำขอรอยืนยัน”
                  <div className="mt-4"><Link to="/requests" className="btn btn-primary"><Inbox /> ไปที่คำขอรอยืนยัน</Link></div>
                </Empty>
              </div>
            )
          }
          return (
            <>
              <div className="mb-4">
                <Tabs<Show>
                  value={show}
                  onChange={(v) => setParams(v === 'all' ? {} : { show: v }, { replace: true })}
                  items={[
                    { value: 'all', label: 'ทั้งหมด', count: rows.length },
                    { value: 'waiting', label: 'รอคุณพิจารณา', count: waiting.length },
                    { value: 'voted', label: 'คุณพิจารณาแล้ว', count: voted.length },
                  ]}
                />
              </div>
              {list.length === 0 ? (
                <div className="panel">
                  <Empty icon={ClipboardCheck} title="ไม่มีโครงงานในหมวดนี้" />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {list.map(({ p, my }) => <ProjectCard key={p.id} p={p} my={my} />)}
                </div>
              )}
            </>
          )
        }}
      </Async>
    </>
  )
}

function ProjectCard({ p, my }: { p: Project; my: Member }) {
  const students = p.members.filter((m) => m.kind === 'student').map((m) => m.user.name)
  const codes = p.codeCount ?? 0
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <StatusBadge status={p.status} passCount={p.passCount} label={p.statusLabel} />
            <Badge tone="accent">{my.teacherRole ? TEACHER_ROLE_TH[my.teacherRole] : 'อาจารย์'}</Badge>
            <Badge>{p.type?.name ?? 'ยังไม่ระบุประเภท'}</Badge>
            <Badge>ปีการศึกษา {p.term}</Badge>
          </div>
          <Link to={`/projects/${p.id}`} className="text-lg font-semibold text-ink no-underline hover:text-accent">{p.nameTh}</Link>
          <div className="text-sm text-muted">{p.nameEn}</div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Users className="size-4 shrink-0 text-muted" />
              {students.join(', ') || <span className="text-muted">ยังไม่มีนิสิต</span>}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted"><FileText className="size-4" /> {p.fileCount ?? 0} ไฟล์</span>
            {codes > 0 ? (
              <Link to={`/code?project=${p.id}`} className="inline-flex items-center gap-1.5 no-underline hover:underline">
                <CodeXml className="size-4" /> {codes} ฟังก์ชัน
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted"><CodeXml className="size-4" /> 0 ฟังก์ชัน</span>
            )}
            <MyVote vote={my.vote} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === 'passed' && (
            <Link to={`/projects/${p.id}/print/confirmation`} className="btn btn-ok"><Printer /> พิมพ์ใบยืนยัน</Link>
          )}
          <Link to={`/projects/${p.id}/chapters`} className="btn btn-ghost"><FileText /> ตรวจเอกสาร</Link>
          <Link to={`/projects/${p.id}`} className="btn btn-primary"><Gavel /> พิจารณา/จัดการ</Link>
        </div>
      </div>
    </article>
  )
}

function MyVote({ vote }: { vote: Member['vote'] }) {
  if (vote === 'pass') return <Badge tone="ok"><CircleCheck className="size-3.5" /> คุณให้ผ่านแล้ว</Badge>
  if (vote === 'fail') return <Badge tone="bad"><CircleX className="size-3.5" /> คุณให้ไม่ผ่าน</Badge>
  return <Badge tone="warn"><Hourglass className="size-3.5" /> รอคุณพิจารณา</Badge>
}
