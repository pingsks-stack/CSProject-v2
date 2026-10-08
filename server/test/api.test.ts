// ทดสอบ API ทั้งระบบกับแอปจริง + MongoDB ในหน่วยความจำ (ไม่ต้องเปิด server แยก)
//   npm test (ที่โฟลเดอร์โปรเจค หรือใน server/)
// แต่ละ describe เริ่มจากข้อมูลตัวอย่างชุดใหม่ (ctx.reset) ส่วน test ภายใน describe เดียวกันอาจทำงานต่อเนื่องกันตามลำดับ
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { APP_URL, PASSWORD, WEBHOOK_SECRET, form, startTestServer, tinyPng, waitFor, type Client, type Json, type Seed, type TestContext } from './helpers.js'

let ctx: TestContext

before(async () => {
  ctx = await startTestServer()
})

after(async () => {
  await ctx?.stop()
})

const login = (username: string, password?: string) => ctx.login(username, password)
const titles = async (c: Client) => ((await c.get('/notifications')).data.items as Json[]).map((n) => String(n.title))
const memberOf = (project: Json, userId: string) => (project.members as Json[]).find((m) => m.user.id === userId)
const BOM = Buffer.from([0xef, 0xbb, 0xbf])

// ===================================================================================
describe('auth: login, logout, register, password', () => {
  before(async () => {
    await ctx.reset()
  })

  test('anonymous /auth/me returns user null', async () => {
    const r = await ctx.client().get('/auth/me')
    assert.equal(r.status, 200)
    assert.equal(r.data.user, null)
  })

  test('login validates input and rejects wrong credentials with 401', async () => {
    const c = ctx.client()
    assert.equal((await c.post('/auth/login', { username: '', password: 'x' })).status, 400)
    assert.equal((await c.post('/auth/login', { username: 'demo_student' })).status, 400)
    const wrong = await c.post('/auth/login', { username: 'demo_student', password: 'wrong-password' })
    assert.equal(wrong.status, 401)
    assert.equal(typeof wrong.data.error, 'string')
    assert.equal((await c.post('/auth/login', { username: 'nobody_here', password: PASSWORD })).status, 401)
    assert.equal((await c.get('/auth/me')).data.user, null)
  })

  test('login sets an httpOnly SameSite=Lax cookie and returns the public user only', async () => {
    const c = ctx.client()
    const r = await c.post('/auth/login', { username: 'demo_student', password: PASSWORD })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.username, 'demo_student')
    assert.equal(r.data.user.role, 'student')
    assert.equal(r.data.user.studentId, '65023456')
    assert.ok(!('passwordHash' in r.data.user))
    assert.ok(!('sessionVersion' in r.data.user))
    const cookie = r.headers.getSetCookie().find((s) => s.startsWith('sid='))
    assert.ok(cookie, 'sid cookie is set')
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Lax/i)
    assert.equal((await c.get('/auth/me')).data.user.username, 'demo_student')
  })

  test('logout clears the session', async () => {
    const c = await login('demo_student')
    assert.equal((await c.get('/projects?scope=mine')).status, 200)
    assert.equal((await c.post('/auth/logout')).status, 204)
    assert.equal((await c.get('/auth/me')).data.user, null)
    assert.equal((await c.get('/projects')).status, 401)
  })

  const newStudent = {
    username: 'new_student',
    password: 'secret1',
    name: 'นายทดสอบ ระบบใหม่',
    email: 'New.Student@Demo.up.ac.th',
    studentId: '66012345',
    mobile: '0990000001',
  }

  test('register validates every field', async () => {
    const c = ctx.client()
    const cases: [string, Record<string, unknown>][] = [
      ['password shorter than 6', { password: '12345' }],
      ['password longer than 50', { password: 'x'.repeat(51) }],
      ['student id is not 8 digits', { studentId: '6601234' }],
      ['student id has letters', { studentId: '6601234a' }],
      ['mobile is not 10 digits', { mobile: '099000000' }],
      ['mobile does not start with 0', { mobile: '1990000001' }],
      ['invalid email', { email: 'not-an-email' }],
      ['username with a space', { username: 'new student' }],
      ['blank name', { name: '   ' }],
      ['missing field', { mobile: undefined }],
    ]
    for (const [label, patch] of cases) {
      const r = await c.post('/auth/register', { ...newStudent, ...patch })
      assert.equal(r.status, 400, label)
      assert.equal(typeof r.data.error, 'string', label)
    }
    assert.equal((await c.get('/auth/me')).data.user, null)
  })

  test('register reports which field is a duplicate', async () => {
    const c = ctx.client()
    const cases: [Record<string, string>, RegExp][] = [
      [{ username: 'demo_student' }, /ชื่อผู้ใช้/],
      [{ email: '65023456@DEMO.up.ac.th' }, /อีเมล/],
      [{ studentId: '65023456' }, /รหัสนิสิต/],
      [{ mobile: '0910000001' }, /เบอร์โทรศัพท์/],
    ]
    for (const [patch, msg] of cases) {
      const r = await c.post('/auth/register', { ...newStudent, ...patch })
      assert.equal(r.status, 400, JSON.stringify(patch))
      assert.match(r.data.error, msg)
    }
  })

  test('register creates a student (role cannot be chosen) and logs in', async () => {
    const c = ctx.client()
    const r = await c.post('/auth/register', { ...newStudent, role: 'admin' })
    assert.equal(r.status, 201)
    assert.equal(r.data.user.role, 'student')
    assert.equal(r.data.user.email, 'new.student@demo.up.ac.th')
    assert.equal((await c.get('/auth/me')).data.user.username, 'new_student')
    assert.equal((await c.get('/admin/users')).status, 403)
    await login('new_student', 'secret1')
  })

  test('profile: update name/mobile, duplicate mobile rejected, stats returned', async () => {
    const st = await login('demo_student')
    const prof = await st.get('/auth/profile')
    assert.equal(prof.status, 200)
    assert.deepEqual(prof.data.stats, { projects: 1, messages: 2 })
    const ok = await st.put('/auth/profile', { name: 'นายกิตติ ศรีสุข (แก้ไข)', mobile: '0910000099' })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.user.name, 'นายกิตติ ศรีสุข (แก้ไข)')
    assert.equal(ok.data.user.mobile, '0910000099')
    const dup = await st.put('/auth/profile', { name: 'x', mobile: '0910000002' })
    assert.equal(dup.status, 400)
    assert.match(dup.data.error, /เบอร์โทรศัพท์/)
    assert.equal((await st.put('/auth/profile', { name: 'x', mobile: '12345' })).status, 400)
    assert.equal((await st.put('/auth/profile', { name: 'นายกิตติ ศรีสุข', mobile: '' })).data.user.mobile, '')
    assert.equal((await ctx.client().put('/auth/profile', { name: 'x', mobile: '' })).status, 401)
  })

  test('change password: needs the current password, keeps this session, logs out other sessions', async () => {
    const a = await login('demo_student5')
    const b = await login('demo_student5')
    assert.equal((await a.post('/auth/password', { current: 'nope', password: 'NewPass1' })).status, 400)
    assert.equal((await a.post('/auth/password', { current: PASSWORD, password: '123' })).status, 400)
    assert.equal((await a.post('/auth/password', { current: PASSWORD, password: 'NewPass1' })).status, 204)
    assert.equal((await a.get('/auth/me')).data.user?.username, 'demo_student5')
    assert.equal((await b.get('/auth/me')).data.user, null)
    assert.equal((await ctx.client().post('/auth/login', { username: 'demo_student5', password: PASSWORD })).status, 401)
    await login('demo_student5', 'NewPass1')
  })

  test('too many failed logins for one username are rate limited (429)', async () => {
    const c = ctx.client()
    for (let i = 0; i < 10; i++) {
      assert.equal((await c.post('/auth/login', { username: 'ghost_user', password: `x${i}` })).status, 401)
    }
    assert.equal((await c.post('/auth/login', { username: 'ghost_user', password: 'x' })).status, 429)
    assert.equal((await c.post('/auth/login', { username: 'GHOST_USER', password: 'x' })).status, 429)
    // ชื่อผู้ใช้อื่นจาก IP เดียวกันไม่ถูกล็อก
    assert.equal((await c.post('/auth/login', { username: 'demo_student', password: PASSWORD })).status, 200)
  })
})

// ===================================================================================
describe('permissions: roles and project membership', () => {
  let seed: Seed
  let anon: Client, st: Client, st7: Client, t1: Client, t3: Client, ad: Client

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    ;[st, st7, t1, t3, ad] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher', 'demo_teacher3', 'demo_admin'].map((u) => login(u)))
  })

  test('anonymous requests to protected APIs get 401', async () => {
    const urls = [
      '/projects', '/meta', '/dashboard', '/admin/users', '/notifications', '/chat/contacts', '/codes', '/requests',
      '/teachers', '/stats/types', `/projects/${seed.p1}`, `/projects/${seed.p2}/files`, '/users/search?role=teacher',
    ]
    for (const url of urls) assert.equal((await anon.get(url)).status, 401, url)
    assert.equal((await anon.post('/projects', { nameTh: 'ก', nameEn: 'A' })).status, 401)
  })

  test('students and teachers get 403 on admin APIs', async () => {
    for (const c of [st, t1]) {
      for (const url of ['/admin/users', '/admin/types', '/admin/deadlines', '/admin/settings', '/admin/export/users.csv']) {
        assert.equal((await c.get(url)).status, 403, url)
      }
      assert.equal((await c.post('/admin/users', { role: 'admin', name: 'x', username: 'x', email: 'x@x.th', password: 'abcdef' })).status, 403)
    }
  })

  test('unknown API path returns JSON 404 (logged in or not); invalid ids give 404', async () => {
    assert.equal((await anon.get('/does-not-exist')).status, 404)
    const r = await st.get('/does-not-exist')
    assert.equal(r.status, 404)
    assert.equal(typeof r.data.error, 'string')
    assert.equal((await st.get('/projects/not-an-id')).status, 404)
    assert.equal((await st.get('/projects/000000000000000000000000')).status, 404)
  })

  test('outsider student cannot see an in-progress project or any of its content', async () => {
    for (const sub of ['', '/chapters', '/files', '/codes', '/activity', '/requests', '/github']) {
      assert.equal((await st7.get(`/projects/${seed.p1}${sub}`)).status, 403, sub || 'detail')
    }
  })

  test('a teacher with only a pending invite is not yet a member', async () => {
    assert.equal((await t3.get(`/projects/${seed.p1}`)).status, 403)
  })

  test('members and admin can view the project with their own role flags', async () => {
    const s = await st.get(`/projects/${seed.p1}`)
    assert.equal(s.status, 200)
    assert.deepEqual(
      { isStudent: s.data.viewer.isStudent, isTeacher: s.data.viewer.isTeacher, canEdit: s.data.viewer.canEdit, myVote: s.data.viewer.myVote },
      { isStudent: true, isTeacher: false, canEdit: true, myVote: null },
    )
    const t = await t1.get(`/projects/${seed.p1}`)
    assert.equal(t.data.viewer.isAdvisor, true)
    assert.equal(t.data.viewer.canEdit, false)
    assert.equal(t.data.viewer.myVote, 'pass')
    const a = await ad.get(`/projects/${seed.p1}`)
    assert.equal(a.data.viewer.isAdmin, true)
    assert.equal(a.data.viewer.canEdit, true)
    assert.equal(a.data.project.fileCount, 1)
    assert.equal(a.data.project.codeCount, 2)
  })

  test('library/search scopes only show passed projects to outsiders; scope=all is admin only', async () => {
    const lib = (await st7.get('/projects?scope=library')).data
    assert.equal(lib.total, 2)
    assert.ok(lib.projects.every((p: Json) => p.status === 'passed'))
    const search = (await st7.get(`/projects?q=${encodeURIComponent('แนะนำ')}`)).data
    assert.ok(!search.projects.some((p: Json) => p.id === seed.p1))
    const mineSearch = (await st.get('/projects')).data
    assert.deepEqual(new Set(mineSearch.projects.map((p: Json) => p.id)), new Set([seed.p1, seed.p2, seed.p3]))
    assert.equal((await st7.get('/projects?scope=all')).status, 403)
    assert.equal((await t1.get('/projects?scope=all')).status, 403)
    assert.equal((await ad.get('/projects?scope=all')).data.total, 4)
  })

  test('contact details (email/mobile) are only shown to members and admin', async () => {
    const outsider = (await st7.get(`/projects/${seed.p2}`)).data.project
    assert.ok(outsider.members.every((m: Json) => m.user.email === undefined && m.user.mobile === undefined && m.user.studentId === undefined))
    const member = (await t1.get(`/projects/${seed.p2}`)).data.project
    assert.ok(member.members.every((m: Json) => typeof m.user.email === 'string'))
    const admin = (await ad.get(`/projects/${seed.p2}`)).data.project
    assert.ok(admin.members.every((m: Json) => typeof m.user.email === 'string'))
  })

  test('only students of the project or admin can edit it; students must request a rename', async () => {
    assert.equal((await t1.patch(`/projects/${seed.p1}`, { typeId: seed.types.Game })).status, 403)
    assert.equal((await st7.patch(`/projects/${seed.p1}`, { typeId: seed.types.Game })).status, 403)
    assert.equal((await st.patch(`/projects/${seed.p1}`, { typeId: seed.types.Game })).status, 204)
    assert.equal((await st.get(`/projects/${seed.p1}`)).data.project.type.name, 'Game')
    assert.equal((await st.patch(`/projects/${seed.p1}`, { typeId: '000000000000000000000000' })).status, 400)
    assert.equal((await st.patch(`/projects/${seed.p1}`, { nameTh: 'ชื่อใหม่' })).status, 403)
    assert.equal((await ad.patch(`/projects/${seed.p1}`, { nameTh: 'ชื่อใหม่โดยแอดมิน' })).status, 204)
    assert.equal((await st.get(`/projects/${seed.p1}`)).data.project.nameTh, 'ชื่อใหม่โดยแอดมิน')
    assert.equal((await ad.patch(`/projects/${seed.p1}`, { nameTh: 'แอปพลิเคชันจองห้องประชุมบนมือถือ' })).status, 400)
  })

  test('role-restricted actions: students cannot vote, teachers cannot upload, outsiders cannot add code', async () => {
    assert.equal((await st.post(`/projects/${seed.p1}/vote`, { vote: 'pass' })).status, 403)
    assert.equal((await t1.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3' }, [['file', 'a.pdf', '%PDF']]))).status, 403)
    assert.equal((await st7.post(`/projects/${seed.p1}/codes`, { language: 'python', functionName: 'f', code: 'x' })).status, 403)
    assert.equal((await ad.get('/chat/conversations')).status, 403)
  })

  test('dashboard is role specific', async () => {
    const s = (await st.get('/dashboard')).data
    assert.equal(s.role, 'student')
    assert.deepEqual(s.kpis, { projects: 1, passed: 0, files: 1, teachers: 2, pendingInvites: 1, library: 2 })
    assert.equal(s.deadlines.length, 7)
    const t = (await t1.get('/dashboard')).data
    assert.equal(t.role, 'teacher')
    assert.equal(t.kpis.projects, 4)
    assert.equal(t.kpis.advising, 1)
    assert.ok(t.pending.some((x: Json) => x.kind === 'request'))
    const a = (await ad.get('/dashboard')).data
    assert.equal(a.role, 'admin')
    assert.equal(a.kpis.projects, 4)
    assert.equal(a.kpis.students, 7)
    assert.equal(a.kpis.teachers, 3)
    assert.equal(a.kpis.passed, 2)
    assert.equal((await st.get('/stats/types')).data.types.length, 8)
  })
})

