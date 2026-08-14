import { MessageCircle } from 'lucide-react';
import { ApiStatus } from '../components/ui/ApiStatus';

export function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-2xl bg-blue-600 p-4">
              <MessageCircle size={40} />
            </div>
          </div>

          <h1 className="text-5xl font-bold tracking-tight">NexChat</h1>

          <p className="mt-4 text-lg text-slate-400">Real-time messaging platform.</p>

          <p className="mt-2 text-sm text-slate-500">Your conversations, connected in real time.</p>

          <div className="mt-8">
            <ApiStatus />
          </div>
        </div>
      </section>
    </main>
  );
}
