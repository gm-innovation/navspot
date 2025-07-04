
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export type UserRole = 'super_admin' | 'empresa_admin' | 'gerente_embarcacao';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  empresa_id?: string;
  embarcacao_id?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  // Simular usuários para demonstração
  const mockUsers: User[] = [
    {
      id: '1',
      email: 'admin@navspot.com',
      name: 'Super Admin',
      role: 'super_admin'
    },
    {
      id: '2',
      email: 'empresa@navspot.com',
      name: 'Admin Empresa',
      role: 'empresa_admin',
      empresa_id: 'empresa_1'
    },
    {
      id: '3',
      email: 'gerente@navspot.com',
      name: 'Gerente Embarcação',
      role: 'gerente_embarcacao',
      empresa_id: 'empresa_1',
      embarcacao_id: 'embarcacao_1'
    }
  ];

  useEffect(() => {
    // Verificar se há usuário salvo no localStorage
    const savedUser = localStorage.getItem('navspot_user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      setIsAuthenticated(true);
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Simular autenticação
      const foundUser = mockUsers.find(u => u.email === email);
      
      if (foundUser && password) {
        setUser(foundUser);
        setIsAuthenticated(true);
        localStorage.setItem('navspot_user', JSON.stringify(foundUser));
        
        // Redirecionar baseado no role
        switch (foundUser.role) {
          case 'super_admin':
            navigate('/');
            break;
          case 'empresa_admin':
            navigate('/embarcacoes');
            break;
          case 'gerente_embarcacao':
            navigate('/tripulantes');
            break;
          default:
            navigate('/');
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erro no login:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('navspot_user');
    navigate('/login');
  };

  const hasRole = (roles: UserRole[]): boolean => {
    return user ? roles.includes(user.role) : false;
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated,
    hasRole
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
