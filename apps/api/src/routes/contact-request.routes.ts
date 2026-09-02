import { Router, type Router as ExpressRouter } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

import {
  acceptContactRequest,
  getContactRequestStatus,
  getIncomingContactRequests,
  getOutgoingContactRequests,
  rejectContactRequest,
  sendContactRequest,
} from '../services/contact-request.service.js';

import { getSocketServer } from '../socket.js';

const router: ExpressRouter = Router();

router.use(requireAuth);

router.get('/status/:userId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    if (!userId) {
      return res.status(400).json({
        message: 'User ID is required',
      });
    }

    const status = await getContactRequestStatus(req.userId, userId);

    return res.json(status);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.get('/incoming', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const requests = await getIncomingContactRequests(req.userId);

    return res.json({
      requests,
    });
  } catch (error) {
    console.error('Get incoming contact requests error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.get('/outgoing', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const requests = await getOutgoingContactRequests(req.userId);

    return res.json({
      requests,
    });
  } catch (error) {
    console.error('Get outgoing contact requests error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/:userId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    if (!userId) {
      return res.status(400).json({
        message: 'User ID is required',
      });
    }

    const request = await sendContactRequest(req.userId, userId);

    const requestPayload = {
      id: request._id?.toHexString() ?? '',
      senderId: request.senderId.toHexString(),
      receiverId: request.receiverId.toHexString(),
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };

    const io = getSocketServer();

    io.to(`user:${userId}`).emit('contact_request_received', {
      request: requestPayload,
    });

    return res.status(201).json({
      request: requestPayload,
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/:requestId/accept', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const requestId = Array.isArray(req.params.requestId)
      ? req.params.requestId[0]
      : req.params.requestId;

    if (!requestId) {
      return res.status(400).json({
        message: 'Contact request ID is required',
      });
    }

    const result = await acceptContactRequest(requestId, req.userId);

    const io = getSocketServer();

    const conversation = result.conversation;

    const conversationPayload = {
      id: conversation.id,
      type: conversation.type,
      participants: conversation.participants.map(
        (participantId: (typeof conversation.participants)[number]) => participantId.toHexString(),
      ),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    const requestPayload = {
      id: result.request._id?.toHexString() ?? '',
      senderId: result.request.senderId.toHexString(),
      receiverId: result.request.receiverId.toHexString(),
      status: result.request.status,
      createdAt: result.request.createdAt,
      updatedAt: result.request.updatedAt,
    };

    /*
     * Beri tahu pengirim bahwa request diterima
     * dan conversation sudah tersedia.
     */
    io.to(`user:${result.request.senderId.toHexString()}`).emit('contact_request_accepted', {
      request: requestPayload,
      conversation: conversationPayload,
    });

    /*
     * Beri tahu penerima juga agar UI langsung
     * memperbarui daftar conversation.
     */
    io.to(`user:${result.request.receiverId.toHexString()}`).emit('contact_request_accepted', {
      request: requestPayload,
      conversation: conversationPayload,
    });

    return res.json({
      request: requestPayload,
      conversation: conversationPayload,
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/:requestId/reject', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const requestId = Array.isArray(req.params.requestId)
      ? req.params.requestId[0]
      : req.params.requestId;

    if (!requestId) {
      return res.status(400).json({
        message: 'Contact request ID is required',
      });
    }

    const request = await rejectContactRequest(requestId, req.userId);

    const io = getSocketServer();

    io.to(`user:${request.senderId.toHexString()}`).emit('contact_request_rejected', {
      requestId,
    });

    return res.json({
      request: {
        id: request._id?.toHexString() ?? '',
        status: request.status,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

export default router;
