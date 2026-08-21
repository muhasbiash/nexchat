import { ObjectId, type Collection } from 'mongodb';

import { getMongoDb } from '../lib/mongodb.js';

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

const getConversationsCollection = (): Collection<Conversation> => {
  return getMongoDb().collection<Conversation>('conversations');
};

export const findConversationByParticipants = async (
  participants: ObjectId[],
): Promise<Conversation | null> => {
  return getConversationsCollection().findOne({
    type: 'direct',
    participants: {
      $all: participants,
    },
  });
};

export const createConversation = async (input: CreateConversationInput): Promise<Conversation> => {
  const now = new Date();

  const conversation: Conversation = {
    type: input.type,
    participants: input.participants,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getConversationsCollection().insertOne(conversation);

  return {
    ...conversation,
    _id: result.insertedId,
  };
};

export const findConversationsByUserId = async (userId: ObjectId): Promise<Conversation[]> => {
  return getConversationsCollection()
    .find({
      participants: userId,
    })
    .sort({ updatedAt: -1 })
    .toArray();
};

export const isUserInConversation = async (
  conversationId: ObjectId,
  userId: ObjectId,
): Promise<boolean> => {
  const conversation = await getConversationsCollection().findOne({
    _id: conversationId,
    participants: userId,
  });

  return conversation !== null;
};