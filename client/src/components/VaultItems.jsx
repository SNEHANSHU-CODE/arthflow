import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FiUploadCloud, FiTrash2, FiFileText, FiDownload, FiMoreVertical } from 'react-icons/fi';
import { uploadDocument, deleteDocument, fetchDocumentById } from '../app/vaultSlice';
import vaultService from '../services/vaultService';
import chatService from '../services/chatService';

const MAX_SIZE = 16 * 1024 * 1024;

const ACCEPTED_TYPES = {
  'application/pdf':                                                          { label: 'PDF',  color: '#c5221f', bg: 'linear-gradient(135deg, #fce8e6 0%, #fad2cf 100%)' },
  'text/csv':                                                                 { label: 'CSV',  color: '#137333', bg: 'linear-gradient(135deg, #e6f4ea 0%, #ceead6 100%)' },
  'application/vnd.ms-excel':                                                 { label: 'XLS',  color: '#1a6b3c', bg: 'linear-gradient(135deg, #e6f4ea 0%, #ceead6 100%)' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':        { label: 'XLSX', color: '#1a6b3c', bg: 'linear-gradient(135deg, #e6f4ea 0%, #ceead6 100%)' },
};

const ACCEPT_ATTR = Object.keys(ACCEPTED_TYPES).join(',');

const getFileType = (mimeType) => ACCEPTED_TYPES[mimeType] || { label: 'FILE', color: '#5f6368', bg: '#f1f3f4' };

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600&display=swap');

  .vault-upload-zone {
    border: 2px dashed #dadce0;
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: #fff;
  }
  .vault-upload-zone:hover {
    border-color: #4285f4;
    background: #f0f4ff;
  }
  .vault-upload-zone.drag-over {
    border-color: #4285f4;
    background: #e8f0fe;
    transform: scale(1.01);
  }

  .vault-doc-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
    position: relative;
  }
  .vault-doc-card:hover {
    background: #f1f3f4;
  }
  .vault-doc-card:hover .vault-doc-actions {
    opacity: 1;
  }
  .vault-doc-card.active {
    background: #e8f0fe;
  }

  .vault-doc-icon {
    width: 44px;
    height: 52px;
    border-radius: 6px;
    background: linear-gradient(135deg, #fce8e6 0%, #fad2cf 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }
  .vault-doc-icon::after {
    content: '';
    position: absolute;
    top: 0; right: 0;
    width: 14px; height: 14px;
    background: #fff;
    clip-path: polygon(100% 0, 0 0, 100% 100%);
  }

  .vault-doc-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  @media (max-width: 576px) {
    .vault-doc-actions {
      opacity: 1;
    }
  }

  .vault-action-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #5f6368;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .vault-action-btn:hover {
    background: rgba(0,0,0,0.08);
  }
  .vault-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .vault-section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #80868b;
    padding: 12px 16px 6px;
  }
`;

export default function VaultItems({ onSelect }) {
  const dispatch = useDispatch();
  const { documents, uploading, activeDocument } = useSelector((s) => s.vault);
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const handleFile = async (file) => {
    setUploadError('');
    if (!file || !ACCEPTED_TYPES[file.type]) return setUploadError('Only PDF, CSV, and Excel (.xls, .xlsx) files are supported.');
    if (file.size > MAX_SIZE) return setUploadError('File exceeds 16 MB limit.');
    try {
      const data = await vaultService.fileToBase64(file);
      // Strip known extensions cleanly regardless of file type
      const name = file.name.replace(/\.(pdf|csv|xlsx|xls)$/i, '');
      await dispatch(uploadDocument({
        originalName: file.name,
        name,
        mimeType: file.type,
        size: file.size,
        data,
      })).unwrap();
      chatService.triggerEmbedding();
    } catch (err) {
      setUploadError(err || 'Upload failed');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSelect = (doc) => {
    dispatch(fetchDocumentById(doc._id));
    onSelect?.(doc);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (window.confirm('Delete this document?')) dispatch(deleteDocument(id));
  };

  const handleDownload = async (e, doc) => {
    e.stopPropagation();
    setDownloadingId(doc._id);
    try {
      let data = null;
      if (activeDocument?._id === doc._id && activeDocument?.data) {
        data = activeDocument.data;
      } else {
        const res = await dispatch(fetchDocumentById(doc._id)).unwrap();
        data = res?.data || res;
        if (typeof data === 'object' && data.data) data = data.data;
      }
      if (!data) throw new Error('No data');
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      const blob = await (await fetch(`data:${doc.mimeType || 'application/octet-stream'};base64,${base64Data}`)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalName || doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <style>{styles}</style>
      <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>

        {/* Upload zone */}
        <div
          className={`vault-upload-zone${dragOver ? ' drag-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="d-none"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {uploading ? (
            <div style={{ color: '#4285f4', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div className="spinner-border spinner-border-sm" />
              <span style={{ fontWeight: 500 }}>Uploading…</span>
            </div>
          ) : (
            <>
              <div style={{
                width: '52px', height: '52px', borderRadius: '50%',
                background: '#e8f0fe', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 12px',
              }}>
                <FiUploadCloud size={24} color="#4285f4" />
              </div>
              <p style={{ margin: 0, fontWeight: 500, color: '#202124', fontSize: '14px' }}>
                Upload a file
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#80868b' }}>
                PDF, CSV or Excel · Drag & drop or <span style={{ color: '#4285f4' }}>browse</span> · Max 16 MB
              </p>
            </>
          )}
        </div>

        {uploadError && (
          <div style={{
            margin: '10px 0 0', padding: '10px 14px', borderRadius: '8px',
            background: '#fce8e6', color: '#c5221f', fontSize: '13px',
          }}>
            {uploadError}
          </div>
        )}

        {/* Files section */}
        {documents.length > 0 && (
          <>
            <div className="vault-section-label" style={{ marginTop: '16px' }}>
              Files · {documents.length}
            </div>
            <div>
              {documents.map((doc) => (
                <div
                  key={doc._id}
                  className={`vault-doc-card${activeDocument?._id === doc._id ? ' active' : ''}`}
                  onClick={() => handleSelect(doc)}
                >
                  {/* File type icon */}
                  <div className="vault-doc-icon" style={{ background: getFileType(doc.mimeType).bg }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: getFileType(doc.mimeType).color, letterSpacing: '0.5px', zIndex: 1 }}>
                      {getFileType(doc.mimeType).label}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{
                      fontSize: '14px', fontWeight: 500, color: '#202124',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={doc.name}>
                      {doc.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#80868b', marginTop: '2px' }}>
                      {formatSize(doc.size)} · {formatDate(doc.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="vault-doc-actions">
                    <button
                      className="vault-action-btn"
                      onClick={(e) => handleDownload(e, doc)}
                      title="Download"
                      disabled={downloadingId === doc._id}
                    >
                      {downloadingId === doc._id
                        ? <div className="spinner-border" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                        : <FiDownload size={16} />}
                    </button>
                    <button
                      className="vault-action-btn"
                      style={{ color: '#c5221f' }}
                      onClick={(e) => handleDelete(e, doc._id)}
                      title="Delete"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {documents.length === 0 && !uploading && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#80868b' }}>
            <FiFileText size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ fontSize: '14px', margin: 0 }}>No documents yet</p>
            <p style={{ fontSize: '12px', margin: '4px 0 0' }}>Upload a PDF to get started</p>
          </div>
        )}
      </div>
    </>
  );
}