import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock, CircleAlert, CircleCheck, Clock, FileText, FileUp, Hourglass, MessageSquareText, PencilLine, Send, X,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Async, Avatar, Badge, Modal, PageHeader, Panel, Spinner, TONE, cx, useAction } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { ALLOWED_EXT, CHAPTER_STATUS, MAX_UPLOAD_MB, daysUntil, fileSize, thaiDate, type Tone } from '../lib/format'
import { useProject } from '../lib/queries'
import type { ChapterInfo, ChapterStatus, Review, SubmissionVersion } from '../lib/types'

interface ChaptersData {
  term: string
  chapters: ChapterInfo[]
  canUpload: boolean
  canReview: boolean
}

const NOTE_MAX = 500
const COMMENT_MAX = 1000
const EXTS = ALLOWED_EXT.split(',')
const TEXT_TONE: Partial<Record<Tone, string>> = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok', muted: 'text-muted' }

const statusLabel = (c: ChapterInfo) => (c.status === 'passed' ? `${CHAPTER_STATUS.passed.label} (${c.passCount})` : CHAPTER_STATUS[c.status].label)

// หน้า "เอกสารรายบท" (แทน Chapters.aspx) นิสิตส่งไฟล์ทีละบท อาจารย์ในโครงงานให้ความเห็นเวอร์ชันล่าสุด
export default function Chapters() {
  const { id = '' } = useParams()
  const project = useProject(id)
  const q = useQuery({ queryKey: ['chapters', id], queryFn: () => api.get<ChaptersData>(`/projects/${id}/chapters`) })
  const [uploadChapter, setUploadChapter] = useState('')
  const uploadRef = useRef<HTMLDivElement>(null)
  const p = project.data?.project

  const pickChapter = (chapter: string) => {
    setUploadChapter(chapter)
    uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <PageHeader
        title="เอกสารรายบท"
        subtitle={p ? `${p.nameTh} · ปีการศึกษา ${p.term}` : undefined}
        back={`/projects/${id}`}
      />
      <Async q={q}>
        {(data) => (
          <>
            <Summary chapters={data.chapters} />
            <div className={cx('grid grid-cols-1 gap-6', data.canUpload && 'lg:grid-cols-3')}>
              {data.canUpload && (
                <div ref={uploadRef} className="min-w-0 scroll-mt-20 lg:sticky lg:top-20 lg:order-2 lg:self-start">
                  <UploadPanel projectId={id} chapters={data.chapters} chapter={uploadChapter} onChapter={setUploadChapter} />
                </div>
              )}
              <div className={cx('flex min-w-0 flex-col gap-4', data.canUpload && 'lg:order-1 lg:col-span-2')}>
                {data.chapters.map((c) => (
                  <ChapterCard
                    key={c.chapter}
                    c={c}
                    projectId={id}
                    canUpload={data.canUpload}
                    canReview={data.canReview}
                    onUpload={() => pickChapter(c.chapter)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </Async>
    </>
  )
}

function Summary({ chapters }: { chapters: ChapterInfo[] }) {
  const count = (s: ChapterStatus) => chapters.filter((c) => c.status === s).length
  const items: { status: ChapterStatus; icon: LucideIcon }[] = [
    { status: 'passed', icon: CircleCheck },
    { status: 'revise', icon: PencilLine },
    { status: 'waiting', icon: Hourglass },
    { status: 'overdue', icon: CircleAlert },
    { status: 'not_submitted', icon: Clock },
  ]
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items
        .filter((it) => it.status !== 'overdue' || count('overdue') > 0)
        .map(({ status, icon: I }) => (
          <span key={status} className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium', TONE[CHAPTER_STATUS[status].tone])}>
            <I className="size-4" /> {CHAPTER_STATUS[status].label} <b className="font-semibold">{count(status)}</b>
          </span>
        ))}
    </div>
  )
}

function DeadlineLine({ c }: { c: ChapterInfo }) {
  if (!c.deadline) return <p className="panel-sub">ยังไม่มีกำหนดส่ง</p>
  const d = daysUntil(c.deadline.dueDate)
  // บอกเวลาที่เหลือเฉพาะบทที่ยังต้องส่ง (ยังไม่ส่ง/เลยกำหนด/ต้องแก้ไข)
  const showHint = c.status !== 'passed' && c.status !== 'waiting'
  const hint: { text: string; tone: Tone } | null = !showHint
    ? null
    : d > 0
      ? { text: `เหลืออีก ${d} วัน`, tone: d <= 7 ? 'warn' : 'muted' }
      : d === 0
        ? { text: 'ครบกำหนดวันนี้', tone: 'warn' }
        : { text: `เลยกำหนด ${-d} วัน`, tone: 'bad' }
  return (
    <p className="panel-sub flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> กำหนดส่ง {thaiDate(c.deadline.dueDate)}</span>
      {hint && <span className={cx('font-medium', TEXT_TONE[hint.tone])}>· {hint.text}</span>}
      {c.deadline.note && <span>· {c.deadline.note}</span>}
    </p>
  )
}

function ChapterCard({ c, projectId, canUpload, canReview, onUpload }: {
  c: ChapterInfo
  projectId: string
  canUpload: boolean
  canReview: boolean
  onUpload: () => void
}) {
  const [latest, ...older] = c.versions
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <div className="min-w-0">
          <h2 className="panel-title flex flex-wrap items-center gap-2">
            {c.chapter}
            <Badge tone={CHAPTER_STATUS[c.status].tone}>{statusLabel(c)}</Badge>
          </h2>
          <DeadlineLine c={c} />
        </div>
        {canUpload && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUpload}>
            <FileUp /> {c.versions.length ? 'ส่งเวอร์ชันใหม่' : 'ส่งไฟล์'}
          </button>
        )}
      </div>
      {latest ? (
        <div className="divide-y divide-line">
          <VersionRow v={latest} chapter={c.chapter} projectId={projectId} latest canReview={canReview} />
          {older.length > 0 && (
            <details>
              <summary className="cursor-pointer px-5 py-3 text-sm text-muted select-none hover:text-accent">
                เวอร์ชันก่อนหน้า ({older.length})
              </summary>
              <div className="divide-y divide-line border-t border-line bg-surface-2/40">
                {older.map((v) => <VersionRow key={v.id} v={v} chapter={c.chapter} projectId={projectId} />)}
              </div>
            </details>
          )}
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-muted">ยังไม่มีการส่งเอกสารบทนี้</p>
      )}
    </section>
  )
}

function VersionRow({ v, chapter, projectId, latest = false, canReview = false }: {
  v: SubmissionVersion
  chapter: string
  projectId: string
  latest?: boolean
  canReview?: boolean
}) {
  const me = useMe()
  const [open, setOpen] = useState(false)
  const mine = v.reviews.find((r) => r.reviewer?.id === me.id)
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cx(
            'inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-semibold',
            latest ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
          )}
        >
          v{v.version}
        </span>
        <div className="min-w-0 flex-1">
          <a href={`/api/submissions/${v.id}/download`} className="inline-flex max-w-full items-start gap-1.5 font-medium wrap-anywhere">
            <FileText className="mt-0.5 size-4 shrink-0" />
            <span>{v.fileName}</span>
          </a>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{fileSize(v.size)}</span>
            <span>·</span>
            <span>{v.uploadedBy?.name ?? '-'}</span>
            <span>·</span>
            <span>{thaiDate(v.createdAt, true)}</span>
            {v.late && <Badge tone="bad">ส่งช้า</Badge>}
          </div>
          {v.note && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">{v.note}</p>}
        </div>
        {latest && canReview && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            <MessageSquareText /> {mine ? 'แก้ไขความเห็น' : 'ให้ความเห็น'}
          </button>
        )}
      </div>
      {v.reviews.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 sm:pl-12">
          {v.reviews.map((r, i) => <ReviewItem key={r.reviewer?.id ?? i} r={r} mine={r === mine} />)}
        </ul>
      )}
      {latest && canReview && (
        <Modal open={open} onClose={() => setOpen(false)} title={`ให้ความเห็น ${chapter} v${v.version}`}>
          <ReviewForm v={v} projectId={projectId} mine={mine} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </div>
  )
}

