import { ObjectId, type Db } from 'mongodb';

import {
  createMessage,
  findMessagesByConversationId,
  markMessagesAsDelivered,
  markMessagesAsRead,
} from '../repositories/message.repository';

import {
  findConversationById,
  isUserInConversation,
} from '../repositories/conversation.repository';

import { areUsersContacts } from './contact.service';

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

function serializeMessage(message: {
  _id?: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string;
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}): MessageResponse {
  return {
    id: message._id!.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    content: message.content,
    createdAt: message.createdAt,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
  };
}

export async function createConversationMessage(
  db: Db,
  conversationId: string,
  senderId: string,
  content: string,
): Promise<MessageResponse> {
  if (!ObjectId.isValid(conversationId)) {
    throw new Error('Invalid conversation id');
  }

  if (!ObjectId.isValid(senderId)) {
    throw new Error('Invalid sender id');
  }

  const normalizedContent = content.trim();

  if (!normalizedContent) {
    throw new Error('Message content is required');
  }

  const conversationObjectId = new ObjectId(conversationId);
  const senderObjectId = new ObjectId(senderId);

  const allowed = await isUserInConversation(db, conversationObjectId, senderObjectId);

  if (!allowed) {
    throw new Error('User is not a member of this conversation');
  }

  const conversation = await findConversationById(db, conversationObjectId);

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const participantIds = conversation.participants.map((participant) => participant.toString());

  const otherParticipantId = participantIds.find((participantId) => participantId !== senderId);

  if (!otherParticipantId) {
    throw new Error('Conversation participant not found');
  }

  const areContacts = await areUsersContacts(db, senderId, otherParticipantId);

  if (!areContacts) {
    throw new Error('Users must be accepted contacts before sending messages');
  }

  const message = await createMessage(db, {
    conversationId: conversationObjectId,
    senderId: senderObjectId,
    content: normalizedContent,
  });

  return serializeMessage(message);
}

export async function getConversationMessages(
  db: Db,
  conversationId: string,
  userId: string,
): Promise<MessageResponse[]> {
  if (!ObjectId.isValid(conversationId)) {
    throw new Error('Invalid conversation id');
  }

  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  const conversationObjectId = new ObjectId(conversationId);
  const userObjectId = new ObjectId(userId);

  const allowed = await isUserInConversation(db, conversationObjectId, userObjectId);

  if (!allowed) {
    throw new Error('User is not a member of this conversation');
  }

  const messages = await findMessagesByConversationId(db, conversationObjectId);

  return messages.map(serializeMessage);
}

export async function deliverConversationMessages(
  db: Db,
  conversationId: string,
  recipientId: string,
): Promise<MessageResponse[]> {
  if (!ObjectId.isValid(conversationId)) {
    throw new Error('Invalid conversation id');
  }

  if (!ObjectId.isValid(recipientId)) {
    throw new Error('Invalid recipient id');
  }

  const conversationObjectId = new ObjectId(conversationId);
  const recipientObjectId = new ObjectId(recipientId);

  const allowed = await isUserInConversation(db, conversationObjectId, recipientObjectId);

  if (!allowed) {
    throw new Error('User is not a member of this conversation');
  }

  const messages = await markMessagesAsDelivered(db, conversationObjectId, recipientObjectId);

  return messages.map(serializeMessage);
}

export async function readConversationMessages(
  db: Db,
  conversationId: string,
  readerId: string,
): Promise<MessageResponse[]> {
  if (!ObjectId.isValid(conversationId)) {
    throw new Error('Invalid conversation id');
  }

  if (!ObjectId.isValid(readerId)) {
    throw new Error('Invalid reader id');
  }

  const conversationObjectId = new ObjectId(conversationId);
  const readerObjectId = new ObjectId(readerId);

  const allowed = await isUserInConversation(db, conversationObjectId, readerObjectId);

  if (!allowed) {
    throw new Error('User is not a member of this conversation');
  }

  const messages = await markMessagesAsRead(db, conversationObjectId, readerObjectId);

  return messages.map(serializeMessage);
}
