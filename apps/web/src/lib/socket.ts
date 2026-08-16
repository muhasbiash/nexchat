import { io, type Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return socket;
}

export function connectSocket(token: string): Socket {
  const currentSocket = getSocket();

  currentSocket.auth = {
    token,
  };

  if (!currentSocket.connected) {
    currentSocket.connect();
  }

  return currentSocket;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
