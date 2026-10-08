import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, Copy, Dices, GraduationCap, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, Users as UsersIcon, X } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { SearchBox } from '../../components/filters'
import { Async, Avatar, Badge, Empty, Kpi, Modal, PageHeader, Panel, Tabs, cx, useAction, useConfirm } from '../../components/ui'
import { api, qs } from '../../lib/api'
import { useMe } from '../../lib/auth'
import { ROLE_TH, type Tone } from '../../lib/format'
import type { Role, User } from '../../lib/types'

type AdminUser = User & { projects: number }
type RoleFilter = '' | Role

interface UsersRes {
  users: AdminUser[]
  counts: Partial<Record<Role, number>>
}

// ชื่อผู้ใช้และรหัสผ่านชั่วคราวที่ต้องแจ้งเจ้าของบัญชี
interface Issued {
  name: string
  username: string
  password: string
}

const ROLES: Role[] = ['student', 'teacher', 'admin']
const ROLE_TONE: Record<Role, Tone> = { student: 'info', teacher: 'accent', admin: 'gold' }
const TAB_LABEL: Record<Role, string> = { student: 'นิสิต', teacher: 'อาจารย์', admin: 'แอดมิน' }

// รหัสผ่านชั่วคราว 10 ตัว (ตัดตัวที่สับสนง่ายออก เช่น 0/O, 1/l/I) ชุดอักษรเดียวกับ server
const PW_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
function randomPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => PW_CHARS[b % PW_CHARS.length]).join('')
}

