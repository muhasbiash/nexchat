import { useEffect, useState } from 'react';

import {
  createDirectConversation,
  getConversations,
  getMessages,
  getUsers,
  sendMessage,
} from '../lib/api';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuth } from '../hooks/use-auth';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import type { ApiUser } from '../types/user';
export function ChatPage() {
  const { user, logout } = useAuth();

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setError(null);

        const [loadedUsers, loadedConversations] = await Promise.all([
          getUsers(),
          getConversations(),
        ]);

        if (!mounted) {
          return;
        }

        setUsers(loadedUsers.filter((item) => item.id !== user?.id));
        setConversations(loadedConversations);
      } catch (err) {
        if (!mounted) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to load chat data');
      } finally {
        if (mounted) {
          setLoadingUsers(false);
          setLoadingConversations(false);
        }
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const token = localStorage.getItem('nexchat_token');

    if (!token) {
      return;
    }

    const socket = connectSocket(token);

    const handleConnect = () => {
      setSocketConnected(true);
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleNewMessage = (message: Message) => {
      setMessages((currentMessages) => {
        if (currentMessages.some((item) => item._id === message._id)) {
          return currentMessages;
        }

        return [...currentMessages, message];
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new_message', handleNewMessage);
      disconnectSocket();
    };
  }, []);

  const openConversation = async (selectedUser: ApiUser) => {
    if (creatingConversation) {
      return;
    }

    try {
      setCreatingConversation(true);
      setError(null);
      setSelectedUser(selectedUser);

      const conversation = await createDirectConversation(selectedUser.id);

      setSelectedConversation(conversation);

      const socket = getSocket();

      socket.emit('join_conversation', conversation._id);

      setConversations((current) => {
        const exists = current.some((item) => item._id === conversation._id);

        if (exists) {
          return current;
        }

        return [...current, conversation];
      });

      setLoadingMessages(true);

      const loadedMessages = await getMessages(conversation._id);

      setMessages(loadedMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open conversation');
    } finally {
      setCreatingConversation(false);
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmedContent = content.trim();

    if (!selectedConversation || !trimmedContent || sending) {
      return;
    }

    try {
      setSending(true);
      setError(null);

      const message = await sendMessage(selectedConversation._id, trimmedContent);

      setMessages((currentMessages) => [...currentMessages, message]);
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSendMessage();
  };

  const getOtherParticipantId = (conversation: Conversation): string | null => {
    if (!user) {
      return null;
    }

    return conversation.participants.find((participantId) => participantId !== user.id) ?? null;
  };

  const getConversationUser = (conversation: Conversation): ApiUser | null => {
    const participantId = getOtherParticipantId(conversation);

    if (!participantId) {
      return null;
    }

    return users.find((item) => item.id === participantId) ?? null;
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div>
          <h1>NexChat</h1>

          <p>
            Logged in as <strong>{user?.name}</strong>
          </p>

          <small>{socketConnected ? '🟢 Realtime connected' : '🔴 Realtime disconnected'}</small>
        </div>

        <button type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <div className="chat-layout">
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-header">
            <h2>New Conversation</h2>
          </div>

          {loadingUsers && <p>Loading users...</p>}

          {!loadingUsers && users.length === 0 && <p>No other users found.</p>}

          {users.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                selectedUser?.id === item.id ? 'conversation-item active' : 'conversation-item'
              }
              onClick={() => void openConversation(item)}
              disabled={creatingConversation}
            >
              <strong>{item.name}</strong>

              <span>{item.email}</span>
            </button>
          ))}

          <div className="conversation-sidebar-header">
            <h2>Conversations</h2>
          </div>

          {loadingConversations && <p>Loading conversations...</p>}

          {!loadingConversations && conversations.length === 0 && <p>No conversations yet.</p>}

          {conversations.map((conversation) => {
            const conversationUser = getConversationUser(conversation);

            return (
              <button
                key={conversation._id}
                type="button"
                className={
                  selectedConversation?._id === conversation._id
                    ? 'conversation-item active'
                    : 'conversation-item'
                }
                onClick={() => {
                  if (conversationUser) {
                    void openConversation(conversationUser);
                  }
                }}
              >
                <strong>{conversationUser?.name ?? 'Conversation'}</strong>

                <span>{conversationUser?.email ?? conversation._id}</span>
              </button>
            );
          })}
        </aside>

        <section className="chat-window">
          {!selectedConversation && (
            <div className="empty-chat">
              <h2>Welcome to NexChat</h2>

              <p>Select a user to start a conversation.</p>
            </div>
          )}

          {selectedConversation && (
            <>
              <div className="chat-window-header">
                <div>
                  <h2>{selectedUser?.name ?? 'Conversation'}</h2>

                  {selectedUser && <small>{selectedUser.email}</small>}
                </div>
              </div>

              <div className="message-list">
                {loadingMessages && <p>Loading messages...</p>}

                {!loadingMessages && messages.length === 0 && (
                  <p>No messages yet. Start the conversation!</p>
                )}

                {messages.map((message) => {
                  const isOwnMessage = message.senderId === user?.id;

                  return (
                    <div
                      key={message._id}
                      className={isOwnMessage ? 'message own-message' : 'message'}
                    >
                      <div className="message-bubble">
                        <p>{message.content}</p>

                        <small>{new Date(message.createdAt).toLocaleTimeString()}</small>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="message-form" onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                />

                <button type="submit" disabled={!content.trim() || sending}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {error && <p className="chat-error">{error}</p>}
    </div>
  );
}