// ===================================================================================
describe('projects: creation rules and members', () => {
  let seed: Seed
  let st: Client, st7: Client, t1: Client, ad: Client
  let created = ''
  let s8Id = ''
  let s9Id = ''

  before(async () => {
    seed = await ctx.reset()
    ;[st, st7, t1, ad] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher', 'demo_admin'].map((u) => login(u)))
  })

  test('meta lists 8 types with Other last, the chapters and the current term', async () => {
    const m = (await st.get('/meta')).data
    assert.equal(m.types.length, 8)
    assert.equal(m.types.at(-1).name, 'Other')
    assert.equal(m.chapters.length, 7)
    assert.equal(m.currentTerm, seed.term)
    assert.ok(m.terms.includes(seed.term) && m.terms.includes(seed.lastTerm))
  })

  test('a student who already has a project cannot create another', async () => {
    const r = await st.post('/projects', { nameTh: 'โครงงานที่สอง', nameEn: 'Second' })
    assert.equal(r.status, 400)
    assert.match(r.data.error, /มีโครงงานอยู่แล้ว/)
  })

  test('teachers and admins cannot create projects', async () => {
    assert.equal((await t1.post('/projects', { nameTh: 'ก', nameEn: 'A' })).status, 403)
    assert.equal((await ad.post('/projects', { nameTh: 'ก', nameEn: 'A' })).status, 403)
  })

  test('names are required and the type must exist', async () => {
    assert.equal((await st7.post('/projects', { nameTh: '', nameEn: 'A' })).status, 400)
    assert.equal((await st7.post('/projects', { nameTh: 'ก', nameEn: '  ' })).status, 400)
    assert.equal((await st7.post('/projects', { nameTh: 'ก', nameEn: 'A', typeId: '000000000000000000000000' })).status, 400)
    assert.equal((await st7.post('/projects', { nameTh: 'ก', nameEn: 'A', typeId: 'not-an-id' })).status, 400)
    assert.equal((await st7.get('/projects?scope=mine')).data.projects.length, 0)
  })

  test('a student without a project can create one', async () => {
    const r = await st7.post('/projects', { nameTh: 'โครงงานทดสอบ', nameEn: 'Test Project', typeId: seed.types.AI })
    assert.equal(r.status, 201)
    created = r.data.id
    const p = (await st7.get(`/projects/${created}`)).data.project
    assert.equal(p.status, 'pending')
    assert.equal(p.statusLabel, 'รอพิจารณา')
    assert.equal(p.term, seed.term)
    assert.equal(p.type.name, 'AI')
    assert.equal(p.members.length, 1)
    assert.equal(p.members[0].user.id, seed.users.demo_student7)
    assert.equal(p.members[0].isOwner, true)
    const act = (await st7.get(`/projects/${created}/activity`)).data.activity
    assert.equal(act[0].type, 'project.create')
  })

  test('project names must be unique (Thai or English, case-insensitive, trimmed)', async () => {
    s8Id = (await ad.post('/admin/users', { role: 'student', name: 'นิสิต แปด', username: 'demo_student8', email: 's8@demo.up.ac.th', studentId: '66000008', password: PASSWORD })).data.user.id
    const s8 = await login('demo_student8')
    for (const body of [
      { nameTh: 'โครงงานทดสอบ', nameEn: 'Something Else' },
      { nameTh: 'อีกชื่อหนึ่ง', nameEn: 'test project' },
      { nameTh: '  โครงงานทดสอบ  ', nameEn: 'X' },
      { nameTh: 'ชื่อใหม่', nameEn: 'mobile meeting room booking application' },
    ]) {
      const r = await s8.post('/projects', body)
      assert.equal(r.status, 400, JSON.stringify(body))
      assert.match(r.data.error, /ซ้ำ/)
    }
    assert.equal((await s8.post('/projects', { nameTh: 'โครงงานของนิสิตแปด', nameEn: 'Student Eight Project' })).status, 201)
  })

  test('user search for partners/teachers', async () => {
    const teachers = (await st7.get('/users/search?role=teacher&q=')).data.users
    assert.equal(teachers.length, 3)
    assert.deepEqual((await st7.get('/users/search?role=student&q=')).data.users, [])
    const s2 = (await st7.get('/users/search?role=student&q=demo_student2')).data.users
    assert.equal(s2.length, 1)
    assert.equal(s2[0].id, seed.users.demo_student2)
    assert.equal((await st7.get('/users/search?role=admin&q=')).status, 400)
    assert.equal((await st7.get('/teachers')).data.teachers.length, 3)
  })

  test('partner rules: must be a free student, at most 2 students', async () => {
    const blocked = await st7.post(`/projects/${created}/partner`, { userId: seed.users.demo_student2 })
    assert.equal(blocked.status, 400)
    assert.match(blocked.data.error, /มีโครงงานอยู่แล้ว/)
    assert.equal((await st7.post(`/projects/${created}/partner`, { userId: seed.users.demo_teacher })).status, 400)
    assert.equal((await t1.post(`/projects/${created}/partner`, { userId: seed.users.demo_student })).status, 403)
    const nu = await ad.post('/admin/users', { role: 'student', name: 'นิสิต เก้า', username: 'demo_student9', email: 's9@demo.up.ac.th', studentId: '66000009', password: PASSWORD })
    assert.equal(nu.status, 201)
    s9Id = nu.data.user.id
    assert.equal((await st7.post(`/projects/${created}/partner`, { userId: s9Id })).status, 204)
    const s9 = await login('demo_student9')
    assert.equal((await s9.get('/projects?scope=mine')).data.projects[0].id, created)
    assert.ok((await titles(s9)).some((t) => t.includes('เพิ่มคุณเป็นคู่โปรเจค')))
    const third = await st7.post(`/projects/${created}/partner`, { userId: s8Id })
    assert.equal(third.status, 400)
    assert.match(third.data.error, /ครบ 2 คน/)
  })

  test('admin can remove a student, but not the last one', async () => {
    assert.equal((await st7.del(`/projects/${created}/students/${s9Id}`)).status, 403)
    assert.equal((await ad.del(`/projects/${created}/students/${s9Id}`)).status, 204)
    const last = await ad.del(`/projects/${created}/students/${seed.users.demo_student7}`)
    assert.equal(last.status, 400)
  })

  test('scope=mine returns progress counters', async () => {
    const r = (await st.get('/projects?scope=mine')).data
    assert.equal(r.projects.length, 1)
    const p = r.projects[0]
    assert.equal(p.id, seed.p1)
    assert.equal(p.chapterCount, 2)
    assert.equal(p.pendingInvites, 1)
    assert.equal(p.fileCount, 1)
    assert.equal(p.codeCount, 2)
    assert.equal(p.statusLabel, 'ผ่าน 1/3')
  })
})

// ===================================================================================
describe('chapters: upload and teacher review', () => {
  let seed: Seed
  let anon: Client, st: Client, st2: Client, st7: Client, t1: Client, t2: Client, t3: Client
  const thaiName = 'บทที่3 ทดสอบ.txt'
  let v1 = ''
  let v2 = ''

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    ;[st, st2, st7, t1, t2, t3] = await Promise.all(
      ['demo_student', 'demo_student2', 'demo_student7', 'demo_teacher', 'demo_teacher2', 'demo_teacher3'].map((u) => login(u)),
    )
  })

  test('chapter list reflects seeded progress and viewer capabilities', async () => {
    const s = (await st.get(`/projects/${seed.p1}/chapters`)).data
    assert.equal(s.term, seed.term)
    assert.equal(s.chapters.length, 7)
    assert.deepEqual(s.chapters.map((c: Json) => c.status), ['passed', 'waiting', 'not_submitted', 'not_submitted', 'not_submitted', 'not_submitted', 'not_submitted'])
    assert.equal(s.chapters[0].versions.length, 2)
    assert.equal(s.chapters[0].passCount, 2)
    assert.ok(s.chapters.every((c: Json) => c.deadline))
    assert.equal(s.canUpload, true)
    assert.equal(s.canReview, false)
    const t = (await t1.get(`/projects/${seed.p1}/chapters`)).data
    assert.equal(t.canUpload, false)
    assert.equal(t.canReview, true)
  })

  test('student uploads a chapter with a Thai file name; re-upload creates a new version', async () => {
    const r = await st.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3', note: 'ทดสอบ' }, [['file', thaiName, 'hello', 'text/plain']]))
    assert.equal(r.status, 201)
    assert.deepEqual(r.data, { chapter: 'บทที่ 3', version: 1 })
    const r2 = await st2.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3' }, [['file', 'chapter3-v2.pdf', '%PDF-1.4 v2', 'application/pdf']]))
    assert.equal(r2.status, 201)
    assert.equal(r2.data.version, 2)
    const c3 = (await t1.get(`/projects/${seed.p1}/chapters`)).data.chapters[2]
    assert.equal(c3.status, 'waiting')
    assert.deepEqual(c3.versions.map((v: Json) => v.version), [2, 1])
    assert.equal(c3.versions[1].fileName, thaiName)
    assert.equal(c3.versions[1].note, 'ทดสอบ')
    assert.equal(c3.versions[1].size, 5)
    assert.equal(c3.versions[1].uploadedBy.id, seed.users.demo_student)
    v1 = c3.versions[1].id
    v2 = c3.versions[0].id
    assert.ok((await titles(t1)).includes('เอกสารรอตรวจ: บทที่ 3 v1'))
  })

  test('disallowed file types and incomplete forms are rejected without leaving files', async () => {
    const before = ctx.storedFiles('submissions', seed.p1).length
    const aspx = await st.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3' }, [['file', 'evil.aspx', '<% %>']]))
    assert.equal(aspx.status, 400)
    assert.match(aspx.data.error, /ไม่รองรับไฟล์/)
    assert.equal((await st.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3' }, [['file', 'run.EXE', 'MZ']]))).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3' }, [['file', 'README', 'x']]))).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 3' }))).status, 400)
    const badChapter = await st.post(`/projects/${seed.p1}/submissions`, form({ chapter: 'บทที่ 9' }, [['file', 'ok.pdf', '%PDF']]))
    assert.equal(badChapter.status, 400)
    assert.ok(await waitFor(() => ctx.storedFiles('submissions', seed.p1).length === before), 'rejected upload was removed from disk')
  })

  test('teachers and outsiders cannot upload chapters', async () => {
    const fd = () => form({ chapter: 'บทที่ 4' }, [['file', 'x.pdf', '%PDF']])
    assert.equal((await t1.post(`/projects/${seed.p1}/submissions`, fd())).status, 403)
    assert.equal((await st7.post(`/projects/${seed.p1}/submissions`, fd())).status, 403)
    assert.equal((await anon.post(`/projects/${seed.p1}/submissions`, fd())).status, 401)
  })

  test('downloading needs login and project access; non-PDF view is still an attachment', async () => {
    assert.equal((await anon.raw('GET', `/submissions/${v1}/download`)).status, 401)
    assert.equal((await st7.raw('GET', `/submissions/${v1}/download`)).status, 403)
    const dl = await t1.raw('GET', `/submissions/${v1}/download`)
    assert.equal(dl.status, 200)
    assert.equal(dl.text, 'hello')
    const cd = dl.headers.get('content-disposition') ?? ''
    assert.match(cd, /^attachment/)
    assert.ok(cd.includes(`filename*=UTF-8''${encodeURIComponent(thaiName)}`), cd)
    const view = await st.raw('GET', `/submissions/${v1}/view`)
    assert.equal(view.status, 200)
    assert.match(view.headers.get('content-disposition') ?? '', /^attachment/)
    assert.equal(view.headers.get('x-content-type-options'), 'nosniff')
  })

  test('review rules: members only, comment required for revise, latest version only', async () => {
    const noComment = await t1.post(`/submissions/${v2}/review`, { verdict: 'revise' })
    assert.equal(noComment.status, 400)
    assert.equal((await t1.post(`/submissions/${v2}/review`, { verdict: 'maybe' })).status, 400)
    assert.equal((await t3.post(`/submissions/${v2}/review`, { verdict: 'pass' })).status, 403)
    assert.equal((await st.post(`/submissions/${v2}/review`, { verdict: 'pass' })).status, 403)
    const old = await t1.post(`/submissions/${v1}/review`, { verdict: 'pass' })
    assert.equal(old.status, 400)
    assert.match(old.data.error, /เวอร์ชันใหม่/)
  })

  test('reviewing again replaces the teacher\'s own review; any revise marks the chapter revise', async () => {
    assert.equal((await t1.post(`/submissions/${v2}/review`, { verdict: 'pass', comment: 'ok' })).status, 204)
    let c3 = (await st.get(`/projects/${seed.p1}/chapters`)).data.chapters[2]
    assert.equal(c3.status, 'passed')
    assert.equal(c3.passCount, 1)
    assert.ok((await titles(st)).some((t) => t.includes('ให้ผ่าน บทที่ 3')))

    assert.equal((await t1.post(`/submissions/${v2}/review`, { verdict: 'revise', comment: 'แก้ตารางที่ 3.1' })).status, 204)
    assert.equal((await t2.post(`/submissions/${v2}/review`, { verdict: 'pass' })).status, 204)
    c3 = (await st.get(`/projects/${seed.p1}/chapters`)).data.chapters[2]
    assert.equal(c3.versions[0].reviews.length, 2)
    const mine = c3.versions[0].reviews.find((r: Json) => r.reviewer.id === seed.users.demo_teacher)
    assert.equal(mine.verdict, 'revise')
    assert.equal(mine.comment, 'แก้ตารางที่ 3.1')
    assert.equal(c3.status, 'revise')
    assert.ok((await titles(st2)).some((t) => t.includes('ขอให้แก้ไข บทที่ 3')))
  })
})

