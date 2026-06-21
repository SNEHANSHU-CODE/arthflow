import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setPanelOpen, markAllRead, fetchNotifications, addNotification } from '../app/notificationSlice';
import NotificationPanel from './NotificationPanel';
import chatService from '../services/chatService';
import { IoNotificationsOutline, IoNotifications } from 'react-icons/io5';

export default function NotificationBell() {
  const dispatch = useDispatch();
  const { unreadCount, panelOpen } = useSelector(state => state.notifications);
  const bellRef = useRef(null);
  const timeoutRef = useRef(null);

  // Load all notifications on mount (full list for history + badge count)
  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  // Real-time socket push
  useEffect(() => {
    const handleNotification = async (data) => {
      if (data.type === 'session_terminated') {
        const sessionStr = sessionStorage.getItem('arthflow_session');
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            if (session.token) {
              const payload = JSON.parse(atob(session.token.split('.')[1]));
              if (payload.sessionId === data.data?.sessionId) {
                console.log('Session terminated remotely. Logging out.');
                const { logoutUser } = await import('../app/authSlice');
                dispatch(logoutUser());
                return;
              }
            }
          } catch (e) {
            console.error('Error handling session termination:', e);
          }
        }
      }
      dispatch(addNotification(data));
    };
    chatService.on('notification', handleNotification);
    return () => chatService.off('notification', handleNotification);
  }, [dispatch]);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const onOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        dispatch(setPanelOpen(false));
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [panelOpen, dispatch]);

  const handleBellClick = () => {
    const opening = !panelOpen;
    dispatch(setPanelOpen(opening));
    if (opening && unreadCount > 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => dispatch(markAllRead()), 1500);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const hasUnread = unreadCount > 0;

  return (
    <div ref={bellRef} style={{ position: 'relative', display: 'inline-block', zIndex: 1200 }}>
      <button
        onClick={handleBellClick}
        aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ''}`}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: hasUnread ? '#2563eb' : '#6b7280',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        {hasUnread
          ? <IoNotifications size={22} />
          : <IoNotificationsOutline size={22} />
        }
        {hasUnread && (
          <span style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 999,
            background: '#ef4444',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
            border: '1.5px solid #fff',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && <NotificationPanel />}
    </div>
  );
}