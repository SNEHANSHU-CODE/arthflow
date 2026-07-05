import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import chatService from '../services/chatService';
import { currencySymbols } from '../utils/formatters';

// ==== ASYNC THUNKS ====

export const connectSocket = createAsyncThunk(
  'chat/connectSocket',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const user = state.auth?.user;
      const token = state.auth?.accessToken;
      const userId = user?.id || user?.userId || user?._id;

      chatService.connect(userId, token);

      return {
        connected: true,
        userId: userId || null,
      };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to connect');
    }
  }
);

export const disconnectSocket = createAsyncThunk(
  'chat/disconnectSocket',
  async (_, { rejectWithValue }) => {
    try {
      chatService.disconnect();
      return { disconnected: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (messageData, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const messages = state.chat?.messages || [];

      const messageText = typeof messageData === 'string' ? messageData : messageData.message;
      const vaultId = typeof messageData === 'string' ? null : (messageData.vault_id || null);

      if (!messageText || typeof messageText !== 'string' || !messageText.trim()) {
        throw new Error('Invalid message');
      }

      // Get last 10 messages for context
      const conversationHistory = messages
        .filter(m => (m.type === 'user' || m.type === 'bot') && !m.isError)
        .slice(-10)
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.message,
        }));

      // Ensure socket is connected
      if (!chatService.isSocketConnected()) {
        const user = state.auth?.user;
        const token = state.auth?.accessToken;
        const userId = user?.id || user?.userId || user?._id;
        chatService.connect(userId, token);

        let connected = false;
        for (let i = 0; i < 50; i++) {
          if (chatService.isSocketConnected()) {
            connected = true;
            break;
          }
          await new Promise(r => setTimeout(r, 100));
        }

        if (!connected) {
          throw new Error('Chat service not available');
        }
      }

      const currencyCode = state.auth?.preferences?.currency || 'INR';
      const currencySymbol = currencySymbols[currencyCode] || '₹';

      const result = await chatService.sendMessage(messageText, conversationHistory, vaultId, currencySymbol);
      return result;

    } catch (error) {
      return rejectWithValue(error.message || 'Failed to send message');
    }
  }
);

