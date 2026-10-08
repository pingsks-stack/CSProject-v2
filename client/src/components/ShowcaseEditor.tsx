import { ChevronLeft, ChevronRight, CirclePlay, ExternalLink, Globe, ImagePlus, Library, Pencil, Save, Sparkles, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type TouchEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Project, Showcase } from '../lib/types'
import { Empty, Modal, Panel, Spinner, cx, useAction, useConfirm } from './ui'

// ข้อมูลแนะนำโครงงานสำหรับคลังโครงงาน (บทคัดย่อ คำสำคัญ ลิงก์ ภาพหน้าจอ)
// ใช้ทั้งหน้าโครงงาน (แสดง + แก้ไข) และหน้าคลังโครงงานสาธารณะ (แสดงอย่างเดียว)

const MAX_ABSTRACT = 3000
const MAX_KEYWORDS = 10
const MAX_KEYWORD_LEN = 40
const MAX_IMAGES = 6
const MAX_IMAGE_MB = 5
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i
const EMPTY: Showcase = { abstract: '', keywords: [], demoUrl: '', videoUrl: '', images: [] }
const LABEL = 'mb-2 text-xs font-medium text-muted'

export function hasShowcase(s: Showcase | null | undefined) {
  return !!s && !!(s.abstract || s.keywords.length || s.demoUrl || s.videoUrl || s.images.length)
}

// เปิดได้เฉพาะลิงก์ http(s) (server ตรวจแล้ว แต่กันไว้อีกชั้น)
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : '')
const isUrl = (u: string) => !u || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(u)
// พิมพ์โดยไม่ใส่ http:// เช่น example.com → เติม https:// ให้
const withScheme = (v: string) => {
  const t = v.trim()
  return t && !/^[a-z][a-z\d+.-]*:/i.test(t) && /^[\w-]+(\.[\w-]+)+/.test(t) ? `https://${t}` : t
}
const isYoutube = (u: string) => {
  try {
    return /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(u).hostname)
  } catch {
    return false
  }
}

