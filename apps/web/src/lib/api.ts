import type { Conversation, ConversationsResponse } from '../types/conversation';
import type { Message, MessagesResponse } from '../types/message';
import type { ApiUser, UsersResponse } from '../types/user';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
}

interface ConversationResponse {
  conversation: Conversation;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);

  headers.set('Content-Type', 'application/json');

  if (authenticated) {
    const token = localStorage.getItem('nexchat_token');

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }

  return data as T;
}

export async function getUsers(): Promise<ApiUser[]> {
  const data = await api<UsersResponse>('/api/users', {
    authenticated: true,
  });

  return data.users;
}

export async function getConversations(): Promise<Conversation[]> {
  const data = await api<ConversationsResponse>('/api/conversations', {
    authenticated: true,
  });

  return data.conversations;
}

export async function createDirectConversation(participantId: string): Promise<Conversation> {
  const data = await api<ConversationResponse>(`/api/conversations/direct/${participantId}`, {
    method: 'POST',
    authenticated: true,
  });

  return data.conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const data = await api<MessagesResponse>(`/api/messages/${conversationId}`, {
    authenticated: true,
  });

  return data.messages;
}

export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const data = await api<{ message: Message }>(`/api/messages/${conversationId}`, {
    method: 'POST',
    authenticated: true,
    body: JSON.stringify({
      content,
    }),
  });

  return data.message;
}
