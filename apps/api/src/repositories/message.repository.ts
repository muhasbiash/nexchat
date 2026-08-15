import { ObjectId, type Collection } from 'mongodb';

import { getMongoDb } from '../lib/mongodb.js';

export interface Message {
  _id?: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string;
  createdAt: Date;
}

export interface CreateMessageInput {
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string;
}

const getMessagesCollection = (): Collection<Message> => {
  return getMongoDb().collection<Message>('messages');
};

export const createMessage = async (input: CreateMessageInput): Promise<Message> => {
  const message: Message = {
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: input.content,
    createdAt: new Date(),
  };

  const result = await getMessagesCollection().insertOne(message);

  return {
    ...message,
    _id: result.insertedId,
  };
};

export const findMessagesByConversationId = async (
  conversationId: ObjectId,
): Promise<Message[]> => {
  return getMessagesCollection()
    .find({
      conversationId,
    })
    .sort({ createdAt: 1 })
    .toArray();
};