// ===================================================================================
describe('project files', () => {
  let seed: Seed
  let st: Client, st7: Client, t1: Client
  const pdfName = 'แผนงาน.pdf'

  before(async () => {
    seed = await ctx.reset()
    ;[st, st7, t1] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher'].map((u) => login(u)))
  })

  const list = async (c: Client, pid: string) => (await c.get(`/projects/${pid}/files`)).data.files as Json[]

  test('student uploads several files at once (Thai names kept)', async () => {
    const r = await st.post(`/projects/${seed.p1}/files`, form({}, [['files', pdfName, '%PDF-1.4 plan'], ['files', 'notes.txt', 'v1']]))
    assert.equal(r.status, 201)
    assert.equal(r.data.count, 2)
    const names = (await list(st, seed.p1)).map((f) => f.fileName)
    assert.deepEqual(names.sort(), ['notes.txt', 'ข้อเสนอโครงงาน.pdf', pdfName].sort())
  })

  test('uploading a file with an existing name replaces it', async () => {
    const before = await list(st, seed.p1)
    assert.equal((await st.post(`/projects/${seed.p1}/files`, form({}, [['files', 'notes.txt', 'version two']]))).status, 201)
    const after = await list(st, seed.p1)
    assert.equal(after.length, before.length)
    const notes = after.find((f) => f.fileName === 'notes.txt')
    assert.equal(notes.size, 'version two'.length)
    assert.equal((await st.raw('GET', `/projects/${seed.p1}/files/${notes.id}/download`)).text, 'version two')
    const act = (await st.get(`/projects/${seed.p1}/activity`)).data.activity as Json[]
    assert.ok(act.some((a) => a.type === 'file.replace' && a.detail === 'notes.txt'))
    // ไฟล์เดิมถูกลบจากดิสก์ (เหลือ: ไฟล์ตัวอย่าง 1 + ที่อัปโหลด 2)
    assert.ok(await waitFor(() => ctx.storedFiles('files', seed.p1).length === 3))
  })

  test('rejects disallowed types and empty uploads', async () => {
    assert.equal((await st.post(`/projects/${seed.p1}/files`, form({}, [['files', 'setup.exe', 'MZ']]))).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/files`, form({}, [['files', 'page.html', '<html>']]))).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/files`, form({ note: 'x' }))).status, 400)
  })

  test('teachers (not editors) and outsiders cannot upload; outsiders cannot list in-progress files', async () => {
    assert.equal((await t1.post(`/projects/${seed.p1}/files`, form({}, [['files', 'a.pdf', '%PDF']]))).status, 403)
    assert.equal((await st7.post(`/projects/${seed.p1}/files`, form({}, [['files', 'a.pdf', '%PDF']]))).status, 403)
    assert.equal((await st7.get(`/projects/${seed.p1}/files`)).status, 403)
    assert.equal((await t1.get(`/projects/${seed.p1}/files`)).status, 200)
  })

  test('PDF view is served inline without CSP; other files download as attachment', async () => {
    const pdf = (await list(st, seed.p1)).find((f) => f.fileName === pdfName)
    const view = await t1.raw('GET', `/projects/${seed.p1}/files/${pdf.id}/view`)
    assert.equal(view.status, 200)
    assert.equal(view.headers.get('content-type'), 'application/pdf')
    assert.match(view.headers.get('content-disposition') ?? '', /^inline/)
    assert.equal(view.headers.get('content-security-policy'), null)
    assert.equal(view.text, '%PDF-1.4 plan')
    const dl = await t1.raw('GET', `/projects/${seed.p1}/files/${pdf.id}/download`)
    assert.match(dl.headers.get('content-disposition') ?? '', /^attachment/)
  })

  test('anyone logged in can read files of a passed project but cannot change them', async () => {
    const files = await list(st7, seed.p2)
    assert.equal(files.length, 1)
    assert.equal((await st7.raw('GET', `/projects/${seed.p2}/files/${files[0].id}/download`)).status, 200)
    assert.equal((await st7.del(`/projects/${seed.p2}/files/${files[0].id}`)).status, 403)
    assert.equal((await st7.post(`/projects/${seed.p2}/files`, form({}, [['files', 'x.pdf', '%PDF']]))).status, 403)
  })

  test('student deletes a file (removed from disk); a file id from another project is 404', async () => {
    const notes = (await list(st, seed.p1)).find((f) => f.fileName === 'notes.txt')
    const before = ctx.storedFiles('files', seed.p1).length
    assert.equal((await t1.del(`/projects/${seed.p1}/files/${notes.id}`)).status, 403)
    assert.equal((await st.del(`/projects/${seed.p1}/files/${notes.id}`)).status, 204)
    assert.equal((await st.del(`/projects/${seed.p1}/files/${notes.id}`)).status, 404)
    assert.ok(!(await list(st, seed.p1)).some((f) => f.fileName === 'notes.txt'))
    assert.ok(await waitFor(() => ctx.storedFiles('files', seed.p1).length === before - 1))
    const other = (await list(st, seed.p2))[0]
    assert.equal((await st.raw('GET', `/projects/${seed.p1}/files/${other.id}/download`)).status, 404)
  })
})

// ===================================================================================
describe('source codes', () => {
  let seed: Seed
  let st: Client, st7: Client, t1: Client, ad: Client
  let codeId = ''

  before(async () => {
    seed = await ctx.reset()
    ;[st, st7, t1, ad] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher', 'demo_admin'].map((u) => login(u)))
  })

  test('student adds code; fields are validated', async () => {
    assert.equal((await st.post(`/projects/${seed.p1}/codes`, { language: 'python', functionName: '', code: 'x' })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/codes`, { language: 'python', functionName: 'f', code: '' })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/codes`, { language: '', functionName: 'f', code: 'x' })).status, 400)
    const r = await st.post(`/projects/${seed.p1}/codes`, { language: 'python', functionName: 'hello', code: 'def hello():\n    print(1)\n' })
    assert.equal(r.status, 201)
    codeId = r.data.id
    const codes = (await st.get(`/projects/${seed.p1}/codes`)).data.codes as Json[]
    assert.equal(codes.length, 3)
    const c = codes.find((x) => x.id === codeId)
    assert.equal(c.lines, 3)
    assert.equal(c.githubPath, null)
    assert.equal(c.updatedBy.id, seed.users.demo_student)
  })

  test('only project students (or admin) can edit and delete code', async () => {
    const body = { language: 'python', functionName: 'hello2', code: 'print(2)' }
    assert.equal((await t1.put(`/codes/${codeId}`, body)).status, 403)
    assert.equal((await st7.put(`/codes/${codeId}`, body)).status, 403)
    assert.equal((await st.put(`/codes/${codeId}`, body)).status, 204)
    const c = (await t1.get(`/projects/${seed.p1}/codes`)).data.codes.find((x: Json) => x.id === codeId)
    assert.equal(c.functionName, 'hello2')
    assert.equal((await st.put(`/codes/${codeId}`, { ...body, code: '' })).status, 400)
  })

  test('code library: outsiders see passed projects only; admin sees everything', async () => {
    const lib = (await st7.get('/codes')).data
    assert.equal(lib.total, 3)
    assert.ok(lib.codes.every((c: Json) => c.project.id === seed.p2 || c.project.id === seed.p3))
    assert.ok(lib.codes.every((c: Json) => c.project.nameTh))
    assert.equal((await st7.get(`/codes?project=${seed.p1}`)).status, 403)
    assert.equal((await st7.get(`/codes?project=${seed.p2}`)).data.total, 2)
    assert.equal((await st7.get('/codes?lang=dart')).data.total, 1)
    assert.equal((await st7.get('/codes?q=checkOverlap')).data.total, 1)
    assert.equal((await st.get('/codes?q=recommend')).data.total, 1)
    assert.equal((await ad.get('/codes')).data.total, 6)
  })

  test('delete code', async () => {
    assert.equal((await t1.del(`/codes/${codeId}`)).status, 403)
    assert.equal((await st.del(`/codes/${codeId}`)).status, 204)
    assert.equal((await st.del(`/codes/${codeId}`)).status, 404)
    const act = (await st.get(`/projects/${seed.p1}/activity`)).data.activity as Json[]
    assert.deepEqual(new Set(act.slice(0, 3).map((a) => a.type)), new Set(['code.delete', 'code.update', 'code.add']))
  })
})

// ===================================================================================
describe('requests: teacher invitations', () => {
  let seed: Seed
  let st: Client, st7: Client, t1: Client, t2: Client, t3: Client, ad: Client
  let np = ''
  let t4 = ''

  before(async () => {
    seed = await ctx.reset()
    ;[st, st7, t1, t2, t3, ad] = await Promise.all(
      ['demo_student', 'demo_student7', 'demo_teacher', 'demo_teacher2', 'demo_teacher3', 'demo_admin'].map((u) => login(u)),
    )
  })

  test('the invited teacher sees the invite; nobody else can decide it', async () => {
    const reqs = (await t3.get('/requests')).data.requests as Json[]
    const inv = reqs.find((r) => r.type === 'teacher_invite')
    assert.ok(inv)
    assert.equal(inv.project.id, seed.p1)
    assert.equal(inv.teacherRole, 'committee')
    assert.equal(inv.requestedBy.id, seed.users.demo_student)
    assert.equal((await st.post(`/requests/${inv.id}/decision`, { approve: true })).status, 403)
    assert.equal((await t1.post(`/requests/${inv.id}/decision`, { approve: true })).status, 403)
    assert.equal((await t3.post(`/requests/${inv.id}/decision`, {})).status, 400)
    assert.ok(!((await t2.get('/requests')).data.requests as Json[]).some((r) => r.id === inv.id))
    assert.ok(((await st.get(`/projects/${seed.p1}/requests`)).data.requests as Json[]).some((r) => r.id === inv.id))
  })

  test('accepting adds the teacher to the project and notifies the students', async () => {
    const inv = ((await t3.get('/requests')).data.requests as Json[]).find((r) => r.type === 'teacher_invite')
    assert.equal((await t3.post(`/requests/${inv.id}/decision`, { approve: true })).status, 204)
    const again = await t3.post(`/requests/${inv.id}/decision`, { approve: true })
    assert.equal(again.status, 400)
    const p = (await t3.get(`/projects/${seed.p1}`)).data.project
    assert.equal(memberOf(p, seed.users.demo_teacher3).teacherRole, 'committee')
    const done = (await t3.get('/requests?status=done')).data.requests as Json[]
    assert.equal(done.find((r) => r.id === inv.id).status, 'approved')
    assert.ok((await titles(st)).some((t) => t.includes('ตอบรับคำเชิญ')))
  })

  test('advisor is unique and the 3-teacher limit counts pending invites', async () => {
    np = (await st7.post('/projects', { nameTh: 'โครงงานเชิญอาจารย์', nameEn: 'Invite Project' })).data.id
    const u = (await ad.post('/admin/users', { role: 'teacher', name: 'อาจารย์ คนที่สี่', username: 'demo_teacher4', email: 't4@demo.up.ac.th', password: PASSWORD })).data.user
    t4 = u.id
    const invite = (userId: string, role: string) => st7.post(`/projects/${np}/teachers`, { userId, role })

    assert.equal((await invite(seed.users.demo_teacher, 'advisor')).status, 204)
    const secondAdvisor = await invite(seed.users.demo_teacher2, 'advisor')
    assert.equal(secondAdvisor.status, 400)
    assert.match(secondAdvisor.data.error, /ที่ปรึกษามีได้ท่านเดียว/)
    const sameTeacher = await invite(seed.users.demo_teacher, 'committee')
    assert.equal(sameTeacher.status, 400)
    assert.match(sameTeacher.data.error, /รอตอบรับ/)
    assert.equal((await invite(seed.users.demo_teacher2, 'committee')).status, 204)
    assert.equal((await invite(seed.users.demo_teacher3, 'committee')).status, 204)
    const fourth = await invite(t4, 'committee')
    assert.equal(fourth.status, 400)
    assert.match(fourth.data.error, /ครบ 3 ท่าน/)
    assert.equal((await invite(seed.users.demo_student, 'committee')).status, 400)
    assert.equal((await invite(t4, 'chair')).status, 400)
    assert.equal((await st7.get(`/projects/${np}`)).data.project.members.length, 1)
    assert.equal((await st7.get('/projects?scope=mine')).data.projects[0].pendingInvites, 3)
  })

  test('rejecting or cancelling an invite frees the slot', async () => {
    const t1Inv = ((await t1.get('/requests')).data.requests as Json[]).find((r) => r.project.id === np)
    assert.equal((await t1.post(`/requests/${t1Inv.id}/decision`, { approve: false })).status, 204)
    assert.equal(((await t1.get('/requests?status=done')).data.requests as Json[]).find((r) => r.id === t1Inv.id).status, 'rejected')
    assert.ok((await titles(st7)).some((t) => t.includes('ปฏิเสธคำเชิญ')))

    const t3Inv = ((await st7.get(`/projects/${np}/requests`)).data.requests as Json[]).find((r) => r.target.id === seed.users.demo_teacher3 && r.status === 'pending')
    assert.equal((await t1.del(`/projects/${np}/requests/${t3Inv.id}`)).status, 403)
    assert.equal((await st7.del(`/projects/${np}/requests/${t3Inv.id}`)).status, 204)
    assert.equal((await st7.del(`/projects/${np}/requests/${t3Inv.id}`)).status, 404)
    assert.equal((await t3.post(`/requests/${t3Inv.id}/decision`, { approve: true })).status, 400)

    assert.equal((await st7.post(`/projects/${np}/teachers`, { userId: t4, role: 'advisor' })).status, 204)
  })

  test('admin adds a teacher directly, still within the limits', async () => {
    assert.equal((await ad.post(`/projects/${np}/teachers`, { userId: seed.users.demo_teacher3, role: 'committee' })).status, 204)
    const p = (await ad.get(`/projects/${np}`)).data.project
    assert.equal(memberOf(p, seed.users.demo_teacher3).teacherRole, 'committee')
    assert.ok((await titles(t3)).some((t) => t.includes('คุณถูกเพิ่มเป็นกรรมการ')))
    // อาจารย์ 1 คน + คำเชิญรอตอบรับ 2 คน (demo_teacher2, demo_teacher4) = ครบ 3
    assert.equal((await ad.post(`/projects/${np}/teachers`, { userId: seed.users.demo_teacher, role: 'committee' })).status, 400)
  })

  test('student removes a teacher from a pending project', async () => {
    assert.equal((await st7.del(`/projects/${np}/teachers/${seed.users.demo_teacher3}`)).status, 204)
    assert.equal(memberOf((await ad.get(`/projects/${np}`)).data.project, seed.users.demo_teacher3), undefined)
    assert.equal((await st7.del(`/projects/${np}/teachers/${seed.users.demo_teacher3}`)).status, 404)
    assert.ok((await titles(t3)).some((t) => t.includes('นำออกจากโครงงาน')))
  })
})

