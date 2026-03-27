/**
 * ELECTRON VISION - Socket.io Handler
 * Real-time events for sessions, notifications, and chat
 * FIXED: Prevents duplicate connections, proper auth, room management
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');

// Store connected users: userId -> socketId
// FIXED: Use Set to allow multiple sockets per user but track them
const connectedUsers = new Map(); // userId -> Set of socketIds
// Store socketId -> userId mapping
const socketToUser = new Map();
// Track rooms per socket for cleanup
const socketRooms = new Map();

// FIXED: Prevent duplicate socket connections
let socketInitialized = false;

function initializeSocket(io) {
  // Prevent multiple initializations
  if (socketInitialized) {
    console.log('⚠️  Socket.io already initialized, skipping...');
    return io;
  }
  socketInitialized = true;

  // Authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        socket.authenticated = true;
        console.log(`🔐 Socket ${socket.id} authenticated for user ${decoded.id}`);
        next();
      } catch (err) {
        // Invalid token - allow as guest but mark as unauthenticated
        socket.user = null;
        socket.authenticated = false;
        console.log(`🔓 Socket ${socket.id} connected as guest (invalid token)`);
        next();
      }
    } else {
      // No token - allow as guest
      socket.user = null;
      socket.authenticated = false;
      console.log(`🔓 Socket ${socket.id} connected as guest`);
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    
    // FIXED: Register user if authenticated - track properly
    if (socket.user) {
      const userId = socket.user.id;
      
      // Add socket to user's connection set
      if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
      }
      connectedUsers.get(userId).add(socket.id);
      socketToUser.set(socket.id, userId);
      
      // Join user to their personal room for targeted notifications
      socket.join(`user_${userId}`);
      
      console.log(`👤 User ${userId} connected via socket ${socket.id} (total: ${connectedUsers.get(userId).size} connections)`);
    }
    
    // FIXED: Join a specific chat room with validation
    socket.on('join_room', (roomId) => {
      // Validate roomId
      if (!roomId || typeof roomId !== 'string' && typeof roomId !== 'number') {
        console.warn(`⚠️  Invalid roomId attempt from socket ${socket.id}`);
        return;
      }
      
      const roomIdStr = String(roomId);
      
      // Track room membership
      if (!socketRooms.has(socket.id)) {
        socketRooms.set(socket.id, new Set());
      }
      socketRooms.get(socket.id).add(roomIdStr);
      
      socket.join(`room_${roomIdStr}`);
      console.log(`📝 Socket ${socket.id} joined room_${roomIdStr}`);
      
      // Confirm room join
      socket.emit('room_joined', { roomId: roomIdStr });
    });
    
    // FIXED: Leave a chat room with proper cleanup
    socket.on('leave_room', (roomId) => {
      if (!roomId) return;
      
      const roomIdStr = String(roomId);
      
      // Remove from tracked rooms
      if (socketRooms.has(socket.id)) {
        socketRooms.get(socket.id).delete(roomIdStr);
      }
      
      socket.leave(`room_${roomIdStr}`);
      console.log(`📝 Socket ${socket.id} left room_${roomIdStr}`);
    });
    
    // FIXED: Handle chat message with server-side validation
    socket.on('send_message', (data) => {
      const { roomId, message, userId, username } = data;
      
      // Validate message data
      if (!roomId || !message || !userId) {
        console.warn('⚠️  Invalid message data from socket', socket.id);
        return;
      }
      
      // Sanitize message on server side
      const sanitizedMessage = sanitizeMessage(message);
      
      // Only broadcast if user is in the room
      if (socketRooms.has(socket.id) && socketRooms.get(socket.id).has(String(roomId))) {
        io.to(`room_${roomId}`).emit('new_message', {
          roomId,
          message: sanitizedMessage,
          userId,
          username: username || 'Unknown',
          timestamp: new Date().toISOString()
        });
      } else {
        console.warn(`⚠️  User ${userId} tried to send message to room ${roomId} without joining`);
      }
    });
    
    // Handle typing indicator
    socket.on('typing', (data) => {
      const { roomId, username } = data;
      
      if (!roomId || !socketRooms.has(socket.id) || !socketRooms.get(socket.id).has(String(roomId))) {
        return;
      }
      
      socket.to(`room_${roomId}`).emit('user_typing', { 
        username: username || 'Unknown',
        roomId 
      });
    });
    
    // FIXED: Handle disconnect with proper cleanup
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      
      const userId = socketToUser.get(socket.id);
      if (userId) {
        // Remove socket from user's connection set
        const userSockets = connectedUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            connectedUsers.delete(userId);
            console.log(`👤 User ${userId} completely disconnected`);
          } else {
            console.log(`👤 User ${userId} still has ${userSockets.size} active connections`);
          }
        }
        socketToUser.delete(socket.id);
      }
      
      // Clean up room memberships
      socketRooms.delete(socket.id);
    });
    
    // FIXED: Handle reconnection - clean up old sockets
    socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket ${socket.id} reconnected after ${attemptNumber} attempts`);
      
      // Re-authenticate if user was authenticated before
      if (socket.user) {
        const userId = socket.user.id;
        if (!connectedUsers.has(userId)) {
          connectedUsers.set(userId, new Set());
        }
        connectedUsers.get(userId).add(socket.id);
        socketToUser.set(socket.id, userId);
        socket.join(`user_${userId}`);
      }
    });
  });

  return io;
}

// FIXED: Sanitize message to prevent XSS
function sanitizeMessage(message) {
  if (typeof message !== 'string') return '';
  
  return message
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

// Emit event to specific user
function emitToUser(io, userId, event, data) {
  if (connectedUsers.has(userId)) {
    io.to(`user_${userId}`).emit(event, data);
    return true;
  }
  return false;
}

// Emit event to all connected clients
function emitToAll(io, event, data) {
  io.emit(event, data);
}

// Emit event to admin
function emitToAdmin(io, event, data) {
  // Admin has userId = 1
  emitToUser(io, 1, event, data);
}

// Emit new session booking to admin
function emitNewSession(io, session) {
  emitToAdmin(io, 'new_session', {
    session,
    message: 'حجز جلسة جديد',
    timestamp: new Date().toISOString()
  });
}

// Emit session status change to user
function emitSessionStatusChange(io, userId, session) {
  emitToUser(io, userId, 'session_status_change', {
    session,
    status: session.status,
    timestamp: new Date().toISOString()
  });
}

// Emit new notification
function emitNotification(io, userId, notification) {
  emitToUser(io, userId, 'notification', {
    notification,
    timestamp: new Date().toISOString()
  });
}

// Emit chat message
function emitChatMessage(io, roomId, message) {
  io.to(`room_${roomId}`).emit('new_message', message);
}

// Get connected users count
function getConnectedUsersCount() {
  return connectedUsers.size;
}

// Check if user is online
function isUserOnline(userId) {
  return connectedUsers.has(userId);
}

// Get user's all socket connections
function getUserSocketCount(userId) {
  const sockets = connectedUsers.get(userId);
  return sockets ? sockets.size : 0;
}

module.exports = {
  initializeSocket,
  emitToUser,
  emitToAll,
  emitToAdmin,
  emitNewSession,
  emitSessionStatusChange,
  emitNotification,
  emitChatMessage,
  getConnectedUsersCount,
  isUserOnline,
  getUserSocketCount,
  connectedUsers,
  socketToUser
};
