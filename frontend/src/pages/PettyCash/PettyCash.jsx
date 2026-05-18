import { useState, useEffect, useRef, useMemo } from 'react';
import { useToastState } from '../../context/ToastContext';
import { createPortal } from 'react-dom';
import { Clock, Check, Search, BookOpen, X, AlertTriangle, Paperclip, ClipboardList, User, ArrowRight, AlertCircle, Wallet, Receipt, DollarSign, Plus, History, FileText } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { getCount, getResults, pageCount, pageParams, RowSizeSelect } from '../../utils/pagination.jsx';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { id } from 'date-fns/locale';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtTgl = (s) => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDT = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};
const dateToStr = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
const strToDate = (s) => s ? new Date(s) : null;
const RIWAYAT_SALDO_PER_PAGE = 8;

const PC_STATUS = {
    pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    disetujui: { label: 'Disetujui', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dicairkan: { label: 'Dicairkan', bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    dilaporkan: { label: 'Dilaporkan', bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
    menunggu_pengembalian: { label: 'Menunggu Kembali', bg: '#fefce8', color: '#a16207', dot: '#eab308' },
    selesai: { label: 'Selesai', bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
};
const RB_STATUS = {
    pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    disetujui: { label: 'Disetujui', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dicairkan: { label: 'Selesai', bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
};
const PC_STEPS = [
    { key: 'pending', label: 'Diajukan' },
    { key: 'disetujui', label: 'Disetujui' },
    { key: 'dicairkan', label: 'Dicairkan' },
    { key: 'dilaporkan', label: 'Dilaporkan' },
    { key: 'menunggu_pengembalian', label: 'Kembalian' },
    { key: 'selesai', label: 'Selesai' },
];
const ORDER = ['pending', 'disetujui', 'dicairkan', 'dilaporkan', 'menunggu_pengembalian', 'selesai'];

const STYLES = `
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes barFill{from{width:0%}to{width:var(--bar-w)}}
.pc-page{animation:fadeInUp .4s ease both}
.pc-tr{animation:fadeInUp .3s ease both}
.pc-saldo-banner{border-radius:16px;overflow:hidden;margin-bottom:28px;background:linear-gradient(135deg,#0f2d1a 0%,#1a4731 55%,#22543d 100%);box-shadow:0 8px 32px rgba(26,71,49,.3);animation:fadeInUp .35s ease both}
.pc-saldo-inner{padding:24px 28px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px}
.pc-saldo-amt{font-size:30px;font-weight:700;color:#fff;letter-spacing:-.5px;line-height:1}
.pc-saldo-bar-track{height:4px;background:rgba(255,255,255,.15);border-radius:99px;overflow:hidden;margin-top:10px;min-width:200px}
.pc-saldo-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#6ee7b7,#34d399);animation:barFill .9s .3s cubic-bezier(.4,0,.2,1) both}
.pc-saldo-warn{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:8px 14px;font-size:12px;color:#fca5a5;font-weight:600;display:inline-flex;align-items:center;gap:6px}
.pc-riwayat-table{width:100%;border-collapse:collapse;font-size:12px}
.pc-riwayat-table th{padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;background:#f8fafc}
.pc-riwayat-table td{padding:8px 12px;color:#334155;border-bottom:1px solid #f1f5f9}
.pc-riwayat-table tr:last-child td{border-bottom:none}
.pc-page{animation:fadeInUp .4s ease both}
.pc-tr{animation:fadeInUp .3s ease both}
.pc-input,.pc-select,.pc-textarea{width:100%;padding:12px 14px;border:1px solid #dce8e2;border-radius:11px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;background:linear-gradient(180deg,#fff,#fbfdfc);outline:none;transition:border-color .15s,box-shadow .15s,background .15s;box-sizing:border-box}
.pc-input:hover,.pc-select:hover,.pc-textarea:hover{border-color:#c8dcd1}
.pc-input:focus,.pc-select:focus,.pc-textarea:focus{border-color:#2d6a4f;background:#fff;box-shadow:0 0 0 4px rgba(45,106,79,.09)}
.pc-textarea{resize:vertical;min-height:96px;line-height:1.55}
.pc-btn-primary{padding:10px 22px;background:linear-gradient(135deg,#1a4731 0%,#236348 100%);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow:0 4px 12px rgba(26,71,49,.2)}
.pc-btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(26,71,49,.3)}
.pc-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.pc-btn-primary.danger{background:#dc2626}.pc-btn-primary.danger:hover{background:#b91c1c}
.pc-btn-primary.blue{background:#1d4ed8}.pc-btn-primary.blue:hover{background:#1e40af}
.pc-btn-ghost{padding:10px 20px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s}
.pc-btn-ghost:hover{background:#e2e8f0}
.pc-btn-sm{min-height:30px;padding:6px 11px;border-radius:8px;font-size:11.5px;font-weight:800;cursor:pointer;border:1px solid;font-family:'Plus Jakarta Sans',sans-serif;transition:background .14s,transform .1s,box-shadow .14s,border-color .14s;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.pc-btn-sm:hover{transform:translateY(-1px)}
.pc-btn-sm.n{border-color:#dce8e2;color:#475569;background:#fff}.pc-btn-sm.n:hover{background:#f8fbf9;border-color:#bfd5c9}
.pc-btn-sm.g{border-color:#1a4731;color:#fff;background:#1a4731;box-shadow:0 8px 18px rgba(26,71,49,.18)}.pc-btn-sm.g:hover{background:#236348;border-color:#236348}
.pc-btn-sm.b{border-color:#1d4ed8;color:#fff;background:#1d4ed8;box-shadow:0 8px 18px rgba(29,78,216,.16)}.pc-btn-sm.b:hover{background:#1e40af;border-color:#1e40af}
.pc-btn-sm.r{border-color:#fecaca;color:#dc2626;background:#fff}.pc-btn-sm.r:hover{background:#fef2f2}
.pc-btn-sm.y{border-color:#a16207;color:#fff;background:#a16207;box-shadow:0 8px 18px rgba(161,98,7,.14)}.pc-btn-sm.y:hover{background:#854d0e;border-color:#854d0e}
.pc-btn-sm.p{border-color:#6d28d9;color:#fff;background:#6d28d9;box-shadow:0 8px 18px rgba(109,40,217,.15)}.pc-btn-sm.p:hover{background:#5b21b6;border-color:#5b21b6}
.pc-action-cell{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap;min-width:210px}
.pc-action-cell .pc-btn-sm.n{order:2}
.pc-action-cell .pc-btn-sm.g,.pc-action-cell .pc-btn-sm.b,.pc-action-cell .pc-btn-sm.y,.pc-action-cell .pc-btn-sm.p{order:1}
.pc-action-cell .pc-btn-sm.r{order:4}
.pc-action-cell .pc-btn-sm.revision{order:3}
.pc-table{width:100%;min-width:880px;border-collapse:separate;border-spacing:0}
.pc-table thead th{padding:14px 16px;text-align:left;font-size:11px;font-weight:800;color:#6b7c74;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e6eee9;background:#f8fbf9}
.pc-table tbody td{padding:14px 16px;font-size:13px;color:#334155;border-bottom:1px solid #edf3ef;vertical-align:middle;background:#fff}
.pc-table tbody tr:last-child td{border-bottom:none}
.pc-table tbody tr:hover td{background:#f7fbf9}
.pc-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .18s ease;backdrop-filter:blur(5px);padding:18px}
.pc-modal{background:linear-gradient(180deg,#fff,#fbfdfc);border-radius:20px;padding:30px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 26px 70px rgba(15,23,42,.24);animation:slideUp .22s ease}
.pc-modal.sm{max-width:440px}.pc-modal.lg{max-width:760px}
.pc-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
.pc-label{font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em}
.pc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pc-modal-title{display:flex;align-items:center;gap:10px;margin:0 0 20px;color:#13251b;font-size:20px;font-weight:800;letter-spacing:0}
.pc-modal-title-icon{width:38px;height:38px;border-radius:12px;background:#e7f4ed;color:#1a4731;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.pc-modal-head{display:flex;align-items:flex-start;gap:12px;margin:0 0 18px}
.pc-modal-head-copy{min-width:0;flex:1}
.pc-modal-head-title{margin:0;color:#13251b;font-size:20px;font-weight:800;letter-spacing:0;line-height:1.25}
.pc-modal-head-subtitle{margin:4px 0 0;color:#7b8d85;font-size:12.5px;line-height:1.55}
.pc-modal-summary{background:linear-gradient(135deg,#f8fbf9,#fff);border:1px solid #e1ece6;border-radius:16px;padding:16px 18px;margin-bottom:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}
.pc-modal-summary-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#819189;margin:0 0 7px}
.pc-modal-summary-value{font-size:24px;font-weight:800;color:#17251d;line-height:1;margin:0}
.pc-modal-summary-desc{font-size:13px;color:#64748b;line-height:1.55;margin:9px 0 0}
.pc-modal-summary-meta{font-size:12px;color:#8aa097;margin:7px 0 0}
.pc-modal-section{border:1px solid #e7eee9;background:#fff;border-radius:16px;padding:16px 18px;margin-bottom:16px}
.pc-modal-section-title{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;font-weight:800;color:#17251d;text-transform:uppercase;letter-spacing:.045em}
.pc-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;margin-bottom:16px}
.pc-detail-item{min-width:0}
.pc-detail-label{font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px}
.pc-detail-value{font-size:14px;color:#1e293b;line-height:1.55;font-weight:600;margin:0;word-break:break-word}
.pc-form-note{display:flex;gap:10px;align-items:flex-start;background:#f8fbf9;border:1px solid #e1ece6;border-radius:14px;padding:13px 14px;color:#64748b;font-size:13px;line-height:1.55;margin-bottom:18px}
.pc-form-link{color:#1a4731;font-weight:800;font-size:13px;display:inline-flex;align-items:center;gap:7px;margin-bottom:16px;text-decoration:none}
.pc-form-link:hover{text-decoration:underline}
.pc-modal-footer{display:flex;gap:12px;justify-content:flex-end;padding-top:16px;border-top:1px solid #edf3ef}
.pc-alert-ok{background:#dcfce7;border:1px solid #86efac;border-radius:12px;color:#166534;padding:12px 16px;font-size:14px;margin-bottom:16px;animation:fadeInUp .25s ease;display:flex;align-items:center;gap:9px}
.pc-alert-err{background:#fee2e2;border:1px solid #fca5a5;border-radius:12px;color:#991b1b;padding:12px 16px;font-size:14px;margin-bottom:16px;display:flex;align-items:center;gap:9px}
.pc-rejection{background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:12px 14px;font-size:13px;color:#991b1b;margin-bottom:16px}
.pc-file-zone{border:2px dashed #e2e8f0;border-radius:10px;padding:14px 18px;background:#f8fafc;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;transition:border-color .15s,background .15s,box-shadow .15s}
.pc-file-zone:hover{border-color:#c8dcd1;box-shadow:0 8px 20px rgba(15,23,42,.04)}
.pc-file-zone.has{border-color:#86efac;background:#f0fdf4}
.pc-file-pick{padding:8px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:7px;font-size:13px;font-weight:600;color:#475569;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
.pc-file-pick:hover{background:#f1f5f9}
.pc-upload-preview{display:flex;gap:12px;align-items:center;border:1px solid #e1ece6;background:#fbfdfc;border-radius:14px;padding:10px 12px;margin:-4px 0 16px}
.pc-upload-thumb{width:70px;height:56px;border-radius:10px;object-fit:cover;border:1px solid #dbe7e1;background:#f8fafc;flex-shrink:0;cursor:pointer}
.pc-upload-doc{width:70px;height:56px;border-radius:10px;border:1px solid #dbe7e1;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#64748b;flex-shrink:0}
.pc-upload-meta{min-width:0;flex:1}
.pc-upload-name{font-size:13px;font-weight:800;color:#17251d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 3px}
.pc-upload-info{font-size:11px;color:#64748b;line-height:1.45;margin:0}
.pc-preview-modal{max-width:min(920px,94vw)!important;padding:18px!important;background:#0f172a!important}
.pc-preview-img{display:block;max-width:100%;max-height:78vh;border-radius:12px;object-fit:contain;margin:auto;background:#111827}
.pc-tabs{display:flex;gap:6px;margin:6px 0 0;background:#eaf1ed;border:1px solid #dce8e2;border-radius:14px;padding:5px;width:100%;max-width:520px}
.pc-tab-pill{flex:1;padding:11px 18px;border:none;border-radius:10px;font-size:13.5px;font-weight:800;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;background:transparent;color:#64748b;transition:background .18s,color .18s,box-shadow .18s;display:inline-flex;align-items:center;justify-content:center;gap:7px;outline:none;-webkit-tap-highlight-color:transparent;}
.pc-tab-pill:focus{outline:none;box-shadow:none}
.pc-tab-pill:focus-visible{outline:none;box-shadow:none}
.pc-tab-pill.active{background:#fff;color:#1a4731;box-shadow:0 8px 18px rgba(15,23,42,.08)}
.pc-tab-pill:hover:not(.active){color:#334155;background:rgba(0,0,0,.04)}
.pc-tab-count{background:#ef4444;color:#fff;border-radius:999px;font-size:10.5px;font-weight:700;padding:1px 6px;line-height:1.4}
.pc-filter-bar{display:flex;flex-direction:column;gap:8px;padding:16px 18px;border-bottom:1px solid #edf3ef;background:#fff}
.pc-filter-row{display:flex;gap:10px;align-items:center;flex-wrap:nowrap}
.pc-filter-search{display:flex;align-items:center;gap:8px;min-width:260px;flex:1;border:1px solid #e2e8f0;border-radius:9px;background:#fff;padding:0 11px;color:#94a3b8;transition:border-color .15s,box-shadow .15s}
.pc-filter-search:focus-within{border-color:#2d6a4f;box-shadow:0 0 0 3px rgba(45,106,79,.08)}
.pc-filter-search .pc-filter-input{border:none!important;padding:8px 0!important;box-shadow:none!important;background:transparent!important}
.pc-filter-input{padding:7px 11px;border:1px solid #e2e8f0;border-radius:7px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;background:#fff;transition:border-color .15s;min-width:0;box-sizing:border-box;flex:1}
.pc-filter-input:focus{border-color:#2d6a4f}
.pc-filter-select{height:38px;padding:7px 12px;border:1px solid #e2e8f0;border-radius:9px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;background:#fff;transition:border-color .15s;flex-shrink:0}
.pc-filter-select:focus{border-color:#2d6a4f}
.pc-filter-date-wrap{height:38px;display:flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:0 10px;flex-shrink:0}
.pc-filter-date-wrap .react-datepicker-wrapper{width:auto}
.pc-filter-date-wrap .react-datepicker__input-container input{padding:6px 4px;border:none;background:transparent;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;width:88px;cursor:pointer}
.pc-filter-reset{height:38px;padding:7px 13px;border:1px solid #fca5a5;border-radius:9px;font-size:12px;font-weight:800;color:#dc2626;background:#fef2f2;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;flex-shrink:0}
.pc-filter-reset:hover{background:#fee2e2}
.pc-pagination{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;gap:10px}
.pc-page-info{font-size:13px;color:#64748b}
.pc-page-btns{display:flex;gap:4px}
.pc-page-btn{width:32px;height:32px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;color:#475569;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;transition:all .14s}
.pc-page-btn:hover:not(:disabled){border-color:#2d6a4f;color:#1a4731;background:#f0fdf4}
.pc-page-btn.active{background:#1a4731;color:#fff;border-color:#1a4731}
.pc-page-btn:disabled{opacity:.4;cursor:not-allowed}
.pc-steps{display:flex;align-items:flex-start;gap:0;margin-bottom:24px}
.pc-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
.pc-step-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;z-index:1;flex-shrink:0}
.pc-step-line{position:absolute;top:13px;left:50%;width:100%;height:2px;z-index:0}
.pc-step-label{font-size:10px;font-weight:600;margin-top:5px;text-align:center;line-height:1.3}
.pc-stats-row{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:16px;margin-bottom:28px}
.pc-stat-card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 6px rgba(0,0,0,.06);border:1px solid #f1f5f9;animation:fadeInUp .35s ease both}
.pc-radio-card{flex:1;display:flex;align-items:center;gap:10px;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;transition:border-color .15s,background .15s;font-size:14px;font-weight:600;color:#64748b;font-family:'Plus Jakarta Sans',sans-serif}
.pc-radio-card.approve.active{border-color:#86efac;background:#f0fdf4;color:#166534}
.pc-radio-card.reject.active{border-color:#fca5a5;background:#fef2f2;color:#991b1b}
.pc-shell{position:relative}
.pc-hero{position:relative;overflow:hidden;border:1px solid #dfe9e4;border-radius:18px;background:linear-gradient(135deg,#f8fbf9 0%,#eef7f1 52%,#fffaf0 100%);padding:24px;margin-bottom:18px;box-shadow:0 14px 38px rgba(22,44,31,.08)}
.pc-hero::after{content:'';position:absolute;right:-72px;top:-96px;width:260px;height:260px;border-radius:50%;background:rgba(26,71,49,.07);pointer-events:none}
.pc-hero-main{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
.pc-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#1a4731;background:#e7f4ed;border:1px solid #cfe8da;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
.pc-title{font-size:28px;font-weight:800;color:#12251a;letter-spacing:0;line-height:1.18;margin:0}
.pc-subtitle{font-size:14px;color:#63766d;line-height:1.6;margin-top:8px;max-width:680px}
.pc-hero-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.pc-action-primary,.pc-action-soft,.pc-action-dark{height:40px;border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,box-shadow .15s,background .15s,border-color .15s;white-space:nowrap}
.pc-action-primary{padding:0 15px;background:#1a4731;color:#fff;border:1px solid #1a4731;box-shadow:0 10px 22px rgba(26,71,49,.2)}
.pc-action-primary:hover{transform:translateY(-1px);box-shadow:0 14px 28px rgba(26,71,49,.25)}
.pc-action-soft{padding:0 14px;background:#fff;color:#1a4731;border:1px solid #cfe8da}
.pc-action-soft:hover{background:#f0fdf4;border-color:#9dd8b8}
.pc-action-dark{padding:0 14px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.2)}
.pc-action-dark:hover{background:rgba(255,255,255,.2)}
.pc-saldo-grid{display:grid!important;grid-template-columns:minmax(360px,2fr) repeat(2,minmax(220px,1fr))!important;gap:16px!important;margin-bottom:18px!important}
.pc-saldo-card{border-radius:18px!important;background:linear-gradient(135deg,#0d281b 0%,#1a4731 54%,#2d6a4f 100%)!important;box-shadow:0 18px 42px rgba(26,71,49,.28)!important}
.pc-balance-card{position:relative;overflow:hidden;border-radius:18px;background:linear-gradient(135deg,#0d281b 0%,#1a4731 54%,#2d6a4f 100%);box-shadow:0 18px 42px rgba(26,71,49,.28);animation:fadeInUp .35s ease both}
.pc-balance-card::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.08),transparent 45%),radial-gradient(circle at 82% 10%,rgba(255,255,255,.14),transparent 30%);pointer-events:none}
.pc-balance-inner{position:relative;z-index:1;padding:24px;min-height:220px;display:flex;flex-direction:column;justify-content:space-between}
.pc-balance-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.pc-balance-icon{width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;color:#b8f5d4;flex-shrink:0}
.pc-balance-label{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.58);margin-bottom:10px}
.pc-balance-value{font-size:34px;font-weight:800;color:#fff;line-height:1;letter-spacing:0;margin:0}
.pc-balance-meta{font-size:11px;color:rgba(255,255,255,.56);margin-top:9px}
.pc-balance-progress{height:7px;background:rgba(255,255,255,.13);border-radius:999px;overflow:hidden;margin-top:18px}
.pc-balance-progress span{display:block;height:100%;border-radius:999px;transition:width 1s cubic-bezier(.4,0,.2,1)}
.pc-balance-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:rgba(255,255,255,.58);font-size:11px}
.pc-warning-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:rgba(239,68,68,.16);border:1px solid rgba(252,165,165,.32);color:#fecaca;font-weight:800}
.pc-balance-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
.pc-money-card{position:relative;overflow:hidden;border-radius:18px;background:#fff;border:1px solid #e7eee9;box-shadow:0 10px 28px rgba(15,23,42,.06);padding:22px;animation:fadeInUp .35s ease both}
.pc-money-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.pc-money-icon{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center}
.pc-money-pill{font-size:11px;font-weight:800;border-radius:999px;padding:5px 9px}
.pc-money-label{font-size:11px;font-weight:800;color:#819189;text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px}
.pc-money-value{font-size:23px;font-weight:800;line-height:1;color:#17251d;margin:0}
.pc-money-note{font-size:12px;color:#8aa097;margin-top:8px}
.pc-money-track{height:5px;background:#eef3f0;border-radius:999px;overflow:hidden;margin-top:16px}
.pc-money-track span{display:block;height:100%;border-radius:999px;transition:width 1s ease}
.pc-stats-mini{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:12px!important;margin-bottom:18px!important}
.pc-stat-mini{background:#fff!important;border-radius:14px!important;padding:16px 18px!important;box-shadow:0 8px 24px rgba(15,23,42,.05)!important;border:1px solid #e7eee9!important;display:flex!important;align-items:center!important;gap:14px!important;animation:fadeInUp .3s ease both}
.pc-stat-icon{width:40px!important;height:40px!important;border-radius:12px!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-shrink:0}
.pc-list-area{margin-top:4px;padding:14px;border:1px solid #e1ece6;border-radius:20px;background:linear-gradient(180deg,#f8fbf9,#eef5f1);box-shadow:inset 0 1px 0 rgba(255,255,255,.75)}
.pc-list-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.pc-list-title{font-size:16px;font-weight:800;color:#17251d;margin:0}
.pc-list-subtitle{font-size:12px;color:#7b8d85;margin-top:4px}
.pc-section-card{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 16px 42px rgba(15,23,42,.07);border:1px solid #e1ece6;margin-top:14px}
.pc-empty-state{padding:64px 24px;text-align:center;color:#8aa097;background:linear-gradient(180deg,#fff,#fbfdfc)}
.pc-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.pc-table-titlebar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #edf3ef;background:linear-gradient(135deg,#fbfdfc,#f2f8f5)}
.pc-table-titlebar p{margin:0}
.pc-table-heading{font-size:15px;font-weight:800;color:#17251d}
.pc-table-subheading{font-size:12px;color:#8aa097;margin-top:3px!important}
.pc-modal{border:none;outline:none;overflow-y:auto;scrollbar-gutter:stable both-edges}
.pc-modal-native-scroll{overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#9aa7a0 transparent}
.pc-modal-native-scroll::-webkit-scrollbar{width:11px;height:11px}
.pc-modal-native-scroll::-webkit-scrollbar-track{background:transparent;border-radius:999px}
.pc-modal-native-scroll::-webkit-scrollbar-thumb{background:#9aa7a0;background-clip:content-box;border:3px solid transparent;border-radius:999px}
.pc-modal-native-scroll::-webkit-scrollbar-thumb:hover{background:#6f7f77;background-clip:content-box}
.pc-modal-native-scroll::-webkit-scrollbar-corner{background:transparent}
.pc-modal-footer{position:sticky;bottom:-30px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 28%);margin:18px -30px -30px;padding:18px 30px 22px;border-top:1px solid rgba(225,236,230,.75)}
.pc-modal-footer .pc-btn-primary,.pc-modal-footer .pc-btn-ghost{min-height:42px;border-radius:10px}
.pc-approval-summary{background:#f8fbf9;border:1px solid #e1ece6;border-radius:12px;padding:16px;margin-bottom:18px}
.pc-approval-no{font-size:13px;font-weight:800;color:#1a4731;margin:0 0 4px}
.pc-approval-amount{font-size:24px;font-weight:800;color:#17251d;margin:0;line-height:1}
.pc-approval-desc{font-size:13px;color:#64748b;margin:8px 0 0;line-height:1.5}
.pc-saldo-modal{max-width:min(1100px,96vw)!important;width:100%;padding:0!important;overflow:hidden!important;background:#f8fbf9!important}
.pc-saldo-modal-body{max-height:88vh;overflow-y:auto;padding:26px}
.pc-saldo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.pc-saldo-title{display:flex;align-items:center;gap:12px}
.pc-saldo-title h2{font-size:21px;font-weight:800;color:#12251a;margin:0;letter-spacing:0}
.pc-saldo-title p{font-size:13px;color:#72847b;margin:4px 0 0}
.pc-saldo-dashboard{display:grid;grid-template-columns:minmax(280px,1.25fr) repeat(3,minmax(130px,.55fr));gap:12px;margin-bottom:16px}
.pc-saldo-balance{position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(135deg,#0d281b,#1a4731 58%,#2d6a4f);padding:20px;color:#fff;min-height:128px;box-shadow:0 14px 30px rgba(26,71,49,.23)}
.pc-saldo-balance::after{content:'';position:absolute;right:-45px;top:-60px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.1)}
.pc-saldo-balance-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.62);margin:0 0 10px}
.pc-saldo-balance-value{font-size:31px;font-weight:800;margin:0;line-height:1}
.pc-saldo-balance-note{font-size:12px;color:rgba(255,255,255,.68);margin:12px 0 0}
.pc-saldo-kpi{background:#fff;border:1px solid #e1ece6;border-radius:14px;padding:15px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
.pc-saldo-kpi-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7b8d85;margin:0 0 9px}
.pc-saldo-kpi-value{font-size:22px;font-weight:800;color:#17251d;margin:0;line-height:1}
.pc-saldo-kpi small{display:block;font-size:11px;color:#8aa097;margin-top:8px}
.pc-saldo-section{background:#fff;border:1px solid #e1ece6;border-radius:16px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.06);margin-top:14px}
.pc-saldo-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #edf3ef;background:linear-gradient(135deg,#fff,#f5faf7)}
.pc-saldo-section-title{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;color:#17251d;margin:0}
.pc-saldo-section-sub{font-size:12px;color:#819189;margin:4px 0 0}
.pc-saldo-table-wrap{overflow:auto}
.pc-saldo-table{width:100%;min-width:860px;border-collapse:separate;border-spacing:0;font-size:12px}
.pc-saldo-table th{position:sticky;top:0;z-index:1;background:#f8fbf9;border-bottom:1px solid #dfe9e4;border-right:1px solid #edf3ef;color:#718178;text-align:left;text-transform:uppercase;letter-spacing:.05em;font-size:10.5px;font-weight:800;padding:10px 12px;white-space:nowrap}
.pc-saldo-table td{border-bottom:1px solid #edf3ef;border-right:1px solid #f1f5f9;color:#334155;padding:11px 12px;vertical-align:middle;background:#fff}
.pc-saldo-table tr:hover td{background:#fbfdfc}
.pc-saldo-table th:last-child,.pc-saldo-table td:last-child{border-right:none}
.pc-saldo-actor{display:flex;flex-direction:column;gap:2px;min-width:0}
.pc-saldo-actor strong{font-size:12.5px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-saldo-actor span{font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-saldo-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;white-space:nowrap}
.pc-saldo-badge.pending{background:#fff7ed;color:#c2410c}
.pc-saldo-badge.disetujui{background:#dcfce7;color:#166534}
.pc-saldo-badge.ditolak{background:#fee2e2;color:#991b1b}
.pc-saldo-empty{padding:34px 20px;text-align:center;color:#8aa097;font-size:13px;background:#fff}
.pc-saldo-footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 26px 22px;background:#fff;border-top:1px solid #e1ece6}
.pc-saldo-footer .pc-btn-ghost{min-height:40px}
.pc-saldo-modal .pc-action-cell{min-width:0}
.pc-saldo-modal .pc-btn-sm{min-height:28px}
.pc-approval-saldo{max-width:min(1040px,96vw)!important;width:100%;padding:0!important;overflow:hidden!important;background:#f8fbf9!important}
.pc-approval-body{max-height:88vh;overflow-y:auto;padding:26px}
.pc-approval-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.pc-approval-title{display:flex;align-items:center;gap:12px}
.pc-approval-title h2{font-size:21px;font-weight:800;color:#12251a;margin:0}
.pc-approval-title p{font-size:13px;color:#72847b;margin:4px 0 0}
.pc-approval-grid{display:grid;grid-template-columns:minmax(310px,.92fr) minmax(420px,1.08fr);gap:16px}
.pc-approval-card{background:#fff;border:1px solid #e1ece6;border-radius:16px;box-shadow:0 12px 34px rgba(15,23,42,.06);overflow:hidden}
.pc-approval-card-head{padding:16px 18px;border-bottom:1px solid #edf3ef;background:linear-gradient(135deg,#fff,#f5faf7)}
.pc-approval-card-title{font-size:14px;font-weight:800;color:#17251d;margin:0;display:flex;align-items:center;gap:8px}
.pc-approval-content{padding:18px}
.pc-approval-request{border:1px solid #e1ece6;border-radius:14px;background:#f8fbf9;padding:14px;margin-bottom:16px}
.pc-approval-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.pc-approval-no{font-family:monospace;font-size:13px;font-weight:800;color:#1a4731;margin:0}
.pc-approval-meta{font-size:12px;color:#819189;margin:3px 0 0}
.pc-approval-user{display:flex;align-items:center;gap:10px;padding:11px 12px;background:#fff;border:1px solid #e1ece6;border-radius:12px;margin-bottom:12px}
.pc-approval-avatar{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1a4731,#236348);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0}
.pc-approval-user strong{font-size:13px;color:#1e293b;display:block}
.pc-approval-user span{font-size:11px;color:#94a3b8;display:block;margin-top:2px}
.pc-approval-note{font-size:13px;color:#475569;line-height:1.6;margin:0;border-left:3px solid #cfe8da;padding-left:11px}
.pc-approval-result{border:1px solid #e1ece6;border-radius:14px;padding:14px;background:#fff;margin-top:10px}
.pc-approval-result strong{display:block;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.pc-approval-result p{font-size:20px;font-weight:800;color:#166534;margin:0}
.pc-usage-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 18px;border-bottom:1px solid #edf3ef;background:#fff}
.pc-usage-kpi{border:1px solid #e1ece6;border-radius:12px;padding:11px;background:#fbfdfc}
.pc-usage-kpi span{font-size:10.5px;color:#819189;text-transform:uppercase;letter-spacing:.05em;font-weight:800}
.pc-usage-kpi strong{display:block;font-size:15px;color:#17251d;margin-top:5px}
.pc-usage-table-wrap{max-height:360px;overflow:auto}
.pc-usage-table{width:100%;min-width:640px;border-collapse:separate;border-spacing:0;font-size:12px}
.pc-usage-table th{position:sticky;top:0;z-index:1;background:#f8fbf9;border-bottom:1px solid #dfe9e4;border-right:1px solid #edf3ef;color:#718178;text-align:left;text-transform:uppercase;letter-spacing:.05em;font-size:10.5px;font-weight:800;padding:10px 12px;white-space:nowrap}
.pc-usage-table td{border-bottom:1px solid #edf3ef;border-right:1px solid #f1f5f9;color:#334155;padding:11px 12px;background:#fff;vertical-align:middle}
.pc-usage-table th:last-child,.pc-usage-table td:last-child{border-right:none}
.pc-approval-footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 26px 22px;background:#fff;border-top:1px solid #e1ece6}
.react-datepicker-wrapper{width:100%}
.react-datepicker__input-container input{width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;box-sizing:border-box;cursor:pointer}
.react-datepicker__input-container input:focus{border-color:#2d6a4f;box-shadow:0 0 0 3px rgba(45,106,79,.08)}
.react-datepicker{font-family:'Plus Jakarta Sans',sans-serif !important;border:1px solid #e2e8f0 !important;border-radius:12px !important;box-shadow:0 8px 30px rgba(0,0,0,0.12) !important;overflow:hidden}
.react-datepicker__header{background:#f0fdf4 !important;border-bottom:1px solid #bbf7d0 !important;border-radius:12px 12px 0 0 !important;padding:12px 0 8px !important}
.react-datepicker__current-month{font-size:14px !important;font-weight:700 !important;color:#166534 !important}
.react-datepicker__day-name{color:#94a3b8 !important;font-size:11px !important;font-weight:600 !important}
.react-datepicker__day{color:#334155 !important;border-radius:8px !important;font-size:13px !important}
.react-datepicker__day:hover{background:#dcfce7 !important;color:#166534 !important}
.react-datepicker__day--selected{background:#1a4731 !important;color:#fff !important;font-weight:600 !important}
.react-datepicker__day--today:not(.react-datepicker__day--selected){border:1.5px solid #16a34a !important;color:#16a34a !important;font-weight:600 !important;background:transparent !important}
.react-datepicker__navigation-icon::before{border-color:#16a34a !important}
.react-datepicker__triangle{display:none !important}

/* ── RESPONSIVE STYLES ── */
@media(max-width:1440px){
  .pc-stats-row{grid-template-columns:1fr 1fr 1fr}
}

@media(max-width:1024px){
  .pc-saldo-amt{font-size:24px}
  .pc-stats-row{grid-template-columns:1fr 1fr}
  .pc-stats-mini{grid-template-columns:repeat(2,1fr)}
  .pc-table thead th{font-size:11px;padding:10px 12px}
  .pc-table tbody td{font-size:12px;padding:10px 12px}
  .pc-btn-sm{padding:4px 10px;font-size:11px}
  .pc-filter-input{font-size:12px;padding:6px 10px}
  .pc-filter-select{font-size:12px;padding:6px 8px}
}

@media(max-width:768px){
  .pc-page{margin:0 -12px}
  
  /* Header */
  h1{font-size:20px !important}
  
  /* Saldo cards grid */
  .pc-saldo-grid{
    display:grid !important;
    grid-template-columns:1fr !important;
    gap:12px !important;
    margin-bottom:16px !important;
  }
  
  /* Saldo card */
  .pc-saldo-card{
    padding:16px !important;
  }
  
  .pc-saldo-amt{font-size:20px}
  .pc-saldo-inner{padding:16px 16px 12px !important;gap:12px}
  .pc-saldo-bar-track{min-width:unset;flex:1}

  /* Stats grid - stack on mobile */
  .pc-stats-row{
    grid-template-columns:1fr !important;
    gap:8px !important;
    margin-bottom:16px !important;
  }
  
  .pc-stat-card{padding:12px 14px}
  .pc-stat-card p:first-child{font-size:10px}
  .pc-stat-card p:last-child{font-size:16px}
  
  /* Stats mini - responsive */
  .pc-stats-mini{
    grid-template-columns:1fr !important;
    gap:8px !important;
    margin-bottom:16px !important;
  }
  
  .pc-stat-mini{
    padding:12px 14px !important;
    gap:10px !important;
    flex-direction:column !important;
    align-items:flex-start !important;
  }
  
  .pc-stat-icon{
    width:32px !important;
    height:32px !important;
  }
  
  .pc-stat-mini p:first-of-type{font-size:10px !important}
  .pc-stat-mini p:last-of-type{font-size:16px !important}
  
  /* Filter bar - stack and scroll */
  .pc-filter-row{
    flex-direction:column;
    gap:6px !important;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
    padding-bottom:4px;
  }
  
  .pc-filter-input{
    width:100%;
    font-size:12px;
    padding:6px 10px;
    min-width:100px;
  }
  
  .pc-filter-select{
    width:100%;
    font-size:12px;
    padding:6px 8px;
    flex-shrink:0;
  }
  
  .pc-filter-date-wrap{
    width:100%;
    flex-shrink:0;
  }
  
  .pc-filter-date-wrap .react-datepicker__input-container input{
    width:60px;
    font-size:11px;
    padding:5px 3px;
  }
  
  .pc-filter-reset{
    width:100%;
    margin-top:4px;
  }
  
  /* Tabs responsiveness */
  .pc-tabs{
    margin-bottom:12px;
    gap:2px;
  }
  
  .pc-tab-pill{
    padding:6px 12px;
    font-size:12px;
    gap:4px;
  }
  
  /* Table responsiveness */
  .pc-table{
    font-size:12px;
  }
  
  .pc-table thead th{
    font-size:10px;
    padding:8px 6px;
    white-space:nowrap;
  }
  
  .pc-table tbody td{
    font-size:11px;
    padding:8px 6px;
  }
  
  /* Hide less important columns on mobile */
  .pc-table th:nth-child(n+3):nth-child(-n+4),
  .pc-table td:nth-child(n+3):nth-child(-n+4){
    display:none;
  }
  
  /* Keperluan column - show with reduced width */
  .pc-table td:nth-child(3),
  .pc-table th:nth-child(3){
    display:table-cell !important;
    max-width:120px;
  }
  
  /* Buttons in table - stack or reduce */
  .pc-table tbody td:last-child{
    padding:6px 4px;
  }
  
  .pc-table tbody td:last-child > div{
    flex-direction:column;
    gap:3px !important;
    align-items:stretch !important;
  }
  
  .pc-btn-sm{
    padding:4px 8px;
    font-size:10px;
    width:100%;
    justify-content:center;
  }
  
  /* Pagination */
  .pc-pagination{
    flex-direction:column;
    padding:10px 12px;
    gap:8px;
  }
  
  .pc-page-info{font-size:11px}
  .pc-page-btn{width:28px;height:28px;font-size:11px}
  
  /* Modal responsiveness */
  .pc-modal{
    padding:20px;
    max-width:95vw !important;
    width:95vw;
    max-height:95vh;
    border-radius:12px;
  }
  
  .pc-modal.sm{max-width:95vw !important}
  .pc-modal.lg{max-width:95vw !important}
  
  .pc-field{margin-bottom:12px;gap:4px}
  .pc-label{font-size:12px}
  .pc-input,.pc-select,.pc-textarea{font-size:13px;padding:8px 10px}
  .pc-textarea{min-height:60px}
  
  .pc-grid2{
    grid-template-columns:1fr;
    gap:10px;
  }

  .pc-modal-summary{
    grid-template-columns:1fr;
    padding:14px;
  }

  .pc-modal-summary-value{font-size:20px}
  .pc-detail-grid{grid-template-columns:1fr;gap:10px}
  .pc-modal-section{padding:14px;margin-bottom:12px}
  .pc-modal-head-title{font-size:18px}
  
  .pc-btn-primary{
    padding:8px 16px;
    font-size:12px;
    width:100%;
    justify-content:center;
  }
  
  .pc-btn-ghost{
    padding:8px 16px;
    font-size:12px;
  }
  
  .pc-modal-footer{
    flex-direction:column;
    gap:8px;
  }
  
  .pc-modal-footer button{
    width:100%;
  }
  
  /* Steps - more compact */
  .pc-steps{
    gap:0;
    margin-bottom:16px;
  }
  
  .pc-step{
    gap:2px;
  }
  
  .pc-step-dot{
    width:22px;
    height:22px;
    font-size:9px;
  }
  
  .pc-step-line{top:11px}
  
  .pc-step-label{
    font-size:8px;
    margin-top:3px;
  }
  
  /* Alert box */
  .pc-alert-ok,.pc-alert-err,.pc-rejection{
    font-size:12px;
    padding:10px 12px;
    margin-bottom:12px;
  }
  
  /* File uploads */
  .pc-file-zone{
    padding:12px 14px;
    margin-bottom:12px;
    flex-wrap:wrap;
  }
  
  .pc-file-pick{
    padding:6px 12px;
    font-size:12px;
  }
  
  /* Radio cards */
  .pc-radio-card{
    padding:9px 10px;
    font-size:12px;
    gap:8px;
  }
}

@media(max-width:480px){
  .pc-page{margin:0 -8px}
  
  h1{font-size:18px !important}
  
  .pc-saldo-amt{font-size:18px}
  .pc-saldo-inner{padding:12px 12px 10px !important}
  
  /* Stats - full width */
  .pc-stat-card{padding:10px 12px}
  .pc-stat-card > div:first-child{width:32px;height:32px}
  
  /* Stats mini - stacked */
  .pc-stats-mini{grid-template-columns:1fr !important}
  .pc-stat-mini{padding:10px 12px !important;gap:8px !important}
  .pc-stat-icon{width:28px !important;height:28px !important}
  .pc-stat-mini p:first-of-type{font-size:9px !important}
  .pc-stat-mini p:last-of-type{font-size:14px !important}
  
  .pc-tabs{
    width:100%;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
  }
  
  .pc-tab-pill{
    padding:5px 10px;
    font-size:11px;
  }
  
  .pc-filter-input{
    font-size:11px;
    padding:5px 8px;
  }
  
  .pc-filter-select{
    font-size:11px;
  }
  
  .pc-table{
    font-size:11px;
  }
  
  .pc-table thead th{
    font-size:9px;
    padding:6px 4px;
  }
  
  .pc-table tbody td{
    font-size:10px;
    padding:6px 4px;
  }
  
  .pc-modal{
    padding:16px;
    max-width:100vw !important;
    max-height:95vh;
    border-radius:10px;
  }
  
  .pc-btn-primary{
    padding:6px 12px;
    font-size:11px;
  }
  
  .pc-btn-sm{
    padding:3px 6px;
    font-size:9px;
  }
  
  .pc-page-btn{
    width:24px;
    height:24px;
    font-size:10px;
  }
  
  .pc-input,.pc-select,.pc-textarea{
    font-size:12px;
    padding:6px 8px;
  }
}
`;

function StableFilterBar({ searchVal, onSearch, statusVal, onStatus, statusCfg, dariVal, onDari, sampaiVal, onSampai, onReset, hasFilter }) {
    return (
        <div className="pc-filter-bar">
            <div className="pc-filter-row">
                <div className="pc-filter-search">
                    <Search size={15} />
                    <input className="pc-filter-input" placeholder="Cari nomor atau keperluan..." value={searchVal} onChange={e => onSearch(e.target.value)} />
                </div>
                <select className="pc-filter-select" value={statusVal} onChange={e => onStatus(e.target.value)}>
                    <option value="">Semua Status</option>
                    {Object.entries(statusCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>Tanggal</span>
                <div className="pc-filter-date-wrap">
                    <DatePicker selected={dariVal} onChange={onDari} selectsStart startDate={dariVal} endDate={sampaiVal} placeholderText="Dari" dateFormat="dd/MM/yy" locale={id} isClearable popperPlacement="bottom-end" />
                    <span style={{ fontSize: 11, color: '#cbd5e1', flexShrink: 0 }}>-</span>
                    <DatePicker selected={sampaiVal} onChange={onSampai} selectsEnd startDate={dariVal} endDate={sampaiVal} minDate={dariVal} placeholderText="Sampai" dateFormat="dd/MM/yy" locale={id} isClearable popperPlacement="bottom-end" />
                </div>
                {hasFilter && <button className="pc-filter-reset" onClick={onReset}>Reset</button>}
            </div>
        </div>
    );
}

export default function PettyCash() {
    const { user } = useAuth();
    const isManajer = user?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role);
    const isDirekturWadir = user?.is_superuser || ['wakil_direktur', 'direktur'].includes(user?.role);
    const canSeeSaldo = isManajer;

    const [activeTab, setActiveTab] = useState('pc');
    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');
    const [saving, setSaving] = useState(false);

    // Saldo state
    const [saldo, setSaldo] = useState(null);
    const [riwayatSaldo, setRiwayatSaldo] = useState([]);
    const [listPenambahan, setListPenambahan] = useState([]);
    const [riwayatSaldoPage, setRiwayatSaldoPage] = useState(1);
    const [modalSaldo, setModalSaldo] = useState(false);
    const [modalAjukanSaldo, setModalAjukanSaldo] = useState(false);
    const [modalApprovalSaldo, setModalApprovalSaldo] = useState(null);
    const [formSaldo, setFormSaldo] = useState({ tanggal: '', alasan: '' });
    const [formApvSaldo, setFormApvSaldo] = useState({ aksi: 'setujui', nominal_diajukan: '', catatan_tolak: '' });

    // PC state
    const [listPC, setListPC] = useState([]);
    const [loadingPC, setLoadingPC] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDari, setFilterDari] = useState(null);
    const [filterSampai, setFilterSampai] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSizePC, setPageSizePC] = useState(10);
    const [totalPC, setTotalPC] = useState(0);

    const [modalBuat, setModalBuat] = useState(false);
    const [modalDetail, setModalDetail] = useState(null);
    const [modalApproval, setModalApproval] = useState(null);
    const [modalCairkan, setModalCairkan] = useState(null);
    const [modalLaporan, setModalLaporan] = useState(null);
    const [modalKonfirmasi, setModalKonfirmasi] = useState(null);
    const [modalRevisi, setModalRevisi] = useState(null);
    const [modalHapus, setModalHapus] = useState(null);

    const [formPC, setFormPC] = useState({ tanggal: '', keperluan: '', nominal: '', keterangan: '' });
    const [berkasPC, setBerkasPC] = useState(null);
    const [berkasPCInfo, setBerkasPCInfo] = useState(null);
    const [formLaporan, setFormLaporan] = useState({ tanggal_laporan: '', nominal_digunakan: '', rincian: '' });
    const [notaFile, setNotaFile] = useState(null);
    const [notaFileInfo, setNotaFileInfo] = useState(null);
    const [approvalForm, setApprovalForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const berkasRef = useRef(); const notaRef = useRef();

    // RB state
    const [listRB, setListRB] = useState([]);
    const [loadingRB, setLoadingRB] = useState(true);
    const [searchRB, setSearchRB] = useState('');
    const [filterStatusRB, setFilterStatusRB] = useState('');
    const [filterDariRB, setFilterDariRB] = useState(null);
    const [filterSampaiRB, setFilterSampaiRB] = useState(null);
    const [pageRB, setPageRB] = useState(1);
    const [pageSizeRB, setPageSizeRB] = useState(10);
    const [totalRB, setTotalRB] = useState(0);

    const [modalBuatRB, setModalBuatRB] = useState(false);
    const [modalDetailRB, setModalDetailRB] = useState(null);
    const [modalApprovalRB, setModalApprovalRB] = useState(null);
    const [modalCairkanRB, setModalCairkanRB] = useState(null);
    const [modalRevisiRB, setModalRevisiRB] = useState(null);
    const [modalHapusRB, setModalHapusRB] = useState(null);

    const [formRB, setFormRB] = useState({ tanggal: '', keperluan: '', nominal: '', keterangan: '' });
    const [berkasRB, setBerkasRB] = useState(null);
    const [berkasRBInfo, setBerkasRBInfo] = useState(null);
    const [approvalRBForm, setApprovalRBForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const berkasRBRef = useRef();
    const [imagePreview, setImagePreview] = useState(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchAll(); }, [page, pageSizePC, filterStatus, filterDari, filterSampai, pageRB, pageSizeRB, filterStatusRB, filterDariRB, filterSampaiRB]);

    const fetchAll = async () => {
        setLoadingPC(true); setLoadingRB(true);
        try {
            const promises = [
                api.get('/keuangan/petty-cash/', { params: pageParams(page, pageSizePC, { status: filterStatus || undefined, dari: dateToStr(filterDari), sampai: dateToStr(filterSampai) }) }),
                api.get('/keuangan/reimbursement/', { params: pageParams(pageRB, pageSizeRB, { status: filterStatusRB || undefined, dari: dateToStr(filterDariRB), sampai: dateToStr(filterSampaiRB) }) }),
            ];
            if (canSeeSaldo) {
                promises.push(api.get('/keuangan/saldo-petty-cash/'));
                promises.push(api.get('/keuangan/penambahan-saldo/'));
            }
            const results = await Promise.all(promises);
            setListPC(getResults(results[0].data));
            setTotalPC(getCount(results[0].data));
            setListRB(getResults(results[1].data));
            setTotalRB(getCount(results[1].data));
            if (canSeeSaldo && results[2]) {
                setSaldo(results[2].data.saldo);
                setRiwayatSaldo(results[2].data.riwayat || []);
            }
            if (canSeeSaldo && results[3]) {
                setListPenambahan(getResults(results[3].data));
            }
        } catch (e) { console.error(e); }
        finally { setLoadingPC(false); setLoadingRB(false); }
    };

    const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };
    const resetError = () => setError('');

    // Filtered PC
    const filteredPC = useMemo(() => listPC.filter(i => {
        if (filterStatus && i.status !== filterStatus) return false;
        if (search) { const q = search.toLowerCase(); if (!i.no_pengajuan?.toLowerCase().includes(q) && !i.keperluan?.toLowerCase().includes(q)) return false; }
        if (filterDari && new Date(i.tanggal) < filterDari) return false;
        if (filterSampai) { const s = new Date(filterSampai); s.setHours(23, 59, 59); if (new Date(i.tanggal) > s) return false; }
        return true;
    }), [listPC, filterStatus, search, filterDari, filterSampai]);

    const totalPagesPC = pageCount(search ? filteredPC.length : totalPC, pageSizePC);
    const pagedPC = search ? filteredPC : filteredPC;
    useEffect(() => setPage(1), [search, filterStatus, filterDari, filterSampai]);

    // Filtered RB
    const filteredRB = useMemo(() => listRB.filter(i => {
        if (filterStatusRB && i.status !== filterStatusRB) return false;
        if (searchRB) { const q = searchRB.toLowerCase(); if (!i.no_reimbursement?.toLowerCase().includes(q) && !i.keperluan?.toLowerCase().includes(q)) return false; }
        if (filterDariRB && new Date(i.tanggal) < filterDariRB) return false;
        if (filterSampaiRB) { const s = new Date(filterSampaiRB); s.setHours(23, 59, 59); if (new Date(i.tanggal) > s) return false; }
        return true;
    }), [listRB, filterStatusRB, searchRB, filterDariRB, filterSampaiRB]);

    const totalPagesRB = pageCount(searchRB ? filteredRB.length : totalRB, pageSizeRB);
    const pagedRB = searchRB ? filteredRB : filteredRB;
    useEffect(() => setPageRB(1), [searchRB, filterStatusRB, filterDariRB, filterSampaiRB]);

    // Stats
    const pendingPC = listPC.filter(i => i.status === 'pending').length;
    const pendingRB = listRB.filter(i => i.status === 'pending').length;
    const berjalanPC = listPC.filter(i => ['dicairkan', 'dilaporkan', 'menunggu_pengembalian'].includes(i.status)).length;
    const selesaiPC = listPC.filter(i => i.status === 'selesai').length;
    // Handlers PC
    const handleBuatPC = async () => {
        setError('');
        if (!formPC.tanggal || !formPC.keperluan || !formPC.nominal) return setError('Tanggal, keperluan, dan nominal wajib diisi.');
        if (Number(formPC.nominal) > 999999) return setError('Nominal maksimal Rp 999.999. Pengajuan di atas itu langsung ke bagian keuangan.');
        if (Number(formPC.nominal) <= 0) return setError('Nominal harus lebih dari 0.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formPC).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (berkasPC) fd.append('berkas', berkasPC);
            await api.post('/keuangan/petty-cash/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan petty cash berhasil disubmit!');
            setModalBuat(false); setFormPC({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasPC(null); setBerkasPCInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleApprovalPC = async () => {
        setError('');
        if (approvalForm.aksi === 'tolak' && !approvalForm.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalApproval.id}/approval/`, approvalForm);
            showSuccess(`Pengajuan berhasil ${approvalForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApproval(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleCairkanPC = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalCairkan.id}/cairkan/`);
            showSuccess('Dana berhasil dicairkan!');
            setModalCairkan(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal mencairkan.'); }
        finally { setSaving(false); }
    };

    const handleLaporanPC = async () => {
        setError('');
        if (!formLaporan.tanggal_laporan || !formLaporan.nominal_digunakan || !formLaporan.rincian) return setError('Semua field wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formLaporan).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (notaFile) fd.append('nota', notaFile);
            await api.post(`/keuangan/petty-cash/${modalLaporan.id}/laporan/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Laporan penggunaan berhasil disubmit!');
            setModalLaporan(null); setFormLaporan({ tanggal_laporan: '', nominal_digunakan: '', rincian: '' }); setNotaFile(null); setNotaFileInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal submit laporan.'); }
        finally { setSaving(false); }
    };

    const handleKonfirmasiPC = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalKonfirmasi.id}/konfirmasi-pengembalian/`);
            showSuccess('Pengembalian dikonfirmasi. Petty cash selesai!');
            setModalKonfirmasi(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal konfirmasi.'); }
        finally { setSaving(false); }
    };

    const handleRevisiPC = async () => {
        setError('');
        if (!formPC.tanggal || !formPC.keperluan || !formPC.nominal) return setError('Semua field wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formPC).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (berkasPC) fd.append('berkas', berkasPC);
            await api.post(`/keuangan/petty-cash/${modalRevisi.id}/revisi/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan berhasil direvisi!');
            setModalRevisi(null); setFormPC({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasPC(null); setBerkasPCInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal merevisi.'); }
        finally { setSaving(false); }
    };

    const handleHapusPC = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/petty-cash/${modalHapus.id}/`);
            showSuccess('Pengajuan berhasil dihapus.');
            setModalHapus(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || e.response?.data?.error || 'Gagal menghapus.'); }
        finally { setSaving(false); }
    };

    // Handlers RB
    const handleBuatRB = async () => {
        setError('');
        if (!formRB.tanggal || !formRB.keperluan || !formRB.nominal) return setError('Tanggal, keperluan, dan nominal wajib diisi.');
        if (Number(formRB.nominal) > 999999) return setError('Nominal maksimal Rp 999.999. Pengajuan di atas itu langsung ke bagian keuangan.');
        if (Number(formRB.nominal) <= 0) return setError('Nominal harus lebih dari 0.');
        if (!berkasRB) return setError('Berkas bukti wajib dilampirkan.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formRB).forEach(([k, v]) => { if (v) fd.append(k, v); });
            fd.append('berkas', berkasRB);
            await api.post('/keuangan/reimbursement/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan reimbursement berhasil disubmit!');
            setModalBuatRB(false); setFormRB({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasRB(null); setBerkasRBInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || e.response?.data?.berkas?.[0] || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleApprovalRB = async () => {
        setError('');
        if (approvalRBForm.aksi === 'tolak' && !approvalRBForm.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalApprovalRB.id}/approval/`, approvalRBForm);
            showSuccess(`Reimbursement berhasil ${approvalRBForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApprovalRB(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleCairkanRB = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalCairkanRB.id}/cairkan/`);
            showSuccess('Reimbursement berhasil dicairkan!');
            setModalCairkanRB(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal mencairkan.'); }
        finally { setSaving(false); }
    };

    const handleRevisiRB = async () => {
        setError('');
        if (!formRB.tanggal || !formRB.keperluan || !formRB.nominal) return setError('Semua field wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formRB).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (berkasRB) fd.append('berkas', berkasRB);
            await api.post(`/keuangan/reimbursement/${modalRevisiRB.id}/revisi/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Reimbursement berhasil direvisi!');
            setModalRevisiRB(null); setFormRB({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasRB(null); setBerkasRBInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal merevisi.'); }
        finally { setSaving(false); }
    };

    const handleHapusRB = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/reimbursement/${modalHapusRB.id}/`);
            showSuccess('Pengajuan reimbursement berhasil dihapus.');
            setModalHapusRB(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || e.response?.data?.error || 'Gagal menghapus.'); }
        finally { setSaving(false); }
    };

    // Handlers saldo
    const handleAjukanSaldo = async () => {
        setError('');
        if (!formSaldo.tanggal || !formSaldo.alasan) return setError('Tanggal dan alasan wajib diisi.');
        setSaving(true);
        try {
            await api.post('/keuangan/penambahan-saldo/', formSaldo);
            showSuccess('Pengajuan penambahan saldo berhasil disubmit!');
            setModalAjukanSaldo(false); setFormSaldo({ tanggal: '', alasan: '' }); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal mengajukan.'); }
        finally { setSaving(false); }
    };

    const handleApprovalSaldo = async () => {
        setError('');
        if (formApvSaldo.aksi === 'setujui' && !formApvSaldo.nominal_diajukan) return setError('Nominal wajib diisi.');
        if (formApvSaldo.aksi === 'tolak' && !formApvSaldo.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/penambahan-saldo/${modalApprovalSaldo.id}/approval/`, formApvSaldo);
            showSuccess(`Pengajuan berhasil ${formApvSaldo.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApprovalSaldo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleAttachmentChange = async (e, setFile, setInfo) => {
        setError('');
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            if (file.type.startsWith('image/')) {
                const validation = validateImageFile(file);
                if (!validation.isValid) return setError(validation.error);
                const [compressed] = await compressImages([file], { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.75 });
                const reduction = Math.max(0, (1 - compressed.size / file.size) * 100).toFixed(1);
                setFile(compressed);
                setInfo({
                    name: file.name,
                    originalSize: formatFileSize(file.size),
                    compressedSize: formatFileSize(compressed.size),
                    reduction,
                    compressed: true,
                });
            } else {
                setFile(file);
                setInfo({
                    name: file.name,
                    originalSize: formatFileSize(file.size),
                    compressedSize: formatFileSize(file.size),
                    reduction: '0.0',
                    compressed: false,
                });
            }
        } catch (err) {
            setError(`Gagal memproses file: ${err.message}`);
        } finally {
            if (e.target) e.target.value = '';
        }
    };

    // Saldo info
    const saldoNominal = saldo ? Number(saldo.saldo) : 0;
    const saldoPct = Math.min((saldoNominal / 10000000) * 100, 100).toFixed(1);
    const saldoKritis = saldoNominal < 1000000;
    const pendingSaldo = listPenambahan.filter(i => i.status === 'pending').length;
    const saldoStats = useMemo(() => ({
        pending: listPenambahan.filter(i => i.status === 'pending').length,
        disetujui: listPenambahan.filter(i => i.status === 'disetujui').length,
        ditolak: listPenambahan.filter(i => i.status === 'ditolak').length,
    }), [listPenambahan]);
    const saldoTotalMasuk = useMemo(
        () => riwayatSaldo.filter(i => i.jenis === 'penambahan').reduce((sum, i) => sum + Number(i.jumlah || 0), 0),
        [riwayatSaldo]
    );
    const saldoTotalKeluar = useMemo(
        () => riwayatSaldo.filter(i => i.jenis === 'pengurangan').reduce((sum, i) => sum + Number(i.jumlah || 0), 0),
        [riwayatSaldo]
    );
    const saldoActor = (r) => ({
        nama: r.nama_pengaju || r.created_by_name || 'Tidak diketahui',
        unit: r.unit_pengaju || r.created_by_unit || '',
    });
    const totalRiwayatSaldoPages = Math.max(1, Math.ceil(riwayatSaldo.length / RIWAYAT_SALDO_PER_PAGE));
    const pagedRiwayatSaldo = riwayatSaldo.slice(
        (riwayatSaldoPage - 1) * RIWAYAT_SALDO_PER_PAGE,
        riwayatSaldoPage * RIWAYAT_SALDO_PER_PAGE
    );
    useEffect(() => setRiwayatSaldoPage(1), [riwayatSaldo.length]);
    const approvalUsageTotal = modalApprovalSaldo?.riwayat_snapshot?.reduce((s, r) => s + Number(r.jumlah || 0), 0) || 0;
    const approvalSaldoAfter = saldoNominal + Number(formApvSaldo.nominal_diajukan || 0);
    const penambahanStatusLabel = (status) => ({
        pending: 'Menunggu',
        disetujui: 'Disetujui',
        ditolak: 'Ditolak',
    }[status] || status || '-');

    const renderPages = (cur, total, setFn) => {
        const btns = [];
        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= cur - 1 && i <= cur + 1)) btns.push(i);
            else if (btns[btns.length - 1] !== '...') btns.push('...');
        }
        return btns.map((btn, i) => btn === '...'
            ? <span key={i} style={{ padding: '0 4px', color: '#94a3b8', lineHeight: '32px' }}>...</span>
            : <button key={i} className={`pc-page-btn${cur === btn ? ' active' : ''}`} onClick={() => setFn(btn)}>{btn}</button>
        );
    };

    const StepTracker = ({ status }) => {
        if (status === 'ditolak') return (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 16px', marginBottom: 24, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                Pengajuan ini ditolak
            </div>
        );
        const curIdx = ORDER.indexOf(status);
        return (
            <div className="pc-steps">
                {PC_STEPS.map((s, i) => {
                    const idx = ORDER.indexOf(s.key);
                    const done = curIdx >= idx;
                    const active = curIdx === idx;
                    return (
                        <div key={s.key} className="pc-step">
                            {i < PC_STEPS.length - 1 && <div className="pc-step-line" style={{ background: done ? '#1a4731' : '#e2e8f0' }} />}
                            <div className="pc-step-dot" style={{ background: done ? '#1a4731' : '#f1f5f9', color: done ? '#fff' : '#94a3b8', border: active ? '2px solid #1a4731' : 'none', boxSizing: 'border-box' }}>
                                {done ? <Check size={12} /> : i + 1}
                            </div>
                            <div className="pc-step-label" style={{ color: done ? '#1a4731' : '#94a3b8' }}>{s.label}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="pc-page pc-shell">
            <style>{STYLES}</style>

            <div className="pc-hero">
                <div className="pc-hero-main">
                    <div>
                        <div className="pc-eyebrow">
                            <Wallet size={14} />
                            Dashboard Dana Operasional
                        </div>
                        <h1 className="pc-title">Petty Cash & Reimbursement</h1>
                        <p className="pc-subtitle">Pantau saldo kas kecil, proses pengajuan, dan cek reimbursement dalam satu halaman kerja yang ringkas.</p>
                    </div>
                </div>
            </div>

            {success && <div className="pc-alert-ok"><Check size={16} /> {success}</div>}

            {/* Saldo cards untuk manajer ke atas */}
            {canSeeSaldo && saldo && (() => {
                const totalMasuk = riwayatSaldo.filter(r => r.jenis === 'penambahan').reduce((s, r) => s + Number(r.jumlah), 0);
                const totalKeluar = riwayatSaldo.filter(r => r.jenis === 'pengurangan').reduce((s, r) => s + Number(r.jumlah), 0);
                return (
                    <div className="pc-saldo-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 28 }}>

                        {/* Card Saldo Utama */}
                        <div className="pc-balance-card">
                            <div className="pc-balance-inner">
                                <div>
                                    <div className="pc-balance-top">
                                        <div>
                                            <p className="pc-balance-label">Saldo Petty Cash</p>
                                            <p className="pc-balance-value">{fmt(saldoNominal)}</p>
                                            {saldo.updated_by_name && <p className="pc-balance-meta">Diperbarui oleh {saldo.updated_by_name}</p>}
                                        </div>
                                        <div className="pc-balance-icon"><Wallet size={23} /></div>
                                    </div>
                                    <div className="pc-balance-progress">
                                        <span style={{ width: `${saldoPct}%`, background: saldoKritis ? 'linear-gradient(90deg,#f87171,#ef4444)' : 'linear-gradient(90deg,#6ee7b7,#34d399)' }} />
                                    </div>
                                    <div className="pc-balance-foot">
                                        <span>{saldoPct}% dari Rp 10.000.000</span>
                                        {saldoKritis && <span className="pc-warning-pill"><AlertTriangle size={13} /> Menipis</span>}
                                    </div>
                                </div>
                                <div className="pc-balance-actions">
                                    <button className="pc-action-dark" onClick={() => setModalSaldo(true)}>
                                        <ClipboardList size={15} />
                                        Daftar Penambahan Saldo
                                        {pendingSaldo > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '2px 7px', lineHeight: 1.4 }}>{pendingSaldo}</span>}
                                    </button>
                                    {isManajer && (
                                        <button className="pc-action-dark" onClick={() => { setFormSaldo({ tanggal: '', alasan: '' }); resetError(); setModalAjukanSaldo(true); }}>
                                            <Plus size={15} />
                                            Ajukan Penambahan
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Card Total Masuk */}
                        <div style={{ borderRadius: 20, background: '#fff', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,.06)', padding: '24px', animation: 'fadeInUp .35s .08s ease both', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(34,197,94,.06)', pointerEvents: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#bbf7d0,#dcfce7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534' }}><ArrowRight size={18} style={{ transform: 'rotate(-45deg)' }} /></div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', borderRadius: 6, padding: '3px 8px' }}>MASUK</span>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Total Penambahan</p>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#166534', letterSpacing: '-.02em', lineHeight: 1 }}>{fmt(totalMasuk)}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{riwayatSaldo.filter(r => r.jenis === 'penambahan').length} kali penambahan</p>
                            <div style={{ height: 3, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', marginTop: 14 }}>
                                <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#86efac,#22c55e)', width: `${Math.min((totalMasuk / (totalMasuk + totalKeluar || 1)) * 100, 100).toFixed(0)}%`, transition: 'width 1s ease' }} />
                            </div>
                        </div>

                        {/* Card Total Keluar */}
                        <div style={{ borderRadius: 20, background: '#fff', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,.06)', padding: '24px', animation: 'fadeInUp .35s .16s ease both', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(239,68,68,.06)', pointerEvents: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#fecaca,#fee2e2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}><ArrowRight size={18} style={{ transform: 'rotate(45deg)' }} /></div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 6, padding: '3px 8px' }}>KELUAR</span>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Total Penggunaan</p>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#dc2626', letterSpacing: '-.02em', lineHeight: 1 }}>{fmt(totalKeluar)}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{riwayatSaldo.filter(r => r.jenis === 'pengurangan').length} kali penggunaan</p>
                            <div style={{ height: 3, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', marginTop: 14 }}>
                                <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#fca5a5,#ef4444)', width: `${Math.min((totalKeluar / (totalMasuk + totalKeluar || 1)) * 100, 100).toFixed(0)}%`, transition: 'width 1s ease' }} />
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Stats row kalau tidak ada saldo banner (karyawan) */}
            {/* Stats mini */}
            <div className="pc-stats-mini" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                {[
                    { Icon: Clock, label: 'Pending Approval', val: pendingPC + pendingRB, color: '#c2410c', bg: '#fff7ed' },
                    { Icon: Wallet, label: 'Sedang Berjalan', val: berjalanPC, color: '#1d4ed8', bg: '#eff6ff' },
                    { Icon: Check, label: 'Selesai', val: selesaiPC, color: '#166534', bg: '#f0fdf4' },
                ].map((s, i) => (
                    <div className="pc-stat-mini" key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.05)', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 14, animation: `fadeInUp .3s ${i * .06}s ease both` }}>
                        <div className="pc-stat-icon" style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}><s.Icon size={18} color={s.color} strokeWidth={1.5} /></div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{s.label}</p>
                            <p style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="pc-list-area">
                <div className="pc-list-head">
                    <div>
                        <p className="pc-list-title">Pengajuan Operasional</p>
                        <p className="pc-list-subtitle">Pilih jenis pengajuan, filter data, lalu proses sesuai role Anda.</p>
                    </div>
                    <div className="pc-tabs">
                        <button className={`pc-tab-pill${activeTab === 'pc' ? ' active' : ''}`} onClick={() => setActiveTab('pc')}>
                            Petty Cash {pendingPC > 0 && <span className="pc-tab-count">{pendingPC}</span>}
                        </button>
                        <button className={`pc-tab-pill${activeTab === 'rb' ? ' active' : ''}`} onClick={() => setActiveTab('rb')}>
                            Reimbursement {pendingRB > 0 && <span className="pc-tab-count">{pendingRB}</span>}
                        </button>
                    </div>
                </div>

            {/* ══ TAB PETTY CASH ══ */}
            {activeTab === 'pc' && (
                <div className="pc-section-card">
                    <div className="pc-table-titlebar">
                        <div>
                            <p className="pc-table-heading">Daftar Petty Cash</p>
                            <p className="pc-table-subheading">{search ? filteredPC.length : totalPC} pengajuan ditemukan</p>
                        </div>
                        <button className="pc-action-primary" onClick={() => {
                            setFormPC({ tanggal: '', keperluan: '', nominal: '', keterangan: '' });
                            setBerkasPC(null);
                            setBerkasPCInfo(null);
                            resetError();
                            setModalBuat(true);
                        }}>
                            <Plus size={16} />
                            Ajukan Petty Cash
                        </button>
                    </div>
                    <StableFilterBar searchVal={search} onSearch={setSearch} statusVal={filterStatus} onStatus={setFilterStatus}
                        statusCfg={PC_STATUS} dariVal={filterDari} onDari={setFilterDari} sampaiVal={filterSampai} onSampai={setFilterSampai}
                        hasFilter={!!(search || filterStatus || filterDari || filterSampai)}
                        onReset={() => { setSearch(''); setFilterStatus(''); setFilterDari(null); setFilterSampai(null); }} />

                    {loadingPC ? <div className="pc-empty-state">Memuat data...</div>
                        : pagedPC.length === 0 ? <div className="pc-empty-state">Tidak ada data.</div>
                            : <div className="pc-table-wrap"><table className="pc-table">
                                <thead><tr>
                                    <th>No. Pengajuan</th><th>Tanggal</th><th>Keperluan</th><th>Nominal</th><th>Status</th><th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr></thead>
                                <tbody>
                                    {pagedPC.map((item, idx) => (
                                        <tr key={item.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                            <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a4731', fontSize: 13 }}>{item.no_pengajuan}</span></td>
                                            <td style={{ color: '#94a3b8' }}>{fmtTgl(item.tanggal)}</td>
                                            <td style={{ maxWidth: 200 }}>
                                                <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keperluan}</p>
                                                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.created_by_name}</p>
                                            </td>
                                            <td style={{ fontWeight: 700, color: '#1a4731' }}>{fmt(item.nominal)}</td>
                                            <td><StatusBadge cfg={PC_STATUS} status={item.status} /></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="pc-action-cell">
                                                    {isDirekturWadir && item.status === 'pending' && (
                                                        <button className="pc-btn-sm g" onClick={() => { setApprovalForm({ aksi: 'setujui', catatan_tolak: '' }); resetError(); setModalApproval(item); }}>Proses</button>
                                                    )}
                                                    {isManajer && item.status === 'disetujui' && (
                                                        <button className="pc-btn-sm b" onClick={() => { resetError(); setModalCairkan(item); }}>Cairkan</button>
                                                    )}
                                                    {item.status === 'dicairkan' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button className="pc-btn-sm p" onClick={() => { setFormLaporan({ tanggal_laporan: '', nominal_digunakan: '', rincian: '' }); setNotaFile(null); setNotaFileInfo(null); resetError(); setModalLaporan(item); }}>Laporan</button>
                                                    )}
                                                    {isManajer && ['dilaporkan', 'menunggu_pengembalian'].includes(item.status) && (
                                                        <button className="pc-btn-sm y" onClick={() => { resetError(); setModalKonfirmasi(item); }}>Konfirmasi</button>
                                                    )}
                                                    <button className="pc-btn-sm n" onClick={() => setModalDetail(item)}>Detail</button>
                                                    {item.status === 'ditolak' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button className="pc-btn-sm b revision" onClick={() => { setFormPC({ tanggal: item.tanggal, keperluan: item.keperluan, nominal: item.nominal, keterangan: item.keterangan || '' }); setBerkasPC(null); setBerkasPCInfo(null); resetError(); setModalRevisi(item); }}>Revisi</button>
                                                    )}
                                                    {((item.status === 'pending' && item.created_by === user?.id) || isDirekturWadir) && (
                                                        <button className="pc-btn-sm r" onClick={() => { resetError(); setModalHapus(item); }}>Hapus</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>}

                    {(search ? filteredPC.length : totalPC) > 0 && (
                        <div className="pc-pagination">
                            <span className="pc-page-info">Hal {page} dari {totalPagesPC} - {search ? filteredPC.length : totalPC} data</span>
                            <div className="pc-page-btns">
                                <RowSizeSelect className="pc-filter-select" value={pageSizePC} onChange={(size) => { setPageSizePC(size); setPage(1); }} />
                                <button className="pc-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>&lt;</button>
                                {renderPages(page, totalPagesPC, setPage)}
                                <button className="pc-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPagesPC}>&gt;</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ TAB REIMBURSEMENT ══ */}
            {activeTab === 'rb' && (
                <div className="pc-section-card">
                    <div className="pc-table-titlebar">
                        <div>
                            <p className="pc-table-heading">Daftar Reimbursement</p>
                            <p className="pc-table-subheading">{searchRB ? filteredRB.length : totalRB} pengajuan ditemukan</p>
                        </div>
                        <button className="pc-action-primary" onClick={() => {
                            setFormRB({ tanggal: '', keperluan: '', nominal: '', keterangan: '' });
                            setBerkasRB(null);
                            setBerkasRBInfo(null);
                            resetError();
                            setModalBuatRB(true);
                        }}>
                            <Plus size={16} />
                            Ajukan Reimbursement
                        </button>
                    </div>
                    <StableFilterBar searchVal={searchRB} onSearch={setSearchRB} statusVal={filterStatusRB} onStatus={setFilterStatusRB}
                        statusCfg={RB_STATUS} dariVal={filterDariRB} onDari={setFilterDariRB} sampaiVal={filterSampaiRB} onSampai={setFilterSampaiRB}
                        hasFilter={!!(searchRB || filterStatusRB || filterDariRB || filterSampaiRB)}
                        onReset={() => { setSearchRB(''); setFilterStatusRB(''); setFilterDariRB(null); setFilterSampaiRB(null); }} />

                    {loadingRB ? <div className="pc-empty-state">Memuat data...</div>
                        : pagedRB.length === 0 ? <div className="pc-empty-state">Tidak ada data.</div>
                            : <div className="pc-table-wrap"><table className="pc-table">
                                <thead><tr>
                                    <th>No. Reimburse</th><th>Tanggal</th><th>Keperluan</th><th>Nominal</th><th>Status</th><th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr></thead>
                                <tbody>
                                    {pagedRB.map((item, idx) => (
                                        <tr key={item.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                            <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a4731', fontSize: 13 }}>{item.no_reimbursement}</span></td>
                                            <td style={{ color: '#94a3b8' }}>{fmtTgl(item.tanggal)}</td>
                                            <td style={{ maxWidth: 200 }}>
                                                <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keperluan}</p>
                                                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.created_by_name}</p>
                                            </td>
                                            <td style={{ fontWeight: 700, color: '#1a4731' }}>{fmt(item.nominal)}</td>
                                            <td><StatusBadge cfg={RB_STATUS} status={item.status} /></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="pc-action-cell">
                                                    {isDirekturWadir && item.status === 'pending' && (
                                                        <button className="pc-btn-sm g" onClick={() => { setApprovalRBForm({ aksi: 'setujui', catatan_tolak: '' }); resetError(); setModalApprovalRB(item); }}>Proses</button>
                                                    )}
                                                    {isManajer && item.status === 'disetujui' && (
                                                        <button className="pc-btn-sm b" onClick={() => { resetError(); setModalCairkanRB(item); }}>Cairkan</button>
                                                    )}
                                                    <button className="pc-btn-sm n" onClick={() => setModalDetailRB(item)}>Detail</button>
                                                    {item.status === 'ditolak' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button className="pc-btn-sm b revision" onClick={() => { setFormRB({ tanggal: item.tanggal, keperluan: item.keperluan, nominal: item.nominal, keterangan: item.keterangan || '' }); setBerkasRB(null); setBerkasRBInfo(null); resetError(); setModalRevisiRB(item); }}>Revisi</button>
                                                    )}
                                                    {((item.status === 'pending' && item.created_by === user?.id) || isDirekturWadir) && (
                                                        <button className="pc-btn-sm r" onClick={() => { resetError(); setModalHapusRB(item); }}>Hapus</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>}

                    {(searchRB ? filteredRB.length : totalRB) > 0 && (
                        <div className="pc-pagination">
                            <span className="pc-page-info">Hal {pageRB} dari {totalPagesRB} - {searchRB ? filteredRB.length : totalRB} data</span>
                            <div className="pc-page-btns">
                                <RowSizeSelect className="pc-filter-select" value={pageSizeRB} onChange={(size) => { setPageSizeRB(size); setPageRB(1); }} />
                                <button className="pc-page-btn" onClick={() => setPageRB(p => p - 1)} disabled={pageRB === 1}>&lt;</button>
                                {renderPages(pageRB, totalPagesRB, setPageRB)}
                                <button className="pc-page-btn" onClick={() => setPageRB(p => p + 1)} disabled={pageRB === totalPagesRB}>&gt;</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            </div>

            {/* ════ MODALS PETTY CASH ════ */}

            {/* Buat / Revisi PC */}
            {(modalBuat || modalRevisi) && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-modal-native-scroll">
                        <ModalHeader
                            icon={<Wallet size={18} />}
                            title={modalRevisi ? `Revisi - ${modalRevisi.no_pengajuan}` : 'Ajukan Petty Cash'}
                            subtitle="Isi data pengajuan, nominal, kebutuhan dana, dan lampiran bila ada."
                        />
                        {modalRevisi?.catatan_tolak && <div className="pc-rejection"><strong>Alasan ditolak:</strong> {modalRevisi.catatan_tolak}</div>}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Pengajuan">
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal *</label>
                                    <DatePicker selected={strToDate(formPC.tanggal)} onChange={d => setFormPC({ ...formPC, tanggal: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Nominal (Rp) *</label>
                                    <input className="pc-input" type="number" placeholder="0" value={formPC.nominal} onChange={e => setFormPC({ ...formPC, nominal: e.target.value })} />
                                    {Number(formPC.nominal) > 999999 && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Melebihi batas. Maksimal Rp 999.999</p>}
                                    {!formPC.nominal && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Maks. Rp 999.999</p>}
                                </div>
                            </div>
                            <div className="pc-field"><label className="pc-label">Keperluan *</label><textarea className="pc-textarea" placeholder="Jelaskan keperluan..." value={formPC.keperluan} onChange={e => setFormPC({ ...formPC, keperluan: e.target.value })} /></div>
                            <div className="pc-field"><label className="pc-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label><textarea className="pc-textarea" style={{ minHeight: 60 }} value={formPC.keterangan} onChange={e => setFormPC({ ...formPC, keterangan: e.target.value })} /></div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran">
                            <input ref={berkasRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => handleAttachmentChange(e, setBerkasPC, setBerkasPCInfo)} />
                            <FileUploadZone file={berkasPC} label="Lampirkan Berkas (opsional)" hint="PDF, JPG, atau PNG. Gambar otomatis dikompres." onPick={() => berkasRef.current.click()} />
                            <AttachmentPreview file={berkasPC} info={berkasPCInfo} onPreview={setImagePreview} />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBuat(false); setModalRevisi(null); setBerkasPC(null); setBerkasPCInfo(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={modalRevisi ? handleRevisiPC : handleBuatPC} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Detail PC */}
            {modalDetail && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <ModalHeader
                            icon={<ClipboardList size={18} />}
                            title="Detail Petty Cash"
                            subtitle="Ringkasan pengajuan, status proses, lampiran, dan laporan penggunaan dana."
                        />
                        <ModalSummary
                            label={modalDetail.no_pengajuan}
                            value={fmt(modalDetail.nominal)}
                            description={modalDetail.keperluan}
                            meta={`Tanggal pengajuan ${fmtTgl(modalDetail.tanggal)}`}
                            side={<StatusBadge cfg={PC_STATUS} status={modalDetail.status} />}
                        />
                        <StepTracker status={modalDetail.status} />
                        <ModalSection icon={<User size={14} />} title="Data Pengajuan">
                            <DetailGrid items={[
                                ['No. Pengajuan', modalDetail.no_pengajuan],
                                ['Tanggal', fmtTgl(modalDetail.tanggal)],
                                ['Nominal', fmt(modalDetail.nominal)],
                                ['Status', PC_STATUS[modalDetail.status]?.label],
                                ['Diajukan Oleh', modalDetail.created_by_name],
                                ['Disetujui Oleh', modalDetail.disetujui_oleh_name || '-'],
                                ['Dicairkan Oleh', modalDetail.dicairkan_oleh_name || '-'],
                            ]} />
                            <InfoBlock label="Keperluan" value={modalDetail.keperluan} />
                            {modalDetail.keterangan && <InfoBlock label="Keterangan" value={modalDetail.keterangan} />}
                            {modalDetail.catatan_tolak && <div className="pc-rejection"><strong>Catatan Tolak:</strong> {modalDetail.catatan_tolak}</div>}
                        </ModalSection>
                        {modalDetail.berkas_url && (
                            <ModalSection icon={<Paperclip size={14} />} title="Lampiran Pengajuan">
                                <ExistingAttachmentPreview url={modalDetail.berkas_url} label="Berkas Pengajuan" onPreview={setImagePreview} />
                            </ModalSection>
                        )}
                        {modalDetail.laporan && (
                            <ModalSection icon={<FileText size={14} />} title="Laporan Penggunaan">
                                <DetailGrid items={[
                                    ['Tgl Laporan', fmtTgl(modalDetail.laporan.tanggal_laporan)],
                                    ['Nominal Digunakan', fmt(modalDetail.laporan.nominal_digunakan)],
                                    ['Selisih / Kembalian', fmt(modalDetail.laporan.selisih)],
                                    ['Dikonfirmasi', modalDetail.laporan.dikonfirmasi_oleh_name || 'Belum'],
                                ]} />
                                <InfoBlock label="Rincian Penggunaan" value={modalDetail.laporan.rincian} />
                                {modalDetail.laporan.nota_url && <ExistingAttachmentPreview url={modalDetail.laporan.nota_url} label="Nota / Struk" onPreview={setImagePreview} />}
                            </ModalSection>
                        )}
                        <div className="pc-modal-footer"><button className="pc-btn-ghost" onClick={() => setModalDetail(null)}>Tutup</button></div>
                    </div>
                </div>, document.body
            )}

            {/* Approval PC */}
            {modalApproval && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Proses Pengajuan</h2>
                        <div className="pc-approval-summary">
                            <p className="pc-approval-no">{modalApproval.no_pengajuan}</p>
                            <p className="pc-approval-amount">{fmt(modalApproval.nominal)}</p>
                            <p className="pc-approval-desc">{modalApproval.keperluan}</p>
                        </div>
                        {/* Saldo warning */}
                        {canSeeSaldo && saldo && (
                            <div style={{ background: saldoNominal < Number(modalApproval.nominal) ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saldoNominal < Number(modalApproval.nominal) ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                                <span style={{ fontWeight: 600, color: saldoNominal < Number(modalApproval.nominal) ? '#991b1b' : '#166534' }}>
                                    {saldoNominal < Number(modalApproval.nominal)
                                        ? `Saldo tidak mencukupi. Saldo: ${fmt(saldoNominal)}, dibutuhkan: ${fmt(modalApproval.nominal)}`
                                        : `Saldo mencukupi. Sisa setelah approve: ${fmt(saldoNominal - Number(modalApproval.nominal))}`
                                    }
                                </span>
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalForm.aksi === 'setujui' ? ' active' : ''}`} style={{ opacity: canSeeSaldo && saldoNominal < Number(modalApproval.nominal) ? .4 : 1 }}>
                                    <input type="radio" name="aksi_pc" value="setujui" checked={approvalForm.aksi === 'setujui'}
                                        disabled={canSeeSaldo && saldoNominal < Number(modalApproval.nominal)}
                                        onChange={() => setApprovalForm({ ...approvalForm, aksi: 'setujui' })} /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input type="radio" name="aksi_pc" value="tolak" checked={approvalForm.aksi === 'tolak'} onChange={() => setApprovalForm({ ...approvalForm, aksi: 'tolak' })} /> <X size={15} /> Tolak
                                </label>
                            </div>
                            {canSeeSaldo && saldoNominal < Number(modalApproval.nominal) && (
                                <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Ajukan penambahan saldo terlebih dahulu untuk menyetujui pengajuan ini.</p>
                            )}
                        </div>
                        {approvalForm.aksi === 'tolak' && <div className="pc-field"><label className="pc-label">Catatan Tolak *</label><textarea className="pc-textarea" placeholder="Alasan penolakan..." value={approvalForm.catatan_tolak} onChange={e => setApprovalForm({ ...approvalForm, catatan_tolak: e.target.value })} /></div>}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApproval(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${approvalForm.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalPC} disabled={saving || (approvalForm.aksi === 'setujui' && canSeeSaldo && saldoNominal < Number(modalApproval.nominal))}>
                                {saving ? 'Memproses...' : approvalForm.aksi === 'setujui' ? 'Setujui Pengajuan' : 'Tolak Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Cairkan PC */}
            {modalCairkan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Cairkan Dana</h2>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 13, color: '#1d4ed8', marginBottom: 6 }}>Konfirmasi pencairan dana untuk:</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{modalCairkan.no_pengajuan}</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>{fmt(modalCairkan.nominal)}</p>
                            <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{modalCairkan.keperluan}</p>
                        </div>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Pastikan dana sudah diberikan kepada pengaju sebelum melanjutkan.</p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalCairkan(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary blue" onClick={handleCairkanPC} disabled={saving}>{saving ? 'Memproses...' : 'Konfirmasi Cairkan'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Upload Laporan */}
            {modalLaporan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal">
                        <ModalHeader
                            icon={<FileText size={18} />}
                            title="Upload Laporan Penggunaan"
                            subtitle="Isi realisasi dana, rincian penggunaan, dan unggah nota bila ada."
                        />
                        <ModalSummary
                            label="Dana yang dicairkan"
                            value={fmt(modalLaporan.nominal)}
                            description={modalLaporan.keperluan}
                            meta={modalLaporan.no_pengajuan}
                        />
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Laporan">
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Laporan *</label>
                                    <DatePicker selected={strToDate(formLaporan.tanggal_laporan)} onChange={d => setFormLaporan({ ...formLaporan, tanggal_laporan: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Nominal Digunakan (Rp) *</label>
                                    <input className="pc-input" type="number" placeholder="0" value={formLaporan.nominal_digunakan} onChange={e => setFormLaporan({ ...formLaporan, nominal_digunakan: e.target.value })} />
                                    {formLaporan.nominal_digunakan && (
                                        <p style={{ fontSize: 11, marginTop: 3 }}>
                                            Selisih kembalian: <strong style={{ color: Number(formLaporan.nominal_digunakan) <= Number(modalLaporan.nominal) ? '#166534' : '#dc2626' }}>
                                                {fmt(Number(modalLaporan.nominal) - Number(formLaporan.nominal_digunakan))}
                                            </strong>
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="pc-field"><label className="pc-label">Rincian Penggunaan *</label><textarea className="pc-textarea" style={{ minHeight: 100 }} placeholder="Jelaskan rincian penggunaan dana..." value={formLaporan.rincian} onChange={e => setFormLaporan({ ...formLaporan, rincian: e.target.value })} /></div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran Laporan">
                            <input ref={notaRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => handleAttachmentChange(e, setNotaFile, setNotaFileInfo)} />
                            <FileUploadZone file={notaFile} label="Upload Nota / Struk (opsional)" hint="PDF, JPG, atau PNG. Gambar otomatis dikompres." onPick={() => notaRef.current.click()} />
                            <AttachmentPreview file={notaFile} info={notaFileInfo} onPreview={setImagePreview} />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalLaporan(null); setNotaFile(null); setNotaFileInfo(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={handleLaporanPC} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit Laporan'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Konfirmasi Pengembalian */}
            {modalKonfirmasi && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Konfirmasi Pengembalian</h2>
                        {modalKonfirmasi.laporan && (
                            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div><p style={S.dk}>Dana Dicairkan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalKonfirmasi.nominal)}</p></div>
                                    <div><p style={S.dk}>Dana Digunakan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalKonfirmasi.laporan.nominal_digunakan)}</p></div>
                                </div>
                                <div style={{ padding: '10px 14px', background: Number(modalKonfirmasi.laporan.selisih) > 0 ? '#f0fdf4' : '#f8fafc', borderRadius: 8, border: `1px solid ${Number(modalKonfirmasi.laporan.selisih) > 0 ? '#86efac' : '#f1f5f9'}` }}>
                                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Kembalian ke Kasir</p>
                                    <p style={{ fontSize: 20, fontWeight: 700, color: Number(modalKonfirmasi.laporan.selisih) > 0 ? '#166534' : '#475569' }}>{fmt(modalKonfirmasi.laporan.selisih)}</p>
                                </div>
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
                            {Number(modalKonfirmasi.laporan?.selisih) > 0
                                ? 'Pastikan uang kembalian sudah diterima dari karyawan.'
                                : 'Tidak ada kembalian. Klik konfirmasi untuk menyelesaikan.'}
                        </p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalKonfirmasi(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={handleKonfirmasiPC} disabled={saving}>{saving ? 'Memproses...' : <><Check size={15} /> Konfirmasi Selesai</>}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Hapus PC */}
            {modalHapus && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Hapus Pengajuan</h2>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>Yakin ingin menghapus...</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{modalHapus.no_pengajuan}</p>
                            <p style={{ fontSize: 13, color: '#64748b' }}>{fmt(modalHapus.nominal)} - {modalHapus.keperluan}</p>
                        </div>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalHapus(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary danger" onClick={handleHapusPC} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* ════ MODALS REIMBURSEMENT ════ */}

            {/* Buat / Revisi RB */}
            {(modalBuatRB || modalRevisiRB) && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal">
                        <ModalHeader
                            icon={<Receipt size={18} />}
                            title={modalRevisiRB ? `Revisi - ${modalRevisiRB.no_reimbursement}` : 'Ajukan Reimbursement'}
                            subtitle="Isi data reimbursement, nominal pengeluaran, dan bukti transaksi."
                        />
                        {modalRevisiRB?.catatan_tolak && <div className="pc-rejection"><strong>Alasan ditolak:</strong> {modalRevisiRB.catatan_tolak}</div>}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Pengajuan">
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal *</label>
                                    <DatePicker selected={strToDate(formRB.tanggal)} onChange={d => setFormRB({ ...formRB, tanggal: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Nominal (Rp) *</label>
                                    <input className="pc-input" type="number" placeholder="0" value={formRB.nominal} onChange={e => setFormRB({ ...formRB, nominal: e.target.value })} />
                                    {Number(formRB.nominal) > 999999 && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Melebihi batas. Maksimal Rp 999.999</p>}
                                    {!formRB.nominal && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Maks. Rp 999.999</p>}
                                </div>
                            </div>
                            <div className="pc-field"><label className="pc-label">Keperluan *</label><textarea className="pc-textarea" placeholder="Jelaskan keperluan reimbursement..." value={formRB.keperluan} onChange={e => setFormRB({ ...formRB, keperluan: e.target.value })} /></div>
                            <div className="pc-field"><label className="pc-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label><textarea className="pc-textarea" style={{ minHeight: 60 }} value={formRB.keterangan} onChange={e => setFormRB({ ...formRB, keterangan: e.target.value })} /></div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran">
                            <input ref={berkasRBRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => handleAttachmentChange(e, setBerkasRB, setBerkasRBInfo)} />
                            <FileUploadZone file={berkasRB} label="Upload Bukti Pengeluaran (wajib)" hint="PDF, JPG, atau PNG. Gambar otomatis dikompres." onPick={() => berkasRBRef.current.click()} />
                            <AttachmentPreview file={berkasRB} info={berkasRBInfo} onPreview={setImagePreview} />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBuatRB(false); setModalRevisiRB(null); setBerkasRB(null); setBerkasRBInfo(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={modalRevisiRB ? handleRevisiRB : handleBuatRB} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Detail RB */}
            {modalDetailRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <ModalHeader
                            icon={<Receipt size={18} />}
                            title="Detail Reimbursement"
                            subtitle="Ringkasan reimbursement, status proses, dan bukti pengeluaran."
                        />
                        <ModalSummary
                            label={modalDetailRB.no_reimbursement}
                            value={fmt(modalDetailRB.nominal)}
                            description={modalDetailRB.keperluan}
                            meta={`Tanggal pengajuan ${fmtTgl(modalDetailRB.tanggal)}`}
                            side={<StatusBadge cfg={RB_STATUS} status={modalDetailRB.status} />}
                        />
                        <ModalSection icon={<User size={14} />} title="Data Pengajuan">
                            <DetailGrid items={[
                                ['No. Reimburse', modalDetailRB.no_reimbursement],
                                ['Tanggal', fmtTgl(modalDetailRB.tanggal)],
                                ['Nominal', fmt(modalDetailRB.nominal)],
                                ['Status', RB_STATUS[modalDetailRB.status]?.label],
                                ['Diajukan Oleh', modalDetailRB.created_by_name],
                                ['Disetujui Oleh', modalDetailRB.disetujui_oleh_name || '-'],
                                ['Dicairkan Oleh', modalDetailRB.dicairkan_oleh_name || '-'],
                            ]} />
                            <InfoBlock label="Keperluan" value={modalDetailRB.keperluan} />
                            {modalDetailRB.keterangan && <InfoBlock label="Keterangan" value={modalDetailRB.keterangan} />}
                            {modalDetailRB.catatan_tolak && <div className="pc-rejection"><strong>Catatan Tolak:</strong> {modalDetailRB.catatan_tolak}</div>}
                        </ModalSection>
                        {modalDetailRB.berkas_url && (
                            <ModalSection icon={<Paperclip size={14} />} title="Lampiran Pengajuan">
                                <ExistingAttachmentPreview url={modalDetailRB.berkas_url} label="Bukti Pengeluaran" onPreview={setImagePreview} />
                            </ModalSection>
                        )}
                        <div className="pc-modal-footer"><button className="pc-btn-ghost" onClick={() => setModalDetailRB(null)}>Tutup</button></div>
                    </div>
                </div>, document.body
            )}

            {/* Approval RB */}
            {modalApprovalRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Proses Reimbursement</h2>
                        <div className="pc-approval-summary">
                            <p className="pc-approval-no">{modalApprovalRB.no_reimbursement}</p>
                            <p className="pc-approval-amount">{fmt(modalApprovalRB.nominal)}</p>
                            <p className="pc-approval-desc">{modalApprovalRB.keperluan}</p>
                        </div>
                        {/* Saldo warning */}
                        {canSeeSaldo && saldo && (
                            <div style={{ background: saldoNominal < Number(modalApprovalRB.nominal) ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saldoNominal < Number(modalApprovalRB.nominal) ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                                <span style={{ fontWeight: 600, color: saldoNominal < Number(modalApprovalRB.nominal) ? '#991b1b' : '#166534' }}>
                                    {saldoNominal < Number(modalApprovalRB.nominal)
                                        ? `Saldo tidak mencukupi. Saldo: ${fmt(saldoNominal)}, dibutuhkan: ${fmt(modalApprovalRB.nominal)}`
                                        : `Saldo mencukupi. Sisa setelah cairkan: ${fmt(saldoNominal - Number(modalApprovalRB.nominal))}`
                                    }
                                </span>
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalRBForm.aksi === 'setujui' ? ' active' : ''}`} style={{ opacity: canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal) ? .4 : 1 }}>
                                    <input type="radio" name="aksi_rb" value="setujui" checked={approvalRBForm.aksi === 'setujui'}
                                        disabled={canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal)}
                                        onChange={() => setApprovalRBForm({ ...approvalRBForm, aksi: 'setujui' })} /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalRBForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input type="radio" name="aksi_rb" value="tolak" checked={approvalRBForm.aksi === 'tolak'} onChange={() => setApprovalRBForm({ ...approvalRBForm, aksi: 'tolak' })} /> <X size={15} /> Tolak
                                </label>
                            </div>
                            {canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal) && (
                                <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Ajukan penambahan saldo terlebih dahulu untuk menyetujui reimbursement ini.</p>
                            )}
                        </div>
                        {approvalRBForm.aksi === 'tolak' && <div className="pc-field"><label className="pc-label">Catatan Tolak *</label><textarea className="pc-textarea" placeholder="Alasan penolakan..." value={approvalRBForm.catatan_tolak} onChange={e => setApprovalRBForm({ ...approvalRBForm, catatan_tolak: e.target.value })} /></div>}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApprovalRB(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${approvalRBForm.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalRB}
                                disabled={saving || (approvalRBForm.aksi === 'setujui' && canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal))}>
                                {saving ? 'Memproses...' : approvalRBForm.aksi === 'setujui' ? 'Setujui Reimbursement' : 'Tolak Reimbursement'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Cairkan RB */}
            {modalCairkanRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Cairkan Reimbursement</h2>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 13, color: '#1d4ed8', marginBottom: 6 }}>Konfirmasi pembayaran reimbursement:</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{modalCairkanRB.no_reimbursement}</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>{fmt(modalCairkanRB.nominal)}</p>
                        </div>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Pastikan pembayaran sudah dilakukan sebelum melanjutkan.</p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalCairkanRB(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary blue" onClick={handleCairkanRB} disabled={saving}>{saving ? 'Memproses...' : 'Konfirmasi Cairkan'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Hapus RB */}
            {modalHapusRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Hapus Reimbursement</h2>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>Yakin ingin menghapus...</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{modalHapusRB.no_reimbursement}</p>
                            <p style={{ fontSize: 13, color: '#64748b' }}>{fmt(modalHapusRB.nominal)}</p>
                        </div>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalHapusRB(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary danger" onClick={handleHapusRB} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* ════ MODALS SALDO ════ */}

            {/* Modal Riwayat & Penambahan Saldo */}
            {modalSaldo && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-saldo-modal">
                        <div className="pc-saldo-modal-body">
                            <div className="pc-saldo-head">
                                <div className="pc-saldo-title">
                                    <span className="pc-modal-title-icon"><ClipboardList size={18} /></span>
                                    <div>
                                        <h2>Saldo Petty Cash</h2>
                                        <p>Pengajuan penambahan dan riwayat perubahan saldo.</p>
                                    </div>
                                </div>
                                <button className="pc-btn-ghost" onClick={() => setModalSaldo(false)}>Tutup</button>
                            </div>

                            <div className="pc-saldo-dashboard">
                                <div className="pc-saldo-balance">
                                    <p className="pc-saldo-balance-label">Saldo Saat Ini</p>
                                    <p className="pc-saldo-balance-value">{fmt(saldoNominal)}</p>
                                    <p className="pc-saldo-balance-note">
                                        {saldoKritis ? 'Saldo sudah di bawah batas aman.' : 'Saldo masih dalam kondisi aman.'}
                                    </p>
                                </div>
                                <div className="pc-saldo-kpi">
                                    <p className="pc-saldo-kpi-label">Menunggu</p>
                                    <p className="pc-saldo-kpi-value">{saldoStats.pending}</p>
                                    <small>Pengajuan perlu diproses</small>
                                </div>
                                <div className="pc-saldo-kpi">
                                    <p className="pc-saldo-kpi-label">Masuk</p>
                                    <p className="pc-saldo-kpi-value">{fmt(saldoTotalMasuk)}</p>
                                    <small>Dari 20 riwayat terakhir</small>
                                </div>
                                <div className="pc-saldo-kpi">
                                    <p className="pc-saldo-kpi-label">Keluar</p>
                                    <p className="pc-saldo-kpi-value">{fmt(saldoTotalKeluar)}</p>
                                    <small>Dari 20 riwayat terakhir</small>
                                </div>
                            </div>

                            <section className="pc-saldo-section">
                                <div className="pc-saldo-section-head">
                                    <div>
                                        <p className="pc-saldo-section-title"><Plus size={15} /> Pengajuan Penambahan Saldo</p>
                                        <p className="pc-saldo-section-sub">Daftar permintaan top up saldo petty cash.</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                        <span className="pc-saldo-badge pending">{saldoStats.pending} Menunggu</span>
                                        <span className="pc-saldo-badge disetujui">{saldoStats.disetujui} Disetujui</span>
                                        <span className="pc-saldo-badge ditolak">{saldoStats.ditolak} Ditolak</span>
                                    </div>
                                </div>
                                {listPenambahan.length === 0 ? (
                                    <div className="pc-saldo-empty">Belum ada pengajuan penambahan saldo.</div>
                                ) : (
                                    <div className="pc-saldo-table-wrap">
                                        <table className="pc-saldo-table">
                                            <thead>
                                                <tr>
                                                    <th>No Pengajuan</th>
                                                    <th>Tanggal</th>
                                                    <th>Pemohon</th>
                                                    <th>Alasan</th>
                                                    <th>Nominal</th>
                                                    <th>Status</th>
                                                    <th>Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {listPenambahan.map(item => (
                                                    <tr key={item.id}>
                                                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1a4731' }}>{item.no_pengajuan}</td>
                                                        <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtTgl(item.tanggal)}</td>
                                                        <td>
                                                            <div className="pc-saldo-actor">
                                                                <strong>{item.created_by_name || 'Tidak diketahui'}</strong>
                                                                <span>{item.created_by_unit || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.alasan}>{item.alasan || '-'}</td>
                                                        <td style={{ fontWeight: 800, color: '#1a4731', whiteSpace: 'nowrap' }}>{item.nominal_diajukan ? fmt(item.nominal_diajukan) : '-'}</td>
                                                        <td>
                                                            <span className={`pc-saldo-badge ${item.status || 'pending'}`}>
                                                                {penambahanStatusLabel(item.status)}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            {isDirekturWadir && item.status === 'pending' ? (
                                                                <button className="pc-btn-sm g" onClick={() => { setFormApvSaldo({ aksi: 'setujui', nominal_diajukan: '', catatan_tolak: '' }); resetError(); setModalApprovalSaldo(item); }}>Proses</button>
                                                            ) : (
                                                                <span style={{ color: '#94a3b8' }}>-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            <section className="pc-saldo-section">
                                <div className="pc-saldo-section-head">
                                    <div>
                                        <p className="pc-saldo-section-title"><History size={15} /> Riwayat Perubahan Saldo</p>
                                        <p className="pc-saldo-section-sub">Nama dan unit memakai pemohon transaksi, bukan hanya akun yang memproses.</p>
                                    </div>
                                </div>
                                {riwayatSaldo.length === 0 ? (
                                    <div className="pc-saldo-empty">Belum ada riwayat perubahan saldo.</div>
                                ) : (
                                    <div className="pc-saldo-table-wrap" style={{ maxHeight: 330 }}>
                                        <table className="pc-saldo-table">
                                            <thead>
                                                <tr>
                                                    <th>Waktu</th>
                                                    <th>Jenis</th>
                                                    <th>Jumlah</th>
                                                    <th>Nama / Unit</th>
                                                    <th>Saldo Sesudah</th>
                                                    <th>Keterangan</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedRiwayatSaldo.map((r, i) => {
                                                    const actor = saldoActor(r);
                                                    return (
                                                        <tr key={r.id || i}>
                                                            <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDT(r.created_at)}</td>
                                                            <td>
                                                                <span className={`pc-saldo-badge ${r.jenis === 'penambahan' ? 'disetujui' : 'ditolak'}`}>
                                                                    {r.jenis === 'penambahan' ? 'Tambah' : 'Kurang'}
                                                                </span>
                                                            </td>
                                                            <td style={{ fontWeight: 800, color: r.jenis === 'penambahan' ? '#166534' : '#dc2626', whiteSpace: 'nowrap' }}>
                                                                {r.jenis === 'penambahan' ? '+' : '-'}{fmt(r.jumlah)}
                                                            </td>
                                                            <td>
                                                                <div className="pc-saldo-actor" title={`${actor.nama}${actor.unit ? ` - ${actor.unit}` : ''}`}>
                                                                    <strong>{actor.nama}</strong>
                                                                    <span>{actor.unit || '-'}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.saldo_sesudah)}</td>
                                                            <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }} title={r.keterangan || ''}>{r.keterangan || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {riwayatSaldo.length > RIWAYAT_SALDO_PER_PAGE && (
                                    <div className="pc-pagination">
                                        <span className="pc-page-info">
                                            Menampilkan {(riwayatSaldoPage - 1) * RIWAYAT_SALDO_PER_PAGE + 1}-{Math.min(riwayatSaldoPage * RIWAYAT_SALDO_PER_PAGE, riwayatSaldo.length)} dari {riwayatSaldo.length} riwayat
                                        </span>
                                        <div className="pc-page-btns">
                                            <button className="pc-page-btn" disabled={riwayatSaldoPage === 1} onClick={() => setRiwayatSaldoPage(p => Math.max(1, p - 1))}>&lt;</button>
                                            {renderPages(riwayatSaldoPage, totalRiwayatSaldoPages, setRiwayatSaldoPage)}
                                            <button className="pc-page-btn" disabled={riwayatSaldoPage === totalRiwayatSaldoPages} onClick={() => setRiwayatSaldoPage(p => Math.min(totalRiwayatSaldoPages, p + 1))}>&gt;</button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Modal Ajukan Penambahan Saldo */}
            {modalAjukanSaldo && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal">
                        <h2 style={S.mt}>Ajukan Penambahan Saldo</h2>
                        <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Saldo saat ini</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: saldoKritis ? '#dc2626' : '#1a4731' }}>{fmt(saldoNominal)}</p>
                            {saldoKritis && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Saldo menipis</p>}
                        </div>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Riwayat penggunaan petty cash akan otomatis dilampirkan sebagai data pendukung untuk direktur.</p>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Tanggal *</label>
                            <DatePicker selected={strToDate(formSaldo.tanggal)} onChange={d => setFormSaldo({ ...formSaldo, tanggal: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                        </div>
                        <div className="pc-field">
                            <label className="pc-label">Alasan Pengajuan *</label>
                            <textarea className="pc-textarea" style={{ minHeight: 100 }} placeholder="Jelaskan alasan mengapa saldo perlu ditambah..." value={formSaldo.alasan} onChange={e => setFormSaldo({ ...formSaldo, alasan: e.target.value })} />
                        </div>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalAjukanSaldo(false); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={handleAjukanSaldo} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit Pengajuan'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Modal Approval Saldo */}
            {modalApprovalSaldo && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-approval-saldo">
                        <div className="pc-approval-body">
                            <div className="pc-approval-head">
                                <div className="pc-approval-title">
                                    <span className="pc-modal-title-icon"><Wallet size={18} /></span>
                                    <div>
                                        <h2>Proses Penambahan Saldo</h2>
                                        <p>Review pengajuan dan pemakaian saldo sejak top up terakhir.</p>
                                    </div>
                                </div>
                                <button className="pc-btn-ghost" onClick={() => { setModalApprovalSaldo(null); resetError(); }}>Tutup</button>
                            </div>

                            <div className="pc-approval-grid">
                                <section className="pc-approval-card">
                                    <div className="pc-approval-card-head">
                                        <p className="pc-approval-card-title"><FileText size={15} /> Detail Pengajuan</p>
                                    </div>
                                    <div className="pc-approval-content">
                                        <div className="pc-approval-request">
                                            <div className="pc-approval-row">
                                                <div>
                                                    <p className="pc-approval-no">{modalApprovalSaldo.no_pengajuan}</p>
                                                    <p className="pc-approval-meta">{fmtTgl(modalApprovalSaldo.tanggal)}</p>
                                                </div>
                                                <span className="pc-saldo-badge pending">Menunggu</span>
                                            </div>
                                            <div className="pc-approval-user">
                                                <div className="pc-approval-avatar"><User size={16} /></div>
                                                <div>
                                                    <strong>{modalApprovalSaldo.created_by_name || 'Tidak diketahui'}</strong>
                                                    <span>{modalApprovalSaldo.created_by_unit || '-'}</span>
                                                </div>
                                            </div>
                                            <p className="pc-approval-note">{modalApprovalSaldo.alasan || '-'}</p>
                                        </div>

                                        {error && <div className="pc-alert-err">{error}</div>}

                                        <div className="pc-field">
                                            <label className="pc-label">Keputusan</label>
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <label className={`pc-radio-card approve${formApvSaldo.aksi === 'setujui' ? ' active' : ''}`}>
                                                    <input type="radio" name="aksi_saldo" value="setujui" checked={formApvSaldo.aksi === 'setujui'} onChange={() => setFormApvSaldo({ ...formApvSaldo, aksi: 'setujui' })} /> <Check size={15} /> Setujui
                                                </label>
                                                <label className={`pc-radio-card reject${formApvSaldo.aksi === 'tolak' ? ' active' : ''}`}>
                                                    <input type="radio" name="aksi_saldo" value="tolak" checked={formApvSaldo.aksi === 'tolak'} onChange={() => setFormApvSaldo({ ...formApvSaldo, aksi: 'tolak' })} /> <X size={15} /> Tolak
                                                </label>
                                            </div>
                                        </div>

                                        {formApvSaldo.aksi === 'setujui' && (
                                            <>
                                                <div className="pc-field">
                                                    <label className="pc-label">Nominal Penambahan (Rp) *</label>
                                                    <input className="pc-input" type="number" placeholder="0" value={formApvSaldo.nominal_diajukan} onChange={e => setFormApvSaldo({ ...formApvSaldo, nominal_diajukan: e.target.value })} />
                                                </div>
                                                <div className="pc-approval-result">
                                                    <strong>Simulasi saldo setelah disetujui</strong>
                                                    <p>{fmt(approvalSaldoAfter)}</p>
                                                    <span style={{ display: 'block', fontSize: 12, color: '#819189', marginTop: 6 }}>Saldo saat ini {fmt(saldoNominal)}</span>
                                                </div>
                                            </>
                                        )}

                                        {formApvSaldo.aksi === 'tolak' && (
                                            <div className="pc-field">
                                                <label className="pc-label">Catatan Tolak *</label>
                                                <textarea className="pc-textarea" placeholder="Alasan penolakan..." value={formApvSaldo.catatan_tolak} onChange={e => setFormApvSaldo({ ...formApvSaldo, catatan_tolak: e.target.value })} />
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="pc-approval-card">
                                    <div className="pc-approval-card-head">
                                        <p className="pc-approval-card-title"><History size={15} /> Pemakaian Sejak Top Up Terakhir</p>
                                        <p className="pc-saldo-section-sub">
                                            {modalApprovalSaldo.riwayat_snapshot_start
                                                ? `Sejak ${fmtDT(modalApprovalSaldo.riwayat_snapshot_start)}`
                                                : 'Belum ada penambahan saldo sebelumnya'}
                                        </p>
                                    </div>
                                    <div className="pc-usage-summary">
                                        <div className="pc-usage-kpi"><span>Transaksi</span><strong>{modalApprovalSaldo.riwayat_snapshot?.length || 0}</strong></div>
                                        <div className="pc-usage-kpi"><span>Total Terpakai</span><strong>{fmt(approvalUsageTotal)}</strong></div>
                                        <div className="pc-usage-kpi"><span>Saldo Saat Ini</span><strong>{fmt(saldoNominal)}</strong></div>
                                    </div>

                                    {!modalApprovalSaldo.riwayat_snapshot?.length ? (
                                        <div className="pc-saldo-empty">Belum ada pemakaian saldo sejak top up terakhir.</div>
                                    ) : (
                                        <div className="pc-usage-table-wrap">
                                            <table className="pc-usage-table">
                                                <thead>
                                                    <tr>
                                                        <th>Waktu</th>
                                                        <th>Pemohon</th>
                                                        <th>Jumlah</th>
                                                        <th>Saldo Sesudah</th>
                                                        <th>Keterangan</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modalApprovalSaldo.riwayat_snapshot.map((r, i) => {
                                                        const actor = saldoActor(r);
                                                        return (
                                                            <tr key={r.id || i}>
                                                                <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDT(r.created_at)}</td>
                                                                <td>
                                                                    <div className="pc-saldo-actor" title={`${actor.nama}${actor.unit ? ` - ${actor.unit}` : ''}`}>
                                                                        <strong>{actor.nama}</strong>
                                                                        <span>{actor.unit || '-'}</span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>-{fmt(r.jumlah)}</td>
                                                                <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.saldo_sesudah)}</td>
                                                                <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }} title={r.keterangan || ''}>{r.keterangan || '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>

                        <div className="pc-approval-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApprovalSaldo(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${formApvSaldo.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalSaldo} disabled={saving}>
                                {saving ? 'Memproses...' : formApvSaldo.aksi === 'setujui' ? 'Setujui & Tambah Saldo' : 'Tolak Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}
            {imagePreview && createPortal(
                <div className="pc-overlay" onClick={() => setImagePreview(null)} style={{ backdropFilter: 'blur(4px)', padding: '20px' }}>
                    <div style={{ position: 'relative', width: 'min(95vw, 95vh)', height: 'min(95vh, 95vw)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <img src={imagePreview} alt="Preview berkas" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: '8px' }} />
                        <button style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s' }} onMouseEnter={e => e.target.style.background = 'rgba(0,0,0,0.4)'} onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.2)'} onClick={() => setImagePreview(null)}>x</button>
                    </div>
                </div>, document.body
            )}
        </div>
    );
}

function isImageFile(file) {
    return file?.type?.startsWith('image/');
}

function isImageUrl(url) {
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url || '');
}

function FileUploadZone({ file, label, hint, onPick }) {
    return (
        <div className={`pc-file-zone${file ? ' has' : ''}`}>
            <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: file ? '#166534' : '#475569', marginBottom: 2 }}>
                    {file ? file.name : label}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</p>
            </div>
            <span className="pc-file-pick" onClick={onPick}>{file ? 'Ganti' : 'Pilih File'}</span>
        </div>
    );
}

function ModalHeader({ icon, title, subtitle }) {
    return (
        <div className="pc-modal-head">
            <span className="pc-modal-title-icon">{icon}</span>
            <div className="pc-modal-head-copy">
                <h2 className="pc-modal-head-title">{title}</h2>
                {subtitle && <p className="pc-modal-head-subtitle">{subtitle}</p>}
            </div>
        </div>
    );
}

function ModalSummary({ label, value, description, meta, side }) {
    return (
        <div className="pc-modal-summary">
            <div>
                <p className="pc-modal-summary-label">{label}</p>
                <p className="pc-modal-summary-value">{value}</p>
                {description && <p className="pc-modal-summary-desc">{description}</p>}
                {meta && <p className="pc-modal-summary-meta">{meta}</p>}
            </div>
            {side}
        </div>
    );
}

function ModalSection({ icon, title, children }) {
    return (
        <section className="pc-modal-section">
            {title && <p className="pc-modal-section-title">{icon}{title}</p>}
            {children}
        </section>
    );
}

function DetailGrid({ items }) {
    return (
        <div className="pc-detail-grid">
            {items.map(([label, value]) => (
                <div className="pc-detail-item" key={label}>
                    <p className="pc-detail-label">{label}</p>
                    <p className="pc-detail-value">{value}</p>
                </div>
            ))}
        </div>
    );
}

function AttachmentPreview({ file, info, onPreview }) {
    const url = useMemo(() => {
        if (!file || !isImageFile(file)) return '';
        return URL.createObjectURL(file);
    }, [file]);

    useEffect(() => {
        if (!url) return undefined;
        return () => URL.revokeObjectURL(url);
    }, [url]);

    if (!file) return null;

    return (
        <div className="pc-upload-preview">
            {url ? (
                <img className="pc-upload-thumb" src={url} alt={file.name} onClick={() => onPreview(url)} />
            ) : (
                <div className="pc-upload-doc"><Paperclip size={20} /></div>
            )}
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{info?.name || file.name}</p>
                <p className="pc-upload-info">
                    {info?.compressed
                        ? `${info.originalSize} -> ${info.compressedSize} (${info.reduction}% lebih kecil)`
                        : `${formatFileSize(file.size)} - tidak dikompres`}
                </p>
            </div>
            {url && <button className="pc-btn-sm n" type="button" onClick={() => onPreview(url)}>Preview</button>}
        </div>
    );
}

function ExistingAttachmentPreview({ url, label, onPreview }) {
    if (!url) return null;
    if (isImageUrl(url)) {
        return (
            <div className="pc-upload-preview">
                <img className="pc-upload-thumb" src={url} alt={label} onClick={() => onPreview(url)} />
                <div className="pc-upload-meta">
                    <p className="pc-upload-name">{label}</p>
                    <p className="pc-upload-info">Klik preview untuk melihat foto tanpa membuka tab baru.</p>
                </div>
                <button className="pc-btn-sm n" type="button" onClick={() => onPreview(url)}>Preview</button>
            </div>
        );
    }
    return <a href={url} target="_blank" rel="noreferrer" className="pc-form-link"><Paperclip size={15} /> Lihat {label}</a>;
}

function StatusBadge({ cfg, status }) {
    const s = cfg[status] || { label: status, bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.color, fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />{s.label}
        </span>
    );
}

function InfoBlock({ label, value }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.6 }}>{value}</p>
        </div>
    );
}

const S = {
    mt: { fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 24 },
    dk: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
    dv: { fontSize: 14, color: '#1e293b', fontWeight: 500 },
};