// ===================================================================================
describe('requests: rename and member changes need the advisor', () => {
  let seed: Seed
  let st: Client, st2: Client, st7: Client, t1: Client, t2: Client, ad: Client
  const newName = 'ระบบแนะนำรายวิชาเลือกอัจฉริยะด้วยการเรียนรู้ของเครื่อง'

  before(async () => {
    seed = await ctx.reset()
    ;[st, st2, st7, t1, t2, ad] = await Promise.all(
      ['demo_student', 'demo_student2', 'demo_student7', 'demo_teacher', 'demo_teacher2', 'demo_admin'].map((u) => login(u)),
    )
  })

  const pendingRename = async (c: Client) => ((await c.get('/requests')).data.requests as Json[]).find((r) => r.type === 'rename')

  test('only the advisor sees the rename request; committee and students cannot decide it', async () => {
    const r = await pendingRename(t1)
    assert.ok(r)
    assert.equal(r.nameTh, newName)
    assert.equal(r.oldNameTh, 'ระบบแนะนำรายวิชาเลือกด้วยการเรียนรู้ของเครื่อง')
    assert.equal(await pendingRename(t2), undefined)
    const committee = await t2.post(`/requests/${r.id}/decision`, { approve: true })
    assert.equal(committee.status, 403)
    assert.match(committee.data.error, /อาจารย์ที่ปรึกษา/)
    assert.equal((await st.post(`/requests/${r.id}/decision`, { approve: true })).status, 403)
  })

  test('advisor approves the rename', async () => {
    const r = await pendingRename(t1)
    assert.equal((await t1.post(`/requests/${r.id}/decision`, { approve: true })).status, 204)
    const p = (await st.get(`/projects/${seed.p1}`)).data.project
    assert.equal(p.nameTh, newName)
    assert.equal(p.nameEn, 'Smart Elective Course Recommendation using Machine Learning')
    assert.equal((await t1.post(`/requests/${r.id}/decision`, { approve: true })).status, 400)
    assert.ok(((await st.get(`/projects/${seed.p1}/activity`)).data.activity as Json[]).some((a) => a.type === 'project.rename'))
    assert.ok((await titles(st2)).some((t) => t.includes('อนุมัติการเปลี่ยนชื่อ')))
  })

  test('rename request rules: different name, unique, one pending at a time, students only', async () => {
    const p = (await st.get(`/projects/${seed.p1}`)).data.project
    assert.equal((await st.post(`/projects/${seed.p1}/requests/rename`, { nameTh: p.nameTh, nameEn: p.nameEn })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/requests/rename`, { nameTh: 'แอปพลิเคชันจองห้องประชุมบนมือถือ', nameEn: 'X' })).status, 400)
    assert.equal((await t1.post(`/projects/${seed.p1}/requests/rename`, { nameTh: 'ก', nameEn: 'A' })).status, 403)
    assert.equal((await st.post(`/projects/${seed.p1}/requests/rename`, { nameTh: 'ชื่อทดลอง', nameEn: 'Trial Name' })).status, 204)
    assert.ok((await titles(t1)).includes('คำขอเปลี่ยนชื่อโครงงาน'))
    const dup = await st2.post(`/projects/${seed.p1}/requests/rename`, { nameTh: 'ชื่ออื่น', nameEn: 'Other Name' })
    assert.equal(dup.status, 400)
    assert.match(dup.data.error, /รออนุมัติอยู่แล้ว/)
  })

  test('advisor rejects: the name stays the same', async () => {
    const r = await pendingRename(t1)
    assert.equal((await t1.post(`/requests/${r.id}/decision`, { approve: false })).status, 204)
    assert.equal((await st.get(`/projects/${seed.p1}`)).data.project.nameTh, newName)
    const done = (await st.get(`/projects/${seed.p1}/requests`)).data.requests as Json[]
    assert.equal(done.find((x) => x.id === r.id).status, 'rejected')
  })

  test('a project without an advisor sends requests to the admin', async () => {
    const np = (await st7.post('/projects', { nameTh: 'โครงงานไม่มีที่ปรึกษา', nameEn: 'No Advisor Project' })).data.id
    assert.equal((await st7.post(`/projects/${np}/requests/rename`, { nameTh: 'โครงงานไม่มีที่ปรึกษา 2', nameEn: 'No Advisor Project 2' })).status, 204)
    assert.ok((await titles(ad)).includes('คำขอเปลี่ยนชื่อโครงงาน'))
    const r = ((await ad.get('/requests')).data.requests as Json[]).find((x) => x.project.id === np)
    assert.ok(r)
    assert.equal((await t1.post(`/requests/${r.id}/decision`, { approve: true })).status, 403)
    assert.equal((await ad.post(`/requests/${r.id}/decision`, { approve: true })).status, 204)
    assert.equal((await st7.get(`/projects/${np}`)).data.project.nameTh, 'โครงงานไม่มีที่ปรึกษา 2')
  })

  test('removing a partner needs the advisor\'s approval', async () => {
    assert.equal((await st.post(`/projects/${seed.p1}/requests/member`, { action: 'remove', targetId: seed.users.demo_student })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/requests/member`, { action: 'change', targetId: seed.users.demo_student2 })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/requests/member`, { action: 'remove', targetId: seed.users.demo_teacher })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/requests/member`, { action: 'remove', targetId: seed.users.demo_student2 })).status, 204)
    assert.equal((await st.post(`/projects/${seed.p1}/requests/member`, { action: 'remove', targetId: seed.users.demo_student2 })).status, 400)
    const r = ((await t1.get('/requests')).data.requests as Json[]).find((x) => x.type === 'member_remove')
    assert.equal(r.target.id, seed.users.demo_student2)
    assert.equal((await t2.post(`/requests/${r.id}/decision`, { approve: true })).status, 403)
    assert.equal((await t1.post(`/requests/${r.id}/decision`, { approve: true })).status, 204)
    const p = (await st.get(`/projects/${seed.p1}`)).data.project
    assert.deepEqual(p.members.filter((m: Json) => m.kind === 'student').map((m: Json) => m.user.id), [seed.users.demo_student])
    assert.equal((await st2.get('/projects?scope=mine')).data.projects.length, 0)
    assert.equal((await st2.get(`/projects/${seed.p1}`)).status, 403)
  })
})

