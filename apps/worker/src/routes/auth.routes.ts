import type { Db } from 'mongodb';

import {
  getCurrentUser,
  loginUser,
  registerUser,
  verifyToken,
} from '../services/auth.service';

interface AuthEnv {
  JWT_SECRET: string;
}

function json(
  data: unknown,
  status = 200,
): Response {
  return Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get(
    'Authorization',
  );

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  if (
    scheme?.toLowerCase() !== 'bearer' ||
    !token
  ) {
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
  if (
    request.method === 'POST' &&
    pathname === '/api/auth/register'
  ) {
    try {
      const body = await request.json() as {
        name?: string;
        email?: string;
        password?: string;
      };

      const { name, email, password } = body;

      if (!name || !email || !password) {
        return json(
          {
            message:
              'Name, email, and password are required',
          },
          400,
        );
      }

      const user = await registerUser(
        db,
        name,
        email,
        password,
      );

      return json(
        {
          user,
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Email already registered'
      ) {
        return json(
          {
            message: error.message,
          },
          409,
        );
      }

      console.error(
        '[Auth] Register error:',
        error,
      );

      return json(
        {
          message: 'Internal server error',
        },
        500,
      );
    }
  }

  if (
    request.method === 'POST' &&
    pathname === '/api/auth/login'
  ) {
    try {
      const body = await request.json() as {
        email?: string;
        password?: string;
      };

      const { email, password } = body;

      if (!email || !password) {
        return json(
          {
            message:
              'Email and password are required',
          },
          400,
        );
      }

      const result = await loginUser(
        db,
        email,
        password,
        env.JWT_SECRET,
      );

      return json(result);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Invalid email or password'
      ) {
        return json(
          {
            message: error.message,
          },
          401,
        );
      }

      console.error(
        '[Auth] Login error:',
        error,
      );

      return json(
        {
          message: 'Internal server error',
        },
        500,
      );
    }
  }

  if (
    request.method === 'GET' &&
    pathname === '/api/auth/me'
  ) {
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

const payload = await verifyToken(
        token,
        env.JWT_SECRET,
      );

      console.log(
        '[AuthRoute] after verifyToken:',
        payload.sub,
      );

      console.log('[AuthRoute] before getCurrentUser');

      const user = await getCurrentUser(
        db,
        payload.sub,
      );

      console.log(
        '[AuthRoute] after getCurrentUser:',
        Boolean(user),
      );

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
      console.error(
        '[Auth] Current user error:',
        error,
      );

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