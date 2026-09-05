import { ArrowRight, Check, Mail, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';

interface VerifyEmailPageProps {
  onLogin: () => void;
}

type VerificationStatus = 'loading' | 'success' | 'error';

export function VerifyEmailPage({ onLogin }: VerifyEmailPageProps) {
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    const tokenParam = new URLSearchParams(window.location.search).get('token');

    if (!tokenParam) {
      setStatus('error');
      setMessage('This verification link is invalid or incomplete.');
      return;
    }

    const token = tokenParam;
    let cancelled = false;

    async function verify() {
      try {
        const response = await api<{
          message: string;
          user: {
            id: string;
            name: string;
            email: string;
          };
        }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

        if (cancelled) return;

        setEmail(response.user.email);
        setMessage(response.message);
        setStatus('success');

        window.history.replaceState({}, '', '/verify-email');
      } catch (error) {
        if (cancelled) return;

        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'This verification link is invalid or expired.',
        );
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResend() {
    if (!email.trim() || resending) return;

    setResending(true);
    setResendMessage('');

    try {
      const response = await api<{ message: string }>(
        '/api/auth/resend-verification',
        {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        },
      );

      setResendMessage(response.message);
    } catch (error) {
      setResendMessage(
        error instanceof Error
          ? error.message
          : 'Unable to resend the verification email.',
      );
    } finally {
      setResending(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="auth-page">
        <section className="auth-card auth-success">
          <div className="auth-success-icon">
            <Mail size={22} />
          </div>

          <div className="auth-success-content">
            <h2>Verifying your email</h2>
            <p>Please wait while we verify your NexChat account.</p>
          </div>
        </section>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main className="auth-page">
        <section className="auth-card auth-success" role="status">
          <div className="auth-success-icon">
            <Check size={22} />
          </div>

          <div className="auth-success-content">
            <h2>Email verified</h2>

            <p>
              Your email address <strong>{email}</strong> has been verified.
              You can now sign in to NexChat.
            </p>
          </div>

          <button type="button" className="auth-primary-button" onClick={onLogin}>
            <span>Go to sign in</span>
            <ArrowRight size={18} />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-success" role="alert">
        <div className="auth-success-icon">
          <Mail size={22} />
        </div>

        <div className="auth-success-content">
          <h2>Verification failed</h2>
          <p>{message}</p>
        </div>

        {email && (
          <>
            <button
              type="button"
              className="auth-primary-button"
              onClick={handleResend}
              disabled={resending}
            >
              <span>
                {resending ? 'Sending...' : 'Resend verification email'}
              </span>
              <RefreshCw size={18} />
            </button>

            {resendMessage && (
              <p className="auth-helper-text">{resendMessage}</p>
            )}
          </>
        )}

        <button type="button" className="auth-secondary-button" onClick={onLogin}>
          Back to sign in
        </button>
      </section>
    </main>
  );
}
