import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Send } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useParams } from 'react-router'
import { Async, Avatar, Badge, Empty, ErrorBox, PageHeader, Spinner, cx, useAction } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { ROLE_TH, TEACHER_ROLE_TH, thaiDateLong } from '../lib/format'
import { useProject } from '../lib/queries'
import type { UserRef } from '../lib/types'

interface Comment {
  id: string
  text: string
  author: UserRef | null
  createdAt: string
}

const TEXT_MAX = 1000
const timeOf = (v: string) => new Date(v).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })

// หน้า "ความเห็นอาจารย์" (แทน CommentAJ / Comment_PassAJ) เธรดเดียวต่ออาจารย์ 1 ท่านในโครงงาน
export default function Comments() {
  const { id = '', teacherId = '' } = useParams()
  const me = useMe()
  const project = useProject(id)
  const q = useQuery({
    queryKey: ['comments', id, teacherId],
    queryFn: () => api.get<{ comments: Comment[] }>(`/projects/${id}/comments/${teacherId}`),
    // โหลดใหม่ทุก 15 วินาที (หยุดถ้าไม่มีสิทธิ์/ไม่พบเธรด)
    refetchInterval: (query) => (query.state.error ? false : 15_000),
  })

  const p = project.data?.project
  const teacher = p?.members.find((m) => m.kind === 'teacher' && m.user.id === teacherId)
  const students = p?.members.filter((m) => m.kind === 'student') ?? []
  const iAmTeacher = me.id === teacherId
  const header = <PageHeader title="ความเห็นอาจารย์" subtitle={p?.nameTh} back={`/projects/${id}`} />

  // ไม่มีสิทธิ์ดูเธรดนี้/ไม่พบอาจารย์ในโครงงาน
  if (q.error) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <ErrorBox error={q.error} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      {header}
      <section className="panel flex flex-col overflow-hidden">
        <div className="panel-head">
          {iAmTeacher ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 -space-x-2">
                {students.map((m) => <Avatar key={m.user.id} name={m.user.name} className="ring-2 ring-surface" />)}
              </div>
              <div className="min-w-0">
                <h2 className="panel-title truncate">{students.map((m) => m.user.name).join(', ') || 'นิสิตในโครงงาน'}</h2>
                <p className="panel-sub">นิสิตในโครงงาน · ทุกคนเห็นเธรดนี้</p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={teacher?.user.name} />
              <div className="min-w-0">
                <h2 className="panel-title truncate">{teacher?.user.name ?? 'อาจารย์'}</h2>
                <p className="panel-sub">ความเห็นระหว่างอาจารย์ท่านนี้กับนิสิตในโครงงาน</p>
              </div>
            </div>
          )}
          {teacher?.teacherRole && <Badge tone="accent">{TEACHER_ROLE_TH[teacher.teacherRole]}</Badge>}
        </div>
        <Async q={q}>{({ comments }) => <Thread comments={comments} myId={me.id} />}</Async>
        <Composer projectId={id} teacherId={teacherId} disabled={!q.data} />
      </section>
    </div>
  )
}

function Thread({ comments, myId }: { comments: Comment[]; myId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length])

  if (comments.length === 0) {
    return (
      <Empty icon={MessageSquare} title="ยังไม่มีความเห็น">
        เริ่มต้นการสนทนาได้ที่ช่องด้านล่าง ข้อความจะแจ้งเตือนไปยังอีกฝ่าย
      </Empty>
    )
  }

  return (
    <div ref={ref} className="flex max-h-[60vh] min-h-64 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-5">
      {comments.map((c, i) => {
        const prev = comments[i - 1]
        const mine = c.author?.id === myId
        const day = thaiDateLong(c.createdAt)
        const newDay = !prev || thaiDateLong(prev.createdAt) !== day
        const showName = !mine && (newDay || prev?.author?.id !== c.author?.id)
        return (
          <Fragment key={c.id}>
            {newDay && (
              <div className="my-1 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                {day}
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <div className={cx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
              {!mine && <Avatar name={c.author?.name} size="sm" className={showName ? undefined : 'invisible'} />}
              <div className={cx('flex max-w-[80%] min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
                {showName && (
                  <span className="mb-1 px-1 text-xs text-muted">
                    {c.author?.name ?? '(ผู้ใช้ถูกลบ)'}
                    {c.author?.role && ` · ${ROLE_TH[c.author.role]}`}
                  </span>
                )}
                <div
                  className={cx(
                    'rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap wrap-anywhere',
                    mine ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-surface-2 text-ink',
                  )}
                >
                  {c.text}
                </div>
                <span className="mt-1 px-1 text-[11px] text-muted">{timeOf(c.createdAt)}</span>
              </div>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

function Composer({ projectId, teacherId, disabled }: { projectId: string; teacherId: string; disabled: boolean }) {
  const [text, setText] = useState('')
  const send = useAction((t: string) => api.post(`/projects/${projectId}/comments/${teacherId}`, { text: t }), {
    invalidate: [['comments', projectId, teacherId]],
  })

  const submit = () => {
    const t = text.trim()
    if (!t || send.isPending) return
    setText('')
    send.mutate(t, { onError: () => setText(t) })
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submit()
  }

  // Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={onSubmit} className="border-t border-line p-3 sm:p-4">
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          className="input max-h-40 min-h-[42px] flex-1 resize-none [field-sizing:content]"
          value={text}
          maxLength={TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="พิมพ์ความเห็น…"
          aria-label="ความเห็น"
          disabled={disabled}
        />
        <button className="btn btn-primary h-[42px] shrink-0" disabled={disabled || !text.trim() || send.isPending} aria-label="ส่ง">
          {send.isPending ? <Spinner className="text-accent-ink" /> : <Send />}
          <span className="hidden sm:inline">ส่ง</span>
        </button>
      </div>
      <div className="mt-1.5 flex justify-between gap-2 px-1 text-[11px] text-muted">
        <span className="hidden sm:inline">Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่</span>
        <span className="ml-auto">{text.length}/{TEXT_MAX}</span>
      </div>
    </form>
  )
}
