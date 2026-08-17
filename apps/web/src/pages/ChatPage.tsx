import { useCallback, useEffect, useRef, useState } from 'react';

import { createDirectConversation, getConversations, getMessages, getUsers } from '../lib/api';
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
  const [typingUserId, setTypingUserId] = useState<string | null>(null);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /**
   * Keep the currently selected conversation available
   * to Socket.IO callbacks without reconnecting the socket
   * every time the selected conversation changes.
   */
  const selectedConversationRef = useRef<Conversation | null>(null);

  /**
   * Reference to the message list container.
   * Used for automatic scrolling to the newest message.
   */
  const messageListRef = useRef<HTMLDivElement | null>(null);

  /**
   * Keep track of the latest message for every conversation.
   */
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({});

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  /**
   * Automatically scroll to the latest message.
   *
   * requestAnimationFrame waits until React has rendered
   * the newest message before calculating scrollHeight.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = messageListRef.current;

      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [messages, loadingMessages, typingUserId]);

  /**
   * Load users and conversations.
   */
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

  /**
   * Load latest messages for existing conversations.
   *
   * This gives the sidebar a last-message preview when
   * the application is initially loaded.
   */
  useEffect(() => {
    if (conversations.length === 0) {
      return;
    }

    let mounted = true;

    const loadLastMessages = async () => {
      const results = await Promise.all(
        conversations.map(async (conversation) => {
          if (!conversation._id) {
            return null;
          }

          try {
            const loadedMessages = await getMessages(conversation._id);

            if (loadedMessages.length === 0) {
              return null;
            }

            return {
              conversationId: conversation._id,
              message: loadedMessages[loadedMessages.length - 1],
            };
          } catch {
            return null;
          }
        }),
      );

      if (!mounted) {
        return;
      }

      const latest: Record<string, Message> = {};

      for (const result of results) {
        if (!result) {
          continue;
        }

        latest[result.conversationId] = result.message;
      }

      setLastMessages(latest);
    };

    void loadLastMessages();

    return () => {
      mounted = false;
    };
  }, [conversations]);

  /**
   * Handle incoming realtime messages.
   */
  const handleNewMessage = useCallback((message: Message) => {
    /**
     * Update last message preview for the conversation.
     */
    setLastMessages((currentLastMessages) => ({
      ...currentLastMessages,
      [message.conversationId]: message,
    }));

    /**
     * Move the conversation receiving the new message
     * to the top of the sidebar.
     */
    setConversations((currentConversations) => {
      const conversationIndex = currentConversations.findIndex(
        (item) => item._id === message.conversationId,
      );

      if (conversationIndex === -1) {
        return currentConversations;
      }

      const conversation = currentConversations[conversationIndex];

      return [
        conversation,
        ...currentConversations.filter((item) => item._id !== message.conversationId),
      ];
    });

    const currentConversation = selectedConversationRef.current;

    /**
     * Only display messages belonging to the
     * currently opened conversation.
     */
    if (!currentConversation?._id) {
      return;
    }

    if (message.conversationId !== currentConversation._id) {
      return;
    }

    setMessages((currentMessages) => {
      if (currentMessages.some((item) => item._id === message._id)) {
        return currentMessages;
      }

      return [...currentMessages, message];
    });
  }, []);

  /**
   * Handle new conversation realtime event.
   */
  const handleNewConversation = useCallback(
    (conversation: Conversation) => {
      if (!user) {
        return;
      }

      /**
       * Only add conversations where the current user
       * is actually a participant.
       */
      if (!conversation.participants.includes(user.id)) {
        return;
      }

      setConversations((currentConversations) => {
        if (currentConversations.some((item) => item._id === conversation._id)) {
          return currentConversations;
        }

        return [conversation, ...currentConversations];
      });
    },
    [user],
  );

  /**
   * Handle typing event.
   */
  const handleUserTyping = useCallback(
    (data: { conversationId: string; userId: string }) => {
      const currentConversation = selectedConversationRef.current;

      if (!currentConversation?._id) {
        return;
      }

      if (data.conversationId !== currentConversation._id) {
        return;
      }

      if (data.userId === user?.id) {
        return;
      }

      setTypingUserId(data.userId);
    },
    [user?.id],
  );

  /**
   * Handle stopped typing event.
   */
  const handleUserStoppedTyping = useCallback(
    (data: { conversationId: string; userId: string }) => {
      const currentConversation = selectedConversationRef.current;

      if (!currentConversation?._id) {
        return;
      }

      if (data.conversationId !== currentConversation._id) {
        return;
      }

      if (data.userId === user?.id) {
        return;
      }

      setTypingUserId(null);
    },
    [user?.id],
  );

  /**
   * Connect Socket.IO once when ChatPage mounts.
   */
  useEffect(() => {
    const token = localStorage.getItem('nexchat_token');

    if (!token) {
      return;
    }

    const socket = connectSocket(token);

    const joinCurrentConversation = () => {
      const currentConversation = selectedConversationRef.current;

      setSocketConnected(true);

      if (currentConversation?._id) {
        socket.emit('join_conversation', currentConversation._id);

        console.log('[Socket] Joined conversation:', currentConversation._id);
      }
    };

    const handleConnect = () => {
      console.log('[Socket] Connected:', socket.id);

      joinCurrentConversation();
    };

    const handleDisconnect = (reason: string) => {
      console.log('[Socket] Disconnected:', reason);

      setSocketConnected(false);
      setTypingUserId(null);
    };

    const handleConnectError = (err: Error) => {
      console.error('[Socket] Connection error:', err.message);

      setSocketConnected(false);
      setError(`Realtime connection failed: ${err.message}`);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stopped_typing', handleUserStoppedTyping);
    socket.on('new_conversation', handleNewConversation);

    /**
     * If the socket was already connected before
     * the listener was registered.
     */
    if (socket.connected) {
      joinCurrentConversation();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);

      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stopped_typing', handleUserStoppedTyping);
      socket.off('new_conversation', handleNewConversation);

      disconnectSocket();
    };
  }, [handleNewConversation, handleNewMessage, handleUserStoppedTyping, handleUserTyping]);

  /**
   * Join the selected conversation whenever
   * the selected conversation changes.
   */
  useEffect(() => {
    const socket = getSocket();

    if (!socketConnected || !socket.connected) {
      return;
    }

    if (!selectedConversation?._id) {
      return;
    }

    socket.emit('join_conversation', selectedConversation._id);

    console.log('[Socket] Joined selected conversation:', selectedConversation._id);

    return () => {
      socket.emit('leave_conversation', selectedConversation._id);

      console.log('[Socket] Left conversation:', selectedConversation._id);
    };
  }, [selectedConversation?._id, socketConnected]);

  /**
   * Open conversation and load message history.
   */
  const openConversation = async (selectedUser: ApiUser) => {
    if (creatingConversation) {
      return;
    }

    try {
      setCreatingConversation(true);
      setError(null);
      setTypingUserId(null);
      setMessages([]);

      setSelectedUser(selectedUser);

      const conversation = await createDirectConversation(selectedUser.id);

      setSelectedConversation(conversation);

      setConversations((current) => {
        const exists = current.some((item) => item._id === conversation._id);

        if (exists) {
          return [conversation, ...current.filter((item) => item._id !== conversation._id)];
        }

        return [conversation, ...current];
      });

      setLoadingMessages(true);

      const loadedMessages = await getMessages(conversation._id);

      setMessages(loadedMessages);

      /**
       * Update sidebar last-message preview
       * using the latest loaded message.
       */
      if (loadedMessages.length > 0) {
        setLastMessages((currentLastMessages) => ({
          ...currentLastMessages,
          [conversation._id]: loadedMessages[loadedMessages.length - 1],
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open conversation');
    } finally {
      setCreatingConversation(false);
      setLoadingMessages(false);
    }
  };

  /**
   * Send message through Socket.IO.
   */
  const handleSendMessage = async () => {
    const trimmedContent = content.trim();

    if (!selectedConversation || !trimmedContent || sending || !socketConnected) {
      return;
    }

    const socket = getSocket();

    if (!socket.connected) {
      setError('Socket is not connected. Please try again.');
      return;
    }

    try {
      setSending(true);
      setError(null);

      socket.emit('typing_stop', selectedConversation._id);

      socket.emit(
        'send_message',
        {
          conversationId: selectedConversation._id,
          content: trimmedContent,
        },
        (response: { success: boolean; message?: Message; error?: string }) => {
          if (!response.success) {
            setError(response.error ?? 'Failed to send message');
            setSending(false);
            return;
          }

          setContent('');
          setTypingUserId(null);
          setSending(false);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');

      setSending(false);
    }
  };

  /**
   * Handle input + typing indicator.
   */
  const handleContentChange = (value: string) => {
    setContent(value);

    if (!selectedConversation || !socketConnected) {
      return;
    }

    const socket = getSocket();

    if (!socket.connected) {
      return;
    }

    if (value.trim()) {
      socket.emit('typing_start', selectedConversation._id);
    } else {
      socket.emit('typing_stop', selectedConversation._id);
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

  const getLastMessagePreview = (conversation: Conversation): string => {
    if (!conversation._id) {
      return 'No messages yet';
    }

    const lastMessage = lastMessages[conversation._id];

    if (!lastMessage) {
      return 'No messages yet';
    }

    if (lastMessage.senderId === user?.id) {
      return `You: ${lastMessage.content}`;
    }

    return lastMessage.content;
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

                <span>{getLastMessagePreview(conversation)}</span>
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

              <div ref={messageListRef} className="message-list">
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

                {typingUserId && (
                  <div className="typing-indicator">
                    <span>{selectedUser?.name ?? 'Someone'} is typing...</span>
                  </div>
                )}
              </div>

              <form className="message-form" onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={content}
                  onChange={(event) => handleContentChange(event.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                />

                <button type="submit" disabled={!content.trim() || sending || !socketConnected}>
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
