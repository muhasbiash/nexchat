import { ObjectId, type Collection } from 'mongodb';

import { getMongoDb } from '../lib/mongodb.js';

export interface User {
  _id?: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}
export interface UpdateUserInput {
  name?: string;
  avatarUrl?: string | null;
}
const getUsersCollection = (): Collection<User> => {
  return getMongoDb().collection<User>('users');
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  return getUsersCollection().findOne({ email });
};

export const findUserById = async (id: string): Promise<User | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return getUsersCollection().findOne({
    _id: new ObjectId(id),
  });
};

export const findAllUsers = async (): Promise<User[]> => {
  return getUsersCollection()
    .find({})
    .project<User>({
      passwordHash: 0,
    })
    .sort({ name: 1 })
    .toArray();
};
export const updateUser = async (id: string, input: UpdateUserInput): Promise<User | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const update: Partial<User> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    update.name = input.name;
  }

  if (input.avatarUrl !== undefined) {
    update.avatarUrl = input.avatarUrl;
  }

  return getUsersCollection().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' },
  );
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
    _id: result.insertedId,
  };
};
