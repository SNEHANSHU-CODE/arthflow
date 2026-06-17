/**
 * Session Management Utility
 * Handles login/logout with session tracking
 */

const SESSION_KEY = 'arthflow_session';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const sessionManager = {
  /**
   * Create a new session when user logs in
   */
  createSession: (userData, token) => {
    const session = {
      userId: userData.id || userData._id,
      username: userData.username,
      email: userData.email,
      token: token,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TIMEOUT).toISOString(),
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      }
    };
    
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(`${SESSION_KEY}_list`, JSON.stringify([session]));
    
    return session;
  },

  /**
   * Get current session
   */
  getSession: () => {
    const sessionStr = sessionStorage.getItem(SESSION_KEY);
    if (!sessionStr) return null;
    
    try {
      const session = JSON.parse(sessionStr);
      
      // Check if session expired
      if (new Date(session.expiresAt) < new Date()) {
        sessionManager.destroySession();
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('Error parsing session:', error);
      return null;
    }
  },

  /**
   * Update last activity time
   */
  updateActivity: () => {
    const session = sessionManager.getSession();
    if (session) {
      session.lastActivity = new Date().toISOString();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  },

  /**
   * Destroy current session (logout)
   */
  destroySession: () => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(`${SESSION_KEY}_list`);
  },

  /**
   * Check if session is active
   */
  isSessionActive: () => {
    const session = sessionManager.getSession();
    return !!session;
  },

  /**
   * Check if session is about to expire (within 5 minutes)
   */
  isSessionExpiringSoon: () => {
    const session = sessionManager.getSession();
    if (!session) return false;
    
    const expiryTime = new Date(session.expiresAt).getTime();
    const currentTime = new Date().getTime();
    const timeRemaining = expiryTime - currentTime;
    
    return timeRemaining < 5 * 60 * 1000; // 5 minutes
  },

  /**
   * Get session duration in seconds
   */
  getSessionDuration: () => {
    const session = sessionManager.getSession();
    if (!session) return 0;
    
    const createdTime = new Date(session.createdAt).getTime();
    const currentTime = new Date().getTime();
    
    return Math.floor((currentTime - createdTime) / 1000);
  },

  /**
   * Get time until session expiry (in seconds)
   */
  getTimeUntilExpiry: () => {
    const session = sessionManager.getSession();
    if (!session) return 0;
    
    const expiryTime = new Date(session.expiresAt).getTime();
    const currentTime = new Date().getTime();
    
    const timeRemaining = expiryTime - currentTime;
    return Math.floor(timeRemaining / 1000);
  },

  /**
   * Extend session (refresh)
   */
  extendSession: () => {
    const session = sessionManager.getSession();
    if (session) {
      session.expiresAt = new Date(Date.now() + SESSION_TIMEOUT).toISOString();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    }
    return null;
  },

  /**
   * Get all active sessions (from server)
   */
  getActiveSessions: async (token) => {
    try {
      const response = await fetch('/api/settings/sessions', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.data?.sessions || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  },

  /**
   * Terminate specific session
   */
  terminateSession: async (sessionId, token) => {
    try {
      const response = await fetch(`/api/settings/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Error terminating session:', error);
      return false;
    }
  },

  /**
   * Sign out all other sessions
   */
  signOutAllOtherSessions: async (token) => {
    try {
      const response = await fetch('/api/settings/sessions/all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Error signing out all sessions:', error);
      return false;
    }
  },

  /**
   * Track inactivity
   */
  setupInactivityTracker: (timeout = SESSION_TIMEOUT, onExpire = null) => {
    let inactivityTimer;
    
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      sessionManager.updateActivity();
      
      inactivityTimer = setTimeout(() => {
        if (onExpire) onExpire();
        sessionManager.destroySession();
      }, timeout);
    };
    
    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
    });
    
    // Initial timer
    resetTimer();
    
    // Return cleanup function
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
    };
  }
};

export default sessionManager;
