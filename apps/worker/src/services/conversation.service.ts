import { ObjectId, type Db } from 'mongodb';

import {
  createConversation,
  findConversationByParticipants,
  findConversationsByUserId,
} from '../repositories/conversation.repository';

import {
  findUserById,
} from '../repositories/user.repository';

export interface ConversationUser {
  id: string;
  name: string;
  email: string;
}

export interface Conversation {
  id: string;
  type: 'direct';
  participants: ConversationUser[];
  createdAt: Date;
  updatedAt: Date;
}

async function buildConversation(
  db: Db,
  conversation: {
    _id?: ObjectId;
    type: 'direct';
    participants: ObjectId[];
    createdAt: Date;
    updatedAt: Date;
  },
): Promise<Conversation> {
  const participants: ConversationUser[] = [];

  for (const participantId of conversation.participants) {
    const user = await findUserById(
      db,
      participantId.toString(),
    );

    if (!user || !user._id) {
      throw new Error('Conversation user not found');
    }

    participants.push({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  }

  return {
    id: conversation._id!.toString(),
    type: conversation.type,
    participants,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export async function getUserConversations(
  db: Db,
  userId: string,
): Promise<Conversation[]> {
  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid current user id');
  }

  const conversations =
    await findConversationsByUserId(
      db,
      new ObjectId(userId),
    );

  return Promise.all(
    conversations.map((conversation) =>
      buildConversation(
        db,
        conversation,
      ),
    ),
  );
}

export async function createDirectConversation(
  db: Db,
  currentUserId: string,
  participantId: string,
): Promise<Conversation> {
  if (!ObjectId.isValid(currentUserId)) {
    throw new Error('Invalid current user id');
  }

  if (!ObjectId.isValid(participantId)) {
    throw new Error('Invalid participant id');
  }

  if (currentUserId === participantId) {
    throw new Error(
      'Cannot create conversation with yourself',
    );
  }

  const currentUserObjectId =
    new ObjectId(currentUserId);

  const participantObjectId =
    new ObjectId(participantId);

  const currentUser = await findUserById(
    db,
    currentUserId,
  );

  if (!currentUser) {
    throw new Error(
      'Conversation user not found',
    );
  }

  const participant = await findUserById(
    db,
    participantId,
  );

  if (!participant) {
    throw new Error(
      'Participant not found',
    );
  }

  const existing =
    await findConversationByParticipants(
      db,
      [
        currentUserObjectId,
        participantObjectId,
      ],
    );

  if (existing) {
    return buildConversation(
      db,
      existing,
    );
  }

  const conversation =
    await createConversation(
      db,
      {
        type: 'direct',
        participants: [
          currentUserObjectId,
          participantObjectId,
        ],
      },
    );

  return buildConversation(
    db,
    conversation,
  );
}
