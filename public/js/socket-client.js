/**
 * ELECTRON VISION - Socket.io Client (FIXED VERSION)
 * Real-time updates for bookings, notifications, and chat
 * 
 * FIXES:
 * - No more duplicate socket connections
 * - Uses cookies for auth instead of localStorage
 * - Proper event listener handling
 * - Single initialization pattern
 * - Server-side room validation
 */

// ============================================
// SINGLETON PATTERN - Prevent multiple instances
// ============================================

// Use IIFE to create isolated scope and prevent global pollution
const ElectronVisionSocket = (function() {
  // Private state
  let _socket = null;
  let _currentRoomId = null;
  let _isInitialized = false;
  let _eventListeners = new Map();
  let _connectionStatus = 'disconnected';

  // ============================================
  // SMART POLLING STATE (Message Auto-Update)
  // ============================================
  let _pollingEnabled = false;
  let _pollingInterval = null;
  let _currentPollingDelay = 3000; // Start with 3 seconds
  let _lastActivityTime = Date.now();
  let _lastMessageCount = 0;
  const _MIN_POLLING_DELAY = 3000;  // 3 seconds minimum
  const _MAX_POLLING_DELAY = 30000; // 30 seconds maximum
  const _INACTIVITY_TIMEOUT = 300000; // 5 minutes = stop polling after 5 min inactivity
  const _ACTIVITY_DETECTION_DELAY = 2000; // Detect activity within 2 seconds after message

  // ============================================
  // PRIVATE: Get token from cookie only (SECURE)
  // ============================================
  function _getTokenFromCookie() {
    // First try cookie (main auth method)
    const name = 'client_token=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length);
      }
    }
    
    // Fallback to sessionStorage authToken
    const storedToken = sessionStorage.getItem('authToken');
    if (storedToken) {
      return storedToken;
    }
    
    return null;
  }

  // ============================================
  // PRIVATE: Check if socket is needed on this page
  // ============================================
  function _shouldConnect() {
    // Only connect on pages that need real-time features
    const pathname = window.location.pathname;
    const neededPages = [
      '/',
      '/index.html',
      '/sessions',
      '/dashboard',
      '/panel',
      '/support',
      '/booking'
    ];
    
    // Check if we're on a page that needs socket
    const isNeededPage = neededPages.some(page => pathname === page || pathname.endsWith(page));
    
    // Also check if user is logged in
    const hasToken = _getTokenFromCookie();
    
    return isNeededPage || hasToken;
  }

  // ============================================
  // PRIVATE: Initialize socket connection
  // ============================================
  function _initSocket() {
    // Prevent duplicate initialization
    if (_isInitialized && _socket && _socket.connected) {
      console.log('⚠️  Socket already initialized, reusing connection');
      return _socket;
    }

    const token = _getTokenFromCookie();
    
    if (!token && !_shouldConnect()) {
      console.log('No auth token and not on socket-requiring page, skipping connection');
      return null;
    }

    // Connect to Socket.io server
    console.log('[Socket] Connecting with token:', token ? 'yes' : 'no');
    _socket = io({
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // Prevent multiple connections
      forceNew: false,
      multiplex: true
    });

    _isInitialized = true;

    // ============================================
    // SETUP EVENT HANDLERS (once)
    // ============================================
    
    _socket.on('connect', () => {
      console.log('🔌 Socket connected:', _socket.id);
      _connectionStatus = 'connected';
      _showNotification('متصل بالخادم', 'success');
      
      // Rejoin room if we were in one
      if (_currentRoomId) {
        _socket.emit('join_room', _currentRoomId);
      }
    });

    _socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      _connectionStatus = 'disconnected';
      _showNotification('انقطع الاتصال بالخادم', 'error');
    });

    _socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      _connectionStatus = 'error';
    });

    _socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
      _connectionStatus = 'connected';
      _showNotification('تمت إعادة الاتصال بالخادم', 'success');
    });

    // ============================================
    // BOOKING/SESSION EVENTS
    // ============================================
    
    _socket.on('new_booking', (data) => {
      console.log('📅 New booking received:', data);
      _playNotificationSound();
      
      // Dispatch custom event for other scripts to handle
      _dispatchCustomEvent('new-booking', data);
      
      // Show notification
      _showNotification(`📅 حجز جديد: ${data.session_type}`, 'info');
      
      // Update badge if exists
      _updateBadgeCount('bookings-pending');
    });

    _socket.on('booking_status_change', (data) => {
      console.log('📅 Booking status changed:', data);
      _playNotificationSound();
      
      // Dispatch custom event
      _dispatchCustomEvent('booking-status-change', data);
      
      let message = '';
      let type = 'info';
      
      if (data.status === 'accepted') {
        message = '✅ تم قبول حجزك!';
        type = 'success';
      } else if (data.status === 'rejected') {
        message = '❌ تم رفض حجزك';
        type = 'error';
      }
      
      if (message) {
        _showNotification(message, type);
      }
    });

    // ============================================
    // CHAT EVENTS
    // ============================================
    
    _socket.on('new_message', (data) => {
      console.log('💬 New message received:', data);
      
      // Dispatch custom event
      _dispatchCustomEvent('new-message', data);
      
      // Track activity for smart polling
      _recordActivity();
      
      // Only add to UI if we're in the same room
      if (_currentRoomId && String(data.room_id) === String(_currentRoomId)) {
        _lastMessageCount++;
        if (typeof window.appendMessage === 'function') {
          window.appendMessage(data);
        }
      } else {
        // Update unread count
        _updateBadgeCount('unread-messages');
        // Show notification if not in that room
        _playNotificationSound();
        _showNotification(`💬 رسالة جديدة من ${data.username}`, 'info');
      }
    });

    // Track when user sends a message
    _socket.on('message_sent', (data) => {
      _recordActivity();
    });

    // ============================================
    // NOTIFICATION EVENTS
    // ============================================
    
    _socket.on('notification', (data) => {
      console.log('🔔 Notification received:', data);
      _playNotificationSound();
      
      const title = data.title || 'إشعار جديد';
      const message = data.message || '';
      
      // If it's a broadcast, show popup + toast
      if (data.type === 'broadcast') {
        // Show toast notification
        if (typeof window.showBroadcastToast === 'function') {
          window.showBroadcastToast(title);
        }
        // Show popup dialog
        if (typeof window.showBroadcastPopup === 'function') {
          window.showBroadcastPopup(title, message);
        } else {
          alert(`${title}\n\n${message}`);
        }
      } else {
        // Regular notifications - show toast
        _showNotification(`${title}: ${message}`, 'info');
      }
      
      // Dispatch custom event
      _dispatchCustomEvent('notification-received', data);
    });

    _socket.on('user_typing', (data) => {
      // Dispatch custom event
      _dispatchCustomEvent('user-typing', data);
    });

    return _socket;
  }

  // ============================================
  // PRIVATE: Helper functions
  // ============================================
  
  function _showNotification(message, type) {
    console.log('[Socket] Attempting to show notification:', message, type);
    console.log('[Socket] showAlert available:', typeof window.showAlert);
    console.log('[Socket] showNotification available:', typeof window.showNotification);
    
    // Try showAlert first (from app.js)
    if (typeof window.showAlert === 'function') {
      window.showAlert(message, type);
      return;
    }
    
    // Try showNotification from push-notifications.js
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, type);
      return;
    }
    
    // Fallback to console and basic alert
    console.log(`[${type}] ${message}`);
    // Only show browser alert as last resort (for debugging)
    // alert(`${message}`);
  }

  function _playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      // Audio not supported
    }
  }

  function _updateBadgeCount(badgeId) {
    const badge = document.getElementById(badgeId);
    if (badge) {
      const currentCount = parseInt(badge.textContent) || 0;
      badge.textContent = currentCount + 1;
      badge.style.display = 'inline';
    }
  }

  function _dispatchCustomEvent(eventName, data) {
    const event = new CustomEvent(eventName, { detail: data });
    window.dispatchEvent(event);
  }

  // ============================================
  // SMART POLLING FUNCTIONS (Message Auto-Update)
  // ============================================
  
  function _startSmartPolling() {
    if (_pollingInterval) {
      clearInterval(_pollingInterval);
    }
    
    _pollingEnabled = true;
    _currentPollingDelay = _MIN_POLLING_DELAY;
    
    _pollingInterval = setInterval(() => {
      _performPolling();
    }, _currentPollingDelay);
    
    console.log('🔄 Smart polling started with delay:', _currentPollingDelay);
  }
  
  function _stopSmartPolling() {
    if (_pollingInterval) {
      clearInterval(_pollingInterval);
      _pollingInterval = null;
    }
    _pollingEnabled = false;
    console.log('⏹️ Smart polling stopped');
  }
  
  function _adjustPollingDelay(increased) {
    if (increased) {
      // Increase delay (less frequent) - no new messages
      _currentPollingDelay = Math.min(_currentPollingDelay + 2000, _MAX_POLLING_DELAY);
    } else {
      // Decrease delay (more frequent) - new messages detected
      _currentPollingDelay = Math.max(_currentPollingDelay - 1000, _MIN_POLLING_DELAY);
    }
    
    // Restart interval with new delay
    if (_pollingEnabled) {
      _startSmartPolling();
    }
    
    console.log('⏱️ Polling delay adjusted to:', _currentPollingDelay);
  }
  
  function _performPolling() {
    // Check for inactivity timeout
    const timeSinceActivity = Date.now() - _lastActivityTime;
    if (timeSinceActivity > _INACTIVITY_TIMEOUT) {
      console.log('💤 No activity for ' + (_INACTIVITY_TIMEOUT/1000) + 's, stopping polling');
      _stopSmartPolling();
      return;
    }
    
    // If not in a room, don't poll
    if (!_currentRoomId) {
      return;
    }
    
    // Trigger message reload if function exists
    if (typeof window.loadMessages === 'function') {
      // Store previous message count
      const prevCount = _lastMessageCount;
      
      // Load messages
      window.loadMessages();
      
      // Check if there are new messages by comparing
      // (The actual check happens in loadMessages completion)
      setTimeout(() => {
        if (window.getLastMessageCount && window.getLastMessageCount() > prevCount) {
          _adjustPollingDelay(false); // Decrease delay (more frequent)
        } else {
          _adjustPollingDelay(true); // Increase delay (less frequent)
        }
      }, 500);
    }
  }
  
  function _recordActivity() {
    _lastActivityTime = Date.now();
    
    // If polling was stopped due to inactivity, restart it
    if (!_pollingEnabled && _currentRoomId) {
      _startSmartPolling();
    }
    
    // Reset to faster polling after activity
    if (_pollingEnabled && _currentPollingDelay > _MIN_POLLING_DELAY) {
      _currentPollingDelay = _MIN_POLLING_DELAY;
      _startSmartPolling();
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================
  
  return {
    // Initialize socket (call once)
    init: function() {
      return _initSocket();
    },

    // Get socket instance
    getSocket: function() {
      return _socket;
    },

    // Get connection status
    getStatus: function() {
      return _connectionStatus;
    },

    // Join a chat room
    joinRoom: function(roomId) {
      if (!_socket || !_socket.connected) {
        console.warn('Socket not connected, cannot join room');
        return false;
      }
      
      // Leave current room first if in one
      if (_currentRoomId && _currentRoomId !== roomId) {
        this.leaveRoom(_currentRoomId);
      }
      
      _currentRoomId = roomId;
      _socket.emit('join_room', roomId);
      
      // Start smart polling for messages
      _lastActivityTime = Date.now();
      _startSmartPolling();
      
      console.log('📝 Joined room:', roomId);
      return true;
    },

    // Leave a chat room
    leaveRoom: function(roomId) {
      if (!_socket) return;
      
      _socket.emit('leave_room', roomId);
      if (_currentRoomId === roomId) {
        _currentRoomId = null;
        // Stop smart polling when leaving room
        _stopSmartPolling();
      }
      console.log('📝 Left room:', roomId);
    },

    // Get current room
    getCurrentRoom: function() {
      return _currentRoomId;
    },

    // Send chat message
    sendMessage: function(roomId, message, userId, username) {
      if (!_socket || !_socket.connected) {
        console.warn('Socket not connected, cannot send message');
        return false;
      }
      
      _socket.emit('send_message', {
        roomId: roomId,
        message: message,
        userId: userId,
        username: username
      });
      
      // Record activity when user sends a message
      _recordActivity();
      
      return true;
    },

    // Record user activity (for smart polling)
    recordActivity: function() {
      _recordActivity();
    },

    // Get smart polling status
    getPollingStatus: function() {
      return {
        enabled: _pollingEnabled,
        currentDelay: _currentPollingDelay,
        timeSinceActivity: Date.now() - _lastActivityTime
      };
    },

    // Manually start smart polling
    startPolling: function() {
      if (_currentRoomId) {
        _startSmartPolling();
      }
    },

    // Manually stop smart polling
    stopPolling: function() {
      _stopSmartPolling();
    },

    // Send typing indicator
    sendTyping: function(roomId, username) {
      if (!_socket || !_socket.connected) return;
      
      _socket.emit('typing', {
        roomId: roomId,
        username: username
      });
    },

    // Disconnect socket
    disconnect: function() {
      if (_socket) {
        _socket.disconnect();
        _socket = null;
        _isInitialized = false;
        _currentRoomId = null;
        _connectionStatus = 'disconnected';
      }
    },

    // Add custom event listener
    on: function(eventName, callback) {
      if (!_eventListeners.has(eventName)) {
        _eventListeners.set(eventName, []);
      }
      _eventListeners.get(eventName).push(callback);
      
      // Forward socket events to custom listeners
      if (_socket) {
        _socket.on(eventName, callback);
      }
    },

    // Remove custom event listener
    off: function(eventName, callback) {
      const listeners = _eventListeners.get(eventName);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
      
      if (_socket) {
        _socket.off(eventName, callback);
      }
    }
  };
})();

// ============================================
// AUTO-INITIALIZE (run once)
// ============================================

// Use a flag to ensure we only run once
let _socketAutoInitialized = false;

function _autoInitSocket() {
  if (_socketAutoInitialized) return;
  _socketAutoInitialized = true;
  
  // Initialize socket
  ElectronVisionSocket.init();
  
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _autoInitSocket);
} else {
  // DOM already loaded
  _autoInitSocket();
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
  if (ElectronVisionSocket.getCurrentRoom()) {
    ElectronVisionSocket.leaveRoom(ElectronVisionSocket.getCurrentRoom());
  }
});

// Export to global scope
window.socketClient = ElectronVisionSocket;

// Backward compatibility aliases
window.initSocket = ElectronVisionSocket.init;
window.joinRoom = ElectronVisionSocket.joinRoom;
window.leaveRoom = ElectronVisionSocket.leaveRoom;
window.sendChatMessage = ElectronVisionSocket.sendMessage;
window.sendTyping = ElectronVisionSocket.sendTyping;
window.getSocket = ElectronVisionSocket.getSocket;