// ===================================================================================
describe('voting: pass / fail / resubmit', () => {
  let seed: Seed
  let anon: Client, st: Client, st6: Client, st7: Client, t1: Client, t2: Client, t3: Client

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    ;[st, st6, st7, t1, t2, t3] = await Promise.all(
      ['demo_student', 'demo_student6', 'demo_student7', 'demo_teacher', 'demo_teacher2', 'demo_teacher3'].map((u) => login(u)),
    )
  })

  test('teacher votes once; students, outsiders and bad values are rejected', async () => {
    assert.equal((await t2.post(`/projects/${seed.p1}/vote`, { vote: 'maybe' })).status, 400)
    assert.equal((await t2.post(`/projects/${seed.p1}/vote`, { vote: 'pass' })).status, 204)
    const twice = await t2.post(`/projects/${seed.p1}/vote`, { vote: 'fail' })
    assert.equal(twice.status, 400)
    assert.match(twice.data.error, /ผ่านโครงงานนี้แล้ว/)
    assert.equal((await t1.post(`/projects/${seed.p1}/vote`, { vote: 'pass' })).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/vote`, { vote: 'pass' })).status, 403)
    assert.equal((await t3.post(`/projects/${seed.p1}/vote`, { vote: 'pass' })).status, 403)
    const p = (await st.get(`/projects/${seed.p1}`)).data.project
    assert.equal(p.status, 'pending')
    assert.equal(p.passCount, 2)
    assert.equal(p.statusLabel, 'ผ่าน 2/3')
    assert.ok((await titles(st)).some((t) => t.includes('ให้ผ่านโครงงาน')))
  })

  test('the confirmation form can only be printed after passing', async () => {
    const r = await st.get(`/projects/${seed.p1}/print`)
    assert.equal(r.status, 400)
    assert.equal((await st7.get(`/projects/${seed.p2}/print`)).status, 403)
  })

  test('the third pass makes the project passed', async () => {
    const inv = ((await t3.get('/requests')).data.requests as Json[]).find((r) => r.type === 'teacher_invite')
    assert.equal((await t3.post(`/requests/${inv.id}/decision`, { approve: true })).status, 204)
    assert.equal((await t3.post(`/projects/${seed.p1}/vote`, { vote: 'pass' })).status, 204)
    const p = (await st.get(`/projects/${seed.p1}`)).data.project
    assert.equal(p.status, 'passed')
    assert.equal(p.passCount, 3)
    assert.equal(p.statusLabel, 'ผ่าน 3/3')
    assert.ok(p.passedAt)
    assert.ok((await titles(st)).includes('โครงงานผ่านครบ 3/3 แล้ว'))
    assert.ok((await titles(t1)).includes('โครงงานผ่านครบ 3/3 แล้ว'))
    const print = await st.get(`/projects/${seed.p1}/print`)
    assert.equal(print.status, 200)
    assert.equal(print.data.settings.courseCode, '225492')
    assert.equal(print.data.project.status, 'passed')
    const late = await t3.post(`/projects/${seed.p1}/vote`, { vote: 'fail' })
    assert.equal(late.status, 400)
  })

  test('a passed project is visible to everyone, without contact details', async () => {
    const r = await st7.get(`/projects/${seed.p1}`)
    assert.equal(r.status, 200)
    assert.ok(r.data.project.members.every((m: Json) => m.user.email === undefined))
    const pub = (await anon.get('/public/projects')).data
    assert.equal(pub.total, 3)
    assert.equal(pub.projects[0].id, seed.p1)
    assert.equal((await st7.get('/projects?scope=library')).data.total, 3)
  })

  test('students cannot remove teachers from a passed project', async () => {
    const r = await st.del(`/projects/${seed.p1}/teachers/${seed.users.demo_teacher2}`)
    assert.equal(r.status, 400)
    assert.match(r.data.error, /ผ่านแล้ว/)
  })

  test('a failed project blocks voting until the students resubmit', async () => {
    const blocked = await t1.post(`/projects/${seed.p4}/vote`, { vote: 'pass' })
    assert.equal(blocked.status, 400)
    assert.match(blocked.data.error, /ไม่ผ่านแล้ว/)
    assert.equal((await t1.get(`/projects/${seed.p4}`)).data.project.statusLabel, 'ไม่ผ่าน')
    assert.equal((await t1.post(`/projects/${seed.p4}/resubmit`)).status, 403)
    assert.equal((await st.post(`/projects/${seed.p1}/resubmit`)).status, 400)
    assert.equal((await st6.post(`/projects/${seed.p4}/resubmit`)).status, 204)
    const p = (await st6.get(`/projects/${seed.p4}`)).data.project
    assert.equal(p.status, 'pending')
    assert.equal(p.term, seed.term)
    assert.ok(p.members.filter((m: Json) => m.kind === 'teacher').every((m: Json) => m.vote === null))
    assert.equal((await st6.post(`/projects/${seed.p4}/resubmit`)).status, 400)
    assert.ok((await titles(t3)).includes('นิสิตส่งโครงงานใหม่เพื่อพิจารณา'))
    assert.equal((await t1.post(`/projects/${seed.p4}/vote`, { vote: 'pass' })).status, 204)
  })

  test('a single fail vote fails the project and emails the students', async () => {
    ctx.mailbox.length = 0
    assert.equal((await t3.post(`/projects/${seed.p4}/vote`, { vote: 'fail' })).status, 204)
    const p = (await st6.get(`/projects/${seed.p4}`)).data.project
    assert.equal(p.status, 'failed')
    assert.equal(p.passedAt, null)
    const mail = ctx.mailbox.find((m) => m.to === '65023460@demo.up.ac.th')
    assert.ok(mail, 'fail notice emailed')
    assert.match(mail.subject, /ไม่ผ่าน/)
    assert.ok(mail.text.includes(`${APP_URL}/projects/${seed.p4}`))
  })
})

// ===================================================================================
describe('comments between students and each teacher', () => {
  let seed: Seed
  let st: Client, st2: Client, st7: Client, t1: Client, t2: Client, ad: Client

  before(async () => {
    seed = await ctx.reset()
    ;[st, st2, st7, t1, t2, ad] = await Promise.all(
      ['demo_student', 'demo_student2', 'demo_student7', 'demo_teacher', 'demo_teacher2', 'demo_admin'].map((u) => login(u)),
    )
  })

  const thread = (teacher: string) => `/projects/${seed.p1}/comments/${teacher}`

  test('student posts to a teacher thread; text is validated', async () => {
    assert.equal((await st.post(thread(seed.users.demo_teacher), { text: '   ' })).status, 400)
    assert.equal((await st.post(thread(seed.users.demo_teacher), { text: 'ก'.repeat(1001) })).status, 400)
    assert.equal((await st.post(thread(seed.users.demo_teacher), { text: 'สวัสดีครับอาจารย์' })).status, 201)
    const list = (await t1.get(thread(seed.users.demo_teacher))).data.comments as Json[]
    assert.equal(list.length, 3)
    assert.equal(list.at(-1).text, 'สวัสดีครับอาจารย์')
    assert.equal(list.at(-1).author.id, seed.users.demo_student)
    assert.ok((await titles(t1)).some((t) => t.startsWith('ความเห็นจาก')))
  })

  test('only the thread teacher, the project students and admin can read it', async () => {
    assert.equal((await t2.get(thread(seed.users.demo_teacher))).status, 403)
    assert.equal((await st7.get(thread(seed.users.demo_teacher))).status, 403)
    assert.equal((await st2.get(thread(seed.users.demo_teacher))).status, 200)
    assert.equal((await ad.get(thread(seed.users.demo_teacher))).status, 200)
    assert.equal((await t2.get(thread(seed.users.demo_teacher2))).data.comments.length, 0)
    assert.equal((await t2.post(thread(seed.users.demo_teacher), { text: 'แทรก' })).status, 403)
  })

  test('teacher reply notifies all students but not the author', async () => {
    assert.equal((await t1.post(thread(seed.users.demo_teacher), { text: 'ส่งแผนงานมาด้วยครับ' })).status, 201)
    assert.ok((await titles(st)).some((t) => t.startsWith('ความเห็นจาก')))
    assert.ok((await titles(st2)).some((t) => t.startsWith('ความเห็นจาก')))
  })

  test('a thread must belong to a teacher of the project', async () => {
    assert.equal((await st.get(thread(seed.users.demo_student2))).status, 404)
    assert.equal((await st.get(thread(seed.users.demo_teacher3))).status, 404)
  })
})

// ===================================================================================
describe('chat between students and teachers', () => {
  let seed: Seed
  let st: Client, st7: Client, t1: Client, ad: Client

  before(async () => {
    seed = await ctx.reset()
    ;[st, st7, t1, ad] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher', 'demo_admin'].map((u) => login(u)))
  })

  test('student contacts: every teacher, own teachers first', async () => {
    const contacts = (await st.get('/chat/contacts')).data.contacts as Json[]
    assert.equal(contacts.length, 3)
    assert.deepEqual(contacts.map((c) => c.related), [true, true, false])
    assert.equal(contacts[2].id, seed.users.demo_teacher3)
  })

  test('teacher contacts: students of the teacher\'s projects', async () => {
    const contacts = (await t1.get('/chat/contacts')).data.contacts as Json[]
    assert.deepEqual(new Set(contacts.map((c) => c.id)), new Set(['demo_student', 'demo_student2', 'demo_student3', 'demo_student4', 'demo_student5', 'demo_student6'].map((u) => seed.users[u])))
  })

  test('send a message; text and partner are validated', async () => {
    assert.equal((await st.post(`/chat/thread/${seed.users.demo_teacher}`, { text: '' })).status, 400)
    assert.equal((await st.post(`/chat/thread/${seed.users.demo_teacher}`, { text: 'x'.repeat(1001) })).status, 400)
    assert.equal((await st.post(`/chat/thread/${seed.users.demo_student2}`, { text: 'hi' })).status, 400)
    assert.equal((await st.post(`/chat/thread/${seed.users.demo_teacher}`, { text: 'ทดสอบแชท' })).status, 201)
  })

  test('unread counts and reading a thread', async () => {
    const conv = (await t1.get('/chat/conversations')).data.conversations as Json[]
    const withSt = conv.find((c) => c.user.id === seed.users.demo_student)
    assert.equal(withSt.lastText, 'ทดสอบแชท')
    assert.equal(withSt.lastMine, false)
    assert.equal(withSt.unread, 1)
    assert.equal((await t1.get('/notifications')).data.chatUnread, 2)
    const th = (await t1.get(`/chat/thread/${seed.users.demo_student}`)).data
    assert.equal(th.partner.role, 'student')
    assert.equal(th.messages.at(-1).text, 'ทดสอบแชท')
    assert.equal(th.messages.at(-1).mine, false)
    assert.equal((await t1.get('/notifications')).data.chatUnread, 1)
    const mineView = (await st.get(`/chat/thread/${seed.users.demo_teacher}`)).data
    assert.equal(mineView.messages.at(-1).mine, true)
    assert.equal(mineView.messages.at(-1).read, true)
  })

  test('teachers can only start chats with their own students (or reply to one who wrote first)', async () => {
    assert.equal((await t1.post(`/chat/thread/${seed.users.demo_student7}`, { text: 'สวัสดี' })).status, 403)
    assert.equal((await t1.get(`/chat/thread/${seed.users.demo_student7}`)).status, 403)
    assert.equal((await st7.post(`/chat/thread/${seed.users.demo_teacher}`, { text: 'ขอปรึกษาหัวข้อครับ' })).status, 201)
    assert.equal((await t1.post(`/chat/thread/${seed.users.demo_student7}`, { text: 'ได้ครับ' })).status, 201)
  })

  test('admins have no chat', async () => {
    assert.equal((await ad.get('/chat/contacts')).status, 403)
    assert.equal((await ad.post(`/chat/thread/${seed.users.demo_teacher}`, { text: 'x' })).status, 403)
    assert.equal((await ad.get('/notifications')).data.chatUnread, 0)
  })
})

// ===================================================================================
describe('notifications', () => {
  let st: Client

  before(async () => {
    await ctx.reset()
    st = await login('demo_student')
  })

  test('list newest first with unread count', async () => {
    const r = (await st.get('/notifications')).data
    assert.equal(r.unread, 2)
    assert.equal(r.items.length, 2)
    assert.ok(new Date(r.items[0].createdAt) > new Date(r.items[1].createdAt))
    assert.ok(r.items.every((n: Json) => n.read === false))
  })

  test('mark one as read, then all', async () => {
    const items = (await st.get('/notifications')).data.items as Json[]
    assert.equal((await st.post('/notifications/read', { id: items[0].id })).status, 204)
    let r = (await st.get('/notifications')).data
    assert.equal(r.unread, 1)
    assert.equal(r.items[0].read, true)
    assert.equal((await st.post('/notifications/read', { id: 'bad-id' })).status, 404)
    assert.equal((await st.post('/notifications/read')).status, 204)
    r = (await st.get('/notifications')).data
    assert.equal(r.unread, 0)
  })

  test('users cannot mark other users\' notifications', async () => {
    const t1 = await login('demo_teacher')
    const theirs = (await t1.get('/notifications')).data
    assert.ok(theirs.unread > 0)
    for (const n of theirs.items as Json[]) await st.post('/notifications/read', { id: n.id })
    assert.equal((await t1.get('/notifications')).data.unread, theirs.unread)
  })
})

// ===================================================================================
describe('admin: user management', () => {
  let seed: Seed
  let ad: Client
  let newId = ''

  before(async () => {
    seed = await ctx.reset()
    ad = await login('demo_admin')
  })

  test('lists users with role counts, project counts and filters', async () => {
    const r = (await ad.get('/admin/users')).data
    assert.equal(r.total, 11)
    assert.deepEqual(r.counts, { admin: 1, teacher: 3, student: 7 })
    assert.equal(r.users.find((u: Json) => u.username === 'demo_teacher').projects, 4)
    assert.equal(r.users.find((u: Json) => u.username === 'demo_student7').projects, 0)
    assert.ok(r.users.every((u: Json) => !('passwordHash' in u)))
    assert.equal((await ad.get('/admin/users?role=teacher')).data.total, 3)
    assert.equal((await ad.get('/admin/users?q=demo_student')).data.total, 7)
    assert.equal((await ad.get('/admin/users?q=65023460')).data.users[0].username, 'demo_student6')
    assert.equal((await ad.get('/admin/users?role=guest')).status, 400)
  })

  test('creates users; validates and enforces unique fields', async () => {
    const body = { role: 'teacher', name: 'อาจารย์ ใหม่', username: 'new_teacher', email: 'New.Teacher@demo.up.ac.th', studentId: '12345678', password: 'abcdef' }
    const r = await ad.post('/admin/users', body)
    assert.equal(r.status, 201)
    newId = r.data.user.id
    assert.equal(r.data.user.role, 'teacher')
    assert.equal(r.data.user.studentId, '')
    assert.equal(r.data.user.email, 'new.teacher@demo.up.ac.th')
    assert.equal((await ad.post('/admin/users', { ...body, email: 'other@demo.up.ac.th' })).status, 400)
    assert.equal((await ad.post('/admin/users', { ...body, username: 'other', email: 'NEW.TEACHER@demo.up.ac.th' })).status, 400)
    const noSid = await ad.post('/admin/users', { role: 'student', name: 'x', username: 'nosid', email: 'nosid@demo.up.ac.th', password: 'abcdef' })
    assert.equal(noSid.status, 400)
    assert.match(noSid.data.error, /รหัสนิสิต/)
    assert.equal((await ad.post('/admin/users', { role: 'student', name: 'x', username: 'dupsid', email: 'dupsid@demo.up.ac.th', studentId: '65023456', password: 'abcdef' })).status, 400)
    assert.equal((await ad.post('/admin/users', { ...body, username: 'u2', email: 'u2@demo.up.ac.th', role: 'root' })).status, 400)
    assert.equal((await ad.post('/admin/users', { ...body, username: 'u3', email: 'u3@demo.up.ac.th', password: '123' })).status, 400)
    await login('new_teacher', 'abcdef')
  })

  test('updates users but blocks unsafe role changes', async () => {
    const r = await ad.patch(`/admin/users/${newId}`, { name: 'อาจารย์ ใหม่ (แก้ไข)', mobile: '0820000000' })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.name, 'อาจารย์ ใหม่ (แก้ไข)')
    assert.equal((await ad.patch(`/admin/users/${newId}`, { email: 'admin@demo.up.ac.th' })).status, 400)
    assert.equal((await ad.patch(`/admin/users/${newId}`, { mobile: '0910000001' })).status, 400)
    assert.equal((await ad.patch(`/admin/users/${newId}`, { role: 'admin' })).data.user.role, 'admin')
    assert.equal((await ad.patch(`/admin/users/${newId}`, { role: 'teacher' })).data.user.role, 'teacher')
    const inProject = await ad.patch(`/admin/users/${seed.users.demo_student}`, { role: 'teacher' })
    assert.equal(inProject.status, 400)
    assert.match(inProject.data.error, /อยู่ในโครงงาน/)
    assert.equal((await ad.patch(`/admin/users/${seed.users.demo_admin}`, { role: 'teacher' })).status, 400)
    assert.equal((await ad.patch('/admin/users/000000000000000000000000', { name: 'x' })).status, 404)
  })

  test('reset password returns a temporary password and logs the user out everywhere', async () => {
    const t1 = await login('demo_teacher')
    const r = await ad.post(`/admin/users/${seed.users.demo_teacher}/reset-password`)
    assert.equal(r.status, 200)
    assert.match(r.data.password, /^[A-HJKMNP-Za-hjkmnp-z2-9]{10}$/)
    assert.equal((await t1.get('/auth/me')).data.user, null)
    assert.equal((await ctx.client().post('/auth/login', { username: 'demo_teacher', password: PASSWORD })).status, 401)
    await login('demo_teacher', r.data.password)
    const chosen = await ad.post(`/admin/users/${seed.users.demo_teacher}/reset-password`, { password: 'Chosen@1' })
    assert.equal(chosen.data.password, 'Chosen@1')
    await login('demo_teacher', 'Chosen@1')
    assert.equal((await ad.post(`/admin/users/${seed.users.demo_teacher}/reset-password`, { password: '123' })).status, 400)
  })

  test('deletes users except themselves and project members', async () => {
    assert.equal((await ad.del(`/admin/users/${newId}`)).status, 204)
    assert.equal((await ad.del(`/admin/users/${newId}`)).status, 404)
    const member = await ad.del(`/admin/users/${seed.users.demo_student}`)
    assert.equal(member.status, 400)
    assert.match(member.data.error, /อยู่ในโครงงาน/)
    assert.equal((await ad.del(`/admin/users/${seed.users.demo_admin}`)).status, 400)
    assert.equal((await ad.del(`/admin/users/${seed.users.demo_student7}`)).status, 204)
    assert.equal((await ad.get('/admin/users')).data.total, 10)
  })
})

// ===================================================================================
describe('admin: deadlines, project types, settings', () => {
  let seed: Seed
  let st: Client, ad: Client

  before(async () => {
    seed = await ctx.reset()
    ;[st, ad] = await Promise.all(['demo_student', 'demo_admin'].map((u) => login(u)))
  })

  test('deadlines list with per-term project and submission counts', async () => {
    const r = (await ad.get('/admin/deadlines')).data
    assert.equal(r.currentTerm, seed.term)
    assert.equal(r.deadlines.length, 7)
    const ch1 = r.deadlines.find((d: Json) => d.chapter === 'บทที่ 1')
    assert.equal(ch1.term, seed.term)
    assert.equal(ch1.projects, 2)
    assert.equal(ch1.submitted, 2)
    assert.ok(r.terms.includes(seed.term) && r.terms.includes(seed.lastTerm))
  })

  test('deadline upsert updates the same term+chapter and creates new ones', async () => {
    assert.equal((await ad.put('/admin/deadlines', { term: seed.term, chapter: 'บทที่ 3', date: '2030-12-01', note: 'เลื่อน' })).status, 204)
    let list = (await ad.get('/admin/deadlines')).data.deadlines as Json[]
    assert.equal(list.length, 7)
    const ch3 = list.find((d) => d.term === seed.term && d.chapter === 'บทที่ 3')
    assert.equal(ch3.dueDate, '2030-12-01T16:59:59.000Z')
    assert.equal(ch3.note, 'เลื่อน')
    const chapters = (await st.get(`/projects/${seed.p1}/chapters`)).data.chapters as Json[]
    assert.equal(chapters[2].deadline.note, 'เลื่อน')

    assert.equal((await ad.put('/admin/deadlines', { term: '2599/1', chapter: 'บทที่ 1', date: '2031-01-15' })).status, 204)
    list = (await ad.get('/admin/deadlines')).data.deadlines
    assert.equal(list.length, 8)
    for (const bad of [
      { term: '2599/4', chapter: 'บทที่ 1', date: '2031-01-15' },
      { term: '69/1', chapter: 'บทที่ 1', date: '2031-01-15' },
      { term: '2599/1', chapter: 'บทที่ 8', date: '2031-01-15' },
      { term: '2599/1', chapter: 'บทที่ 1', date: '15/01/2031' },
      { term: '2599/1', chapter: 'บทที่ 1', date: '2031-13-45' },
    ]) {
      assert.equal((await ad.put('/admin/deadlines', bad)).status, 400, JSON.stringify(bad))
    }
    const added = list.find((d) => d.term === '2599/1')
    assert.equal((await ad.del(`/admin/deadlines/${added.id}`)).status, 204)
    assert.equal((await ad.get('/admin/deadlines')).data.deadlines.length, 7)
  })

  test('project types: add, rename, unique names, used types cannot be deleted, Other stays last', async () => {
    const before = (await ad.get('/admin/types')).data.types as Json[]
    assert.equal(before.length, 8)
    assert.equal(before.find((t) => t.name === 'AI').used, 1)
    const add = await ad.post('/admin/types', { name: 'Cyber Security' })
    assert.equal(add.status, 201)
    assert.equal((await ad.post('/admin/types', { name: 'cyber security' })).status, 400)
    assert.equal((await ad.post('/admin/types', { name: '' })).status, 400)
    const names = ((await st.get('/meta')).data.types as Json[]).map((t) => t.name)
    assert.equal(names.length, 9)
    assert.equal(names.at(-1), 'Other')
    assert.equal(names.at(-2), 'Cyber Security')
    assert.equal((await ad.patch(`/admin/types/${add.data.id}`, { name: 'ai' })).status, 400)
    assert.equal((await ad.patch(`/admin/types/${add.data.id}`, { name: 'Cybersecurity' })).status, 204)
    assert.ok(((await ad.get('/admin/types')).data.types as Json[]).some((t) => t.name === 'Cybersecurity'))
    const used = await ad.del(`/admin/types/${seed.types.AI}`)
    assert.equal(used.status, 400)
    assert.equal((await ad.del(`/admin/types/${add.data.id}`)).status, 204)
    assert.equal((await ad.get('/admin/types')).data.types.length, 8)
  })

  test('settings for the confirmation form', async () => {
    const s = (await ad.get('/admin/settings')).data.settings
    assert.equal(s.courseCode, '225492')
    assert.equal(s.chairName, 'อาจารย์ ประธาน หลักสูตร')
    assert.ok(!('_id' in s) && !('key' in s))
    assert.equal((await ad.put('/admin/settings', { ...s, courseCode: '225499', chairName: 'ผศ. ประธาน ใหม่' })).status, 204)
    const after = (await ad.get('/admin/settings')).data.settings
    assert.equal(after.courseCode, '225499')
    assert.equal(after.chairName, 'ผศ. ประธาน ใหม่')
    assert.equal((await ad.put('/admin/settings', { ...s, courseCode: 'x'.repeat(21) })).status, 400)
    const { chairTitle: _omit, ...missing } = s
    assert.equal((await ad.put('/admin/settings', missing)).status, 400)
  })
})

// ===================================================================================
describe('public showcase (no login)', () => {
  let seed: Seed
  let anon: Client, st7: Client
  let privateValues: string[] = []

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    st7 = await login('demo_student7')
    const ad = await login('demo_admin')
    const users = (await ad.get('/admin/users?pageSize=200')).data.users as Json[]
    privateValues = users.flatMap((u) => [u.email, u.mobile, u.studentId]).filter((v: string) => v)
  })

  const assertNoPrivateData = (data: unknown) => {
    const json = JSON.stringify(data)
    for (const v of privateValues) assert.ok(!json.includes(v), `public JSON leaks ${v}`)
    for (const key of ['"email"', '"mobile"', '"studentId"', '"passwordHash"']) assert.ok(!json.includes(key), `public JSON has ${key}`)
  }

  test('config and meta', async () => {
    // นอกโหมดเดโม ไม่แสดงบัญชีทดสอบ
    assert.deepEqual((await anon.get('/public/config')).data, { mailEnabled: true, demo: null })
    const m = (await anon.get('/public/meta')).data
    assert.equal(m.total, 2)
    assert.deepEqual(m.terms, [seed.lastTerm])
    assert.equal(m.types.at(-1).name, 'Other')
  })

  test('list shows only passed projects and no personal data', async () => {
    const r = await anon.get('/public/projects')
    assert.equal(r.status, 200)
    assert.equal(r.data.total, 2)
    assert.deepEqual(new Set(r.data.projects.map((p: Json) => p.id)), new Set([seed.p2, seed.p3]))
    assertNoPrivateData(r.data)
    const p2 = r.data.projects.find((p: Json) => p.id === seed.p2)
    assert.deepEqual(p2.students, ['นายณัฐพล อินทร์แก้ว', 'นางสาวศิริพร ทองดี'])
    assert.equal(p2.advisor, 'ผศ.ดร. วิภา รักเรียน')
    assert.equal(p2.committee.length, 2)
    assert.equal(p2.hasBook, true)
    assert.equal(p2.codeCount, 2)
    assert.ok(p2.abstract.length > 0 && p2.abstract.length <= 220)
    assert.ok(p2.coverImage)
  })

  test('detail of a passed project, still without personal data', async () => {
    const r = await anon.get(`/public/projects/${seed.p2}`)
    assert.equal(r.status, 200)
    assert.equal(r.data.loggedIn, false)
    assert.equal(r.data.chapters.length, 6)
    assert.ok(r.data.chapters.every((c: Json) => c.isPdf))
    assert.equal(r.data.files.length, 1)
    assert.equal(r.data.codes.length, 2)
    assert.deepEqual(r.data.showcase.keywords, ['Flutter', 'Firebase', 'ระบบจอง', 'Mobile'])
    assertNoPrivateData(r.data)
    assert.equal((await st7.get(`/public/projects/${seed.p2}`)).data.loggedIn, true)
  })

  test('in-progress and failed projects are not public', async () => {
    assert.equal((await anon.get(`/public/projects/${seed.p1}`)).status, 404)
    assert.equal((await anon.get(`/public/projects/${seed.p4}`)).status, 404)
    assert.equal((await anon.get('/public/projects/not-an-id')).status, 404)
  })

  test('opening documents needs login; logged-in users get PDFs inline', async () => {
    const det = (await anon.get(`/public/projects/${seed.p2}`)).data
    const file = det.files[0]
    const book = det.chapters.find((c: Json) => c.chapter === 'เล่มสมบูรณ์')
    assert.equal((await anon.raw('GET', `/projects/${seed.p2}/files/${file.id}/view`)).status, 401)
    assert.equal((await anon.raw('GET', `/submissions/${book.id}/view`)).status, 401)
    for (const url of [`/projects/${seed.p2}/files/${file.id}/view`, `/submissions/${book.id}/view`]) {
      const v = await st7.raw('GET', url)
      assert.equal(v.status, 200, url)
      assert.equal(v.headers.get('content-type'), 'application/pdf')
      assert.match(v.headers.get('content-disposition') ?? '', /^inline; filename\*=UTF-8''/)
      assert.equal(v.headers.get('content-security-policy'), null)
      assert.equal(v.headers.get('x-content-type-options'), 'nosniff')
      assert.ok(v.body.subarray(0, 5).equals(Buffer.from('%PDF-')))
    }
  })

  test('cover images are public for passed projects only', async () => {
    const p2 = ((await anon.get('/public/projects')).data.projects as Json[]).find((p) => p.id === seed.p2)
    const img = await anon.raw('GET', `/public/projects/${seed.p2}/images/${p2.coverImage}`)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
    assert.ok(img.body.subarray(1, 4).equals(Buffer.from('PNG')))
    assert.equal((await anon.raw('GET', `/public/projects/${seed.p1}/images/${p2.coverImage}`)).status, 404)
    assert.equal((await anon.raw('GET', `/public/projects/${seed.p2}/images/000000000000000000000000`)).status, 404)
  })

  test('search, type filter and pagination', async () => {
    assert.equal((await anon.get('/public/projects?q=Flutter')).data.total, 1)
    assert.equal((await anon.get(`/public/projects?q=${encodeURIComponent('วิภา')}`)).data.total, 2)
    assert.equal((await anon.get(`/public/projects?q=${encodeURIComponent('แนะนำรายวิชา')}`)).data.total, 0)
    assert.equal((await anon.get(`/public/projects?type=${seed.types.Game}`)).data.projects[0].id, seed.p3)
    assert.equal((await anon.get('/public/projects?type=none')).data.total, 0)
    assert.equal((await anon.get(`/public/projects?term=${encodeURIComponent(seed.term)}`)).data.total, 0)
    const page1 = (await anon.get('/public/projects?pageSize=1')).data
    const page2 = (await anon.get('/public/projects?pageSize=1&page=2')).data
    assert.equal(page1.projects.length, 1)
    assert.equal(page1.total, 2)
    assert.notEqual(page1.projects[0].id, page2.projects[0].id)
    assert.equal((await anon.get('/public/projects?pageSize=61')).status, 400)
  })
})

// ===================================================================================
describe('forgot / reset password', () => {
  let anon: Client
  const email = '65023460@demo.up.ac.th'
  const tokenOf = (to: string) => {
    const mail = [...ctx.mailbox].reverse().find((m) => m.to === to)
    return mail?.text.match(/reset-password\?token=([\w-]+)/)?.[1]
  }

  before(async () => {
    await ctx.reset()
    anon = ctx.client()
  })

  test('responds 204 for unknown accounts without sending mail; empty input is 400', async () => {
    assert.equal((await anon.post('/auth/forgot', { login: '' })).status, 400)
    ctx.mailbox.length = 0
    assert.equal((await anon.post('/auth/forgot', { login: 'nobody@nowhere.th' })).status, 204)
    assert.equal(ctx.mailbox.length, 0)
  })

  test('sends a reset link by email (lookup by email or username)', async () => {
    assert.equal((await anon.post('/auth/forgot', { login: email.toUpperCase() })).status, 204)
    assert.equal(ctx.mailbox.length, 1)
    const mail = ctx.mailbox[0]
    assert.equal(mail.to, email)
    assert.match(mail.subject, /ตั้งรหัสผ่านใหม่/)
    assert.ok(mail.text.includes(`${APP_URL}/reset-password?token=`))
    assert.ok(mail.html.includes('demo_student6'))
    assert.ok(tokenOf(email))
    assert.equal((await anon.post('/auth/forgot', { login: 'demo_student5' })).status, 204)
    assert.ok(tokenOf('64021003@demo.up.ac.th'))
  })

  test('a newer link invalidates the older one', async () => {
    const older = tokenOf('64021003@demo.up.ac.th')!
    assert.equal((await anon.post('/auth/forgot', { login: 'demo_student5' })).status, 204)
    const newer = tokenOf('64021003@demo.up.ac.th')!
    assert.notEqual(older, newer)
    assert.equal((await anon.post('/auth/reset', { token: older, password: 'Whatever1' })).status, 400)
    assert.equal((await anon.post('/auth/reset', { token: newer, password: 'Whatever1' })).status, 204)
  })

  test('reset: single-use token, logs out old sessions, new password works', async () => {
    const old = await login('demo_student6')
    const token = tokenOf(email)!
    assert.equal((await anon.post('/auth/reset', { token: 'x'.repeat(43), password: 'NewPass@1' })).status, 400)
    assert.equal((await anon.post('/auth/reset', { token: 'short', password: 'NewPass@1' })).status, 400)
    assert.equal((await anon.post('/auth/reset', { token, password: '123' })).status, 400)
    assert.equal((await anon.post('/auth/reset', { token, password: 'NewPass@1' })).status, 204)
    assert.equal((await anon.post('/auth/reset', { token, password: 'Other@123' })).status, 400)
    assert.equal((await old.get('/auth/me')).data.user, null)
    assert.equal((await ctx.client().post('/auth/login', { username: 'demo_student6', password: PASSWORD })).status, 401)
    const fresh = await login('demo_student6', 'NewPass@1')
    assert.equal((await fresh.get('/auth/me')).data.user.username, 'demo_student6')
  })

  test('requests are rate limited per IP', async () => {
    // ลิมิต 10 ครั้ง/15 นาที นับรวมคำขอในเทสต์ก่อนหน้า
    let limited = false
    for (let i = 0; i < 11 && !limited; i++) {
      const r = await anon.post('/auth/forgot', { login: 'nobody' })
      if (r.status === 429) limited = true
      else assert.equal(r.status, 204)
    }
    assert.ok(limited, 'eventually answered 429')
  })
})

// ===================================================================================
describe('email notification opt-out', () => {
  let seed: Seed
  let st: Client, t1: Client
  const s1Mail = '65023456@demo.up.ac.th'
  const s2Mail = '65023457@demo.up.ac.th'

  before(async () => {
    seed = await ctx.reset()
    ;[st, t1] = await Promise.all(['demo_student', 'demo_teacher'].map((u) => login(u)))
  })

  const comment = (text: string) => t1.post(`/projects/${seed.p1}/comments/${seed.users.demo_teacher}`, { text })

  test('notifications are emailed by default', async () => {
    assert.equal((await st.get('/auth/profile')).data.user.emailNotifications, true)
    ctx.mailbox.length = 0
    assert.equal((await comment('ความเห็นที่ 1')).status, 201)
    assert.deepEqual(ctx.mailbox.map((m) => m.to).sort(), [s1Mail, s2Mail])
    assert.ok(ctx.mailbox[0].text.includes(`${APP_URL}/projects/${seed.p1}/comments/${seed.users.demo_teacher}`))
  })

  test('opting out stops emails but keeps in-app notifications', async () => {
    const r = await st.put('/auth/profile', { name: 'นายกิตติ ศรีสุข', mobile: '0910000001', emailNotifications: false })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.emailNotifications, false)
    ctx.mailbox.length = 0
    assert.equal((await comment('ความเห็นที่ 2')).status, 201)
    assert.deepEqual(ctx.mailbox.map((m) => m.to), [s2Mail])
    const items = (await st.get('/notifications')).data.items as Json[]
    assert.equal(items[0].detail, 'ความเห็นที่ 2')
  })

  test('profile update without the flag keeps the setting; it can be turned back on', async () => {
    assert.equal((await st.put('/auth/profile', { name: 'นายกิตติ ศรีสุข', mobile: '0910000001' })).data.user.emailNotifications, false)
    assert.equal((await st.put('/auth/profile', { name: 'นายกิตติ ศรีสุข', mobile: '0910000001', emailNotifications: true })).data.user.emailNotifications, true)
    ctx.mailbox.length = 0
    await comment('ความเห็นที่ 3')
    assert.ok(ctx.mailbox.some((m) => m.to === s1Mail))
  })
})

// ===================================================================================
describe('pagination', () => {
  let st: Client, ad: Client

  before(async () => {
    await ctx.reset()
    ;[st, ad] = await Promise.all(['demo_student', 'demo_admin'].map((u) => login(u)))
  })

  test('projects', async () => {
    const p1 = (await ad.get('/projects?scope=all&page=1&pageSize=2')).data
    assert.equal(p1.projects.length, 2)
    assert.equal(p1.total, 4)
    assert.equal(p1.page, 1)
    assert.equal(p1.pageSize, 2)
    const p2 = (await ad.get('/projects?scope=all&page=2&pageSize=3')).data
    assert.equal(p2.projects.length, 1)
    assert.equal(p2.total, 4)
    const all = (await ad.get('/projects?scope=all&pageSize=100')).data.projects.map((p: Json) => p.id)
    const pages = [...(await ad.get('/projects?scope=all&pageSize=2')).data.projects, ...(await ad.get('/projects?scope=all&pageSize=2&page=2')).data.projects]
    assert.deepEqual(pages.map((p: Json) => p.id), all)
    assert.equal((await ad.get('/projects?scope=all&pageSize=101')).status, 400)
    assert.equal((await ad.get('/projects?scope=all&page=0')).status, 400)
    const mine = (await st.get('/projects?scope=mine&pageSize=1')).data
    assert.equal(mine.page, 1)
    assert.equal(mine.pageSize, mine.total)
  })

  test('filters combine with totals', async () => {
    assert.equal((await ad.get('/projects?scope=all&status=passed')).data.total, 2)
    assert.equal((await ad.get('/projects?scope=all&status=failed')).data.total, 1)
    assert.equal((await ad.get('/projects?scope=all&status=partial')).data.total, 1)
    assert.equal((await ad.get('/projects?scope=all&status=pending')).data.total, 0)
    assert.equal((await ad.get('/projects?scope=all&type=none')).data.total, 0)
    assert.equal((await ad.get(`/projects?scope=all&q=${encodeURIComponent('สมชาย')}`)).data.total, 4)
  })

  test('admin users', async () => {
    const u = (await ad.get('/admin/users?pageSize=5')).data
    assert.equal(u.users.length, 5)
    assert.equal(u.total, 11)
    assert.equal((await ad.get('/admin/users?pageSize=5&page=3')).data.users.length, 1)
    assert.equal((await ad.get('/admin/users?pageSize=201')).status, 400)
  })

  test('code library', async () => {
    const c = (await ad.get('/codes?pageSize=2')).data
    assert.equal(c.codes.length, 2)
    assert.equal(c.total, 5)
    assert.equal((await ad.get('/codes?pageSize=2&page=3')).data.codes.length, 1)
  })
})

// ===================================================================================
describe('showcase editing', () => {
  let seed: Seed
  let anon: Client, st: Client, st7: Client, t1: Client, ad: Client
  const png = tinyPng(4)
  const png2 = tinyPng(6, [27, 175, 122])
  const valid = { abstract: 'ระบบแนะนำรายวิชาเลือก', keywords: ['ML', 'Python', 'ML'], demoUrl: 'https://example.com/demo', videoUrl: '' }

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    ;[st, st7, t1, ad] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher', 'demo_admin'].map((u) => login(u)))
  })

  const url = () => `/projects/${seed.p1}/showcase`

  test('project DTO includes an empty showcase', async () => {
    const p = (await st.get(`/projects/${seed.p1}`)).data.project
    assert.deepEqual(p.showcase, { abstract: '', keywords: [], demoUrl: '', videoUrl: '', images: [] })
  })

  test('rejects unsafe links and oversized fields', async () => {
    for (const patch of [
      { demoUrl: 'javascript:alert(1)' },
      { videoUrl: 'JAVASCRIPT:alert(1)' },
      { demoUrl: 'ftp://example.com/file' },
      { demoUrl: 'example.com' },
      { keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) },
      { keywords: ['x'.repeat(41)] },
      { keywords: [''] },
      { abstract: 'ก'.repeat(3001) },
    ]) {
      const r = await st.put(url(), { ...valid, ...patch })
      assert.equal(r.status, 400, JSON.stringify(patch).slice(0, 80))
    }
  })

  test('saves abstract, de-duplicated keywords and links', async () => {
    const r = await st.put(url(), valid)
    assert.equal(r.status, 200)
    assert.deepEqual(r.data.showcase.keywords, ['ML', 'Python'])
    assert.equal(r.data.showcase.demoUrl, 'https://example.com/demo')
    assert.equal((await t1.get(`/projects/${seed.p1}`)).data.project.showcase.abstract, valid.abstract)
  })

  test('only project students and admin can edit', async () => {
    assert.equal((await t1.put(url(), valid)).status, 403)
    assert.equal((await st7.put(url(), valid)).status, 403)
    assert.equal((await anon.put(url(), valid)).status, 401)
    assert.equal((await ad.put(url(), { ...valid, keywords: ['Admin'] })).status, 200)
    assert.equal((await st.put(url(), valid)).status, 200)
  })

  let images: Json[] = []

  test('uploads images (png/jpg/webp only)', async () => {
    const r = await st.post(`${url()}/images`, form({}, [['images', 'ภาพ1.png', png, 'image/png'], ['images', 'ภาพ2.png', png2, 'image/png']]))
    assert.equal(r.status, 201)
    assert.equal(r.data.skipped, 0)
    images = r.data.showcase.images
    assert.deepEqual(images.map((i) => i.fileName), ['ภาพ1.png', 'ภาพ2.png'])
    const gif = await st.post(`${url()}/images`, form({}, [['images', 'anim.gif', 'GIF89a', 'image/gif']]))
    assert.equal(gif.status, 400)
    assert.match(gif.data.error, /\.jpg \.png \.webp/)
    assert.equal((await st.post(`${url()}/images`, form({}, [['images', 'vector.svg', '<svg/>', 'image/svg+xml']]))).status, 400)
    assert.equal((await st.post(`${url()}/images`, form({}))).status, 400)
    assert.equal((await t1.post(`${url()}/images`, form({}, [['images', 'x.png', png, 'image/png']]))).status, 403)
    assert.equal(ctx.storedFiles('images', seed.p1).length, 2)
  })

  test('set cover moves the image to the front', async () => {
    const second = images[1].id
    const r = await st.post(`${url()}/images/${second}/cover`)
    assert.equal(r.status, 200)
    assert.deepEqual(r.data.showcase.images.map((i: Json) => i.id), [second, images[0].id])
    assert.equal((await st.post(`${url()}/images/000000000000000000000000/cover`)).status, 404)
  })

  test('members can view images; outsiders and the public cannot while in progress', async () => {
    const second = images[1].id
    const v = await t1.raw('GET', `${url()}/images/${second}`)
    assert.equal(v.status, 200)
    assert.equal(v.headers.get('content-type'), 'image/png')
    assert.ok(v.body.equals(png2))
    assert.equal((await st7.raw('GET', `${url()}/images/${second}`)).status, 403)
    assert.equal((await anon.raw('GET', `/public/projects/${seed.p1}/images/${second}`)).status, 404)
  })

  test('delete an image (file removed from disk)', async () => {
    const second = images[1].id
    assert.equal((await t1.del(`${url()}/images/${second}`)).status, 403)
    const r = await st.del(`${url()}/images/${second}`)
    assert.equal(r.status, 200)
    assert.deepEqual(r.data.showcase.images.map((i: Json) => i.id), [images[0].id])
    assert.equal((await st.del(`${url()}/images/${second}`)).status, 404)
    assert.ok(await waitFor(() => ctx.storedFiles('images', seed.p1).length === 1))
  })

  test('at most 6 images: extras are skipped and removed, then uploads are refused', async () => {
    const six = Array.from({ length: 6 }, (_, i): [string, string, Uint8Array, string] => ['images', `shot${i}.jpg`, png, 'image/jpeg'])
    const r = await st.post(`${url()}/images`, form({}, six))
    assert.equal(r.status, 201)
    assert.equal(r.data.showcase.images.length, 6)
    assert.equal(r.data.skipped, 1)
    assert.ok(await waitFor(() => ctx.storedFiles('images', seed.p1).length === 6))
    const full = await st.post(`${url()}/images`, form({}, [['images', 'more.png', png, 'image/png']]))
    assert.equal(full.status, 400)
    assert.match(full.data.error, /ไม่เกิน 6/)
  })
})

// ===================================================================================
describe('CSV exports (admin)', () => {
  let seed: Seed
  let anon: Client, st: Client, t1: Client, ad: Client

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    ;[st, t1, ad] = await Promise.all(['demo_student', 'demo_teacher', 'demo_admin'].map((u) => login(u)))
  })

  const rows = (text: string) => text.replace(/^﻿/, '').split('\r\n').filter(Boolean)

  test('projects.csv: BOM, UTF-8 attachment name, header and one row per project', async () => {
    const r = await ad.raw('GET', '/admin/export/projects.csv')
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8')
    assert.match(r.headers.get('content-disposition') ?? '', /^attachment; filename\*=UTF-8''/)
    assert.ok(r.body.subarray(0, 3).equals(BOM), 'starts with UTF-8 BOM')
    const lines = rows(r.text)
    assert.ok(lines[0].startsWith('ลำดับ,ชื่อโครงงาน (ไทย),ชื่อโครงงาน (อังกฤษ),ประเภท,ปีการศึกษา'))
    assert.equal(lines.length, 1 + 4)
    assert.ok(lines.some((l) => l.includes('ระบบแนะนำรายวิชาเลือกด้วยการเรียนรู้ของเครื่อง') && l.includes('65023456') && l.includes('ผ่าน 1/3')))
    assert.ok(lines.some((l) => l.includes('ระบบตรวจวัดคุณภาพอากาศด้วย IoT') && l.includes('ไม่ผ่าน')))
    assert.equal(rows((await ad.raw('GET', `/admin/export/projects.csv?term=${encodeURIComponent(seed.lastTerm)}`)).text).length, 1 + 2)
    assert.equal(rows((await ad.raw('GET', '/admin/export/projects.csv?status=passed')).text).length, 1 + 2)
  })

  test('submissions.csv requires a term and lists chapter status', async () => {
    assert.equal((await ad.get('/admin/export/submissions.csv')).status, 400)
    const r = await ad.raw('GET', `/admin/export/submissions.csv?term=${encodeURIComponent(seed.term)}`)
    assert.equal(r.status, 200)
    assert.ok(r.body.subarray(0, 3).equals(BOM))
    const lines = rows(r.text)
    assert.equal(lines[0], 'โครงงาน,นิสิต,บท,กำหนดส่ง,เวอร์ชันล่าสุด,ส่งเมื่อ,ส่งช้า,ผลตรวจ')
    assert.ok(lines.some((l) => l.includes('ระบบแนะนำรายวิชา') && l.includes('บทที่ 1') && l.includes('v2') && l.includes('ผ่าน (2)')))
    assert.ok(lines.some((l) => l.includes('ระบบแนะนำรายวิชา') && l.includes('บทที่ 2') && l.includes('รอตรวจ')))
    assert.ok(lines.some((l) => l.includes('ระบบตรวจวัดคุณภาพอากาศ') && l.includes('บทที่ 1') && l.includes('ต้องแก้ไข')))
    assert.ok(lines.some((l) => l.includes('ระบบตรวจวัดคุณภาพอากาศ') && l.includes('บทที่ 2') && l.includes('เลยกำหนด')))
  })

  test('users.csv with role filter', async () => {
    const all = rows((await ad.raw('GET', '/admin/export/users.csv')).text)
    assert.equal(all[0], 'ลำดับ,ชื่อ-นามสกุล,ชื่อผู้ใช้,อีเมล,บทบาท,รหัสนิสิต,เบอร์โทร,วันที่สร้างบัญชี')
    assert.equal(all.length, 1 + 11)
    assert.ok(all.some((l) => l.includes('demo_admin') && l.includes('ผู้ดูแลระบบ')))
    assert.equal(rows((await ad.raw('GET', '/admin/export/users.csv?role=teacher')).text).length, 1 + 3)
  })

  test('cells that look like spreadsheet formulas are neutralised', async () => {
    const r = await ad.post('/admin/users', { role: 'teacher', name: '=HYPERLINK("http://evil","x")', username: 'formula', email: 'formula@demo.up.ac.th', password: 'abcdef' })
    assert.equal(r.status, 201)
    const text = (await ad.raw('GET', '/admin/export/users.csv')).text
    assert.ok(text.includes(`"'=HYPERLINK(""http://evil"",""x"")"`), 'formula prefixed with a quote and CSV-escaped')
  })

  test('exports are admin only', async () => {
    for (const path of ['/admin/export/projects.csv', '/admin/export/users.csv', `/admin/export/submissions.csv?term=${encodeURIComponent(seed.term)}`]) {
      assert.equal((await st.get(path)).status, 403, path)
      assert.equal((await t1.get(path)).status, 403, path)
      assert.equal((await anon.get(path)).status, 401, path)
    }
  })
})

// ===================================================================================
describe('GitHub integration (offline)', () => {
  let seed: Seed
  let anon: Client, st: Client, st7: Client, t1: Client
  let parseRepo: (input: string) => { owner: string; repo: string }
  let languageOf: (path: string) => string

  before(async () => {
    seed = await ctx.reset()
    anon = ctx.client()
    ;[st, st7, t1] = await Promise.all(['demo_student', 'demo_student7', 'demo_teacher'].map((u) => login(u)))
    ;({ parseRepo, languageOf } = await import('../src/lib/github.js'))
  })

  test('parseRepo accepts the usual GitHub URL forms', () => {
    const cases: [string, string, string][] = [
      ['https://github.com/octocat/Hello-World', 'octocat', 'Hello-World'],
      ['http://www.github.com/octocat/Hello-World/', 'octocat', 'Hello-World'],
      ['github.com/octocat/Hello-World.git', 'octocat', 'Hello-World'],
      ['https://github.com/octocat/Hello-World.git', 'octocat', 'Hello-World'],
      ['octocat/Hello-World', 'octocat', 'Hello-World'],
      ['  https://github.com/a-b/c.d_e  ', 'a-b', 'c.d_e'],
      ['https://github.com/octocat/Hello-World/tree/main/src', 'octocat', 'Hello-World'],
      ['https://github.com/octocat/Hello-World/blob/main/README.md', 'octocat', 'Hello-World'],
    ]
    for (const [input, owner, repo] of cases) assert.deepEqual(parseRepo(input), { owner, repo }, input)
  })

  test('parseRepo rejects anything else with a 400 error', () => {
    const bad = [
      '', 'not a url', 'octocat', 'https://github.com/octocat', 'https://github.com/octocat/Hello-World/issues/1',
      'https://gitlab.com/group/project', 'octo cat/repo', 'octocat/repo?tab=readme', `octocat/${'x'.repeat(101)}`, 'octocat/re<po',
    ]
    for (const input of bad) {
      assert.throws(() => parseRepo(input), (e: Json) => e.status === 400 && /ลิงก์ GitHub ไม่ถูกต้อง/.test(e.message), JSON.stringify(input))
    }
  })

  test('parseRepo strips ".git" even with a trailing slash', () => {
    assert.deepEqual(parseRepo('https://github.com/octocat/Hello-World.git/'), { owner: 'octocat', repo: 'Hello-World' })
  })

  test('languageOf maps file extensions', () => {
    assert.equal(languageOf('src/main.py'), 'python')
    assert.equal(languageOf('App.TSX'), 'typescript')
    assert.equal(languageOf('Program.cs'), 'C#')
    assert.equal(languageOf('Makefile'), 'other')
  })

  test('linking validates the URL and permissions before contacting GitHub', async () => {
    const bad = await st.put(`/projects/${seed.p1}/github`, { url: 'not a url' })
    assert.equal(bad.status, 400)
    assert.match(bad.data.error, /ลิงก์ GitHub ไม่ถูกต้อง/)
    assert.equal((await st.put(`/projects/${seed.p1}/github`, { url: '' })).status, 400)
    assert.equal((await st.put(`/projects/${seed.p1}/github`, { url: 'https://github.com/a/b/issues/1' })).status, 400)
    assert.equal((await st7.put(`/projects/${seed.p1}/github`, { url: 'octocat/Hello-World' })).status, 403)
    assert.equal((await t1.put(`/projects/${seed.p1}/github`, { url: 'octocat/Hello-World' })).status, 403)
    assert.equal((await anon.put(`/projects/${seed.p1}/github`, { url: 'octocat/Hello-World' })).status, 401)
    assert.deepEqual(ctx.externalFetches, [])
  })

  test('unlinked project: GitHub actions fail fast with 400', async () => {
    assert.deepEqual((await st.get(`/projects/${seed.p1}/github`)).data, { github: null })
    assert.equal((await st.del(`/projects/${seed.p1}/github`)).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/github/sync`)).status, 400)
    assert.equal((await st.get(`/projects/${seed.p1}/github/tree`)).status, 400)
    assert.equal((await st.post(`/projects/${seed.p1}/github/import`, { paths: ['a.py'] })).status, 400)
    assert.equal((await t1.get(`/projects/${seed.p1}/github/tree`)).status, 403)
    assert.deepEqual(ctx.externalFetches, [])
  })

  const payload = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 1, repository: { full_name: 'octocat/Hello-World' } })
  const sign = (body: string, secret = WEBHOOK_SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  const hook = (body: string, headers: Record<string, string>) => anon.call('POST', '/github/webhook', body, { 'content-type': 'application/json', ...headers })

  test('webhook is disabled (404) when no secret is configured', async () => {
    const saved = ctx.config.githubWebhookSecret
    ctx.config.githubWebhookSecret = ''
    try {
      const r = await hook(payload, { 'x-github-event': 'push', 'x-hub-signature-256': sign(payload) })
      assert.equal(r.status, 404)
    } finally {
      ctx.config.githubWebhookSecret = saved
    }
  })

  test('webhook rejects missing, malformed and wrong signatures (401)', async () => {
    assert.equal((await hook(payload, { 'x-github-event': 'push' })).status, 401)
    assert.equal((await hook(payload, { 'x-github-event': 'push', 'x-hub-signature-256': 'sha256=abc' })).status, 401)
    assert.equal((await hook(payload, { 'x-github-event': 'push', 'x-hub-signature-256': sign(payload, 'wrong-secret') })).status, 401)
    assert.equal((await hook(payload, { 'x-github-event': 'push', 'x-hub-signature-256': sign(payload + ' ') })).status, 401)
    assert.equal((await hook(payload, { 'x-github-event': 'push', 'x-hub-signature-256': sign(payload).toUpperCase() })).status, 401)
  })

  test('webhook with no body is rejected as unauthorised, not a server error', async () => {
    // ตอนนี้ errorHandler พิมพ์ stack ของ 500 ออกมา ปิดไว้ไม่ให้รกผลทดสอบ
    const logError = console.error
    console.error = () => {}
    try {
      const r = await anon.call('POST', '/github/webhook', undefined, { 'x-github-event': 'push' })
      assert.equal(r.status, 401)
    } finally {
      console.error = logError
    }
  })

  // ลายเซ็นถูกต้องแต่ไม่ใช่ push (หรือ body เสีย) จะตอบกลับก่อนซิงค์ จึงไม่เรียก GitHub
  test('validly signed ping / other events / unparsable push are answered without syncing', async () => {
    const ping = await hook(payload, { 'x-github-event': 'ping', 'x-hub-signature-256': sign(payload) })
    assert.equal(ping.status, 200)
    assert.deepEqual(ping.data, { ok: true })
    const issues = await hook(payload, { 'x-github-event': 'issues', 'x-hub-signature-256': sign(payload) })
    assert.equal(issues.status, 202)
    assert.deepEqual(issues.data, { ignored: 'issues' })
    const broken = '{not json'
    assert.equal((await hook(broken, { 'x-github-event': 'push', 'x-hub-signature-256': sign(broken) })).status, 400)
    assert.deepEqual(ctx.externalFetches, [])
  })
})

