import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { ArrowLeft, MessageSquarePlus, MessagesSquare, Search, Send, Star } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Avatar, Badge, Empty, ErrorBox, Loading, PageHeader, Spinner, cx, useAction } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { ROLE_TH, thaiDateLong, timeAgo } from '../lib/format'
import type { Role } from '../lib/types'

interface Conversation {
  user: { id: string; name: string }
  lastText: string
  lastMine: boolean
  lastAt: string
  unread: number
}
interface Contact {
  id: string
  name: string
  related: boolean
  studentId?: string
}
interface Message {
  id: string
  text: string
  mine: boolean
  createdAt: string
  read: boolean
}
interface ThreadData {
  partner: { id: string; name: string; role: Role }
  messages: Message[]
}

const MAX_LEN = 1000
const TZ = 'Asia/Bangkok'
const CONV_KEY = ['chat', 'conversations']
const dayKey = (d: string) => new Date(d).toLocaleDateString('th-TH', { timeZone: TZ })
const clock = (d: string) => new Date(d).toLocaleTimeString('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

// หน้า "แชท" ระหว่างนิสิตกับอาจารย์ (แทน Chat.aspx)
export default function Chat() {
  const me = useMe()
  const { userId } = useParams()
  const isStudent = me.role === 'student'
  const convs = useQuery({
    queryKey: CONV_KEY,
    queryFn: () => api.get<{ conversations: Conversation[] }>('/chat/conversations'),
    refetchInterval: 15_000,
  })
  const contacts = useQuery({
    queryKey: ['chat', 'contacts'],
    queryFn: () => api.get<{ contacts: Contact[] }>('/chat/contacts'),
    staleTime: 5 * 60_000,
  })
  const related = new Set(isStudent ? (contacts.data?.contacts ?? []).filter((c) => c.related).map((c) => c.id) : [])
  const known = convs.data?.conversations.find((c) => c.user.id === userId)?.user.name
    ?? contacts.data?.contacts.find((c) => c.id === userId)?.name

  return (
    <>
      <div className={cx(userId && 'hidden lg:block')}>
        <PageHeader
          title="แชท"
          subtitle={isStudent ? 'สอบถามอาจารย์ที่ปรึกษาและกรรมการ (★ = อาจารย์ในโครงงานของคุณ)' : 'พูดคุยกับนิสิตในโครงงานที่คุณดูแล'}
        />
      </div>
      <div
        className={cx(
          'panel flex min-h-[26rem] overflow-hidden',
          userId ? 'h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-13rem)]' : 'h-[calc(100dvh-14rem)] lg:h-[calc(100dvh-13rem)]',
        )}
      >
        <aside className={cx('w-full min-w-0 flex-col lg:flex lg:w-80 lg:shrink-0 lg:border-r lg:border-line', userId ? 'hidden' : 'flex')}>
          <Sidebar convs={convs} contacts={contacts} related={related} activeId={userId} isStudent={isStudent} />
        </aside>
        <section className={cx('min-w-0 flex-1 flex-col', userId ? 'flex' : 'hidden lg:flex')}>
          {userId ? (
            <Thread key={userId} userId={userId} fallbackName={known} related={related.has(userId)} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Empty icon={MessagesSquare} title="เลือกการสนทนา">
                เลือกการสนทนาจากรายการด้านซ้าย หรือกด “เริ่มแชทใหม่” เพื่อส่งข้อความถึง{isStudent ? 'อาจารย์' : 'นิสิต'}
              </Empty>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

// ===================== รายการการสนทนา / เริ่มแชทใหม่ =====================
function Sidebar({ convs, contacts, related, activeId, isStudent }: {
  convs: UseQueryResult<{ conversations: Conversation[] }>
  contacts: UseQueryResult<{ contacts: Contact[] }>
  related: Set<string>
  activeId?: string
  isStudent: boolean
}) {
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [filter, setFilter] = useState('')
  const s = filter.trim().toLowerCase()

  const togglePicker = (on: boolean) => {
    setPicking(on)
    setFilter('')
  }
  const startChat = (id: string) => {
    togglePicker(false)
    navigate(`/chat/${id}`)
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        {picking ? (
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-accent" onClick={() => togglePicker(false)}>
            <ArrowLeft className="size-4" /> เริ่มแชทใหม่
          </button>
        ) : (
          <>
            <h2 className="text-base font-semibold">การสนทนา</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => togglePicker(true)}>
              <MessageSquarePlus /> เริ่มแชทใหม่
            </button>
          </>
        )}
      </div>
      <div className="border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={picking ? (isStudent ? 'ค้นหาชื่ออาจารย์' : 'ค้นหาชื่อหรือรหัสนิสิต') : 'ค้นหาการสนทนา'}
            aria-label="ค้นหา"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {picking ? (
          contacts.error ? (
            <div className="p-3"><ErrorBox error={contacts.error} /></div>
          ) : !contacts.data ? (
            <Loading />
          ) : (
            <ContactList
              list={contacts.data.contacts.filter((c) => !s || c.name.toLowerCase().includes(s) || c.studentId?.includes(s))}
              isStudent={isStudent}
              onPick={startChat}
            />
          )
        ) : convs.error ? (
          <div className="p-3"><ErrorBox error={convs.error} /></div>
        ) : !convs.data ? (
          <Loading />
        ) : convs.data.conversations.length === 0 ? (
          <Empty icon={MessagesSquare} title="ยังไม่มีการสนทนา">
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => togglePicker(true)}>
              <MessageSquarePlus /> เริ่มแชทใหม่
            </button>
          </Empty>
        ) : (
          <ConversationList
            list={convs.data.conversations.filter((c) => !s || c.user.name.toLowerCase().includes(s))}
            related={related}
            activeId={activeId}
          />
        )}
      </div>
    </>
  )
}

function ConversationList({ list, related, activeId }: { list: Conversation[]; related: Set<string>; activeId?: string }) {
  if (list.length === 0) return <Empty title="ไม่พบการสนทนา">ลองค้นหาด้วยชื่ออื่น หรือกด “เริ่มแชทใหม่”</Empty>
  return (
    <ul>
      {list.map((c) => {
        const active = c.user.id === activeId
        const unread = active ? 0 : c.unread
        return (
          <li key={c.user.id}>
            <Link
              to={`/chat/${c.user.id}`}
              className={cx('flex items-center gap-3 border-b border-line px-4 py-3 no-underline transition', active ? 'bg-accent/10' : 'hover:bg-surface-2')}
              aria-current={active ? 'page' : undefined}
            >
              <Avatar name={c.user.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cx('truncate text-sm text-ink', unread ? 'font-semibold' : 'font-medium')}>{c.user.name}</span>
                  {related.has(c.user.id) && <Star className="size-3.5 shrink-0 self-center fill-gold text-gold" aria-label="อาจารย์ในโครงงานของคุณ" />}
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(c.lastAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cx('truncate text-xs', unread ? 'text-ink' : 'text-muted')}>
                    {c.lastMine && 'คุณ: '}{c.lastText}
                  </span>
                  {unread > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ContactList({ list, isStudent, onPick }: { list: Contact[]; isStudent: boolean; onPick: (id: string) => void }) {
  if (list.length === 0) {
    return (
      <Empty title={isStudent ? 'ไม่พบอาจารย์' : 'ไม่พบนิสิต'}>
        {!isStudent && 'อาจารย์เริ่มแชทได้กับนิสิตในโครงงานที่ดูแลเท่านั้น'}
      </Empty>
    )
  }
  return (
    <ul>
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onPick(c.id)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-surface-2">
            <Avatar name={c.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                {isStudent && c.related && <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-hidden />}
              </span>
              {c.studentId && <span className="block text-xs text-muted">{c.studentId}</span>}
            </span>
            {isStudent && c.related && <Badge tone="gold" className="shrink-0">ในโครงงาน</Badge>}
          </button>
        </li>
      ))}
    </ul>
  )
}

// ===================== ข้อความในเธรด =====================
function Thread({ userId, fallbackName, related }: { userId: string; fallbackName?: string; related: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const key = ['chat', 'thread', userId]
  const thread = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await api.get<ThreadData>(`/chat/thread/${userId}`)
      // server ทำเครื่องหมาย "อ่านแล้ว" ให้ข้อความของคู่สนทนา → โหลดตัวเลขข้อความใหม่ในเมนูและรายการใหม่
      const before = qc.getQueryData<ThreadData>(key)?.messages.findLast((m) => !m.mine)?.id
      const latest = res.messages.findLast((m) => !m.mine)?.id
      const listUnread = qc.getQueryData<{ conversations: Conversation[] }>(CONV_KEY)?.conversations.find((c) => c.user.id === userId)?.unread
      if (latest && (latest !== before || listUnread)) {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        qc.invalidateQueries({ queryKey: CONV_KEY })
      }
      return res
    },
    refetchInterval: (query) => (query.state.status === 'error' ? false : 4000),
  })

  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const send = useAction((t: string) => api.post(`/chat/thread/${userId}`, { text: t }), {
    invalidate: [key, CONV_KEY, ['notifications']],
    onSuccess: () => {
      setText('')
      stick.current = true
      inputRef.current?.focus()
    },
  })

  const messages = thread.data?.messages ?? []
  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ (ถ้าผู้ใช้ไม่ได้เลื่อนขึ้นไปอ่านข้อความเก่า)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t || send.isPending) return
    send.mutate(t)
  }

  const partner = thread.data?.partner
  const name = partner?.name ?? fallbackName ?? 'แชท'
  const lastMine = messages.findLastIndex((m) => m.mine)

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" className="-ml-1 rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => navigate('/chat')} aria-label="กลับไปรายการแชท">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-ink">{name}</span>
            {related && <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-hidden />}
          </div>
          <div className="truncate text-xs text-muted">
            {partner ? ROLE_TH[partner.role] : ' '}
            {related && ' · อาจารย์ในโครงงานของคุณ'}
          </div>
        </div>
        {thread.isFetching && thread.data && <Spinner className="size-4" />}
      </div>

      <div
        ref={boxRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        {thread.error ? (
          <ErrorBox error={thread.error} />
        ) : !thread.data ? (
          <Loading />
        ) : messages.length === 0 ? (
          <Empty icon={MessagesSquare} title="ยังไม่มีข้อความ">เริ่มต้นสนทนากับ {name} ได้เลย</Empty>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m, i) => (
              <Fragment key={m.id}>
                {(i === 0 || dayKey(m.createdAt) !== dayKey(messages[i - 1].createdAt)) && (
                  <div className="my-3 text-center">
                    <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">{thaiDateLong(m.createdAt)}</span>
                  </div>
                )}
                <div className={cx('flex', m.mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cx(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]',
                      m.mine ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-surface-2 text-ink',
                    )}
                  >
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</p>
                    <div className={cx('mt-0.5 text-right text-[11px]', m.mine ? 'text-accent-ink/70' : 'text-muted')}>
                      {clock(m.createdAt)}
                      {i === lastMine && m.read && ' · อ่านแล้ว'}
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {!thread.error && (
        <form onSubmit={submit} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              className="input max-h-40 resize-none"
              rows={Math.min(6, Math.max(1, text.split('\n').length))}
              value={text}
              maxLength={MAX_LEN}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="พิมพ์ข้อความ…"
              aria-label="ข้อความ"
              autoFocus={window.matchMedia('(min-width: 1024px)').matches}
            />
            <button className="btn btn-primary shrink-0 px-3" disabled={!text.trim() || send.isPending} aria-label="ส่งข้อความ" title="ส่ง (Enter)">
              {send.isPending ? <Spinner className="size-4 text-accent-ink" /> : <Send />}
            </button>
          </div>
          <div className="mt-1 flex justify-between gap-2 px-1 text-[11px] text-muted">
            <span className="hidden sm:inline">Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่</span>
            <span className={cx('ml-auto', text.length > MAX_LEN - 50 && 'text-warn')}>{text.length}/{MAX_LEN}</span>
          </div>
        </form>
      )}
    </>
  )
}
