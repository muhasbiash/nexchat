import { ObjectId, type Db } from 'mongodb';

export interface Conversation {
  _id?: ObjectId;
  type: 'direct';
  participants: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationInput {
  type: 'direct';
  participants: ObjectId[];
}

function getConversationsCollection(db: Db) {
  return db.collection<Conversation>('conversations');
}

export async function findConversationByParticipants(
  db: Db,
  participants: ObjectId[],
): Promise<Conversation | null> {
  if (participants.length !== 2) {
    throw new Error(
      'Direct conversation requires exactly 2 participants',
    );
  }

  return getConversationsCollection(db).findOne({
    type: 'direct',
    participants: {
      $all: participants,
      $size: 2,
    },
  });
}

export async function createConversation(
  db: Db,
  input: CreateConversationInput,
): Promise<Conversation> {
  const now = new Date();

  const conversation: Conversation = {
    type: input.type,
    participants: input.participants,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getConversationsCollection(db).insertOne(
    conversation,
  );

  return {
    ...conversation,
    _id: result.insertedId,
  };
}

export async function findConversationsByUserId(
  db: Db,
  userId: ObjectId,
): Promise<Conversation[]> {
  return getConversationsCollection(db)
    .find({
      participants: userId,
    })
    .sort({
      updatedAt: -1,
    })
    .toArray();
}

export async function isUserInConversation(
  db: Db,
  conversationId: ObjectId,
  userId: ObjectId,
): Promise<boolean> {
  const conversation = await getConversationsCollection(db).findOne({
    _id: conversationId,
    participants: userId,
  });

  return conversation !== null;
}
