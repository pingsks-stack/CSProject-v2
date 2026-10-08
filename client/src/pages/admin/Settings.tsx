import { useQuery } from '@tanstack/react-query'
import { FileText, Info, RotateCcw, Save } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Async, PageHeader, Panel, cx, useAction } from '../../components/ui'
import { api } from '../../lib/api'

interface FormSettings {
  courseCode: string
  courseName: string
  programName: string
  facultyName: string
  universityName: string
  chairName: string
  chairTitle: string
}
type Key = keyof FormSettings

const GROUPS: { title: string; fields: { key: Key; label: string; max: number; placeholder: string; span: string }[] }[] = [
  {
    title: 'รายวิชา',
    fields: [
      { key: 'courseCode', label: 'รหัสวิชา', max: 20, placeholder: 'เช่น 225492', span: '' },
      { key: 'courseName', label: 'ชื่อวิชา', max: 200, placeholder: 'เช่น โครงงานวิทยาการคอมพิวเตอร์', span: 'sm:col-span-2' },
    ],
  },
  {
    title: 'หน่วยงาน',
    fields: [
      { key: 'programName', label: 'สาขาวิชา', max: 200, placeholder: 'เช่น สาขาวิชาวิทยาการคอมพิวเตอร์', span: 'sm:col-span-3' },
      { key: 'facultyName', label: 'คณะ', max: 200, placeholder: 'เช่น คณะเทคโนโลยีสารสนเทศและการสื่อสาร', span: 'sm:col-span-3' },
      { key: 'universityName', label: 'มหาวิทยาลัย', max: 200, placeholder: 'เช่น มหาวิทยาลัยพะเยา', span: 'sm:col-span-3' },
    ],
  },
  {
    title: 'ผู้ลงนาม',
    fields: [
      { key: 'chairName', label: 'ชื่อประธานหลักสูตร', max: 200, placeholder: 'ชื่อ-นามสกุลพร้อมคำนำหน้า/ตำแหน่งทางวิชาการ', span: 'sm:col-span-3' },
      { key: 'chairTitle', label: 'ตำแหน่งประธานหลักสูตร', max: 300, placeholder: 'เช่น ประธานหลักสูตรวิทยาศาสตรบัณฑิต สาขาวิชาวิทยาการคอมพิวเตอร์', span: 'sm:col-span-3' },
    ],
  },
]
const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key))

// หน้า "ตั้งค่าแบบฟอร์ม" ของแอดมิน: ข้อความในแบบฟอร์มยืนยันโครงงาน (ระบบเดิมเขียนตายตัวไว้ในโค้ด)
export default function AdminSettings() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<{ settings: FormSettings }>('/admin/settings') })
  return (
    <>
      <PageHeader title="ตั้งค่าแบบฟอร์ม" subtitle="ข้อความบนแบบฟอร์มยืนยันโครงงานที่นิสิตพิมพ์ให้อาจารย์และประธานหลักสูตรลงนาม" />
      <div className="mb-6 flex gap-3 rounded-2xl border border-info/30 bg-info/10 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-info" />
        <div>
          <div className="font-medium text-ink">ข้อความเหล่านี้แสดงบนแบบฟอร์มยืนยันโครงงาน (แบบฟอร์มขออนุมัติโครงงาน)</div>
          <p className="mt-0.5 text-muted">
            นิสิตพิมพ์แบบฟอร์มได้เมื่อโครงงานผ่านการพิจารณาครบ 3/3 ระบบเดิมเขียนข้อความเหล่านี้ไว้ในโปรแกรม
            ต้องแก้โค้ดทุกครั้งที่เปลี่ยนรหัสวิชาหรือประธานหลักสูตร ตอนนี้แก้ได้จากหน้านี้ และมีผลกับแบบฟอร์มที่พิมพ์ครั้งถัดไป
          </p>
        </div>
      </div>
      <Async q={q}>{({ settings }) => <SettingsForm initial={settings} />}</Async>
    </>
  )
}

function SettingsForm({ initial }: { initial: FormSettings }) {
  const [form, setForm] = useState(initial)
  const dirty = KEYS.some((k) => form[k] !== initial[k])
  const save = useAction((b: FormSettings) => api.put('/admin/settings', b), { success: 'บันทึกการตั้งค่าแล้ว', invalidate: [['admin', 'settings']] })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const body = Object.fromEntries(KEYS.map((k) => [k, form[k].trim()])) as unknown as FormSettings
    setForm(body)
    save.mutate(body)
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <Panel title="ข้อความในแบบฟอร์ม" sub="ทุกช่องจำเป็นต้องกรอก เพื่อไม่ให้แบบฟอร์มมีช่องว่าง">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          {GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="mb-3 text-xs font-semibold text-muted">{g.title}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {g.fields.map((f) => (
                  <label key={f.key} className={cx('field', f.span)}>
                    <span>{f.label}</span>
                    <input
                      className="input"
                      required
                      maxLength={f.max}
                      placeholder={f.placeholder}
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-ghost" disabled={!dirty || save.isPending} onClick={() => setForm(initial)}>
              <RotateCcw /> คืนค่าเดิม
            </button>
            <button className="btn btn-primary" disabled={!dirty || save.isPending}><Save /> บันทึก</button>
          </div>
        </form>
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><FileText className="size-4 text-muted" /> ตัวอย่างข้อความบนแบบฟอร์ม</span>} sub="ตำแหน่งโดยประมาณ ส่วนที่เน้นสีมาจากการตั้งค่านี้">
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-5 text-center text-sm leading-relaxed text-ink">
          <div className="font-semibold">แบบฟอร์มยืนยันโครงงาน</div>
          <div><V>{form.programName}</V> <V>{form.facultyName}</V> <V>{form.universityName}</V></div>
          <div className="mt-3 text-muted">ได้พิจารณาโครงงานเรื่อง “ชื่อโครงงาน”</div>
          <div>เห็นสมควรรับเป็นส่วนหนึ่งของการศึกษารายวิชา <V>{form.courseCode}</V> <V>{form.courseName}</V></div>
          <div className="text-muted">ปีการศึกษา … <V>{form.universityName}</V></div>
          <div className="mt-6 text-muted">ลงชื่อ ..................................</div>
          <div>(<V>{form.chairName}</V>)</div>
          <div><V>{form.chairTitle}</V></div>
          <div><V>{form.facultyName}</V> <V>{form.universityName}</V></div>
        </div>
      </Panel>
    </div>
  )
}

// ข้อความจากการตั้งค่าในตัวอย่างแบบฟอร์ม
function V({ children }: { children: ReactNode }) {
  return children ? <span className="font-medium text-accent">{children}</span> : <span className="text-bad">[ยังไม่ระบุ]</span>
}
