import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, ExternalLink } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { ThemeToggle } from '../../components/Layout'
import { ErrorBox, Loading } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { PublicDetail } from '../../lib/types'

// ตัวอ่าน PDF เต็มจอ (เล่มสมบูรณ์/เอกสารรายบท/ไฟล์แนบ) ต้องเข้าสู่ระบบก่อน
//   /showcase/:id/read?c=<submission id>  หรือ  ?f=<project file id>
export default function Reader() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const { user, loading } = useAuth()
  const c = params.get('c')
  const f = params.get('f')
  const q = useQuery({ queryKey: ['public', 'project', id], queryFn: () => api.get<PublicDetail>(`/public/projects/${id}`) })

  const item = c ? q.data?.chapters.find((x) => x.id === c) : q.data?.files.find((x) => x.id === f)
  const title = item ? ('chapter' in item ? `${item.chapter} · ${item.fileName}` : item.fileName) : ''
  useEffect(() => {
    if (q.data && item) document.title = `${title} · ${q.data.project.nameTh}`
    return () => { document.title = 'CS Project · มหาวิทยาลัยพะเยา' }
  }, [q.data, item, title])

  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />

  const base = c ? `/api/submissions/${c}` : `/api/projects/${id}/files/${f}`
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-5">
        <Link to={`/showcase/${id}`} className="btn btn-ghost btn-sm" aria-label="กลับ"><ArrowLeft /> <span className="hidden sm:inline">กลับ</span></Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium">{title || 'กำลังโหลด…'}</div>
          <div className="truncate text-xs text-muted">{q.data?.project.nameTh}</div>
        </div>
        <ThemeToggle />
        <a href={`${base}/view`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" aria-label="เปิดในแท็บใหม่"><ExternalLink /></a>
        <a href={`${base}/download`} className="btn btn-primary btn-sm"><Download /> <span className="hidden sm:inline">ดาวน์โหลด</span></a>
      </header>
      {q.error ? (
        <div className="p-6"><ErrorBox error={q.error} /></div>
      ) : q.data && !item ? (
        <div className="p-6"><ErrorBox error={new Error('ไม่พบไฟล์นี้ในโครงงาน')} /></div>
      ) : (
        <iframe title={title || 'เอกสาร'} src={`${base}/view`} className="w-full flex-1 bg-surface-2" />
      )}
    </div>
  )
}
