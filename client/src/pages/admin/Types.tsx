import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Async, Empty, PageHeader, useAction, useConfirm } from '../../components/ui'
import { api } from '../../lib/api'

interface TypeRow {
  id: string
  name: string
  order: number
  used: number
}

// ประเภทใช้ในตัวเลือกตอนสร้างโครงงาน (meta) และแสดงในรายการโครงงาน
const KEYS = [['admin', 'types'], ['meta'], ['dashboard'], ['stats']]
const RENAME_KEYS = [...KEYS, ['projects'], ['project']]

// หน้า "ประเภทโครงงาน" ของแอดมิน (แทน Admin_DocType.aspx)
export default function AdminTypes() {
  const q = useQuery({ queryKey: ['admin', 'types'], queryFn: () => api.get<{ types: TypeRow[] }>('/admin/types') })
  const [name, setName] = useState('')
  const add = useAction((n: string) => api.post('/admin/types', { name: n }).then(() => n), {
    success: (n) => `เพิ่มประเภท "${n}" แล้ว`,
    invalidate: KEYS,
    onSuccess: () => setName(''),
  })

  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) add.mutate(name.trim())
  }

  return (
    <>
      <PageHeader title="ประเภทโครงงาน" subtitle="ประเภทที่นิสิตเลือกตอนสร้างโครงงาน และใช้เป็นตัวกรองในหน้าค้นหาและสถิติ" />
      <section className="panel max-w-3xl overflow-hidden">
        <form onSubmit={onAdd} className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row">
          <input
            className="input"
            required
            maxLength={50}
            placeholder="ชื่อประเภทใหม่ เช่น Cyber Security"
            aria-label="ชื่อประเภทใหม่"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-primary shrink-0" disabled={add.isPending || !name.trim()}><Plus /> เพิ่มประเภท</button>
        </form>
        <Async q={q}>
          {({ types }) =>
            types.length === 0 ? (
              <Empty icon={Tags} title="ยังไม่มีประเภทโครงงาน">เพิ่มประเภทแรกได้จากช่องด้านบน</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[520px]">
                  <thead>
                    <tr>
                      <th className="w-16 text-center">ลำดับ</th>
                      <th>ประเภท</th>
                      <th>จำนวนโครงงาน</th>
                      <th className="text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((t, i) => <TypeItem key={t.id} t={t} index={i + 1} />)}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </section>
    </>
  )
}

function TypeItem({ t, index }: { t: TypeRow; index: number }) {
  const confirm = useConfirm()
  const rename = useAction((n: string) => api.patch(`/admin/types/${t.id}`, { name: n }), { success: 'เปลี่ยนชื่อประเภทแล้ว', invalidate: RENAME_KEYS })
  const remove = useAction(() => api.del(`/admin/types/${t.id}`), { success: 'ลบประเภทแล้ว', invalidate: KEYS })
  const busy = rename.isPending || remove.isPending

  const onRename = async () => {
    const v = await confirm({ title: 'เปลี่ยนชื่อประเภท', text: `ชื่อใหม่ของ "${t.name}"`, input: { label: 'ชื่อประเภท', defaultValue: t.name }, confirmText: 'บันทึก' })
    if (v === false) return
    const n = v.trim()
    if (!n || n === t.name) return
    if (n.length > 50) {
      toast.error('ชื่อประเภทยาวได้ไม่เกิน 50 ตัวอักษร')
      return
    }
    rename.mutate(n)
  }
  const onDelete = async () => {
    const ok = await confirm({ title: 'ลบประเภท', text: `ต้องการลบประเภท "${t.name}" ใช่ไหม?`, confirmText: 'ลบ', danger: true })
    if (ok) remove.mutate()
  }

  return (
    <tr>
      <td className="text-center text-muted">{index}</td>
      <td className="font-medium">{t.name}</td>
      <td>
        {t.used > 0 ? (
          <Link to={`/admin/projects?type=${t.id}`} className="no-underline hover:underline">{t.used} โครงงาน</Link>
        ) : (
          <span className="text-muted">ยังไม่มี</span>
        )}
      </td>
      <td>
        <div className="flex justify-end gap-1.5 whitespace-nowrap">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onRename}><Pencil /> เปลี่ยนชื่อ</button>
          <button
            type="button"
            className="btn btn-bad btn-sm"
            disabled={busy || t.used > 0}
            title={t.used > 0 ? 'มีโครงงานใช้ประเภทนี้อยู่' : undefined}
            onClick={onDelete}
          >
            <Trash2 /> ลบ
          </button>
        </div>
      </td>
    </tr>
  )
}
