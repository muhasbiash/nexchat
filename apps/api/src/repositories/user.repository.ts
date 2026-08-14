import type { Collection } from 'mongodb';

import { getMongoDb } from '../lib/mongodb.js';

export interface User {
  _id?: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

const getUsersCollection = (): Collection<User> => {
  return getMongoDb().collection<User>('users');
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  return getUsersCollection().findOne({ email });
};

export const createUser = async (input: CreateUserInput): Promise<User> => {
  const now = new Date();

  const user: User = {
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getUsersCollection().insertOne(user);

  return {
    ...user,
    _id: result.insertedId.toString(),
  };
};
