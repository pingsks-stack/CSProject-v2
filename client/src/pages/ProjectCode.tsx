import { useQuery } from '@tanstack/react-query'
import { Check, CodeXml, Copy, GitBranch, Plus, Save, Search, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Async, Badge, Empty, PageHeader, Spinner, cx, useAction, useConfirm } from '../components/ui'
import { api } from '../lib/api'
import { LANGUAGES, languageLabel, thaiDate } from '../lib/format'
import { useProject } from '../lib/queries'
import type { CodeItem } from '../lib/types'

interface Draft {
  language: string
  functionName: string
  code: string
}

const NEW = 'new'
const toDraft = (c: CodeItem | null): Draft => (c ? { language: c.language, functionName: c.functionName, code: c.code } : { language: 'python', functionName: '', code: '' })
const sameDraft = (a: Draft, b: Draft) => a.language === b.language && a.functionName === b.functionName && a.code === b.code
const lineCount = (code: string) => (code ? code.split('\n').length : 0)

// หน้า "ซอร์สโค้ดของโครงงาน" (แทน CodeEdit.aspx) นิสิตในโครงงาน/แอดมินแก้ไขได้ คนอื่นดูอย่างเดียว
export default function ProjectCode() {
  const { id = '' } = useParams()
  const project = useProject(id)
  const codes = useQuery({ queryKey: ['codes', id], queryFn: () => api.get<{ codes: CodeItem[] }>(`/projects/${id}/codes`) })
  return (
    <>
      <PageHeader title="ซอร์สโค้ดของโครงงาน" subtitle={project.data?.project.nameTh} back={`/projects/${id}`} />
      <Async q={project}>
        {({ viewer }) => (
          <Async q={codes}>{({ codes }) => <CodeWorkspace projectId={id} codes={codes} canEdit={viewer.canEdit} />}</Async>
        )}
      </Async>
    </>
  )
}

