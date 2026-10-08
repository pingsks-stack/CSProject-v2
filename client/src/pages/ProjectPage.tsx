import { useQuery } from '@tanstack/react-query'
import {
  Award, CircleCheck, CircleX, CodeXml, Download, FileText, FileUp, Hourglass, MessageSquare, Pencil, Printer,
  RotateCcw, Trash2, UserMinus, UserPlus, Users, X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { GithubPanel } from '../components/github'
import { Icon } from '../components/Icon'
import { ShowcasePanel } from '../components/ShowcaseEditor'
import { UserPicker, type PickedUser } from '../components/UserPicker'
import { Async, Avatar, Badge, Empty, Modal, PageHeader, Panel, StatusBadge, TONE, cx, useAction, useConfirm } from '../components/ui'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import {
  ACTIVITY, ALLOWED_EXT, MAX_UPLOAD_MB, REQUEST_STATUS, REQUEST_TYPE_TH, TEACHER_ROLE_TH, fileSize, languageLabel, thaiDate, timeAgo,
} from '../lib/format'
import { projectKeys, useMeta, useProject } from '../lib/queries'
import type { Activity, CodeItem, Member, Project, ProjectFile, ProjectRequest, TeacherRole, Viewer } from '../lib/types'

// หน้ารายละเอียดโครงงาน ใช้ร่วมกันทุกบทบาท (แทน MAS_Doc, Doc_Student_Infor, Admin_infor_See, Doc_Infor_See ฯลฯ)
// ปุ่มที่แสดงขึ้นกับความสัมพันธ์ของผู้ใช้กับโครงงาน (server ตรวจสิทธิ์ซ้ำทุกคำสั่ง)
export default function ProjectPage() {
  const { id = '' } = useParams()
  const q = useProject(id)
  return <Async q={q}>{({ project, viewer }) => <ProjectView p={project} v={viewer} />}</Async>
}

// ปุ่มท้ายแถวรายชื่อ: จอแคบขึ้นบรรทัดใหม่ใต้ชื่อ
const ROW_ACTIONS = 'flex w-full flex-wrap items-center gap-2 pl-12 sm:w-auto sm:pl-0'

const invalidateAll = (id: string) => [
  ...projectKeys(id), ['files', id], ['codes', id], ['project-requests', id], ['activity', id], ['chapters', id], ['meta'], ['chat', 'contacts'], ['public'],
]

function ProjectView({ p, v }: { p: Project; v: Viewer }) {
  const confirm = useConfirm()
  const meta = useMeta()
  const [renameOpen, setRenameOpen] = useState(false)
  const showPrivate = v.isMember || v.isAdmin
  const requests = useQuery({
    queryKey: ['project-requests', p.id],
    queryFn: () => api.get<{ requests: ProjectRequest[] }>(`/projects/${p.id}/requests`),
    enabled: showPrivate,
  })
  const pending = requests.data?.requests.filter((r) => r.status === 'pending') ?? []

  const setType = useAction((typeId: string) => api.patch(`/projects/${p.id}`, { typeId: typeId || null }), {
    success: 'บันทึกประเภทโครงงานแล้ว',
    invalidate: invalidateAll(p.id),
  })
  const resubmit = useAction(() => api.post(`/projects/${p.id}/resubmit`), {
    success: 'ส่งโครงงานไปยังภาคการศึกษาปัจจุบันแล้ว',
    invalidate: invalidateAll(p.id),
  })

  const back = v.isAdmin ? '/admin/projects' : v.isTeacher ? '/teacher/projects' : v.isStudent ? '/my-projects' : '/library'

  return (
    <>
      <PageHeader
        back={back}
        title={p.nameTh}
        subtitle={p.nameEn}
        actions={
          <>
            <Link to={`/projects/${p.id}/chapters`} className="btn btn-ghost"><FileText /> {v.isTeacher ? 'ตรวจเอกสาร' : 'เอกสารรายบท'}</Link>
            {v.isStudent && <button type="button" className="btn btn-ghost" onClick={() => setRenameOpen(true)}><Pencil /> ขอเปลี่ยนชื่อ</button>}
            {v.isAdmin && <button type="button" className="btn btn-ghost" onClick={() => setRenameOpen(true)}><Pencil /> แก้ไขชื่อ</button>}
            {p.status === 'passed' && showPrivate && (
              <Link to={`/projects/${p.id}/print/${v.isTeacher ? 'confirmation' : 'approval'}`} className="btn btn-ok"><Printer /> พิมพ์ใบยืนยัน</Link>
            )}
            {p.status === 'failed' && v.canEdit && (
              <button
                type="button"
                className="btn btn-bad"
                disabled={resubmit.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'ส่งโครงงานใหม่',
                    text: 'โครงงานจะย้ายไปภาคการศึกษาปัจจุบัน และผลพิจารณาของอาจารย์ทุกท่านจะถูกล้างเพื่อพิจารณาใหม่',
                    confirmText: 'ส่งโครงงานใหม่',
                  })
                  if (ok) resubmit.mutate()
                }}
              >
                <RotateCcw /> ส่งโครงงานใหม่
              </button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={p.status} passCount={p.passCount} label={p.statusLabel} />
        <Badge>ปีการศึกษา {p.term}</Badge>
        {p.classLevel > 0 && <Badge>ชั้นปีที่ {p.classLevel}</Badge>}
        {v.canEdit ? (
          <select
            className="input w-auto py-1 text-xs"
            value={p.type?.id ?? ''}
            disabled={setType.isPending}
            onChange={(e) => setType.mutate(e.target.value)}
            aria-label="ประเภทโครงงาน"
          >
            <option value="">ยังไม่ระบุประเภท</option>
            {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <Badge>{p.type?.name ?? 'ยังไม่ระบุประเภท'}</Badge>
        )}
        <span className="text-xs text-muted">สร้างเมื่อ {thaiDate(p.createdAt)}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <StudentsPanel p={p} v={v} pending={pending} />
          <TeachersPanel p={p} v={v} pending={pending} />
          <ShowcasePanel project={p} canEdit={v.canEdit} />
          <FilesPanel p={p} v={v} />
          <GithubPanel projectId={p.id} canEdit={v.canEdit} canSync={v.isMember || v.isAdmin} />
          <CodePanel p={p} v={v} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <VerdictPanel p={p} v={v} />
          {showPrivate && <RequestsPanel p={p} v={v} requests={requests.data?.requests ?? []} />}
          {showPrivate && <HistoryPanel id={p.id} />}
        </div>
      </div>

      <RenameModal p={p} v={v} open={renameOpen} onClose={() => setRenameOpen(false)} hasPending={pending.some((r) => r.type === 'rename')} />
    </>
  )
}

// ===================== นิสิต =====================
function StudentsPanel({ p, v, pending }: { p: Project; v: Viewer; pending: ProjectRequest[] }) {
  const me = useMe()
  const confirm = useConfirm()
  const [addOpen, setAddOpen] = useState(false)
  const [changeFor, setChangeFor] = useState<{ m: Member; action: 'change' | 'remove' } | null>(null)
  const students = p.members.filter((m) => m.kind === 'student')
  const removeNow = useAction((userId: string) => api.del(`/projects/${p.id}/students/${userId}`), {
    success: 'นำนิสิตออกจากโครงงานแล้ว',
    invalidate: invalidateAll(p.id),
  })

  return (
    <Panel
      title="นิสิตในโครงงาน"
      sub={`${students.length}/2 คน`}
      actions={v.canEdit && students.length < 2 && <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}><UserPlus /> เพิ่มคู่โปรเจค</button>}
      bodyClass="p-0"
    >
      <ul>
        {students.map((m) => {
          const req = pending.find((r) => (r.type === 'member_change' || r.type === 'member_remove') && r.target?.id === m.user.id)
          const self = m.user.id === me.id
          return (
            <li key={m.user.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <Avatar name={m.user.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {m.user.name}
                  {m.isOwner && <Badge tone="accent">ผู้สร้างโครงงาน</Badge>}
                  {self && <Badge>คุณ</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {[m.user.studentId && `รหัสนิสิต ${m.user.studentId}`, m.user.email, m.user.mobile].filter(Boolean).join(' · ')}
                </div>
                {req && <div className="mt-1"><Badge tone="warn">{REQUEST_TYPE_TH[req.type]} · รออาจารย์ที่ปรึกษาอนุมัติ</Badge></div>}
              </div>
              {v.isStudent && !self && !req && (
                <div className={ROW_ACTIONS}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChangeFor({ m, action: 'change' })}><Users /> ขอเปลี่ยน</button>
                  <button type="button" className="btn btn-bad btn-sm" onClick={() => setChangeFor({ m, action: 'remove' })}><UserMinus /> ขอลบ</button>
                </div>
              )}
              {v.isAdmin && students.length > 1 && (
                <button
                  type="button"
                  className="btn btn-bad btn-sm"
                  onClick={async () => {
                    if (await confirm({ title: 'นำนิสิตออกจากโครงงาน', text: `นำ "${m.user.name}" ออกจากโครงงานทันที`, danger: true, confirmText: 'นำออก' })) removeNow.mutate(m.user.id)
                  }}
                >
                  <UserMinus /> นำออก
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <AddPartnerModal p={p} open={addOpen} onClose={() => setAddOpen(false)} />
      <MemberRequestModal p={p} target={changeFor} onClose={() => setChangeFor(null)} />
    </Panel>
  )
}

function AddPartnerModal({ p, open, onClose }: { p: Project; open: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<PickedUser | null>(null)
  const add = useAction(() => api.post(`/projects/${p.id}/partner`, { userId: picked!.id }), {
    success: 'เพิ่มคู่โปรเจคแล้ว',
    invalidate: invalidateAll(p.id),
    onSuccess: () => { setPicked(null); onClose() },
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มคู่โปรเจค"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" disabled={!picked || add.isPending} onClick={() => add.mutate()}>เพิ่ม</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">เลือกนิสิตที่มีบัญชีในระบบและยังไม่มีโครงงาน (มีผลทันที)</p>
      <UserPicker role="student" value={picked} onChange={setPicked} exclude={p.members.map((m) => m.user.id)} />
    </Modal>
  )
}

function MemberRequestModal({ p, target, onClose }: { p: Project; target: { m: Member; action: 'change' | 'remove' } | null; onClose: () => void }) {
  const [picked, setPicked] = useState<PickedUser | null>(null)
  const send = useAction(
    () => api.post(`/projects/${p.id}/requests/member`, { action: target!.action, targetId: target!.m.user.id, newUserId: picked?.id }),
    {
      success: 'ส่งคำขอแล้ว รอการยืนยันจากอาจารย์ที่ปรึกษา',
      invalidate: invalidateAll(p.id),
      onSuccess: () => { setPicked(null); onClose() },
    },
  )
  const isChange = target?.action === 'change'
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={isChange ? 'ขอเปลี่ยนคู่โปรเจค' : 'ขอลบคู่โปรเจค'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="button" className={cx('btn', isChange ? 'btn-primary' : 'bg-bad text-white')} disabled={(isChange && !picked) || send.isPending} onClick={() => send.mutate()}>
            ส่งคำขอ
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {isChange ? 'เปลี่ยน' : 'ลบ'} <b className="text-ink">{target?.m.user.name}</b> {isChange ? 'เป็นนิสิตคนใหม่' : 'ออกจากโครงงาน'} — คำขอจะมีผลเมื่ออาจารย์ที่ปรึกษายืนยัน
      </p>
      {isChange && <UserPicker role="student" value={picked} onChange={setPicked} exclude={p.members.map((m) => m.user.id)} />}
    </Modal>
  )
}

// ===================== อาจารย์ =====================
const VOTE_BADGE = {
  pass: { tone: 'ok' as const, label: 'ผ่าน', icon: CircleCheck },
  fail: { tone: 'bad' as const, label: 'ไม่ผ่าน', icon: CircleX },
  none: { tone: 'muted' as const, label: 'รอพิจารณา', icon: Hourglass },
}

function TeachersPanel({ p, v, pending }: { p: Project; v: Viewer; pending: ProjectRequest[] }) {
  const me = useMe()
  const confirm = useConfirm()
  const [inviteOpen, setInviteOpen] = useState(false)
  const teachers = p.members
    .filter((m) => m.kind === 'teacher')
    .sort((a, b) => (a.teacherRole === 'advisor' ? -1 : 0) - (b.teacherRole === 'advisor' ? -1 : 0))
  const invites = pending.filter((r) => r.type === 'teacher_invite')
  const remove = useAction((userId: string) => api.del(`/projects/${p.id}/teachers/${userId}`), {
    success: 'นำอาจารย์ออกจากโครงงานแล้ว',
    invalidate: invalidateAll(p.id),
  })
  const cancel = useAction((rid: string) => api.del(`/projects/${p.id}/requests/${rid}`), {
    success: 'ยกเลิกคำเชิญแล้ว',
    invalidate: invalidateAll(p.id),
  })
  const canInvite = v.canEdit && teachers.length + invites.length < 3

  return (
    <Panel
      title="อาจารย์ประจำโครงงาน"
      sub={`${teachers.length}/3 ท่าน · ที่ปรึกษา 1 ท่าน และกรรมการ 2 ท่าน`}
      actions={canInvite && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>
          <UserPlus /> {v.isAdmin ? 'เพิ่มอาจารย์' : 'เชิญอาจารย์'}
        </button>
      )}
      bodyClass="p-0"
    >
      {teachers.length === 0 && invites.length === 0 ? (
        <Empty icon={Users} title="ยังไม่มีอาจารย์ในโครงงาน">
          {v.isStudent ? 'เชิญอาจารย์ที่ปรึกษาและกรรมการ อาจารย์ต้องตอบรับคำเชิญก่อนจึงจะเข้าร่วมโครงงาน' : undefined}
        </Empty>
      ) : (
        <ul>
          {teachers.map((m) => {
            const vb = VOTE_BADGE[m.vote ?? 'none']
            const self = m.user.id === me.id
            return (
              <li key={m.user.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <Avatar name={m.user.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {m.user.name}
                    <Badge tone={m.teacherRole === 'advisor' ? 'gold' : 'muted'}>{TEACHER_ROLE_TH[m.teacherRole ?? 'committee']}</Badge>
                    {self && <Badge>คุณ</Badge>}
                  </div>
                  <div className="text-xs text-muted">{[m.user.email, m.user.mobile].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={ROW_ACTIONS}>
                <Badge tone={vb.tone}><vb.icon className="size-3.5" /> {vb.label}{m.votedAt ? ` · ${thaiDate(m.votedAt)}` : ''}</Badge>
                  {(v.isStudent || self || v.isAdmin) && (
                    <Link to={`/projects/${p.id}/comments/${m.user.id}`} className="btn btn-ghost btn-sm">
                      <MessageSquare /> {self ? 'ความเห็นถึงนิสิต' : 'ความเห็น'}
                    </Link>
                  )}
                  {v.canEdit && (p.status !== 'passed' || v.isAdmin) && (
                    <button
                      type="button"
                      className="btn btn-bad btn-sm"
                      aria-label="นำอาจารย์ออก"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'นำอาจารย์ออกจากโครงงาน',
                          text: `นำ "${m.user.name}" ออกจากโครงงาน ผลพิจารณาของอาจารย์ท่านนี้จะถูกนำออกด้วย`,
                          danger: true,
                          confirmText: 'นำออก',
                        })
                        if (ok) remove.mutate(m.user.id)
                      }}
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          {invites.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line bg-warn/5 px-5 py-3 last:border-0">
              <Avatar name={r.target?.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {r.target?.name}
                  <Badge>{TEACHER_ROLE_TH[r.teacherRole ?? 'committee']}</Badge>
                </div>
                <div className="text-xs text-muted">เชิญโดย {r.requestedBy?.name} · {timeAgo(r.createdAt)}</div>
              </div>
              <div className={ROW_ACTIONS}>
                <Badge tone="warn"><Hourglass className="size-3.5" /> รอตอบรับคำเชิญ</Badge>
                {v.canEdit && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                    <X /> ยกเลิกคำเชิญ
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <InviteModal p={p} v={v} open={inviteOpen} onClose={() => setInviteOpen(false)} hasAdvisor={teachers.some((t) => t.teacherRole === 'advisor') || invites.some((r) => r.teacherRole === 'advisor')} />
    </Panel>
  )
}

function InviteModal({ p, v, open, onClose, hasAdvisor }: { p: Project; v: Viewer; open: boolean; onClose: () => void; hasAdvisor: boolean }) {
  const [picked, setPicked] = useState<PickedUser | null>(null)
  const [chosen, setRole] = useState<TeacherRole>('advisor')
  // มีที่ปรึกษาแล้ว (หรือรอตอบรับ) เลือกได้เฉพาะกรรมการ ไม่ว่าเคยเลือกอะไรไว้
  const role: TeacherRole = hasAdvisor ? 'committee' : chosen
  useEffect(() => {
    if (open) setPicked(null)
  }, [open])
  const send = useAction(() => api.post(`/projects/${p.id}/teachers`, { userId: picked!.id, role }), {
    success: v.isAdmin ? 'เพิ่มอาจารย์แล้ว' : 'ส่งคำเชิญแล้ว รออาจารย์ตอบรับ',
    invalidate: invalidateAll(p.id),
    onSuccess: () => { setPicked(null); onClose() },
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={v.isAdmin ? 'เพิ่มอาจารย์' : 'เชิญอาจารย์'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" disabled={!picked || send.isPending} onClick={() => send.mutate()}>
            {v.isAdmin ? 'เพิ่ม' : 'ส่งคำเชิญ'}
          </button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {(['advisor', 'committee'] as const).map((r) => (
          <label key={r} className={cx('flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm', role === r ? 'border-accent bg-accent/10' : 'border-line', r === 'advisor' && hasAdvisor && 'cursor-not-allowed opacity-50')}>
            <input type="radio" name="role" checked={role === r} disabled={r === 'advisor' && hasAdvisor} onChange={() => setRole(r)} />
            {TEACHER_ROLE_TH[r]}
          </label>
        ))}
      </div>
      {hasAdvisor && <p className="mb-3 text-xs text-muted">มีอาจารย์ที่ปรึกษาแล้ว (หรือรอตอบรับอยู่) จึงเชิญได้เฉพาะกรรมการ</p>}
      <UserPicker role="teacher" value={picked} onChange={setPicked} exclude={p.members.map((m) => m.user.id)} />
    </Modal>
  )
}

// ===================== ผลการพิจารณา =====================
function VerdictPanel({ p, v }: { p: Project; v: Viewer }) {
  const confirm = useConfirm()
  const vote = useAction((value: 'pass' | 'fail') => api.post(`/projects/${p.id}/vote`, { vote: value }), {
    success: 'บันทึกผลพิจารณาแล้ว',
    invalidate: invalidateAll(p.id),
  })
  const onVote = async (value: 'pass' | 'fail') => {
    const ok = await confirm({
      title: value === 'pass' ? 'ยืนยันให้โครงงานผ่าน' : 'ยืนยันให้โครงงานไม่ผ่าน',
      text: value === 'pass'
        ? 'เมื่อกดแล้วจะเปลี่ยนแปลงไม่ได้ โครงงานจะผ่านเมื่ออาจารย์ครบ 3 ท่านให้ผ่าน'
        : 'เมื่อกดแล้วจะเปลี่ยนแปลงไม่ได้ โครงงานจะเป็น "ไม่ผ่าน" ทันที นิสิตต้องส่งโครงงานใหม่ในภาคการศึกษาถัดไป',
      danger: value === 'fail',
      confirmText: value === 'pass' ? 'ให้ผ่าน' : 'ไม่ผ่าน',
    })
    if (ok) vote.mutate(value)
  }
  const tone = p.status === 'passed' ? 'ok' : p.status === 'failed' ? 'bad' : p.passCount ? 'info' : 'warn'
  const StatusIcon = p.status === 'passed' ? Award : p.status === 'failed' ? CircleX : Hourglass

  return (
    <Panel title="ผลการพิจารณา">
      <div className="flex items-center gap-4">
        <span className={cx('kpi-icon size-12', TONE[tone])}><StatusIcon /></span>
        <div>
          <div className="text-xl font-semibold">{p.statusLabel}</div>
          <div className="text-xs text-muted">
            {p.status === 'passed' ? `ผ่านเมื่อ ${thaiDate(p.passedAt)} · อยู่ในคลังโครงงานแล้ว`
              : p.status === 'failed' ? 'มีอาจารย์ให้ไม่ผ่าน'
              : 'ต้องได้ "ผ่าน" จากอาจารย์ครบ 3 ท่าน'}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5" aria-label={`ผ่าน ${p.passCount} จาก 3`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cx('h-2 rounded-full', i < p.passCount ? 'bg-ok' : p.status === 'failed' ? 'bg-bad/25' : 'bg-surface-2')} />
        ))}
      </div>
      {v.isTeacher && (
        <div className="mt-5 border-t border-line pt-4">
          {v.myVote ? (
            <p className="text-sm">
              คุณให้ผลแล้ว: <Badge tone={v.myVote === 'pass' ? 'ok' : 'bad'}>{v.myVote === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน'}</Badge>
            </p>
          ) : p.status === 'passed' ? null : p.status === 'failed' ? (
            <p className="text-sm text-muted">โครงงานไม่ผ่านแล้ว จะพิจารณาได้อีกครั้งเมื่อนิสิตส่งโครงงานใหม่</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">ผลพิจารณาของคุณ</p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ok flex-1" disabled={vote.isPending} onClick={() => onVote('pass')}><CircleCheck /> ผ่าน</button>
                <button type="button" className="btn btn-bad flex-1" disabled={vote.isPending} onClick={() => onVote('fail')}><CircleX /> ไม่ผ่าน</button>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

// ===================== ไฟล์ =====================
function FilesPanel({ p, v }: { p: Project; v: Viewer }) {
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const files = useQuery({ queryKey: ['files', p.id], queryFn: () => api.get<{ files: ProjectFile[] }>(`/projects/${p.id}/files`) })
  const upload = useAction((fd: FormData) => api.post<{ count: number }>(`/projects/${p.id}/files`, fd), {
    success: (r) => `อัปโหลดแล้ว ${r.count} ไฟล์`,
    invalidate: invalidateAll(p.id),
  })
  const remove = useAction((fileId: string) => api.del(`/projects/${p.id}/files/${fileId}`), {
    success: 'ลบไฟล์แล้ว',
    invalidate: invalidateAll(p.id),
  })

  const onPick = (list: FileList | null) => {
    if (!list?.length) return
    if (list.length > 10) return toast.error('อัปโหลดได้ครั้งละไม่เกิน 10 ไฟล์')
    const big = [...list].find((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024)
    if (big) return toast.error(`ไฟล์ ${big.name} ใหญ่เกิน ${MAX_UPLOAD_MB} MB`)
    const fd = new FormData()
    for (const f of list) fd.append('files', f)
    upload.mutate(fd)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <Panel
      title="ไฟล์ของโครงงาน"
      sub={v.canEdit ? 'อัปโหลดชื่อเดิมซ้ำ = แทนที่ไฟล์เดิม' : undefined}
      actions={v.canEdit && (
        <>
          <input ref={inputRef} type="file" multiple accept={ALLOWED_EXT} className="hidden" onChange={(e) => onPick(e.target.files)} />
          <button type="button" className="btn btn-primary btn-sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            <FileUp /> {upload.isPending ? 'กำลังอัปโหลด…' : 'อัปโหลดไฟล์'}
          </button>
        </>
      )}
      bodyClass="p-0"
    >
      {files.data?.files.length === 0 && <Empty icon={FileText} title="ยังไม่มีไฟล์" />}
      <ul>
        {files.data?.files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
            <span className="kpi-icon size-9 bg-surface-2 text-muted"><FileText className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <a href={`/api/projects/${p.id}/files/${f.id}/download`} className="block truncate font-medium">{f.fileName}</a>
              <div className="text-xs text-muted">{fileSize(f.size)} · {f.uploadedBy?.name} · {thaiDate(f.updatedAt, true)}</div>
            </div>
            <a href={`/api/projects/${p.id}/files/${f.id}/download`} className="btn btn-ghost btn-sm" aria-label="ดาวน์โหลด"><Download /></a>
            {v.canEdit && (
              <button
                type="button"
                className="btn btn-bad btn-sm"
                aria-label="ลบไฟล์"
                onClick={async () => {
                  if (await confirm({ title: 'ลบไฟล์', text: `ต้องการลบ "${f.fileName}" ใช่ไหม?`, danger: true, confirmText: 'ลบ' })) remove.mutate(f.id)
                }}
              >
                <Trash2 />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ===================== ซอร์สโค้ด =====================
function CodePanel({ p, v }: { p: Project; v: Viewer }) {
  const codes = useQuery({ queryKey: ['codes', p.id], queryFn: () => api.get<{ codes: CodeItem[] }>(`/projects/${p.id}/codes`) })
  const list = codes.data?.codes ?? []
  return (
    <Panel
      title="ซอร์สโค้ด"
      sub={`${list.length} ฟังก์ชัน`}
      actions={<Link to={`/projects/${p.id}/code`} className="btn btn-ghost btn-sm"><CodeXml /> {v.canEdit ? 'จัดการโค้ด' : 'ดูโค้ด'}</Link>}
      bodyClass="p-0"
    >
      {list.length === 0 ? (
        <Empty icon={CodeXml} title="ยังไม่มีซอร์สโค้ด" />
      ) : (
        <ul className="grid sm:grid-cols-2">
          {list.slice(0, 6).map((c) => (
            <li key={c.id} className="border-b border-line sm:odd:border-r">
              <Link to={`/projects/${p.id}/code?id=${c.id}`} className="flex items-center gap-3 px-5 py-3 no-underline hover:bg-surface-2">
                <CodeXml className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm text-ink">{c.functionName}</span>
                  <span className="block text-xs text-muted">{languageLabel(c.language)} · {c.lines} บรรทัด</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <div className="px-5 py-3 text-sm"><Link to={`/projects/${p.id}/code`}>ดูทั้งหมด {list.length} ฟังก์ชัน</Link></div>
      )}
    </Panel>
  )
}

// ===================== คำขอ =====================
function RequestsPanel({ p, v, requests }: { p: Project; v: Viewer; requests: ProjectRequest[] }) {
  const recent = requests.slice(0, 6)
  return (
    <Panel title="คำขอของโครงงาน" actions={<Link to="/requests" className="text-sm">ดูทั้งหมด</Link>} bodyClass="p-0">
      {recent.length === 0 ? (
        <Empty title="ยังไม่มีคำขอ">
          {v.isStudent ? 'คำเชิญอาจารย์ การขอเปลี่ยนชื่อ และการขอเปลี่ยนคู่โปรเจคจะแสดงที่นี่' : undefined}
        </Empty>
      ) : (
        <ul>
          {recent.map((r) => {
            const st = REQUEST_STATUS[r.status]
            return (
              <li key={r.id} className="border-b border-line px-5 py-3 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{REQUEST_TYPE_TH[r.type]}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {r.type === 'teacher_invite' && `${r.target?.name} (${TEACHER_ROLE_TH[r.teacherRole ?? 'committee']})`}
                  {r.type === 'rename' && `ชื่อใหม่: ${r.nameTh}`}
                  {r.type === 'member_change' && `${r.target?.name} → ${r.newMember?.name}`}
                  {r.type === 'member_remove' && r.target?.name}
                  {' · '}{timeAgo(r.createdAt)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {p.status === 'pending' && v.isStudent && !p.members.some((m) => m.teacherRole === 'advisor') && (
        <p className="border-t border-line px-5 py-3 text-xs text-warn">ยังไม่มีอาจารย์ที่ปรึกษา คำขอเปลี่ยนชื่อ/สมาชิกจะส่งให้ผู้ดูแลระบบพิจารณาแทน</p>
      )}
    </Panel>
  )
}

// ===================== ประวัติ =====================
function HistoryPanel({ id }: { id: string }) {
  const [all, setAll] = useState(false)
  const q = useQuery({ queryKey: ['activity', id], queryFn: () => api.get<{ activity: Activity[] }>(`/projects/${id}/activity`) })
  const items = q.data?.activity ?? []
  const shown = all ? items : items.slice(0, 8)
  return (
    <Panel title="ประวัติการเปลี่ยนแปลง" bodyClass="p-0">
      {items.length === 0 ? (
        <Empty title="ยังไม่มีประวัติ" />
      ) : (
        <ol className="relative px-5 py-4">
          {shown.map((a) => (
            <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
              <span className="kpi-icon z-10 size-8 bg-surface-2 text-muted"><Icon name={ACTIVITY[a.type]?.icon ?? 'clock'} className="size-4" /></span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{ACTIVITY[a.type]?.label ?? a.type}</div>
                {a.detail && <div className="break-words text-xs text-ink/80">{a.detail}</div>}
                <div className="text-xs text-muted">{a.actor?.name ?? 'ระบบ'} · {thaiDate(a.createdAt, true)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {items.length > 8 && (
        <button type="button" className="w-full border-t border-line px-5 py-2.5 text-sm text-accent hover:bg-surface-2" onClick={() => setAll(!all)}>
          {all ? 'แสดงน้อยลง' : `แสดงทั้งหมด ${items.length} รายการ`}
        </button>
      )}
    </Panel>
  )
}

// ===================== เปลี่ยนชื่อโครงงาน =====================
function RenameModal({ p, v, open, onClose, hasPending }: { p: Project; v: Viewer; open: boolean; onClose: () => void; hasPending: boolean }) {
  const save = useAction(
    (body: { nameTh: string; nameEn: string }) => (v.isAdmin ? api.patch(`/projects/${p.id}`, body) : api.post(`/projects/${p.id}/requests/rename`, body)),
    {
      success: v.isAdmin ? 'เปลี่ยนชื่อโครงงานแล้ว' : 'ส่งคำขอแล้ว กรุณารอการยืนยันจากอาจารย์ที่ปรึกษา',
      invalidate: invalidateAll(p.id),
      onSuccess: onClose,
    },
  )
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save.mutate({ nameTh: String(f.get('nameTh')).trim(), nameEn: String(f.get('nameEn')).trim() })
  }
  return (
    <Modal open={open} onClose={onClose} title={v.isAdmin ? 'แก้ไขชื่อโครงงาน' : 'ขอเปลี่ยนชื่อโครงงาน'}>
      {hasPending && !v.isAdmin ? (
        <p className="text-sm text-muted">มีคำขอเปลี่ยนชื่อที่รออาจารย์ที่ปรึกษายืนยันอยู่แล้ว</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="field">
            <span>ชื่อโครงงาน (ภาษาไทย)</span>
            <input name="nameTh" className="input" defaultValue={p.nameTh} required maxLength={200} />
          </label>
          <label className="field">
            <span>ชื่อโครงงาน (ภาษาอังกฤษ)</span>
            <input name="nameEn" className="input" defaultValue={p.nameEn} required maxLength={200} />
          </label>
          {!v.isAdmin && <p className="text-xs text-muted">ชื่อใหม่จะมีผลเมื่ออาจารย์ที่ปรึกษายืนยัน</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={save.isPending}>{v.isAdmin ? 'บันทึก' : 'ส่งคำขอ'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
