import { useState, useEffect, useRef } from "react";
import { FiFileText, FiX, FiChevronDown, FiBook, FiLoader } from "react-icons/fi";

const SOCKET_URL = import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:5002";

/**
 * VaultRAGToggle
 * Sits between chat header and chat body.
 * Fetches user's processed vaults and lets them toggle PDF context mode.
 *
 * Props:
 *   userId        - current user ID (string)
 *   onVaultSelect - callback(vault | null)
 */
export default function VaultRAGToggle({ userId, onVaultSelect }) {
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVault, setSelectedVault] = useState(null);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Coerce ObjectId-like objects to string — handles all id formats
    const uid = userId
      ? (typeof userId === "object" ? String(userId) : userId)
      : null;

    if (!uid) {
      console.warn("[VaultRAGToggle] No userId — skipping fetch");
      return;
    }
    fetchProcessedVaults(uid);

    const handleVaultUpdated = () => fetchProcessedVaults(uid);
    window.addEventListener('vault-updated', handleVaultUpdated);
    return () => window.removeEventListener('vault-updated', handleVaultUpdated);
  }, [userId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const fetchProcessedVaults = async (uid) => {
    setLoading(true);
    setFetchError(null);
    try {
      console.log("[VaultRAGToggle] Fetching vaults for user:", uid);
      const res = await fetch(`${SOCKET_URL}/api/rag/vaults?user_id=${uid}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log("[VaultRAGToggle] Got vaults:", data);
      const freshVaults = data.vaults || [];
      setVaults(freshVaults);

      // If the currently selected vault was deleted, clear the selection so
      // the chatbot stops sending its vault_id in subsequent messages.
      setSelectedVault(prev => {
        if (prev && !freshVaults.some(v => v.vaultId === prev.vaultId)) {
          console.log("[VaultRAGToggle] Selected vault no longer exists — clearing.");
          onVaultSelect(null);
          return null;
        }
        return prev;
      });
    } catch (e) {
      console.error("[VaultRAGToggle] Failed to fetch vaults:", e);
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (vault) => {
    setSelectedVault(vault);
    onVaultSelect(vault);
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedVault(null);
    onVaultSelect(null);
    setOpen(false);
  };

  // ── Styles (no Tailwind — pure inline, matches Bootstrap app) ──────────────
  const wrapStyle = {
    width: "100%",
    padding: "8px 14px",
    borderBottom: "1px solid #e9ecef",
    background: "#f8f9fa",
    position: "relative",
    flexShrink: 0,
  };

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const hintStyle = {
    flex: 1,
    fontSize: "12px",
    color: "#6c757d",
    margin: 0,
  };

  const selectBtnStyle = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "12px",
    fontWeight: 500,
    color: "#0d6efd",
    background: "#e7f1ff",
    border: "none",
    borderRadius: "999px",
    padding: "4px 12px",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s",
  };

  const activeLabelStyle = {
    flex: 1,
    fontSize: "12px",
    fontWeight: 500,
    color: "#0a58ca",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    margin: 0,
  };

  const clearBtnStyle = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#adb5bd",
    padding: "2px",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  };

  const dropdownStyle = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #dee2e6",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    maxHeight: "180px",
    overflowY: "auto",
    zIndex: 1050,
    marginTop: "2px",
  };

  const dropdownItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
    borderBottom: "1px solid #f1f3f5",
    transition: "background 0.12s",
  };

  // ── Render guards ────────────────────────────────────────────────────────────

  // While loading, show a slim spinner so the bar height is reserved
  if (loading) {
    return (
      <div ref={dropdownRef} style={wrapStyle}>
        <div style={rowStyle}>
          <FiBook size={14} color="#0d6efd" />
          <span style={hintStyle}>Loading your Docs…</span>
          <FiLoader size={13} color="#0d6efd" style={{ animation: "spin 1s linear infinite" }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Nothing to show if fetch succeeded but no processed PDFs
  if (!loading && vaults.length === 0) return null;

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div ref={dropdownRef} style={wrapStyle}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Hint bar / active bar */}
      <div style={rowStyle}>
        {selectedVault ? (
          // Active mode
          <>
            <FiFileText size={14} color="#0d6efd" style={{ flexShrink: 0 }} />
            <p style={activeLabelStyle}>
              Asking about: <strong>{selectedVault.source}</strong>
            </p>
            <span style={{ fontSize: "11px", color: "#adb5bd", flexShrink: 0 }}>
              {selectedVault.chunkCount} chunks
            </span>
            <button style={clearBtnStyle} onClick={handleClear} title="Exit Doc mode">
              <FiX size={14} />
            </button>
          </>
        ) : (
          // Idle mode
          <>
            <FiBook size={14} color="#0d6efd" style={{ flexShrink: 0 }} />
            <p style={hintStyle}>You have processed Docs — ask questions about them</p>
            <button
              style={selectBtnStyle}
              onClick={() => setOpen((o) => !o)}
            >
              Select Docs <FiChevronDown size={12} />
            </button>
          </>
        )}
      </div>

      {/* Dropdown list */}
      {open && !selectedVault && (
        <div style={dropdownStyle}>
          {vaults.map((vault) => (
            <button
              key={vault.vaultId}
              style={dropdownItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              onClick={() => handleSelect(vault)}
            >
              <FiFileText size={14} color="#0d6efd" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: "13px", color: "#212529", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {vault.source}
              </span>
              <span style={{ fontSize: "11px", color: "#adb5bd", flexShrink: 0 }}>
                {vault.chunkCount} chunks
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}