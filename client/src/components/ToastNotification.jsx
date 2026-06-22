import React from 'react';
import { FiCheckCircle, FiAlertCircle, FiX, FiInfo } from 'react-icons/fi';

export default function ToastNotification({ toasts, onClose }) {
  if (!toasts || toasts.length === 0) return null;

  const containerStyle = {
    position: 'fixed',
    bottom: '24px',
    left: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    zIndex: 9999, // Ensure it's above modals
    pointerEvents: 'none', // Let clicks pass through empty space
  };

  const getToastStyle = (type) => {
    const baseStyle = {
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      backgroundColor: '#fff',
      minWidth: '300px',
      maxWidth: '400px',
      pointerEvents: 'auto', // Re-enable clicks on the toast itself
      borderLeft: '4px solid',
      transition: 'all 0.3s ease',
      animation: 'slideIn 0.3s ease forwards',
    };

    switch (type) {
      case 'success':
        return { ...baseStyle, borderLeftColor: '#198754' };
      case 'error':
        return { ...baseStyle, borderLeftColor: '#dc3545' };
      case 'warning':
        return { ...baseStyle, borderLeftColor: '#ffc107' };
      default:
        return { ...baseStyle, borderLeftColor: '#0d6efd' };
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <FiCheckCircle size={20} color="#198754" />;
      case 'error':
        return <FiAlertCircle size={20} color="#dc3545" />;
      case 'warning':
        return <FiAlertCircle size={20} color="#ffc107" />;
      default:
        return <FiInfo size={20} color="#0d6efd" />;
    }
  };

  return (
    <div style={containerStyle} aria-live="polite">
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      {toasts.map((toast) => (
        <div key={toast.id} style={getToastStyle(toast.type)} role="alert">
          <div style={{ flexShrink: 0, marginRight: '12px', marginTop: '2px' }}>
            {getIcon(toast.type)}
          </div>
          <div style={{ flex: 1, fontSize: '14px', color: '#333', lineHeight: '1.5' }}>
            {toast.message}
          </div>
          <button
            onClick={() => onClose(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#adb5bd',
              padding: '0 0 0 12px',
              flexShrink: 0,
            }}
            aria-label="Close notification"
          >
            <FiX size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
