import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell, ChartPie, ChevronsLeft, ClipboardCheck, CodeXml, FolderKanban, GraduationCap, Inbox, KeyRound, LayoutDashboard,
  Library, LogOut, Menu, MessagesSquare, Moon, Search, Settings, Sun, Tags, UserRound, Users, CalendarClock, type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { useAuth, useMe } from '../lib/auth'
import { ROLE_TH, timeAgo } from '../lib/format'
import type { Notification, Role } from '../lib/types'
import { Icon } from './Icon'
import { Avatar, cx } from './ui'

interface NavItem { to: string; label: string; icon: LucideIcon; badge?: 'chat' | 'requests' }
interface NavGroup { title: string; items: NavItem[] }

const ACCOUNT: NavGroup = {
  title: 'บัญชี',
  items: [
    { to: '/profile', label: 'โปรไฟล์', icon: UserRound },
    { to: '/password', label: 'เปลี่ยนรหัสผ่าน', icon: KeyRound },
  ],
}

const MENUS: Record<Role, NavGroup[]> = {
  student: [
    {
      title: 'ภาพรวม',
      items: [
        { to: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
        { to: '/stats', label: 'สถิติตามประเภท', icon: ChartPie },
        { to: '/library', label: 'คลังโครงงาน', icon: Library },
        { to: '/search', label: 'ค้นหาโครงงาน', icon: Search },
        { to: '/code', label: 'คลังซอร์สโค้ด', icon: CodeXml },
      ],
    },
    {
      title: 'โครงงานของฉัน',
      items: [
        { to: '/my-projects', label: 'โครงงานของฉัน', icon: FolderKanban },
        { to: '/requests', label: 'คำขอของโครงงาน', icon: Inbox },
        { to: '/teachers', label: 'รายชื่ออาจารย์', icon: GraduationCap },
        { to: '/chat', label: 'แชท', icon: MessagesSquare, badge: 'chat' },
      ],
    },
    ACCOUNT,
  ],
  teacher: [
    {
      title: 'ภาพรวม',
      items: [
        { to: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
        { to: '/library', label: 'คลังโครงงาน', icon: Library },
        { to: '/search', label: 'ค้นหาโครงงาน', icon: Search },
        { to: '/code', label: 'คลังซอร์สโค้ด', icon: CodeXml },
      ],
    },
    {
      title: 'งานอาจารย์',
      items: [
        { to: '/teacher/projects', label: 'โครงงานที่รับผิดชอบ', icon: ClipboardCheck },
        { to: '/requests', label: 'คำขอรอยืนยัน', icon: Inbox, badge: 'requests' },
        { to: '/chat', label: 'แชท', icon: MessagesSquare, badge: 'chat' },
      ],
    },
    ACCOUNT,
  ],
  admin: [
    {
      title: 'ภาพรวม',
      items: [
        { to: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
        { to: '/search', label: 'ค้นหาโครงงาน', icon: Search },
        { to: '/library', label: 'คลังโครงงาน', icon: Library },
      ],
    },
    {
      title: 'จัดการระบบ',
      items: [
        { to: '/admin/projects', label: 'โครงงานทั้งหมด', icon: FolderKanban },
        { to: '/requests', label: 'คำขอทั้งหมด', icon: Inbox, badge: 'requests' },
        { to: '/admin/users', label: 'ผู้ใช้งาน', icon: Users },
        { to: '/admin/deadlines', label: 'กำหนดส่งงาน', icon: CalendarClock },
        { to: '/admin/types', label: 'ประเภทโครงงาน', icon: Tags },
        { to: '/code', label: 'คลังซอร์สโค้ด', icon: CodeXml },
        { to: '/admin/settings', label: 'ตั้งค่าแบบฟอร์ม', icon: Settings },
      ],
    },
    ACCOUNT,
  ],
}

function readPref(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ไม่มี localStorage ก็ใช้งานต่อได้ */ }
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ unread: number; chatUnread: number; items: Notification[] }>('/notifications'),
    refetchInterval: 30_000,
  })
}

function usePendingRequests(role: Role) {
  return useQuery({
    queryKey: ['requests', 'pending'],
    queryFn: () => api.get<{ requests: unknown[] }>('/requests?status=pending'),
    enabled: role !== 'student',
    refetchInterval: 60_000,
  })
}