function ReviewItem({ r, mine }: { r: Review; mine: boolean }) {
  return (
    <li className={cx('flex gap-3 rounded-xl border p-3', mine ? 'border-accent/40 bg-accent/5' : 'border-line')}>
      <Avatar name={r.reviewer?.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{r.reviewer?.name ?? '-'}</span>
          <Badge tone={r.verdict === 'pass' ? 'ok' : 'warn'}>{r.verdict === 'pass' ? 'ผ่าน' : 'ต้องแก้ไข'}</Badge>
          {mine && <Badge tone="accent">ความเห็นของคุณ</Badge>}
          <span className="text-xs text-muted">{thaiDate(r.createdAt, true)}</span>
        </div>
        {r.comment && <p className="mt-1 text-sm whitespace-pre-wrap wrap-anywhere">{r.comment}</p>}
      </div>
    </li>
  )
}

const VERDICTS: { value: Review['verdict']; label: string; note: string; icon: LucideIcon; active: string }[] = [
  { value: 'pass', label: 'ผ่าน', note: 'เอกสารเวอร์ชันนี้เรียบร้อย', icon: CircleCheck, active: 'border-ok bg-ok/10 text-ok' },
  { value: 'revise', label: 'ต้องแก้ไข', note: 'ระบุสิ่งที่นิสิตต้องแก้ไข', icon: PencilLine, active: 'border-warn bg-warn/10 text-warn' },
]

// ฟอร์มอยู่ใน Modal จึงสร้างใหม่ทุกครั้งที่เปิด (ค่าเริ่มต้นคือความเห็นเดิมของอาจารย์ถ้ามี)
function ReviewForm({ v, projectId, mine, onDone }: { v: SubmissionVersion; projectId: string; mine?: Review; onDone: () => void }) {
  const [verdict, setVerdict] = useState<Review['verdict']>(mine?.verdict ?? 'pass')
  const [comment, setComment] = useState(mine?.comment ?? '')
  const needComment = verdict === 'revise' && !comment.trim()
  const save = useAction(
    async () => {
      await api.post(`/submissions/${v.id}/review`, { verdict, comment: comment.trim() })
      return verdict
    },
    {
      success: (r) => (r === 'pass' ? 'บันทึกผล “ผ่าน” แล้ว' : 'ส่งความเห็นให้นิสิตแก้ไขแล้ว'),
      invalidate: [['chapters', projectId], ['dashboard'], ['activity', projectId]],
      onSuccess: onDone,
    },
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!needComment) save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="flex items-start gap-1.5 text-sm text-muted">
        <FileText className="mt-0.5 size-4 shrink-0" />
        <a href={`/api/submissions/${v.id}/download`} className="wrap-anywhere">{v.fileName}</a>
      </p>
      <div role="radiogroup" aria-label="ผลการตรวจ" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {VERDICTS.map((o) => (
          <label
            key={o.value}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
              verdict === o.value ? o.active : 'border-line text-ink hover:bg-surface-2',
            )}
          >
            <input type="radio" name="verdict" value={o.value} checked={verdict === o.value} onChange={() => setVerdict(o.value)} className="sr-only" />
            <o.icon className="mt-0.5 size-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted">{o.note}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="field">
        <span className="flex justify-between gap-2">
          <span>
            ความเห็น {verdict === 'revise' ? <b className="text-bad">*</b> : <small className="font-normal text-muted">(ไม่บังคับ)</small>}
          </span>
          <small className="font-normal text-muted">{comment.length}/{COMMENT_MAX}</small>
        </span>
        <textarea
          className="input min-h-32"
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={verdict === 'revise' ? 'ระบุสิ่งที่ต้องแก้ไขให้นิสิต' : 'ข้อเสนอแนะเพิ่มเติม'}
          required={verdict === 'revise'}
        />
      </label>
      {mine && <p className="text-xs text-muted">คุณให้ความเห็นเวอร์ชันนี้แล้ว การบันทึกอีกครั้งจะแทนที่ความเห็นเดิม</p>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className="btn btn-ghost" onClick={onDone}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={save.isPending || needComment}>
          {save.isPending ? <Spinner className="text-accent-ink" /> : <Send />} บันทึกความเห็น
        </button>
      </div>
    </form>
  )
}

function UploadPanel({ projectId, chapters, chapter, onChapter }: {
  projectId: string
  chapters: ChapterInfo[]
  chapter: string
  onChapter: (c: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [dragging, setDragging] = useState(false)

  const pick = (f: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ''
    if (!f) return
    const dot = f.name.lastIndexOf('.')
    const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
    if (!EXTS.includes(ext)) return toast.error(`ไม่รองรับไฟล์นี้ (${ext || 'ไม่มีนามสกุล'})`)
    if (f.size === 0) return toast.error('ไฟล์ว่างเปล่า')
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast.error(`ไฟล์ใหญ่เกินไป (ไม่เกิน ${MAX_UPLOAD_MB} MB)`)
    setFile(f)
  }

  const submit = useAction(
    () => {
      const fd = new FormData()
      fd.append('chapter', chapter)
      fd.append('note', note.trim())
      fd.append('file', file!)
      return api.post<{ chapter: string; version: number }>(`/projects/${projectId}/submissions`, fd)
    },
    {
      success: (r) => `ส่งเอกสารแล้ว: ${r.chapter} เวอร์ชัน ${r.version}`,
      invalidate: [['chapters', projectId], ['dashboard'], ['projects'], ['activity', projectId]],
      onSuccess: () => {
        setFile(null)
        setNote('')
      },
    },
  )

  const target = chapters.find((c) => c.chapter === chapter)
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!chapter) return toast.error('กรุณาเลือกบทที่จะส่ง')
    if (!file) return toast.error('ยังไม่ได้เลือกไฟล์')
    submit.mutate()
  }

  return (
    <Panel title="ส่งเอกสาร" sub="ส่งใหม่ได้เรื่อย ๆ ระบบเก็บไว้ทุกเวอร์ชัน">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="field">
          <span>บทที่ส่ง</span>
          <select className="input" required value={chapter} onChange={(e) => onChapter(e.target.value)}>
            <option value="" disabled>— เลือกบท —</option>
            {chapters.map((c) => (
              <option key={c.chapter} value={c.chapter}>
                {c.chapter} ({statusLabel(c)})
              </option>
            ))}
          </select>
          {target && target.versions.length > 0 && (
            <small className="text-xs text-muted">จะส่งเป็นเวอร์ชัน {target.versions[0].version + 1}</small>
          )}
        </label>

        <div className="field">
          <span>ไฟล์</span>
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <FileText className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm" title={file.name}>{file.name}</span>
                <span className="block text-xs text-muted">{fileSize(file.size)}</span>
              </span>
              <button type="button" className="rounded-lg p-1 text-muted hover:bg-surface hover:text-bad" aria-label="นำไฟล์ออก" onClick={() => setFile(null)}>
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pick(e.dataTransfer.files[0])
              }}
              className={cx(
                'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition',
                dragging ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-accent/60',
              )}
            >
              <FileUp className="size-6 text-accent" />
              <span className="text-sm font-medium text-ink">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</span>
              <span className="text-xs text-muted">ไม่เกิน {MAX_UPLOAD_MB} MB · PDF, Word, รูปภาพ, ZIP ฯลฯ</span>
              <input ref={inputRef} type="file" accept={ALLOWED_EXT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <label className="field">
          <span className="flex justify-between gap-2">
            <span>หมายเหตุ <small className="font-normal text-muted">(ไม่บังคับ)</small></span>
            <small className="font-normal text-muted">{note.length}/{NOTE_MAX}</small>
          </span>
          <textarea className="input min-h-20" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น แก้ไขตามความเห็นของอาจารย์แล้ว" />
        </label>

        <button className="btn btn-primary" disabled={submit.isPending || !file || !chapter}>
          {submit.isPending ? <Spinner className="text-accent-ink" /> : <Send />} ส่งเอกสาร
        </button>
      </form>
    </Panel>
  )
}
