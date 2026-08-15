import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is not defined');
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

interface JwtPayload {
  sub?: string;
  email?: string;
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    res.status(401).json({
      message: 'Authentication required',
    });
    return;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({
      message: 'Invalid authorization header',
    });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;

    if (!payload.sub) {
      res.status(401).json({
        message: 'Invalid authentication token',
      });
      return;
    }

    req.userId = payload.sub;
    req.userEmail = payload.email;

    next();
  } catch {
    res.status(401).json({
      message: 'Invalid or expired authentication token',
    });
  }
};
