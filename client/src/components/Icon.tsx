import {
  AlarmClock, Award, Bell, BookOpen, ChartPie, CircleCheck, CircleX, Clock, CodeXml, FileCheck, FileUp, FolderPlus,
  Gavel, GitBranch, GitCommitHorizontal, Library, Unlink, LayoutDashboard, Mail, MessageSquare, MessageSquareText, Pencil, PencilLine, RefreshCw, RotateCcw,
  Search, Tag, Trash2, UserCheck, UserMinus, UserPlus, Users, type LucideIcon, type LucideProps,
} from 'lucide-react'

// ไอคอนที่อ้างด้วยชื่อ (ชื่อมาจาก server เช่นการแจ้งเตือนและประวัติ)
const ICONS: Record<string, LucideIcon> = {
  'alarm-clock': AlarmClock,
  award: Award,
  bell: Bell,
  'book-open': BookOpen,
  'chart-pie': ChartPie,
  'circle-check': CircleCheck,
  'circle-x': CircleX,
  clock: Clock,
  'code-xml': CodeXml,
  'file-check': FileCheck,
  'file-up': FileUp,
  'folder-plus': FolderPlus,
  gavel: Gavel,
  'git-branch': GitBranch,
  'git-commit-horizontal': GitCommitHorizontal,
  unlink: Unlink,
  library: Library,
  'layout-dashboard': LayoutDashboard,
  mail: Mail,
  'message-square': MessageSquare,
  'message-square-text': MessageSquareText,
  pencil: Pencil,
  'pencil-line': PencilLine,
  'refresh-cw': RefreshCw,
  'rotate-ccw': RotateCcw,
  search: Search,
  tag: Tag,
  'trash-2': Trash2,
  'user-check': UserCheck,
  'user-minus': UserMinus,
  'user-plus': UserPlus,
  users: Users,
}

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? Bell
  return <C {...props} />
}
