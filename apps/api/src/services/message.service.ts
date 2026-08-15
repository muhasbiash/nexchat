import { ObjectId } from 'mongodb';

import { createMessage, findMessagesByConversationId } from '../repositories/message.repository.js';

export const sendMessage = async (conversationId: string, senderId: string, content: string) => {
  if (!ObjectId.isValid(conversationId) || !ObjectId.isValid(senderId)) {
    throw new Error('Invalid ID');
  }

  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error('Message content is required');
  }

  return createMessage({
    conversationId: new ObjectId(conversationId),
    senderId: new ObjectId(senderId),
    content: trimmedContent,
  });
};

export const getConversationMessages = async (conversationId: string) => {
  if (!ObjectId.isValid(conversationId)) {
    throw new Error('Invalid conversation ID');
  }

  return findMessagesByConversationId(new ObjectId(conversationId));
};
