import bcrypt from 'bcryptjs';
import { ObjectId, type Db } from 'mongodb';

import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
  updateUserEmailVerification,
  verifyUserEmailByTokenHash,
} from '../repositories/user.repository';
import { createToken, verifyToken } from '../lib/jwt';
import {
  createEmailVerificationToken,
  hashEmailVerificationToken,
  sendEmailVerification,
} from '../lib/email-verification';
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
): Promise<AuthUser & { emailVerificationToken: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await findUserByEmail(db, normalizedEmail);

  if (existingUser) {
    throw new Error('Email already registered');
  }

  validatePassword(password);

  const passwordHash = await bcrypt.hash(password, 10);

  const emailVerification = await createEmailVerificationToken();

  const user = await createUser(db, {
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    // Temporary: email verification is disabled until Resend/domain setup.
    emailVerified: true,
    emailVerificationTokenHash: emailVerification.tokenHash,
    emailVerificationExpiresAt: emailVerification.expiresAt,
  });

  return {
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    emailVerificationToken: emailVerification.token,
  };
}

export async function resendEmailVerification(
  db: Db,
  email: string,
  env: {
    RESEND_API_KEY: string;
    EMAIL_FROM: string;
    EMAIL_VERIFICATION_URL: string;
  },
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  const user = await findUserByEmail(db, normalizedEmail);

  if (!user || user.emailVerified !== false || !user._id) {
    return;
  }

  const emailVerification = await createEmailVerificationToken();

  await updateUserEmailVerification(db, user._id, {
    emailVerificationTokenHash: emailVerification.tokenHash,
    emailVerificationExpiresAt: emailVerification.expiresAt,
  });

  await sendEmailVerification(
    env,
    user.email,
    user.name,
    emailVerification.token,
  );
}

export async function verifyEmail(db: Db, token: string): Promise<AuthUser> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error('Invalid or expired email verification token');
  }

  const tokenHash = await hashEmailVerificationToken(normalizedToken);

  const user = await verifyUserEmailByTokenHash(db, tokenHash, new Date());

  if (!user) {
    throw new Error('Invalid or expired email verification token');
  }

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

  if (user.emailVerified === false) {
    throw new Error('Email verification required');
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
