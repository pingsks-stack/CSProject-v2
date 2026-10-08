import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Async, ErrorBox, cx } from '../components/ui'
import { api } from '../lib/api'
import { TEACHER_ROLE_TH, thaiDateLong } from '../lib/format'
import type { Member, Project } from '../lib/types'

interface FormSettings {
  courseCode: string
  courseName: string
  programName: string
  facultyName: string
  universityName: string
  chairName: string
  chairTitle: string
}

interface PrintData {
  project: Project
  settings: FormSettings
}

type FormKind = 'approval' | 'confirmation'
const FORMS: Record<FormKind, string> = {
  approval: 'ใบรับรองโครงงาน',
  confirmation: 'แบบฟอร์มยืนยันโปรเจค',
}

// หน้ากระดาษ A4 (หน้านี้ตั้งใจใช้สีขาว/ดำตายตัว ไม่ตามธีม เพื่อให้พิมพ์ออกมาเหมือนเอกสารจริง)
const PRINT_CSS = `
@page { size: A4; margin: 20mm 22mm; }
.sheet {
  width: 100%; max-width: 210mm; min-height: 297mm; margin: 0 auto; padding: 22mm 24mm;
  background: #fff; color: #111; border-radius: 4px; box-shadow: 0 12px 40px rgb(0 0 0 / .18);
  font-size: 16px; line-height: 1.8;
}
.sheet h1, .sheet h2, .sheet h3 { color: inherit; }
@media (max-width: 640px) {
  .sheet { min-height: 0; padding: 8mm 6mm; font-size: 14px; }
}
@media print {
  html, body, .print-root { background: #fff !important; }
  .print-root main, .print-root main > div { padding: 0 !important; max-width: none !important; }
  .sheet { max-width: none; min-height: 0; margin: 0; padding: 0; border-radius: 0; box-shadow: none; font-size: 12.5pt; }
  .sheet, .sheet * { color: #000 !important; }
}
`

const teachersOf = (p: Project) =>
  p.members
    .filter((m) => m.kind === 'teacher')
    .sort((a, b) => (a.teacherRole === b.teacherRole ? 0 : a.teacherRole === 'advisor' ? -1 : 1))

