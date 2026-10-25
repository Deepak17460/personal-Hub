import { lazy } from 'react';
import { createBrowserRouter, Link } from 'react-router';
import { RouteErrorElement } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireOwner } from '@/features/auth/RequireOwner';
import SignInPage from '@/features/auth/SignInPage';

// Feature pages are code-split; each loads on first navigation.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const NotesPage = lazy(() => import('@/features/notes/NotesPage'));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'));
const BookmarksPage = lazy(() => import('@/features/bookmarks/BookmarksPage'));
const DocumentsPage = lazy(() => import('@/features/documents/DocumentsPage'));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        Go to overview
      </Link>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/signin', element: <SignInPage />, errorElement: <RouteErrorElement /> },
  {
    path: '/',
    element: (
      <RequireOwner>
        <AppLayout />
      </RequireOwner>
    ),
    errorElement: <RouteErrorElement />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'notes', element: <NotesPage /> },
      { path: 'notes/:noteId', element: <NotesPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'bookmarks', element: <BookmarksPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
