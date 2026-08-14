import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../lib/api';

export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });
}
