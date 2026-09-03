import { ObjectId, type Db } from 'mongodb';

export interface Message {
  _id?: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string;
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

export interface CreateMessageInput {
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string;
}

function getMessagesCollection(db: Db) {
  return db.collection<Message>('messages');
}

export async function createMessage(db: Db, input: CreateMessageInput): Promise<Message> {
  const message: Message = {
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: input.content,
    createdAt: new Date(),
  };

  const result = await getMessagesCollection(db).insertOne(message);

  return {
    ...message,
    _id: result.insertedId,
  };
}

export async function findMessagesByConversationId(
  db: Db,
  conversationId: ObjectId,
): Promise<Message[]> {
  return getMessagesCollection(db)
    .find({
      conversationId,
    })
    .sort({
      createdAt: 1,
    })
    .toArray();
}

export async function markMessagesAsDelivered(
  db: Db,
  conversationId: ObjectId,
  recipientId: ObjectId,
  deliveredAt: Date = new Date(),
): Promise<Message[]> {
  const collection = getMessagesCollection(db);

  const messages = await collection
    .find({
      conversationId,
      senderId: { $ne: recipientId },
      deliveredAt: { $exists: false },
    })
    .toArray();

  if (messages.length === 0) {
    return [];
  }

  await collection.updateMany(
    {
      _id: {
        $in: messages
          .map((message) => message._id)
          .filter((id): id is ObjectId => id !== undefined),
      },
    },
    {
      $set: {
        deliveredAt,
      },
    },
  );

  return messages.map((message) => ({
    ...message,
    deliveredAt,
  }));
}

export async function markMessagesAsRead(
  db: Db,
  conversationId: ObjectId,
  readerId: ObjectId,
  readAt: Date = new Date(),
): Promise<Message[]> {
  const collection = getMessagesCollection(db);

  const messages = await collection
    .find({
      conversationId,
      senderId: { $ne: readerId },
      readAt: { $exists: false },
    })
    .toArray();

  if (messages.length === 0) {
    return [];
  }

  const messageIds = messages
    .map((message) => message._id)
    .filter((id): id is ObjectId => id !== undefined);

  await collection.updateMany(
    {
      _id: {
        $in: messageIds,
      },
      deliveredAt: { $exists: false },
    },
    {
      $set: {
        deliveredAt: readAt,
      },
    },
  );

  await collection.updateMany(
    {
      _id: {
        $in: messageIds,
      },
      readAt: { $exists: false },
    },
    {
      $set: {
        readAt,
      },
    },
  );

  return collection
    .find({
      _id: {
        $in: messageIds,
      },
    })
    .toArray();
}
