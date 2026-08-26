import type { Message } from '../types/message';
import type { Conversation } from '../types/conversation';

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8787';

const WS_URL =
  API_URL.replace(/^http/, 'ws') + '/ws';

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
      type: 'ack';
      received: unknown;
    }
  | {
      type: 'error';
      message: string;
    };

let socket: WebSocket | null = null;

export function getSocket(): WebSocket | null {
  return socket;
}

export function connectSocket(
  token: string,
  onMessage: (event: RealtimeEvent) => void,
): WebSocket {
  disconnectSocket();

  const url = new URL(WS_URL);

  url.searchParams.set('token', token);

  const currentSocket = new WebSocket(
    url.toString(),
  );

  socket = currentSocket;

  currentSocket.addEventListener(
    'message',
    (event) => {
      try {
        const data = JSON.parse(
          event.data,
        ) as RealtimeEvent;

        onMessage(data);
      } catch (error) {
        console.error(
          '[WebSocket] Invalid message:',
          error,
        );
      }
    },
  );

  currentSocket.addEventListener(
    'open',
    () => {
      console.log(
        '[WebSocket] Connected',
      );
    },
  );

  currentSocket.addEventListener(
    'close',
    (event) => {
      console.log(
        '[WebSocket] Disconnected:',
        event.code,
        event.reason,
      );
    },
  );

  currentSocket.addEventListener(
    'error',
    (error) => {
      console.error(
        '[WebSocket] Error:',
        error,
      );
    },
  );

  return currentSocket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function sendSocketMessage(
  data: unknown,
): void {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    throw new Error(
      'WebSocket is not connected',
    );
  }

  socket.send(
    JSON.stringify(data),
  );
}
