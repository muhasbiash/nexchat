import { ObjectId, type Db } from 'mongodb';

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

function getMessagesCollection(db: Db) {
  return db.collection<Message>('messages');
}

export async function createMessage(
  db: Db,
  input: CreateMessageInput,
): Promise<Message> {
  const message: Message = {
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: input.content,
    createdAt: new Date(),
  };

  const result = await getMessagesCollection(db).insertOne(
    message,
  );

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
