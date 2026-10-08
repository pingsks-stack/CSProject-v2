import { useQuery } from '@tanstack/react-query'
import { BookOpenText, ExternalLink, GitBranch, GitCommitHorizontal, GitFork, Import, RefreshCw, Star, Unlink } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { thaiDate, timeAgo } from '../lib/format'
import type { GithubInfo } from '../lib/types'
import { Empty, Modal, Panel, Spinner, cx, useAction, useConfirm } from './ui'

// สีภาษาโปรแกรม: ใช้ชุดสีกราฟตามลำดับคงที่ (ผ่านการตรวจผู้ตาบอดสี) ภาษาที่เกิน 5 รวมเป็น "อื่น ๆ"
const LANG_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)']

export function LanguageBar({ languages }: { languages: { name: string; bytes: number }[] }) {
  const total = languages.reduce((s, l) => s + l.bytes, 0)
  if (!total) return null
  const top = languages.slice(0, 5)
  const rest = languages.slice(5).reduce((s, l) => s + l.bytes, 0)
  const parts = [...top.map((l, i) => ({ name: l.name, bytes: l.bytes, color: LANG_COLORS[i] })), ...(rest ? [{ name: 'อื่น ๆ', bytes: rest, color: 'var(--viz-axis)' }] : [])]
  const pct = (b: number) => Math.round((b / total) * 1000) / 10
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.name} ${pct(p.bytes)}%`).join(', ')}>
        {parts.map((p) => (
          <span key={p.name} title={`${p.name} ${pct(p.bytes)}%`} style={{ width: `${(p.bytes / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((p) => (
          <li key={p.name} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="text-ink">{p.name}</span> {pct(p.bytes)}%
          </li>
        ))}
      </ul>
    </div>
  )
}

