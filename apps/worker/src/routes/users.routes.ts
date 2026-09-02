import type { Db } from 'mongodb';

import { verifyToken } from '../lib/jwt';
import { findAllUsers } from '../repositories/user.repository';

interface UserEnv {
  JWT_SECRET: string;
}

interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
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

export async function handleUsersRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: UserEnv,
): Promise<Response | null> {
  if (request.method === 'GET' && pathname === '/api/users') {
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

      await verifyToken(token, env.JWT_SECRET);

      const users = await findAllUsers(db);

      const publicUsers: PublicUser[] = users.map((user) => ({
        id: user._id!.toString(),
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
      }));

      return json({
        users: publicUsers,
      });
    } catch (error) {
      console.error('[Users] Get users error:', error);

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
