import type { Db } from 'mongodb';

import { verifyToken } from '../lib/jwt';

import {
  requestContact,
  acceptContactRequest,
  rejectContactRequest,
  getContacts,
  getIncomingRequests,
  getOutgoingRequests,
  getContactRequestStatus,
  removeContact,
} from '../services/contact.service';

interface ContactEnv {
  JWT_SECRET: string;
  NEXCHAT_ROOM: DurableObjectNamespace;
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

async function notifyContactEvent(env: ContactEnv, event: unknown): Promise<void> {
  try {
    const roomId = env.NEXCHAT_ROOM.idFromName('global');

    const room = env.NEXCHAT_ROOM.get(roomId);

    await room.fetch(
      new Request('https://nexchat.internal/contact-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }),
    );
  } catch (error) {
    console.error('[Contacts] Failed to notify WebSocket:', error);
  }
}

async function authenticate(request: Request, env: ContactEnv) {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error('Authentication required');
  }

  return verifyToken(token, env.JWT_SECRET);
}

export async function handleContactsRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: ContactEnv,
): Promise<Response | null> {
  const isContactRoute =
    pathname === '/api/contacts' ||
    pathname.startsWith('/api/contacts/') ||
    pathname === '/api/contact-requests' ||
    pathname.startsWith('/api/contact-requests/');

  if (!isContactRoute) {
    return null;
  }

  let payload;

  try {
    payload = await authenticate(request, env);
  } catch {
    return json(
      {
        message: 'Authentication required',
      },
      401,
    );
  }

  try {
    /*
     * GET /api/contacts
     */
    if (request.method === 'GET' && pathname === '/api/contacts') {
      const contacts = await getContacts(db, payload.sub);

      return json({
        contacts,
      });
    }

    /*
     * GET /api/contact-requests/incoming
     */
    if (request.method === 'GET' && pathname === '/api/contact-requests/incoming') {
      const requests = await getIncomingRequests(db, payload.sub);

      return json({
        requests,
      });
    }

    /*
     * GET /api/contact-requests/outgoing
     */
    if (request.method === 'GET' && pathname === '/api/contact-requests/outgoing') {
      const requests = await getOutgoingRequests(db, payload.sub);

      return json({
        requests,
      });
    }

    /*
     * GET /api/contact-requests/status/:userId
     */
    const statusMatch = pathname.match(/^\/api\/contact-requests\/status\/([^/]+)$/);

    if (request.method === 'GET' && statusMatch) {
      const userId = statusMatch[1];

      if (!userId) {
        return json(
          {
            message: 'User id is required',
          },
          400,
        );
      }

      const status = await getContactRequestStatus(db, payload.sub, userId);

      return json(status);
    }

    /*
     * POST /api/contact-requests/:userId
     */
    const requestMatch = pathname.match(/^\/api\/contact-requests\/([^/]+)$/);

    if (request.method === 'POST' && requestMatch) {
      const recipientId = requestMatch[1];

      if (!recipientId) {
        return json(
          {
            message: 'User id is required',
          },
          400,
        );
      }

      const requestData = await requestContact(db, payload.sub, recipientId);

      await notifyContactEvent(env, {
        type: 'contact_request_received',
        userId: recipientId,
        request: requestData,
      });

      return json(
        {
          request: requestData,
        },
        201,
      );
    }

    /*
     * POST /api/contact-requests/:requestId/accept
     */
    const acceptMatch = pathname.match(/^\/api\/contact-requests\/([^/]+)\/accept$/);

    if (request.method === 'POST' && acceptMatch) {
      const requestId = acceptMatch[1];

      if (!requestId) {
        return json(
          {
            message: 'Request id is required',
          },
          400,
        );
      }

      const result = await acceptContactRequest(db, payload.sub, requestId);

      await notifyContactEvent(env, {
        type: 'contact_request_accepted',
        userId: result.request.senderId,
        request: result.request,
        conversation: result.conversation,
      });

      return json({
        request: result.request,
        conversation: result.conversation,
      });
    }

    /*
     * POST /api/contact-requests/:requestId/reject
     */
    const rejectMatch = pathname.match(/^\/api\/contact-requests\/([^/]+)\/reject$/);

    if (request.method === 'POST' && rejectMatch) {
      const requestId = rejectMatch[1];

      if (!requestId) {
        return json(
          {
            message: 'Request id is required',
          },
          400,
        );
      }

      const result = await rejectContactRequest(db, payload.sub, requestId);

      await notifyContactEvent(env, {
        type: 'contact_request_rejected',
        userId: result.senderId,
        request: result,
      });

      return json({
        request: result,
      });
    }

    /*
     * DELETE /api/contacts/:contactId
     */
    const deleteMatch = pathname.match(/^\/api\/contacts\/([^/]+)$/);

    if (request.method === 'DELETE' && deleteMatch) {
      const contactId = deleteMatch[1];

      if (!contactId) {
        return json(
          {
            message: 'Contact id is required',
          },
          400,
        );
      }

      const removedContact = await removeContact(db, payload.sub, contactId);

      const otherUserId =
        removedContact.senderId === payload.sub
          ? removedContact.receiverId
          : removedContact.senderId;

      await notifyContactEvent(env, {
        type: 'contact_removed',
        userId: otherUserId,
        contact: removedContact,
      });

      return json({
        message: 'Contact removed',
        contact: removedContact,
      });
    }

    return json(
      {
        message: 'Method not allowed',
      },
      405,
    );
  } catch (error) {
    console.error('[Contacts] Error:', error);

    if (error instanceof Error) {
      const clientErrors = [
        'Invalid requester id',
        'Invalid recipient id',
        'Cannot add yourself as a contact',
        'Requester not found',
        'Recipient not found',
        'Users are already contacts',
        'Contact request already exists',
        'Contact request was rejected',
        'Invalid user id',
        'Invalid contact id',
        'Contact request not found',
        'Contact not found',
        'Contact could not be removed',
        'Conversation user not found',
        'Participant not found',
        'Invalid current user id',
        'Invalid participant id',
        'Cannot create conversation with yourself',
      ];

      if (clientErrors.includes(error.message)) {
        return json(
          {
            message: error.message,
          },
          400,
        );
      }
    }

    return json(
      {
        message: 'Internal server error',
      },
      500,
    );
  }
}
