import type { ReactNode } from 'react';

import { useAuth } from '../../hooks/use-auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading NexChat...</div>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
