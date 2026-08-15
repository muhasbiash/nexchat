export interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  participants: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}
