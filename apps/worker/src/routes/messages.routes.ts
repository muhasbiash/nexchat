import type { Db } from 'mongodb';

import {
  createConversationMessage,
  getConversationMessages,
} from '../services/message.service';

import { verifyToken } from '../lib/jwt';

interface MessageEnv {
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

export async function handleMessagesRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: MessageEnv,
): Promise<Response | null> {
  const match = pathname.match(
    /^\/api\/messages\/([^/]+)$/,
  );

  if (!match) {
    return null;
  }

  const conversationId = match[1];

  if (!conversationId) {
    return json(
      {
        message: 'Conversation id is required',
      },
      400,
    );
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
      const messages =
        await getConversationMessages(
          db,
          conversationId,
          payload.sub,
        );

      return json({
        messages,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message ===
            'Invalid conversation id' ||
          error.message ===
            'Invalid user id'
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
        error.message ===
          'User is not a member of this conversation'
      ) {
        return json(
          {
            message: error.message,
          },
          403,
        );
      }

      console.error(
        '[Messages] List error:',
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
          content?: string;
        };

      if (
        typeof body.content !== 'string'
      ) {
        return json(
          {
            message: 'content is required',
          },
          400,
        );
      }

      const message =
        await createConversationMessage(
          db,
          conversationId,
          payload.sub,
          body.content,
        );

      return json(
        {
          message,
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message ===
            'Invalid conversation id' ||
          error.message ===
            'Invalid sender id' ||
          error.message ===
            'Message content is required'
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
        error.message ===
          'User is not a member of this conversation'
      ) {
        return json(
          {
            message: error.message,
          },
          403,
        );
      }

      console.error(
        '[Messages] Create error:',
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
