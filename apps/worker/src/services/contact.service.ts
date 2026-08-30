import { ObjectId, type Db } from 'mongodb';

import {
  createContactRequest,
  deleteContact,
  findAcceptedContacts,
  findContactBetweenUsers,
  findPendingIncomingRequests,
  updateContactStatus,
} from '../repositories/contact.repository';

import {
  findUserById,
} from '../repositories/user.repository';

export async function requestContact(
  db: Db,
  requesterId: string,
  recipientId: string,
) {
  if (!ObjectId.isValid(requesterId)) {
    throw new Error('Invalid requester id');
  }

  if (!ObjectId.isValid(recipientId)) {
    throw new Error('Invalid recipient id');
  }

  if (requesterId === recipientId) {
    throw new Error('Cannot add yourself as a contact');
  }

  const requester = await findUserById(
    db,
    requesterId,
  );

  if (!requester) {
    throw new Error('Requester not found');
  }

  const recipient = await findUserById(
    db,
    recipientId,
  );

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
      throw new Error('Contact request was rejected');
    }
  }

  return createContactRequest(
    db,
    new ObjectId(requesterId),
    new ObjectId(recipientId),
  );
}

export async function acceptContactRequest(
  db: Db,
  currentUserId: string,
  contactId: string,
) {
  if (!ObjectId.isValid(currentUserId)) {
    throw new Error('Invalid user id');
  }

  if (!ObjectId.isValid(contactId)) {
    throw new Error('Invalid contact id');
  }

  const contacts = await findPendingIncomingRequests(
    db,
    new ObjectId(currentUserId),
  );

  const request = contacts.find(
    (item) =>
      item._id?.toString() === contactId,
  );

  if (!request) {
    throw new Error('Contact request not found');
  }

  return updateContactStatus(
    db,
    new ObjectId(contactId),
    'accepted',
  );
}

export async function rejectContactRequest(
  db: Db,
  currentUserId: string,
  contactId: string,
) {
  if (!ObjectId.isValid(currentUserId)) {
    throw new Error('Invalid user id');
  }

  if (!ObjectId.isValid(contactId)) {
    throw new Error('Invalid contact id');
  }

  const contacts = await findPendingIncomingRequests(
    db,
    new ObjectId(currentUserId),
  );

  const request = contacts.find(
    (item) =>
      item._id?.toString() === contactId,
  );

  if (!request) {
    throw new Error('Contact request not found');
  }

  return updateContactStatus(
    db,
    new ObjectId(contactId),
    'rejected',
  );
}

export async function getContacts(
  db: Db,
  userId: string,
) {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  return findAcceptedContacts(
    db,
    new ObjectId(userId),
  );
}

export async function getIncomingRequests(
  db: Db,
  userId: string,
) {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  return findPendingIncomingRequests(
    db,
    new ObjectId(userId),
  );
}

export async function removeContact(
  db: Db,
  userId: string,
  contactId: string,
) {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }

  if (!ObjectId.isValid(contactId)) {
    throw new Error('Invalid contact id');
  }

  const contact = await findContactBetweenUsers(
    db,
    new ObjectId(userId),
    new ObjectId(contactId),
  );

  if (!contact || contact.status !== 'accepted') {
    throw new Error('Contact not found');
  }

  const removed = await deleteContact(
    db,
    contact._id!,
  );

  if (!removed) {
    throw new Error('Contact could not be removed');
  }

  return true;
}

export async function areUsersContacts(
  db: Db,
  userAId: string,
  userBId: string,
): Promise<boolean> {
  if (
    !ObjectId.isValid(userAId) ||
    !ObjectId.isValid(userBId)
  ) {
    return false;
  }

  const contact = await findContactBetweenUsers(
    db,
    new ObjectId(userAId),
    new ObjectId(userBId),
  );

  return contact?.status === 'accepted';
}
