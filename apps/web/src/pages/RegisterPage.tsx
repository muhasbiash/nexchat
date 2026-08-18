import {
  ArrowRight,
  Check,
  LockKeyhole,
  Mail,
  MessageCircle,
  User,
} from 'lucide-react';
import { useState } from 'react';

import { NexChatLogo } from '../components/nexchat-logo';
import { useAuth } from '../hooks/use-auth';

interface RegisterPageProps {
  onLogin: () => void;
}

export function RegisterPage({ onLogin }: RegisterPageProps) {
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      await register(name.trim(), email.trim(), password);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Registration failed',
      );
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
              <h1>Create your account</h1>

              <p>
                Join NexChat and start connecting with your people.
              </p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="register-name">Full name</label>

              <div className="auth-input-wrapper">
                <User size={18} />

                <input
                  id="register-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="register-email">Email</label>

              <div className="auth-input-wrapper">
                <Mail size={18} />

                <input
                  id="register-email"
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
              <label htmlFor="register-password">Password</label>

              <div className="auth-input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="register-password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="register-confirm-password">
                Confirm password
              </label>

              <div className="auth-input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="register-confirm-password"
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {confirmPassword && password === confirmPassword && (
                <div className="auth-field-success">
                  <Check size={14} />
                  Passwords match
                </div>
              )}
            </div>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="auth-primary-button"
              disabled={loading}
            >
              <span>
                {loading ? 'Creating account...' : 'Create account'}
              </span>

              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="auth-divider">
            <span>Already have an account?</span>
          </div>

          <button
            type="button"
            className="auth-secondary-button"
            onClick={onLogin}
          >
            Sign in
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