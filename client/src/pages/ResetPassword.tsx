import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { AuthShell } from './Login'

// ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล (/reset-password?token=...)
export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    if (password !== String(f.get('confirm'))) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/reset', { token, password })
      // รหัสเปลี่ยนแล้ว session เดิมทุกเครื่องใช้ไม่ได้ ให้เข้าสู่ระบบใหม่
      if (user) await logout().catch(() => {})
      toast.success('ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ตั้งรหัสผ่านไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่" subtitle="รหัสผ่านยาว 6–50 ตัวอักษร">
      {!token ? (
        <p className="text-sm text-muted">ลิงก์ไม่ถูกต้อง กรุณาเปิดลิงก์จากอีเมลอีกครั้ง หรือ <Link to="/forgot-password">ขอลิงก์ใหม่</Link></p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="field">
            <span>รหัสผ่านใหม่</span>
            <input name="password" type="password" className="input" required minLength={6} maxLength={50} autoFocus autoComplete="new-password" />
          </label>
          <label className="field">
            <span>ยืนยันรหัสผ่านใหม่</span>
            <input name="confirm" type="password" className="input" required minLength={6} maxLength={50} autoComplete="new-password" />
          </label>
          {error && (
            <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
              {error} {error.includes('หมดอายุ') && <Link to="/forgot-password">ขอลิงก์ใหม่</Link>}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? <Spinner className="text-accent-ink" /> : <KeyRound />} ตั้งรหัสผ่านใหม่
          </button>
        </form>
      )}
    </AuthShell>
  )
}
