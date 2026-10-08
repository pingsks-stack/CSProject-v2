import { useQuery } from '@tanstack/react-query'
import { GraduationCap, Mail, MessagesSquare, Phone, Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Async, Avatar, Empty, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'

interface Teacher {
  id: string
  name: string
  email: string
  mobile: string
}

// หน้า "รายชื่ออาจารย์" พร้อมช่องทางติดต่อ
export default function Teachers() {
  const me = useMe()
  const [text, setText] = useState('')
  const q = useQuery({ queryKey: ['teachers'], queryFn: () => api.get<{ teachers: Teacher[] }>('/teachers'), staleTime: 5 * 60_000 })
  // แชทได้เฉพาะนิสิต ↔ อาจารย์ (server ไม่อนุญาตอาจารย์ ↔ อาจารย์)
  const canChat = me.role === 'student'

  return (
    <>
      <PageHeader
        title="รายชื่ออาจารย์"
        subtitle={canChat ? 'ติดต่ออาจารย์ทางอีเมล โทรศัพท์ หรือส่งข้อความผ่านแชทในระบบ' : 'ข้อมูลติดต่ออาจารย์ทั้งหมดในระบบ'}
      />
      <Async q={q}>
        {({ teachers }) => {
          const s = text.trim().toLowerCase()
          const list = s
            ? teachers.filter((t) => [t.name, t.email, t.mobile].some((v) => v?.toLowerCase().includes(s)))
            : teachers
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                  <input
                    className="input pl-9"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทร"
                    aria-label="ค้นหาอาจารย์"
                  />
                </div>
                <span className="text-sm text-muted">
                  {s ? `พบ ${list.length} จาก ${teachers.length} ท่าน` : `ทั้งหมด ${teachers.length} ท่าน`}
                </span>
              </div>
              {list.length === 0 ? (
                <div className="panel">
                  {teachers.length === 0
                    ? <Empty icon={GraduationCap} title="ยังไม่มีอาจารย์ในระบบ" />
                    : <Empty icon={SearchX} title="ไม่พบอาจารย์ที่ค้นหา">ลองพิมพ์ชื่อหรืออีเมลใหม่อีกครั้ง</Empty>}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((t) => (
                    <article key={t.id} className="panel flex min-w-0 flex-col p-5">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} />
                        <div className="min-w-0 font-semibold text-ink">{t.name}</div>
                      </div>
                      <div className="mt-4 flex flex-1 flex-col gap-1.5 text-sm">
                        {t.email ? (
                          <a href={`mailto:${t.email}`} className="inline-flex min-w-0 items-center gap-2 no-underline hover:underline">
                            <Mail className="size-4 shrink-0 text-muted" />
                            <span className="truncate">{t.email}</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-muted"><Mail className="size-4" /> -</span>
                        )}
                        {t.mobile ? (
                          <a href={`tel:${t.mobile}`} className="inline-flex items-center gap-2 no-underline hover:underline">
                            <Phone className="size-4 shrink-0 text-muted" />
                            {t.mobile}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-muted"><Phone className="size-4" /> -</span>
                        )}
                      </div>
                      {canChat && (
                        <Link to={`/chat/${t.id}`} className="btn btn-ghost btn-sm mt-4 self-start">
                          <MessagesSquare /> ติดต่ออาจารย์
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )
        }}
      </Async>
    </>
  )
}