export function Layout() {
  const user = useMe()
  const [mini, setMini] = useState(() => readPref('sidebar') === 'mini')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const notes = useNotifications()
  const pending = usePendingRequests(user.role)

  useEffect(() => setMobileOpen(false), [location.pathname])

  const badgeCount = (b?: NavItem['badge']) =>
    b === 'chat' ? (notes.data?.chatUnread ?? 0) : b === 'requests' ? (pending.data?.requests.length ?? 0) : 0

  return (
    <div className="flex min-h-dvh">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={cx(
          'no-print fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-[width,transform] lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          mini ? 'lg:w-[72px]' : 'lg:w-64',
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink">
            <GraduationCap className="size-5" />
          </span>
          <div className={cx('min-w-0 leading-tight', mini && 'lg:hidden')}>
            <div className="font-semibold text-ink">CS Project</div>
            <div className="truncate text-xs text-muted">มหาวิทยาลัยพะเยา</div>
          </div>
          <button
            type="button"
            onClick={() => { setMini(!mini); writePref('sidebar', mini ? 'full' : 'mini') }}
            className={cx('ml-auto hidden rounded-lg p-1 text-muted hover:bg-surface-2 lg:block', mini && 'lg:ml-0 lg:rotate-180')}
            title="ย่อ/ขยายเมนู"
          >
            <ChevronsLeft className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MENUS[user.role].map((g) => (
            <div key={g.title} className="mb-5">
              <div className={cx('mb-1.5 px-3 text-xs font-medium text-muted', mini && 'lg:hidden')}>{g.title}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => {
                  const n = badgeCount(it.badge)
                  return (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      end={it.to === '/'}
                      title={it.label}
                      className={({ isActive }) =>
                        cx(
                          'relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm no-underline transition',
                          isActive ? 'bg-accent/12 font-medium text-accent' : 'text-ink hover:bg-surface-2',
                          mini && 'lg:justify-center lg:px-0',
                        )
                      }
                    >
                      <it.icon className="size-[18px] shrink-0" />
                      <span className={cx('truncate', mini && 'lg:hidden')}>{it.label}</span>
                      {n > 0 && (
                        <span className={cx('ml-auto rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white', mini && 'lg:absolute lg:right-1 lg:top-0.5 lg:ml-0')}>
                          {n > 99 ? '99+' : n}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <UserFooter mini={mini} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function UserFooter({ mini }: { mini: boolean }) {
  const user = useMe()
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className={cx('flex items-center gap-3 border-t border-line p-3', mini && 'lg:flex-col lg:gap-2')}>
      <Avatar name={user.name} />
      <div className={cx('min-w-0 flex-1 leading-tight', mini && 'lg:hidden')}>
        <div className="truncate text-sm font-medium text-ink">{user.name}</div>
        <div className="text-xs text-muted">{ROLE_TH[user.role]}</div>
      </div>
      <button
        type="button"
        title="ออกจากระบบ"
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-bad"
        onClick={async () => { await logout(); navigate('/login') }}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')?.toString().trim() ?? ''
    navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  }

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6">
      <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={onMenu} aria-label="เมนู">
        <Menu className="size-5" />
      </button>
      <form onSubmit={onSearch} className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input ref={inputRef} name="q" className="input pl-9" placeholder="ค้นหาโครงงาน ชื่อนิสิต อาจารย์…" />
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-muted sm:block">Ctrl K</kbd>
      </form>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  )
}

// ปุ่มสลับโหมดสว่าง/มืด (จำค่าไว้ใน localStorage)
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    writePref('theme', next ? 'dark' : 'light')
    setDark(next)
  }
  return (
    <button type="button" onClick={toggle} className="rounded-lg p-2 text-muted hover:bg-surface-2" title="สลับโหมดสว่าง/มืด">
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isError } = useNotifications()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const markRead = async (id?: string) => {
    await api.post('/notifications/read', id ? { id } : {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="การแจ้งเตือน">
        <Bell className="size-5" />
        {!!data?.unread && (
          <span className="absolute top-1 right-1 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] leading-4 font-semibold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">การแจ้งเตือน</span>
            {!!data?.unread && (
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => markRead()}>อ่านทั้งหมด</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isError && <div className="px-4 py-6 text-center text-sm text-bad">โหลดการแจ้งเตือนไม่สำเร็จ</div>}
            {data?.items.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted">ไม่มีการแจ้งเตือน</div>}
            {data?.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (!n.read) markRead(n.id)
                  if (n.link) navigate(n.link)
                }}
                className={cx('flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2', !n.read && 'bg-accent/5')}
              >
                <span className={cx('kpi-icon size-8', n.read ? 'bg-surface-2 text-muted' : 'bg-accent/15 text-accent')}>
                  <Icon name={n.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{n.title}</span>
                  {n.detail && <span className="block truncate text-xs text-muted">{n.detail}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
