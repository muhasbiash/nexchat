import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useApiHealth } from '../../hooks/use-api-health';

export function ApiStatus() {
  const { data, isLoading, isError } = useApiHealth();

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-400">
        <Loader2 className="animate-spin" size={16} />
        Checking API...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-400">
        <XCircle size={16} />
        API Offline
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900 bg-emerald-950/50 px-4 py-2 text-sm text-emerald-400">
      <CheckCircle2 size={16} />
      API Connected · {data?.service ?? 'nexchat-api'}
    </div>
  );
}