// ===================== แสดงผล (อ่านอย่างเดียว) =====================
export function ShowcaseDetails({ showcase: s, imageUrl, keywordHref }: {
  showcase: Showcase
  imageUrl: (imageId: string) => string
  keywordHref?: (keyword: string) => string
}) {
  const [more, setMore] = useState(false)
  const demo = safeUrl(s.demoUrl)
  const video = safeUrl(s.videoUrl)
  const long = s.abstract.length > 480 || s.abstract.split('\n').length > 6
  return (
    <div className="flex flex-col gap-5">
      {s.abstract && (
        <section>
          <h3 className={LABEL}>บทคัดย่อ</h3>
          <p className={cx('text-sm leading-relaxed break-words whitespace-pre-line text-ink', long && !more && 'line-clamp-6')}>{s.abstract}</p>
          {long && (
            <button type="button" className="mt-1 text-sm text-accent hover:underline" onClick={() => setMore(!more)}>
              {more ? 'ย่อ' : 'อ่านต่อ'}
            </button>
          )}
        </section>
      )}
      {s.keywords.length > 0 && (
        <section>
          <h3 className={LABEL}>คำสำคัญ</h3>
          <ul className="flex flex-wrap gap-1.5">
            {s.keywords.map((k) => (
              <li key={k}>
                {keywordHref ? (
                  <Link to={keywordHref(k)} className="inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent no-underline transition hover:bg-accent/20" title={`ค้นหาโครงงานที่เกี่ยวกับ ${k}`}>
                    {k}
                  </Link>
                ) : (
                  <span className="inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">{k}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(demo || video) && (
        <div className="flex flex-wrap gap-2">
          {demo && (
            <a href={demo} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" title={demo}>
              <Globe /> เปิดเดโม <ExternalLink />
            </a>
          )}
          {video && (
            <a href={video} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title={video}>
              <CirclePlay /> {isYoutube(video) ? 'ดูวิดีโอบน YouTube' : 'ดูวิดีโอแนะนำ'} <ExternalLink />
            </a>
          )}
        </div>
      )}
      {s.images.length > 0 && (
        <section>
          <h3 className={LABEL}>ภาพหน้าจอ ({s.images.length})</h3>
          <Gallery images={s.images} src={imageUrl} />
        </section>
      )}
    </div>
  )
}

function CoverMark({ className }: { className?: string }) {
  return (
    <span className={cx('badge bg-surface/90 text-gold shadow-sm backdrop-blur', className)}>
      <Star className="size-3 fill-current" /> ภาพปก
    </span>
  )
}

function Gallery({ images, src }: { images: Showcase['images']; src: (imageId: string) => string }) {
  const [index, setIndex] = useState<number | null>(null)
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((img, i) => (
          <li key={img.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group relative block w-full overflow-hidden rounded-xl border border-line bg-surface-2"
              aria-label={`ดูภาพ ${img.fileName || i + 1} ขนาดใหญ่`}
            >
              <img src={src(img.id)} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover transition duration-300 group-hover:scale-105" />
              {i === 0 && <CoverMark className="absolute top-2 left-2" />}
            </button>
          </li>
        ))}
      </ul>
      <Lightbox images={images} src={src} index={index} setIndex={setIndex} />
    </>
  )
}

// ดูภาพขนาดใหญ่: ปุ่ม/ลูกศรซ้ายขวา/ปัดนิ้วเพื่อเลื่อนภาพ
function Lightbox({ images, src, index, setIndex }: {
  images: Showcase['images']
  src: (imageId: string) => string
  index: number | null
  setIndex: (fn: (i: number | null) => number | null) => void
}) {
  const n = images.length
  const touchX = useRef<number | null>(null)
  const go = (d: number) => setIndex((i) => (i === null ? null : (i + d + n) % n))
  const open = index !== null && index < n

  useEffect(() => {
    if (!open || n < 2) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => (i === null ? null : (i - 1 + n) % n))
      else if (e.key === 'ArrowRight') setIndex((i) => (i === null ? null : (i + 1) % n))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, n, setIndex])

  const at = index ?? 0
  const img = open ? images[at] : null
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
  }

  return (
    <Modal open={open} onClose={() => setIndex(() => null)} title={open ? `ภาพหน้าจอ ${at + 1} จาก ${n}` : ''} wide>
      {img && (
        <div className="flex flex-col gap-3">
          <div
            className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-surface-2"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
            onTouchEnd={onTouchEnd}
          >
            <img key={img.id} src={src(img.id)} alt={img.fileName || `ภาพหน้าจอ ${at + 1}`} className="max-h-[65vh] w-auto max-w-full object-contain" />
            {at === 0 && <CoverMark className="absolute top-3 left-3" />}
            {n > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full border border-line bg-surface/90 p-2 text-ink shadow-md backdrop-blur hover:bg-surface" aria-label="ภาพก่อนหน้า">
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full border border-line bg-surface/90 p-2 text-ink shadow-md backdrop-blur hover:bg-surface" aria-label="ภาพถัดไป">
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>
          {img.fileName && <p className="truncate text-center text-xs text-muted">{img.fileName}</p>}
          {n > 1 && (
            <div className="flex justify-center gap-2 overflow-x-auto pb-1">
              {images.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setIndex(() => i)}
                  className={cx('w-20 shrink-0 overflow-hidden rounded-lg border-2 transition', i === at ? 'border-accent' : 'border-transparent opacity-60 hover:opacity-100')}
                  aria-label={`ภาพที่ ${i + 1}`}
                  aria-current={i === at ? 'true' : undefined}
                >
                  <img src={src(t.id)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ===================== แผงในหน้าโครงงาน =====================
const showcaseKeys = (id: string) => [['project', id], ['public']]
const memberImage = (projectId: string) => (imageId: string) => `/api/projects/${projectId}/showcase/images/${imageId}`

export function ShowcasePanel({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const s = project.showcase ?? EMPTY
  const filled = hasShowcase(s)
  if (!filled && !canEdit) return null
  const passed = project.status === 'passed'
  const missing = [!s.abstract && 'บทคัดย่อ', !s.keywords.length && 'คำสำคัญ', !s.images.length && 'ภาพหน้าจอ'].filter(Boolean)

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2"><Library className="size-4" /> ข้อมูลคลังโครงงาน</span>}
      sub={passed ? 'แสดงในคลังโครงงานสาธารณะให้รุ่นน้องดูแล้ว' : 'จะแสดงในคลังโครงงานสาธารณะเมื่อโครงงานผ่านการพิจารณา (ผ่าน 3/3)'}
      actions={(passed || (canEdit && filled)) && (
        <>
          {passed && <Link to={`/showcase/${project.id}`} target="_blank" className="btn btn-ghost btn-sm"><ExternalLink /> ดูในคลัง</Link>}
          {canEdit && filled && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil /> แก้ไขข้อมูลคลังโครงงาน</button>}
        </>
      )}
      bodyClass={filled ? undefined : 'p-0'}
    >
      {filled ? (
        <>
          <ShowcaseDetails showcase={s} imageUrl={memberImage(project.id)} />
          {canEdit && missing.length > 0 && (
            <p className="mt-5 rounded-xl bg-accent/8 px-3 py-2 text-xs text-muted">
              ยังไม่ได้ใส่{missing.join(' ')} — ข้อมูลที่ครบช่วยให้รุ่นน้องค้นเจอและเข้าใจโครงงานได้ง่ายขึ้น
              {!s.images.length && ' (ภาพแรกจะเป็นภาพปกบนการ์ดในคลัง)'}
            </p>
          )}
        </>
      ) : (
        <Empty icon={Sparkles} title="แนะนำโครงงานของคุณให้รุ่นน้อง">
          <p>
            เพิ่มบทคัดย่อ คำสำคัญ ลิงก์เดโม/วิดีโอ และภาพหน้าจอ ข้อมูลนี้จะแสดงใน<b className="font-medium text-ink">คลังโครงงานสาธารณะ</b>
            ให้รุ่นน้องค้นหาและศึกษาได้{passed ? ' ทันทีที่บันทึก เพราะโครงงานผ่านแล้ว' : ' หลังโครงงานผ่านการพิจารณา (ผ่าน 3/3)'}
          </p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setEditing(true)}><Pencil /> เพิ่มข้อมูลคลังโครงงาน</button>
        </Empty>
      )}
      {editing && <EditorModal project={project} onClose={() => setEditing(false)} />}
    </Panel>
  )
}

// ===================== ฟอร์มแก้ไข =====================
// สร้างใหม่ทุกครั้งที่เปิด ค่าเริ่มต้นคือข้อมูลล่าสุดของโครงงาน (ภาพบันทึกทันทีแยกจากปุ่มบันทึก)
function EditorModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const s = project.showcase ?? EMPTY
  const [abstract, setAbstract] = useState(s.abstract)
  const [keywords, setKeywords] = useState(s.keywords)
  const [demoUrl, setDemoUrl] = useState(s.demoUrl)
  const [videoUrl, setVideoUrl] = useState(s.videoUrl)
  // แสดงข้อผิดพลาดของลิงก์หลังออกจากช่องหรือกดบันทึก
  const [touched, setTouched] = useState({ demo: false, video: false })
  const errors = {
    demoUrl: isUrl(demoUrl.trim()) ? '' : 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://',
    videoUrl: isUrl(videoUrl.trim()) ? '' : 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://',
  }

  const save = useAction(
    (body: Omit<Showcase, 'images'>) => api.put<{ showcase: Showcase }>(`/projects/${project.id}/showcase`, body),
    { success: 'บันทึกข้อมูลคลังโครงงานแล้ว', invalidate: showcaseKeys(project.id), onSuccess: onClose },
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const demo = withScheme(demoUrl)
    const video = withScheme(videoUrl)
    setDemoUrl(demo)
    setVideoUrl(video)
    setTouched({ demo: true, video: true })
    if (!isUrl(demo) || !isUrl(video)) return
    save.mutate({ abstract: abstract.trim(), keywords, demoUrl: demo, videoUrl: video })
  }

  const left = MAX_ABSTRACT - abstract.length

  return (
    <Modal
      open
      onClose={onClose}
      title="แก้ไขข้อมูลคลังโครงงาน"
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ปิด</button>
          <button type="submit" form="showcase-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner className="text-accent-ink" /> : <Save />} บันทึกข้อมูล
          </button>
        </>
      }
    >
      <form id="showcase-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <p className="rounded-xl bg-accent/8 px-3 py-2 text-xs text-muted">
          ข้อมูลนี้จะแสดงในคลังโครงงานสาธารณะ (ไม่ต้องล็อกอินก็ดูได้) หลังโครงงานผ่านการพิจารณา — ช่วยให้รุ่นน้องค้นเจอและเข้าใจโครงงานของคุณ
        </p>
        <div className="field">
          <label htmlFor="sc-abstract" className="font-medium text-ink">บทคัดย่อ</label>
          <textarea
            id="sc-abstract"
            className="input min-h-36 resize-y leading-relaxed"
            rows={7}
            maxLength={MAX_ABSTRACT}
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="สรุปว่าโครงงานทำอะไร แก้ปัญหาอะไร ใช้เทคโนโลยีอะไร และได้ผลลัพธ์อย่างไร"
            aria-describedby="sc-abstract-count"
          />
          <div id="sc-abstract-count" className={cx('text-right text-xs', left < 200 ? 'text-warn' : 'text-muted')}>
            {abstract.length.toLocaleString()}/{MAX_ABSTRACT.toLocaleString()} ตัวอักษร
          </div>
        </div>

        <div className="field">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="sc-keyword" className="font-medium text-ink">คำสำคัญ</label>
            <span className="text-xs text-muted">{keywords.length}/{MAX_KEYWORDS} คำ</span>
          </div>
          <KeywordInput id="sc-keyword" value={keywords} onChange={setKeywords} />
          <p className="text-xs text-muted">พิมพ์แล้วกด Enter หรือจุลภาค (,) เพื่อเพิ่ม · รุ่นน้องค้นหาโครงงานด้วยคำเหล่านี้ได้</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <UrlField
            id="sc-demo"
            label="ลิงก์เดโม / เว็บไซต์"
            placeholder="https://"
            value={demoUrl}
            onChange={setDemoUrl}
            onBlur={() => { setDemoUrl(withScheme(demoUrl)); setTouched((t) => ({ ...t, demo: true })) }}
            error={touched.demo ? errors.demoUrl : ''}
          />
          <UrlField
            id="sc-video"
            label="ลิงก์วิดีโอนำเสนอ (YouTube ฯลฯ)"
            placeholder="https://youtube.com/watch?v=…"
            value={videoUrl}
            onChange={setVideoUrl}
            onBlur={() => { setVideoUrl(withScheme(videoUrl)); setTouched((t) => ({ ...t, video: true })) }}
            error={touched.video ? errors.videoUrl : ''}
          />
        </div>
      </form>

      <ImageManager project={project} />
    </Modal>
  )
}

function UrlField({ id, label, placeholder, value, onChange, onBlur, error }: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  error: string
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="font-medium text-ink">{label}</label>
      <input
        id={id}
        type="url"
        inputMode="url"
        className={cx('input', error && 'border-bad')}
        maxLength={500}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && <p id={`${id}-err`} className="text-xs text-bad">{error}</p>}
    </div>
  )
}

// ช่องใส่คำสำคัญแบบชิป: Enter/จุลภาค = เพิ่ม, Backspace ในช่องว่าง = ลบคำสุดท้าย
function KeywordInput({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const full = value.length >= MAX_KEYWORDS

  const add = (raw: string) => {
    const next = [...value]
    for (const k of raw.split(/[,，]/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
      if (next.length >= MAX_KEYWORDS) {
        toast.error(`ใส่คำสำคัญได้ไม่เกิน ${MAX_KEYWORDS} คำ`)
        break
      }
      if (k.length > MAX_KEYWORD_LEN) {
        toast.error(`คำสำคัญ "${k.slice(0, 20)}…" ยาวเกิน ${MAX_KEYWORD_LEN} ตัวอักษร`)
        continue
      }
      if (!next.some((x) => x.toLowerCase() === k.toLowerCase())) next.push(k)
    }
    if (next.length !== value.length) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (draft.trim()) add(draft)
      setDraft('')
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div
      className="input flex min-h-10.5 cursor-text flex-wrap items-center gap-1.5 py-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((k) => (
        <span key={k} className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-accent/15 py-0.5 pr-1 pl-2.5 text-xs font-medium text-accent">
          <span className="truncate">{k}</span>
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-accent/20"
            onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== k)) }}
            aria-label={`ลบคำสำคัญ ${k}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        className="min-w-28 flex-1 bg-transparent py-0.5 text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-none disabled:cursor-not-allowed"
        value={draft}
        disabled={full}
        placeholder={full ? 'ครบ 10 คำแล้ว' : value.length ? 'เพิ่มคำสำคัญ' : 'เช่น React, Machine Learning, IoT'}
        onChange={(e) => {
          const v = e.target.value
          // วางข้อความที่มีจุลภาค → แยกเป็นหลายคำ
          if (/[,，]/.test(v)) {
            const parts = v.split(/[,，]/)
            add(parts.slice(0, -1).join(','))
            setDraft(parts[parts.length - 1])
          } else setDraft(v)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) add(draft)
          setDraft('')
        }}
      />
    </div>
  )
}

// จัดการภาพหน้าจอ: อัปโหลด ตั้งภาพปก ลบ (มีผลทันที)
function ImageManager({ project }: { project: Project }) {
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const images = project.showcase?.images ?? []
  const room = MAX_IMAGES - images.length
  const src = memberImage(project.id)
  const keys = showcaseKeys(project.id)

  const upload = useAction((fd: FormData) => api.post<{ showcase: Showcase; skipped: number }>(`/projects/${project.id}/showcase/images`, fd), {
    success: (r) => (r.skipped ? `เพิ่มภาพแล้ว (ข้าม ${r.skipped} ภาพเพราะเกิน ${MAX_IMAGES} ภาพ)` : 'เพิ่มภาพแล้ว'),
    invalidate: keys,
  })
  const remove = useAction((imageId: string) => api.del<{ showcase: Showcase }>(`/projects/${project.id}/showcase/images/${imageId}`), {
    success: 'ลบภาพแล้ว',
    invalidate: keys,
  })
  const cover = useAction((imageId: string) => api.post<{ showcase: Showcase }>(`/projects/${project.id}/showcase/images/${imageId}/cover`), {
    success: 'ตั้งเป็นภาพปกแล้ว',
    invalidate: keys,
  })
  const busy = upload.isPending || remove.isPending || cover.isPending

  const onPick = (list: FileList | null) => {
    if (inputRef.current) inputRef.current.value = ''
    if (!list?.length || upload.isPending) return
    const files = [...list]
    const badType = files.filter((f) => !IMAGE_EXT.test(f.name))
    const tooBig = files.filter((f) => IMAGE_EXT.test(f.name) && f.size > MAX_IMAGE_MB * 1024 * 1024)
    const ok = files.filter((f) => IMAGE_EXT.test(f.name) && f.size <= MAX_IMAGE_MB * 1024 * 1024)
    if (badType.length) toast.error(`รองรับเฉพาะภาพ .jpg .png .webp (ข้าม ${badType.map((f) => f.name).join(', ')})`)
    if (tooBig.length) toast.error(`ภาพต้องไม่เกิน ${MAX_IMAGE_MB} MB (ข้าม ${tooBig.map((f) => f.name).join(', ')})`)
    if (!ok.length) return
    if (room <= 0) return toast.error(`ใส่ภาพได้ไม่เกิน ${MAX_IMAGES} ภาพ ลบภาพเดิมก่อนเพิ่มภาพใหม่`)
    if (ok.length > room) toast.warning(`เพิ่มได้อีก ${room} ภาพ จะอัปโหลดเฉพาะ ${room} ภาพแรก`)
    const fd = new FormData()
    for (const f of ok.slice(0, room)) fd.append('images', f)
    upload.mutate(fd)
  }

  return (
    <section className="mt-6 border-t border-line pt-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm">ภาพหน้าจอ <span className="font-normal text-muted">{images.length}/{MAX_IMAGES}</span></h3>
        <span className="text-xs text-muted">บันทึกทันทีที่อัปโหลด/ลบ</span>
      </div>
      <p className="mb-3 text-xs text-muted">ภาพแรกคือภาพปกบนการ์ดในคลังโครงงาน · ไฟล์ .jpg .png .webp ไม่เกิน {MAX_IMAGE_MB} MB ต่อภาพ</p>
      <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPick(e.target.files)} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => {
          const removing = remove.isPending && remove.variables === img.id
          return (
            <li key={img.id} className={cx('flex flex-col overflow-hidden rounded-xl border border-line bg-surface', removing && 'opacity-50')}>
              <div className="relative bg-surface-2">
                <img src={src(img.id)} alt={img.fileName} title={img.fileName} loading="lazy" className="aspect-video w-full object-cover" />
                {i === 0 && <CoverMark className="absolute top-2 left-2" />}
              </div>
              <div className="flex items-center gap-1 border-t border-line p-1.5">
                {i === 0 ? (
                  <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-muted">ภาพปกปัจจุบัน</span>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm min-w-0 flex-1 px-2" disabled={busy} onClick={() => cover.mutate(img.id)}>
                    <Star className="hidden sm:block" /> <span className="truncate">ตั้งเป็นภาพปก</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-bad btn-sm shrink-0 px-2"
                  disabled={busy}
                  aria-label={`ลบภาพ ${img.fileName}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'ลบภาพหน้าจอ',
                      text: i === 0 && images.length > 1 ? `ลบ "${img.fileName}" ใช่ไหม? ภาพถัดไปจะกลายเป็นภาพปกแทน` : `ลบ "${img.fileName}" ใช่ไหม?`,
                      danger: true,
                      confirmText: 'ลบภาพ',
                    })
                    if (ok) remove.mutate(img.id)
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            </li>
          )
        })}
        {room > 0 && (
          <li className={cx(images.length === 0 && 'col-span-full')}>
            <button
              type="button"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onPick(e.dataTransfer.files) }}
              className={cx(
                'flex h-full min-h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 text-center text-muted transition hover:border-accent hover:text-accent disabled:cursor-wait',
                drag ? 'border-accent bg-accent/8 text-accent' : 'border-line',
              )}
            >
              {upload.isPending ? <Spinner className="text-accent" /> : <ImagePlus className="size-6" />}
              <span className="text-sm font-medium">{upload.isPending ? 'กำลังอัปโหลด…' : images.length ? 'เพิ่มภาพ' : 'เลือกหรือลากภาพหน้าจอมาวาง'}</span>
              <span className="text-xs">เพิ่มได้อีก {room} ภาพ</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
