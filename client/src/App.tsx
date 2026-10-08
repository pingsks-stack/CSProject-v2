import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Layout } from './components/Layout'
import { Loading } from './components/ui'
import { useAuth } from './lib/auth'
import type { Role } from './lib/types'

// โหลดแต่ละหน้าเมื่อเปิดใช้ (แยกไฟล์ JavaScript ตามหน้า)
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Stats = lazy(() => import('./pages/Stats'))
const Library = lazy(() => import('./pages/Library'))
const Search = lazy(() => import('./pages/Search'))
const CodeLibrary = lazy(() => import('./pages/CodeLibrary'))
const MyProjects = lazy(() => import('./pages/MyProjects'))
const NewProject = lazy(() => import('./pages/NewProject'))
const ProjectPage = lazy(() => import('./pages/ProjectPage'))
const Chapters = lazy(() => import('./pages/Chapters'))
const ProjectCode = lazy(() => import('./pages/ProjectCode'))
const Comments = lazy(() => import('./pages/Comments'))
const PrintForm = lazy(() => import('./pages/PrintForm'))
const TeacherProjects = lazy(() => import('./pages/TeacherProjects'))
const Requests = lazy(() => import('./pages/Requests'))
const Teachers = lazy(() => import('./pages/Teachers'))
const Chat = lazy(() => import('./pages/Chat'))
const Profile = lazy(() => import('./pages/Profile'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const AdminProjects = lazy(() => import('./pages/admin/Projects'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminDeadlines = lazy(() => import('./pages/admin/Deadlines'))
const AdminTypes = lazy(() => import('./pages/admin/Types'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Showcase = lazy(() => import('./pages/showcase/Showcase'))
const ShowcaseProject = lazy(() => import('./pages/showcase/ShowcaseProject'))
const Reader = lazy(() => import('./pages/showcase/Reader'))

function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  // ล็อกอินเสร็จ → กลับไปหน้าที่ตั้งใจจะเปิด (เช่น ตัวอ่านเล่มสมบูรณ์ในคลังโครงงาน)
  const from = (location.state as { from?: string } | null)?.from
  if (user) return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  return <>{children}</>
}

const only = (roles: Role[], el: ReactNode) => <RequireAuth roles={roles}>{el}</RequireAuth>

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        {/* คลังโครงงานสาธารณะ เปิดได้โดยไม่ต้องล็อกอิน (ตัวอ่านไฟล์ตรวจการล็อกอินเอง) */}
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/showcase/:id" element={<ShowcaseProject />} />
        <Route path="/showcase/:id/read" element={<Reader />} />
        {/* หน้าพิมพ์แบบฟอร์มไม่มีเมนูด้านข้าง */}
        <Route path="/projects/:id/print/:form" element={<RequireAuth><PrintForm /></RequireAuth>} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="stats" element={<Stats />} />
          <Route path="library" element={<Library />} />
          <Route path="search" element={<Search />} />
          <Route path="code" element={<CodeLibrary />} />

          <Route path="my-projects" element={only(['student'], <MyProjects />)} />
          <Route path="projects/new" element={only(['student'], <NewProject />)} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="projects/:id/chapters" element={<Chapters />} />
          <Route path="projects/:id/code" element={<ProjectCode />} />
          <Route path="projects/:id/comments/:teacherId" element={<Comments />} />

          <Route path="teacher/projects" element={only(['teacher'], <TeacherProjects />)} />
          <Route path="requests" element={<Requests />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="chat" element={only(['student', 'teacher'], <Chat />)} />
          <Route path="chat/:userId" element={only(['student', 'teacher'], <Chat />)} />
          <Route path="profile" element={<Profile />} />
          <Route path="password" element={<ChangePassword />} />

          <Route path="admin/projects" element={only(['admin'], <AdminProjects />)} />
          <Route path="admin/users" element={only(['admin'], <AdminUsers />)} />
          <Route path="admin/deadlines" element={only(['admin'], <AdminDeadlines />)} />
          <Route path="admin/types" element={only(['admin'], <AdminTypes />)} />
          <Route path="admin/settings" element={only(['admin'], <AdminSettings />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
