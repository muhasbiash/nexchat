import { Router, type Router as ExpressRouter } from 'express';

import { getCurrentUser, loginUser, registerUser } from '../services/auth.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router: ExpressRouter = Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email, and password are required',
      });
    }

    const user = await registerUser(name, email, password);

    return res.status(201).json({
      user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Email already registered') {
      return res.status(409).json({
        message: error.message,
      });
    }

    console.error('Register error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const result = await loginUser(email, password);

    return res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid email or password') {
      return res.status(401).json({
        message: error.message,
      });
    }

    console.error('Login error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const user = await getCurrentUser(req.userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json({
      user,
    });
  } catch (error) {
    console.error('Get current user error:', error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

export default router;
