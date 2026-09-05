const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface EmailVerificationEnv {
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_VERIFICATION_URL: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createEmailVerificationToken(): Promise<{
  token: string;
  tokenHash: string;
  expiresAt: Date;
}> {
  const bytes = new Uint8Array(EMAIL_VERIFICATION_TOKEN_BYTES);

  crypto.getRandomValues(bytes);

  const token = bytesToHex(bytes);

  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const tokenHash = bytesToHex(new Uint8Array(digest));

  return {
    token,
    tokenHash,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
  };
}

export async function hashEmailVerificationToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return bytesToHex(new Uint8Array(digest));
}

export async function sendEmailVerification(
  env: EmailVerificationEnv,
  recipientEmail: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const verificationUrl = new URL(env.EMAIL_VERIFICATION_URL);
  verificationUrl.searchParams.set('token', token);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'NexChat/1.0',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [recipientEmail],
      subject: 'Verify your NexChat email',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:0 auto;padding:32px 20px">
          <h1 style="margin:0 0 16px;font-size:28px">Welcome to NexChat</h1>

          <p>Hi ${escapeHtml(recipientName)},</p>

          <p>
            Thanks for creating your NexChat account.
            Please verify your email address to activate your account.
          </p>

          <p style="margin:28px 0">
            <a
              href="${escapeHtml(verificationUrl.toString())}"
              style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600"
            >
              Verify my email
            </a>
          </p>

          <p style="font-size:14px;color:#64748b">
            This verification link expires in 24 hours.
          </p>

          <p style="font-size:14px;color:#64748b">
            If you did not create a NexChat account, you can safely ignore this email.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    console.error('[EmailVerification] Resend error:', errorBody);

    throw new Error('Failed to send verification email');
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
