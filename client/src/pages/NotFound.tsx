import { ArrowLeft, FileQuestionMark, House } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Empty } from '../components/ui'

// หน้าไม่พบ (404) แสดงภายในเลย์เอาต์หลัก
export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="panel mx-auto mt-8 max-w-lg">
      <Empty icon={FileQuestionMark} title="ไม่พบหน้าที่คุณต้องการ">
        ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}><ArrowLeft /> ย้อนกลับ</button>
          <Link to="/" className="btn btn-primary"><House /> กลับหน้าแรก</Link>
        </div>
      </Empty>
    </div>
  )
}
