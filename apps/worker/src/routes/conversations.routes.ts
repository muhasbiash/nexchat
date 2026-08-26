import type { Db } from 'mongodb';

import {
  createDirectConversation,
  getUserConversations,
} from '../services/conversation.service';

import { verifyToken } from '../lib/jwt';

interface ConversationEnv {
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

function getBearerToken(
  request: Request,
): string | null {
  const authorization = request.headers.get(
    'Authorization',
  );

  if (!authorization) {
    return null;
  }

  const [scheme, token] =
    authorization.split(' ');

  if (
    scheme?.toLowerCase() !== 'bearer' ||
    !token
  ) {
    return null;
  }

  return token;
}

export async function handleConversationsRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: ConversationEnv,
): Promise<Response | null> {
  if (pathname !== '/api/conversations') {
    return null;
  }

  const token = getBearerToken(request);

  if (!token) {
    return json(
      {
        message: 'Authentication required',
      },
      401,
    );
  }

  let payload;

  try {
    payload = await verifyToken(
      token,
      env.JWT_SECRET,
    );
  } catch {
    return json(
      {
        message: 'Authentication required',
      },
      401,
    );
  }

  if (request.method === 'GET') {
    try {
      const conversations =
        await getUserConversations(
          db,
          payload.sub,
        );

      return json({
        conversations,
      });
    } catch (error) {
      console.error(
        '[Conversations] List error:',
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

  if (request.method === 'POST') {
    try {
      const body =
        await request.json() as {
          participantId?: string;
        };

      if (!body.participantId) {
        return json(
          {
            message:
              'participantId is required',
          },
          400,
        );
      }

      const conversation =
        await createDirectConversation(
          db,
          payload.sub,
          body.participantId,
        );

      return json(
        {
          conversation,
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message ===
            'Invalid current user id' ||
          error.message ===
            'Invalid participant id' ||
          error.message ===
            'Cannot create conversation with yourself'
        )
      ) {
        return json(
          {
            message: error.message,
          },
          400,
        );
      }

      if (
        error instanceof Error &&
        (
          error.message ===
            'Participant not found' ||
          error.message ===
            'Conversation user not found'
        )
      ) {
        return json(
          {
            message: error.message,
          },
          404,
        );
      }

      console.error(
        '[Conversations] Create error:',
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

  return json(
    {
      message: 'Method not allowed',
    },
    405,
  );
}
