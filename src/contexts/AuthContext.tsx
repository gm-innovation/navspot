
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

  // Usuários mockados com roles corretos
  const mockUsers: User[] = [
    {
      id: '1',
      email: 'admin@navspot.com',
      name: 'Super Admin NAVSPOT',
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
      try {
        const userData = JSON.parse(savedUser);
        console.log('Usuário carregado do localStorage:', userData);
        setUser(userData);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Erro ao carregar usuário do localStorage:', error);
        localStorage.removeItem('navspot_user');
      }
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      console.log('Tentando login com:', email);
      // Simular autenticação
      const foundUser = mockUsers.find(u => u.email === email);
      
      if (foundUser && password) {
        console.log('Usuário encontrado:', foundUser);
        setUser(foundUser);
        setIsAuthenticated(true);
        localStorage.setItem('navspot_user', JSON.stringify(foundUser));
        
        // Redirecionar baseado no role
        console.log('Redirecionando usuário com role:', foundUser.role);
        switch (foundUser.role) {
          case 'super_admin':
            navigate('/');
            break;
          case 'empresa_admin':
            navigate('/');
            break;
          case 'gerente_embarcacao':
            navigate('/');
            break;
          default:
            navigate('/');
        }
        
        return true;
      }
      
      console.log('Login falhou - usuário não encontrado ou senha inválida');
      return false;
    } catch (error) {
      console.error('Erro no login:', error);
      return false;
    }
  };

  const logout = () => {
    console.log('Fazendo logout');
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('navspot_user');
    navigate('/login');
  };

  const hasRole = (roles: UserRole[]): boolean => {
    const hasPermission = user ? roles.includes(user.role) : false;
    console.log('Verificando permissão - User role:', user?.role, 'Required roles:', roles, 'Has permission:', hasPermission);
    return hasPermission;
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
