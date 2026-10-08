import { useQuery } from '@tanstack/react-query'
import { Check, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, qs } from '../lib/api'
import { Avatar, Spinner, cx } from './ui'

export interface PickedUser {
  id: string
  name: string
  studentId?: string
  email: string
}

// ค้นหาแล้วเลือกผู้ใช้ 1 คน (นิสิตค้นด้วยชื่อ/รหัสนิสิต/อีเมล อาจารย์แสดงทั้งหมด)
export function UserPicker({ role, value, onChange, exclude = [] }: {
  role: 'student' | 'teacher'
  value: PickedUser | null
  onChange: (u: PickedUser | null) => void
  exclude?: string[]
}) {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])

  const res = useQuery({
    queryKey: ['user-search', role, q],
    queryFn: () => api.get<{ users: PickedUser[] }>(`/users/search${qs({ role, q })}`),
    enabled: role === 'teacher' || q.length > 0,
  })
  const users = (res.data?.users ?? []).filter((u) => !exclude.includes(u.id))

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          className="input pl-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={role === 'student' ? 'พิมพ์ชื่อ รหัสนิสิต หรืออีเมล' : 'ค้นหาชื่ออาจารย์'}
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
        {res.isFetching && !res.data && <div className="flex justify-center p-4"><Spinner /></div>}
        {role === 'student' && !q && <div className="p-4 text-center text-sm text-muted">พิมพ์เพื่อค้นหานิสิต</div>}
        {res.data && users.length === 0 && <div className="p-4 text-center text-sm text-muted">ไม่พบผู้ใช้</div>}
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onChange(value?.id === u.id ? null : u)}
            className={cx('flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface-2', value?.id === u.id && 'bg-accent/10')}
          >
            <Avatar name={u.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{u.name}</span>
              <span className="block truncate text-xs text-muted">{u.studentId ? `${u.studentId} · ` : ''}{u.email}</span>
            </span>
            {value?.id === u.id && <Check className="size-4 text-accent" />}
          </button>
        ))}
      </div>
    </div>
  )
}
