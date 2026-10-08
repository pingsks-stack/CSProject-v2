import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Check, CodeXml, Copy, Download, Eye, FileText, GitBranch, Info, Lock, Share2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { toast } from 'sonner'
import { GithubSummary } from '../../components/github'
import { PublicLayout } from '../../components/PublicLayout'
import { ShowcaseDetails, hasShowcase } from '../../components/ShowcaseEditor'
import { Async, Avatar, Badge, Empty, Panel, cx } from '../../components/ui'
import { api, qs } from '../../lib/api'
import { fileSize, languageLabel, thaiDate, thaiDateLong } from '../../lib/format'
import type { PublicDetail } from '../../lib/types'

// รายละเอียดโครงงานในคลังสาธารณะ: ข้อมูลโครงงาน ผู้จัดทำ GitHub และซอร์สโค้ดดูได้ทุกคน
// ตัวไฟล์ (เล่มสมบูรณ์/เอกสารรายบท/ไฟล์แนบ) ต้องเข้าสู่ระบบก่อนเปิด
export default function ShowcaseProject() {
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['public', 'project', id], queryFn: () => api.get<PublicDetail>(`/public/projects/${id}`) })
  useEffect(() => {
    if (q.data) document.title = `${q.data.project.nameTh} · คลังโครงงาน CS`
    return () => { document.title = 'CS Project · มหาวิทยาลัยพะเยา' }
  }, [q.data])

  return (
    <PublicLayout>
      <Link to="/showcase" className="mb-4 inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-accent">
        <ArrowLeft className="size-4" /> คลังโครงงาน
      </Link>
      <Async q={q}>{(d) => <Detail d={d} />}</Async>
    </PublicLayout>
  )
}

function Detail({ d }: { d: PublicDetail }) {
  const { project: p } = d
  const book = d.chapters.find((c) => c.chapter === 'เล่มสมบูรณ์')
  return (
    <>
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge tone="accent">{p.type?.name ?? 'ไม่ระบุประเภท'}</Badge>
          <Badge>ปีการศึกษา {p.term}</Badge>
          {p.passedAt && <Badge tone="ok">ผ่านการพิจารณา {thaiDateLong(p.passedAt)}</Badge>}
        </div>
        <h1 className="text-2xl leading-tight sm:text-3xl">{p.nameTh}</h1>
        <p className="mt-1 text-muted">{p.nameEn}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {hasShowcase(d.showcase) && (
            <Panel title={<span className="inline-flex items-center gap-2"><Info className="size-4" /> เกี่ยวกับโครงงาน</span>}>
              <ShowcaseDetails
                showcase={d.showcase}
                imageUrl={(imageId) => `/api/public/projects/${p.id}/images/${imageId}`}
                keywordHref={(k) => `/showcase${qs({ q: k })}`}
              />
            </Panel>
          )}
          <BookPanel d={d} book={book} />
          {d.chapters.some((c) => c.chapter !== 'เล่มสมบูรณ์') && <ChaptersPanel d={d} />}
          {d.github && (
            <Panel title={<span className="inline-flex items-center gap-2"><GitBranch className="size-4" /> งานบน GitHub</span>}>
              <GithubSummary g={d.github} />
            </Panel>
          )}
          <CodesPanel d={d} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <TeamPanel d={d} />
          {d.files.length > 0 && <FilesPanel d={d} />}
          <ShareButton />
        </div>
      </div>
    </>
  )
}

// ลิงก์เปิดไฟล์: ล็อกอินแล้ว = เปิด/ดาวน์โหลด, ยังไม่ล็อกอิน = ไปหน้าเข้าสู่ระบบแล้วกลับมาที่ไฟล์
function FileAction({ d, kind, fileId, isPdf }: { d: PublicDetail; kind: 'c' | 'f'; fileId: string; isPdf: boolean }) {
  const location = useLocation()
  const readUrl = `/showcase/${d.project.id}/read?${kind}=${fileId}`
  const downloadUrl = kind === 'c' ? `/api/submissions/${fileId}/download` : `/api/projects/${d.project.id}/files/${fileId}/download`
  if (!d.loggedIn) {
    return (
      <Link to="/login" state={{ from: isPdf ? readUrl : location.pathname }} className="btn btn-ghost btn-sm">
        <Lock /> เข้าสู่ระบบเพื่อเปิด
      </Link>
    )
  }
  return (
    <div className="flex gap-2">
      {isPdf && <Link to={readUrl} className="btn btn-ghost btn-sm"><Eye /> เปิดอ่าน</Link>}
      <a href={downloadUrl} className="btn btn-ghost btn-sm" aria-label="ดาวน์โหลด"><Download /></a>
    </div>
  )
}

