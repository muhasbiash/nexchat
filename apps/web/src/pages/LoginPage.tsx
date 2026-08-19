import { ArrowRight, LockKeyhole, Mail, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { NexChatLogo } from '../components/nexchat-logo';
import { useAuth } from '../hooks/use-auth';

interface LoginPageProps {
  onRegister: () => void;
}

export function LoginPage({ onRegister }: LoginPageProps) {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-background">
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />
        <div className="public-grid" />
      </div>

      <div className="auth-shell">
        <div className="auth-brand">
          <NexChatLogo size={46} showText />
        </div>

        <section className="auth-card">
          <div className="auth-card-heading">
            <div className="auth-icon">
              <MessageCircle size={21} />
            </div>

            <div>
              <h1>Welcome back</h1>

              <p>Sign in to continue your conversations.</p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="login-email">Email</label>

              <div className="auth-input-wrapper">
                <Mail size={18} />

                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Password</label>

              <div className="auth-input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="auth-primary-button" disabled={loading}>
              <span>{loading ? 'Signing in...' : 'Sign in'}</span>

              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="auth-divider">
            <span>New to NexChat?</span>
          </div>

          <button type="button" className="auth-secondary-button" onClick={onRegister}>
            Create an account
          </button>
        </section>

        <p className="auth-footer">
          <span>Simple</span>
          <span>•</span>
          <span>Fast</span>
          <span>•</span>
          <span>Real-time</span>
        </p>
      </div>
    </main>
  );
}
