import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CalendarPlus, FileSpreadsheet, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Async, Badge, Empty, PageHeader, Panel, cx, useAction, useConfirm } from '../../components/ui'
import { api, qs } from '../../lib/api'
import { daysUntil, thaiDate } from '../../lib/format'
import { useMeta } from '../../lib/queries'

interface Deadline {
  id: string
  term: string
  chapter: string
  dueDate: string
  note: string
  projects: number
  submitted: number
}

interface DeadlinesRes {
  currentTerm: string
  terms: string[]
  deadlines: Deadline[]
}

interface Form {
  term: string
  chapter: string
  date: string
  note: string
}

const KEYS = [['admin', 'deadlines'], ['dashboard']]

// วันที่ในช่อง <input type="date"> (yyyy-mm-dd ตามเวลาประเทศไทย)
function inputDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// หน้า "กำหนดส่งงาน" ของแอดมิน (แทน Admin_Deadline.aspx)
export default function AdminDeadlines() {
  const q = useQuery({ queryKey: ['admin', 'deadlines'], queryFn: () => api.get<DeadlinesRes>('/admin/deadlines') })
  return (
    <>
      <PageHeader
        title="กำหนดส่งงาน"
        subtitle="กำหนดวันส่งเอกสารแต่ละบทตามปีการศึกษา ระบบจะแสดงงานที่เลยกำหนดบนแดชบอร์ด และส่งออกสถานะการส่งงานของแต่ละปีการศึกษาเป็นไฟล์ Excel ได้ (CSV รองรับภาษาไทย)"
      />
      <Async q={q}>{(data) => <DeadlinesBody data={data} />}</Async>
    </>
  )
}

