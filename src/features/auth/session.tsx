import { createContext, useContext, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Role } from '@/repositories/access';

export interface Session {
  user: User;
  uid: string;
  db: Firestore;
  role: Role;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Available inside the authenticated + allowlist-verified part of the app. */
export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside the authenticated app');
  return ctx;
}
