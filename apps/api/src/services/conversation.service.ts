import { ObjectId } from 'mongodb';

import {
  createConversation,
  findConversationByParticipants,
  findConversationsByUserId,
} from '../repositories/conversation.repository.js';

export const getOrCreateDirectConversation = async (userId: string, participantId: string) => {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(participantId)) {
    throw new Error('Invalid user ID');
  }

  if (userId === participantId) {
    throw new Error('Cannot create conversation with yourself');
  }

  const participants = [new ObjectId(userId), new ObjectId(participantId)];

  const existingConversation = await findConversationByParticipants(participants);

  if (existingConversation) {
    return existingConversation;
  }

  return createConversation({
    type: 'direct',
    participants,
  });
};

export const getUserConversations = async (userId: string) => {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }

  return findConversationsByUserId(new ObjectId(userId));
};
