import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';

interface HealthResponse {
  status: string;
  service: string;
}

export function useApiHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['api-health'],
    queryFn: () => api<HealthResponse>('/health'),
  });
}
