import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:5002';
const PING_TIMEOUT = 60000;
const PING_INTERVAL = 25000;

class ChatService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.listeners = new Map(); // Map<event, Set<callback>>
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.tokenGetter = null;
    this.userIdGetter = null;
    // pendingRequests is no longer used for bot_response matching
    // (server emits generic 'bot_response', not per-request events)
    this.requestId = 0;
  }

  setTokenGetter(getter) {
    if (typeof getter === 'function') {
      this.tokenGetter = getter;
      console.log('[chatService] Token getter initialized');
    }
  }

  setUserIdGetter(getter) {
    if (typeof getter === 'function') {
      this.userIdGetter = getter;
      console.log('[chatService] UserId getter initialized');
    }
  }

  getToken() {
    const token = this.tokenGetter ? this.tokenGetter() : null;
    return token;
  }

  getUserId() {
    if (this.userIdGetter) {
      return this.userIdGetter();
    }
    if (typeof window !== 'undefined' && window.__REDUX_GETTERS__?.userIdGetter) {
      return window.__REDUX_GETTERS__.userIdGetter();
    }
    return null;
  }

  /**
   * Connect to socket server.
   * Connection happens FIRST, then authentication fires on the 'connect' event.
   */
  connect(userId = null, token = null) {
    console.log('[chatService] Connect called with:', { userId, hasToken: !!token });

    // Always disconnect existing socket so we get a fresh connection with new credentials
    if (this.socket) {
      console.log('[chatService] Disconnecting existing socket');
      try {
        this.socket.disconnect();
      } catch (e) {
        console.error('[chatService] Error disconnecting:', e);
      }
      this.socket = null;
      this.isConnected = false;
      this.isAuthenticated = false;
    }

    const socketConfig = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      pingTimeout: PING_TIMEOUT,
      pingInterval: PING_INTERVAL,
      withCredentials: true,
      autoConnect: true,
    };

    console.log('[chatService] Creating socket connection to:', SOCKET_URL);
    this.socket = io(SOCKET_URL, socketConfig);
    this.setupEventListeners();
    this.rebindListeners();

    return this.socket;
  }

  setupEventListeners() {
    if (!this.socket) return;

    console.log('[chatService] Setting up event listeners');

    this.socket.on('connect', () => {
      console.log('[chatService] ✅ Socket connected! Socket ID:', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Always use fresh getters on connect/reconnect
      const freshToken = this.getToken();
      const freshUserId = this.getUserId();
      this.authenticate(freshUserId, freshToken);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[chatService] ❌ Socket disconnected. Reason:', reason);
      this.isConnected = false;
      this.isAuthenticated = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('[chatService] ⚠️ Connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emitToListeners('error', {
          message: 'Failed to connect to chat service. Please refresh the page.',
          code: 'MAX_RECONNECT_ATTEMPTS',
        });
      }
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[chatService] ❌ Reconnect failed');
      this.emitToListeners('error', {
        message: 'Unable to reconnect to chat service',
        code: 'RECONNECT_FAILED',
      });
    });

    // ---------------------------------------------------------------
    // Authentication response
    // Note: server sends { isAuthenticated, username, timestamp }
    // ---------------------------------------------------------------
    this.socket.on('authenticated', (data) => {
      console.log('[chatService] ✅ Authentication response:', data);
      // Use isAuthenticated field from server, not data.success
      this.isAuthenticated = data.isAuthenticated === true;
      this.emitToListeners('authenticated', data);
    });

    this.socket.on('error', (error) => {
      console.error('[chatService] Server error:', error);
      this.emitToListeners('error', error);
    });

    this.socket.on('bot_typing', (data) => {
      console.log('[chatService] Bot typing:', data.isTyping);
      this.emitToListeners('bot_typing', data);
    });

    // ---------------------------------------------------------------
    // bot_response: server ALWAYS emits this generic event.
    // Forward to all registered external listeners (ChatBot.jsx).
    // ---------------------------------------------------------------
    this.socket.on('bot_response', (data) => {
      console.log('[chatService] ✅ Bot response received:', data?.messageId);
      this.emitToListeners('bot_response', data);
    });

    this.socket.on('bot_response_chunk', (data) => {
      console.log('[chatService] ⚡ Bot response chunk received:', data?.messageId, 'isLast:', data?.isLast);
      this.emitToListeners('bot_response_chunk', data);
    });

    this.socket.on('suggestions_update', (data) => {
      console.log('[chatService] Suggestions received:', data.suggestions?.length);
      this.emitToListeners('suggestions_update', data);
    });

    this.socket.on('chat_cleared', (data) => {
      console.log('[chatService] Chat cleared:', data);
      this.emitToListeners('chat_cleared', data);
    });

    this.socket.on('rating_received', (data) => {
      console.log('[chatService] Rating received:', data);
      this.emitToListeners('rating_received', data);
    });

    this.socket.on('chat_history', (data) => {
      console.log('[chatService] Chat history received:', data?.messages?.length, 'messages');
      this.emitToListeners('chat_history', data);
    });
  }

  authenticate(userId = null, token = null) {
    if (!this.socket?.connected) {
      console.warn('[chatService] Cannot authenticate - socket not connected');
      return;
    }

    const authToken = token || this.getToken();
    const finalUserId = userId || this.getUserId();

    console.log('[chatService] 🔐 Authenticating:', {
      userId: finalUserId,
      hasToken: !!authToken,
      isGuest: !authToken,
    });

    this.socket.emit('authenticate', {
      userId: finalUserId || null,
      token: authToken || null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a message.
   *
   * IMPORTANT FIX: The server emits a generic 'bot_response' event, not a
   * per-request 'bot_response_<id>' event. Therefore this method:
   *   1. Emits 'send_message' to the server.
   *   2. Returns a Promise that resolves immediately with { sent: true }.
   *
   * The actual bot response is received by the 'bot_response' listener set up
   * in setupEventListeners() and forwarded to ChatBot.jsx via emitToListeners.
   * ChatBot.jsx calls dispatch(addBotMessage(data)) directly — that is the
   * correct and only path for updating the messages list.
   *
   * The Redux thunk (sendMessage in chatSlice) must NOT add any bot message
   * on its own — its only job is to trigger the emit and set loading state.
   */
  sendMessage(message, conversationHistory = [], vaultId = null, currencySymbol = '₹') {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        console.error('[chatService] Cannot send message - socket not connected');
        reject(new Error('Socket not connected'));
        return;
      }

      if (!message || typeof message !== 'string' || !message.trim()) {
        console.error('[chatService] Invalid message');
        reject(new Error('Invalid message'));
        return;
      }

      const reqId = this.requestId++;

      console.log('[chatService] 📤 Sending message:', {
        requestId: reqId,
        messageLength: message.length,
        historyLength: conversationHistory.length,
      });

      this.socket.emit('send_message', {
        message: message.trim(),
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
        vault_id: vaultId || null,
        timestamp: new Date().toISOString(),
        requestId: reqId,
        currencySymbol,
      });

      // Resolve immediately — bot_response arrives asynchronously via socket
      // listener and is dispatched by ChatBot.jsx independently.
      resolve({ sent: true, requestId: reqId });
    });
  }

  triggerEmbedding() {
    console.log('[chatService] Triggering RAG embedding generation via direct HTTP POST');
    fetch(`${SOCKET_URL}/api/rag/trigger-embedding`, {
      method: 'POST',
      mode: 'cors',
    }).catch((err) => {
      // Keep quiet. The 5-min cron job will handle it
    });
  }

  getSuggestions() {
    if (!this.socket?.connected) {
      console.warn('[chatService] Cannot get suggestions - socket not connected');
      return;
    }
    console.log('[chatService] Requesting suggestions');
    this.socket.emit('get_suggestions', { timestamp: new Date().toISOString() });
  }

  rateMessage(messageId, rating, feedback = null) {
    if (!this.socket?.connected) {
      console.warn('[chatService] Cannot rate message - socket not connected');
      return;
    }
    if (!messageId || !['up', 'down'].includes(rating)) {
      console.warn('[chatService] Invalid rating parameters');
      return;
    }
    console.log('[chatService] Rating message:', { messageId, rating });
    this.socket.emit('rate_message', {
      messageId,
      rating,
      feedback,
      timestamp: new Date().toISOString(),
    });
  }

  clearChat() {
    if (!this.socket?.connected) {
      console.warn('[chatService] Cannot clear chat - socket not connected');
      return;
    }
    console.log('[chatService] Clearing chat');
    this.socket.emit('clear_chat', { timestamp: new Date().toISOString() });
  }

  on(event, callback) {
    if (!callback || typeof callback !== 'function') {
      console.warn('[chatService] Invalid callback for event:', event);
      return;
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const callbacks = this.listeners.get(event);
    if (callbacks.has(callback)) {
      return; // Already registered
    }

    callbacks.add(callback);

    if (this.socket) {
      try {
        // Only register with socket for non-internal events
        // Internal events (bot_response, bot_typing, etc.) are already handled
        // in setupEventListeners via emitToListeners. Double-binding would cause
        // each callback to fire twice.
        const internalEvents = new Set([
          'connect', 'disconnect', 'authenticated', 'error',
          'bot_typing', 'bot_response', 'bot_response_chunk', 'suggestions_update',
          'chat_cleared', 'rating_received',
        ]);

        if (!internalEvents.has(event)) {
          this.socket.on(event, callback);
        }
      } catch (error) {
        console.error('[chatService] Error registering socket listener:', error);
        callbacks.delete(callback);
      }
    }
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;

    if (callback) {
      const callbacks = this.listeners.get(event);
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
      // For internal events, no socket.off needed (we use emitToListeners)
    } else {
      this.listeners.delete(event);
    }
    console.log('[chatService] Unregistered listener for event:', event);
  }

  emitToListeners(event, data) {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[chatService] Error in listener callback:', error);
      }
    });
  }

  rebindListeners() {
    if (!this.socket || this.listeners.size === 0) return;

    // Only rebind non-internal events (internal ones are set up in setupEventListeners)
    const internalEvents = new Set([
      'connect', 'disconnect', 'authenticated', 'error',
      'bot_typing', 'bot_response', 'bot_response_chunk', 'suggestions_update',
      'chat_cleared', 'rating_received', 'chat_history',
    ]);

    console.log('[chatService] Rebinding external listeners');
    this.listeners.forEach((callbacks, event) => {
      if (internalEvents.has(event)) return;
      callbacks.forEach(callback => {
        try {
          this.socket.on(event, callback);
        } catch (error) {
          console.error('[chatService] Error rebinding listener:', error);
        }
      });
    });
  }

  disconnect() {
    if (!this.socket) return;

    console.log('[chatService] Disconnecting socket');

    try {
      this.socket.disconnect();
    } catch (error) {
      console.error('[chatService] Error disconnecting:', error);
    }

    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
  }

  getChatHistory() {
    if (!this.socket?.connected) {
      console.warn('[chatService] Cannot get chat history - socket not connected');
      return;
    }
    console.log('[chatService] Requesting chat history');
    this.socket.emit('get_chat_history', { timestamp: new Date().toISOString() });
  }

  isSocketConnected() {
    return this.isConnected && !!this.socket?.connected;
  }

  isUserAuthenticated() {
    return this.isAuthenticated;
  }

  getSocket() {
    return this.socket;
  }

  reconnect() {
    if (this.socket) {
      console.log('[chatService] Manual reconnect triggered');
      this.socket.connect();
    }
  }
}

// Singleton
const chatService = new ChatService();

export const setTokenGetter = (getter) => chatService.setTokenGetter(getter);
export const setUserIdGetter = (getter) => chatService.setUserIdGetter(getter);

export default chatService;