// README ที่ GitHub แปลงเป็น HTML แล้ว: แสดงใน iframe แบบ sandbox (ไม่รันสคริปต์ ไม่เข้าถึงหน้าเว็บของระบบ)
function ReadmeFrame({ html, title }: { html: string; title: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
body{font-family:"Noto Sans Thai",system-ui,sans-serif;font-size:14px;line-height:1.7;color:#1e1430;margin:0;padding:20px;background:#fff;word-wrap:break-word}
img{max-width:100%;height:auto}a{color:#5b2c8c}h1,h2{border-bottom:1px solid #e4deee;padding-bottom:.3em}
pre{background:#f2eef8;padding:12px;border-radius:8px;overflow:auto;font-size:13px}code{background:#f2eef8;padding:.1em .3em;border-radius:4px;font-size:90%}
pre code{background:none;padding:0}a.anchor,.octicon-link{display:none}table{border-collapse:collapse}td,th{border:1px solid #e4deee;padding:6px 10px}blockquote{color:#6e6482;border-left:4px solid #e4deee;margin:0;padding-left:1em}
</style></head><body>${html}</body></html>`
  return (
    <iframe
      title={title}
      srcDoc={doc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="h-[60vh] w-full rounded-xl border border-line bg-white"
    />
  )
}

// ข้อมูล repository แบบอ่านอย่างเดียว (ใช้ทั้งหน้าโครงงานและคลังสาธารณะ)
export function GithubSummary({ g, compact }: { g: GithubInfo; compact?: boolean }) {
  const [readmeOpen, setReadmeOpen] = useState(false)
  const commits = compact ? g.commits.slice(0, 5) : g.commits.slice(0, 10)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <a href={g.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold">
          <GitBranch className="size-4" /> {g.owner}/{g.repo} <ExternalLink className="size-3.5" />
        </a>
        {g.description && <p className="mt-1 text-sm text-muted">{g.description}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Star className="size-3.5" /> {g.stars}</span>
          <span className="inline-flex items-center gap-1"><GitFork className="size-3.5" /> {g.forks}</span>
          {g.pushedAt && <span>push ล่าสุด {timeAgo(g.pushedAt)}</span>}
          {g.syncedAt && <span>อัปเดตจาก GitHub {timeAgo(g.syncedAt)}</span>}
        </div>
      </div>
      <LanguageBar languages={g.languages} />
      {commits.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted">commit ล่าสุด</div>
          <ul className="flex flex-col gap-2">
            {commits.map((c) => (
              <li key={c.sha} className="flex items-start gap-2.5 text-sm">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="mt-0.5 size-6 shrink-0 rounded-full" loading="lazy" />
                ) : (
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><GitCommitHorizontal className="size-3.5" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-ink hover:text-accent">{c.message}</a>
                  <span className="text-xs text-muted">{c.author} · {thaiDate(c.date, true)} · <span className="font-mono">{c.sha.slice(0, 7)}</span></span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {g.readmeHtml !== undefined && (
        <div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!g.readmeHtml} onClick={() => setReadmeOpen(true)}>
            <BookOpenText /> {g.readmeHtml ? 'อ่าน README' : 'ไม่มี README'}
          </button>
          <Modal open={readmeOpen} onClose={() => setReadmeOpen(false)} title={`README · ${g.repo}`} wide>
            {readmeOpen && g.readmeHtml && <ReadmeFrame html={g.readmeHtml} title={`README ของ ${g.repo}`} />}
          </Modal>
        </div>
      )}
    </div>
  )
}

const githubKeys = (id: string) => [['project', id], ['github', id], ['codes', id], ['activity', id], ['projects']]

// แผง GitHub ในหน้าโครงงาน: นิสิตเชื่อม repository, ซิงค์, นำเข้าไฟล์โค้ด
export function GithubPanel({ projectId, canEdit, canSync }: { projectId: string; canEdit: boolean; canSync: boolean }) {
  const confirm = useConfirm()
  const [importOpen, setImportOpen] = useState(false)
  const q = useQuery({
    queryKey: ['github', projectId],
    queryFn: () => api.get<{ github: GithubInfo | null }>(`/projects/${projectId}/github`),
  })
  const g = q.data?.github ?? null

  const link = useAction((url: string) => api.put(`/projects/${projectId}/github`, { url }), {
    success: 'เชื่อม GitHub แล้ว',
    invalidate: githubKeys(projectId),
  })
  const sync = useAction(() => api.post<{ skipped: boolean; newCommits: number }>(`/projects/${projectId}/github/sync`), {
    success: (r) => (r.skipped ? 'เพิ่งอัปเดตไปเมื่อครู่' : r.newCommits ? `อัปเดตแล้ว พบ ${r.newCommits} commit ใหม่` : 'อัปเดตแล้ว ไม่มี commit ใหม่'),
    invalidate: githubKeys(projectId),
  })
  const unlink = useAction(() => api.del(`/projects/${projectId}/github`), {
    success: 'ยกเลิกการเชื่อม GitHub แล้ว',
    invalidate: githubKeys(projectId),
  })

  // ข้อมูลเก่ากว่า 30 นาที → อัปเดตเบื้องหลังเมื่อเปิดหน้า (ถ้าตั้ง webhook ไว้จะอัปเดตทันทีอยู่แล้ว)
  const autoSynced = useRef(false)
  useEffect(() => {
    if (!g || !canSync || autoSynced.current) return
    if (!g.syncedAt || Date.now() - new Date(g.syncedAt).getTime() > 30 * 60_000) {
      autoSynced.current = true
      api.post(`/projects/${projectId}/github/sync`).then(() => q.refetch()).catch(() => {})
    }
  }, [g, canSync, projectId, q])

  if (q.isPending) return null
  if (!g && !canEdit) return null

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2"><GitBranch className="size-4" /> GitHub</span>}
      sub={g ? 'งานบน GitHub อัปเดตเข้าระบบอัตโนมัติ' : 'เชื่อม repository เพื่ออัปเดตงานและซอร์สโค้ดจาก GitHub'}
      actions={g && (
        <>
          {canSync && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className={cx(sync.isPending && 'animate-spin')} /> อัปเดตตอนนี้
            </button>
          )}
          {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}><Import /> นำเข้าไฟล์โค้ด</button>}
          {canEdit && (
            <button
              type="button"
              className="btn btn-bad btn-sm"
              aria-label="ยกเลิกการเชื่อม GitHub"
              onClick={async () => {
                const ok = await confirm({
                  title: 'ยกเลิกการเชื่อม GitHub',
                  text: 'ไฟล์โค้ดที่นำเข้าไว้ยังอยู่ แต่จะไม่อัปเดตตาม GitHub อีก',
                  danger: true,
                  confirmText: 'ยกเลิกการเชื่อม',
                })
                if (ok) unlink.mutate()
              }}
            >
              <Unlink />
            </button>
          )}
        </>
      )}
    >
      {g ? (
        <>
          {g.error && <p className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">อัปเดตล่าสุดไม่สำเร็จ: {g.error}</p>}
          <GithubSummary g={g} compact />
          <ImportModal projectId={projectId} open={importOpen} onClose={() => setImportOpen(false)} />
        </>
      ) : (
        <LinkForm busy={link.isPending} onSubmit={(url) => link.mutate(url)} />
      )}
    </Panel>
  )
}

function LinkForm({ busy, onSubmit }: { busy: boolean; onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim()) onSubmit(url.trim())
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/username/project" aria-label="ลิงก์ GitHub repository" />
        <button className="btn btn-primary shrink-0" disabled={busy || !url.trim()}>{busy ? <Spinner className="text-accent-ink" /> : <GitBranch />} เชื่อม GitHub</button>
      </div>
      <ul className="list-disc pl-5 text-xs text-muted">
        <li>ใช้ได้กับ repository แบบ public — commit ล่าสุด README และภาษาที่ใช้จะแสดงในหน้าโครงงานและคลังโครงงาน</li>
        <li>อาจารย์ในโครงงานจะได้รับแจ้งเตือนเมื่อมี commit ใหม่</li>
        <li>เลือกไฟล์จาก repository มาไว้ในคลังซอร์สโค้ดได้ ไฟล์จะอัปเดตตาม GitHub ทุกครั้ง</li>
      </ul>
    </form>
  )
}

function ImportModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const tree = useQuery({
    queryKey: ['github-tree', projectId],
    queryFn: () => api.get<{ truncated: boolean; files: { path: string; size: number; imported: boolean }[] }>(`/projects/${projectId}/github/tree`),
    enabled: open,
  })
  const imp = useAction(() => api.post<{ count: number }>(`/projects/${projectId}/github/import`, { paths: [...selected] }), {
    success: (r) => `นำเข้าแล้ว ${r.count} ไฟล์`,
    invalidate: [...githubKeys(projectId), ['github-tree', projectId]],
    onSuccess: () => { setSelected(new Set()); onClose() },
  })
  const files = useMemo(
    () => (tree.data?.files ?? []).filter((f) => f.path.toLowerCase().includes(filter.trim().toLowerCase())),
    [tree.data, filter],
  )
  const toggle = (p: string) => {
    const next = new Set(selected)
    if (next.has(p)) next.delete(p)
    else if (next.size < 20) next.add(p)
    setSelected(next)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="นำเข้าไฟล์โค้ดจาก GitHub"
      wide
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted">เลือกแล้ว {selected.size}/20 ไฟล์</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" disabled={!selected.size || imp.isPending} onClick={() => imp.mutate()}>
            {imp.isPending ? <Spinner className="text-accent-ink" /> : <Import />} นำเข้า
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">ไฟล์ที่นำเข้าจะแสดงในคลังซอร์สโค้ดของโครงงาน และอัปเดตตาม GitHub อัตโนมัติ (แก้ไขใน repository แทน)</p>
      <input className="input mb-3" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="กรองชื่อไฟล์ เช่น src/ หรือ .py" />
      {tree.isPending && <div className="flex justify-center p-6"><Spinner /></div>}
      {tree.error && <p className="text-sm text-bad">{tree.error.message}</p>}
      {tree.data && files.length === 0 && <Empty title="ไม่พบไฟล์โค้ดใน repository" />}
      <ul className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
        {files.map((f) => (
          <li key={f.path} className="border-b border-line last:border-0">
            <label className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2', f.imported && 'cursor-default opacity-60')}>
              <input type="checkbox" disabled={f.imported} checked={f.imported || selected.has(f.path)} onChange={() => toggle(f.path)} />
              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
              <span className="shrink-0 text-xs text-muted">{f.imported ? 'นำเข้าแล้ว' : `${Math.max(1, Math.round(f.size / 1024))} KB`}</span>
            </label>
          </li>
        ))}
      </ul>
      {tree.data?.truncated && <p className="mt-2 text-xs text-muted">repository ใหญ่มาก แสดงไฟล์ได้ไม่ครบ</p>}
    </Modal>
  )
}
