import { Router, type Router as ExpressRouter } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { verifyConversationMembership } from '../services/conversation.service.js';
import { getConversationMessages, sendMessage } from '../services/message.service.js';

const router: ExpressRouter = Router();

router.use(requireAuth);

router.get('/:conversationId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        message: 'Conversation ID is required',
      });
    }

    const isMember = await verifyConversationMembership(
      conversationId,
      req.userId,
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'You are not a member of this conversation',
      });
    }

    const messages = await getConversationMessages(conversationId);

    return res.json({
      messages,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid conversation ID') {
      return res.status(400).json({
        message: error.message,
      });
    }

    console.error('Get messages error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/:conversationId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        message: 'Conversation ID is required',
      });
    }

    const isMember = await verifyConversationMembership(
      conversationId,
      req.userId,
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'You are not a member of this conversation',
      });
    }

    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        message: 'Message content is required',
      });
    }

    const message = await sendMessage(
      conversationId,
      req.userId,
      content,
    );

    return res.status(201).json({
      message,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Invalid ID' ||
        error.message === 'Message content is required')
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    console.error('Send message error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

export default router;