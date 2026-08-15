import { useEffect, useState } from 'react';

import { getConversations, getMessages, sendMessage } from '../lib/api';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import { useAuth } from '../hooks/use-auth';

export function ChatPage() {
  const { user, logout } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadConversations = async () => {
      try {
        setError(null);

        const data = await getConversations();

        if (!mounted) {
          return;
        }

        setConversations(data);

        if (data.length > 0) {
          setSelectedConversation(data[0]);
        }
      } catch (err) {
        if (!mounted) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        if (mounted) {
          setLoadingConversations(false);
        }
      }
    };

    void loadConversations();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    let mounted = true;

    const loadMessages = async () => {
      try {
        setLoadingMessages(true);
        setError(null);

        const data = await getMessages(selectedConversation._id);

        if (mounted) {
          setMessages(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (mounted) {
          setLoadingMessages(false);
        }
      }
    };

    void loadMessages();

    return () => {
      mounted = false;
    };
  }, [selectedConversation]);

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

  const getParticipantId = (conversation: Conversation): string | null => {
    if (!user) {
      return null;
    }

    return conversation.participants.find((participantId) => participantId !== user.id) ?? null;
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div>
          <h1>NexChat</h1>
          <p>
            Logged in as <strong>{user?.name}</strong>
          </p>
        </div>

        <button type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <div className="chat-layout">
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-header">
            <h2>Conversations</h2>
          </div>

          {loadingConversations && <p>Loading conversations...</p>}

          {!loadingConversations && conversations.length === 0 && <p>No conversations yet.</p>}

          {conversations.map((conversation) => {
            const participantId = getParticipantId(conversation);

            return (
              <button
                key={conversation._id}
                type="button"
                className={
                  selectedConversation?._id === conversation._id
                    ? 'conversation-item active'
                    : 'conversation-item'
                }
                onClick={() => setSelectedConversation(conversation)}
              >
                <strong>Chat</strong>

                <span>{participantId ?? 'Unknown participant'}</span>
              </button>
            );
          })}
        </aside>

        <section className="chat-window">
          {!selectedConversation && (
            <div className="empty-chat">
              <h2>Welcome to NexChat</h2>
              <p>Select a conversation to start chatting.</p>
            </div>
          )}

          {selectedConversation && (
            <>
              <div className="chat-window-header">
                <h2>Conversation</h2>

                <small>{selectedConversation._id}</small>
              </div>

              <div className="message-list">
                {loadingMessages && <p>Loading messages...</p>}

                {!loadingMessages && messages.length === 0 && <p>No messages yet.</p>}

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
