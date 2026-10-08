import { useQuery } from '@tanstack/react-query'
import { MailCheck, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import { AuthShell } from './Login'

// ลืมรหัสผ่าน: ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชี
export default function ForgotPassword() {
  const config = useQuery({ queryKey: ['public', 'config'], queryFn: () => api.get<{ mailEnabled: boolean }>('/public/config') })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/forgot', { login: String(new FormData(e.currentTarget).get('login')).trim() })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="ลืมรหัสผ่าน" subtitle="ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชี">
      {config.data && !config.data.mailEnabled ? (
        <p className="text-sm text-muted">ระบบยังไม่ได้ตั้งค่าการส่งอีเมล กรุณาติดต่อผู้ดูแลระบบหรืออาจารย์ประจำวิชาเพื่อขอรหัสผ่านชั่วคราว</p>
      ) : sent ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="kpi-icon size-12 bg-ok/15 text-ok"><MailCheck /></span>
          <p className="text-sm">ถ้ามีบัญชีนี้ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชีแล้ว</p>
          <p className="text-xs text-muted">ลิงก์ใช้ได้ภายใน 1 ชั่วโมง ถ้าไม่พบให้ตรวจในกล่องจดหมายขยะ (Spam)</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="field">
            <span>ชื่อผู้ใช้หรืออีเมล</span>
            <input name="login" className="input" required autoFocus autoComplete="username" />
          </label>
          {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? <Spinner className="text-accent-ink" /> : <Send />} ส่งลิงก์ตั้งรหัสผ่าน
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
      </p>
    </AuthShell>
  )
}
