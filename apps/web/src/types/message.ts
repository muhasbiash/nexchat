export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface MessagesResponse {
  messages: Message[];
}
