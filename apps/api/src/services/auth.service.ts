import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { createUser, findUserByEmail, findUserById } from '../repositories/user.repository.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined');
}
interface TokenPayload {
  sub: string;
  email: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export const registerUser = async (
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await createUser({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  return {
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
  };
};

export const loginUser = async (
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    throw new Error('Invalid email or password');
  }

  const userId = user._id!.toString();

  const token = jwt.sign(
    {
      sub: userId,
      email: user.email,
    },
    JWT_SECRET,
    {
      expiresIn: '24h',
    },
  );

  return {
    user: {
      id: userId,
      name: user.name,
      email: user.email,
    },
    token,
  };
};

export const getCurrentUser = async (userId: string): Promise<AuthUser | null> => {
  const user = await findUserById(userId);

  if (!user || !user._id) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
};

export const verifyToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.email !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
  };
};
