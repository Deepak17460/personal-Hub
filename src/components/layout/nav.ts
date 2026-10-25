import {
  Bookmark,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, mobile: true },
  { to: '/notes', label: 'Notes', icon: FileText, mobile: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, mobile: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, mobile: true },
  { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'Settings', icon: Settings },
];
