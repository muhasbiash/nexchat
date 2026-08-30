import type { Db } from 'mongodb';

import { verifyToken } from '../lib/jwt';

import {
  requestContact,
  acceptContactRequest,
  rejectContactRequest,
  getContacts,
  getIncomingRequests,
  removeContact,
} from '../services/contact.service';

interface ContactEnv {
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
  const authorization =
    request.headers.get('Authorization');

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

async function authenticate(
  request: Request,
  env: ContactEnv,
) {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error('Authentication required');
  }

  return verifyToken(
    token,
    env.JWT_SECRET,
  );
}

export async function handleContactsRoute(
  request: Request,
  pathname: string,
  db: Db,
  env: ContactEnv,
): Promise<Response | null> {

  if (!pathname.startsWith('/api/contacts')) {
    return null;
  }

  let payload;

  try {
    payload = await authenticate(
      request,
      env,
    );
  } catch {
    return json(
      {
        message: 'Authentication required',
      },
      401,
    );
  }

  try {

    /**
     * GET /api/contacts
     */
    if (
      request.method === 'GET' &&
      pathname === '/api/contacts'
    ) {
      const contacts = await getContacts(
        db,
        payload.sub,
      );

      return json({
        contacts,
      });
    }

    /**
     * GET /api/contacts/requests
     */
    if (
      request.method === 'GET' &&
      pathname === '/api/contacts/requests'
    ) {
      const requests =
        await getIncomingRequests(
          db,
          payload.sub,
        );

      return json({
        requests,
      });
    }

    /**
     * POST /api/contacts/:userId
     */
    const requestMatch =
      pathname.match(
        /^\/api\/contacts\/([^/]+)$/,
      );

    if (
      request.method === 'POST' &&
      requestMatch
    ) {
      const recipientId =
        requestMatch[1];

      const contact =
        await requestContact(
          db,
          payload.sub,
          recipientId,
        );

      return json(
        {
          contact,
        },
        201,
      );
    }

    /**
     * POST /api/contacts/requests/:contactId/accept
     */
    const acceptMatch =
      pathname.match(
        /^\/api\/contacts\/requests\/([^/]+)\/accept$/,
      );

    if (
      request.method === 'POST' &&
      acceptMatch
    ) {
      const contactId =
        acceptMatch[1];

      const contact =
        await acceptContactRequest(
          db,
          payload.sub,
          contactId,
        );

      return json({
        contact,
      });
    }

    /**
 * POST /api/contacts/requests/:contactId/reject
 */
const rejectMatch =
  pathname.match(
    /^\/api\/contacts\/requests\/([^/]+)\/reject$/,
  );

if (
  request.method === 'POST' &&
  rejectMatch
) {
  const contactId =
    rejectMatch[1];

  const contact =
    await rejectContactRequest(
      db,
      payload.sub,
      contactId,
    );

  return json({
    contact,
  });
}

    /**
     * DELETE /api/contacts/:contactId
     */
    const deleteMatch =
      pathname.match(
        /^\/api\/contacts\/([^/]+)$/,
      );

    if (
      request.method === 'DELETE' &&
      deleteMatch
    ) {
      const contactId =
        deleteMatch[1];

      await removeContact(
        db,
        payload.sub,
        contactId,
      );

      return json({
        message: 'Contact removed',
      });
    }

    return json(
      {
        message: 'Method not allowed',
      },
      405,
    );

  } catch (error) {
    console.error(
      '[Contacts] Error:',
      error,
    );

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
      ];

      if (
        clientErrors.includes(
          error.message,
        )
      ) {
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
