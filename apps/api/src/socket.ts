import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

import { verifyToken } from './services/auth.service.js';
import { sendMessage } from './services/message.service.js';

interface SocketUser {
  id: string;
  email: string;
}

interface AuthenticatedSocket {
  user: SocketUser;
}

let socketServer: Server | null = null;

export function getSocketServer(): Server {
  if (!socketServer) {
    throw new Error('Socket.IO server is not initialized');
  }

  return socketServer;
}

export function initializeSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  socketServer = io;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication required'));
      }

      const payload = verifyToken(token);

      (socket.data as AuthenticatedSocket).user = {
        id: payload.sub,
        email: payload.email,
      };

      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedSocket = socket.data as AuthenticatedSocket;
    const user = authenticatedSocket.user;

    console.log(`Socket connected: ${user.email}`);

    socket.join(`user:${user.id}`);

    socket.on('join_conversation', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string') {
        return;
      }

      socket.join(`conversation:${conversationId}`);

      console.log(`${user.email} joined conversation ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string') {
        return;
      }

      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('typing_start', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string') {
        return;
      }

      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId: user.id,
      });
    });

    socket.on('typing_stop', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string') {
        return;
      }

      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        conversationId,
        userId: user.id,
      });
    });

    socket.on(
      'send_message',
      async (
        payload: {
          conversationId: string;
          content: string;
        },
        callback?: (response: { success: boolean; message?: unknown; error?: string }) => void,
      ) => {
        try {
          if (!payload?.conversationId || !payload?.content) {
            callback?.({
              success: false,
              error: 'Conversation ID and message content are required',
            });

            return;
          }

          const content = payload.content.trim();

          if (!content) {
            callback?.({
              success: false,
              error: 'Message content is required',
            });

            return;
          }

          const message = await sendMessage(payload.conversationId, user.id, content);

          io.to(`conversation:${payload.conversationId}`).emit('new_message', message);

          callback?.({
            success: true,
            message,
          });
        } catch (error) {
          console.error('Socket send message error:', error);

          callback?.({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send message',
          });
        }
      },
    );

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${user.email}`);
    });
  });

  return io;
}
