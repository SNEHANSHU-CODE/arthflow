import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import workerSrc from "pdfjs-dist/build/pdf.worker.min?url";
import { FiArrowLeft, FiZoomIn, FiZoomOut, FiDownload, FiFileText, FiLock } from 'react-icons/fi';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import * as XLSX from 'xlsx';
import apiClient from '../utils/axiosConfigs';
import PdfPasswordInput from './PdfPasswordInput';
import chatService from '../services/chatService';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// Vault stores files as "data:<mime>;base64,<data>" OR plain base64.
// Always strip the data-URI prefix before passing to atob() or SheetJS.
const stripBase64Prefix = (data) =>
  data?.includes(',') ? data.split(',')[1] : data;

const styles = `
  .viewer-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px; height: 56px;
    background: #fff; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;
  }
  .viewer-back-btn {
    width: 40px; height: 40px; border: none; background: transparent;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #5f6368; transition: background 0.15s; flex-shrink: 0;
  }
  .viewer-back-btn:hover { background: #f1f3f4; color: #202124; }
  .viewer-ctrl-btn {
    width: 34px; height: 34px; border: none; background: transparent;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #5f6368; transition: background 0.15s; flex-shrink: 0; padding: 0;
  }
  .viewer-ctrl-btn:hover { background: rgba(0,0,0,0.07); }
  .viewer-pill {
    display: flex; align-items: center; gap: 2px;
    background: #f1f3f4; border-radius: 20px; padding: 3px 6px;
  }
  .viewer-download-btn {
    display: flex; align-items: center; gap: 6px; padding: 8px 14px;
    border-radius: 20px; border: none; background: #1a73e8; color: #fff;
    font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s; flex-shrink: 0;
  }
  .viewer-download-btn:hover { background: #1557b0; }
  .viewer-canvas-wrap {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    background: #525659;
    display: flex; flex-direction: column; align-items: center;
    padding: 20px 16px; gap: 12px;
  }
  .viewer-canvas-wrap .react-pdf__Document {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; width: 100%;
  }
  .viewer-canvas-wrap .react-pdf__Page {
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
    border-radius: 2px; flex-shrink: 0;
  }
  .pdf-loading-wrap {
    width: 100%; display: flex; align-items: center; justify-content: center; padding: 80px 0;
  }
  /* Spreadsheet table */
  .vault-sheet-wrap {
    flex: 1; overflow: auto; background: #fff; padding: 0;
  }
  .vault-sheet-table {
    border-collapse: collapse; font-size: 13px; min-width: 100%;
    font-family: 'Google Sans', 'Segoe UI', sans-serif;
  }
  .vault-sheet-table th {
    background: #f1f3f4; color: #202124; font-weight: 600;
    padding: 8px 12px; border: 1px solid #e0e0e0;
    position: sticky; top: 0; z-index: 1; white-space: nowrap;
  }
  .vault-sheet-table td {
    padding: 6px 12px; border: 1px solid #e0e0e0; color: #3c4043;
    white-space: nowrap; max-width: 240px;
    overflow: hidden; text-overflow: ellipsis;
  }
  .vault-sheet-table tr:nth-child(even) td { background: #f8f9fa; }
  .vault-sheet-tab {
    padding: 6px 16px; border: none; background: transparent;
    border-bottom: 2px solid transparent; cursor: pointer;
    font-size: 13px; font-weight: 500; color: #5f6368;
    transition: color 0.15s, border-color 0.15s;
  }
  .vault-sheet-tab.active {
    color: #1a73e8; border-bottom-color: #1a73e8;
  }
  @media (max-width: 480px) {
    .viewer-doc-name { display: none !important; }
    .viewer-download-label { display: none !important; }
    .viewer-download-btn { padding: 8px 10px; }
  }

  /* overlay backdrop for password modal */
  .vault-pw-overlay {
    position: absolute; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  }
`;

const PDFLoadingSpinner = () => (
  <div className="pdf-loading-wrap">
    <div className="spinner-border" role="status" style={{ color: '#fff', width: '2.5rem', height: '2.5rem' }}>
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);

