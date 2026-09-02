import type { Db } from 'mongodb';

import { createDirectConversation, getUserConversations } from '../services/conversation.service';

import { areUsersContacts } from '../services/contact.service';

import { verifyToken } from '../lib/jwt';

interface ConversationEnv {
  JWT_SECRET: string;
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

export async function handleConversationsRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: ConversationEnv,
): Promise<Response | null> {
  const directMatch = pathname.match(/^\/api\/conversations\/direct\/([^/]+)$/);

  const isConversationsRoute = pathname === '/api/conversations';

  if (!isConversationsRoute && !directMatch) {
    return null;
  }

  /*
   * Supported endpoints:
   *
   * GET  /api/conversations
   * POST /api/conversations/direct/:participantId
   */

  if (request.method !== 'GET' && !directMatch) {
    return json(
      {
        message: 'Method not allowed',
      },
      405,
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
    payload = await verifyToken(token, env.JWT_SECRET);
  } catch (error) {
    console.error('[Conversations] JWT verification failed:', error);

    return json(
      {
        message: 'Authentication required',
      },
      401,
    );
  }

  /*
   * POST /api/conversations/direct/:participantId
   *
   * A direct conversation may only be created
   * when the two users are already accepted contacts.
   */
  if (request.method === 'POST' && directMatch) {
    const participantId = directMatch[1];

    if (!participantId) {
      return json(
        {
          message: 'Participant id is required',
        },
        400,
      );
    }

    try {
      /*
       * Contact permission check.
       *
       * Both users must have an accepted
       * contact relationship.
       */
      const areContacts = await areUsersContacts(db, payload.sub, participantId);

      if (!areContacts) {
        return json(
          {
            message: 'Users must be accepted contacts before starting a conversation',
          },
          403,
        );
      }

      const conversation = await createDirectConversation(db, payload.sub, participantId);

      return json(
        {
          conversation,
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'Invalid current user id' ||
          error.message === 'Invalid participant id' ||
          error.message === 'Cannot create conversation with yourself')
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
        (error.message === 'Participant not found' ||
          error.message === 'Conversation user not found')
      ) {
        return json(
          {
            message: error.message,
          },
          404,
        );
      }

      console.error('[Conversations] Direct create error:', error);

      return json(
        {
          message: 'Internal server error',
        },
        500,
      );
    }
  }

  /*
   * GET /api/conversations
   */
  if (request.method === 'GET' && pathname === '/api/conversations') {
    try {
      const conversations = await getUserConversations(db, payload.sub);

      return json({
        conversations,
      });
    } catch (error) {
      console.error('[Conversations] List error:', error);

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
