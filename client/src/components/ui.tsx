import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { initials, type Tone } from '../lib/format'
import type { ProjectStatus } from '../lib/types'
import { projectTone } from '../lib/format'

export const TONE: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-info/15 text-info',
  accent: 'bg-accent/15 text-accent',
  gold: 'bg-gold/15 text-gold',
  muted: 'bg-surface-2 text-muted',
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function Badge({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('badge', TONE[tone], className)}>{children}</span>
}

export function StatusBadge({ status, passCount, label }: { status: ProjectStatus; passCount: number; label: string }) {
  return <Badge tone={projectTone(status, passCount)}>{label}</Badge>
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-accent">
            <ArrowLeft className="size-4" /> กลับ
          </Link>
        )}
        <h1 className="text-2xl leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, sub, actions, children, className, bodyClass }: {
  title?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section className={cx('panel overflow-hidden', className)}>
      {(title || actions) && (
        <div className="panel-head">
          <div className="min-w-0">
            {title && <h2 className="panel-title">{title}</h2>}
            {sub && <p className="panel-sub">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClass ?? 'p-5'}>{children}</div>
    </section>
  )
}

export function Kpi({ icon: I, tone = 'accent', label, value, note }: { icon: LucideIcon; tone?: Tone; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="panel flex gap-4 p-5">
      <span className={cx('kpi-icon', TONE[tone])}><I /></span>
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="text-2xl font-semibold leading-tight text-ink">{value}</div>
        {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon: I, title, children }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {I && <span className="kpi-icon bg-surface-2 text-muted"><I /></span>}
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('size-5 animate-spin text-muted', className)} />
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Spinner /> กำลังโหลด…
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="panel flex items-center gap-3 p-5 text-bad">
      <TriangleAlert className="size-5 shrink-0" />
      <span>{error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}</span>
    </div>
  )
}

// แสดงสถานะ loading/error ของ useQuery แล้วค่อยแสดงเนื้อหา
export function Async<T>({ q, children }: { q: { data: T | undefined; isPending: boolean; error: unknown }; children: (data: T) => ReactNode }) {
  if (q.error) return <ErrorBox error={q.error} />
  if (q.isPending || q.data === undefined) return <Loading />
  return <>{children(q.data)}</>
}

export function Avatar({ name, size = 'md', className }: { name?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-16 text-xl' }[size]
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent', s, className)}>
      {initials(name)}
    </span>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="ปิด">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

// ===================== กล่องยืนยัน (แทน confirm/Swal ของระบบเดิม) =====================
interface ConfirmOptions {
  title: string
  text?: ReactNode
  confirmText?: string
  danger?: boolean
  // ถ้ากำหนด จะมีช่องให้กรอกข้อความ และคืนค่าข้อความนั้น
  input?: { label: string; defaultValue?: string; placeholder?: string }
}
type ConfirmFn = (o: ConfirmOptions) => Promise<string | false>
const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: string | false) => void }) | null>(null)
  const [value, setValue] = useState('')
  const confirm = useCallback<ConfirmFn>((o) => {
    setValue(o.input?.defaultValue ?? '')
    return new Promise((resolve) => setState({ ...o, resolve }))
  }, [])
  const close = (v: string | false) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => close(false)}>ยกเลิก</button>
            <button
              type="button"
              className={cx('btn', state?.danger ? 'bg-bad text-white hover:brightness-110' : 'btn-primary')}
              disabled={!!state?.input && !value.trim()}
              onClick={() => close(state?.input ? value : 'ok')}
            >
              {state?.confirmText ?? 'ยืนยัน'}
            </button>
          </>
        }
      >
        {state?.text && <div className="text-sm text-muted">{state.text}</div>}
        {state?.input && (
          <label className="field mt-3">
            <span>{state.input.label}</span>
            <input className="input" autoFocus value={value} placeholder={state.input.placeholder} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const c = useContext(ConfirmContext)
  if (!c) throw new Error('useConfirm ต้องอยู่ใน ConfirmProvider')
  return c
}

// ===================== คำสั่งที่เปลี่ยนข้อมูล: แสดงผลสำเร็จ/ผิดพลาด แล้วโหลดข้อมูลที่เกี่ยวข้องใหม่ =====================
export function useAction<TArgs = void, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult) => void } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success)
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })))
      opts.onSuccess?.(r)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
            value === it.value ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink hover:bg-surface-2',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cx('rounded-full px-1.5 text-xs', value === it.value ? 'bg-white/20' : 'bg-surface-2 text-muted')}>{it.count}</span>}
        </button>
      ))}
    </div>
  )
}
