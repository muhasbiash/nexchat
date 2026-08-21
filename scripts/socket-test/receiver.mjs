import { io } from 'socket.io-client';

const token = process.env.TOKEN;
const conversationId = process.env.CONVERSATION_ID;
const label = process.env.LABEL || 'RECEIVER';

if (!token) {
  console.error('TOKEN is required');
  process.exit(1);
}

if (!conversationId) {
  console.error('CONVERSATION_ID is required');
  process.exit(1);
}

const socket = io('http://localhost:3000', {
  auth: {
    token,
  },
});

socket.on('connect', () => {
  console.log(`[${label}] connected: ${socket.id}`);

  socket.emit('join_conversation', conversationId);

  console.log(
    `[${label}] joined conversation: ${conversationId}`,
  );

  console.log(`[${label}] waiting for incoming messages...`);
});

socket.on('conversation_access_denied', (data) => {
  console.log(`[${label}] conversation_access_denied:`, data);
});

socket.on('new_message', (message) => {
  console.log(`[${label}] RECEIVED new_message:`, message);
});

socket.on('connect_error', (error) => {
  console.error(`[${label}] connect_error:`, error.message);
});

socket.on('disconnect', (reason) => {
  console.log(`[${label}] disconnected:`, reason);
});
