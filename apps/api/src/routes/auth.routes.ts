import { Router, type Router as ExpressRouter } from 'express';

import { login, register } from '../services/auth.service.js';

const router: ExpressRouter = Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email, and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters',
      });
    }

    const user = await register({
      name,
      email,
      password,
    });

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

    const result = await login({
      email,
      password,
    });

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

export default router;
