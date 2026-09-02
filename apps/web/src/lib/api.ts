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

export interface ContactRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface ContactRequestStatus {
  status: 'none' | 'pending' | 'accepted' | 'rejected';
  direction: 'incoming' | 'outgoing' | null;
  requestId: string | null;
}

export interface AvatarUploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  version: number;
  resource_type: string;
  format: string;
}

export async function getAvatarUploadSignature(): Promise<AvatarUploadSignature> {
  return api<AvatarUploadSignature>('/api/auth/avatar/signature', {
    method: 'POST',
    authenticated: true,
  });
}

export async function uploadAvatar(file: File): Promise<string> {
  const signature = await getAvatarUploadSignature();

  const formData = new FormData();

  formData.append('file', file);
  formData.append('api_key', signature.apiKey);
  formData.append('timestamp', String(signature.timestamp));
  formData.append('signature', signature.signature);
  formData.append('folder', signature.folder);
  formData.append('public_id', signature.publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const data = (await response.json()) as CloudinaryUploadResponse & {
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !data.secure_url) {
    throw new Error(data.error?.message || 'Failed to upload avatar.');
  }

  return data.secure_url;
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

/**
 * Contacts
 */

export async function getContacts(): Promise<ContactRequest[]> {
  const data = await api<{
    contacts: ContactRequest[];
  }>('/api/contacts', {
    authenticated: true,
  });

  return data.contacts;
}

export async function getIncomingContactRequests(): Promise<ContactRequest[]> {
  const data = await api<{
    requests: ContactRequest[];
  }>('/api/contact-requests/incoming', {
    authenticated: true,
  });

  return data.requests;
}

export async function getOutgoingContactRequests(): Promise<ContactRequest[]> {
  const data = await api<{
    requests: ContactRequest[];
  }>('/api/contact-requests/outgoing', {
    authenticated: true,
  });

  return data.requests;
}

export async function getContactRequestStatus(userId: string): Promise<ContactRequestStatus> {
  return api<ContactRequestStatus>(`/api/contact-requests/status/${userId}`, {
    authenticated: true,
  });
}

export async function sendContactRequest(userId: string): Promise<ContactRequest> {
  const data = await api<{
    request: ContactRequest;
  }>(`/api/contact-requests/${userId}`, {
    method: 'POST',
    authenticated: true,
  });

  return data.request;
}

export async function acceptContactRequest(requestId: string): Promise<{
  request: ContactRequest;
  conversation: Conversation;
}> {
  return api<{
    request: ContactRequest;
    conversation: Conversation;
  }>(`/api/contact-requests/${requestId}/accept`, {
    method: 'POST',
    authenticated: true,
  });
}

export async function rejectContactRequest(requestId: string): Promise<ContactRequest> {
  const data = await api<{
    request: ContactRequest;
  }>(`/api/contact-requests/${requestId}/reject`, {
    method: 'POST',
    authenticated: true,
  });

  return data.request;
}

export async function removeContact(contactId: string): Promise<ContactRequest> {
  const data = await api<{
    message: string;
    contact: ContactRequest;
  }>(`/api/contacts/${contactId}`, {
    method: 'DELETE',
    authenticated: true,
  });

  return data.contact;
}