function CodeWorkspace({ projectId, codes, canEdit }: { projectId: string; codes: CodeItem[]; canEdit: boolean }) {
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const detailRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [sel, setSel] = useState(() => {
    const fromUrl = params.get('id')
    if (fromUrl && codes.some((c) => c.id === fromUrl)) return fromUrl
    return codes[0]?.id ?? NEW
  })
  const current = codes.find((c) => c.id === sel) ?? null
  const [draft, setDraft] = useState<Draft>(() => toDraft(current))
  // โค้ดที่นำเข้าจาก GitHub อัปเดตตาม repository จึงแก้ไขในหน้านี้ไม่ได้ (ลบได้)
  const editable = canEdit && !current?.githubPath
  const dirty = editable && !sameDraft(draft, toDraft(current))

  const show = (next: string, nextDraft: Draft) => {
    setSel(next)
    setDraft(nextDraft)
    setParams(next === NEW ? {} : { id: next }, { replace: true })
  }

  const select = async (next: string) => {
    if (next === sel && next !== NEW) return
    if (dirty) {
      const ok = await confirm({ title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?', text: 'โค้ดที่แก้ไขไว้จะหายไป', confirmText: 'ทิ้งการแก้ไข', danger: true })
      if (!ok) return
    }
    show(next, toDraft(codes.find((c) => c.id === next) ?? null))
    // จอเล็ก รายการอยู่ด้านบน เลื่อนลงไปที่โค้ดให้เห็นทันที
    if (window.matchMedia('(max-width: 1023px)').matches) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const save = useAction(
    async (body: Draft) => {
      if (current) {
        await api.put(`/codes/${current.id}`, body)
        return { id: current.id, body }
      }
      const r = await api.post<{ id: string }>(`/projects/${projectId}/codes`, body)
      return { id: r.id, body }
    },
    {
      success: 'บันทึกโค้ดแล้ว',
      invalidate: [['codes'], ['project', projectId], ['projects'], ['activity', projectId], ['dashboard']],
      onSuccess: ({ id, body }) => show(id, body),
    },
  )

  const del = useAction((cid: string) => api.del(`/codes/${cid}`), {
    success: 'ลบฟังก์ชันแล้ว',
    invalidate: [['codes'], ['project', projectId], ['projects'], ['activity', projectId], ['dashboard']],
  })

  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = { language: draft.language, functionName: draft.functionName.trim(), code: draft.code }
    if (!body.functionName) return toast.error('กรุณากรอกชื่อฟังก์ชัน')
    if (!body.code.trim()) return toast.error('กรุณาใส่โค้ด')
    save.mutate(body)
  }

  const onDelete = async () => {
    if (!current) return
    const ok = await confirm({
      title: 'ลบฟังก์ชันนี้?',
      text: <>ฟังก์ชัน <b className="font-mono text-ink">{current.functionName}</b> จะถูกลบออกจากโครงงาน</>,
      confirmText: 'ลบฟังก์ชัน',
      danger: true,
    })
    if (!ok) return
    const rest = codes.filter((c) => c.id !== current.id)
    del.mutate(current.id, { onSuccess: () => show(rest[0]?.id ?? NEW, toDraft(rest[0] ?? null)) })
  }

  const term = filter.trim().toLowerCase()
  const list = term ? codes.filter((c) => c.functionName.toLowerCase().includes(term) || languageLabel(c.language).toLowerCase().includes(term)) : codes

  if (!canEdit && codes.length === 0) {
    return (
      <div className="panel">
        <Empty icon={CodeXml} title="ยังไม่มีซอร์สโค้ด">โครงงานนี้ยังไม่ได้เพิ่มซอร์สโค้ด</Empty>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section className="panel min-w-0 self-start overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">ฟังก์ชัน</h2>
            <p className="panel-sub">{codes.length} รายการ</p>
          </div>
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => select(NEW)}>
              <Plus /> เพิ่มใหม่
            </button>
          )}
        </div>
        {codes.length > 5 && (
          <div className="relative border-b border-line p-3">
            <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ค้นหาชื่อฟังก์ชันหรือภาษา" />
          </div>
        )}
        <div className="max-h-[28rem] overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
          {canEdit && !current && (
            <div className="flex items-center gap-3 border-b border-line bg-accent/10 px-4 py-3">
              <span className="kpi-icon size-8 bg-accent text-accent-ink"><Plus className="size-4" /></span>
              <span className="min-w-0 truncate text-sm font-medium">{draft.functionName.trim() || 'ฟังก์ชันใหม่'}</span>
            </div>
          )}
          {codes.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">ยังไม่มีซอร์สโค้ด เริ่มเพิ่มฟังก์ชันแรกได้เลย</p>}
          {codes.length > 0 && list.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">ไม่พบฟังก์ชันที่ค้นหา</p>}
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c.id)}
              className={cx('flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0', sel === c.id ? 'bg-accent/10' : 'hover:bg-surface-2')}
            >
              <span className={cx('kpi-icon size-8', sel === c.id ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted')}>
                {c.githubPath ? <GitBranch className="size-4" /> : <CodeXml className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm font-medium text-ink">{c.functionName}</span>
                <span className="block truncate text-xs text-muted">{languageLabel(c.language)} · {c.lines} บรรทัด · {thaiDate(c.updatedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div ref={detailRef} className="min-w-0 scroll-mt-20">
        {editable ? (
          <form onSubmit={onSave} className="panel overflow-hidden">
            <div className="panel-head">
              <div className="min-w-0">
                <h2 className="panel-title">{current ? 'แก้ไขฟังก์ชัน' : 'เพิ่มฟังก์ชันใหม่'}</h2>
                <p className="panel-sub">
                  {current
                    ? `แก้ไขล่าสุดโดย ${current.updatedBy?.name ?? '-'} · ${thaiDate(current.updatedAt, true)}`
                    : 'เลือกภาษา ตั้งชื่อฟังก์ชัน แล้ววางโค้ด'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {dirty && <Badge tone="warn">ยังไม่บันทึก</Badge>}
                {current && <CopyButton text={draft.code} />}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <label className="field">
                <span>ภาษา</span>
                <select className="input" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  {!LANGUAGES.some((l) => l.value === draft.language) && <option value={draft.language}>{draft.language || 'ไม่ระบุ'}</option>}
                </select>
              </label>
              <label className="field">
                <span className="flex justify-between gap-2">
                  <span>ชื่อฟังก์ชัน <b className="text-bad">*</b></span>
                  <small className="font-normal text-muted">{draft.functionName.length}/100</small>
                </span>
                <input
                  className="input font-mono"
                  required
                  maxLength={100}
                  value={draft.functionName}
                  onChange={(e) => setDraft({ ...draft, functionName: e.target.value })}
                  placeholder="เช่น recommend_courses"
                  spellCheck={false}
                />
              </label>
              <label className="field sm:col-span-2">
                <span className="flex justify-between gap-2">
                  <span>โค้ด <b className="text-bad">*</b></span>
                  <small className="font-normal text-muted">{lineCount(draft.code)} บรรทัด</small>
                </span>
                <textarea
                  className="input min-h-[24rem] font-mono text-[13px] leading-relaxed [tab-size:4]"
                  required
                  wrap="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="วางโค้ดของฟังก์ชันที่นี่"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
              <div>
                {current && (
                  <button type="button" className="btn btn-bad" onClick={onDelete} disabled={del.isPending}>
                    <Trash2 /> ลบฟังก์ชันนี้
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {dirty && current && (
                  <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(current))}>ยกเลิกการแก้ไข</button>
                )}
                <button className="btn btn-primary" disabled={save.isPending || !dirty}>
                  {save.isPending ? <Spinner className="text-accent-ink" /> : <Save />} บันทึก
                </button>
              </div>
            </div>
          </form>
        ) : current ? (
          <section className="panel overflow-hidden">
            <div className="panel-head">
              <div className="min-w-0">
                <h2 className="panel-title truncate font-mono">{current.functionName}</h2>
                <p className="panel-sub">
                  {languageLabel(current.language)} · {current.lines} บรรทัด · แก้ไขล่าสุด {thaiDate(current.updatedAt, true)}
                  {current.updatedBy && !current.githubPath && ` โดย ${current.updatedBy.name}`}
                </p>
                {current.githubPath && (
                  <Badge tone="info" className="mt-1.5"><GitBranch className="size-3.5" /> อัปเดตจาก GitHub อัตโนมัติ · แก้ไขใน repository</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <CopyButton text={current.code} />
                {canEdit && (
                  <button type="button" className="btn btn-bad btn-sm" onClick={onDelete} disabled={del.isPending} aria-label="ลบฟังก์ชันนี้">
                    <Trash2 />
                  </button>
                )}
              </div>
            </div>
            <pre className="max-h-[70vh] overflow-auto bg-surface-2 p-5 font-mono text-[13px] leading-relaxed [tab-size:4]"><code>{current.code}</code></pre>
          </section>
        ) : (
          <div className="panel">
            <Empty icon={CodeXml} title="เลือกฟังก์ชันเพื่อดูโค้ด" />
          </div>
        )}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
      {copied ? <Check className="text-ok" /> : <Copy />} {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
    </button>
  )
}
