// ข้อมูลตัวอย่างสำหรับเครื่องพัฒนา
//   รันอัตโนมัติเมื่อ server เปิดครั้งแรกแล้วฐานข้อมูลว่าง
//   หรือรัน `npm run seed` เพื่อล้างฐานข้อมูลแล้วใส่ข้อมูลตัวอย่างใหม่ (ต้องปิด server ก่อน)
// ทุกบัญชีใช้รหัสผ่าน Demo@1234
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import mongoose, { type Types } from 'mongoose'
import { config } from './config.js'
import { hashPassword } from './lib/password.js'
import { storageDir } from './lib/uploads.js'
import { Project, currentTerm, recomputeStatus } from './models/Project.js'
import { ProjectRequest } from './models/Request.js'
import { Submission, type Chapter } from './models/Submission.js'
import { User } from './models/User.js'
import { Activity, Code, Comment, Deadline, Message, Notification, ProjectFile, ProjectType, getSettings } from './models/misc.js'

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)

// PDF หน้าเดียวขนาดเล็ก ไว้เป็นไฟล์ตัวอย่าง
function tinyPdf(text: string) {
  const content = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

function storeFile(kind: 'files' | 'submissions', projectId: Types.ObjectId, ext: string, data: Buffer) {
  const name = crypto.randomUUID() + ext
  fs.writeFileSync(path.join(storageDir(kind, String(projectId)), name), data)
  return { storedName: name, size: data.length }
}

export async function seedDemo() {
  console.log('[seed] กำลังใส่ข้อมูลตัวอย่าง…')
  const passwordHash = await hashPassword('Demo@1234')
  const mk = (username: string, name: string, role: 'student' | 'teacher' | 'admin', email: string, mobile: string, studentId = '') =>
    User.create({ username, name, role, email, mobile, studentId, passwordHash })

  const admin = await mk('demo_admin', 'ผู้ดูแลระบบ ทดสอบ', 'admin', 'admin@demo.up.ac.th', '0800000001')
  const t1 = await mk('demo_teacher', 'อาจารย์ สมชาย ใจดี', 'teacher', 'somchai.j@demo.up.ac.th', '0810000001')
  const t2 = await mk('demo_teacher2', 'ผศ.ดร. วิภา รักเรียน', 'teacher', 'wipa.r@demo.up.ac.th', '0810000002')
  const t3 = await mk('demo_teacher3', 'อาจารย์ ธนากร มั่นคง', 'teacher', 'thanakorn.m@demo.up.ac.th', '0810000003')
  const s1 = await mk('demo_student', 'นายกิตติ ศรีสุข', 'student', '65023456@demo.up.ac.th', '0910000001', '65023456')
  const s2 = await mk('demo_student2', 'นางสาวพิมพ์ชนก แก้วมณี', 'student', '65023457@demo.up.ac.th', '0910000002', '65023457')
  const s3 = await mk('demo_student3', 'นายณัฐพล อินทร์แก้ว', 'student', '64021001@demo.up.ac.th', '0910000003', '64021001')
  const s4 = await mk('demo_student4', 'นางสาวศิริพร ทองดี', 'student', '64021002@demo.up.ac.th', '0910000004', '64021002')
  const s5 = await mk('demo_student5', 'นายภาณุวัฒน์ ชัยมงคล', 'student', '64021003@demo.up.ac.th', '0910000005', '64021003')
  const s6 = await mk('demo_student6', 'นางสาวอรอุมา สุขเจริญ', 'student', '65023460@demo.up.ac.th', '0910000006', '65023460')
  await mk('demo_student7', 'นายปกรณ์ วงศ์ใหญ่', 'student', '65023461@demo.up.ac.th', '0910000007', '65023461')

  const typeNames = ['AI', 'Game', 'OIT', 'Web Application', 'Mobile Application', 'IoT / Embedded', 'Data Science', 'Other']
  const types = Object.fromEntries(
    await Promise.all(typeNames.map(async (name, i) => [name, (await ProjectType.create({ name, order: i + 1 }))._id] as const)),
  )

  const term = currentTerm()
  const chapterDue: [Chapter, number][] = [['บทที่ 1', -30], ['บทที่ 2', -5], ['บทที่ 3', 10], ['บทที่ 4', 30], ['บทที่ 5', 50], ['ภาคผนวก', 60], ['เล่มสมบูรณ์', 70]]
  for (const [chapter, offset] of chapterDue) {
    await Deadline.create({ term, chapter, dueDate: new Date(Date.now() + offset * DAY), note: chapter === 'บทที่ 1' ? 'ส่งพร้อมแบบฟอร์มขออนุมัติหัวข้อ' : '' })
  }

  const [ty, tn] = term.split('/').map(Number)
  const lastTerm = tn > 1 ? `${ty}/${tn - 1}` : `${ty - 1}/2`

  // 1) โครงงานของ demo_student (กำลังทำ: ผ่าน 1/3, มีคำขอรออนุมัติ)
  const p1 = await Project.create({
    nameTh: 'ระบบแนะนำรายวิชาเลือกด้วยการเรียนรู้ของเครื่อง',
    nameEn: 'Elective Course Recommendation System using Machine Learning',
    type: types['AI'], term, classLevel: 4, createdBy: s1._id,
    members: [
      { user: s1._id, kind: 'student', isOwner: true },
      { user: s2._id, kind: 'student' },
      { user: t1._id, kind: 'teacher', teacherRole: 'advisor', vote: 'pass', votedAt: daysAgo(1) },
      { user: t2._id, kind: 'teacher', teacherRole: 'committee' },
    ],
  })
  recomputeStatus(p1)
  await p1.save()
  await ProjectRequest.create({ project: p1._id, type: 'teacher_invite', requestedBy: s1._id, target: t3._id, teacherRole: 'committee' })
  await ProjectRequest.create({
    project: p1._id, type: 'rename', requestedBy: s2._id,
    nameTh: 'ระบบแนะนำรายวิชาเลือกอัจฉริยะด้วยการเรียนรู้ของเครื่อง', nameEn: 'Smart Elective Course Recommendation using Machine Learning',
    oldNameTh: p1.nameTh, oldNameEn: p1.nameEn,
  })

  const sub = async (projectId: Types.ObjectId, chapter: Chapter, version: number, by: Types.ObjectId, ago: number, reviews: { reviewer: Types.ObjectId; verdict: 'pass' | 'revise'; comment: string }[] = []) => {
    const label = chapter === 'เล่มสมบูรณ์' ? 'Final Report' : chapter === 'ภาคผนวก' ? 'Appendix' : chapter.replace('บทที่', 'Chapter')
    const f = storeFile('submissions', projectId, '.pdf', tinyPdf(`CS Project demo document - ${label} (v${version})`))
    const fileName = `${chapter.replace(' ', '')}_v${version}.pdf`
    await Submission.create({ project: projectId, chapter, version, fileName, ...f, uploadedBy: by, createdAt: daysAgo(ago), reviews: reviews.map((r) => ({ ...r, createdAt: daysAgo(ago - 1) })) })
    await Activity.create({ project: projectId, type: 'chapter.submit', actor: by, detail: `${chapter} v${version}`, createdAt: daysAgo(ago) })
  }
  await sub(p1._id, 'บทที่ 1', 1, s1._id, 40, [{ reviewer: t1._id, verdict: 'revise', comment: 'ขอให้เพิ่มที่มาและความสำคัญของปัญหา และระบุขอบเขตให้ชัดเจนขึ้น' }])
  await sub(p1._id, 'บทที่ 1', 2, s1._id, 32, [{ reviewer: t1._id, verdict: 'pass', comment: 'เรียบร้อยดี' }, { reviewer: t2._id, verdict: 'pass', comment: '' }])
  await sub(p1._id, 'บทที่ 2', 1, s2._id, 3)

  const f1 = storeFile('files', p1._id, '.pdf', tinyPdf('Project proposal'))
  await ProjectFile.create({ project: p1._id, fileName: 'ข้อเสนอโครงงาน.pdf', ...f1, uploadedBy: s1._id })
  await Code.create({
    project: p1._id, language: 'python', functionName: 'recommend_courses', updatedBy: s1._id,
    code: `def recommend_courses(student, courses, k=5):\n    """คืนรายวิชาที่แนะนำ k วิชา เรียงตามคะแนนความเหมาะสม"""\n    scored = [(c, score(student, c)) for c in courses if c.id not in student.passed]\n    scored.sort(key=lambda x: x[1], reverse=True)\n    return [c for c, _ in scored[:k]]\n`,
  })
  await Code.create({
    project: p1._id, language: 'sql', functionName: 'student_grades_view', updatedBy: s2._id,
    code: `CREATE VIEW student_grades AS\nSELECT s.student_id, c.course_code, g.grade\nFROM students s\nJOIN grades g ON g.student_id = s.student_id\nJOIN courses c ON c.course_id = g.course_id;\n`,
  })
  await Comment.create({ project: p1._id, teacher: t1._id, author: t1._id, text: 'ช่วยส่งแผนการดำเนินงานรายสัปดาห์มาด้วยนะครับ', createdAt: daysAgo(6) })
  await Comment.create({ project: p1._id, teacher: t1._id, author: s1._id, text: 'รับทราบครับอาจารย์ จะส่งภายในวันศุกร์นี้ครับ', createdAt: daysAgo(5) })

  // 2) โครงงานที่ผ่านแล้ว (อยู่ในคลังโครงงาน)
  const p2 = await Project.create({
    nameTh: 'แอปพลิเคชันจองห้องประชุมบนมือถือ', nameEn: 'Mobile Meeting Room Booking Application',
    type: types['Mobile Application'], term: lastTerm, classLevel: 4, createdBy: s3._id, createdAt: daysAgo(200),
    members: [
      { user: s3._id, kind: 'student', isOwner: true },
      { user: s4._id, kind: 'student' },
      { user: t2._id, kind: 'teacher', teacherRole: 'advisor', vote: 'pass', votedAt: daysAgo(40) },
      { user: t1._id, kind: 'teacher', teacherRole: 'committee', vote: 'pass', votedAt: daysAgo(39) },
      { user: t3._id, kind: 'teacher', teacherRole: 'committee', vote: 'pass', votedAt: daysAgo(38) },
    ],
  })
  recomputeStatus(p2)
  p2.passedAt = daysAgo(38)
  await p2.save()
  await Code.create({
    project: p2._id, language: 'dart', functionName: 'BookingCard', updatedBy: s3._id,
    code: `class BookingCard extends StatelessWidget {\n  const BookingCard({super.key, required this.room});\n  final Room room;\n\n  @override\n  Widget build(BuildContext context) {\n    return Card(child: ListTile(title: Text(room.name), subtitle: Text(room.time)));\n  }\n}\n`,
  })
  await Code.create({
    project: p2._id, language: 'javascript', functionName: 'checkOverlap', updatedBy: s4._id,
    code: `// ตรวจว่าการจองช่วงเวลาใหม่ทับกับการจองเดิมหรือไม่\nexport function checkOverlap(bookings, start, end) {\n  return bookings.some((b) => start < b.end && end > b.start)\n}\n`,
  })
  // เอกสารรายบทและเล่มสมบูรณ์ของโครงงานที่ผ่านแล้ว (ให้คลังโครงงานสาธารณะมีเล่มให้อ่าน)
  for (const [i, chapter] of (['บทที่ 1', 'บทที่ 2', 'บทที่ 3', 'บทที่ 4', 'บทที่ 5', 'เล่มสมบูรณ์'] as Chapter[]).entries()) {
    await sub(p2._id, chapter, 1, i % 2 ? s4._id : s3._id, 180 - i * 25, [{ reviewer: t2._id, verdict: 'pass', comment: '' }])
  }
  const f2 = storeFile('files', p2._id, '.pdf', tinyPdf('Final report'))
  await ProjectFile.create({ project: p2._id, fileName: 'รายงานฉบับสมบูรณ์.pdf', ...f2, uploadedBy: s3._id })

  // 3) โครงงานที่ผ่านแล้วอีกโครงงาน
  const p3 = await Project.create({
    nameTh: 'เกมฝึกทักษะคณิตศาสตร์สำหรับเด็กประถม', nameEn: 'Math Practice Game for Primary School Students',
    type: types['Game'], term: lastTerm, classLevel: 4, createdBy: s5._id, createdAt: daysAgo(190),
    members: [
      { user: s5._id, kind: 'student', isOwner: true },
      { user: t3._id, kind: 'teacher', teacherRole: 'advisor', vote: 'pass', votedAt: daysAgo(30) },
      { user: t1._id, kind: 'teacher', teacherRole: 'committee', vote: 'pass', votedAt: daysAgo(30) },
      { user: t2._id, kind: 'teacher', teacherRole: 'committee', vote: 'pass', votedAt: daysAgo(29) },
    ],
  })
  recomputeStatus(p3)
  p3.passedAt = daysAgo(29)
  await p3.save()
  await Code.create({
    project: p3._id, language: 'C#', functionName: 'GenerateQuestion', updatedBy: s5._id,
    code: `public Question GenerateQuestion(int level)\n{\n    var a = rng.Next(1, 10 * level);\n    var b = rng.Next(1, 10 * level);\n    return new Question($"{a} + {b} = ?", a + b);\n}\n`,
  })

  await sub(p3._id, 'เล่มสมบูรณ์', 1, s5._id, 35, [{ reviewer: t3._id, verdict: 'pass', comment: 'เรียบร้อย' }])

  // 4) โครงงานที่ไม่ผ่าน (ส่งใหม่ได้)
  const p4 = await Project.create({
    nameTh: 'ระบบตรวจวัดคุณภาพอากาศด้วย IoT', nameEn: 'Air Quality Monitoring System with IoT',
    type: types['IoT / Embedded'], term, classLevel: 4, createdBy: s6._id,
    members: [
      { user: s6._id, kind: 'student', isOwner: true },
      { user: t3._id, kind: 'teacher', teacherRole: 'advisor', vote: 'fail', votedAt: daysAgo(2) },
      { user: t1._id, kind: 'teacher', teacherRole: 'committee' },
    ],
  })
  recomputeStatus(p4)
  await p4.save()
  await sub(p4._id, 'บทที่ 1', 1, s6._id, 25, [{ reviewer: t3._id, verdict: 'revise', comment: 'ทบทวนวรรณกรรมยังไม่เพียงพอ' }])

  for (const [p, creator, ago] of [[p1, s1, 45], [p2, s3, 200], [p3, s5, 190], [p4, s6, 28]] as const) {
    await Activity.create({ project: p._id, type: 'project.create', actor: creator._id, detail: p.nameTh, createdAt: daysAgo(ago) })
  }
  await Activity.create({ project: p1._id, type: 'file.add', actor: s1._id, detail: 'ข้อเสนอโครงงาน.pdf', createdAt: daysAgo(44) })
  await Activity.create({ project: p1._id, type: 'teacher.vote', actor: t1._id, detail: 'ผ่าน', createdAt: daysAgo(1) })
  await Activity.create({ project: p4._id, type: 'teacher.vote', actor: t3._id, detail: 'ไม่ผ่าน', createdAt: daysAgo(2) })

  // แชท
  const chat = [
    [s1, t1, 'สวัสดีครับอาจารย์ ขอนัดปรึกษาเรื่องบทที่ 2 ได้ไหมครับ', 3],
    [t1, s1, 'ได้ครับ วันพุธบ่ายสองโมงที่ห้องพักอาจารย์นะครับ', 3],
    [s1, t1, 'ขอบคุณครับอาจารย์', 2],
    [s2, t1, 'อาจารย์คะ ส่งบทที่ 2 ในระบบแล้วนะคะ', 0.1],
  ] as const
  for (const [from, to, text, ago] of chat) {
    const student = from.role === 'student' ? from : to
    const teacher = from.role === 'teacher' ? from : to
    await Message.create({ student: student._id, teacher: teacher._id, sender: from._id, text, createdAt: daysAgo(ago), readAt: ago > 1 ? daysAgo(ago) : null })
  }

  await Notification.create([
    { user: s1._id, icon: 'circle-check', title: `${t1.name} ให้ผ่านโครงงาน`, detail: p1.nameTh, link: `/projects/${p1.id}`, createdAt: daysAgo(1) },
    { user: s1._id, icon: 'circle-check', title: `${t1.name} ให้ผ่าน บทที่ 1`, detail: 'เรียบร้อยดี', link: `/projects/${p1.id}/chapters`, createdAt: daysAgo(31) },
    { user: t1._id, icon: 'file-check', title: 'เอกสารรอตรวจ: บทที่ 2 v1', detail: p1.nameTh, link: `/projects/${p1.id}/chapters`, createdAt: daysAgo(3) },
    { user: t1._id, icon: 'pencil-line', title: 'คำขอเปลี่ยนชื่อโครงงาน', detail: 'ชื่อใหม่: ระบบแนะนำรายวิชาเลือกอัจฉริยะด้วยการเรียนรู้ของเครื่อง', link: '/requests', createdAt: daysAgo(1) },
    { user: t3._id, icon: 'mail', title: 'คำเชิญเป็นอาจารย์กรรมการ', detail: `โครงงาน: ${p1.nameTh}`, link: '/requests', createdAt: daysAgo(1) },
  ])

  const settings = await getSettings()
  settings.chairName = 'อาจารย์ ประธาน หลักสูตร'
  await settings.save()

  console.log(`[seed] เสร็จ: ผู้ใช้ ${await User.countDocuments()} บัญชี, โครงงาน ${await Project.countDocuments()} โครงงาน (รหัสผ่าน Demo@1234) admin=${admin.username}`)
}

// รันตรง (npm run seed): ล้างข้อมูลเดิมทั้งหมดแล้วใส่ใหม่
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDb, disconnectDb } = await import('./db.js')
  await connectDb()
  await mongoose.connection.dropDatabase()
  fs.rmSync(config.uploadDir, { recursive: true, force: true })
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()))
  await seedDemo()
  await disconnectDb()
}