// ── Spreadsheet viewer (CSV + Excel) ─────────────────────────────────────────
function SpreadsheetViewer({ document }) {
  const [sheets, setSheets] = useState(null); // { sheetName: [[row]] }
  const [activeSheet, setActiveSheet] = useState(null);
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    if (!document?.data) return;
    setSheets(null);
    setParseError(false);

    const parse = async () => {
      try {
        const isCsv = document.mimeType === 'text/csv';

        if (isCsv) {
          // Decode base64 → text
          const text = atob(stripBase64Prefix(document.data));
          const rows = text.split(/\r?\n/).filter(r => r.trim()).map(r =>
            // Simple CSV split — handles quoted fields
            r.match(/(".*?"|[^",\r\n]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g)?.map(v =>
              v.replace(/^"|"$/g, '').trim()
            ) || []
          );
          setSheets({ [document.name]: rows });
          setActiveSheet(document.name);
        } else {
          // Excel — use SheetJS (static import)
          const binary = atob(stripBase64Prefix(document.data));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const workbook = XLSX.read(bytes, { type: 'array' });
          const result = {};
          workbook.SheetNames.forEach(name => {
            result[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
          });
          setSheets(result);
          setActiveSheet(workbook.SheetNames[0]);
        }
      } catch (e) {
        console.error('[VaultViewer] spreadsheet parse error:', e);
        setParseError(true);
      }
    };

    parse();
  }, [document?._id, document?.data]);

  if (parseError) {
    return (
      <div style={{ padding: '24px', background: '#fce8e6', color: '#c5221f', borderRadius: '8px', margin: '20px', fontSize: '14px' }}>
        Failed to parse file. The file may be corrupted.
      </div>
    );
  }

  if (!sheets) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  const sheetNames = Object.keys(sheets);
  const rows = sheets[activeSheet] || [];
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Sheet tabs — only shown for Excel with multiple sheets */}
      {sheetNames.length > 1 && (
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
          {sheetNames.map(name => (
            <button
              key={name}
              className={`vault-sheet-tab${activeSheet === name ? ' active' : ''}`}
              onClick={() => setActiveSheet(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="vault-sheet-wrap">
        <table className="vault-sheet-table">
          <thead>
            <tr>{headers.map((h, i) => <th key={i}>{h || `Col ${i + 1}`}</th>)}</tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri}>
                {headers.map((_, ci) => <td key={ci}>{row[ci] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {dataRows.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#80868b', fontSize: '14px' }}>
            No data rows found
          </div>
        )}
      </div>
      <div style={{ padding: '6px 16px', background: '#f8f9fa', borderTop: '1px solid #e0e0e0', fontSize: '12px', color: '#80868b', flexShrink: 0 }}>
        {dataRows.length} row{dataRows.length !== 1 ? 's' : ''} · {headers.length} column{headers.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ── Main VaultViewer ──────────────────────────────────────────────────────────
export default function VaultViewer({ document, isLoading, onBack }) {
  const [numPages, setNumPages]     = useState(null);
  const [scale, setScale]           = useState(1.0);
  const [pdfError, setPdfError]     = useState(false);

  // Password modal state
  const [showPwModal, setShowPwModal]       = useState(false);
  const [pwError, setPwError]               = useState('');
  const [pwSaving, setPwSaving]             = useState(false);
  // The password to pass to pdfjs — either from DB or entered by user this session
  const [activePassword, setActivePassword] = useState('');

  const documentId = document?._id;
  const isSpreadsheet = document?.mimeType === 'text/csv' ||
    document?.mimeType === 'application/vnd.ms-excel' ||
    document?.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // Reset state when document changes
  useEffect(() => {
    setPdfError(false);
    setNumPages(null);
    setShowPwModal(false);
    setPwError('');
    setActivePassword(document?.pdfPassword || '');
  }, [documentId, document?.pdfPassword]);

  const pdfSrc = useMemo(() => {
    if (!document?.data || isSpreadsheet) return null;
    try {
      const binary = atob(stripBase64Prefix(document.data));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      // Pass password to pdfjs if we have one
      return activePassword
        ? { data: bytes, password: activePassword }
        : { data: bytes };
    } catch (e) {
      return null;
    }
  }, [document?.data, isSpreadsheet, activePassword]);

  useEffect(() => {
    if (pdfSrc) { setPdfError(false); setNumPages(null); }
  }, [pdfSrc]);

  const handleLoadSuccess = useCallback(({ numPages }) => {
    setPdfError(false);
    setNumPages(numPages);
    setShowPwModal(false);
  }, []);

  // pdfjs fires onPassword callback when it needs a password
  const handlePasswordRequest = useCallback((updatePassword, reason) => {
    // If we already have a stored password and this is the first request,
    // try it silently without showing the modal
    if (reason === 1 && activePassword) {
      updatePassword(activePassword);
      return;
    }
    // reason 2 = wrong password (stored password failed), ask user
    if (reason === 2) setPwError('Incorrect password, please try again.');
    else setPwError('');
    setShowPwModal(true);
    handlePasswordRequest._update = updatePassword;
  }, [activePassword]);

  const handleLoadError = useCallback((err) => {
    // If pdfjs triggers onPassword it handles it separately — only set error for other failures
    if (err?.name !== 'PasswordException') setPdfError(true);
  }, []);

  // User submits password from PdfPasswordInput component
  const handlePasswordSubmit = async (pwd) => {
    setPwError('');

    // 1. Tell pdfjs to try it — this re-triggers load
    setActivePassword(pwd);
    if (handlePasswordRequest._update) {
      handlePasswordRequest._update(pwd);
    }

    // 2. Save to backend silently so cron can embed it
    setPwSaving(true);
    try {
      await apiClient.put(`/vault/${documentId}/unlock`, { password: pwd });
      chatService.triggerEmbedding();
    } catch (e) {
      console.warn('Failed to save PDF password to server:', e.message);
    } finally {
      setPwSaving(false);
    }
  };

  const handleDownload = () => {
    if (!document?.data) return;
    const binary = atob(stripBase64Prefix(document.data));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: document.mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = document.originalName || document.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageWidth = window.innerWidth < 576 ? window.innerWidth - 32 : undefined;

  if (isLoading || !document) {
    return (
      <>
        <style>{styles}</style>
        {isLoading && (
          <div className="viewer-toolbar">
            <button className="viewer-back-btn" onClick={onBack}><FiArrowLeft size={20} /></button>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isLoading ? '#525659' : '#f8f9fa', height: isLoading ? 'auto' : '100%' }}>
          {isLoading ? (
            <div className="spinner-border" role="status" style={{ color: '#fff', width: '2.5rem', height: '2.5rem' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
          ) : (
            <>
              <FiFileText size={52} style={{ opacity: 0.2, marginBottom: '16px', color: '#80868b' }} />
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: '#80868b' }}>No document selected</p>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#80868b' }}>Pick a file from the list</p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

        <div className="viewer-toolbar">
          <button className="viewer-back-btn" onClick={onBack}><FiArrowLeft size={20} /></button>
          <span className="viewer-doc-name" style={{ flex: 1, fontSize: '15px', fontWeight: 500, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {document.name}
          </span>
          {document.passwordProtected && (
            <FiLock size={14} color="#80868b" title="Password protected" style={{ flexShrink: 0 }} />
          )}
          {!isSpreadsheet && numPages && (
            <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0 }}>{numPages} {numPages === 1 ? 'page' : 'pages'}</span>
          )}
          {!isSpreadsheet && (
            <div className="viewer-pill">
              <button className="viewer-ctrl-btn" onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))}><FiZoomOut size={15} /></button>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#202124', minWidth: '36px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
              <button className="viewer-ctrl-btn" onClick={() => setScale(s => Math.min(2.5, +(s + 0.25).toFixed(2)))}><FiZoomIn size={15} /></button>
            </div>
          )}
          <button className="viewer-download-btn" onClick={handleDownload}>
            <FiDownload size={15} /><span className="viewer-download-label">Download</span>
          </button>
        </div>

        {/* ── Password modal overlay ── */}
        {showPwModal && (
          <div className="vault-pw-overlay">
            <PdfPasswordInput
              onSubmit={handlePasswordSubmit}
              onCancel={onBack}
              error={pwError}
              loading={pwSaving}
              fileName={document?.name}
              cancelLabel="Close"
            />
          </div>
        )}

        {/* ── Spreadsheet view ── */}
        {isSpreadsheet && <SpreadsheetViewer document={document} />}

        {/* ── PDF view ── */}
        {!isSpreadsheet && (
          <div className="viewer-canvas-wrap">
            {pdfError ? (
              <div style={{ background: '#fce8e6', color: '#c5221f', borderRadius: '8px', padding: '16px 20px', margin: '20px', fontSize: '14px' }}>
                Failed to load PDF. Please try again.
              </div>
            ) : (
              <Document
                file={pdfSrc}
                onLoadSuccess={handleLoadSuccess}
                onLoadError={handleLoadError}
                onPassword={handlePasswordRequest}
                loading={<PDFLoadingSpinner />}
                error={null}
              >
                {numPages && Array.from({ length: numPages }, (_, i) => (
                  <Page
                    key={`page_${i + 1}`}
                    pageNumber={i + 1}
                    scale={scale}
                    width={pageWidth}
                    loading={
                      <div style={{ width: pageWidth || 595, height: 842, background: '#3a3a3a', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="spinner-border spinner-border-sm" style={{ color: '#888' }} />
                      </div>
                    }
                  />
                ))}
              </Document>
            )}
          </div>
        )}

      </div>
    </>
  );
}