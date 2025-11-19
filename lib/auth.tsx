'use client';

import { createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { DEFAULT_LOCAL_USER_ID } from './utils';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  subscription: any;
};

// Create a default user object for local/guest users
const createDefaultUser = (): User => {
  return {
    id: DEFAULT_LOCAL_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'local@guest.user',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {
      full_name: 'Local User',
      name: 'Local User',
    },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  } as User;
};

// Create a default session object
const createDefaultSession = (): Session => {
  return {
    access_token: 'local-guest-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'local-guest-refresh-token',
    user: createDefaultUser(),
  } as Session;
};

// No authentication required, always return default user for local/guest access
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Always return default user (no login required, but provide fixed user ID)
  const defaultUser = createDefaultUser();
  const defaultSession = createDefaultSession();
  
  const value: AuthContextType = {
    user: defaultUser,
    session: defaultSession,
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