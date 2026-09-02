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

export interface ConversationResponse {
  id: string;
  type: 'direct';
  participants: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const getConversationsCollection = (): Collection<Conversation> => {
  return getMongoDb().collection<Conversation>('conversations');
};

const toConversationResponse = (conversation: Conversation): ConversationResponse => {
  if (!conversation._id) {
    throw new Error('Conversation ID is missing');
  }

  return {
    id: conversation._id.toHexString(),
    type: conversation.type,
    participants: conversation.participants,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

export const findConversationByParticipants = async (
  participants: ObjectId[],
): Promise<ConversationResponse | null> => {
  const conversation = await getConversationsCollection().findOne({
    type: 'direct',
    participants: {
      $all: participants,
    },
  });

  return conversation ? toConversationResponse(conversation) : null;
};

export const createConversation = async (
  input: CreateConversationInput,
): Promise<ConversationResponse> => {
  const now = new Date();

  const conversation: Conversation = {
    type: input.type,
    participants: input.participants,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getConversationsCollection().insertOne(conversation);

  return toConversationResponse({
    ...conversation,
    _id: result.insertedId,
  });
};

export const findConversationsByUserId = async (
  userId: ObjectId,
): Promise<ConversationResponse[]> => {
  const conversations = await getConversationsCollection()
    .find({
      participants: userId,
    })
    .sort({ updatedAt: -1 })
    .toArray();

  return conversations.map(toConversationResponse);
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