// ===================================================================================
describe('deadline reminders', () => {
  let seed: Seed
  let runReminders: (now?: Date) => Promise<number>

  before(async () => {
    seed = await ctx.reset()
    ;({ runReminders } = await import('../src/lib/reminders.js'))
  })

  test('reminds students of unsent chapters 3 days ahead, once', async () => {
    const ad = await login('demo_admin')
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    assert.equal((await ad.put('/admin/deadlines', { term: seed.term, chapter: 'บทที่ 3', date: inThreeDays, note: 'ส่งในระบบ' })).status, 204)
    ctx.mailbox.length = 0
    // p1 ยังไม่ส่งบทที่ 3 (p4 ไม่ผ่าน และ p2/p3 อยู่ภาคการศึกษาก่อน จึงไม่ถูกเตือน)
    assert.equal(await runReminders(), 1)
    const st = await login('demo_student')
    assert.ok((await titles(st)).includes('อีก 3 วันครบกำหนดส่ง บทที่ 3'))
    assert.ok(ctx.mailbox.some((m) => m.to === '65023457@demo.up.ac.th' && m.subject === 'อีก 3 วันครบกำหนดส่ง บทที่ 3'))
    assert.equal(await runReminders(), 0)
  })
})

describe('demo mode: demo account passwords stay Demo@1234', () => {
  let seed: Seed

  before(async () => {
    seed = await ctx.reset()
    ctx.config.demoMode = true
  })
  after(() => {
    ctx.config.demoMode = false
  })

  test('config lists demo accounts for the login page', async () => {
    const c = (await ctx.client().get('/public/config')).data
    assert.equal(c.demo.password, 'Demo@1234')
    assert.ok(c.demo.accounts.some((a: Json) => a.username === 'demo_admin'))
  })

  test('nobody can change or reset passwords', async () => {
    const st = await login('demo_student')
    assert.equal((await st.post('/auth/password', { current: 'Demo@1234', password: 'Hacked@123' })).status, 403)
    assert.equal((await ctx.client().post('/auth/forgot', { login: 'demo_student' })).status, 403)
    const ad = await login('demo_admin')
    assert.equal((await ad.post(`/admin/users/${seed.users.demo_teacher}/reset-password`, { password: 'Hacked@123' })).status, 403)
    // รหัสเดิมยังเข้าได้
    assert.equal((await ctx.client().post('/auth/login', { username: 'demo_student', password: 'Demo@1234' })).status, 200)
  })

  test('demo accounts cannot be deleted or have their role changed; other accounts still can', async () => {
    const ad = await login('demo_admin')
    assert.equal((await ad.patch(`/admin/users/${seed.users.demo_student7}`, { role: 'teacher' })).status, 403)
    assert.equal((await ad.del(`/admin/users/${seed.users.demo_student7}`)).status, 403)
    const created = await ad.post('/admin/users', { role: 'student', name: 'ผู้ใช้ ทดลอง', username: 'visitor1', email: 'visitor1@x.th', studentId: '69000001', password: 'abcdef' })
    assert.equal(created.status, 201)
    assert.equal((await ad.del(`/admin/users/${created.data.user.id}`)).status, 204)
  })
})

// ===================================================================================
test('no test reached the network outside this machine', () => {
  assert.deepEqual(ctx.externalFetches, [])
})
