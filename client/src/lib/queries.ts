import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Meta, Project, Viewer } from './types'

// ข้อมูลอ้างอิง (ประเภทโครงงาน รายชื่อบท ภาคการศึกษา)
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/meta'), staleTime: 5 * 60_000 })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<{ project: Project; viewer: Viewer }>(`/projects/${id}`),
    enabled: !!id,
  })
}

// key ที่ต้องโหลดใหม่เมื่อโครงงานเปลี่ยน
export const projectKeys = (id: string) => [['project', id], ['projects'], ['dashboard'], ['requests']]
