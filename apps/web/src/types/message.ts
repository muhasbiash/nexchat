export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface MessagesResponse {
  messages: Message[];
}
