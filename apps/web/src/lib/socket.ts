import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8787/ws';

export type RealtimeEvent =
  | {
      type: 'new_message';
      message: Message;
    }
  | {
      type: 'new_conversation';
      conversation: Conversation;
    }
  | {
      type: 'message_delivered';
      conversationId: string;
      messageIds: string[];
      deliveredAt?: string;
    }
  | {
      type: 'messages_read';
      conversationId: string;
      messageIds: string[];
      readAt?: string;
      readerId: string;
    }
  | {
      type: 'user_typing';
      conversationId: string;
      userId: string;
    }
  | {
      type: 'user_stopped_typing';
      conversationId: string;
      userId: string;
    }
  | {
      type: 'conversation_access_denied';
      conversationId: string;
      message: string;
    }
  | {
      type: 'call_incoming';
      conversationId: string;
      callId: string;
      callerId: string;
      mode: 'audio' | 'video';
    }
  | {
      type: 'call_accept';
      conversationId: string;
      callId: string;
      senderId: string;
    }
  | {
      type: 'call_reject';
      conversationId: string;
      callId: string;
      senderId: string;
    }
  | {
      type: 'call_end';
      conversationId: string;
      callId: string;
      senderId: string;
    }
  | {
      type: 'webrtc_offer';
      conversationId: string;
      callId: string;
      senderId: string;
      sdp: unknown;
    }
  | {
      type: 'webrtc_answer';
      conversationId: string;
      callId: string;
      senderId: string;
      sdp: unknown;
    }
  | {
      type: 'ice_candidate';
      conversationId: string;
      callId: string;
      senderId: string;
      candidate: unknown;
    }
  | {
      type: 'contact_request_received';
      request: {
        id: string;
        senderId: string;
        receiverId: string;
        status: 'pending' | 'accepted' | 'rejected';
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      type: 'contact_request_accepted';
      request: {
        id: string;
        senderId: string;
        receiverId: string;
        status: 'pending' | 'accepted' | 'rejected';
        createdAt: string;
        updatedAt: string;
      };
      conversation: Conversation;
    }
  | {
      type: 'contact_request_rejected';
      request: {
        id: string;
        senderId: string;
        receiverId: string;
        status: 'pending' | 'accepted' | 'rejected';
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      type: 'contact_removed';
      contact: {
        id: string;
        senderId: string;
        receiverId: string;
        status: 'accepted';
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      type: 'joined_conversation';
      conversationId: string;
    }
  | {
      type: 'left_conversation';
      conversationId: string;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'ack';
      received: string;
    };

export type SocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
};

let socket: WebSocket | null = null;
let socketLike: SocketLike | null = null;

function createSocketLike(currentSocket: WebSocket): SocketLike {
  return {
    get readyState() {
      return currentSocket.readyState;
    },

    send(data: string) {
      if (currentSocket.readyState !== WebSocket.OPEN) {
        console.warn('[WebSocket] Cannot send message: socket is not open');

        return;
      }

      currentSocket.send(data);
    },

    close() {
      if (
        currentSocket.readyState === WebSocket.OPEN ||
        currentSocket.readyState === WebSocket.CONNECTING
      ) {
        currentSocket.close();
      }
    },
  };
}

export function getSocket(): SocketLike | null {
  return socketLike;
}

export function connectSocket(
  token: string,
  onMessage: (event: RealtimeEvent) => void,
  onOpen?: () => void,
  onClose?: () => void,
): SocketLike {
  /**
   * Reuse existing WebSocket when it is
   * already connected or connecting.
   */
  if (socket) {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socketLike ??= createSocketLike(socket);

      return socketLike;
    }

    socket.close();
    socket = null;
    socketLike = null;
  }

  const separator = WS_URL.includes('?') ? '&' : '?';

  const url = `${WS_URL}${separator}token=${encodeURIComponent(token)}`;

  console.log('[WebSocket] Connecting:', WS_URL);

  const currentSocket = new WebSocket(url);

  socket = currentSocket;

  currentSocket.onopen = () => {
    console.log('[WebSocket] Connected');

    onOpen?.();
  };

  currentSocket.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as RealtimeEvent;

      console.log('[WebSocket] Message:', data);

      onMessage(data);
    } catch (error) {
      console.error('[WebSocket] Invalid server message:', error);
    }
  };

  currentSocket.onerror = (error) => {
    console.error('[WebSocket] Connection error:', error);

    onMessage({
      type: 'error',
      message: 'WebSocket connection error',
    });
  };

  currentSocket.onclose = (event) => {
    console.log('[WebSocket] Disconnected:', event.code, event.reason);

    onClose?.();

    if (socket === currentSocket) {
      socket = null;
      socketLike = null;
    }
  };

  socketLike = createSocketLike(currentSocket);

  return socketLike;
}

export function disconnectSocket(): void {
  const currentSocket = socket;

  socket = null;
  socketLike = null;

  if (
    currentSocket &&
    (currentSocket.readyState === WebSocket.OPEN ||
      currentSocket.readyState === WebSocket.CONNECTING)
  ) {
    currentSocket.close();
  }
}
