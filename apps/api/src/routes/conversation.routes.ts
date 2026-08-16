import { Router, type Router as ExpressRouter } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  getOrCreateDirectConversation,
  getUserConversations,
} from '../services/conversation.service.js';
import { getSocketServer } from '../socket.js';

const router: ExpressRouter = Router();

router.use(requireAuth);

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const conversations = await getUserConversations(req.userId);

    return res.json({
      conversations,
    });
  } catch (error) {
    console.error('Get conversations error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/direct/:participantId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const participantId = Array.isArray(req.params.participantId)
      ? req.params.participantId[0]
      : req.params.participantId;

    if (!participantId) {
      return res.status(400).json({
        message: 'Participant ID is required',
      });
    }

    const result = await getOrCreateDirectConversation(req.userId, participantId);

    if (result.created) {
      const io = getSocketServer();

      io.to(`user:${participantId}`).emit('new_conversation', result.conversation);
    }

    return res.status(201).json({
      conversation: result.conversation,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Cannot create conversation with yourself') {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (error instanceof Error && error.message === 'Invalid user ID') {
      return res.status(400).json({
        message: error.message,
      });
    }

    console.error('Create conversation error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

export default router;
