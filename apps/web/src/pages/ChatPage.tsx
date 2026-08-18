import { useCallback, useEffect, useRef, useState } from 'react';

import { createDirectConversation, getConversations, getMessages, getUsers } from '../lib/api';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuth } from '../hooks/use-auth';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import type { ApiUser } from '../types/user';
import { NexChatLogo } from '../components/nexchat-logo';
import { ArrowRight, LoaderCircle } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({});

  /**
   * Keep the selected conversation available
   * inside Socket.IO callbacks.
   */
  const selectedConversationRef = useRef<Conversation | null>(null);

  /**
   * Reference to the bottom of the message list.
   *
   * This is used for reliable automatic scrolling.
   */
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  /**
   * Automatically scroll to the newest message.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
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
   * Load latest message for every conversation.
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
  const handleNewMessage = useCallback(
    (message: Message) => {
      setLastMessages((currentLastMessages) => ({
        ...currentLastMessages,
        [message.conversationId]: message,
      }));

      /**
       * Move conversation to the top.
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
       * Increase unread count only when:
       * - message is from another user
       * - conversation is not currently opened
       */
      if (message.senderId !== user?.id && message.conversationId !== currentConversation?._id) {
        setUnreadCounts((current) => ({
          ...current,
          [message.conversationId]: (current[message.conversationId] ?? 0) + 1,
        }));
      }

      /**
       * Ignore messages from other conversations.
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
    },
    [user?.id],
  );

  /**
   * Handle new conversation realtime event.
   */
  const handleNewConversation = useCallback(
    (conversation: Conversation) => {
      if (!user) {
        return;
      }

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
   * Join selected conversation.
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
   * Open conversation.
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

      setUnreadCounts((current) => {
        if (!conversation._id || !(conversation._id in current)) {
          return current;
        }

        const next = { ...current };

        delete next[conversation._id];

        return next;
      });

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
   * Send message.
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
   * Get initials for avatar.
   */
  function getInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  /**
   * Format message time.
   */
  function formatMessageTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return date.toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Handle message input and typing indicator.
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

  /**
   * Get the other participant.
   */
  const getOtherParticipantId = (conversation: Conversation): string | null => {
    if (!user) {
      return null;
    }

    return conversation.participants.find((participantId) => participantId !== user.id) ?? null;
  };

  /**
   * Get the user associated with a conversation.
   */
  const getConversationUser = (conversation: Conversation): ApiUser | null => {
    const participantId = getOtherParticipantId(conversation);

    if (!participantId) {
      return null;
    }

    return users.find((item) => item.id === participantId) ?? null;
  };

  /**
   * Last message preview.
   */
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
        <div className="chat-header-brand">
          <NexChatLogo size={48} showText={true} />

          <div className="chat-header-user">
            <p>
              Logged in as <strong>{user?.name}</strong>
            </p>

            <small
              className={
                socketConnected ? 'realtime-status connected' : 'realtime-status disconnected'
              }
            >
              <span className="status-dot" />

              {socketConnected ? 'Realtime connected' : 'Realtime disconnected'}
            </small>
          </div>
        </div>

        <button type="button" className="logout-button" onClick={logout}>
          Logout
        </button>
      </header>

      <div className="chat-layout">
        <aside className="conversation-sidebar">
          <div className="sidebar-search">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search people..."
              aria-label="Search people and conversations"
            />
          </div>

          <div className="conversation-sidebar-header">
            <h2>New Conversation</h2>
          </div>

          {loadingUsers && <p className="sidebar-status">Loading users...</p>}

          {!loadingUsers && users.length === 0 && (
            <p className="sidebar-status">No other users found.</p>
          )}

          {!loadingUsers &&
            users
              .filter((item) => {
                const query = searchQuery.trim().toLowerCase();

                if (!query) {
                  return true;
                }

                return (
                  item.name.toLowerCase().includes(query) ||
                  item.email.toLowerCase().includes(query)
                );
              })
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="conversation-item"
                  onClick={() => void openConversation(item)}
                  disabled={creatingConversation}
                >
                  <div className="conversation-user-row">
                    <div className="avatar">{getInitials(item.name)}</div>

                    <div className="conversation-user-info">
                      <strong>{item.name}</strong>
                      <span>{item.email}</span>
                    </div>
                  </div>
                </button>
              ))}

          <div className="conversation-sidebar-header">
            <h2>Conversations</h2>
          </div>

          {loadingConversations && <p className="sidebar-status">Loading conversations...</p>}

          {!loadingConversations && conversations.length === 0 && (
            <p className="sidebar-status">No conversations yet.</p>
          )}

          {conversations.map((conversation) => {
            const conversationUser = getConversationUser(conversation);

            const unreadCount = conversation._id ? (unreadCounts[conversation._id] ?? 0) : 0;

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
                <div className="conversation-user-row">
                  <div className="avatar">
                    {getInitials(conversationUser?.name ?? 'Conversation')}
                  </div>

                  <div className="conversation-user-info">
                    <strong>{conversationUser?.name ?? 'Conversation'}</strong>

                    <span>{getLastMessagePreview(conversation)}</span>
                  </div>

                  {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                </div>
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
                {loadingMessages && <p className="message-status">Loading messages...</p>}

                {!loadingMessages && messages.length === 0 && (
                  <p className="message-status">No messages yet. Start the conversation!</p>
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

                        <small>{formatMessageTime(message.createdAt)}</small>
                      </div>
                    </div>
                  );
                })}

                {typingUserId && (
                  <div className="typing-indicator">
                    <span>{selectedUser?.name ?? 'Someone'} is typing...</span>
                  </div>
                )}

                {/**
                 * Invisible element at the bottom of
                 * the message list.
                 *
                 * Auto-scroll targets this element.
                 */}
                <div ref={messageEndRef} aria-hidden="true" />
              </div>

              <form className="message-form" onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={content}
                  onChange={(event) => handleContentChange(event.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                />

                <button
                  type="submit"
                  className="message-send"
                  disabled={!content.trim() || sending || !socketConnected}
                  aria-label={sending ? 'Sending message' : 'Send message'}
                  title={sending ? 'Sending...' : 'Send message'}
                >
                  {sending ? (
                    <LoaderCircle
                      className="message-send-spinner"
                      size={15}
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowRight
                      size={15}
                      aria-hidden="true"
                    />
                  )}
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