// หน้าพิมพ์แบบฟอร์ม (แทน PDF ของ Infor_Pass_N และ Pass_AJ) ใช้ "พิมพ์ / บันทึกเป็น PDF" ของเบราว์เซอร์
export default function PrintForm() {
  const { id = '', form = '' } = useParams()
  const kind = form === 'approval' || form === 'confirmation' ? form : null
  const q = useQuery({ queryKey: ['print', id], queryFn: () => api.get<PrintData>(`/projects/${id}/print`) })

  // ชื่อแท็บ = ชื่อไฟล์ตั้งต้นตอนบันทึกเป็น PDF
  const nameTh = q.data?.project.nameTh
  useEffect(() => {
    if (!kind || !nameTh) return
    const prev = document.title
    document.title = `${FORMS[kind]} - ${nameTh}`
    return () => {
      document.title = prev
    }
  }, [kind, nameTh])

  return (
    <div className="print-root min-h-dvh bg-bg">
      <style>{PRINT_CSS}</style>
      <header className="no-print sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-3">
          <Link to={`/projects/${id}`} className="btn btn-ghost btn-sm"><ArrowLeft /> กลับ</Link>
          <nav className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1" aria-label="เลือกแบบฟอร์ม">
            {(Object.keys(FORMS) as FormKind[]).map((k) => (
              <Link
                key={k}
                to={`/projects/${id}/print/${k}`}
                replace
                className={cx(
                  'rounded-lg px-3 py-1 text-xs font-medium no-underline transition',
                  k === kind ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {FORMS[k]}
              </Link>
            ))}
          </nav>
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => window.print()} disabled={!kind || !q.data}>
            <Printer /> พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
      </header>
      <main className="px-4 py-6 sm:py-10">
        <div className="mx-auto max-w-[210mm]">
          {!kind ? (
            <ErrorBox error={new Error('ไม่พบแบบฟอร์มนี้')} />
          ) : (
            <Async q={q}>
              {(d) => (
                <div className="sheet">
                  {kind === 'approval' ? <ApprovalSheet {...d} /> : <ConfirmationSheet {...d} />}
                </div>
              )}
            </Async>
          )}
        </div>
        <p className="no-print mx-auto mt-4 max-w-[210mm] text-center text-xs text-muted">
          ตั้งค่าการพิมพ์: กระดาษ A4 แนวตั้ง · ปิด “ส่วนหัวและส่วนท้าย” ของเบราว์เซอร์เพื่อให้เอกสารสะอาด
        </p>
      </main>
    </div>
  )
}

// ===================== ใบรับรองโครงงาน (ลงนามอาจารย์ที่ปรึกษา กรรมการ และประธานหลักสูตร) =====================
function ApprovalSheet({ project: p, settings: s }: PrintData) {
  const [year, semester] = p.term.split('/')
  const advisor = p.members.find((m) => m.kind === 'teacher' && m.teacherRole === 'advisor')
  const committee = p.members.filter((m) => m.kind === 'teacher' && m.teacherRole === 'committee')
  const chairTitle = s.chairTitle || `ประธานหลักสูตร ${s.programName}`
  return (
    <article className="text-center">
      <div className="leading-[1.9]">
        <p>อาจารย์ที่ปรึกษาและ{chairTitle}</p>
        <p>{s.facultyName} {s.universityName}</p>
        <p className="mt-4">ได้พิจารณาโครงงานเรื่อง</p>
        <p className="text-[1.15em] font-bold">{p.nameTh}</p>
        <p className="font-semibold">({p.nameEn})</p>
        <p className="mt-4">เห็นสมควรรับเป็นส่วนหนึ่งของการศึกษารายวิชา {s.courseCode} {s.courseName}</p>
        <p>
          {semester ? `ภาคการศึกษาที่ ${semester} ` : ''}ปีการศึกษา {year} {s.universityName}
        </p>
      </div>
      <hr className="mx-auto my-8 w-2/3 border-t border-neutral-400" />
      <div className="flex flex-col items-center gap-12">
        {advisor && <Signature name={advisor.user.name} role="อาจารย์ที่ปรึกษา" />}
        {committee.length > 0 && (
          <div className="flex w-full flex-wrap justify-center gap-x-10 gap-y-12">
            {committee.map((m) => <Signature key={m.user.id} name={m.user.name} role="กรรมการ" />)}
          </div>
        )}
        <Signature name={s.chairName} role={chairTitle} wide>
          <p>{s.facultyName} {s.universityName}</p>
        </Signature>
      </div>
    </article>
  )
}

function Signature({ name, role, wide, children }: { name: string; role: string; wide?: boolean; children?: ReactNode }) {
  return (
    <div className={cx('flex max-w-full break-inside-avoid flex-col items-center leading-relaxed', wide ? 'w-[120mm]' : 'w-[72mm]')}>
      <span aria-hidden className="mt-8 mb-2 block w-[62mm] max-w-full border-b border-dotted border-neutral-800" />
      <p>( {name || ' '.repeat(40)} )</p>
      <p className="font-semibold">{role}</p>
      {children}
    </div>
  )
}

// ===================== แบบฟอร์มยืนยันโปรเจค (ข้อมูลโครงงาน นิสิต และผลพิจารณาของอาจารย์) =====================
function ConfirmationSheet({ project: p, settings: s }: PrintData) {
  const students = p.members.filter((m) => m.kind === 'student')
  const teachers = teachersOf(p)
  return (
    <article>
      <header className="text-center leading-relaxed">
        <h1 className="mb-1 text-[1.35em] font-bold">แบบฟอร์มยืนยันโปรเจค</h1>
        <p>วิชา {s.courseCode} {s.courseName}</p>
        <p>{s.programName} {s.facultyName}</p>
        <p>{s.universityName}</p>
      </header>
      <hr className="my-5 border-t border-neutral-500" />

      <dl className="grid grid-cols-1 gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)] print:grid-cols-[auto_minmax(0,1fr)]">
        <Row label="ชื่อโครงงาน (ภาษาไทย)">{p.nameTh}</Row>
        <Row label="ชื่อโครงงาน (ภาษาอังกฤษ)">{p.nameEn}</Row>
        <Row label="ประเภทโครงงาน">{p.type?.name ?? '-'}</Row>
        <Row label="ปีการศึกษา">{p.term}</Row>
      </dl>

      {[0, 1].map((i) => <StudentInfo key={i} n={i + 1} m={students[i]} />)}

      <h2 className="mt-8 mb-3 text-center text-[1.2em] font-bold">ข้อมูลการยืนยันโปรเจค</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.95em]">
          <thead>
            <tr>
              {['ชื่อ-นามสกุลอาจารย์', 'บทบาท', 'ผลลัพธ์', 'วันที่'].map((h) => (
                <th key={h} className="border border-neutral-600 px-3 py-1.5 text-center font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((m) => (
              <tr key={m.user.id}>
                <td className="border border-neutral-600 px-3 py-1.5">{m.user.name}</td>
                <td className="border border-neutral-600 px-3 py-1.5 text-center whitespace-nowrap">{m.teacherRole ? TEACHER_ROLE_TH[m.teacherRole] : '-'}</td>
                <td className="border border-neutral-600 px-3 py-1.5 text-center whitespace-nowrap">{m.vote === 'pass' ? 'ผ่าน' : m.vote === 'fail' ? 'ไม่ผ่าน' : '-'}</td>
                <td className="border border-neutral-600 px-3 py-1.5 text-center whitespace-nowrap">{thaiDateLong(m.votedAt)}</td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={4} className="border border-neutral-600 px-3 py-1.5 text-center">ไม่มีข้อมูลอาจารย์</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-right text-[0.9em]">
        ผลการพิจารณา: {p.statusLabel}
        {p.passedAt && ` · ผ่านเมื่อ ${thaiDateLong(p.passedAt)}`}
      </p>
    </article>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold whitespace-nowrap">{label}:</dt>
      <dd className="mb-1 wrap-anywhere sm:mb-0 print:mb-0">{children}</dd>
    </>
  )
}

function StudentInfo({ n, m }: { n: number; m?: Member }) {
  const u = m?.user
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="font-bold">ข้อมูลนิสิตคนที่ {n}</h3>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
        <p><span className="font-semibold">ชื่อ:</span> {u?.name || '-'}</p>
        <p><span className="font-semibold">รหัสนิสิต:</span> {u?.studentId || '-'}</p>
        <p className="wrap-anywhere"><span className="font-semibold">อีเมล:</span> {u?.email || '-'}</p>
        <p><span className="font-semibold">เบอร์โทร:</span> {u?.mobile || '-'}</p>
      </div>
    </section>
  )
}
