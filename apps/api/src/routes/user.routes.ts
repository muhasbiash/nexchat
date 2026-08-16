import { Router, type Router as ExpressRouter } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getAllUsers } from '../services/user.service.js';

const router: ExpressRouter = Router();

router.use(requireAuth);

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const users = await getAllUsers();

    return res.json({
      users,
    });
  } catch (error) {
    console.error('Get users error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

export default router;
