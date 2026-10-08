import { GraduationCap, LayoutDashboard, LogIn } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../lib/auth'
import { ThemeToggle } from './Layout'

// กรอบหน้าคลังโครงงานสาธารณะ (เปิดได้โดยไม่ต้องล็อกอิน)
export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/showcase" className="flex items-center gap-3 no-underline">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-ink">
              <GraduationCap className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-semibold text-ink">คลังโครงงาน CS</span>
              <span className="block text-xs text-muted">มหาวิทยาลัยพะเยา</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {user ? (
              <Link to="/" className="btn btn-ghost btn-sm"><LayoutDashboard /> ไปที่ระบบ</Link>
            ) : (
              <Link to="/login" state={{ from: location.pathname + location.search }} className="btn btn-primary btn-sm"><LogIn /> เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="no-print border-t border-line py-6 text-center text-xs text-muted">
        สาขาวิชาวิทยาการคอมพิวเตอร์ คณะเทคโนโลยีสารสนเทศและการสื่อสาร <span className="text-gold">มหาวิทยาลัยพะเยา</span>
      </footer>
    </div>
  )
}
