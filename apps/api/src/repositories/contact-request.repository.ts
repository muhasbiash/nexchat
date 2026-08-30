import { ObjectId, type Collection } from 'mongodb';

import { getMongoDb } from '../lib/mongodb.js';

export type ContactRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected';

export interface ContactRequest {
  _id?: ObjectId;
  senderId: ObjectId;
  receiverId: ObjectId;
  status: ContactRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const getContactRequestsCollection = (): Collection<ContactRequest> => {
  return getMongoDb().collection<ContactRequest>('contact_requests');
};

export const findPendingRequestBetweenUsers = async (
  userId: ObjectId,
  otherUserId: ObjectId,
): Promise<ContactRequest | null> => {
  return getContactRequestsCollection().findOne({
    status: 'pending',
    $or: [
      {
        senderId: userId,
        receiverId: otherUserId,
      },
      {
        senderId: otherUserId,
        receiverId: userId,
      },
    ],
  });
};

export const findRequestById = async (
  requestId: ObjectId,
): Promise<ContactRequest | null> => {
  return getContactRequestsCollection().findOne({
    _id: requestId,
  });
};

export const findIncomingRequests = async (
  receiverId: ObjectId,
): Promise<ContactRequest[]> => {
  return getContactRequestsCollection()
    .find({
      receiverId,
      status: 'pending',
    })
    .sort({ createdAt: -1 })
    .toArray();
};

export const findOutgoingRequests = async (
  senderId: ObjectId,
): Promise<ContactRequest[]> => {
  return getContactRequestsCollection()
    .find({
      senderId,
      status: 'pending',
    })
    .sort({ createdAt: -1 })
    .toArray();
};

export const createContactRequest = async (
  senderId: ObjectId,
  receiverId: ObjectId,
): Promise<ContactRequest> => {
  const now = new Date();

  const request: ContactRequest = {
    senderId,
    receiverId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const result = await getContactRequestsCollection().insertOne(request);

  return {
    ...request,
    _id: result.insertedId,
  };
};

export const updateContactRequestStatus = async (
  requestId: ObjectId,
  status: ContactRequestStatus,
): Promise<ContactRequest | null> => {
  const result = await getContactRequestsCollection().findOneAndUpdate(
    {
      _id: requestId,
    },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    },
    {
      returnDocument: 'after',
    },
  );

  return result;
};

export const findLatestRequestBetweenUsers = async (
  userId: ObjectId,
  otherUserId: ObjectId,
): Promise<ContactRequest | null> => {
  return getContactRequestsCollection()
    .find({
      $or: [
        {
          senderId: userId,
          receiverId: otherUserId,
        },
        {
          senderId: otherUserId,
          receiverId: userId,
        },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(1)
    .next();
};
