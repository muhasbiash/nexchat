import type { Db } from 'mongodb';

import { createAvatarUploadSignature } from '../lib/cloudinary';
import { PasswordValidationError } from '../lib/password';
import { sendEmailVerification } from '../lib/email-verification';

import {
  getCurrentUser,
  loginUser,
  registerUser,
  resendEmailVerification,
  updateCurrentUser,
  verifyEmail,
  verifyToken,
} from '../services/auth.service';

interface AuthEnv {
  JWT_SECRET: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_VERIFICATION_URL: string;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization');

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

export async function handleAuthRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: AuthEnv,
): Promise<Response | null> {
  if (request.method === 'POST' && pathname === '/api/auth/register') {
    try {
      const body = (await request.json()) as {
        name?: string;
        email?: string;
        password?: string;
      };

      const { name, email, password } = body;

      if (!name || !email || !password) {
        return json(
          {
            message: 'Name, email, and password are required',
          },
          400,
        );
      }

      const registration = await registerUser(db, name, email, password);

      const { emailVerificationToken: _emailVerificationToken, ...user } = registration;

      return json(
        {
          user,
        },
        201,
      );
    } catch (error) {
      if (error instanceof PasswordValidationError) {
        return json(
          {
            message: error.message,
          },
          400,
        );
      }

      if (error instanceof Error && error.message === 'Email already registered') {
        return json(
          {
            message: error.message,
          },
          409,
        );
      }

      console.error('[Auth] Register error:', error);

      return json(
        {
          message: 'Internal server error',
        },
        500,
      );
    }
  }

  if (request.method === 'POST' && pathname === '/api/auth/resend-verification') {
    try {
      const body = (await request.json()) as {
        email?: string;
      };

      await resendEmailVerification(db, body.email ?? '', env);

      return json({
        message:
          'If the email is registered and unverified, a verification email has been sent.',
      });
    } catch (error) {
      console.error('[Auth] Resend verification error:', error);

      return json(
        {
          message: 'Unable to send verification email',
        },
        500,
      );
    }
  }

  if (request.method === 'GET' && pathname === '/api/auth/verify-email') {
    try {
      const token = new URL(request.url).searchParams.get('token');

      if (!token) {
        return json(
          {
            message: 'Invalid or expired email verification token',
          },
          400,
        );
      }

      const user = await verifyEmail(db, token);

      return json({
        message: 'Email verified successfully',
        user,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Invalid or expired email verification token'
      ) {
        return json(
          {
            message: error.message,
          },
          400,
        );
      }

      console.error('[Auth] Email verification error:', error);

      return json(
        {
          message: 'Internal server error',
        },
        500,
      );
    }
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = (await request.json()) as {
        email?: string;
        password?: string;
      };

      const { email, password } = body;

      if (!email || !password) {
        return json(
          {
            message: 'Email and password are required',
          },
          400,
        );
      }

      const result = await loginUser(db, email, password, env.JWT_SECRET);

      return json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Email verification required') {
        return json(
          {
            message: error.message,
          },
          403,
        );
      }

      if (error instanceof Error && error.message === 'Invalid email or password') {
        return json(
          {
            message: error.message,
          },
          401,
        );
      }

      console.error('[Auth] Login error:', error);

      return json(
        {
          message: 'Internal server error',
        },
        500,
      );
    }
  }

  if (request.method === 'POST' && pathname === '/api/auth/avatar/signature') {
    try {
      const token = getBearerToken(request);

      if (!token) {
        return json(
          {
            message: 'Authentication required',
          },
          401,
        );
      }

      const payload = await verifyToken(token, env.JWT_SECRET);

      const signature = await createAvatarUploadSignature(payload.sub, {
        CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
      });

      return json(signature);
    } catch (error) {
      console.error('[Auth] Avatar signature error:', error);

      return json(
        {
          message: 'Authentication required',
        },
        401,
      );
    }
  }

  if (request.method === 'GET' && pathname === '/api/auth/me') {
    try {
      const token = getBearerToken(request);

      if (!token) {
        return json(
          {
            message: 'Authentication required',
          },
          401,
        );
      }

      console.log('[AuthRoute] before verifyToken');

      const payload = await verifyToken(token, env.JWT_SECRET);

      console.log('[AuthRoute] after verifyToken:', payload.sub);

      console.log('[AuthRoute] before getCurrentUser');

      const user = await getCurrentUser(db, payload.sub);

      console.log('[AuthRoute] after getCurrentUser:', Boolean(user));

      if (!user) {
        return json(
          {
            message: 'User not found',
          },
          404,
        );
      }

      return json({
        user,
      });
    } catch (error) {
      console.error('[Auth] Current user error:', error);

      return json(
        {
          message: 'Authentication required',
        },
        401,
      );
    }
  }

  if (request.method === 'PATCH' && pathname === '/api/auth/me') {
    try {
      const token = getBearerToken(request);

      if (!token) {
        return json(
          {
            message: 'Authentication required',
          },
          401,
        );
      }

      const payload = await verifyToken(token, env.JWT_SECRET);

      const body = (await request.json()) as {
        name?: unknown;
        avatarUrl?: unknown;
        bio?: unknown;
      };

      const hasName = body.name !== undefined;
      const hasAvatarUrl = body.avatarUrl !== undefined;
      const hasBio = body.bio !== undefined;

      if (!hasName && !hasAvatarUrl && !hasBio) {
        return json(
          {
            message: 'No profile changes provided',
          },
          400,
        );
      }

      if (hasName && (typeof body.name !== 'string' || !body.name.trim())) {
        return json(
          {
            message: 'Name is required',
          },
          400,
        );
      }

      if (
        hasAvatarUrl &&
        body.avatarUrl !== null &&
        (typeof body.avatarUrl !== 'string' ||
          !body.avatarUrl.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`))
      ) {
        return json(
          {
            message: 'Invalid avatar URL',
          },
          400,
        );
      }

      if (hasBio && typeof body.bio !== 'string') {
        return json(
          {
            message: 'Bio must be a text value',
          },
          400,
        );
      }

      if (hasBio && typeof body.bio === 'string' && body.bio.trim().length > 120) {
        return json(
          {
            message: 'Bio must be 120 characters or less',
          },
          400,
        );
      }

      const user = await updateCurrentUser(db, payload.sub, {
        ...(hasName ? { name: body.name as string } : {}),
        ...(hasAvatarUrl ? { avatarUrl: body.avatarUrl as string | null } : {}),
        ...(hasBio ? { bio: body.bio as string } : {}),
      });

      if (!user) {
        return json(
          {
            message: 'User not found',
          },
          404,
        );
      }

      return json({
        user,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Name is required') {
        return json(
          {
            message: error.message,
          },
          400,
        );
      }

      console.error('[Auth] Update current user error:', error);

      return json(
        {
          message: 'Authentication required',
        },
        401,
      );
    }
  }

  return null;
}
