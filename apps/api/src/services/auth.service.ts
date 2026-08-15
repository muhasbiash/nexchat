import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { createUser, findUserByEmail } from '../repositories/user.repository.js';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is not defined');
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

const sanitizeUser = (user: {
  _id?: { toString(): string };
  name: string;
  email: string;
}): AuthUser => {
  if (!user._id) {
    throw new Error('User ID is missing');
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
};

export const register = async (input: RegisterInput): Promise<AuthUser> => {
  const email = input.email.trim().toLowerCase();

  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await createUser({
    name: input.name.trim(),
    email,
    passwordHash,
  });

  return sanitizeUser(user);
};

export const login = async (input: LoginInput): Promise<{ user: AuthUser; token: string }> => {
  const email = input.email.trim().toLowerCase();

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new Error('Invalid email or password');
  }

  if (!user._id) {
    throw new Error('User ID is missing');
  }

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
    },
    jwtSecret,
    {
      expiresIn: '1d',
    },
  );

  return {
    user: sanitizeUser(user),
    token,
  };
};