function BookPanel({ d, book }: { d: PublicDetail; book: PublicDetail['chapters'][number] | undefined }) {
  const location = useLocation()
  if (!book) {
    return (
      <Panel title="เล่มสมบูรณ์">
        <Empty icon={BookOpen} title="ยังไม่มีเล่มสมบูรณ์ในระบบ">โครงงานนี้ไม่ได้อัปโหลดเล่มสมบูรณ์ไว้ ลองดูเอกสารรายบทหรือซอร์สโค้ดแทน</Empty>
      </Panel>
    )
  }
  const readUrl = `/showcase/${d.project.id}/read?c=${book.id}`
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <BookOpen className="size-8" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">เล่มสมบูรณ์</h2>
          <p className="truncate text-sm text-muted">{book.fileName} · {fileSize(book.size)} · อัปโหลด {thaiDate(book.createdAt)}</p>
        </div>
        {d.loggedIn ? (
          book.isPdf ? (
            <Link to={readUrl} className="btn btn-primary"><Eye /> อ่านเล่มสมบูรณ์</Link>
          ) : (
            <a href={`/api/submissions/${book.id}/download`} className="btn btn-primary"><Download /> ดาวน์โหลด</a>
          )
        ) : (
          <Link to="/login" state={{ from: book.isPdf ? readUrl : location.pathname }} className="btn btn-primary">
            <Lock /> เข้าสู่ระบบเพื่ออ่าน
          </Link>
        )}
      </div>
      {!d.loggedIn && (
        <p className="border-t border-line bg-surface-2/60 px-6 py-3 text-xs text-muted">
          นิสิตที่ยังไม่มีบัญชี <Link to="/register">สมัครสมาชิก</Link> ได้ฟรีด้วยรหัสนิสิต
        </p>
      )}
    </section>
  )
}

function ChaptersPanel({ d }: { d: PublicDetail }) {
  return (
    <Panel title="เอกสารรายบท" sub="ฉบับล่าสุดของแต่ละบท" bodyClass="p-0">
      <ul>
        {d.chapters.filter((c) => c.chapter !== 'เล่มสมบูรณ์').map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
            <span className="kpi-icon size-9 bg-surface-2 text-muted"><FileText className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.chapter}</div>
              <div className="truncate text-xs text-muted">{c.fileName} · v{c.version} · {fileSize(c.size)}</div>
            </div>
            <FileAction d={d} kind="c" fileId={c.id} isPdf={c.isPdf} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function FilesPanel({ d }: { d: PublicDetail }) {
  return (
    <Panel title="ไฟล์ของโครงงาน" bodyClass="p-0">
      <ul>
        {d.files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{f.fileName}</div>
              <div className="text-xs text-muted">{fileSize(f.size)}</div>
            </div>
            <FileAction d={d} kind="f" fileId={f.id} isPdf={f.isPdf} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function TeamPanel({ d }: { d: PublicDetail }) {
  const p = d.project
  const Row = ({ name, role }: { name: string; role: string }) => (
    <li className="flex items-center gap-3">
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted">{role}</span>
      </span>
    </li>
  )
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Users className="size-4" /> ผู้จัดทำและอาจารย์</span>}>
      <ul className="flex flex-col gap-3">
        {p.students.map((s) => <Row key={s} name={s} role="ผู้จัดทำ" />)}
      </ul>
      {(p.advisor || p.committee.length > 0) && (
        <ul className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          {p.advisor && <Row name={p.advisor} role="อาจารย์ที่ปรึกษา" />}
          {p.committee.map((c) => <Row key={c} name={c} role="กรรมการ" />)}
        </ul>
      )}
    </Panel>
  )
}

function CodesPanel({ d }: { d: PublicDetail }) {
  const [sel, setSel] = useState(d.codes[0]?.id)
  const [copied, setCopied] = useState(false)
  const current = d.codes.find((c) => c.id === sel)
  if (d.codes.length === 0) {
    return (
      <Panel title="ซอร์สโค้ด">
        <Empty icon={CodeXml} title="โครงงานนี้ไม่ได้เพิ่มซอร์สโค้ดไว้" />
      </Panel>
    )
  }
  const copy = async () => {
    if (!current) return
    await navigator.clipboard.writeText(current.code)
    setCopied(true)
    toast.success('คัดลอกโค้ดแล้ว')
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Panel title="ซอร์สโค้ด" sub={`${d.codes.length} ฟังก์ชัน`} bodyClass="p-0">
      <div className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-3">
        {d.codes.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSel(c.id)}
            className={cx('shrink-0 rounded-full border px-3 py-1 font-mono text-xs', sel === c.id ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-surface-2')}
          >
            {c.functionName}
          </button>
        ))}
      </div>
      {current && (
        <>
          <div className="flex items-center justify-between gap-2 px-5 py-2.5 text-xs text-muted">
            <span>
              {languageLabel(current.language)} · {current.lines} บรรทัด
              {current.githubPath && <> · <GitBranch className="inline size-3.5" /> จาก GitHub</>}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <Check /> : <Copy />} คัดลอก</button>
          </div>
          <pre className="max-h-[60vh] overflow-auto bg-surface-2 p-5 font-mono text-[13px] leading-relaxed [tab-size:4]"><code>{current.code}</code></pre>
        </>
      )}
    </Panel>
  )
}

function ShareButton() {
  const share = async () => {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('คัดลอกลิงก์แล้ว ส่งให้เพื่อนหรือรุ่นน้องได้เลย')
  }
  return (
    <button type="button" className="btn btn-ghost w-full" onClick={share}>
      <Share2 /> คัดลอกลิงก์โครงงานนี้
    </button>
  )
}
