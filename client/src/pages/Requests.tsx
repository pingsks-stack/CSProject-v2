import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, History, Inbox, MailPlus, PencilLine, UserMinus, Users, X, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Async, Badge, Empty, PageHeader, TONE, Tabs, cx, useAction, useConfirm } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { REQUEST_STATUS, REQUEST_TYPE_TH, TEACHER_ROLE_TH, thaiDate, type Tone } from '../lib/format'
import type { ProjectRequest, RequestType, Role, UserRef } from '../lib/types'

type Tab = 'pending' | 'done'

const PAGE: Record<Role, { title: string; subtitle: string; empty: string }> = {
  teacher: {
    title: 'คำขอรอยืนยัน',
    subtitle: 'คำเชิญเป็นอาจารย์ในโครงงาน และคำขอเปลี่ยนชื่อ/คู่โปรเจคของโครงงานที่คุณเป็นที่ปรึกษา',
    empty: 'คำเชิญจากนิสิตและคำขอเปลี่ยนแปลงของโครงงานที่คุณเป็นที่ปรึกษาจะแสดงที่นี่',
  },
  student: {
    title: 'คำขอของโครงงาน',
    subtitle: 'ติดตามคำเชิญอาจารย์ คำขอเปลี่ยนชื่อโครงงาน และคำขอเปลี่ยน/ลบคู่โปรเจค',
    empty: 'ส่งคำเชิญอาจารย์ คำขอเปลี่ยนชื่อ หรือคำขอเปลี่ยนคู่โปรเจคได้ที่หน้าจัดการโครงงาน',
  },
  admin: {
    title: 'คำขอทั้งหมด',
    subtitle: 'คำขอทุกประเภทของทุกโครงงาน ผู้ดูแลระบบยืนยันหรือปฏิเสธแทนอาจารย์ได้',
    empty: 'คำขอใหม่จากทุกโครงงานจะแสดงที่นี่',
  },
}

const TYPE_STYLE: Record<RequestType, { icon: LucideIcon; tone: Tone }> = {
  teacher_invite: { icon: MailPlus, tone: 'accent' },
  rename: { icon: PencilLine, tone: 'info' },
  member_change: { icon: Users, tone: 'gold' },
  member_remove: { icon: UserMinus, tone: 'bad' },
}

const APPROVE_TITLE: Record<RequestType, string> = {
  teacher_invite: 'ตอบรับคำเชิญ',
  rename: 'อนุมัติการเปลี่ยนชื่อโครงงาน',
  member_change: 'อนุมัติการเปลี่ยนคู่โปรเจค',
  member_remove: 'อนุมัติการลบคู่โปรเจค',
}

const REJECT_TITLE: Record<RequestType, string> = {
  teacher_invite: 'ปฏิเสธคำเชิญ',
  rename: 'ปฏิเสธการเปลี่ยนชื่อโครงงาน',
  member_change: 'ปฏิเสธการเปลี่ยนคู่โปรเจค',
  member_remove: 'ปฏิเสธการลบคู่โปรเจค',
}

const fetchRequests = (status: Tab) => api.get<{ requests: ProjectRequest[] }>(`/requests?status=${status}`)

// หน้าคำขอ (แทน Confirm_NS / Confirms_Change / คำขอเปลี่ยนชื่อใน Doc_Student_Infor) server กรองตามสิทธิ์ของผู้ใช้
export default function Requests() {
  const me = useMe()
  const [tab, setTab] = useState<Tab>('pending')
  const [type, setType] = useState<RequestType | ''>('')
  const pending = useQuery({ queryKey: ['requests', 'pending'], queryFn: () => fetchRequests('pending') })
  const done = useQuery({ queryKey: ['requests', 'done'], queryFn: () => fetchRequests('done'), enabled: tab === 'done' })
  const q = tab === 'pending' ? pending : done
  const page = PAGE[me.role]

  return (
    <>
      <PageHeader title={page.title} subtitle={page.subtitle} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'pending', label: 'รอดำเนินการ', count: pending.data?.requests.length },
            { value: 'done', label: 'ประวัติ' },
          ]}
        />
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as RequestType | '')} aria-label="ประเภทคำขอ">
          <option value="">ทุกประเภท</option>
          {(Object.keys(REQUEST_TYPE_TH) as RequestType[]).map((t) => <option key={t} value={t}>{REQUEST_TYPE_TH[t]}</option>)}
        </select>
      </div>
      <Async q={q}>
        {({ requests }) => {
          const list = type ? requests.filter((r) => r.type === type) : requests
          if (list.length === 0) {
            return (
              <div className="panel">
                {requests.length > 0 ? (
                  <Empty icon={Inbox} title="ไม่มีคำขอประเภทนี้" />
                ) : tab === 'pending' ? (
                  <Empty icon={Inbox} title={me.role === 'teacher' ? 'ไม่มีคำขอที่รอยืนยัน' : 'ไม่มีคำขอที่รอดำเนินการ'}>{page.empty}</Empty>
                ) : (
                  <Empty icon={History} title="ยังไม่มีประวัติคำขอ">คำขอที่ยืนยัน ปฏิเสธ หรือยกเลิกแล้วจะแสดงที่นี่</Empty>
                )}
              </div>
            )
          }
          return <div className="flex flex-col gap-3">{list.map((r) => <RequestCard key={r.id} r={r} role={me.role} myId={me.id} />)}</div>
        }}
      </Async>
    </>
  )
}

function Person({ u }: { u: UserRef | null }) {
  if (!u) return <span className="text-muted">-</span>
  return (
    <span className="font-medium text-ink">
      {u.name}
      {u.studentId && <span className="font-normal text-muted"> ({u.studentId})</span>}
    </span>
  )
}