function DeadlinesBody({ data }: { data: DeadlinesRes }) {
  const meta = useMeta()
  const chapters = meta.data?.chapters ?? []
  const blank: Form = { term: data.currentTerm, chapter: '', date: '', note: '' }
  const [form, setForm] = useState<Form>(blank)
  const formRef = useRef<HTMLDivElement>(null)
  const chapter = form.chapter || chapters[0] || ''
  const existing = data.deadlines.find((d) => d.term === form.term && d.chapter === chapter)

  const save = useAction((b: Form) => api.put('/admin/deadlines', b).then(() => b), {
    success: (b) => `บันทึกแล้ว · ${b.chapter} ปีการศึกษา ${b.term} กำหนดส่ง ${thaiDate(b.date)}`,
    invalidate: KEYS,
    onSuccess: () => setForm((f) => ({ ...f, date: '', note: '' })),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({ ...form, chapter, note: form.note.trim() })
  }

  // กดแถวในรายการ → โหลดเข้าแบบฟอร์มเพื่อแก้ไข
  const edit = (d: Deadline) => {
    setForm({ term: d.term, chapter: d.chapter, date: inputDate(d.dueDate), note: d.note })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  // จัดกลุ่มตามปีการศึกษา (ใหม่ → เก่า) ในกลุ่มเรียงตามวันกำหนดส่งจาก server
  const byTerm = new Map<string, Deadline[]>()
  for (const d of data.deadlines) byTerm.set(d.term, [...(byTerm.get(d.term) ?? []), d])
  const groups = [...byTerm.entries()].sort(([a], [b]) => b.localeCompare(a))

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div ref={formRef} className="scroll-mt-20">
        <Panel title="เพิ่ม/แก้ไขกำหนดส่ง" sub="ถ้าบทนั้นในปีการศึกษานั้นมีอยู่แล้ว จะอัปเดตเป็นวันใหม่">
          <form onSubmit={onSubmit} className="grid gap-4">
            <label className="field">
              <span>ปีการศึกษา</span>
              <select className="input" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
                {data.terms.map((t) => (
                  <option key={t} value={t}>{t}{t === data.currentTerm ? ' (ปัจจุบัน)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>บท</span>
              <select className="input" required value={chapter} disabled={!chapters.length} onChange={(e) => setForm({ ...form, chapter: e.target.value })}>
                {!chapters.length && <option value="">กำลังโหลด…</option>}
                {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span>วันที่กำหนดส่ง</span>
              <input
                type="date"
                className="input"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                onInvalid={(e) => e.currentTarget.setCustomValidity('กรุณาเลือกวันที่')}
                onInput={(e) => e.currentTarget.setCustomValidity('')}
              />
            </label>
            <label className="field">
              <span>หมายเหตุ <span className="font-normal text-muted">(ไม่บังคับ)</span></span>
              <input className="input" maxLength={300} placeholder="เช่น ส่งพร้อมแบบฟอร์มขออนุมัติหัวข้อ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            {existing && (
              <p className="rounded-xl bg-info/10 px-3 py-2 text-xs text-info">
                {existing.chapter} ปีการศึกษา {existing.term} มีกำหนดส่งอยู่แล้ว ({thaiDate(existing.dueDate)}) บันทึกเพื่อเปลี่ยนเป็นวันใหม่
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {(form.date || form.note || form.term !== blank.term || form.chapter) && (
                <button type="button" className="btn btn-ghost" onClick={() => setForm(blank)}><RotateCcw /> ล้าง</button>
              )}
              <button className="btn btn-primary" disabled={save.isPending || !chapter}>
                {existing ? <><Save /> อัปเดตกำหนดส่ง</> : <><CalendarPlus /> เพิ่มกำหนดส่ง</>}
              </button>
            </div>
          </form>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {groups.length === 0 ? (
          <div className="panel">
            <Empty icon={CalendarClock} title="ยังไม่มีกำหนดส่ง">
              เพิ่มได้จากแบบฟอร์ม<span className="lg:hidden">ด้านบน</span><span className="hidden lg:inline">ทางซ้าย</span>
            </Empty>
          </div>
        ) : (
          groups.map(([term, rows]) => (
            <Panel
              key={term}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  ปีการศึกษา {term} {term === data.currentTerm && <Badge tone="accent">ปัจจุบัน</Badge>}
                </span>
              }
              sub={`${rows.length} กำหนดส่ง · ${rows[0].projects} โครงงานในปีการศึกษานี้`}
              actions={
                <a
                  href={`/api/admin/export/submissions.csv${qs({ term })}`}
                  className="btn btn-ghost btn-sm"
                  title={`ดาวน์โหลดสถานะการส่งเอกสารทุกบทของทุกโครงงานปีการศึกษา ${term} เป็นไฟล์ CSV เปิดด้วย Excel ได้ (รองรับภาษาไทย)`}
                >
                  <FileSpreadsheet /> ส่งออกสถานะการส่งงาน
                </a>
              }
              bodyClass="overflow-x-auto"
            >
              <table className="table min-w-[640px]">
                <thead>
                  <tr>
                    <th>บท</th>
                    <th>กำหนดส่ง</th>
                    <th>ส่งแล้ว</th>
                    <th>หมายเหตุ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <DeadlineRow key={d.id} d={d} selected={d.term === form.term && d.chapter === chapter && !!form.date} onEdit={edit} />
                  ))}
                </tbody>
              </table>
            </Panel>
          ))
        )}
      </div>
    </div>
  )
}

function DeadlineRow({ d, selected, onEdit }: { d: Deadline; selected: boolean; onEdit: (d: Deadline) => void }) {
  const confirm = useConfirm()
  const remove = useAction(() => api.del(`/admin/deadlines/${d.id}`), { success: 'ลบกำหนดส่งแล้ว', invalidate: KEYS })
  const days = daysUntil(d.dueDate)
  const left = d.projects - d.submitted

  const onDelete = async () => {
    const ok = await confirm({ title: 'ลบกำหนดส่ง', text: `ลบกำหนดส่ง "${d.chapter} ${d.term}" ใช่ไหม?`, confirmText: 'ลบ', danger: true })
    if (ok) remove.mutate()
  }

  return (
    <tr onClick={() => onEdit(d)} className={cx('cursor-pointer', selected && '[&>td]:bg-accent/10')}>
      <td className="font-medium whitespace-nowrap">{d.chapter}</td>
      <td className="whitespace-nowrap">
        <div>{thaiDate(d.dueDate)}</div>
        <div className={cx('text-xs', days < 0 ? 'text-bad' : days === 0 ? 'font-medium text-warn' : 'text-muted')}>
          {days < 0 ? `เลยมา ${-days} วัน` : days === 0 ? 'วันนี้' : `อีก ${days} วัน`}
        </div>
      </td>
      <td className="whitespace-nowrap">
        {d.submitted}/{d.projects}
        {days < 0 && left > 0 && <Badge tone="bad" className="ml-2">ค้าง {left}</Badge>}
      </td>
      <td className="text-muted">
        <div className="max-w-72 break-words">{d.note || '-'}</div>
      </td>
      <td>
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-ghost btn-sm" title="แก้ไข" aria-label={`แก้ไขกำหนดส่ง ${d.chapter} ${d.term}`} onClick={() => onEdit(d)}>
            <Pencil />
          </button>
          <button type="button" className="btn btn-bad btn-sm" title="ลบ" aria-label={`ลบกำหนดส่ง ${d.chapter} ${d.term}`} disabled={remove.isPending} onClick={onDelete}>
            <Trash2 />
          </button>
        </div>
      </td>
    </tr>
  )
}
