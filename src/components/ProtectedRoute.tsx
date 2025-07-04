
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedRoles 
}) => {
  const { isAuthenticated, hasRole, user } = useAuth();

  console.log('ProtectedRoute - User:', user);
  console.log('ProtectedRoute - Is authenticated:', isAuthenticated);
  console.log('ProtectedRoute - Allowed roles:', allowedRoles);

  if (!isAuthenticated) {
    console.log('ProtectedRoute - Redirecting to login (not authenticated)');
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    console.log(`ProtectedRoute - Access denied. User role: ${user?.role}, Required roles: ${allowedRoles.join(', ')}`);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar esta página.
          </p>
          <p className="text-sm text-muted-foreground">
            Seu perfil: {user?.role} | Perfis necessários: {allowedRoles.join(', ')}
          </p>
        </div>
      </div>
    );
  }

  console.log('ProtectedRoute - Access granted');
  return <>{children}</>;
};
