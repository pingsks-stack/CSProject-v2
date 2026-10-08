import { GraduationCap, Library, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-lg shadow-accent/30">
            <GraduationCap className="size-7" />
          </span>
          <h1 className="text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="panel p-6 sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">
          ระบบติดตามโครงงาน สาขาวิชาวิทยาการคอมพิวเตอร์ <span className="text-gold">มหาวิทยาลัยพะเยา</span>
        </p>
      </div>
    </div>
  )
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      await login(String(f.get('username')), String(f.get('password')))
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="เข้าสู่ระบบ" subtitle="ระบบติดตามโครงงาน CS Project">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="field">
          <span>ชื่อผู้ใช้</span>
          <input name="username" className="input" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span className="flex items-center justify-between gap-2">
            รหัสผ่าน
            <Link to="/forgot-password" className="text-xs font-normal">ลืมรหัสผ่าน?</Link>
          </span>
          <input name="password" type="password" className="input" autoComplete="current-password" required />
        </label>
        {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary mt-2 w-full" disabled={busy}>
          {busy ? <Spinner className="text-accent-ink" /> : <LogIn />} เข้าสู่ระบบ
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        นิสิตที่ยังไม่มีบัญชี <Link to="/register">สมัครสมาชิก</Link>
      </p>
      <Link to="/showcase" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm no-underline hover:bg-surface-2">
        <Library className="size-4" /> ดูคลังโครงงานของรุ่นพี่ (ไม่ต้องเข้าสู่ระบบ)
      </Link>
    </AuthShell>
  )
}
