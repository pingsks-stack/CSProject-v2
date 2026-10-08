import { useQuery } from '@tanstack/react-query'
import { FolderKanban, KeyRound, Mail, MessagesSquare, Save, type LucideIcon } from 'lucide-react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { Async, Avatar, Badge, Panel, PageHeader, Spinner, useAction } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ROLE_TH } from '../lib/format'
import type { User } from '../lib/types'

interface ProfileData {
  user: User
  stats: { projects: number; messages: number }
}

// หน้า "โปรไฟล์" ดูและแก้ไขข้อมูลส่วนตัว (แทน Profile.aspx)
export default function Profile() {
  const { refresh } = useAuth()
  const q = useQuery({ queryKey: ['profile'], queryFn: () => api.get<ProfileData>('/auth/profile') })
  const save = useAction((body: { name: string; mobile: string; emailNotifications: boolean }) => api.put('/auth/profile', body), {
    success: 'บันทึกข้อมูลแล้ว',
    invalidate: [['profile']],
    onSuccess: () => refresh(),
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    save.mutate({
      name: String(fd.get('name') ?? '').trim(),
      mobile: String(fd.get('mobile') ?? '').trim(),
      emailNotifications: fd.get('emailNotifications') === 'on',
    })
  }

  return (
    <>
      <PageHeader title="โปรไฟล์" subtitle="ข้อมูลบัญชีผู้ใช้ของคุณ" />
      <Async q={q}>
        {({ user, stats }) => (
          <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <section className="panel flex flex-col items-center p-6 text-center">
              <Avatar name={user.name} size="lg" />
              <h2 className="mt-3 text-lg">{user.name}</h2>
              <div className="text-sm text-muted">@{user.username}</div>
              <Badge tone="accent" className="mt-2">{ROLE_TH[user.role]}</Badge>
              <div className="mt-5 grid w-full grid-cols-2 gap-3">
                <Stat icon={FolderKanban} label={user.role === 'teacher' ? 'โครงงานที่ดูแล' : 'โครงงาน'} value={stats.projects} />
                <Stat icon={MessagesSquare} label="ข้อความที่ส่ง" value={stats.messages} />
              </div>
              <Link to="/password" className="btn btn-ghost mt-5 w-full"><KeyRound /> เปลี่ยนรหัสผ่าน</Link>
            </section>

            <Panel title="แก้ไขข้อมูลส่วนตัว" sub="ชื่อผู้ใช้ อีเมล และรหัสนิสิต แก้ไขได้โดยผู้ดูแลระบบเท่านั้น">
              <form key={`${user.name}|${user.mobile}|${user.emailNotifications}`} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
                <label className="field sm:col-span-2">
                  <span>ชื่อ-นามสกุล</span>
                  <input name="name" className="input" required maxLength={100} defaultValue={user.name} autoComplete="name" />
                </label>
                <label className="field">
                  <span>เบอร์โทรศัพท์</span>
                  <input
                    name="mobile"
                    className="input"
                    defaultValue={user.mobile}
                    pattern="0\d{9}"
                    inputMode="tel"
                    maxLength={10}
                    title="ตัวเลข 10 หลักขึ้นต้นด้วย 0"
                    placeholder="เช่น 0812345678 (ไม่บังคับ)"
                    autoComplete="tel"
                  />
                </label>
                <ReadOnly label="ชื่อผู้ใช้" value={user.username} />
                <ReadOnly label="อีเมล" value={user.email} />
                {user.studentId && <ReadOnly label="รหัสนิสิต" value={user.studentId} />}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3 sm:col-span-2">
                  <input type="checkbox" name="emailNotifications" defaultChecked={user.emailNotifications} className="mt-1 size-4 accent-[rgb(var(--c-accent))]" />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-ink"><Mail className="size-4" /> รับการแจ้งเตือนทางอีเมล</span>
                    <span className="block text-muted">คำเชิญ ผลการอนุมัติคำขอ ผลตรวจเอกสาร และการเตือนกำหนดส่ง จะส่งไปที่ {user.email} ด้วย (การแจ้งเตือนในระบบยังแสดงตามปกติ)</span>
                  </span>
                </label>
                <div className="flex justify-end sm:col-span-2">
                  <button className="btn btn-primary" disabled={save.isPending}>
                    {save.isPending ? <Spinner className="text-accent-ink" /> : <Save />} บันทึกข้อมูล
                  </button>
                </div>
              </form>
            </Panel>
          </div>
        )}
      </Async>
    </>
  )
}

function Stat({ icon: I, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-3">
      <I className="mx-auto size-4 text-accent" />
      <div className="mt-1 text-xl font-semibold text-ink">{value.toLocaleString('th-TH')}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input cursor-not-allowed text-muted" value={value || '-'} readOnly aria-readonly />
    </label>
  )
}
