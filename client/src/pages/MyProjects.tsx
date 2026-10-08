import { useQuery } from '@tanstack/react-query'
import { Check, CodeXml, FileText, FolderKanban, Plus, Printer, RotateCcw, Settings2 } from 'lucide-react'
import { Link } from 'react-router'
import { Async, Badge, Empty, PageHeader, StatusBadge, cx, useAction, useConfirm } from '../components/ui'
import { api } from '../lib/api'
import type { Project } from '../lib/types'

// หน้า "โครงงานของฉัน" ของนิสิต (แทน Main_Doc.aspx)
export default function MyProjects() {
  const q = useQuery({ queryKey: ['projects', 'mine'], queryFn: () => api.get<{ projects: Project[] }>('/projects?scope=mine') })
  return (
    <>
      <PageHeader
        title="โครงงานของฉัน"
        subtitle="ติดตามความคืบหน้า ส่งเอกสาร และจัดการสมาชิกโครงงาน"
        actions={q.data?.projects.length === 0 && <Link to="/projects/new" className="btn btn-primary"><Plus /> เพิ่มโครงงาน</Link>}
      />
      <Async q={q}>
        {({ projects }) =>
          projects.length === 0 ? (
            <div className="panel">
              <Empty icon={FolderKanban} title="ยังไม่มีโครงงาน">
                เริ่มต้นด้วยการสร้างโครงงาน แล้วเชิญคู่โปรเจคและอาจารย์ที่ปรึกษา
                <div className="mt-4"><Link to="/projects/new" className="btn btn-primary"><Plus /> เพิ่มโครงงาน</Link></div>
              </Empty>
            </div>
          ) : (
            <div className="flex flex-col gap-4">{projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
          )
        }
      </Async>
    </>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const confirm = useConfirm()
  const resubmit = useAction(() => api.post(`/projects/${p.id}/resubmit`), {
    success: 'ส่งโครงงานไปยังภาคการศึกษาปัจจุบันแล้ว',
    invalidate: [['projects'], ['project', p.id], ['dashboard'], ['chapters', p.id], ['meta']],
  })
  const teachers = p.members.filter((m) => m.kind === 'teacher').length
  const steps = [
    { title: 'สร้างโครงงาน', note: 'เรียบร้อย', done: true },
    {
      title: `อาจารย์ ${teachers}/3`,
      note: p.pendingInvites ? `รอตอบรับ ${p.pendingInvites} คำเชิญ` : teachers >= 3 ? 'ครบแล้ว' : 'เชิญได้ที่หน้าจัดการ',
      done: teachers >= 3,
    },
    { title: `เอกสาร ${p.chapterCount ?? 0}/7 บท`, note: p.chapterCount ? `ส่งแล้ว ${p.chapterCount} บท` : 'ยังไม่ส่ง', done: (p.chapterCount ?? 0) >= 7 },
    { title: `ซอร์สโค้ด ${p.codeCount ?? 0} ฟังก์ชัน`, note: p.codeCount ? 'เพิ่มแล้ว' : 'ยังไม่มีโค้ด', done: (p.codeCount ?? 0) > 0 },
    {
      title: 'ผลการพิจารณา',
      note: p.status === 'passed' ? 'ผ่านครบ 3/3' : p.status === 'failed' ? 'ไม่ผ่าน' : 'รออาจารย์พิจารณา',
      done: p.status === 'passed',
      bad: p.status === 'failed',
    },
  ]

  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <StatusBadge status={p.status} passCount={p.passCount} label={p.statusLabel} />
            <Badge>{p.type?.name ?? 'ยังไม่ระบุประเภท'}</Badge>
            <Badge>ปีการศึกษา {p.term}</Badge>
          </div>
          <Link to={`/projects/${p.id}`} className="text-lg font-semibold text-ink no-underline hover:text-accent">{p.nameTh}</Link>
          <div className="text-sm text-muted">{p.nameEn}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === 'passed' && (
            <Link to={`/projects/${p.id}/print/approval`} className="btn btn-ok"><Printer /> พิมพ์ใบยืนยัน</Link>
          )}
          {p.status === 'failed' && (
            <button
              type="button"
              className="btn btn-bad"
              disabled={resubmit.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'ส่งโครงงานใหม่',
                  text: 'โครงงานจะย้ายไปภาคการศึกษาปัจจุบัน และผลพิจารณาของอาจารย์ทุกท่านจะถูกล้างเพื่อพิจารณาใหม่',
                  confirmText: 'ส่งโครงงานใหม่',
                })
                if (ok) resubmit.mutate()
              }}
            >
              <RotateCcw /> ส่งโครงงานใหม่
            </button>
          )}
          <Link to={`/projects/${p.id}/chapters`} className="btn btn-ghost"><FileText /> เอกสารรายบท</Link>
          <Link to={`/projects/${p.id}/code`} className="btn btn-ghost"><CodeXml /> ซอร์สโค้ด</Link>
          <Link to={`/projects/${p.id}`} className="btn btn-primary"><Settings2 /> จัดการโครงงาน</Link>
        </div>
      </div>
      <ol className="grid border-t border-line sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
            <span
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                s.done ? 'bg-ok text-white' : s.bad ? 'bg-bad text-white' : 'bg-surface-2 text-muted',
              )}
            >
              {s.done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{s.title}</span>
              <span className="block truncate text-xs text-muted">{s.note}</span>
            </span>
          </li>
        ))}
      </ol>
    </article>
  )
}
