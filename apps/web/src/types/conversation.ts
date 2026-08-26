export interface ConversationParticipant {
  id: string;
  name: string;
  email: string;
}

export interface Conversation {
  id: string;
  type: 'direct';
  participants: ConversationParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}