// ผลของคำขอเมื่อยืนยัน (ใช้ทั้งบนการ์ดและในกล่องยืนยัน)
function effectText(r: ProjectRequest, myId: string): ReactNode {
  const name = r.project.nameTh ?? 'โครงงาน'
  switch (r.type) {
    case 'teacher_invite':
      return (
        <>
          {r.target?.id === myId ? 'คุณ' : <Person u={r.target} />} จะเข้าร่วมเป็นอาจารย์{r.teacherRole ? TEACHER_ROLE_TH[r.teacherRole] : ''}ของโครงงาน “{name}”
        </>
      )
    case 'rename':
      return <>ชื่อโครงงานจะเปลี่ยนเป็น “{r.nameTh}” ({r.nameEn})</>
    case 'member_change':
      return <><Person u={r.target} /> จะถูกแทนที่ด้วย <Person u={r.newMember} /> ในโครงงาน “{name}”</>
    case 'member_remove':
      return <><Person u={r.target} /> จะถูกนำออกจากโครงงาน “{name}”</>
  }
}

function Detail({ r }: { r: ProjectRequest }) {
  switch (r.type) {
    case 'teacher_invite':
      return (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          เชิญ <Person u={r.target} /> เป็น
          <Badge tone="accent">{r.teacherRole ? `อาจารย์${TEACHER_ROLE_TH[r.teacherRole]}` : '-'}</Badge>
        </p>
      )
    case 'rename':
      return (
        <div className="mt-2 grid grid-cols-1 items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="text-xs text-muted">ชื่อเดิม</div>
            <div className="wrap-anywhere text-muted">{r.oldNameTh ?? '-'}</div>
            <div className="wrap-anywhere text-xs text-muted">{r.oldNameEn ?? ''}</div>
          </div>
          <ArrowRight className="hidden size-4 text-muted sm:block" />
          <div className="min-w-0">
            <div className="text-xs text-muted">ชื่อใหม่</div>
            <div className="wrap-anywhere font-medium text-ink">{r.nameTh ?? '-'}</div>
            <div className="wrap-anywhere text-xs text-muted">{r.nameEn ?? ''}</div>
          </div>
        </div>
      )
    case 'member_change':
      return (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Person u={r.target} />
          <ArrowRight className="size-4 text-muted" />
          <Person u={r.newMember} />
        </p>
      )
    case 'member_remove':
      return (
        <p className="mt-2 text-sm">
          ขอนำ <Person u={r.target} /> ออกจากโครงงาน
        </p>
      )
  }
}

function RequestCard({ r, role, myId }: { r: ProjectRequest; role: Role; myId: string }) {
  const confirm = useConfirm()
  const style = TYPE_STYLE[r.type]
  const status = REQUEST_STATUS[r.status]
  const invalidate = [
    ['requests'], ['notifications'], ['dashboard'], ['projects'],
    ['project', r.project.id], ['project-requests', r.project.id], ['activity', r.project.id], ['chat', 'contacts'],
  ]

  const decide = useAction(
    async (approve: boolean) => {
      await api.post(`/requests/${r.id}/decision`, { approve })
      return approve
    },
    {
      success: (approve) =>
        r.type === 'teacher_invite'
          ? approve ? 'ตอบรับคำเชิญแล้ว' : 'ปฏิเสธคำเชิญแล้ว'
          : approve ? 'ยืนยันคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว',
      invalidate,
    },
  )
  const cancel = useAction(() => api.del(`/projects/${r.project.id}/requests/${r.id}`), { success: 'ยกเลิกคำขอแล้ว', invalidate })
  const busy = decide.isPending || cancel.isPending

  const onDecide = async (approve: boolean) => {
    const ok = await confirm({
      title: approve ? APPROVE_TITLE[r.type] : REJECT_TITLE[r.type],
      text: approve ? effectText(r, myId) : 'คำขอนี้จะถูกปฏิเสธ และระบบจะแจ้งให้นิสิตในโครงงานทราบ',
      confirmText: approve ? 'ยืนยัน' : 'ปฏิเสธ',
      danger: !approve,
    })
    if (ok) decide.mutate(approve)
  }

  const onCancel = async () => {
    const ok = await confirm({
      title: 'ยกเลิกคำขอนี้?',
      text: <>{REQUEST_TYPE_TH[r.type]}: {effectText(r, myId)}</>,
      confirmText: 'ยกเลิกคำขอ',
      danger: true,
    })
    if (ok) cancel.mutate()
  }

  const Icon = style.icon
  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className={cx('kpi-icon', TONE[style.tone])}><Icon /></span>
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{REQUEST_TYPE_TH[r.type]}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <Link to={`/projects/${r.project.id}`} className="mt-0.5 block font-medium wrap-anywhere text-ink no-underline hover:text-accent">
            {r.project.nameTh ?? 'โครงงาน'}
          </Link>
          <Detail r={r} />
          <p className="mt-2 text-xs text-muted">
            ส่งโดย {r.requestedBy?.name ?? '-'} · {thaiDate(r.createdAt, true)}
            {r.status !== 'pending' && r.decidedAt && (
              <>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> · </span>
                {status.label}
                {r.decidedBy && ` โดย ${r.decidedBy.name}`} · {thaiDate(r.decidedAt, true)}
              </>
            )}
          </p>
        </div>
        {r.status === 'pending' && (
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            {role === 'student' ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
                <X /> ยกเลิกคำขอ
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-ok" disabled={busy} onClick={() => onDecide(true)}>
                  <Check /> ยืนยัน
                </button>
                <button type="button" className="btn btn-bad" disabled={busy} onClick={() => onDecide(false)}>
                  <X /> ปฏิเสธ
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
