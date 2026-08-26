import bcrypt from 'bcryptjs';
import type { Db } from 'mongodb';

import {
  createUser,
  findUserByEmail,
  findUserById,
} from '../repositories/user.repository';
import {
  createToken,
  verifyToken,
} from '../lib/jwt';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export async function registerUser(
  db: Db,
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await findUserByEmail(
    db,
    normalizedEmail,
  );

  if (existingUser) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await createUser(db, {
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  return {
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
  };
}

export async function loginUser(
  db: Db,
  email: string,
  password: string,
  jwtSecret: string,
): Promise<{
  user: AuthUser;
  token: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await findUserByEmail(
    db,
    normalizedEmail,
  );

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordValid = bcrypt.compareSync(
    password,
    user.passwordHash,
  );

  if (!passwordValid) {
    throw new Error('Invalid email or password');
  }

  const userId = user._id!.toString();

  const token = await createToken(
    userId,
    user.email,
    jwtSecret,
  );

  return {
    user: {
      id: userId,
      name: user.name,
      email: user.email,
    },
    token,
  };
}

export async function getCurrentUser(
  db: Db,
  userId: string,
): Promise<AuthUser | null> {
  const user = await findUserById(db, userId);

  if (!user || !user._id) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

export { verifyToken };