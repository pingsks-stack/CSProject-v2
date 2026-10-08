import path from 'node:path'
import { config } from '../config.js'
import { Project, memberUserId, teachers, type ProjectDoc } from '../models/Project.js'
import { Code } from '../models/misc.js'
import { badRequest } from './http.js'
import { logActivity, notify } from './notify.js'

// เชื่อม GitHub repository กับโครงงาน: ดึงข้อมูลผ่าน GitHub REST API (อ่านได้เฉพาะ repository สาธารณะ
// เว้นแต่ตั้ง GITHUB_TOKEN ที่มีสิทธิ์อ่าน) ตั้ง GITHUB_TOKEN ไว้ช่วยเพิ่มโควตาจาก 60 เป็น 5,000 ครั้ง/ชม.

const API = 'https://api.github.com'
const NAME = /^[A-Za-z0-9._-]{1,100}$/
const MAX_FILE_BYTES = 200 * 1024
const MAX_README_BYTES = 300 * 1024

// รับได้ทั้ง https://github.com/owner/repo, github.com/owner/repo.git และ owner/repo
export function parseRepo(input: string) {
  const s = input.trim().replace(/^https?:\/\//, '').replace(/^(www\.)?github\.com\//, '').replace(/\/+$/, '').replace(/\.git$/, '')
  const [owner, repo, ...rest] = s.split('/')
  if (!owner || !repo || rest.length > 0 && !['tree', 'blob'].includes(rest[0]) || !NAME.test(owner) || !NAME.test(repo)) {
    throw badRequest('ลิงก์ GitHub ไม่ถูกต้อง ตัวอย่าง: https://github.com/username/project')
  }
  return { owner, repo }
}

class GithubError extends Error {}

async function gh(url: string, accept = 'application/vnd.github+json') {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'csproject-up',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`
  let res: Response
  try {
    res = await fetch(url.startsWith('http') ? url : API + url, { headers, signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new GithubError('เชื่อมต่อ GitHub ไม่สำเร็จ ลองใหม่ภายหลัง')
  }
  if (res.status === 404) throw new GithubError('ไม่พบ repository (ระบบอ่านได้เฉพาะ repository แบบ public)')
  if (res.status === 403 || res.status === 429) throw new GithubError('GitHub จำกัดจำนวนครั้งที่เรียกใช้ ลองใหม่ภายหลัง')
  if (!res.ok) throw new GithubError(`GitHub ตอบกลับผิดพลาด (${res.status})`)
  return res
}

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/')

interface RepoJson {
  description: string | null
  html_url: string
  default_branch: string
  stargazers_count: number
  forks_count: number
  pushed_at: string | null
}
interface CommitJson {
  sha: string
  html_url: string
  commit: { message: string; author: { name: string; date: string } | null }
  author: { login: string; avatar_url: string } | null
}

export async function fetchSnapshot(owner: string, repo: string) {
  const base = `/repos/${owner}/${repo}`
  const info = (await (await gh(base)).json()) as RepoJson
  const [langs, commits, readme] = await Promise.all([
    gh(`${base}/languages`).then((r) => r.json() as Promise<Record<string, number>>),
    gh(`${base}/commits?per_page=20`).then((r) => r.json() as Promise<CommitJson[]>).catch(() => [] as CommitJson[]),
    // README แบบ HTML ที่ GitHub แปลงและกรองแท็กอันตรายให้แล้ว (หน้าเว็บแสดงใน iframe แบบ sandbox อีกชั้น)
    gh(`${base}/readme`, 'application/vnd.github.html+json').then((r) => r.text()).catch(() => ''),
  ])
  return {
    description: info.description ?? '',
    htmlUrl: info.html_url,
    defaultBranch: info.default_branch,
    stars: info.stargazers_count,
    forks: info.forks_count,
    pushedAt: info.pushed_at ? new Date(info.pushed_at) : null,
    languages: Object.entries(langs).map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split('\n')[0].slice(0, 200),
      author: c.author?.login ?? c.commit.author?.name ?? '',
      avatarUrl: c.author?.avatar_url ?? '',
      date: c.commit.author?.date ? new Date(c.commit.author.date) : null,
      url: c.html_url,
    })),
    readmeHtml: readme.length > MAX_README_BYTES ? '' : readme,
  }
}

// รายชื่อไฟล์ใน repository (สำหรับเลือกนำเข้าเป็นซอร์สโค้ด) เฉพาะไฟล์ข้อความขนาดไม่เกิน 200 KB
const TEXT_EXT = new Set([
  '.py', '.java', '.cs', '.vb', '.c', '.h', '.cpp', '.hpp', '.cc', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.php', '.sql', '.html',
  '.htm', '.css', '.scss', '.dart', '.kt', '.kts', '.swift', '.go', '.rs', '.rb', '.vue', '.svelte', '.ino', '.m', '.r', '.json',
  '.xml', '.yml', '.yaml', '.md', '.sh', '.bat', '.ps1', '.gradle', '.ipynb', '.txt',
])

export async function fetchTree(owner: string, repo: string, branch: string) {
  const res = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  const json = (await res.json()) as { tree: { path: string; type: string; size?: number }[]; truncated: boolean }
  return {
    truncated: json.truncated,
    files: json.tree
      .filter((t) => t.type === 'blob' && (t.size ?? 0) <= MAX_FILE_BYTES && TEXT_EXT.has(path.extname(t.path).toLowerCase()))
      .filter((t) => !/(^|\/)(node_modules|vendor|dist|build|\.git|bin|obj)\//.test(t.path))
      .map((t) => ({ path: t.path, size: t.size ?? 0 })),
  }
}

export async function fetchFile(owner: string, repo: string, filePath: string, ref: string) {
  const res = await gh(`/repos/${owner}/${repo}/contents/${enc(filePath)}?ref=${encodeURIComponent(ref)}`, 'application/vnd.github.raw+json')
  const text = await res.text()
  if (text.length > MAX_FILE_BYTES) throw new GithubError(`ไฟล์ ${filePath} ใหญ่เกิน 200 KB`)
  return text
}

// เดาภาษาจากนามสกุลไฟล์ (ค่าเดียวกับรายการภาษาของคลังซอร์สโค้ด)
const LANG_BY_EXT: Record<string, string> = {
  '.py': 'python', '.ipynb': 'python', '.java': 'java', '.cs': 'C#', '.vb': 'vbnet', '.c': 'cpp', '.h': 'cpp', '.cpp': 'cpp',
  '.hpp': 'cpp', '.cc': 'cpp', '.ino': 'cpp', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.vue': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.php': 'PHP', '.sql': 'sql', '.html': 'html', '.htm': 'html', '.css': 'css',
  '.scss': 'css', '.dart': 'dart', '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'swift',
}
export const languageOf = (p: string) => LANG_BY_EXT[path.extname(p).toLowerCase()] ?? 'other'

// ดึงข้อมูลล่าสุดจาก GitHub มาเก็บที่โครงงาน + อัปเดตไฟล์โค้ดที่นำเข้าไว้
// force=false จะข้ามถ้าเพิ่งซิงค์ไปไม่ถึง 1 นาที (กันกดรัว/โควตา GitHub หมด)
export async function syncProject(p: ProjectDoc, actor: unknown, force = false) {
  const g = p.github
  if (!g) throw badRequest('โครงงานนี้ยังไม่ได้เชื่อม GitHub')
  if (!force && g.syncedAt && Date.now() - g.syncedAt.getTime() < 60_000) return { skipped: true, newCommits: 0 }

  let snap: Awaited<ReturnType<typeof fetchSnapshot>>
  try {
    snap = await fetchSnapshot(g.owner, g.repo)
  } catch (e) {
    g.error = e instanceof GithubError ? e.message : 'ซิงค์ GitHub ไม่สำเร็จ'
    g.syncedAt = new Date()
    await p.save()
    if (e instanceof GithubError) throw badRequest(e.message)
    throw e
  }

  // commit ใหม่ = sha ที่ไม่มีในรายการเดิม (ซิงค์ครั้งแรกไม่นับ)
  const known = new Set(g.commits.map((c) => c.sha))
  const fresh = g.syncedAt && g.commits.length ? snap.commits.filter((c) => !known.has(c.sha)) : []
  Object.assign(g, snap, { syncedAt: new Date(), error: '' })
  await p.save()

  // อัปเดตไฟล์โค้ดที่นำเข้าจาก GitHub
  const linkedCodes = await Code.find({ project: p._id, githubPath: { $ne: null } })
  for (const c of linkedCodes) {
    try {
      const text = await fetchFile(g.owner, g.repo, c.githubPath!, snap.defaultBranch)
      if (text !== c.code) {
        c.code = text
        await c.save()
        await logActivity(p._id, 'code.update', null, `${c.githubPath} (อัปเดตจาก GitHub)`)
      }
    } catch {
      // ไฟล์ถูกลบ/ย้ายใน repository: เก็บเนื้อหาเดิมไว้
    }
  }

  if (fresh.length) {
    const detail = `${fresh.length} commit ใหม่ · ${fresh[0].message}`
    await logActivity(p._id, 'github.sync', (actor as never) ?? null, detail)
    await notify(teachers(p).map(memberUserId), {
      icon: 'git-commit-horizontal',
      title: `นิสิตอัปเดตงานบน GitHub (${fresh.length} commit)`,
      detail: `${p.nameTh} · ${fresh[0].message}`,
      link: `/projects/${p.id}`,
    }, undefined, { email: false })
  }
  return { skipped: false, newCommits: fresh.length }
}

// GitHub แจ้งเมื่อมีการ push (webhook) → ซิงค์ทุกโครงงานที่ผูกกับ repository นั้น
export async function syncByRepo(fullName: string) {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) return 0
  const re = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  const projects = await Project.find({ 'github.owner': re(owner), 'github.repo': re(repo) })
  for (const p of projects) await syncProject(p, null, true).catch(() => {})
  return projects.length
}