export const getSmartSuggestions = createAsyncThunk(
  'chat/getSmartSuggestions',
  async (_, { rejectWithValue }) => {
    try {
      if (!chatService.isSocketConnected()) {
        throw new Error('Not connected to chat service');
      }
      chatService.getSuggestions();
      return { requested: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const rateChatResponse = createAsyncThunk(
  'chat/rateChatResponse',
  async ({ messageId, rating, feedback }, { rejectWithValue }) => {
    try {
      if (!chatService.isSocketConnected()) {
        throw new Error('Not connected to chat service');
      }
      if (!['up', 'down'].includes(rating)) {
        throw new Error('Invalid rating');
      }
      chatService.rateMessage(messageId, rating, feedback);
      return { messageId, rating, feedback };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const clearChatHistory = createAsyncThunk(
  'chat/clearChatHistory',
  async (_, { rejectWithValue }) => {
    try {
      if (chatService.isSocketConnected()) {
        chatService.clearChat(); // tells server to clear DB messages array
      }
      return { cleared: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const loadChatHistory = createAsyncThunk(
  'chat/loadChatHistory',
  async (_, { rejectWithValue }) => {
    try {
      if (!chatService.isSocketConnected()) {
        throw new Error('Not connected to chat service');
      }
      chatService.getChatHistory();
      return { requested: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// ==== INITIAL STATE ====

const initialState = {
  messages: [],
  suggestions: [],
  loading: false,
  isTyping: false,
  error: null,
  connected: false,
  connecting: false,
  lastMessageId: null,
  sessionStats: {
    messagesCount: 0,
    startTime: null,
    lastActivity: null,
  },
};

// ==== SLICE ====

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addUserMessage: (state, action) => {
      const userMessage = {
        id: `user-${Date.now()}-${Math.random()}`,
        type: 'user',
        message: action.payload.message,
        timestamp: action.payload.timestamp || new Date().toISOString(),
        rated: false,
      };
      state.messages.push(userMessage);
      state.sessionStats.messagesCount += 1;
      state.sessionStats.lastActivity = userMessage.timestamp;
      if (!state.sessionStats.startTime) {
        state.sessionStats.startTime = userMessage.timestamp;
      }
    },

    addBotMessage: (state, action) => {
      const botMessage = {
        id: action.payload.messageId || `bot-${Date.now()}`,
        type: 'bot',
        message: action.payload.message || action.payload.response,
        timestamp: action.payload.timestamp || new Date().toISOString(),
        provider: action.payload.provider || null,
        isError: action.payload.isError || false,
        metadata: action.payload.metadata || null,
        rated: false,
        rating: null,
      };

      const exists = state.messages.some(m => m.id === botMessage.id);
      if (!exists) {
        state.messages.push(botMessage);
        state.lastMessageId = botMessage.id;
        state.sessionStats.lastActivity = botMessage.timestamp;
      } else {
        console.warn('[chatSlice] Duplicate bot message, skipping:', botMessage.id);
      }

      state.isTyping = false;
      state.loading = false;
    },

    addBotResponseChunk: (state, action) => {
      const { messageId, chunk, isFirst, isLast, provider, metadata, isError, response } = action.payload;

      if (isFirst) {
        // Create new bot message placeholder with isStreaming = true
        const botMessage = {
          id: messageId || `bot-${Date.now()}`,
          type: 'bot',
          message: chunk || '',
          timestamp: action.payload.timestamp || new Date().toISOString(),
          provider: provider || null,
          isError: isError || false,
          metadata: metadata || null,
          isStreaming: true,
          rated: false,
          rating: null,
        };

        const exists = state.messages.some(m => m.id === botMessage.id);
        if (!exists) {
          state.messages.push(botMessage);
          state.lastMessageId = botMessage.id;
          state.sessionStats.lastActivity = botMessage.timestamp;
        }

        state.isTyping = false;
        state.loading = true;
      } else {
        // Find existing message and append chunk
        const msg = state.messages.find(m => m.id === messageId);
        if (msg) {
          if (chunk) {
            msg.message += chunk;
          }
          if (provider) msg.provider = provider;
          if (isError) msg.isError = true;
          if (metadata) msg.metadata = { ...msg.metadata, ...metadata };
        }
      }

      if (isLast) {
        // If the primary stream broke, remove the partial bubble entirely.
        // The Gemini fallback will open a fresh bubble with a new messageId.
        const hasStreamError = metadata?.error === 'stream_failed';
        if (hasStreamError) {
          state.messages = state.messages.filter(m => m.id !== messageId);
        } else {
          const msg = state.messages.find(m => m.id === messageId);
          if (msg) {
            msg.isStreaming = false;
            if (response) {
              msg.message = response;
            }
          }
        }
        state.loading = false;
        state.isTyping = false;
      }
    },

    setTyping: (state, action) => {
      state.isTyping = action.payload;
    },

    setConnected: (state, action) => {
      state.connected = action.payload;
      if (!action.payload) {
        state.isTyping = false;
        state.loading = false;
      }
    },

    setSuggestions: (state, action) => {
      state.suggestions = Array.isArray(action.payload)
        ? action.payload
        : (action.payload?.suggestions || []);
    },

    clearError: (state) => {
      state.error = null;
    },

    clearChat: (state) => {
      state.messages = [];
      state.error = null;
      state.isTyping = false;
      state.loading = false;
      state.lastMessageId = null;
      state.sessionStats = { ...initialState.sessionStats };
    },

    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
      state.isTyping = false;
    },

    updateMessageRating: (state, action) => {
      const { messageId, rating } = action.payload;
      const message = state.messages.find(m => m.id === messageId);
      if (message) {
        message.rating = rating;
        message.rated = true;
      }
    },

    removeMessage: (state, action) => {
      state.messages = state.messages.filter(m => m.id !== action.payload);
    },

    setMessages: (state, action) => {
      // Load history from DB — convert DB format to UI message format
      const dbMessages = Array.isArray(action.payload) ? action.payload : [];
      state.messages = dbMessages.map((m, idx) => ({
        id: m._id || `history-${idx}-${Date.now()}`,
        type: m.role === 'human' ? 'user' : 'bot',
        message: m.content,
        timestamp: m.timestamp || new Date().toISOString(),
        provider: m.provider || null,
        isRag: m.isRag || false,
        documentName: m.documentName || null,
        isError: false,
        rated: false,
        rating: null,
      }));
    },

    resetChat: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      .addCase(connectSocket.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.connecting = true;
      })
      .addCase(connectSocket.fulfilled, (state) => {
        state.connected = true;
        state.connecting = false;
        state.loading = false;
        state.error = null;
      })
      .addCase(connectSocket.rejected, (state, action) => {
        state.connected = false;
        state.connecting = false;
        state.loading = false;
        state.error = action.payload || 'Failed to connect';
      })

      .addCase(disconnectSocket.fulfilled, (state) => {
        state.connected = false;
        state.isTyping = false;
        state.loading = false;
      })

      .addCase(sendMessage.pending, (state) => {
        state.loading = true;
        state.isTyping = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, () => {
        // loading/typing cleared by addBotMessage when response arrives
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.loading = false;
        state.isTyping = false;
        state.error = action.payload || 'Failed to send message';
      })

      .addCase(getSmartSuggestions.rejected, () => {})

      .addCase(rateChatResponse.fulfilled, (state, action) => {
        const { messageId, rating } = action.payload;
        const message = state.messages.find(m => m.id === messageId);
        if (message) {
          message.rating = rating;
          message.rated = true;
        }
      })

      .addCase(clearChatHistory.fulfilled, (state) => {
        state.messages = [];
        state.error = null;
        state.isTyping = false;
        state.loading = false;
        state.sessionStats = { ...initialState.sessionStats };
      })

      .addCase(loadChatHistory.rejected, () => {
        // Silent fail — history just won't load, not a critical error
      })
      
      // Clear chat state on logout or account deletion
      .addCase('auth/logout/fulfilled', (state) => {
        state.messages = [];
        state.error = null;
        state.isTyping = false;
        state.loading = false;
        state.lastMessageId = null;
        state.sessionStats = { ...initialState.sessionStats };
      })
      .addCase('auth/deleteAccount/fulfilled', (state) => {
        state.messages = [];
        state.error = null;
        state.isTyping = false;
        state.loading = false;
        state.lastMessageId = null;
        state.sessionStats = { ...initialState.sessionStats };
      });
  },
});

export const {
  addUserMessage,
  addBotMessage,
  addBotResponseChunk,
  setTyping,
  setConnected,
  setSuggestions,
  clearError,
  clearChat,
  setError,
  updateMessageRating,
  removeMessage,
  resetChat,
  setMessages,
} = chatSlice.actions;

export default chatSlice.reducer;