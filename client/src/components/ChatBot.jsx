import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FaHeadset,
  FaTimes,
  FaPaperPlane,
  FaRobot,
  FaUser,
  FaThumbsUp,
  FaThumbsDown,
  FaTrash,
  FaExpand,
  FaCompress,
  FaSpinner
} from 'react-icons/fa';
import {
  sendMessage,
  getSmartSuggestions,
  clearError,
  clearChat,
  clearChatHistory,
  setMessages,
  loadChatHistory,
  rateChatResponse,
  connectSocket,
  disconnectSocket,
  addBotMessage,
  addBotResponseChunk,
  addUserMessage,
  setTyping,
  setSuggestions,
  setError,
  setConnected
} from '../app/chatSlice';
import chatService from '../services/chatService';
import VaultRAGToggle from './VaultRAGToggle';
import './styles/ChatBot.css';

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [message, setMessage] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [activeVault, setActiveVault] = useState(null); // RAG mode

  const dispatch = useDispatch();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Guard so we only request suggestions once per connection
  const suggestionsRequestedRef = useRef(false);

  const {
    messages = [],
    suggestions = [],
    loading = false,
    error = null,
    isTyping = false,
    connected = false
  } = useSelector(state => state.chat || {});

  const { user = null, accessToken = null, isAuthenticated = false } = useSelector(state => state.auth || {});
  const displayName = (
    user?.username ||
    user?.name ||
    (user?.email ? user.email.split('@')[0] : null) ||
    'Guest'
  );

  const isAtBottomRef = useRef(true);
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    isAtBottomRef.current = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isTyping]);

  // ---------------------------------------------------------------
  // Socket listeners — register ONCE on mount, unregister on unmount
  // ---------------------------------------------------------------
  useEffect(() => {
    const handleConnect = () => {
      console.log('✅ Connected to chat server');
      dispatch(setConnected(true));
    };

    const handleDisconnect = () => {
      console.log('❌ Disconnected from chat server');
      dispatch(setConnected(false));
      suggestionsRequestedRef.current = false; // reset so we fetch again on reconnect
    };

    const handleAuthenticated = (data) => {
      console.log('🔐 Authenticated:', data);
      dispatch(setConnected(true));
      // Request chat history from DB right after auth
      if (data.isAuthenticated) {
        dispatch(loadChatHistory());
      }
    };

    const handleChatHistory = (data) => {
      console.log('📜 Chat history loaded:', data?.messages?.length, 'messages');
      if (Array.isArray(data?.messages) && data.messages.length > 0) {
        dispatch(setMessages(data.messages));
      }
    };

    const handleBotResponseChunk = (data) => {
      console.log('🤖 Bot response chunk received:', data?.messageId, 'isLast:', data?.isLast);
      dispatch(addBotResponseChunk(data));
    };

    const handleBotTyping = (data) => {
      dispatch(setTyping(data.isTyping));
    };

    const handleSuggestionsUpdate = (data) => {
      dispatch(setSuggestions(data.suggestions || []));
    };

    const handleError = (errorData) => {
      console.error('❌ Socket error:', errorData);
      dispatch(setError(errorData.message || 'An error occurred'));
    };

    chatService.on('connect', handleConnect);
    chatService.on('disconnect', handleDisconnect);
    chatService.on('authenticated', handleAuthenticated);
    chatService.on('chat_history', handleChatHistory);
    chatService.on('bot_response_chunk', handleBotResponseChunk);
    chatService.on('bot_typing', handleBotTyping);
    chatService.on('suggestions_update', handleSuggestionsUpdate);
    chatService.on('error', handleError);

    // Initial connection
    dispatch(connectSocket());

    return () => {
      chatService.off('connect', handleConnect);
      chatService.off('disconnect', handleDisconnect);
      chatService.off('authenticated', handleAuthenticated);
      chatService.off('chat_history', handleChatHistory);
      chatService.off('bot_response_chunk', handleBotResponseChunk);
      chatService.off('bot_typing', handleBotTyping);
      chatService.off('suggestions_update', handleSuggestionsUpdate);
      chatService.off('error', handleError);
      dispatch(disconnectSocket());
    };
  }, [dispatch]); // ← only dispatch; never re-runs

  // ---------------------------------------------------------------
  // Reconnect when auth state changes (login / logout)
  // ---------------------------------------------------------------
  useEffect(() => {
    const hasUser = !!user;
    const hasToken = !!accessToken;

    // Wait for Redux state to settle
    if (isAuthenticated && (!hasUser || !hasToken)) return;
    if ((hasUser || hasToken) && !isAuthenticated) return;

    console.log('🔄 Auth changed — reconnecting socket...');
    suggestionsRequestedRef.current = false;

    dispatch(disconnectSocket());
    const id = setTimeout(() => dispatch(connectSocket()), 300);
    return () => clearTimeout(id);
  }, [isAuthenticated, user, accessToken, dispatch]);

  // ---------------------------------------------------------------
  // Fetch suggestions ONCE after connection — not on every render
  // ---------------------------------------------------------------
  useEffect(() => {
    if (connected && !suggestionsRequestedRef.current && suggestions.length === 0) {
      console.log('📋 Requesting suggestions...');
      suggestionsRequestedRef.current = true;
      dispatch(getSmartSuggestions());
    }
  }, [connected, dispatch]); // suggestions.length intentionally omitted to avoid re-trigger

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || loading || !connected) return;

    const messageText = message.trim();
    setMessage('');
    setShowSuggestions(false);

    // Optimistic user message
    dispatch(addUserMessage({
      message: messageText,
      timestamp: new Date().toISOString()
    }));

    try {
      // sendMessage thunk emits to socket and resolves immediately.
      // The bot reply arrives later via the bot_response socket event
      // and is added to the store by handleBotResponse above.
      await dispatch(sendMessage({ message: messageText, vault_id: activeVault?.vaultId || null })).unwrap();
    } catch (err) {
      // Only genuine send failures (not connected, etc.) land here.
      // The error is already set in Redux state by the rejected case.
      console.error('❌ Failed to emit message:', err);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    if (!connected) return;
    setMessage(suggestion);
    setShowSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleClearChat = () => {
    if (window.confirm('Clear the chat history?')) {
      dispatch(clearChatHistory()); // clears DB + Redux state
      setShowSuggestions(true);
      suggestionsRequestedRef.current = false;
      dispatch(getSmartSuggestions());
    }
  };

  const handleRateMessage = (messageId, rating) => {
    dispatch(rateChatResponse({ messageId, rating }));
  };

  const toggleChat = () => {
    setIsOpen(prev => !prev);
    if (isOpen) setIsFullscreen(false);
  };

  const toggleFullscreen = () => setIsFullscreen(prev => !prev);

  // formatMessage removed in favor of ReactMarkdown

  const getChatWindowClasses = () =>
    `chat-window${isFullscreen ? ' fullscreen' : ''}`;

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <>
      {!isOpen && (
        <button className="chat-toggle-btn" onClick={toggleChat} aria-label="Open chat">
          <FaHeadset />
          <span className="chat-badge">Chat</span>
        </button>
      )}

      {isOpen && (
        <div className={getChatWindowClasses()}>
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="bot-icon-wrapper">
                <FaRobot className="bot-icon" />
                <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
              </div>
              <div className="chat-title">
                <h4>AI Assistant</h4>
                <span className="chat-status">
                  {!connected
                    ? <span className="status-connecting">Connecting...</span>
                    : user?.isGuest
                      ? 'Guest Mode - Limited Access'
                      : `Welcome, ${displayName}!`
                  }
                </span>
              </div>
            </div>
            <div className="chat-controls">
              <button
                className="control-btn delete"
                onClick={handleClearChat}
                title="Delete Chat"
                disabled={messages.length === 0}
              >
                <FaTrash />
              </button>
              <button
                className="control-btn fullscreen"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Minimize' : 'Fullscreen'}
              >
                {isFullscreen ? <FaCompress /> : <FaExpand />}
              </button>
              <button
                className="control-btn close"
                onClick={toggleChat}
                title="Close"
              >
                <FaTimes />
              </button>
            </div>
          </div>

          {/* RAG Docs Toggle — only shown to authenticated users */}
          {isAuthenticated && (
            <VaultRAGToggle
              userId={user?.id || user?.userId || user?._id || ''}
              onVaultSelect={setActiveVault}
            />
          )}

          {/* Body */}
          <div className="chat-body" onScroll={handleScroll}>
            {messages.length === 0 && (
              <div className="welcome-message">
                <div className="welcome-icon-wrapper">
                  <FaRobot className="welcome-icon" />
                </div>
                <h3>Welcome to AI Assistant!</h3>
                <p>I'm here to help you with:</p>
                <div className="welcome-features">
                  <div className="feature-item">
                    <span className="feature-icon">💰</span>
                    <span>Budget Planning</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">📈</span>
                    <span>Investment Advice</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">🎯</span>
                    <span>Financial Goals</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">💡</span>
                    <span>Money Tips</span>
                  </div>
                  {!user?.isGuest && (
                    <div className="feature-item">
                      <span className="feature-icon">👤</span>
                      <span>Personal Insights</span>
                    </div>
                  )}
                </div>
                <p className="welcome-prompt">How can I assist you today?</p>
              </div>
            )}

            <div className="messages-container">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.type} ${msg.isError ? 'error' : ''} ${msg.isStreaming ? 'streaming' : ''}`}>
                  <div className="message-avatar">
                    {msg.type === 'user' ? <FaUser /> : <FaRobot />}
                  </div>
                  <div className="message-content">
                    <div className="message-text">
                      {msg.type === 'bot' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.message || ''}</ReactMarkdown>
                      ) : (
                        msg.message
                      )}
                    </div>
                    <div className="message-meta">
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {msg.type === 'bot' && !msg.isError && !msg.rated && (
                        <div className="message-rating">
                          <button
                            className="rating-btn positive"
                            onClick={() => handleRateMessage(msg.id, 'up')}
                            title="Helpful"
                          >
                            <FaThumbsUp />
                          </button>
                          <button
                            className="rating-btn negative"
                            onClick={() => handleRateMessage(msg.id, 'down')}
                            title="Not helpful"
                          >
                            <FaThumbsDown />
                          </button>
                        </div>
                      )}
                      {msg.rated && (
                        <span className="rated-indicator">
                          {msg.rating === 'up' ? '👍 Helpful' : '👎 Not helpful'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="message bot typing">
                  <div className="message-avatar"><FaRobot /></div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="error-message">
                <span>⚠️ {error}</span>
                <button onClick={() => dispatch(clearError())} className="error-close">
                  <FaTimes />
                </button>
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && messages.length === 0 && (
              <div className="suggestions-container">
                <h5>Try asking about:</h5>
                <div className="suggestions-grid">
                  {suggestions.slice(0, 4).map((suggestion, index) => (
                    <button
                      key={index}
                      className="suggestion-button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      disabled={!connected}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="chat-input-container">
            <form onSubmit={handleSendMessage} className="chat-form">
              <div className="input-wrapper">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    // Stop space/any key from bubbling to page scroll or parent handlers
                    e.stopPropagation();
                    // Submit on Enter (not Shift+Enter)
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (message.trim() && !loading && connected) {
                        handleSendMessage(e);
                      }
                    }
                  }}
                  placeholder={
                    !connected
                      ? 'Connecting...'
                      : activeVault
                        ? `Ask about ${activeVault.source}...`
                        : user?.isGuest
                          ? 'Ask a question...'
                          : 'Type your message...'
                  }
                  disabled={loading || !connected}
                  maxLength={500}
                  className="chat-input"
                />
                <button
                  type="submit"
                  disabled={!message.trim() || loading || !connected}
                  className="send-button"
                  title="Send"
                >
                  {loading ? <FaSpinner className="spinner" /> : <FaPaperPlane />}
                </button>
              </div>
              <div className="input-footer">
                <span className="character-count">{message.length}/500</span>
                {!connected && (
                  <span className="connection-status">⚠️ Disconnected</span>
                )}
                {user?.isGuest && connected && (
                  <span className="guest-notice">Sign in for full access</span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;