// หน้า "ผู้ใช้งาน" ของแอดมิน (แทน Admin_Users.aspx)
export default function AdminUsers() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const roleParam = params.get('role') as Role | null
  const role: RoleFilter = roleParam && ROLES.includes(roleParam) ? roleParam : ''
  const search = params.get('q') ?? ''
  const setParam = (k: 'role' | 'q', v: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (v) next.set(k, v)
      else next.delete(k)
      return next
    }, { replace: true })

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)

  const q = useQuery({
    queryKey: ['admin', 'users', role, search],
    queryFn: () => api.get<UsersRes>(`/admin/users${qs({ role, q: search })}`),
    placeholderData: keepPreviousData,
  })
  const counts = q.data?.counts
  const count = (r: Role) => (counts ? counts[r] ?? 0 : undefined)
  const total = counts ? ROLES.reduce((n, r) => n + (counts[r] ?? 0), 0) : undefined
  const kpi = (r: Role) => count(r)?.toLocaleString('th-TH') ?? '–'

  return (
    <>
      <PageHeader
        title="ผู้ใช้งาน"
        subtitle="สร้างบัญชีอาจารย์/นิสิต เปลี่ยนบทบาท และรีเซ็ตรหัสผ่าน"
        actions={
          <button type="button" className={cx('btn', creating ? 'btn-ghost' : 'btn-primary')} onClick={() => setCreating((v) => !v)}>
            {creating ? <><X /> ปิดแบบฟอร์ม</> : <><UserPlus /> สร้างบัญชีใหม่</>}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi icon={GraduationCap} tone={ROLE_TONE.student} label="นิสิต" value={kpi('student')} note="บัญชีนิสิตทั้งหมด" />
        <Kpi icon={UsersIcon} tone={ROLE_TONE.teacher} label="อาจารย์" value={kpi('teacher')} note="อาจารย์ที่ปรึกษาและกรรมการ" />
        <Kpi icon={ShieldCheck} tone={ROLE_TONE.admin} label="ผู้ดูแลระบบ" value={kpi('admin')} note="บัญชีแอดมิน" />
      </div>

      {creating && <CreateUser onClose={() => setCreating(false)} />}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <Tabs<RoleFilter>
            value={role}
            onChange={(v) => setParam('role', v)}
            items={[
              { value: '', label: 'ทั้งหมด', count: total },
              ...ROLES.map((r) => ({ value: r, label: TAB_LABEL[r], count: count(r) })),
            ]}
          />
          <SearchBox value={search} onChange={(v) => setParam('q', v)} placeholder="ชื่อ ชื่อผู้ใช้ อีเมล หรือรหัสนิสิต" />
        </div>
        <Async q={q}>
          {({ users }) =>
            users.length === 0 ? (
              <Empty icon={UsersIcon} title="ไม่พบผู้ใช้">
                {search ? `ไม่พบผู้ใช้ที่ตรงกับ "${search}"` : undefined}
              </Empty>
            ) : (
              <div className={cx('overflow-x-auto transition-opacity', q.isPlaceholderData && 'opacity-60')}>
                <table className="table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>ผู้ใช้</th>
                      <th>อีเมล</th>
                      <th>บทบาท</th>
                      <th>รหัสนิสิต / เบอร์</th>
                      <th className="text-center">โครงงาน</th>
                      <th className="text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <UserRow key={u.id} u={u} self={u.id === me.id} onEdit={setEditing} onIssued={setIssued} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </section>

      {editing && <EditUser key={editing.id} u={editing} self={editing.id === me.id} onClose={() => setEditing(null)} />}
      {issued && (
        <Modal open onClose={() => setIssued(null)} title="รีเซ็ตรหัสผ่านแล้ว" footer={<button type="button" className="btn btn-primary" onClick={() => setIssued(null)}>เสร็จสิ้น</button>}>
          <p className="mb-3 text-sm text-muted">
            รหัสผ่านชั่วคราวของ <span className="font-medium text-ink">{issued.name}</span> แจ้งให้ผู้ใช้เข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านใหม่ (รหัสนี้จะไม่แสดงอีก)
          </p>
          <Credentials username={issued.username} password={issued.password} />
        </Modal>
      )}
    </>
  )
}

function UserRow({ u, self, onEdit, onIssued }: { u: AdminUser; self: boolean; onEdit: (u: AdminUser) => void; onIssued: (i: Issued) => void }) {
  const confirm = useConfirm()
  const invalidate = [['admin', 'users'], ['dashboard']]
  const changeRole = useAction((role: Role) => api.patch(`/admin/users/${u.id}`, { role }).then(() => role), {
    success: (r) => `เปลี่ยน ${u.name} เป็น${ROLE_TH[r]}แล้ว`,
    invalidate,
  })
  const reset = useAction((password: string) => api.post<{ password: string }>(`/admin/users/${u.id}/reset-password`, { password }), {
    onSuccess: (r) => onIssued({ name: u.name, username: u.username, password: r.password }),
  })
  const remove = useAction(() => api.del(`/admin/users/${u.id}`), { success: `ลบบัญชี ${u.name} แล้ว`, invalidate })
  const busy = changeRole.isPending || reset.isPending || remove.isPending

  const onRole = async (r: Role) => {
    const ok = await confirm({ title: 'เปลี่ยนบทบาท', text: `เปลี่ยน "${u.name}" เป็น${ROLE_TH[r]} ใช่ไหม?`, confirmText: 'เปลี่ยนบทบาท' })
    if (ok) changeRole.mutate(r)
  }
  const onReset = async () => {
    const v = await confirm({
      title: 'รีเซ็ตรหัสผ่าน',
      text: `รหัสผ่านชั่วคราวใหม่ของ "${u.name}" (อย่างน้อย 6 ตัว) แก้ไขได้ก่อนยืนยัน`,
      input: { label: 'รหัสผ่านชั่วคราว', defaultValue: randomPassword() },
      confirmText: 'รีเซ็ตรหัสผ่าน',
    })
    if (v === false) return
    const pw = v.trim()
    if (pw.length < 6 || pw.length > 50) {
      toast.error('รหัสผ่านต้องยาว 6–50 ตัวอักษร')
      return
    }
    reset.mutate(pw)
  }
  const onDelete = async () => {
    const ok = await confirm({ title: 'ลบบัญชี', text: `ต้องการลบบัญชี "${u.name}" ใช่ไหม? ลบแล้วกู้คืนไม่ได้`, confirmText: 'ลบบัญชี', danger: true })
    if (ok) remove.mutate()
  }

  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <Avatar name={u.name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 font-medium text-ink">
              {u.name} {self && <Badge tone="accent">คุณ</Badge>}
            </div>
            <div className="text-xs text-muted">@{u.username}</div>
          </div>
        </div>
      </td>
      <td>{u.email}</td>
      <td><Badge tone={ROLE_TONE[u.role]}>{ROLE_TH[u.role]}</Badge></td>
      <td className="whitespace-nowrap">
        {u.studentId && <div>{u.studentId}</div>}
        {u.mobile && <div className={cx(u.studentId && 'text-xs text-muted')}>{u.mobile}</div>}
        {!u.studentId && !u.mobile && <span className="text-muted">-</span>}
      </td>
      <td className="text-center">{u.projects || <span className="text-muted">0</span>}</td>
      <td>
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {!self && (
            <select
              className="input w-auto py-1.5 text-xs"
              value=""
              disabled={busy || u.projects > 0}
              title={u.projects > 0 ? 'ผู้ใช้นี้อยู่ในโครงงาน เปลี่ยนบทบาทไม่ได้' : undefined}
              aria-label={`เปลี่ยนบทบาทของ ${u.name}`}
              onChange={(e) => onRole(e.target.value as Role)}
            >
              <option value="" disabled>เปลี่ยนบทบาท…</option>
              {ROLES.filter((r) => r !== u.role).map((r) => <option key={r} value={r}>{ROLE_TH[r]}</option>)}
            </select>
          )}
          {/* จอไม่กว้างมากแสดงเฉพาะไอคอน ตารางจะได้ไม่ต้องเลื่อนซ้ายขวา */}
          <button type="button" className="btn btn-ghost btn-sm" title="แก้ไขข้อมูล" aria-label="แก้ไขข้อมูล" disabled={busy} onClick={() => onEdit(u)}>
            <Pencil /><span className="hidden 2xl:inline">แก้ไข</span>
          </button>
          <button type="button" className="btn btn-ghost btn-sm" title="รีเซ็ตรหัสผ่าน" aria-label="รีเซ็ตรหัสผ่าน" disabled={busy} onClick={onReset}>
            <KeyRound /><span className="hidden 2xl:inline">รีเซ็ตรหัส</span>
          </button>
          {!self && u.projects === 0 && (
            <button type="button" className="btn btn-bad btn-sm" title="ลบบัญชี" aria-label="ลบบัญชี" disabled={busy} onClick={onDelete}>
              <Trash2 /><span className="hidden 2xl:inline">ลบ</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ===================== สร้างบัญชีใหม่ =====================
interface NewUser {
  role: Role
  name: string
  username: string
  email: string
  mobile: string
  studentId: string
  password: string
}
const blankUser = (role: Role = 'teacher'): NewUser => ({ role, name: '', username: '', email: '', mobile: '', studentId: '', password: randomPassword() })

function CreateUser({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(blankUser)
  const [created, setCreated] = useState<(Issued & { role: Role }) | null>(null)
  const set = (k: keyof NewUser) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isStudent = form.role === 'student'

  const create = useAction(
    (b: NewUser) =>
      api.post<{ user: User }>('/admin/users', { ...b, studentId: b.role === 'student' ? b.studentId : '' }).then((r) => ({ user: r.user, password: b.password })),
    {
      success: 'สร้างบัญชีแล้ว',
      invalidate: [['admin', 'users'], ['dashboard']],
      onSuccess: ({ user, password }) => {
        setCreated({ name: user.name, username: user.username, password, role: user.role })
        setForm((f) => blankUser(f.role))
      },
    },
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate({ ...form, name: form.name.trim(), username: form.username.trim(), email: form.email.trim(), mobile: form.mobile.trim(), studentId: form.studentId.trim() })
  }

  return (
    <Panel title="สร้างบัญชีใหม่" sub="แจ้งชื่อผู้ใช้และรหัสผ่านชั่วคราวให้เจ้าของบัญชี แล้วให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ" className="mb-6">
      {created && (
        <div className="mb-5 rounded-xl border border-ok/30 bg-ok/10 p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-ok"><Check className="size-4" /> สร้างบัญชีแล้ว</div>
            <button type="button" className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="ปิด" onClick={() => setCreated(null)}>
              <X className="size-4" />
            </button>
          </div>
          <p className="mb-3 text-sm text-muted">
            {ROLE_TH[created.role]} · {created.name} (รหัสผ่านจะไม่แสดงอีก คัดลอกเก็บไว้ก่อนปิด)
          </p>
          <Credentials username={created.username} password={created.password} />
        </div>
      )}
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="field">
          <span>บทบาท</span>
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="teacher">อาจารย์</option>
            <option value="student">นิสิต</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
        </label>
        <label className="field">
          <span>ชื่อ-นามสกุล</span>
          <input className="input" required maxLength={100} value={form.name} onChange={set('name')} placeholder={isStudent ? 'เช่น นายกิตติ ศรีสุข' : 'เช่น อาจารย์ สมชาย ใจดี'} />
        </label>
        <label className="field">
          <span>ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)</span>
          <input className="input" required maxLength={50} pattern="\S+" title="ห้ามมีช่องว่าง" autoComplete="off" value={form.username} onChange={set('username')} />
        </label>
        <label className="field">
          <span>อีเมล</span>
          <input type="email" className="input" required maxLength={100} autoComplete="off" value={form.email} onChange={set('email')} />
        </label>
        <label className="field">
          <span>เบอร์โทรศัพท์ <span className="font-normal text-muted">(ไม่บังคับ)</span></span>
          <input className="input" pattern="0\d{9}" inputMode="tel" maxLength={10} title="เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0" value={form.mobile} onChange={set('mobile')} />
        </label>
        {isStudent && (
          <label className="field">
            <span>รหัสนิสิต</span>
            <input className="input" required pattern="\d{8}" inputMode="numeric" maxLength={8} title="ตัวเลข 8 หลัก" value={form.studentId} onChange={set('studentId')} />
          </label>
        )}
        <label className="field">
          <span>รหัสผ่านชั่วคราว</span>
          <div className="flex gap-2">
            <input className="input font-mono" required minLength={6} maxLength={50} autoComplete="off" value={form.password} onChange={set('password')} />
            <button type="button" className="btn btn-ghost shrink-0 px-3" title="สุ่มรหัสใหม่" aria-label="สุ่มรหัสใหม่" onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))}>
              <Dices />
            </button>
          </div>
        </label>
        <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={create.isPending}><UserPlus /> สร้างบัญชี</button>
        </div>
      </form>
    </Panel>
  )
}

// ===================== แก้ไขข้อมูลผู้ใช้ =====================
function EditUser({ u, self, onClose }: { u: AdminUser; self: boolean; onClose: () => void }) {
  const original = { name: u.name, email: u.email, mobile: u.mobile, studentId: u.studentId }
  const [form, setForm] = useState(original)
  const set = (k: keyof typeof original) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useAction((body: Partial<typeof original>) => api.patch(`/admin/users/${u.id}`, body), {
    success: 'บันทึกข้อมูลผู้ใช้แล้ว',
    invalidate: self ? [['admin', 'users'], ['me']] : [['admin', 'users']],
    onSuccess: onClose,
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    // ส่งเฉพาะช่องที่แก้ ข้อมูลเก่าที่รูปแบบไม่ตรงกฎใหม่จะได้ไม่ติด validation
    const changed = Object.fromEntries(
      (Object.keys(original) as (keyof typeof original)[]).map((k) => [k, form[k].trim()] as const).filter(([k, v]) => v !== original[k]),
    )
    if (Object.keys(changed).length === 0) onClose()
    else save.mutate(changed)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="แก้ไขข้อมูลผู้ใช้"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" form="edit-user-form" className="btn btn-primary" disabled={save.isPending}>บันทึก</button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={form.name || u.name} />
        <div className="min-w-0">
          <div className="text-sm text-muted">@{u.username}</div>
          <Badge tone={ROLE_TONE[u.role]}>{ROLE_TH[u.role]}</Badge>
        </div>
      </div>
      <form id="edit-user-form" onSubmit={onSubmit} className="grid gap-4">
        <label className="field">
          <span>ชื่อ-นามสกุล</span>
          <input className="input" required maxLength={100} value={form.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span>อีเมล</span>
          <input type="email" className="input" required maxLength={100} value={form.email} onChange={set('email')} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>เบอร์โทรศัพท์ <span className="font-normal text-muted">(ไม่บังคับ)</span></span>
            <input
              className="input"
              inputMode="tel"
              maxLength={10}
              pattern={form.mobile !== original.mobile ? '0\\d{9}' : undefined}
              title="เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0"
              value={form.mobile}
              onChange={set('mobile')}
            />
          </label>
          {u.role === 'student' && (
            <label className="field">
              <span>รหัสนิสิต</span>
              <input
                className="input"
                inputMode="numeric"
                maxLength={8}
                pattern={form.studentId !== original.studentId ? '\\d{8}' : undefined}
                title="ตัวเลข 8 หลัก"
                value={form.studentId}
                onChange={set('studentId')}
              />
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ===================== แสดงรหัสผ่านชั่วคราวให้คัดลอก =====================
function Credentials({ username, password }: { username: string; password: string }) {
  return (
    <div className="flex flex-col gap-2">
      <CopyField label="ชื่อผู้ใช้" value={username} />
      <CopyField label="รหัสผ่านชั่วคราว" value={password} />
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง')
    }
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className="font-mono text-sm break-all text-ink select-all">{value}</div>
      </div>
      <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={copy}>
        {copied ? <><Check /> คัดลอกแล้ว</> : <><Copy /> คัดลอก</>}
      </button>
    </div>
  )
}
