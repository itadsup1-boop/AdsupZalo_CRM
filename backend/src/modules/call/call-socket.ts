import { Server, Socket } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';

export function registerCallSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    
    // Join a video call room
    socket.on('call:join-room', (data: { roomId: string; userId: string; userName: string }) => {
      const { roomId, userId, userName } = data;
      socket.join(`call_${roomId}`);
      logger.info(`[call] User ${userName} (${userId}) joined room ${roomId}`);
      
      // Notify others in the room
      socket.to(`call_${roomId}`).emit('call:user-joined', { userId, userName, socketId: socket.id });
    });

    // Handle WebRTC signaling (offer, answer, ice-candidate)
    socket.on('call:signal', (data: { roomId: string; targetSocketId?: string; signal: any; userId: string; userName: string }) => {
      const { roomId, targetSocketId, signal, userId, userName } = data;
      
      // If a specific target is provided, send only to them (e.g. answering a specific offer)
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:signal', { signal, userId, userName, socketId: socket.id });
      } else {
        // Otherwise broadcast to everyone else in the room (e.g. sending initial offer)
        socket.to(`call_${roomId}`).emit('call:signal', { signal, userId, userName, socketId: socket.id });
      }
    });

    // Leave room
    socket.on('call:leave-room', (data: { roomId: string; userId: string }) => {
      const { roomId, userId } = data;
      socket.leave(`call_${roomId}`);
      socket.to(`call_${roomId}`).emit('call:user-left', { userId, socketId: socket.id });
      logger.info(`[call] User ${userId} left room ${roomId}`);
    });

    // Handle disconnect to clean up
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('call_')) {
          socket.to(room).emit('call:user-left', { socketId: socket.id });
        }
      }
    });
  });
}
