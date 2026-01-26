import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

export type UserRole = 'super_admin' | 'empresa_admin' | 'gerente_embarcacao';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole | null;
  empresa_id?: string;
  embarcacao_id?: string;
}

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPendingApproval: boolean;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch user role from user_roles table
  const fetchUserRole = async (userId: string): Promise<{ role: UserRole; empresa_id?: string; embarcacao_id?: string } | null> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, empresa_id, embarcacao_id')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      return data as { role: UserRole; empresa_id?: string; embarcacao_id?: string };
    } catch (error) {
      console.error('Error in fetchUserRole:', error);
      return null;
    }
  };

  // Update app user state from Supabase user
  const updateAppUser = async (supabaseUser: User | null) => {
    if (!supabaseUser) {
      setUser(null);
      return;
    }

    const roleData = await fetchUserRole(supabaseUser.id);
    
    if (roleData) {
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        role: roleData.role,
        empresa_id: roleData.empresa_id || undefined,
        embarcacao_id: roleData.embarcacao_id || undefined,
      });
    } else {
      // User exists but has no role assigned - pending approval
      console.warn('User has no role assigned (pending approval):', supabaseUser.id);
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        role: null, // Pending approval - no access
      });
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('Auth state changed:', event);
        setSession(newSession);
        
        // Defer Supabase calls with setTimeout to avoid deadlock
        if (newSession?.user) {
          setTimeout(() => {
            updateAppUser(newSession.user);
          }, 0);
        } else {
          setUser(null);
        }
        
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      if (existingSession?.user) {
        updateAppUser(existingSession.user);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        await updateAppUser(data.user);
        navigate('/');
        return { success: true };
      }

      return { success: false, error: 'Erro desconhecido no login' };
    } catch (error) {
      console.error('Login exception:', error);
      return { success: false, error: 'Erro inesperado no login' };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const hasRole = (roles: UserRole[]): boolean => {
    return user && user.role ? roles.includes(user.role) : false;
  };

  const isPendingApproval = !!session && !!user && user.role === null;

  const value = {
    user,
    session,
    login,
    logout,
    isAuthenticated: !!session && !!user && user.role !== null,
    isLoading,
    isPendingApproval,
    hasRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
