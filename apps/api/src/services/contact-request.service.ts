import { ObjectId } from 'mongodb';

import {
  createContactRequest,
  findLatestRequestBetweenUsers,
  findPendingRequestBetweenUsers,
  findRequestById,
  findIncomingRequests,
  findOutgoingRequests,
  updateContactRequestStatus,
} from '../repositories/contact-request.repository.js';

import { findUserById } from '../repositories/user.repository.js';

import {
  getOrCreateDirectConversation,
} from './conversation.service.js';

const validateObjectId = (id: string): ObjectId => {
  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid user ID');
  }

  return new ObjectId(id);
};

export interface ContactRequestStatusResult {
  status: 'none' | 'pending' | 'accepted' | 'rejected';
  direction: 'incoming' | 'outgoing' | null;
  requestId: string | null;
}

export const getContactRequestStatus = async (
  userId: string,
  otherUserId: string,
): Promise<ContactRequestStatusResult> => {
  const userObjectId = validateObjectId(userId);
  const otherUserObjectId = validateObjectId(otherUserId);

  if (userId === otherUserId) {
    throw new Error('Cannot check contact status with yourself');
  }

  const request = await findLatestRequestBetweenUsers(
    userObjectId,
    otherUserObjectId,
  );

  if (!request) {
    return {
      status: 'none',
      direction: null,
      requestId: null,
    };
  }

  return {
    status: request.status,
    direction: request.senderId.equals(userObjectId)
      ? 'outgoing'
      : 'incoming',
    requestId: request._id?.toHexString() ?? null,
  };
};

export const sendContactRequest = async (
  requesterId: string,
  recipientId: string,
) => {
  const requesterObjectId = validateObjectId(requesterId);
  const recipientObjectId = validateObjectId(recipientId);

  if (requesterId === recipientId) {
    throw new Error('Cannot send contact request to yourself');
  }

  const recipient = await findUserById(recipientId);

  if (!recipient) {
    throw new Error('User not found');
  }

  const existing = await findLatestRequestBetweenUsers(
    requesterObjectId,
    recipientObjectId,
  );

  if (existing) {
    if (existing.status === 'pending') {
      throw new Error('Contact request already pending');
    }

    if (existing.status === 'accepted') {
      throw new Error('Users are already contacts');
    }
  }

  return createContactRequest(
    requesterObjectId,
    recipientObjectId,
  );
};

export const getIncomingContactRequests = async (
  userId: string,
) => {
  const userObjectId = validateObjectId(userId);

  return findIncomingRequests(userObjectId);
};

export const getOutgoingContactRequests = async (
  userId: string,
) => {
  const userObjectId = validateObjectId(userId);

  return findOutgoingRequests(userObjectId);
};

export const acceptContactRequest = async (
  requestId: string,
  recipientId: string,
) => {
  if (!ObjectId.isValid(requestId)) {
    throw new Error('Invalid contact request ID');
  }

  const recipientObjectId = validateObjectId(recipientId);
  const requestObjectId = new ObjectId(requestId);

  const request = await findRequestById(requestObjectId);

  if (!request) {
    throw new Error('Contact request not found');
  }

  if (!request.receiverId.equals(recipientObjectId)) {
    throw new Error('You cannot accept this contact request');
  }

  if (request.status !== 'pending') {
    throw new Error('Contact request is no longer pending');
  }

  const updatedRequest = await updateContactRequestStatus(
    requestObjectId,
    'accepted',
  );

  if (!updatedRequest) {
    throw new Error('Contact request is no longer pending');
  }

  /*
   * Conversation dibuat HANYA setelah request diterima.
   */
  const conversationResult = await getOrCreateDirectConversation(
    request.senderId.toHexString(),
    request.receiverId.toHexString(),
  );

  return {
    request: updatedRequest,
    conversation: conversationResult.conversation,
    conversationCreated: conversationResult.created,
  };
};

export const rejectContactRequest = async (
  requestId: string,
  recipientId: string,
) => {
  if (!ObjectId.isValid(requestId)) {
    throw new Error('Invalid contact request ID');
  }

  const recipientObjectId = validateObjectId(recipientId);
  const requestObjectId = new ObjectId(requestId);

  const request = await findRequestById(requestObjectId);

  if (!request) {
    throw new Error('Contact request not found');
  }

  if (!request.receiverId.equals(recipientObjectId)) {
    throw new Error('You cannot reject this contact request');
  }

  if (request.status !== 'pending') {
    throw new Error('Contact request is no longer pending');
  }

  const updated = await updateContactRequestStatus(
    requestObjectId,
    'rejected',
  );

  if (!updated) {
    throw new Error('Contact request is no longer pending');
  }

  return updated;
};
