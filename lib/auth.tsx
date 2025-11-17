'use client';

import { createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  subscription: any;
};

// No authentication required, always return null user
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Always return null user (no login required)
  const value: AuthContextType = {
    user: null,
    session: null,
    isLoading: false,
    signOut: async () => {
      // No-op
    },
    subscription: null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Return default values if used outside provider (shouldn't happen)
    return {
      user: null,
      session: null,
      isLoading: false,
      signOut: async () => {},
      subscription: null,
    };
  }
  return context;
} 