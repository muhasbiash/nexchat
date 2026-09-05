import bcrypt from 'bcryptjs';
import { ObjectId, type Db } from 'mongodb';

import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
} from '../repositories/user.repository';
import { createToken, verifyToken } from '../lib/jwt';
import { validatePassword } from '../lib/password';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export async function registerUser(
  db: Db,
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await findUserByEmail(db, normalizedEmail);

  if (existingUser) {
    throw new Error('Email already registered');
  }

  validatePassword(password);

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
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
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

  const user = await findUserByEmail(db, normalizedEmail);

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordValid = bcrypt.compareSync(password, user.passwordHash);

  if (!passwordValid) {
    throw new Error('Invalid email or password');
  }

  const userId = user._id!.toString();

  const token = await createToken(userId, user.email, jwtSecret);

  return {
    user: {
      id: userId,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
    },
    token,
  };
}

export async function updateCurrentUser(
  db: Db,
  userId: string,
  input: {
    name?: string;
    avatarUrl?: string | null;
    bio?: string | null;
  },
): Promise<AuthUser | null> {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  const update: {
    name?: string;
    avatarUrl?: string | null;
    bio?: string | null;
  } = {};

  if (input.name !== undefined) {
    const normalizedName = input.name.trim();

    if (!normalizedName) {
      throw new Error('Name is required');
    }

    update.name = normalizedName;
  }

  if (input.avatarUrl !== undefined) {
    update.avatarUrl = input.avatarUrl;
  }

  if (input.bio !== undefined) {
    update.bio = input.bio?.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    throw new Error('No profile changes provided');
  }

  const user = await updateUser(db, new ObjectId(userId), update);

  if (!user || !user._id) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
  };
}

export async function getCurrentUser(db: Db, userId: string): Promise<AuthUser | null> {
  const user = await findUserById(db, userId);

  if (!user || !user._id) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
  };
}

export { verifyToken };
