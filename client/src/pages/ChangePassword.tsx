import { KeyRound, ShieldCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { PageHeader, Panel, Spinner, useAction } from '../components/ui'
import { api } from '../lib/api'
import { usePublicConfig } from '../lib/queries'

// หน้า "เปลี่ยนรหัสผ่าน" ของตัวเอง (การรีเซ็ตรหัสผ่านผู้อื่นอยู่ในหน้าผู้ใช้งานของแอดมิน)
export default function ChangePassword() {
  const demo = usePublicConfig().data?.demo
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState('')
  const change = useAction((body: { current: string; password: string }) => api.post('/auth/password', body), {
    success: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว',
    onSuccess: () => formRef.current?.reset(),
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const current = String(fd.get('current') ?? '')
    const password = String(fd.get('password') ?? '')
    if (password !== fd.get('confirm')) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน')
      return
    }
    if (password === current) {
      setError('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน')
      return
    }
    setError('')
    change.mutate({ current, password })
  }

  return (
    <>
      <PageHeader title="เปลี่ยนรหัสผ่าน" subtitle="ตั้งรหัสผ่านใหม่สำหรับเข้าสู่ระบบ" />
      <div className="max-w-xl">
        {demo && (
          <p className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
            ระบบทดลอง (เดโม) ล็อกรหัสผ่านของบัญชีทดสอบไว้ที่ <b className="font-mono">{demo.password}</b> เพื่อให้ทุกคนเข้าใช้ได้ตลอด จึงเปลี่ยนรหัสผ่านไม่ได้
          </p>
        )}
        <Panel title="รหัสผ่านของคุณ" sub="รหัสผ่านใหม่ต้องยาว 6–50 ตัวอักษร">
          <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" onInput={() => error && setError('')}>
            <label className="field">
              <span>รหัสผ่านปัจจุบัน</span>
              <input name="current" type="password" className="input" required autoComplete="current-password" />
            </label>
            <label className="field">
              <span>รหัสผ่านใหม่</span>
              <input name="password" type="password" className="input" required minLength={6} maxLength={50} autoComplete="new-password" />
            </label>
            <label className="field">
              <span>ยืนยันรหัสผ่านใหม่</span>
              <input name="confirm" type="password" className="input" required minLength={6} maxLength={50} autoComplete="new-password" />
            </label>
            {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="size-4" /> ไม่ควรใช้รหัสผ่านเดียวกับบริการอื่น
              </span>
              <button className="btn btn-primary" disabled={change.isPending}>
                {change.isPending ? <Spinner className="text-accent-ink" /> : <KeyRound />} เปลี่ยนรหัสผ่าน
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  )
}
