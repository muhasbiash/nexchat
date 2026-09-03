import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuth } from '../hooks/use-auth';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import type { ApiUser } from '../types/user';
import { NexChatLogo } from '../components/nexchat-logo';
import { ProfilePage } from './profile-page';
import { SettingsPage } from './settings-page';
import { ArrowRight, LoaderCircle, LogOut, Menu, Settings, Trash2, User } from 'lucide-react';
import {
  acceptContactRequest,
  createDirectConversation,
  getContactRequestStatus,
  getConversations,
  getIncomingContactRequests,
  getMessages,
  getUsers,
  rejectContactRequest,
  removeContact,
  sendContactRequest,
  type ContactRequest,
  type ContactRequestStatus,
} from '../lib/api';

function matchesSearch(value: string | null | undefined, query: string) {
  if (!query.trim()) {
    return true;
  }

  return (value ?? '').toLowerCase().includes(query.trim().toLowerCase());
}

export function ChatPage() {
  const { user, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<ApiUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [processingContactRequestId, setProcessingContactRequestId] = useState<string | null>(null);
  const [contactStatuses, setContactStatuses] = useState<Record<string, ContactRequestStatus>>({});
  const [processingContactUserId, setProcessingContactUserId] = useState<string | null>(null);
  const [removingContactId, setRemovingContactId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');

  const [socketConnected, setSocketConnected] = useState(false);
  const [joinedConversationId, setJoinedConversationId] = useState<string | null>(null);
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
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
   * Load users, conversations, and incoming contact requests.
   */
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setError(null);

        const [loadedUsers, loadedConversations, loadedContactRequests] = await Promise.all([
          getUsers(),
          getConversations(),
          getIncomingContactRequests(),
        ]);

        if (!mounted) {
          return;
        }

        setUsers(loadedUsers.filter((item) => item.id !== user?.id));
        setConversations(loadedConversations);
        setContactRequests(loadedContactRequests);
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
   * Load contact status for every visible user.
   */
  useEffect(() => {
    if (users.length === 0) {
      return;
    }

    let mounted = true;

    const loadContactStatuses = async () => {
      try {
        const entries = await Promise.all(
          users.map(async (item) => {
            const status = await getContactRequestStatus(item.id);

            return [item.id, status] as const;
          }),
        );

        if (!mounted) {
          return;
        }

        setContactStatuses(Object.fromEntries(entries));
      } catch (err) {
        if (!mounted) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to load contact statuses');
      }
    };

    void loadContactStatuses();

    return () => {
      mounted = false;
    };
  }, [users]);
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
          if (!conversation.id) {
            return null;
          }

          try {
            const loadedMessages = await getMessages(conversation.id);

            if (loadedMessages.length === 0) {
              return null;
            }

            return {
              conversationId: conversation.id,
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

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Handle incoming realtime messages.
   */
  const handleNewMessage = useCallback(
    (message: Message) => {
      console.log('[ChatPage] New message received:', message);

      /**
       * Move conversation to the top.
       */
      setConversations((currentConversations) => {
        const conversationIndex = currentConversations.findIndex(
          (item) => item.id === message.conversationId,
        );

        if (conversationIndex === -1) {
          return currentConversations;
        }

        const conversation = currentConversations[conversationIndex];

        return [
          conversation,
          ...currentConversations.filter((item) => item.id !== message.conversationId),
        ];
      });

      const currentConversation = selectedConversationRef.current;

      console.log('[ChatPage] Current conversation:', currentConversation?.id);
      console.log('[ChatPage] Incoming conversation:', message.conversationId);
      console.log('[ChatPage] Current user:', user?.id);
      console.log('[ChatPage] Message sender:', message.senderId);

      /**
       * Update last message preview.
       */
      setLastMessages((currentLastMessages) => ({
        ...currentLastMessages,
        [message.conversationId]: message,
      }));

      /**
       * Increase unread count only when:
       * - message is from another user
       * - conversation is not currently opened
       */
      if (message.senderId !== user?.id && message.conversationId !== currentConversation?.id) {
        setUnreadCounts((current) => ({
          ...current,
          [message.conversationId]: (current[message.conversationId] ?? 0) + 1,
        }));
      }

      /**
       * Ignore messages from other conversations.
       */
      if (!currentConversation?.id) {
        return;
      }

      if (message.conversationId !== currentConversation.id) {
        return;
      }

      setMessages((currentMessages) => {
        if (currentMessages.some((item) => item.id === message.id)) {
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
      const userId = user?.id;

      if (!userId) {
        return;
      }

      if (!conversation.participants.some((participant) => participant.id === userId)) {
        return;
      }

      setConversations((currentConversations) => {
        if (currentConversations.some((item) => item.id === conversation.id)) {
          return currentConversations;
        }

        return [conversation, ...currentConversations];
      });
    },
    [user?.id],
  );

  /**
   * Handle typing event.
   */
  const handleUserTyping = useCallback(
    (data: { conversationId: string; userId: string }) => {
      const currentConversation = selectedConversationRef.current;

      if (!currentConversation?.id) {
        return;
      }

      if (data.conversationId !== currentConversation.id) {
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

      if (!currentConversation?.id) {
        return;
      }

      if (data.conversationId !== currentConversation.id) {
        return;
      }

      if (data.userId === user?.id) {
        return;
      }

      setTypingUserId(null);
    },
    [user?.id],
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  /**
   * Remove a conversation and reset the active chat state.
   */
  const removeConversationFromState = useCallback((conversationId: string) => {
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId),
    );

    setUnreadCounts((current) => {
      if (!(conversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[conversationId];
      return next;
    });

    setLastMessages((current) => {
      if (!(conversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[conversationId];
      return next;
    });

    if (selectedConversationRef.current?.id === conversationId) {
      selectedConversationRef.current = null;
      setSelectedConversation(null);
      setSelectedUser(null);
      setMessages([]);
      setContent('');
      setJoinedConversationId(null);
      setTypingUserId(null);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  }, []);

  /**
   * Remove the conversation associated with a specific contact.
   */
  const removeConversationWithUserFromState = useCallback(
    (userId: string) => {
      const conversation = conversationsRef.current.find((item) =>
        item.participants.some((participant) => participant.id === userId),
      );

      if (conversation?.id) {
        removeConversationFromState(conversation.id);
        return;
      }

      const selectedConversation = selectedConversationRef.current;

      if (
        selectedConversation?.id &&
        selectedConversation.participants.some((participant) => participant.id === userId)
      ) {
        removeConversationFromState(selectedConversation.id);
      }
    },
    [removeConversationFromState],
  );

  /**
   * Connect native WebSocket once when ChatPage mounts.
   */
  useEffect(() => {
    const token = localStorage.getItem('nexchat_token');

    if (!token) {
      return;
    }

    const socket = connectSocket(
      token,
      (event) => {
        switch (event.type) {
          case 'new_message':
            handleNewMessage(event.message);
            break;

          case 'new_conversation':
            handleNewConversation(event.conversation);
            break;

          case 'contact_request_received':
            setContactRequests((current) => {
              const exists = current.some((request) => request.id === event.request.id);

              if (exists) {
                return current;
              }

              return [event.request, ...current];
            });
            break;

          case 'contact_request_accepted':
            setContactRequests((current) =>
              current.filter((request) => request.id !== event.request.id),
            );

            setConversations((current) => {
              const exists = current.some(
                (conversation) => conversation.id === event.conversation.id,
              );

              if (exists) {
                return current.map((conversation) =>
                  conversation.id === event.conversation.id ? event.conversation : conversation,
                );
              }

              return [event.conversation, ...current];
            });

            break;

          case 'contact_request_rejected': {
            const rejectedOtherUserId =
              event.request.senderId === user?.id
                ? event.request.receiverId
                : event.request.senderId;

            setContactRequests((current) =>
              current.filter((request) => request.id !== event.request.id),
            );

            setContactStatuses((current) => ({
              ...current,
              [rejectedOtherUserId]: {
                status: 'none',
                direction: null,
                requestId: null,
              },
            }));

            break;
          }

          case 'contact_removed': {
            const removedOtherUserId =
              event.contact.senderId === user?.id
                ? event.contact.receiverId
                : event.contact.senderId;

            setContactStatuses((current) => ({
              ...current,
              [removedOtherUserId]: {
                status: 'none',
                direction: null,
                requestId: null,
              },
            }));

            removeConversationWithUserFromState(removedOtherUserId);

            break;
          }

          case 'user_typing':
            handleUserTyping({
              conversationId: event.conversationId,
              userId: event.userId,
            });
            break;

          case 'user_stopped_typing':
            handleUserStoppedTyping({
              conversationId: event.conversationId,
              userId: event.userId,
            });
            break;

          case 'joined_conversation':
            if (selectedConversationRef.current?.id === event.conversationId) {
              setJoinedConversationId(event.conversationId);
              setError(null);

              console.log('[WebSocket] Joined selected conversation:', event.conversationId);
            }
            break;

          case 'conversation_access_denied':
            console.error('[WebSocket] Conversation access denied:', event.message);

            setJoinedConversationId(null);

            if (selectedConversationRef.current?.id === event.conversationId) {
              removeConversationFromState(event.conversationId);
            }

            setError(
              'Conversation ini sudah tidak tersedia. Tambahkan kembali pengguna sebagai kontak terlebih dahulu.',
            );
            break;

          case 'error':
            console.error('[WebSocket] Server error:', event.message);

            setError(event.message);
            break;

          case 'ack':
            console.log('[WebSocket] ACK:', event.received);
            break;

          default:
            break;
        }
      },
      () => {
        console.log('[WebSocket] Connected');
        setSocketConnected(true);
      },
      () => {
        console.log('[WebSocket] Disconnected');

        setSocketConnected(false);
        setJoinedConversationId(null);
        setTypingUserId(null);
      },
    );

    return () => {
      socket.close();
      disconnectSocket();
      setSocketConnected(false);
    };
  }, [
    handleNewConversation,
    handleNewMessage,
    handleUserStoppedTyping,
    handleUserTyping,
    removeConversationWithUserFromState,
    user?.id,
  ]);

  /**
   * Join selected conversation.
   */
  useEffect(() => {
    const socket = getSocket();

    if (!socketConnected || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!selectedConversation?.id) {
      return;
    }

    setJoinedConversationId(null);

    socket.send(
      JSON.stringify({
        type: 'join_conversation',
        conversationId: selectedConversation.id,
      }),
    );

    console.log('[WebSocket] Join requested:', selectedConversation.id);

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'leave_conversation',
            conversationId: selectedConversation.id,
          }),
        );

        console.log('[WebSocket] Left conversation:', selectedConversation.id);
      }

      setJoinedConversationId((current) => (current === selectedConversation.id ? null : current));
    };
  }, [selectedConversation?.id, socketConnected]);
  /**
   * Open an existing conversation from the sidebar.
   */
  const openExistingConversation = async (conversation: Conversation) => {
    if (!conversation.id || creatingConversation) {
      return;
    }

    try {
      setCreatingConversation(true);
      setError(null);
      setTypingUserId(null);
      setMessages([]);

      const conversationUser = getConversationUser(conversation);

      setSelectedUser(conversationUser);

      setUnreadCounts((current) => {
        if (!(conversation.id! in current)) {
          return current;
        }

        const next = { ...current };
        delete next[conversation.id!];

        return next;
      });

      setSelectedConversation(conversation);

      setLoadingMessages(true);

      const loadedMessages = await getMessages(conversation.id);

      setMessages(loadedMessages);

      if (loadedMessages.length > 0) {
        setLastMessages((currentLastMessages) => ({
          ...currentLastMessages,
          [conversation.id!]: loadedMessages[loadedMessages.length - 1],
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
   * Open conversation.
   */
  const openConversation = async (selectedUser: ApiUser) => {
    if (creatingConversation) {
      return;
    }
    const contactStatus = contactStatuses[selectedUser.id];

    if (contactStatus?.status !== 'accepted') {
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
        if (!conversation.id || !(conversation.id in current)) {
          return current;
        }

        const next = { ...current };

        delete next[conversation.id];

        return next;
      });

      setSelectedConversation(conversation);

      setConversations((current) => {
        const exists = current.some((item) => item.id === conversation.id);

        if (exists) {
          return [conversation, ...current.filter((item) => item.id !== conversation.id)];
        }

        return [conversation, ...current];
      });

      setLoadingMessages(true);

      const loadedMessages = await getMessages(conversation.id);

      setMessages(loadedMessages);

      if (loadedMessages.length > 0) {
        setLastMessages((currentLastMessages) => ({
          ...currentLastMessages,
          [conversation.id]: loadedMessages[loadedMessages.length - 1],
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
   * Handle contact removal from the local user.
   */
  const handleRemoveContact = async (contactId: string) => {
    if (removingContactId) {
      return;
    }

    const confirmed = window.confirm(
      'Remove this contact? The conversation will also be removed from your chat list.',
    );

    if (!confirmed) {
      return;
    }

    try {
      setRemovingContactId(contactId);
      setError(null);

      const removedContact = await removeContact(contactId);

      const removedOtherUserId =
        removedContact.senderId === user?.id ? removedContact.receiverId : removedContact.senderId;

      const targetUserId = removedOtherUserId;

      setContactStatuses((current) => ({
        ...current,
        [targetUserId]: {
          status: 'none',
          direction: null,
          requestId: null,
        },
      }));

      removeConversationWithUserFromState(targetUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove contact');
    } finally {
      setRemovingContactId(null);
    }
  };

  /**
   * Send contact request.
   */
  const handleSendContactRequest = async (userId: string) => {
    if (processingContactUserId) {
      return;
    }

    try {
      setProcessingContactUserId(userId);
      setError(null);

      const request = await sendContactRequest(userId);

      setContactStatuses((current) => ({
        ...current,
        [userId]: {
          status: 'pending',
          direction: 'outgoing',
          requestId: request.id,
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send contact request');
    } finally {
      setProcessingContactUserId(null);
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

    if (joinedConversationId !== selectedConversation.id) {
      setError('Conversation belum siap untuk mengirim pesan.');
      return;
    }

    const socket = getSocket();

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('Socket is not connected. Please try again.');
      return;
    }

    try {
      setSending(true);
      setError(null);

      socket.send(
        JSON.stringify({
          type: 'typing_stop',
          conversationId: selectedConversation.id,
        }),
      );

      socket.send(
        JSON.stringify({
          type: 'send_message',
          conversationId: selectedConversation.id,
          content: trimmedContent,
        }),
      );

      setContent('');
      setTypingUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
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

  function renderAvatar(name: string, avatarUrl?: string | null, className = 'avatar') {
    if (avatarUrl) {
      return <img src={avatarUrl} alt={`${name} avatar`} className={`${className} avatar-image`} />;
    }

    return <div className={className}>{getInitials(name)}</div>;
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

    if (
      !selectedConversation ||
      !socketConnected ||
      joinedConversationId !== selectedConversation.id
    ) {
      return;
    }

    const socket = getSocket();

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const conversationId = selectedConversation.id;

    if (!value.trim()) {
      socket.send(
        JSON.stringify({
          type: 'typing_stop',
          conversationId,
        }),
      );

      return;
    }

    socket.send(
      JSON.stringify({
        type: 'typing_start',
        conversationId,
      }),
    );

    typingTimeoutRef.current = setTimeout(() => {
      const currentSocket = getSocket();

      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(
          JSON.stringify({
            type: 'typing_stop',
            conversationId,
          }),
        );
      }

      typingTimeoutRef.current = null;
    }, 700);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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

    return conversation.participants.find((participant) => participant.id !== user.id)?.id ?? null;
  };

  const handleAcceptContactRequest = async (requestId: string) => {
    try {
      setProcessingContactRequestId(requestId);
      setError(null);

      const result = await acceptContactRequest(requestId);

      setContactRequests((current) => current.filter((request) => request.id !== requestId));

      setConversations((current) => {
        const exists = current.some((conversation) => conversation.id === result.conversation.id);

        if (exists) {
          return current.map((conversation) =>
            conversation.id === result.conversation.id ? result.conversation : conversation,
          );
        }

        return [result.conversation, ...current];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept contact request');
    } finally {
      setProcessingContactRequestId(null);
    }
  };
  const handleRejectContactRequest = async (requestId: string) => {
    try {
      setProcessingContactRequestId(requestId);
      setError(null);

      await rejectContactRequest(requestId);

      setContactRequests((current) => current.filter((request) => request.id !== requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject contact request');
    } finally {
      setProcessingContactRequestId(null);
    }
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
    if (!conversation.id) {
      return 'No messages yet';
    }

    const lastMessage = lastMessages[conversation.id];

    if (!lastMessage) {
      return 'No messages yet';
    }

    if (lastMessage.senderId === user?.id) {
      return `You: ${lastMessage.content}`;
    }

    return lastMessage.content;
  };

  if (showProfile && selectedProfileUser) {
    return (
      <ProfilePage
        user={selectedProfileUser}
        onBack={() => {
          setShowProfile(false);
          setSelectedProfileUser(null);
        }}
        onEdit={
          selectedProfileUser.id === user?.id
            ? () => {
                setShowProfile(false);
                setSelectedProfileUser(null);
                setShowSettings(true);
              }
            : undefined
        }
      />
    );
  }

  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className={selectedConversation ? 'chat-page has-selected-conversation' : 'chat-page'}>
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

        <div className="chat-header-menu">
          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu size={24} />
          </button>

          {menuOpen && (
            <div className="user-menu">
              <div className="user-menu-profile">
                {renderAvatar(user?.name ?? 'User', user?.avatarUrl, 'menu-avatar')}

                <div>
                  <strong>{user?.name}</strong>
                  <span>{user?.email}</span>
                </div>
              </div>

              <div className="user-menu-divider" />

              <button
                type="button"
                className="user-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setShowProfile(true);
                }}
              >
                <User size={18} />
                <span>Profile</span>
              </button>

              <button
                type="button"
                className="user-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setShowSettings(true);
                }}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>

              <div className="user-menu-divider" />

              <button
                type="button"
                className="user-menu-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
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

          {contactRequests.length > 0 && (
            <>
              <div className="conversation-sidebar-header">
                <h2>Contact Requests</h2>
              </div>

              <div className="contact-request-list">
                {contactRequests.map((request) => {
                  const requester = users.find((item) => item.id === request.senderId);

                  const isProcessing = processingContactRequestId === request.id;

                  return (
                    <div key={request.id} className="contact-request-item">
                      <div className="conversation-user-row">
                        {renderAvatar(requester?.name ?? 'User', requester?.avatarUrl)}

                        <div className="conversation-user-info">
                          <strong>{requester?.name ?? 'Unknown user'}</strong>

                          <span>{requester?.email ?? 'Contact request'}</span>
                        </div>
                      </div>

                      <div className="contact-request-actions">
                        <button
                          type="button"
                          className="contact-accept-button"
                          disabled={isProcessing}
                          onClick={() => void handleAcceptContactRequest(request.id)}
                        >
                          {isProcessing ? '...' : 'Accept'}
                        </button>

                        <button
                          type="button"
                          className="contact-reject-button"
                          disabled={isProcessing}
                          onClick={() => void handleRejectContactRequest(request.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="conversation-sidebar-header">
            <h2>New Conversation</h2>
          </div>

          {!loadingUsers &&
            users
              .filter((item) => {
                const query = searchQuery.trim().toLowerCase();

                const hasConversation = conversations.some((conversation) =>
                  conversation.participants.some((participant) => participant.id === item.id),
                );

                if (hasConversation) {
                  return false;
                }

                if (!query) {
                  return true;
                }

                return matchesSearch(item.name, query) || matchesSearch(item.email, query);
              })
              .map((item) => {
                const contactStatus = contactStatuses[item.id];
                const isProcessing = processingContactUserId === item.id;

                const isAccepted = contactStatus?.status === 'accepted';

                const isPending = contactStatus?.status === 'pending';

                const isIncoming = isPending && contactStatus?.direction === 'incoming';

                const isOutgoing = isPending && contactStatus?.direction === 'outgoing';

                return (
                  <div key={item.id} className="conversation-item contact-search-result">
                    <button
                      type="button"
                      className="profile-user-link conversation-user-row"
                      onClick={() => {
                        setSelectedProfileUser(item);
                        setShowProfile(true);
                      }}
                    >
                      {renderAvatar(item.name, item.avatarUrl)}

                      <div className="conversation-user-info">
                        <strong>{item.name}</strong>
                        <span>{item.email}</span>
                      </div>
                    </button>

                    <div className="contact-user-action">
                      {isAccepted && (
                        <button
                          type="button"
                          className="contact-chat-button"
                          onClick={() => void openConversation(item)}
                          disabled={creatingConversation}
                        >
                          Chat
                        </button>
                      )}

                      {isOutgoing && <span className="contact-status-label">Request Pending</span>}

                      {isIncoming && (
                        <span className="contact-status-label">Accept request above</span>
                      )}

                      {!isAccepted && !isPending && (
                        <button
                          type="button"
                          className="contact-add-button"
                          onClick={() => void handleSendContactRequest(item.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? '...' : 'Add Contact'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          <div className="conversation-sidebar-header">
            <h2>Conversations</h2>
          </div>

          {loadingConversations && <p className="sidebar-status">Loading conversations...</p>}

          {!loadingConversations && conversations.length === 0 && (
            <p className="sidebar-status">No conversations yet.</p>
          )}

          {conversations
            .filter((conversation) => {
              const query = searchQuery.trim().toLowerCase();

              if (!query) {
                return true;
              }

              const conversationUser = getConversationUser(conversation);

              return (
                matchesSearch(conversationUser?.name, query) ||
                matchesSearch(conversationUser?.email, query) ||
                matchesSearch(getLastMessagePreview(conversation), query)
              );
            })
            .map((conversation) => {
              const conversationUser = getConversationUser(conversation);
              const conversationAvatarUser = conversationUser
                ? users.find((item) => item.id === conversationUser.id)
                : undefined;

              const unreadCount = conversation.id ? (unreadCounts[conversation.id] ?? 0) : 0;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={
                    selectedConversation?.id === conversation.id
                      ? 'conversation-item active'
                      : 'conversation-item'
                  }
                  onClick={() => {
                    void openExistingConversation(conversation);
                  }}
                >
                  <div className="conversation-user-row">
                    {renderAvatar(
                      conversationUser?.name ?? 'Conversation',
                      conversationAvatarUser?.avatarUrl,
                    )}

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
                <button
                  type="button"
                  className="mobile-back-button"
                  onClick={() => {
                    setSelectedConversation(null);
                    setSelectedUser(null);
                    setMessages([]);
                    setTypingUserId(null);
                  }}
                  aria-label="Back to conversations"
                >
                  ←
                </button>

                {selectedUser && renderAvatar(selectedUser.name, selectedUser.avatarUrl)}

                <div className="chat-window-header-info">
                  <h2>{selectedUser?.name ?? 'Conversation'}</h2>

                  {selectedUser && <small>{selectedUser.email}</small>}
                </div>

                {selectedUser &&
                  contactStatuses[selectedUser.id]?.status === 'accepted' &&
                  contactStatuses[selectedUser.id]?.requestId && (
                    <button
                      type="button"
                      className="contact-remove-button"
                      onClick={() =>
                        void handleRemoveContact(
                          contactStatuses[selectedUser.id].requestId as string,
                        )
                      }
                      disabled={removingContactId !== null}
                      aria-label={`Remove ${selectedUser.name} from contacts`}
                      title="Remove contact"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                      <span>{removingContactId ? 'Removing...' : 'Remove'}</span>
                    </button>
                  )}
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
                      key={message.id}
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
                  placeholder={
                    joinedConversationId === selectedConversation.id
                      ? 'Type a message...'
                      : 'Connecting conversation...'
                  }
                  disabled={
                    sending || !socketConnected || joinedConversationId !== selectedConversation.id
                  }
                />

                <button
                  type="submit"
                  className="message-send"
                  disabled={
                    !content.trim() ||
                    sending ||
                    !socketConnected ||
                    joinedConversationId !== selectedConversation.id
                  }
                  aria-label={sending ? 'Sending message' : 'Send message'}
                  title={sending ? 'Sending...' : 'Send message'}
                >
                  {sending ? (
                    <LoaderCircle className="message-send-spinner" size={15} aria-hidden="true" />
                  ) : (
                    <ArrowRight size={15} aria-hidden="true" />
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
