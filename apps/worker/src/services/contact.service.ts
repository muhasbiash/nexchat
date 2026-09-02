import { ObjectId, type Db } from 'mongodb';

import {
  createContactRequest,
  deleteContact,
  findAcceptedContactById,
  findAcceptedContacts,
  findContactBetweenUsers,
  findPendingIncomingRequests,
  findPendingOutgoingRequests,
  reuseRejectedContactRequest,
  updateContactStatus,
  type Contact,
} from '../repositories/contact.repository';

import { findUserById } from '../repositories/user.repository';

import { createDirectConversation } from './conversation.service';

export interface ContactRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

function toContactRequest(contact: Contact): ContactRequest {
  return {
    id: contact._id!.toString(),
    senderId: contact.requesterId.toString(),
    receiverId: contact.recipientId.toString(),
    status: contact.status,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export async function requestContact(
  db: Db,
  requesterId: string,
  recipientId: string,
): Promise<ContactRequest> {
  if (!ObjectId.isValid(requesterId)) {
    throw new Error('Invalid requester id');
  }

  if (!ObjectId.isValid(recipientId)) {
    throw new Error('Invalid recipient id');
  }

  if (requesterId === recipientId) {
    throw new Error('Cannot add yourself as a contact');
  }

  const requester = await findUserById(db, requesterId);

  if (!requester) {
    throw new Error('Requester not found');
  }

  const recipient = await findUserById(db, recipientId);

  if (!recipient) {
    throw new Error('Recipient not found');
  }

  const existing = await findContactBetweenUsers(
    db,
    new ObjectId(requesterId),
    new ObjectId(recipientId),
  );

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Users are already contacts');
    }

    if (existing.status === 'pending') {
      throw new Error('Contact request already exists');
    }

    if (existing.status === 'rejected') {
      const reused = await reuseRejectedContactRequest(
        db,
        existing._id!,
        new ObjectId(requesterId),
        new ObjectId(recipientId),
      );

      if (!reused) {
        throw new Error('Failed to reuse rejected contact request');
      }

      return toContactRequest(reused);
    }
  }

  const contact = await createContactRequest(
    db,
    new ObjectId(requesterId),
    new ObjectId(recipientId),
  );

  return toContactRequest(contact);
}

export async function acceptContactRequest(
  db: Db,
  currentUserId: string,
  contactId: string,
): Promise<{
  request: ContactRequest;
  conversation: Awaited<ReturnType<typeof createDirectConversation>>;
}> {
  if (!ObjectId.isValid(currentUserId)) {
    throw new Error('Invalid user id');
  }

  if (!ObjectId.isValid(contactId)) {
    throw new Error('Invalid contact id');
  }

  const contacts = await findPendingIncomingRequests(db, new ObjectId(currentUserId));

  const request = contacts.find((item) => item._id?.toString() === contactId);

  if (!request) {
    throw new Error('Contact request not found');
  }

  const updated = await updateContactStatus(db, new ObjectId(contactId), 'accepted');

  if (!updated) {
    throw new Error('Contact request not found');
  }

  const conversation = await createDirectConversation(
    db,
    currentUserId,
    request.requesterId.toString(),
  );

  return {
    request: toContactRequest(updated),
    conversation,
  };
}

export async function rejectContactRequest(
  db: Db,
  currentUserId: string,
  contactId: string,
): Promise<ContactRequest> {
  if (!ObjectId.isValid(currentUserId)) {
    throw new Error('Invalid user id');
  }

  if (!ObjectId.isValid(contactId)) {
    throw new Error('Invalid contact id');
  }

  const contacts = await findPendingIncomingRequests(db, new ObjectId(currentUserId));

  const request = contacts.find((item) => item._id?.toString() === contactId);

  if (!request) {
    throw new Error('Contact request not found');
  }

  const updated = await updateContactStatus(db, new ObjectId(contactId), 'rejected');

  if (!updated) {
    throw new Error('Contact request not found');
  }

  return toContactRequest(updated);
}

export async function getContacts(db: Db, userId: string): Promise<ContactRequest[]> {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  const contacts = await findAcceptedContacts(db, new ObjectId(userId));

  return contacts.map(toContactRequest);
}

export async function getIncomingRequests(db: Db, userId: string): Promise<ContactRequest[]> {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  const requests = await findPendingIncomingRequests(db, new ObjectId(userId));

  return requests.map(toContactRequest);
}

export async function getOutgoingRequests(db: Db, userId: string): Promise<ContactRequest[]> {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  const requests = await findPendingOutgoingRequests(db, new ObjectId(userId));

  return requests.map(toContactRequest);
}

export async function getContactRequestStatus(
  db: Db,
  currentUserId: string,
  otherUserId: string,
): Promise<{
  status: 'none' | 'pending' | 'accepted' | 'rejected';
  direction: 'incoming' | 'outgoing' | null;
  requestId: string | null;
}> {
  if (!ObjectId.isValid(currentUserId) || !ObjectId.isValid(otherUserId)) {
    throw new Error('Invalid user id');
  }

  const contact = await findContactBetweenUsers(
    db,
    new ObjectId(currentUserId),
    new ObjectId(otherUserId),
  );

  if (!contact) {
    return {
      status: 'none',
      direction: null,
      requestId: null,
    };
  }

  const direction = contact.requesterId.toString() === currentUserId ? 'outgoing' : 'incoming';

  return {
    status: contact.status,
    direction,
    requestId: contact._id?.toString() ?? null,
  };
}

export async function removeContact(db: Db, userId: string, contactId: string) {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  if (!ObjectId.isValid(contactId)) {
    throw new Error('Invalid contact id');
  }

  const contact = await findAcceptedContactById(db, new ObjectId(contactId), new ObjectId(userId));

  if (!contact) {
    throw new Error('Contact not found');
  }

  const removed = await deleteContact(db, contact._id!);

  if (!removed) {
    throw new Error('Contact could not be removed');
  }

  return toContactRequest(contact);
}

export async function areUsersContacts(db: Db, userAId: string, userBId: string): Promise<boolean> {
  if (!ObjectId.isValid(userAId) || !ObjectId.isValid(userBId)) {
    return false;
  }

  const contact = await findContactBetweenUsers(db, new ObjectId(userAId), new ObjectId(userBId));

  return contact?.status === 'accepted';
}
