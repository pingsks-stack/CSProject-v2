import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { api } from './api'
import type { User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  register: (body: Record<string, string>) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<unknown>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User | null }>('/auth/me'),
    staleTime: Infinity,
  })

  // คุกกี้หมดอายุระหว่างใช้งาน → กลับไปหน้าเข้าสู่ระบบ
  useEffect(() => {
    const onExpired = () => qc.setQueryData(['me'], { user: null })
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [qc])

  // เปลี่ยนผู้ใช้: ตั้งค่า me ใหม่แล้วล้างข้อมูลอื่นของผู้ใช้คนเดิม
  // (ไม่ใช้ qc.clear() เพราะ useQuery ของ me จะไม่รู้ว่าถูกลบ)
  const switchUser = (user: User | null) => {
    qc.setQueryData(['me'], { user })
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  }

  const value: AuthState = {
    user: me.data?.user ?? null,
    loading: me.isPending,
    async login(username, password) {
      const { user } = await api.post<{ user: User }>('/auth/login', { username, password })
      switchUser(user)
      return user
    },
    async register(body) {
      const { user } = await api.post<{ user: User }>('/auth/register', body)
      switchUser(user)
      return user
    },
    async logout() {
      await api.post('/auth/logout')
      switchUser(null)
    },
    refresh: () => me.refetch(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ใน AuthProvider')
  return ctx
}

// ใช้ในหน้าที่ต้องล็อกอินแล้วเท่านั้น (อยู่ใต้ RequireAuth)
export function useMe() {
  const { user } = useAuth()
  if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
  return user
}
