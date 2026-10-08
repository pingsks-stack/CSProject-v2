import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { AuthShell } from './Login'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    if (body.password !== body.confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    delete body.confirm
    setBusy(true)
    setError('')
    try {
      await register(body)
      toast.success('สมัครสมาชิกสำเร็จ')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สมัครสมาชิกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="สมัครสมาชิก" subtitle="สำหรับนิสิต (บัญชีอาจารย์สร้างโดยผู้ดูแลระบบ)">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="field sm:col-span-2">
          <span>ชื่อ-นามสกุล</span>
          <input name="name" className="input" required maxLength={100} placeholder="เช่น นายกิตติ ศรีสุข" />
        </label>
        <label className="field">
          <span>รหัสนิสิต</span>
          <input name="studentId" className="input" required pattern="\d{8}" inputMode="numeric" maxLength={8} title="ตัวเลข 8 หลัก" />
        </label>
        <label className="field">
          <span>เบอร์โทรศัพท์</span>
          <input name="mobile" className="input" required pattern="0\d{9}" inputMode="tel" maxLength={10} title="ตัวเลข 10 หลักขึ้นต้นด้วย 0" />
        </label>
        <label className="field sm:col-span-2">
          <span>อีเมล</span>
          <input name="email" type="email" className="input" required maxLength={100} />
        </label>
        <label className="field sm:col-span-2">
          <span>ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)</span>
          <input name="username" className="input" required maxLength={50} pattern="\S+" title="ห้ามมีช่องว่าง" autoComplete="username" />
        </label>
        <label className="field">
          <span>รหัสผ่าน</span>
          <input name="password" type="password" className="input" required minLength={6} maxLength={50} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>ยืนยันรหัสผ่าน</span>
          <input name="confirm" type="password" className="input" required minLength={6} maxLength={50} autoComplete="new-password" />
        </label>
        {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">{error}</p>}
        <button className="btn btn-primary mt-2 w-full sm:col-span-2" disabled={busy}>
          {busy ? <Spinner className="text-accent-ink" /> : <UserPlus />} สมัครสมาชิก
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        มีบัญชีแล้ว <Link to="/login">เข้าสู่ระบบ</Link>
      </p>
    </AuthShell>
  )
}
