import { ObjectId, type Db } from 'mongodb';

export interface User {
  _id?: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

function getUsersCollection(db: Db) {
  return db.collection<User>('users');
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  return getUsersCollection(db).findOne({
    email,
  });
}

export async function findUserById(db: Db, id: string): Promise<User | null> {
  console.log('[UserRepository] findUserById start:', id);

  if (!ObjectId.isValid(id)) {
    console.log('[UserRepository] invalid ObjectId');

    return null;
  }

  console.log('[UserRepository] ObjectId valid');

  const collection = getUsersCollection(db);

  console.log('[UserRepository] collection obtained');

  const objectId = new ObjectId(id);

  console.log('[UserRepository] ObjectId created:', objectId.toString());

  console.log('[UserRepository] calling findOne');

  const user = await collection.findOne({
    _id: objectId,
  });

  console.log('[UserRepository] findOne completed:', Boolean(user));

  return user;
}

export async function createUser(db: Db, input: CreateUserInput): Promise<User> {
  const now = new Date();

  const user: User = {
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getUsersCollection(db).insertOne(user);

  return {
    ...user,
    _id: result.insertedId,
  };
}

export async function updateUser(
  db: Db,
  userId: ObjectId,
  input: { name?: string; avatarUrl?: string | null; bio?: string | null },
): Promise<User | null> {
  const result = await getUsersCollection(db).findOneAndUpdate(
    { _id: userId },
    {
      $set: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  return result;
}

export async function findAllUsers(db: Db): Promise<User[]> {
  return getUsersCollection(db)
    .find({})
    .project<User>({
      passwordHash: 0,
    })
    .sort({
      name: 1,
    })
    .toArray();
}
