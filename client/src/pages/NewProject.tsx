import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, FolderKanban, FolderPlus, Paperclip, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Async, Empty, PageHeader, Panel, Spinner, cx, useAction, useConfirm } from '../components/ui'
import { api } from '../lib/api'
import { ALLOWED_EXT, MAX_UPLOAD_MB, fileSize } from '../lib/format'
import { useMeta } from '../lib/queries'
import type { Project } from '../lib/types'

const MAX_FILES = 10
const NAME_MAX = 200
const EXTS = ALLOWED_EXT.split(',')

const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

// ตรวจไฟล์ก่อนส่ง (server ตรวจซ้ำอีกครั้ง)
function checkFile(f: File) {
  if (!EXTS.includes(extOf(f.name))) return `${f.name}: ไม่รองรับไฟล์ประเภทนี้`
  if (f.size === 0) return `${f.name}: ไฟล์ว่างเปล่า`
  if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return `${f.name}: ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB`
  return null
}

// หน้า "เพิ่มโครงงาน" ของนิสิต (แทน Add_Doc.aspx)
export default function NewProject() {
  const mine = useQuery({ queryKey: ['projects', 'mine'], queryFn: () => api.get<{ projects: Project[] }>('/projects?scope=mine') })
  return (
    <>
      <PageHeader title="เพิ่มโครงงาน" subtitle="กรอกชื่อโครงงานทั้งภาษาไทยและภาษาอังกฤษ แล้วแนบไฟล์เอกสารเริ่มต้น (ถ้ามี)" back="/my-projects" />
      <Async q={mine}>{({ projects }) => (projects.length > 0 ? <AlreadyHave p={projects[0]} /> : <NewProjectForm />)}</Async>
    </>
  )
}

function AlreadyHave({ p }: { p: Project }) {
  return (
    <div className="panel">
      <Empty icon={FolderKanban} title="คุณมีโครงงานอยู่แล้ว">
        นิสิตแต่ละคนมีโครงงานได้ 1 โครงงาน โครงงานปัจจุบันของคุณคือ “{p.nameTh}”
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link to={`/projects/${p.id}`} className="btn btn-primary">ไปที่โครงงาน</Link>
          <Link to="/my-projects" className="btn btn-ghost">โครงงานของฉัน</Link>
        </div>
      </Empty>
    </div>
  )
}

