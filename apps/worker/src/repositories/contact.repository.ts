import { ObjectId, type Db } from 'mongodb';

export type ContactRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface Contact {
  _id?: ObjectId;
  requesterId: ObjectId;
  recipientId: ObjectId;
  status: ContactRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

function getContactsCollection(db: Db) {
  return db.collection<Contact>('contacts');
}

export async function findContactBetweenUsers(
  db: Db,
  userA: ObjectId,
  userB: ObjectId,
): Promise<Contact | null> {
  return getContactsCollection(db).findOne({
    $or: [
      {
        requesterId: userA,
        recipientId: userB,
      },
      {
        requesterId: userB,
        recipientId: userA,
      },
    ],
  });
}

export async function createContactRequest(
  db: Db,
  requesterId: ObjectId,
  recipientId: ObjectId,
): Promise<Contact> {
  const now = new Date();

  const contact: Contact = {
    requesterId,
    recipientId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const result = await getContactsCollection(db).insertOne(contact);

  return {
    ...contact,
    _id: result.insertedId,
  };
}

export async function updateContactStatus(
  db: Db,
  contactId: ObjectId,
  status: ContactRequestStatus,
): Promise<Contact | null> {
  const result = await getContactsCollection(db).findOneAndUpdate(
    {
      _id: contactId,
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
}

export async function reuseRejectedContactRequest(
  db: Db,
  contactId: ObjectId,
  requesterId: ObjectId,
  recipientId: ObjectId,
): Promise<Contact | null> {
  const now = new Date();

  const result = await getContactsCollection(db).findOneAndUpdate(
    {
      _id: contactId,
      status: 'rejected',
    },
    {
      $set: {
        requesterId,
        recipientId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      returnDocument: 'after',
    },
  );

  return result;
}

export async function findPendingOutgoingRequests(
  db: Db,
  requesterId: ObjectId,
): Promise<Contact[]> {
  return getContactsCollection(db)
    .find({
      requesterId,
      status: 'pending',
    })
    .sort({
      createdAt: -1,
    })
    .toArray();
}

export async function findPendingIncomingRequests(
  db: Db,
  recipientId: ObjectId,
): Promise<Contact[]> {
  return getContactsCollection(db)
    .find({
      recipientId,
      status: 'pending',
    })
    .sort({
      createdAt: -1,
    })
    .toArray();
}

export async function findAcceptedContacts(db: Db, userId: ObjectId): Promise<Contact[]> {
  return getContactsCollection(db)
    .find({
      status: 'accepted',
      $or: [
        {
          requesterId: userId,
        },
        {
          recipientId: userId,
        },
      ],
    })
    .sort({
      updatedAt: -1,
    })
    .toArray();
}

export async function findAcceptedContactById(
  db: Db,
  contactId: ObjectId,
  userId: ObjectId,
): Promise<Contact | null> {
  return getContactsCollection(db).findOne({
    _id: contactId,
    status: 'accepted',
    $or: [
      {
        requesterId: userId,
      },
      {
        recipientId: userId,
      },
    ],
  });
}

export async function deleteContact(db: Db, contactId: ObjectId): Promise<boolean> {
  const result = await getContactsCollection(db).deleteOne({
    _id: contactId,
  });

  return result.deletedCount === 1;
}