function NewProjectForm() {
  const meta = useMeta()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [nameTh, setNameTh] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [typeId, setTypeId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const errors: string[] = []
    const next = [...files]
    for (const f of Array.from(list)) {
      const err = checkFile(f)
      if (err) {
        errors.push(err)
        continue
      }
      // ชื่อซ้ำ = ใช้ไฟล์ใหม่แทน (server ก็แทนที่ไฟล์ชื่อเดียวกัน)
      const same = next.findIndex((x) => x.name === f.name)
      if (same >= 0) next[same] = f
      else if (next.length < MAX_FILES) next.push(f)
      else if (!errors.includes(`เลือกได้ไม่เกิน ${MAX_FILES} ไฟล์`)) errors.push(`เลือกได้ไม่เกิน ${MAX_FILES} ไฟล์`)
    }
    setFiles(next)
    if (inputRef.current) inputRef.current.value = ''
    if (errors.length) {
      toast.error('บางไฟล์เพิ่มไม่ได้', {
        description: <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>,
      })
    }
  }

  const create = useAction(
    async () => {
      const { id } = await api.post<{ id: string }>('/projects', { nameTh: nameTh.trim(), nameEn: nameEn.trim(), typeId: typeId || null })
      // สร้างโครงงานสำเร็จแล้ว ถ้าอัปโหลดไฟล์ไม่ผ่านก็ยังไปหน้าโครงงานได้ (อัปโหลดใหม่ได้ที่นั่น)
      let uploadError = ''
      if (files.length) {
        const fd = new FormData()
        for (const f of files) fd.append('files', f)
        try {
          await api.post(`/projects/${id}/files`, fd)
        } catch (e) {
          uploadError = e instanceof Error ? e.message : 'อัปโหลดไฟล์ไม่สำเร็จ'
        }
      }
      return { id, uploadError }
    },
    {
      success: 'สร้างโครงงานสำเร็จ',
      onSuccess: ({ id, uploadError }) => {
        if (uploadError) toast.error(`อัปโหลดไฟล์ไม่สำเร็จ: ${uploadError}`, { description: 'อัปโหลดไฟล์อีกครั้งได้ที่หน้าจัดการโครงงาน' })
        navigate(`/projects/${id}`, { replace: true })
        qc.invalidateQueries({ queryKey: ['projects'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      },
    },
  )

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!nameTh.trim() || !nameEn.trim()) return
    const type = meta.data?.types.find((t) => t.id === typeId)?.name
    const ok = await confirm({
      title: 'ยืนยันการสร้างโครงงานนี้ใช่ไหม?',
      text: (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-ink">{nameTh.trim()}</span>
          <span>{nameEn.trim()}</span>
          <span>ประเภท: {type ?? 'ยังไม่ระบุ'} · ไฟล์แนบ {files.length} ไฟล์</span>
        </div>
      ),
      confirmText: 'สร้างโครงงาน',
    })
    if (ok) create.mutate()
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form onSubmit={onSubmit} className="panel min-w-0 overflow-hidden lg:col-span-2">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">ข้อมูลโครงงาน</h2>
            <p className="panel-sub">ชื่อโครงงานต้องไม่ซ้ำกับโครงงานอื่นในระบบ</p>
          </div>
        </div>
        <div className="flex flex-col gap-5 p-5">
          <label className="field">
            <span className="flex justify-between gap-2">
              <span>ชื่อโครงงาน (ภาษาไทย) <b className="text-bad">*</b></span>
              <small className="font-normal text-muted">{nameTh.length}/{NAME_MAX}</small>
            </span>
            <input className="input" required maxLength={NAME_MAX} value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="เช่น ระบบแนะนำรายวิชาเลือกด้วยการเรียนรู้ของเครื่อง" />
          </label>
          <label className="field">
            <span className="flex justify-between gap-2">
              <span>ชื่อโครงงาน (ภาษาอังกฤษ) <b className="text-bad">*</b></span>
              <small className="font-normal text-muted">{nameEn.length}/{NAME_MAX}</small>
            </span>
            <input className="input" required maxLength={NAME_MAX} value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Elective Course Recommendation System using Machine Learning" lang="en" />
          </label>
          <label className="field">
            <span>ประเภทโครงงาน</span>
            <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={meta.isPending}>
              <option value="">— ยังไม่ระบุ (เลือกภายหลังได้) —</option>
              {meta.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <div className="field">
            <span>ไฟล์เอกสาร <small className="font-normal text-muted">(ไม่บังคับ)</small></span>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                addFiles(e.dataTransfer.files)
              }}
              className={cx(
                'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition',
                dragging ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-accent/60',
              )}
            >
              <span className="kpi-icon bg-accent/15 text-accent"><FileUp /></span>
              <span className="text-sm font-medium text-ink">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</span>
              <span className="text-xs text-muted">
                สูงสุด {MAX_FILES} ไฟล์ ไฟล์ละไม่เกิน {MAX_UPLOAD_MB} MB · PDF, Word, Excel, PowerPoint, รูปภาพ, TXT, ZIP/RAR/7z
              </span>
              <input ref={inputRef} type="file" multiple accept={ALLOWED_EXT} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
            {files.length > 0 && (
              <ul className="mt-1 divide-y divide-line rounded-xl border border-line">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-3 px-3 py-2">
                    <Paperclip className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm" title={f.name}>{f.name}</span>
                    <span className="shrink-0 text-xs text-muted">{fileSize(f.size)}</span>
                    <button
                      type="button"
                      className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-bad"
                      aria-label={`นำ ${f.name} ออก`}
                      onClick={() => setFiles(files.filter((x) => x !== f))}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {create.error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{create.error.message}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
          <Link to="/my-projects" className="btn btn-ghost">ยกเลิก</Link>
          <button className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? <Spinner className="text-accent-ink" /> : <FolderPlus />} สร้างโครงงาน
          </button>
        </div>
      </form>

      <Panel title="หลังจากสร้างโครงงาน" sub={meta.data ? `ภาคการศึกษา ${meta.data.currentTerm}` : undefined} className="min-w-0 self-start">
        <ol className="flex flex-col gap-4 text-sm">
          {[
            ['เพิ่มคู่โปรเจค', 'เพิ่มนิสิตอีก 1 คนได้ที่หน้าจัดการโครงงาน (โครงงานละไม่เกิน 2 คน)'],
            ['เชิญอาจารย์', 'อาจารย์ที่ปรึกษา 1 ท่าน และกรรมการ 2 ท่าน อาจารย์ต้องตอบรับคำเชิญก่อน'],
            ['ส่งเอกสารรายบท', 'ส่งบทที่ 1–5 ภาคผนวก และเล่มสมบูรณ์ตามกำหนดส่ง อาจารย์จะให้ความเห็นแต่ละเวอร์ชัน'],
            ['ผลการพิจารณา', 'เมื่ออาจารย์ทั้ง 3 ท่านให้ผ่าน จะพิมพ์ใบยืนยันโครงงานได้'],
          ].map(([title, note], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-medium text-ink">{title}</span>
                <span className="block text-muted">{note}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          หลังสร้างแล้ว การเปลี่ยนชื่อโครงงานต้องส่งคำขอให้อาจารย์ที่ปรึกษาอนุมัติ
        </p>
      </Panel>
    </div>
  )
}
