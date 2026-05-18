import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useToastState } from '../../context/ToastContext';
import { createPortal } from 'react-dom';
import { Car, Bike, Ambulance, Truck, Bus, Navigation, Droplet, Wrench, MapPin, Plus, Search, CalendarDays, X, Clock, DollarSign, Check, BookOpen, Camera } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { id } from 'date-fns/locale';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';

/* -- Helpers -- */
const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtTgl = (s) => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const dateToStr = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
const strToDate = (s) => s ? new Date(s) : null;

const JENIS_KENDARAAN = {
    mobil: { label: 'Mobil', Icon: Car, color: '#1d4ed8', bg: '#eff6ff' },
    motor: { label: 'Motor', Icon: Bike, color: '#7c3aed', bg: '#f5f3ff' },
    ambulans: { label: 'Ambulans', Icon: Ambulance, color: '#dc2626', bg: '#fee2e2' },
    pickup: { label: 'Pickup', Icon: Truck, color: '#92400e', bg: '#fef3c7' },
    bus: { label: 'Bus', Icon: Bus, color: '#166534', bg: '#dcfce7' },
    lainnya: { label: 'Lainnya', Icon: Car, color: '#475569', bg: '#f1f5f9' },
};

const JENIS_MAINTENANCE = [
    { value: 'servis_rutin', label: 'Servis Rutin' },
    { value: 'ganti_oli', label: 'Ganti Oli' },
    { value: 'ban', label: 'Ganti / Tambal Ban' },
    { value: 'aki', label: 'Ganti Aki' },
    { value: 'rem', label: 'Perbaikan Rem' },
    { value: 'ac', label: 'Servis AC' },
    { value: 'body', label: 'Perbaikan Body' },
    { value: 'lainnya', label: 'Lainnya' },
];

/* -- CSS -- */
const IZIN_STEPS = [
    { key: 'pending', label: 'Ajukan Izin' },
    { key: 'disetujui', label: 'Disetujui' },
    { key: 'log_diisi', label: 'Isi Log Perjalanan' },
    { key: 'selesai', label: 'Selesai' },
];
const IZIN_ORDER = ['pending', 'disetujui', 'log_diisi', 'selesai'];

const CSS = `
@keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
@keyframes slideUp  { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }

.dr-page { animation: fadeInUp .4s ease both; }
.dr-shell { display:flex; flex-direction:column; gap:20px; }
.dr-tr   { animation: fadeInUp .3s ease both; }

.dr-input, .dr-select, .dr-textarea {
    width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px;
    font-size:14px; font-family:'Plus Jakarta Sans',sans-serif;
    color:#1e293b; background:#fff; outline:none;
    transition:border-color .15s,box-shadow .15s; box-sizing:border-box;
}
.dr-input:focus,.dr-select:focus,.dr-textarea:focus { border-color:#2d6a4f; box-shadow:0 0 0 3px rgba(45,106,79,.08); }
.dr-textarea { resize:vertical; min-height:72px; line-height:1.55; }

.dr-btn-primary {
    padding:10px 18px; background:#1a4731; color:#fff; border:none; border-radius:10px;
    font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif;
    transition:background .15s,transform .1s,box-shadow .15s; display:inline-flex; align-items:center; justify-content:center; gap:8px; white-space:nowrap;
    box-shadow:0 8px 20px rgba(26,71,49,.18);
}
.dr-btn-primary:hover { background:#153d28; transform:translateY(-1px); box-shadow:0 12px 26px rgba(26,71,49,.24); }
.dr-btn-primary:disabled { opacity:.55; cursor:not-allowed; transform:none; }
.dr-btn-primary.danger { background:#dc2626; } .dr-btn-primary.danger:hover { background:#b91c1c; }
.dr-btn-ghost { padding:10px 20px; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; transition:background .15s; }
.dr-btn-ghost:hover { background:#e2e8f0; }
.dr-btn-sm { padding:5px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid; font-family:'Plus Jakarta Sans',sans-serif; transition:background .14s,transform .1s; white-space:nowrap; }
.dr-btn-sm:hover { transform:translateY(-1px); }
.dr-btn-sm.n { border-color:#e2e8f0; color:#475569; background:#fff; } .dr-btn-sm.n:hover { background:#f8fafc; }
.dr-btn-sm.r { border-color:#fca5a5; color:#dc2626; background:#fff; } .dr-btn-sm.r:hover { background:#fee2e2; }
.dr-btn-sm.b { border-color:#93c5fd; color:#1d4ed8; background:#fff; } .dr-btn-sm.b:hover { background:#eff6ff; }

.dr-table { width:100%; border-collapse:separate; border-spacing:0; min-width:760px; }
.dr-table thead th { padding:12px 16px; text-align:left; font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
.dr-table tbody td { padding:13px 16px; font-size:13px; color:#334155; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
.dr-table tbody tr:last-child td { border-bottom:none; }
.dr-table tbody tr:hover td { background:#f8fafc; }

.dr-overlay { position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:9999; animation:fadeIn .18s ease; backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); }
.dr-modal { background:#fff; border-radius:16px; padding:32px; width:100%; max-width:560px; max-height:90vh; overflow-y:auto; box-shadow:0 8px 40px rgba(0,0,0,.18); animation:slideUp .22s ease; }
.dr-modal.sm { max-width:420px; } .dr-modal.lg { max-width:780px; }

.dr-field { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
.dr-label { font-size:13px; font-weight:600; color:#475569; }
.dr-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.dr-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
.dr-modal-footer { display:flex; gap:12px; justify-content:flex-end; padding-top:16px; border-top:1px solid #f1f5f9; }
.dr-modal-head{display:flex;align-items:flex-start;gap:12px;margin:0 0 18px}
.dr-modal-head-icon{width:38px;height:38px;border-radius:12px;background:#e7f4ed;color:#1a4731;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.dr-modal-head-copy{min-width:0;flex:1}
.dr-modal-head-title{margin:0;color:#13251b;font-size:20px;font-weight:800;letter-spacing:0;line-height:1.25}
.dr-modal-head-subtitle{margin:4px 0 0;color:#64748b;font-size:12.5px;line-height:1.55}
.dr-modal-summary{background:linear-gradient(135deg,#f8fafc,#fff);border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;margin-bottom:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}
.dr-modal-summary-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#819189;margin:0 0 7px}
.dr-modal-summary-value{font-size:24px;font-weight:800;color:#17251d;line-height:1;margin:0}
.dr-modal-summary-desc{font-size:13px;color:#64748b;line-height:1.55;margin:9px 0 0}
.dr-modal-summary-meta{font-size:12px;color:#8aa097;margin:7px 0 0}
.dr-modal-section{border:1px solid #e7eef3;background:#fff;border-radius:16px;padding:16px 18px;margin-bottom:16px}
.dr-modal-section-title{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;font-weight:800;color:#17251d;text-transform:uppercase;letter-spacing:.045em}
.dr-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;margin-bottom:16px}
.dr-detail-label{font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px}
.dr-detail-value{font-size:14px;color:#1e293b;line-height:1.55;font-weight:600;margin:0;word-break:break-word}
.dr-alert-ok  { background:#dcfce7; border:1px solid #86efac; border-radius:8px; color:#166534; padding:12px 16px; font-size:14px; margin-bottom:16px; }
.dr-alert-err { background:#fee2e2; border:1px solid #fca5a5; border-radius:8px; color:#991b1b; padding:12px 16px; font-size:14px; margin-bottom:16px; }

.dr-hero {
    display:flex; align-items:stretch; justify-content:space-between; gap:18px;
    padding:24px; border-radius:22px; border:1px solid #dbeafe;
    background:linear-gradient(135deg,#f8fafc 0%,#ecfdf5 48%,#eff6ff 100%);
    box-shadow:0 18px 44px rgba(15,23,42,.08); overflow:hidden; position:relative;
}
.dr-hero:before { content:''; position:absolute; right:-90px; top:-120px; width:260px; height:260px; border-radius:50%; background:rgba(45,106,79,.12); filter:blur(2px); }
.dr-hero-main { position:relative; z-index:1; max-width:720px; }
.dr-eyebrow { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:#fff; border:1px solid #dcfce7; color:#166534; font-size:12px; font-weight:800; margin-bottom:12px; }
.dr-title { margin:0; font-size:30px; line-height:1.12; color:#102317; font-weight:800; letter-spacing:0; }
.dr-subtitle { margin:8px 0 0; color:#64748b; font-size:14px; line-height:1.7; max-width:620px; }
.dr-hero-actions { position:relative; z-index:1; display:flex; align-items:flex-start; justify-content:flex-end; gap:10px; flex-wrap:wrap; min-width:210px; }

.dr-stat-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
.dr-stat { background:#fff; border-radius:16px; padding:18px; box-shadow:0 10px 28px rgba(15,23,42,.06); border:1px solid #edf2f7; animation:fadeInUp .35s ease both; position:relative; overflow:hidden; }
.dr-stat:after { content:''; position:absolute; inset:auto 14px 0 14px; height:3px; border-radius:99px 99px 0 0; background:var(--accent,#1a4731); opacity:.8; }
.dr-stat-top { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
.dr-stat-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; background:var(--accent-bg,#f1f5f9); color:var(--accent,#1a4731); }
.dr-stat-label { margin:0; font-size:12px; color:#64748b; font-weight:700; }
.dr-stat-value { margin:0; font-size:20px; font-weight:800; color:#172554; }

.dr-tabs { display:flex; gap:6px; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:6px; flex-wrap:wrap; box-shadow:0 8px 26px rgba(15,23,42,.05); }
.dr-tab  { padding:10px 16px; border:none; border-radius:11px; font-size:13px; font-weight:700; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; background:transparent; color:#64748b; transition:background .15s,color .15s,box-shadow .15s,transform .1s; outline:none; white-space:nowrap; display:flex; align-items:center; gap:8px; }
.dr-tab:hover { background:#f8fafc; color:#1a4731; }
.dr-tab.active { background:#1a4731; color:#fff; box-shadow:0 8px 18px rgba(26,71,49,.18); }

.dr-panel { background:#fff; border-radius:18px; overflow:hidden; box-shadow:0 12px 34px rgba(15,23,42,.07); border:1px solid #e8eef5; }
.dr-panel-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; padding:18px 20px; border-bottom:1px solid #eef2f7; background:linear-gradient(180deg,#fff,#fbfdff); }
.dr-panel-title { margin:0; font-size:17px; font-weight:800; color:#15251b; }
.dr-panel-subtitle { margin:4px 0 0; color:#64748b; font-size:12px; line-height:1.5; }
.dr-filter-bar { display:flex; gap:10px; padding:14px 16px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; align-items:center; background:#fff; }
.dr-filter-search { position:relative; flex:1 1 260px; min-width:220px; }
.dr-filter-search svg { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none; }
.dr-filter-search .dr-input { padding-left:40px; }
.dr-filter-select { flex:0 0 240px; max-width:100%; }
.dr-date-range { display:flex; align-items:center; gap:7px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0 10px; min-height:40px; }
.dr-date-range-label { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#64748b; font-weight:700; white-space:nowrap; }
.dr-date-input { padding:8px 4px; border:none; background:transparent; font-size:13px; font-family:'Plus Jakarta Sans',sans-serif; width:82px; cursor:pointer; outline:none; }
.dr-reset-btn { padding:9px 12px; border:1px solid #fecaca; border-radius:10px; font-size:12px; font-weight:800; color:#dc2626; background:#fff5f5; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; display:inline-flex; align-items:center; gap:6px; }
.dr-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.dr-empty { padding:56px 20px; text-align:center; color:#94a3b8; font-size:14px; }
.dr-action-cell { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }

.dr-vehicle-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:16px; }
.dr-kendaraan-card { background:#fff; border-radius:16px; border:1px solid #e8eef5; padding:18px; box-shadow:0 10px 28px rgba(15,23,42,.06); transition:box-shadow .18s,transform .18s,border-color .18s; cursor:default; animation:fadeInUp .35s ease both; position:relative; overflow:hidden; }
.dr-kendaraan-card:hover { box-shadow:0 16px 34px rgba(15,23,42,.1); transform:translateY(-2px); border-color:#bbf7d0; }
.dr-plate-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:14px; }

@media(max-width:1024px){
    .dr-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
    .dr-hero{flex-direction:column;}
    .dr-hero-actions{justify-content:flex-start; min-width:0;}
}
@media(max-width:640px){
    .dr-hero{padding:18px; border-radius:16px;}
    .dr-title{font-size:24px;}
    .dr-stat-grid{grid-template-columns:1fr;}
    .dr-tab{flex:1 1 140px; justify-content:center;}
    .dr-filter-select,.dr-filter-search{flex:1 1 100%; min-width:0;}
    .dr-date-range{width:100%; justify-content:space-between;}
    .dr-btn-primary{width:100%;}
    .dr-panel-head{flex-direction:column;}
    .dr-grid2,.dr-grid3,.dr-detail-grid{grid-template-columns:1fr;}
    .dr-modal{padding:22px;max-width:95vw;}
    .dr-modal-summary{grid-template-columns:1fr;padding:14px;}
    .dr-modal-summary-value{font-size:20px;}
    .dr-modal-section{padding:14px;margin-bottom:12px;}
    .dr-modal-head-title{font-size:18px;}
    .dr-modal-footer{flex-direction:column;}
    .dr-modal-footer button{width:100%;}
}

.dr-file-zone { border:2px dashed #e2e8f0; border-radius:10px; padding:14px 18px; background:#f8fafc; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.dr-file-zone.has { border-color:#86efac; background:#f0fdf4; }
.dr-file-pick { padding:7px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:7px; font-size:13px; font-weight:600; color:#475569; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
.dr-file-pick:hover { background:#f1f5f9; }
.dr-upload-preview{display:flex;gap:12px;align-items:center;border:1px solid #e1ece6;background:#fbfdfc;border-radius:14px;padding:10px 12px;margin:-4px 0 16px}
.dr-upload-thumb{width:70px;height:56px;border-radius:10px;object-fit:cover;border:1px solid #dbe7e1;background:#f8fafc;flex-shrink:0;cursor:pointer}
.dr-upload-meta{min-width:0;flex:1}
.dr-upload-name{font-size:13px;font-weight:800;color:#17251d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 3px}
.dr-upload-info{font-size:11px;color:#64748b;line-height:1.45;margin:0}
.dr-preview-modal{max-width:min(920px,94vw)!important;padding:18px!important;background:#0f172a!important}
.dr-preview-img{display:block;max-width:100%;max-height:78vh;border-radius:12px;object-fit:contain;margin:auto;background:#111827}

.react-datepicker-wrapper { width:100%; }
.react-datepicker__input-container input { width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; font-family:'Plus Jakarta Sans',sans-serif; color:#1e293b; background:#fff; outline:none; transition:border-color .15s; box-sizing:border-box; cursor:pointer; }
.react-datepicker__input-container input:focus { border-color:#2d6a4f; box-shadow:0 0 0 3px rgba(45,106,79,.08); }
.react-datepicker { font-family:'Plus Jakarta Sans',sans-serif !important; border:1px solid #e2e8f0 !important; border-radius:12px !important; box-shadow:0 8px 30px rgba(0,0,0,.12) !important; }
.react-datepicker__header { background:#f0fdf4 !important; border-bottom:1px solid #bbf7d0 !important; border-radius:12px 12px 0 0 !important; }
.react-datepicker__current-month { font-size:14px !important; font-weight:700 !important; color:#166534 !important; }
.react-datepicker__day--selected { background:#1a4731 !important; color:#fff !important; font-weight:600 !important; }
.react-datepicker__day:hover { background:#dcfce7 !important; color:#166534 !important; }
.react-datepicker__triangle { display:none !important; }
`;

const PER_PAGE = 10;

const LP_STATUS = {
    pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    disetujui: { label: 'Disetujui', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dilaporkan: { label: 'Dilaporkan', bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
    selesai: { label: 'Selesai', bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
};

const LP_STEPS = [
    { key: 'pending', label: 'Diajukan' },
    { key: 'disetujui', label: 'Disetujui' },
    { key: 'dilaporkan', label: 'Dilaporkan' },
    { key: 'selesai', label: 'Selesai' },
];
const ORDER = ['pending', 'disetujui', 'dilaporkan', 'selesai'];

const STYLES = `
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.lp-page{animation:fadeInUp .4s ease both;display:flex;flex-direction:column;gap:18px}
.lp-tr{animation:fadeInUp .3s ease both}
.lp-input,.lp-select,.lp-textarea{width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;box-sizing:border-box}
.lp-input:focus,.lp-select:focus,.lp-textarea:focus{border-color:#2d6a4f;box-shadow:0 0 0 3px rgba(45,106,79,.08)}
.lp-textarea{resize:vertical;min-height:80px;line-height:1.55}
.lp-btn-primary{padding:10px 22px;background:linear-gradient(135deg,#1a4731 0%,#236348 100%);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow:0 4px 12px rgba(26,71,49,.2)}
.lp-btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(26,71,49,.3)}
.lp-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.lp-btn-primary.danger{background:#dc2626}.lp-btn-primary.danger:hover{background:#b91c1c}
.lp-btn-ghost{padding:10px 20px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s}
.lp-btn-ghost:hover{background:#e2e8f0}
.lp-btn-sm{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;font-family:'Plus Jakarta Sans',sans-serif;transition:background .14s,transform .1s;white-space:nowrap}
.lp-btn-sm:hover{transform:translateY(-1px)}
.lp-btn-sm.n{border-color:#e2e8f0;color:#475569;background:#fff}.lp-btn-sm.n:hover{background:#f8fafc}
.lp-btn-sm.g{border-color:#86efac;color:#166534;background:#fff}.lp-btn-sm.g:hover{background:#dcfce7}
.lp-btn-sm.b{border-color:#93c5fd;color:#1d4ed8;background:#fff}.lp-btn-sm.b:hover{background:#eff6ff}
.lp-btn-sm.r{border-color:#fca5a5;color:#dc2626;background:#fff}.lp-btn-sm.r:hover{background:#fef2f2}
.lp-btn-sm.y{border-color:#fde68a;color:#a16207;background:#fff}.lp-btn-sm.y:hover{background:#fefce8}
.lp-btn-sm.p{border-color:#c4b5fd;color:#6d28d9;background:#fff}.lp-btn-sm.p:hover{background:#f5f3ff}
.lp-header{display:flex;justify-content:space-between;align-items:center;gap:16px}
.lp-header-title{margin:0;font-size:18px;font-weight:800;color:#15251b}
.lp-header-subtitle{margin:4px 0 0;color:#64748b;font-size:12px}
.lp-table{width:100%;border-collapse:separate;border-spacing:0;min-width:820px}
.lp-table thead th{padding:12px 16px;text-align:left;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0;background:#f8fafc}
.lp-table tbody td{padding:13px 16px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.lp-table tbody tr:last-child td{border-bottom:none}
.lp-table tbody tr:hover td{background:#f8fafb}
.lp-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .18s ease;backdrop-filter:blur(2px)}
.lp-modal{background:#fff;border-radius:16px;padding:32px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.18);animation:slideUp .22s ease}
.lp-modal.sm{max-width:440px}.lp-modal.lg{max-width:760px}
.lp-field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.lp-label{font-size:13px;font-weight:600;color:#475569}
.lp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.lp-modal-footer{display:flex;gap:12px;justify-content:flex-end;padding-top:16px;border-top:1px solid #f1f5f9}
.lp-alert-ok{background:#dcfce7;border:1px solid #86efac;border-radius:8px;color:#166534;padding:12px 16px;font-size:14px;margin-bottom:16px;animation:fadeInUp .25s ease}
.lp-alert-err{background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;padding:12px 16px;font-size:14px;margin-bottom:16px}
.lp-rejection{background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px 14px;font-size:13px;color:#991b1b;margin-bottom:16px}
.lp-file-zone{border:2px dashed #e2e8f0;border-radius:10px;padding:20px;background:#f8fafc;margin-bottom:16px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;cursor:pointer;transition:border-color .15s,background .15s}
.lp-file-zone:hover{border-color:#2d6a4f;background:#f0fdf4}
.lp-file-zone.has{border-color:#86efac;background:#f0fdf4}
.lp-file-zone-text{font-size:13px;color:#64748b;text-align:center}
.lp-file-list{display:flex;flex-direction:column;gap:8px}
.lp-file-item{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px}
.lp-file-remove{padding:4px 8px;background:#fee2e2;color:#dc2626;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;}
.lp-file-remove:hover{background:#fca5a5}
.lp-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-top:10px}
.lp-photo-card{display:flex;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:9px}
.lp-photo-thumb{width:58px;height:52px;border-radius:8px;object-fit:cover;border:1px solid #e2e8f0;cursor:pointer;flex-shrink:0}
.lp-photo-name{font-size:12px;font-weight:800;color:#17251d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 2px}
.lp-photo-info{font-size:11px;color:#64748b;line-height:1.4;margin:0}
.lp-panel{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.07);border:1px solid #e8eef5}
.lp-filter-bar{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-bottom:1px solid #f1f5f9;background:#fff}
.lp-filter-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.lp-filter-search{position:relative;flex:1 1 260px;min-width:220px}
.lp-filter-search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}
.lp-filter-input{width:100%;padding:10px 12px 10px 40px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;background:#fff;transition:border-color .15s,box-shadow .15s;min-width:0;box-sizing:border-box}
.lp-filter-input:focus{border-color:#2d6a4f}
.lp-filter-select{padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;background:#fff;transition:border-color .15s;flex:0 0 220px;max-width:100%}
.lp-filter-select:focus{border-color:#2d6a4f}
.lp-date-range{display:flex;align-items:center;gap:7px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:0 10px;min-height:40px}
.lp-date-range-label{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#64748b;font-weight:700;white-space:nowrap}
.lp-date-input{padding:8px 4px;border:none;background:transparent;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;width:82px;cursor:pointer;outline:none}
.lp-filter-reset{padding:10px 12px;border:1px solid #fca5a5;border-radius:10px;font-size:12px;font-weight:700;color:#dc2626;background:#fef2f2;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.lp-filter-reset:hover{background:#fee2e2}
.lp-pagination{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;gap:10px}
.lp-page-info{font-size:13px;color:#64748b}
.lp-page-btns{display:flex;gap:4px}
.lp-page-btn{width:32px;height:32px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;color:#475569;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;transition:all .14s}
.lp-page-btn:hover:not(:disabled){border-color:#2d6a4f;color:#1a4731;background:#f0fdf4}
.lp-page-btn.active{background:#1a4731;color:#fff;border-color:#1a4731}
.lp-page-btn:disabled{opacity:.4;cursor:not-allowed}
.lp-steps{display:flex;align-items:flex-start;gap:0;margin-bottom:24px}
.lp-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
.lp-step-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;z-index:1;flex-shrink:0}
.lp-step-line{position:absolute;top:13px;left:50%;width:100%;height:2px;z-index:0}
.lp-step-label{font-size:10px;font-weight:600;margin-top:5px;text-align:center;line-height:1.3}
.lp-stats-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.lp-stat-card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.06);border:1px solid #edf2f7;animation:fadeInUp .35s ease both}
.lp-radio-card{flex:1;display:flex;align-items:center;gap:10px;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;transition:border-color .15s,background .15s;font-size:14px;font-weight:600;color:#64748b;font-family:'Plus Jakarta Sans',sans-serif}
.lp-radio-card.approve.active{border-color:#86efac;background:#f0fdf4;color:#166534}
.lp-radio-card.reject.active{border-color:#fca5a5;background:#fef2f2;color:#991b1b}
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
@media(max-width:1024px){.lp-modal{padding:24px;max-width:calc(100vw - 40px)}.lp-modal.lg{max-width:calc(100vw - 40px)}.lp-stats-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:768px){
.lp-header{flex-direction:column;align-items:stretch;gap:12px;margin-bottom:16px}
.lp-header h2{font-size:18px !important}
.lp-header .lp-btn-primary{width:100%;justify-content:center}
.lp-stats-row{grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}.lp-stat-card{padding:12px;border-radius:10px}
.lp-modal{padding:20px;max-width:calc(100vw - 24px);margin:12px auto}.lp-modal.sm{max-width:calc(100vw - 24px)}.lp-modal.lg{max-width:calc(100vw - 24px)}.lp-grid2{grid-template-columns:1fr;gap:12px}
.lp-modal-footer{flex-direction:column;gap:10px}.lp-modal-footer button{width:100%}.lp-filter-row{flex-direction:column}.lp-filter-search,.lp-filter-input,.lp-filter-select,.lp-date-range{width:100%;flex-basis:auto}.lp-date-range{justify-content:space-between}.lp-filter-reset{width:100%}
.lp-steps{flex-wrap:wrap;gap:8px}.lp-step{flex:0 1 auto;min-width:70px}.lp-step-label{font-size:9px}.lp-step-dot{width:22px;height:22px;font-size:9px}.lp-step-line{width:200%;top:10px}
.lp-table{font-size:12px}.lp-table thead th{padding:8px 10px;font-size:10px}.lp-table tbody td{padding:8px 10px;font-size:12px}
.lp-btn-sm{padding:4px 8px;font-size:11px;white-space:nowrap}.lp-radio-card{padding:8px 10px;font-size:12px;gap:6px}
h3{font-size:16px!important}
}
@media(max-width:568px){
.lp-header{flex-direction:column;gap:10px;margin-bottom:12px}
.lp-header h2{font-size:16px !important;margin:0}
.lp-header .lp-btn-primary{width:100%;padding:10px 16px}
.lp-stats-row{grid-template-columns:1fr;gap:10px;margin-bottom:16px}.lp-stat-card{padding:10px;border-radius:8px}
.lp-stat-card>div:first-child{font-size:9px}.lp-stat-card>div:last-child{font-size:16px;margin-top:4px}
.lp-modal{padding:16px;max-width:calc(100vw - 20px);margin:10px auto}.lp-modal.sm{max-width:calc(100vw - 20px)}.lp-modal.lg{max-width:calc(100vw - 20px)}.lp-grid2{grid-template-columns:1fr}
.lp-table{font-size:11px}.lp-table thead{display:none}.lp-table tbody tr{display:flex;flex-direction:column;margin-bottom:12px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fff}
.lp-table tbody td{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border:none;text-align:right}.lp-table tbody td:before{content:attr(data-label);font-weight:600;color:#64748b;text-align:left}
.lp-btn-primary,.lp-btn-ghost,.lp-btn-sm{width:100%;display:block;text-align:center}.lp-btn-primary{margin:8px 0 0}
.lp-modal-footer{gap:8px}.lp-modal-footer button{width:100%;margin:0}.lp-filter-bar{padding:10px 12px;gap:6px}
.lp-filter-row{gap:6px;flex-direction:column}.lp-filter-input,.lp-filter-select,.lp-filter-reset{padding-top:8px;padding-bottom:8px;font-size:13px;width:100%}.lp-filter-input{padding-left:38px}
.lp-steps{margin-bottom:16px}.lp-step{flex:1;gap:4px}.lp-step-dot{width:20px;height:20px;font-size:8px}.lp-step-label{font-size:8px;line-height:1.2}
.lp-radio-card{padding:8px;font-size:11px}.lp-radio-card span{display:none}
h3{font-size:15px!important;margin-bottom:16px!important}
}
`;

function StepTracker({ status }) {
    const currentIdx = ORDER.indexOf(status);
    return (
        <div className="lp-steps">
            {LP_STEPS.map((step, idx) => (
                <div key={step.key} className="lp-step">
                    <div className="lp-step-dot" style={{
                        background: idx <= currentIdx ? LP_STATUS[step.key]?.dot : '#e2e8f0',
                        color: idx <= currentIdx ? '#fff' : '#94a3b8',
                    }}>
                        {idx <= currentIdx ? '\u2713' : idx + 1}
                    </div>
                    {idx < LP_STEPS.length - 1 && (
                        <div className="lp-step-line" style={{
                            background: idx < currentIdx ? LP_STATUS[step.key]?.dot : '#e2e8f0',
                        }} />
                    )}
                    <div className="lp-step-label">{step.label}</div>
                </div>
            ))}
        </div>
    );
}

function LogPerjalanan({ isAdmin }) {
    const { user } = useAuth();
    const fileInputRef = useRef(null);
    
    const [list, setList] = useState([]);
    const [kendaraanList, setKendaraanList] = useState([]);
    const [, setLoading] = useState(false);
    const [error, setError] = useToastState('error');
    const [success, setSuccess] = useToastState('success');
    
    // Filter & Pagination
    const [filters, setFilters] = useState({ search: '', status: '', dari: null, sampai: null });
    const [page, setPage] = useState(1);
    
    // Modals
    const [modalAjukan, setModalAjukan] = useState(false);
    const [modalDetail, setModalDetail] = useState(null);
    const [modalApproval, setModalApproval] = useState(null);
    const [modalLaporan, setModalLaporan] = useState(null);
    const [modalHapus, setModalHapus] = useState(null);
    const [modalSelesaikan, setModalSelesaikan] = useState(null);
    const [modalImagePreview, setModalImagePreview] = useState(null);
    
    // Form
    const [formAjukan, setFormAjukan] = useState({
        kendaraan: '', tanggal: new Date(), jam_berangkat: '', jam_kembali: '',
        tujuan: '', km_awal: '', penumpang: '', keterangan: ''
    });
    
    const [formApproval, setFormApproval] = useState({ aksi: 'setujui', catatan_tolak: '' });
    
    const [formLaporan, setFormLaporan] = useState({
        tanggal_laporan: new Date(), deskripsi: '', tujuan_tercapai: true, keterangan: '', km_akhir: '', foto_files: []
    });
    const [fotoInfos, setFotoInfos] = useState([]);
    
    const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };
    const showError = (msg) => { setError(msg); setTimeout(() => setError(''), 3500); };
    
    const fetchAll = async () => {
        setLoading(true);
        try {
            const [resPerjalanan, resKendaraan] = await Promise.all([
                api.get('/keuangan/log-perjalanan/'),
                api.get('/keuangan/kendaraan/')
            ]);
            setList(resPerjalanan.data);
            setKendaraanList(resKendaraan.data);
        } catch (err) {
            console.error('Error fetching data:', err);
            if (err.response?.status === 404) {
                showError('API endpoint tidak ditemukan. Cek konfigurasi URL.');
            }
        }
        setLoading(false);
    };
    
    useEffect(() => {
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const filtered = useMemo(() => {
        let result = [...list];
        // Semua user bisa lihat semua data
        if (filters.search) result = result.filter(p => p.no_perjalanan.includes(filters.search) || p.tujuan.includes(filters.search));
        if (filters.status) result = result.filter(p => p.status === filters.status);
        if (filters.dari) result = result.filter(p => new Date(p.tanggal) >= filters.dari);
        if (filters.sampai) {
            const sampai = new Date(filters.sampai);
            sampai.setHours(23, 59, 59, 999);
            result = result.filter(p => new Date(p.tanggal) <= sampai);
        }
        // Sort by tanggal descending, then by ID descending (newest first)
        result.sort((a, b) => {
            const dateCompare = new Date(b.tanggal) - new Date(a.tanggal);
            if (dateCompare !== 0) return dateCompare;
            return b.id - a.id;
        });
        return result;
    }, [list, filters]);
    
    const paged = useMemo(() => {
        const start = (page - 1) * PER_PAGE;
        return { data: filtered.slice(start, start + PER_PAGE), total: filtered.length };
    }, [filtered, page]);
    
    const stats = useMemo(() => {
        const pending = list.filter(p => p.status === 'pending').length;
        const disetujui = list.filter(p => p.status === 'disetujui').length;
        const dilaporkan = list.filter(p => p.status === 'dilaporkan').length;
        return { total: list.length, pending, disetujui, dilaporkan };
    }, [list]);
    
    const handleAjukan = async () => {
        if (!formAjukan.kendaraan || !formAjukan.tujuan || !formAjukan.km_awal) {
            showError('Silakan isi semua field yang diperlukan');
            return;
        }
        try {
            const payload = {
                ...formAjukan,
                tanggal: dateToStr(formAjukan.tanggal),
            };
            await api.post('/keuangan/log-perjalanan/', payload);
            setModalAjukan(false);
            fetchAll();
            setFormAjukan({
                kendaraan: '', tanggal: new Date(), jam_berangkat: '', jam_kembali: '',
                tujuan: '', km_awal: '', penumpang: '', keterangan: ''
            });
            showSuccess('Perjalanan berhasil diajukan');
        } catch (err) {
            showError(err.response?.data?.detail || 'Gagal mengajukan');
        }
    };
    
    const handleApproval = async () => {
        if (formApproval.aksi === 'tolak' && !formApproval.catatan_tolak) {
            showError('Catatan penolakan wajib diisi');
            return;
        }
        try {
            await api.post(`/keuangan/log-perjalanan/${modalApproval.id}/approval/`, formApproval);
            setModalApproval(null);
            setPage(1);
            fetchAll();
            setFormApproval({ aksi: 'setujui', catatan_tolak: '' });
            showSuccess(`Perjalanan berhasil ${formApproval.aksi === 'setujui' ? 'disetujui' : 'ditolak'}`);
        } catch (err) {
            showError(err.response?.data?.error || 'Gagal memproses approval');
        }
    };
    
    const handleLaporan = async () => {
        if (!formLaporan.deskripsi) {
            showError('Deskripsi laporan wajib diisi');
            return;
        }
        if (!formLaporan.km_akhir) {
            showError('KM Akhir wajib diisi');
            return;
        }
        if (formLaporan.foto_files.length === 0) {
            showError('Silakan upload minimal satu foto');
            return;
        }
        try {
            const formData = new FormData();
            formData.append('tanggal_laporan', dateToStr(formLaporan.tanggal_laporan));
            formData.append('deskripsi', formLaporan.deskripsi);
            formData.append('tujuan_tercapai', formLaporan.tujuan_tercapai);
            formData.append('keterangan', formLaporan.keterangan);
            const km_akhir = Number(formLaporan.km_akhir || 0);
            const km_awal = Number(modalLaporan.km_awal || 0);
            const jarak_km = km_akhir > 0 && km_awal > 0 ? km_akhir - km_awal : 0;
            
            formLaporan.foto_files.forEach((f) => {
                formData.append('foto_files', f);
            });
            formData.append('km_akhir', km_akhir);
            formData.append('jarak_km', jarak_km);
            
            await api.post(`/keuangan/log-perjalanan/${modalLaporan.id}/laporan/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setModalLaporan(null);
            setPage(1);
            fetchAll();
            setFormLaporan({
                tanggal_laporan: new Date(), deskripsi: '', tujuan_tercapai: true, keterangan: '', km_akhir: '', foto_files: []
            });
            showSuccess('Laporan berhasil disubmit');
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Gagal submit laporan';
            const details = err.response?.data?.details;
            let fullError = errorMsg;
            if (details) {
                const detailsStr = Object.entries(details)
                    .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                    .join('\n');
                fullError = `${errorMsg}\n\nDetail:\n${detailsStr}`;
            }
            showError(fullError);
        }
    };
    
    const handleSelesaikan = async () => {
        try {
            await api.post(`/keuangan/log-perjalanan/${modalSelesaikan.id}/selesaikan/`);
            setModalSelesaikan(null);
            setPage(1);
            fetchAll();
            showSuccess('Perjalanan berhasil diselesaikan');
        } catch (err) {
            showError(err.response?.data?.error || 'Gagal diselesaikan');
        }
    };
    
    const handleHapus = async () => {
        try {
            await api.delete(`/keuangan/log-perjalanan/${modalHapus.id}/`);
            setModalHapus(null);
            fetchAll();
            showSuccess('Perjalanan berhasil dihapus');
        } catch (err) {
            showError(err.response?.data?.error || 'Gagal menghapus');
        }
    };
    
    const handleFotoChange = async (e) => {
        const files = Array.from(e.target.files || []);
        
        // Validate & compress images
        const validFiles = [];
        const errors = [];
        
        for (const file of files) {
            const validation = validateImageFile(file);
            if (!validation.isValid) {
                errors.push(`${file.name}: ${validation.error}`);
                continue;
            }
            validFiles.push(file);
        }
        
        if (errors.length > 0) {
            showError(errors.join('\n'));
        }
        
        if (validFiles.length === 0) return;
        
        try {
            // Compress images before adding
            const compressedFiles = await compressImages(validFiles, {
                maxSizeMB: 0.5, // 500KB per image
                maxWidthOrHeight: 1920,
                quality: 0.75
            });
            
            setFormLaporan(prev => ({
                ...prev,
                foto_files: [...prev.foto_files, ...compressedFiles]
            }));
            setFotoInfos(prev => ([
                ...prev,
                ...compressedFiles.map((compressed, idx) => {
                    const original = validFiles[idx];
                    const reduction = Math.max(0, (1 - compressed.size / original.size) * 100).toFixed(1);
                    return {
                        name: original.name,
                        originalSize: formatFileSize(original.size),
                        compressedSize: formatFileSize(compressed.size),
                        reduction,
                    };
                })
            ]));
            
            showSuccess(`${compressedFiles.length} foto berhasil dikompres`);
        } catch (err) {
            showError('Gagal mengompres gambar: ' + err.message);
        }
        
        // Reset input
        if (e.target) e.target.value = '';
    };
    
    const handleRemoveFoto = (idx) => {
        setFormLaporan(prev => ({
            ...prev,
            foto_files: prev.foto_files.filter((_, i) => i !== idx)
        }));
        setFotoInfos(prev => prev.filter((_, i) => i !== idx));
    };
    
    return (
        <div className="lp-page">
            <style>{STYLES}</style>
            
            {/* Header & Stats */}
            <div className="lp-header">
                <div>
                    <h2 className="lp-header-title">Log Perjalanan</h2>
                    <p className="lp-header-subtitle">Ajukan izin, proses approval, dan lengkapi laporan perjalanan.</p>
                </div>
                <button className="lp-btn-primary" onClick={() => setModalAjukan(true)}>
                    <MapPin size={18} strokeWidth={2} /> Ajukan Perjalanan
                </button>
            </div>
            
            <div className="lp-stats-row">
                <div className="lp-stat-card"><div style={{ fontSize: '11px', color: '#64748b' }}>TOTAL</div><div style={{ fontSize: '24px', fontWeight: 700, color: '#1a4731', marginTop: '8px' }}>{stats.total}</div></div>
                <div className="lp-stat-card"><div style={{ fontSize: '11px', color: '#f97316' }}>PENDING</div><div style={{ fontSize: '24px', fontWeight: 700, color: '#f97316', marginTop: '8px' }}>{stats.pending}</div></div>
                <div className="lp-stat-card"><div style={{ fontSize: '11px', color: '#22c55e' }}>DISETUJUI</div><div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', marginTop: '8px' }}>{stats.disetujui}</div></div>
                <div className="lp-stat-card"><div style={{ fontSize: '11px', color: '#8b5cf6' }}>DILAPORKAN</div><div style={{ fontSize: '24px', fontWeight: 700, color: '#8b5cf6', marginTop: '8px' }}>{stats.dilaporkan}</div></div>
            </div>
            
            {/* Error/Success */}
            {error && <div className="lp-alert-err">{error}</div>}
            {success && <div className="lp-alert-ok">{success}</div>}
            
            <div className="lp-panel">
                {/* Filter */}
                <div className="lp-filter-bar">
                    <div className="lp-filter-row">
                        <div className="lp-filter-search">
                            <Search size={16} />
                            <input
                                type="text"
                                className="lp-filter-input"
                                placeholder="Cari no. perjalanan atau tujuan..."
                                value={filters.search}
                                onChange={(e) => { setFilters(prev => ({ ...prev, search: e.target.value })); setPage(1); }}
                            />
                        </div>
                        <select
                            className="lp-filter-select"
                            value={filters.status}
                            onChange={(e) => { setFilters(prev => ({ ...prev, status: e.target.value })); setPage(1); }}
                        >
                            <option value="">Semua Status</option>
                            {Object.entries(LP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <div className="lp-date-range">
                            <span className="lp-date-range-label"><CalendarDays size={14} /> Tgl</span>
                            <DatePicker
                                selected={filters.dari}
                                onChange={(d) => { setFilters(prev => ({ ...prev, dari: d })); setPage(1); }}
                                selectsStart
                                startDate={filters.dari}
                                endDate={filters.sampai}
                                placeholderText="Dari"
                                dateFormat="dd/MM/yy"
                                locale={id}
                                isClearable
                                popperPlacement="bottom-end"
                                customInput={<input className="lp-date-input" />}
                            />
                            <span style={{ fontSize: 11, color: '#cbd5e1' }}>{'\u2013'}</span>
                            <DatePicker
                                selected={filters.sampai}
                                onChange={(d) => { setFilters(prev => ({ ...prev, sampai: d })); setPage(1); }}
                                selectsEnd
                                startDate={filters.dari}
                                endDate={filters.sampai}
                                minDate={filters.dari}
                                placeholderText="Sampai"
                                dateFormat="dd/MM/yy"
                                locale={id}
                                isClearable
                                popperPlacement="bottom-end"
                                customInput={<input className="lp-date-input" />}
                            />
                        </div>
                        {(filters.search || filters.status || filters.dari || filters.sampai) && (
                            <button
                            className="lp-filter-reset"
                            onClick={() => { setFilters({ search: '', status: '', dari: null, sampai: null }); setPage(1); }}
                        >
                            <X size={14} /> Reset
                        </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table className="lp-table">
                    <thead>
                        <tr>
                            <th>No. Perjalanan</th>
                            <th>Tanggal</th>
                            <th>Kendaraan</th>
                            <th>Tujuan</th>
                            <th>Jarak (km)</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paged.data.length > 0 ? paged.data.map((item, idx) => (
                            <tr key={item.id} className="lp-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                <td data-label="No. Perjalanan"><strong>{item.no_perjalanan}</strong></td>
                                <td data-label="Tanggal">{fmtTgl(item.tanggal)}</td>
                                <td data-label="Kendaraan">{item.kendaraan_info}</td>
                                <td data-label="Tujuan">{item.tujuan}</td>
                                <td data-label="Jarak">{item.jarak_km || '\u2014'}</td>
                                <td data-label="Status">
                                    <span style={{
                                        background: LP_STATUS[item.status]?.bg,
                                        color: LP_STATUS[item.status]?.color,
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 600
                                    }}>
                                        {LP_STATUS[item.status]?.label}
                                    </span>
                                </td>
                                <td data-label="Aksi" style={{ overflow: 'visible' }}>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                                        <button className="lp-btn-sm n" onClick={() => setModalDetail(item)}>Detail</button>
                                        
                                        {/* Approval button - untuk pending, tampil ke approval role */}
                                        {item.status === 'pending' && isAdmin && (
                                            <button className="lp-btn-sm b" onClick={() => { setModalApproval(item); setFormApproval({ aksi: 'setujui', catatan_tolak: '' }); }}>
                                                Proses
                                            </button>
                                        )}
                                        
                                        {/* Laporan button - untuk disetujui, tampil ke driver/owner */}
                                        {item.status === 'disetujui' && (user?.id === item.driver || isAdmin) && (
                                            <button className="lp-btn-sm g" onClick={() => { setModalLaporan(item); setFotoInfos([]); setFormLaporan({ tanggal_laporan: new Date(), deskripsi: '', tujuan_tercapai: true, keterangan: '', km_akhir: '', foto_files: [] }); }}>
                                                Laporan
                                            </button>
                                        )}
                                        
                                        {/* Selesaikan button - untuk dilaporkan, tampil ke admin */}
                                        {item.status === 'dilaporkan' && isAdmin && (
                                            <button className="lp-btn-sm g" onClick={() => setModalSelesaikan(item)}>
                                                Selesai
                                            </button>
                                        )}
                                        
                                        {/* Delete button */}
                                        {/* Admin: bisa delete semua status */}
                                        {isAdmin && (
                                            <button className="lp-btn-sm r" onClick={() => setModalHapus(item)}>Hapus</button>
                                        )}
                                        {/* Driver (non-admin): hanya bisa delete status pending milik sendiri */}
                                        {!isAdmin && item.status === 'pending' && user?.id === item.driver && (
                                            <button className="lp-btn-sm r" onClick={() => setModalHapus(item)}>Hapus</button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>Tidak ada data</td></tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>
            
            {/* Pagination */}
            {paged.total > 0 && (
                <div className="lp-pagination">
                    <div className="lp-page-info">{paged.data.length > 0 ? `${(page-1)*PER_PAGE + 1}\u2013${Math.min(page*PER_PAGE, paged.total)}` : '0'} dari {paged.total}</div>
                    <div className="lp-page-btns">
                        <button className="lp-page-btn" disabled={page === 1} onClick={() => setPage(1)}>{'\u00ab'}</button>
                        <button className="lp-page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>{'\u2039'}</button>
                        <button className="lp-page-btn">{page}</button>
                        <button className="lp-page-btn" disabled={page * PER_PAGE >= paged.total} onClick={() => setPage(page + 1)}>{'\u203a'}</button>
                        <button className="lp-page-btn" disabled={page * PER_PAGE >= paged.total} onClick={() => setPage(Math.ceil(paged.total / PER_PAGE))}>{'\u00bb'}</button>
                    </div>
                </div>
            )}
            
            {/* Modal: Ajukan */}
            {modalAjukan && createPortal(
                <div className="lp-overlay" onClick={() => setModalAjukan(false)}>
                    <div className="lp-modal" onClick={(e) => e.stopPropagation()}>
                        <ModalHeader
                            icon={<MapPin size={18} />}
                            title="Ajukan Perjalanan"
                            subtitle="Isi kendaraan, tujuan, waktu, odometer, dan informasi penumpang bila ada."
                        />
                        <ModalSection icon={<BookOpen size={14} />} title="Data Perjalanan">
                            <div className="lp-field">
                                <label className="lp-label">Kendaraan *</label>
                                <select
                                    className="lp-select"
                                    value={formAjukan.kendaraan}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, kendaraan: e.target.value }))}
                                >
                                    <option value="">Pilih kendaraan...</option>
                                    {kendaraanList.map(k => <option key={k.id} value={k.id}>{k.plat_nomor} - {k.nama}</option>)}
                                </select>
                            </div>
                            <div className="lp-grid2">
                            <div className="lp-field">
                                <label className="lp-label">Tanggal *</label>
                                <DatePicker
                                    selected={formAjukan.tanggal}
                                    onChange={(d) => setFormAjukan(prev => ({ ...prev, tanggal: d }))}
                                    locale={id}
                                    dateFormat="dd/MM/yyyy"
                                />
                            </div>
                            <div className="lp-field">
                                <label className="lp-label">Tujuan *</label>
                                <input
                                    type="text"
                                    className="lp-input"
                                    placeholder="Cth: Bandara"
                                    value={formAjukan.tujuan}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, tujuan: e.target.value }))}
                                />
                            </div>
                            </div>
                            <div className="lp-grid2">
                            <div className="lp-field">
                                <label className="lp-label">Jam Berangkat</label>
                                <input
                                    type="time"
                                    className="lp-input"
                                    value={formAjukan.jam_berangkat}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, jam_berangkat: e.target.value }))}
                                />
                            </div>
                            <div className="lp-field">
                                <label className="lp-label">Jam Kembali</label>
                                <input
                                    type="time"
                                    className="lp-input"
                                    value={formAjukan.jam_kembali}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, jam_kembali: e.target.value }))}
                                />
                            </div>
                            </div>
                            <div className="lp-field">
                                <label className="lp-label">KM Awal *</label>
                                <input
                                    type="number"
                                    className="lp-input"
                                    value={formAjukan.km_awal}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, km_awal: e.target.value }))}
                                />
                            </div>
                            <div className="lp-field">
                                <label className="lp-label">Penumpang</label>
                                <input
                                    type="text"
                                    className="lp-input"
                                    placeholder="Nama penumpang jika ada"
                                    value={formAjukan.penumpang}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, penumpang: e.target.value }))}
                                />
                            </div>
                            <div className="lp-field">
                                <label className="lp-label">Keterangan</label>
                                <textarea
                                    className="lp-textarea"
                                    value={formAjukan.keterangan}
                                    onChange={(e) => setFormAjukan(prev => ({ ...prev, keterangan: e.target.value }))}
                                />
                            </div>
                        </ModalSection>
                        <div className="lp-modal-footer">
                            <button className="lp-btn-ghost" onClick={() => setModalAjukan(false)}>Batal</button>
                            <button className="lp-btn-primary" onClick={handleAjukan}>Ajukan</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            {/* Modal: Detail */}
            {modalDetail && createPortal(
                <div className="lp-overlay" onClick={() => setModalDetail(null)}>
                    <div className="lp-modal lg" onClick={(e) => e.stopPropagation()}>
                        <ModalHeader
                            icon={<MapPin size={18} />}
                            title="Detail Perjalanan"
                            subtitle="Ringkasan pengajuan, status approval, laporan, dan foto perjalanan."
                        />
                        <ModalSummary
                            label={modalDetail.no_perjalanan}
                            value={modalDetail.tujuan}
                            description={modalDetail.kendaraan_info}
                            meta={`Driver: ${modalDetail.driver_name || '-'} - ${fmtTgl(modalDetail.tanggal)}`}
                            side={<MiniStatus label={LP_STATUS[modalDetail.status]?.label || modalDetail.status} color={LP_STATUS[modalDetail.status]?.color} bg={LP_STATUS[modalDetail.status]?.bg} />}
                        />
                        <StepTracker status={modalDetail.status} />
                        <ModalSection icon={<BookOpen size={14} />} title="Data Perjalanan">
                            <DetailGrid items={[
                                ['No. Perjalanan', modalDetail.no_perjalanan],
                                ['Tanggal', fmtTgl(modalDetail.tanggal)],
                                ['Driver', modalDetail.driver_name || '-'],
                                ['Kendaraan', modalDetail.kendaraan_info],
                                ['Tujuan', modalDetail.tujuan],
                                ['Jarak', `${modalDetail.jarak_km || '-'} km`],
                                ['Jam Berangkat', modalDetail.jam_berangkat],
                                ['Jam Kembali', modalDetail.jam_kembali || '-'],
                                ['Penumpang', modalDetail.penumpang || '-'],
                                ['Disetujui Oleh', modalDetail.disetujui_oleh_name || '-'],
                            ]} />
                            {modalDetail.keterangan && <div><p className="dr-detail-label">Keterangan</p><p className="dr-detail-value">{modalDetail.keterangan}</p></div>}
                            {modalDetail.catatan_tolak && <div className="lp-rejection"><strong>Alasan Penolakan:</strong> {modalDetail.catatan_tolak}</div>}
                        </ModalSection>
                        
                        {/* Show laporan if exists */}
                        {modalDetail.laporan && (
                            <ModalSection icon={<Check size={14} />} title="Laporan Perjalanan">
                                <DetailGrid items={[
                                    ['Tanggal Laporan', fmtTgl(modalDetail.laporan.tanggal_laporan)],
                                    ['Tujuan Tercapai', modalDetail.laporan.tujuan_tercapai ? 'Ya' : 'Tidak'],
                                ]} />
                                <div style={{ marginBottom: 10 }}><p className="dr-detail-label">Deskripsi</p><p className="dr-detail-value">{modalDetail.laporan.deskripsi}</p></div>
                                {modalDetail.laporan.keterangan && <div style={{ marginBottom: 10 }}><p className="dr-detail-label">Keterangan</p><p className="dr-detail-value">{modalDetail.laporan.keterangan}</p></div>}
                                
                                {modalDetail.laporan.foto && modalDetail.laporan.foto.length > 0 && (
                                    <div>
                                        <div className="dr-modal-section-title" style={{ marginBottom: 8 }}><Camera size={14} /> Foto ({modalDetail.laporan.foto.length})</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                                            {modalDetail.laporan.foto.map(f => (
                                                <img 
                                                    key={f.id} 
                                                    src={f.foto_url} 
                                                    alt={`Foto ${f.urutan}`} 
                                                    onClick={() => setModalImagePreview(f.foto_url)}
                                                    style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #bbf7d0', cursor: 'pointer', transition: 'transform .15s, box-shadow .15s' }}
                                                    onMouseEnter={(e) => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,.2)'; }}
                                                    onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = ''; }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </ModalSection>
                        )}
                        
                        <div className="lp-modal-footer">
                            <button className="lp-btn-ghost" onClick={() => setModalDetail(null)}>Tutup</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            {/* Modal: Approval */}
            {modalApproval && createPortal(
                <div className="lp-overlay" onClick={() => setModalApproval(null)}>
                    <div className="lp-modal sm" onClick={(e) => e.stopPropagation()}>
                        <ModalHeader
                            icon={<Check size={18} />}
                            title="Proses Approval"
                            subtitle="Review pengajuan perjalanan lalu pilih keputusan."
                        />
                        <ModalSummary
                            label={modalApproval.no_perjalanan}
                            value={modalApproval.tujuan}
                            description={`Driver: ${modalApproval.driver_name || '-'}`}
                            meta={fmtTgl(modalApproval.tanggal)}
                        />
                        
                        <div className="lp-field" style={{ marginBottom: '20px' }}>
                            <label className="lp-label" style={{ marginBottom: '12px' }}>Keputusan</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div
                                    className={`lp-radio-card approve ${formApproval.aksi === 'setujui' ? 'active' : ''}`}
                                    onClick={() => setFormApproval({ aksi: 'setujui', catatan_tolak: '' })}
                                >
                                    <input type="radio" checked={formApproval.aksi === 'setujui'} readOnly />
                                    <span>Setujui</span>
                                </div>
                                <div
                                    className={`lp-radio-card reject ${formApproval.aksi === 'tolak' ? 'active' : ''}`}
                                    onClick={() => setFormApproval(prev => ({ ...prev, aksi: 'tolak' }))}
                                >
                                    <input type="radio" checked={formApproval.aksi === 'tolak'} readOnly />
                                    <span>Tolak</span>
                                </div>
                            </div>
                        </div>
                        
                        {formApproval.aksi === 'tolak' && (
                            <div className="lp-field">
                                <label className="lp-label">Alasan Penolakan *</label>
                                <textarea
                                    className="lp-textarea"
                                    value={formApproval.catatan_tolak}
                                    onChange={(e) => setFormApproval(prev => ({ ...prev, catatan_tolak: e.target.value }))}
                                    placeholder="Jelaskan alasan penolakan..."
                                />
                            </div>
                        )}
                        
                        <div className="lp-modal-footer">
                            <button className="lp-btn-ghost" onClick={() => setModalApproval(null)}>Batal</button>
                            <button className="lp-btn-primary" onClick={handleApproval}>
                                {formApproval.aksi === 'setujui' ? 'Setujui' : 'Tolak'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            {/* Modal: Laporan */}
            {modalLaporan && createPortal(
                <div className="lp-overlay" onClick={() => setModalLaporan(null)}>
                    <div className="lp-modal lg" onClick={(e) => e.stopPropagation()}>
                        <ModalHeader
                            icon={<Check size={18} />}
                            title="Laporan Perjalanan"
                            subtitle="Isi hasil perjalanan, KM akhir, deskripsi, dan foto dokumentasi."
                        />
                        <ModalSummary
                            label={modalLaporan.no_perjalanan}
                            value={modalLaporan.tujuan}
                            description={`Tanggal: ${fmtTgl(modalLaporan.tanggal)}`}
                            meta={`KM Awal: ${modalLaporan.km_awal || '-'} km`}
                        />
                        
                        <ModalSection icon={<BookOpen size={14} />} title="Data Laporan">
                            <div className="lp-field">
                                <label className="lp-label">Tanggal Laporan *</label>
                                <DatePicker
                                    selected={formLaporan.tanggal_laporan}
                                    onChange={(d) => setFormLaporan(prev => ({ ...prev, tanggal_laporan: d }))}
                                    locale={id}
                                    dateFormat="dd/MM/yyyy"
                                />
                            </div>
                            
                            <div className="lp-grid2">
                                <div className="lp-field">
                                    <label className="lp-label">KM Akhir *</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="lp-input"
                                        value={formLaporan.km_akhir}
                                        onChange={(e) => setFormLaporan(prev => ({ ...prev, km_akhir: e.target.value }))}
                                        placeholder="Masukkan KM akhir"
                                    />
                                </div>
                                <div className="lp-field">
                                    <label className="lp-label">Total Jarak</label>
                                    <input
                                        type="text"
                                        className="lp-input"
                                        value={formLaporan.km_akhir && modalLaporan.km_awal ? (Number(formLaporan.km_akhir) - Number(modalLaporan.km_awal)) + ' km' : '-'}
                                        disabled
                                        style={{ background: '#f8fafc', cursor: 'not-allowed' }}
                                    />
                                </div>
                            </div>
                            
                            <div className="lp-field">
                                <label className="lp-label">Deskripsi Perjalanan *</label>
                                <textarea
                                    className="lp-textarea"
                                    value={formLaporan.deskripsi}
                                    onChange={(e) => setFormLaporan(prev => ({ ...prev, deskripsi: e.target.value }))}
                                    placeholder="Jelaskan perjalanan dan aktivitas yang dilakukan..."
                                />
                            </div>
                            
                            <div className="lp-field">
                                <label className="lp-label" style={{ marginBottom: '10px' }}>Tujuan Tercapai</label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                        <input type="radio" name="tujuan" checked={formLaporan.tujuan_tercapai === true} onChange={() => setFormLaporan(prev => ({ ...prev, tujuan_tercapai: true }))} />
                                        Ya
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                        <input type="radio" name="tujuan" checked={formLaporan.tujuan_tercapai === false} onChange={() => setFormLaporan(prev => ({ ...prev, tujuan_tercapai: false }))} />
                                        Tidak
                                    </label>
                                </div>
                            </div>
                            
                            <div className="lp-field">
                                <label className="lp-label">Keterangan Tambahan</label>
                                <textarea
                                    className="lp-textarea"
                                    value={formLaporan.keterangan}
                                    onChange={(e) => setFormLaporan(prev => ({ ...prev, keterangan: e.target.value }))}
                                    placeholder="Catatan atau informasi tambahan..."
                                    style={{ minHeight: '60px' }}
                                />
                            </div>
                        </ModalSection>
                        
                        <ModalSection icon={<Camera size={14} />} title="Foto Perjalanan">
                            <div className={`lp-file-zone ${formLaporan.foto_files.length > 0 ? 'has' : ''}`} onClick={() => fileInputRef.current?.click()}>
                                <Camera size={18} />
                                <div className="lp-file-zone-text">Klik untuk upload foto atau drag & drop</div>
                                <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFotoChange} />
                            </div>
                            
                            <UploadedPhotoGrid files={formLaporan.foto_files} infos={fotoInfos} onPreview={setModalImagePreview} onRemove={handleRemoveFoto} />
                        </ModalSection>
                        
                        <div className="lp-modal-footer">
                            <button className="lp-btn-ghost" onClick={() => setModalLaporan(null)}>Batal</button>
                            <button className="lp-btn-primary" onClick={handleLaporan}>Submit Laporan</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            {/* Modal: Selesaikan */}
            {modalSelesaikan && createPortal(
                <div className="lp-overlay" onClick={() => setModalSelesaikan(null)}>
                    <div className="lp-modal sm" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Konfirmasi Selesaikan</h3>
                        <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>
                            Selesaikan laporan perjalanan <strong>{modalSelesaikan.no_perjalanan}</strong>?
                        </p>
                        <div className="lp-modal-footer">
                            <button className="lp-btn-ghost" onClick={() => setModalSelesaikan(null)}>Batal</button>
                            <button className="lp-btn-primary" onClick={handleSelesaikan}>Selesaikan</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            {/* Modal: Hapus */}
            {modalHapus && createPortal(
                <div className="lp-overlay" onClick={() => setModalHapus(null)}>
                    <div className="lp-modal sm" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#991b1b' }}>Hapus Perjalanan</h3>
                        <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>
                            Hapus laporan perjalanan <strong>{modalHapus.no_perjalanan}</strong>? Tindakan ini tidak dapat dibatalkan.
                        </p>
                        <div className="lp-modal-footer">
                            <button className="lp-btn-ghost" onClick={() => setModalHapus(null)}>Batal</button>
                            <button className="lp-btn-primary danger" onClick={handleHapus}>Hapus</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            {/* Modal: Image Preview */}
            {modalImagePreview && createPortal(
                <div className="lp-overlay" onClick={() => setModalImagePreview(null)} style={{ backdropFilter: 'blur(4px)', padding: '20px' }}>
                    <div style={{ position: 'relative', width: 'min(95vw, 95vh)', height: 'min(95vh, 95vw)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <img src={modalImagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: '8px' }} />
                        <button 
                            onClick={() => setModalImagePreview(null)}
                            style={{
                                position: 'absolute', top: '12px', right: '12px',
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none',
                                cursor: 'pointer', fontSize: '24px', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', transition: 'background .15s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'rgba(0,0,0,.9)'}
                            onMouseLeave={(e) => e.target.style.background = 'rgba(0,0,0,.7)'}
                        >
                            {'\u00d7'}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}


function Modal({ children }) {
    return createPortal(<div className="dr-overlay">{children}</div>, document.body);
}

function useObjectUrl(file) {
    const url = useMemo(() => {
        if (!file || !file.type?.startsWith('image/')) return '';
        return URL.createObjectURL(file);
    }, [file]);

    useEffect(() => {
        if (!url) return undefined;
        return () => URL.revokeObjectURL(url);
    }, [url]);

    return url;
}

function FileUploadZone({ file, label, hint, onPick }) {
    return (
        <div className={`dr-file-zone${file ? ' has' : ''}`}>
            <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: file ? '#166534' : '#475569', marginBottom: 2 }}>
                    {file?.name || label}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</p>
            </div>
            <span className="dr-file-pick" onClick={onPick}>{file ? 'Ganti' : 'Pilih'}</span>
        </div>
    );
}

function ModalHeader({ icon, title, subtitle }) {
    return (
        <div className="dr-modal-head">
            <span className="dr-modal-head-icon">{icon}</span>
            <div className="dr-modal-head-copy">
                <h2 className="dr-modal-head-title">{title}</h2>
                {subtitle && <p className="dr-modal-head-subtitle">{subtitle}</p>}
            </div>
        </div>
    );
}

function ModalSummary({ label, value, description, meta, side }) {
    return (
        <div className="dr-modal-summary">
            <div>
                <p className="dr-modal-summary-label">{label}</p>
                <p className="dr-modal-summary-value">{value}</p>
                {description && <p className="dr-modal-summary-desc">{description}</p>}
                {meta && <p className="dr-modal-summary-meta">{meta}</p>}
            </div>
            {side}
        </div>
    );
}

function ModalSection({ icon, title, children }) {
    return (
        <section className="dr-modal-section">
            {title && <p className="dr-modal-section-title">{icon}{title}</p>}
            {children}
        </section>
    );
}

function DetailGrid({ items }) {
    return (
        <div className="dr-detail-grid">
            {items.map(([label, value]) => (
                <div key={label}>
                    <p className="dr-detail-label">{label}</p>
                    <p className="dr-detail-value">{value}</p>
                </div>
            ))}
        </div>
    );
}

function MiniStatus({ label, color = '#166534', bg = '#dcfce7' }) {
    return <span style={{ display: 'inline-flex', borderRadius: 99, padding: '4px 9px', fontSize: 11, fontWeight: 800, color, background: bg, whiteSpace: 'nowrap' }}>{label}</span>;
}

function UploadPreview({ file, info, existingUrl, label = 'Foto', onPreview }) {
    const objectUrl = useObjectUrl(file instanceof File ? file : null);
    const previewUrl = objectUrl || existingUrl || '';
    if (!file && !existingUrl) return null;
    return (
        <div className="dr-upload-preview">
            {previewUrl ? (
                <img className="dr-upload-thumb" src={previewUrl} alt={label} onClick={() => onPreview(previewUrl)} />
            ) : (
                <div className="dr-upload-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={18} /></div>
            )}
            <div className="dr-upload-meta">
                <p className="dr-upload-name">{info?.name || file?.name || label}</p>
                <p className="dr-upload-info">
                    {info ? `${info.originalSize} -> ${info.compressedSize} (${info.reduction}% lebih kecil)` : 'Foto tersimpan. Klik preview untuk melihat tanpa membuka tab baru.'}
                </p>
            </div>
            {previewUrl && <button className="dr-btn-sm n" type="button" onClick={() => onPreview(previewUrl)}>Preview</button>}
        </div>
    );
}

function UploadedPhotoGrid({ files, infos, onPreview, onRemove }) {
    if (!files?.length) return null;
    return (
        <div className="lp-photo-grid">
            {files.map((file, idx) => (
                <UploadedPhotoCard key={`${file.name}-${idx}`} file={file} info={infos[idx]} onPreview={onPreview} onRemove={() => onRemove(idx)} />
            ))}
        </div>
    );
}

function UploadedPhotoCard({ file, info, onPreview, onRemove }) {
    const url = useObjectUrl(file);
    return (
        <div className="lp-photo-card">
            <img className="lp-photo-thumb" src={url} alt={file.name} onClick={() => onPreview(url)} />
            <div style={{ minWidth: 0, flex: 1 }}>
                <p className="lp-photo-name">{info?.name || file.name}</p>
                <p className="lp-photo-info">{info ? `${info.originalSize} -> ${info.compressedSize} (${info.reduction}% lebih kecil)` : formatFileSize(file.size)}</p>
            </div>
            <button className="lp-file-remove" type="button" onClick={onRemove}>Hapus</button>
        </div>
    );
}

const initialFormPerjalanan = { kendaraan: '', tanggal: '', jam_berangkat: '', jam_kembali: '', tujuan: '', km_awal: '', km_akhir: '', penumpang: '', keterangan: '' };
const initialFormBBM = { kendaraan: '', tanggal: '', total_biaya: '', km_saat_isi: '', keterangan: '' };
const initialFormMaint = { kendaraan: '', jenis: 'servis_rutin', tanggal: '', biaya: '', deskripsi: '' };
const initialFormKendaraan = { plat_nomor: '', nama: '', jenis: 'mobil', keterangan: '' };

export default function Driver() {
    const { user } = useAuth();
    const isAdmin = user?.is_superuser || ['direktur', 'wakil_direktur', 'manajer'].includes(user?.role);

    const [activeTab, setActiveTab] = useState('perjalanan');
    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');
    const [saving, setSaving] = useState(false);

    /* Data */
    const [kendaraanList, setKendaraanList] = useState([]);
    const [logPerjalanan, setLogPerjalanan] = useState([]);
    const [logBBM, setLogBBM] = useState([]);
    const [logMaintenance, setLogMaintenance] = useState([]);
    const [loading, setLoading] = useState(true);

    /* Filter */
    const [filterDari, setFilterDari] = useState(null);
    const [filterSampai, setFilterSampai] = useState(null);
    const [filterKendaraan, setFilterKendaraan] = useState('');
    const [search, setSearch] = useState('');

    /* Modals Perjalanan */
    const [modalBuatP, setModalBuatP] = useState(false);
    const [modalEditP, setModalEditP] = useState(null);
    const [modalDetailP, setModalDetailP] = useState(null);
    const [modalHapusP, setModalHapusP] = useState(null);
    const [formP, setFormP] = useState(initialFormPerjalanan);
    const fotoPerjalananRef = useRef();
    const [fotoPerjalanan, setFotoPerjalanan] = useState(null);
    const [fotoPerjalananInfo, setFotoPerjalananInfo] = useState(null);

    /* Modals BBM */
    const [modalBuatB, setModalBuatB] = useState(false);
    const [modalEditB, setModalEditB] = useState(null);
    const [modalHapusB, setModalHapusB] = useState(null);
    const [formB, setFormB] = useState(initialFormBBM);
    const fotoBBMRef = useRef();
    const [fotoBBM, setFotoBBM] = useState(null);
    const [fotoBBMInfo, setFotoBBMInfo] = useState(null);
    const [modalImagePreview, setModalImagePreview] = useState(null);

    /* Modals Maintenance */
    const [modalBuatM, setModalBuatM] = useState(false);
    const [modalEditM, setModalEditM] = useState(null);
    const [modalHapusM, setModalHapusM] = useState(null);
    const [formM, setFormM] = useState(initialFormMaint);
    const fotoMaintenanceRef = useRef();
    const [fotoMaintenance, setFotoMaintenance] = useState(null);
    const [fotoMaintenanceInfo, setFotoMaintenanceInfo] = useState(null);

    /* Modals Kendaraan */
    const [modalBuatK, setModalBuatK] = useState(false);
    const [modalEditK, setModalEditK] = useState(null);
    const [modalHapusK, setModalHapusK] = useState(null);
    const [formK, setFormK] = useState(initialFormKendaraan);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [r1, r2, r3, r4] = await Promise.all([
                api.get('/keuangan/kendaraan/'),
                api.get('/keuangan/log-perjalanan/'),
                api.get('/keuangan/log-bbm/'),
                api.get('/keuangan/log-maintenance/'),
            ]);
            setKendaraanList(r1.data);
            setLogPerjalanan(r2.data);
            setLogBBM(r3.data);
            setLogMaintenance(r4.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };
    const resetError = () => setError('');

    /* -- Filter -- */
    const applyFilter = useCallback((list, tglField = 'tanggal') => list.filter(i => {
        if (filterKendaraan && i.kendaraan !== parseInt(filterKendaraan)) return false;
        if (filterDari && new Date(i[tglField]) < filterDari) return false;
        if (filterSampai) { const s = new Date(filterSampai); s.setHours(23, 59, 59); if (new Date(i[tglField]) > s) return false; }
        if (search) { const q = search.toLowerCase(); const haystack = `${i.tujuan || ''} ${i.kendaraan_info || ''} ${i.driver_name || ''} ${i.driver_username || ''} ${i.deskripsi || ''}`.toLowerCase(); if (!haystack.includes(q)) return false; }
        return true;
    }), [filterKendaraan, filterDari, filterSampai, search]);

    const filteredB = useMemo(() => applyFilter(logBBM), [logBBM, applyFilter]);
    const filteredM = useMemo(() => applyFilter(logMaintenance), [logMaintenance, applyFilter]);

    /* -- Stats -- */
    const totalJarak = logPerjalanan.reduce((a, i) => a + (i.jarak_km || 0), 0);
    const totalBBM = logBBM.reduce((a, i) => a + Number(i.total_biaya || 0), 0);
    const totalMaint = logMaintenance.reduce((a, i) => a + Number(i.biaya || 0), 0);

    /* -- Handlers Perjalanan -- */
    const handleFotoPerjalananChange = async (e) => {
        setError('');
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            if (!file.type.startsWith('image/')) return setError('File harus berupa gambar.');
            const validation = validateImageFile(file);
            if (!validation.isValid) return setError(validation.error);
            const [compressedFile] = await compressImages([file], { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.75 });
            const reduction = Math.max(0, (1 - compressedFile.size / file.size) * 100).toFixed(1);
            setFotoPerjalanan(compressedFile);
            setFotoPerjalananInfo({
                name: file.name,
                originalSize: formatFileSize(file.size),
                compressedSize: formatFileSize(compressedFile.size),
                reduction,
            });
        } catch (err) {
            setError(`Gagal mengompres foto: ${err.message}`);
        } finally {
            if (e.target) e.target.value = '';
        }
    };

    const handleBuatP = async () => {
        setError('');
        if (!formP.kendaraan || !formP.tanggal || !formP.jam_berangkat || !formP.tujuan || !formP.km_awal)
            return setError('Kendaraan, tanggal, jam berangkat, tujuan, dan KM awal wajib diisi.');
        if (formP.km_akhir && Number(formP.km_akhir) < Number(formP.km_awal))
            return setError('KM akhir tidak boleh kurang dari KM awal.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formP).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (fotoPerjalanan) fd.append('foto', fotoPerjalanan);
            await api.post('/keuangan/log-perjalanan/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Log perjalanan berhasil disimpan!');
            setModalBuatP(false); setFormP(initialFormPerjalanan); setFotoPerjalanan(null); setFotoPerjalananInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleEditP = async () => {
        setError('');
        if (!formP.kendaraan || !formP.tanggal || !formP.jam_berangkat || !formP.tujuan || !formP.km_awal)
            return setError('Field wajib tidak boleh kosong.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formP).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (fotoPerjalanan) fd.append('foto', fotoPerjalanan);
            await api.patch(`/keuangan/log-perjalanan/${modalEditP.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Log perjalanan berhasil diupdate!');
            setModalEditP(null); setFormP(initialFormPerjalanan); setFotoPerjalanan(null); setFotoPerjalananInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal mengupdate.'); }
        finally { setSaving(false); }
    };

    const handleHapusP = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/log-perjalanan/${modalHapusP.id}/`);
            showSuccess('Log perjalanan berhasil dihapus.');
            setModalHapusP(null); fetchAll();
        } catch { setError('Gagal menghapus.'); }
        finally { setSaving(false); }
    };

    /* -- Handlers BBM -- */
    const handleFotoBBMChange = async (e) => {
        setError('');
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        
        const file = files[0];
        const originalSize = file.size;
        
        try {
            // Validate image
            if (!file.type.startsWith('image/')) {
                setError('File harus berupa gambar.');
                return;
            }
            
            // Compress image
            const compressedFiles = await compressImages([file], {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1920,
                quality: 0.75
            });
            
            if (compressedFiles.length > 0) {
                const compressedFile = compressedFiles[0];
                const compressedSize = compressedFile.size;
                const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
                
                setFotoBBM(compressedFile);
                setFotoBBMInfo({
                    originalSize: formatFileSize(originalSize),
                    compressedSize: formatFileSize(compressedSize),
                    reduction: reduction,
                    name: file.name
                });
                setSuccess(`Foto dikompres: ${reduction}% lebih kecil!`);
            }
        } catch (err) {
            setError(`Error kompresi: ${err.message}`);
        }
    };

    const handleBuatB = async () => {
        setError('');
        if (!formB.kendaraan || !formB.tanggal || !formB.total_biaya)
            return setError('Kendaraan, tanggal, dan total biaya wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formB).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (fotoBBM) fd.append('foto', fotoBBM);
            await api.post('/keuangan/log-bbm/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Log BBM berhasil disimpan!');
            setModalBuatB(false); setFormB(initialFormBBM); setFotoBBM(null); setFotoBBMInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleEditB = async () => {
        setError('');
        if (!formB.kendaraan || !formB.tanggal || !formB.total_biaya)
            return setError('Kendaraan, tanggal, dan total biaya wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formB).forEach(([k, v]) => { if (v && k !== 'id') fd.append(k, v); });
            if (fotoBBM && fotoBBM.remove) {
                fd.append('foto', ''); // Remove foto
            } else if (fotoBBM && fotoBBM instanceof File) {
                fd.append('foto', fotoBBM);
            }
            await api.patch(`/keuangan/log-bbm/${modalEditB.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Log BBM berhasil diupdate!');
            setModalEditB(null); setFormB(initialFormBBM); setFotoBBM(null); setFotoBBMInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal mengupdate.'); }
        finally { setSaving(false); }
    };

    const handleHapusB = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/log-bbm/${modalHapusB.id}/`);
            showSuccess('Log BBM berhasil dihapus.');
            setModalHapusB(null); fetchAll();
        } catch { setError('Gagal menghapus.'); }
        finally { setSaving(false); }
    };

    /* -- Handlers Maintenance -- */
    const handleBuatM = async () => {
        setError('');
        if (!formM.kendaraan || !formM.jenis || !formM.tanggal)
            return setError('Kendaraan, jenis, dan tanggal wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formM).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (fotoMaintenance) fd.append('foto', fotoMaintenance);
            await api.post('/keuangan/log-maintenance/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Log maintenance berhasil disimpan!');
            setModalBuatM(false); setFormM(initialFormMaint); setFotoMaintenance(null); setFotoMaintenanceInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleFotoMaintenanceChange = async (e) => {
        setError('');
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        
        const file = files[0];
        const originalSize = file.size;
        
        try {
            // Validate image
            if (!file.type.startsWith('image/')) {
                setError('File harus berupa gambar.');
                return;
            }
            
            // Compress image
            const compressedFiles = await compressImages([file], {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1920,
                quality: 0.75
            });
            
            if (compressedFiles.length > 0) {
                const compressedFile = compressedFiles[0];
                const compressedSize = compressedFile.size;
                const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
                
                setFotoMaintenance(compressedFile);
                setFotoMaintenanceInfo({
                    originalSize: formatFileSize(originalSize),
                    compressedSize: formatFileSize(compressedSize),
                    reduction: reduction,
                    name: file.name
                });
                setSuccess(`Foto dikompres: ${reduction}% lebih kecil!`);
            }
        } catch (err) {
            setError(`Error kompresi: ${err.message}`);
        }
    };

    const handleEditM = async () => {
        setError('');
        if (!formM.kendaraan || !formM.jenis || !formM.tanggal)
            return setError('Field wajib tidak boleh kosong.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formM).forEach(([k, v]) => { if (v && k !== 'id') fd.append(k, v); });
            if (fotoMaintenance && fotoMaintenance.remove) {
                fd.append('foto', ''); // Remove foto
            } else if (fotoMaintenance && fotoMaintenance instanceof File) {
                fd.append('foto', fotoMaintenance);
            }
            await api.patch(`/keuangan/log-maintenance/${modalEditM.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Log maintenance berhasil diupdate!');
            setModalEditM(null); setFormM(initialFormMaint); setFotoMaintenance(null); setFotoMaintenanceInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal mengupdate.'); }
        finally { setSaving(false); }
    };

    const handleHapusM = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/log-maintenance/${modalHapusM.id}/`);
            showSuccess('Log maintenance berhasil dihapus.');
            setModalHapusM(null); fetchAll();
        } catch { setError('Gagal menghapus.'); }
        finally { setSaving(false); }
    };

    /* -- Handlers Kendaraan -- */
    const handleBuatK = async () => {
        setError('');
        if (!formK.plat_nomor || !formK.nama || !formK.jenis)
            return setError('Plat nomor, nama, dan jenis wajib diisi.');
        setSaving(true);
        try {
            await api.post('/keuangan/kendaraan/', formK);
            showSuccess('Kendaraan berhasil ditambahkan!');
            setModalBuatK(false); setFormK(initialFormKendaraan); fetchAll();
        } catch (e) { setError(e.response?.data?.plat_nomor?.[0] || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleEditK = async () => {
        setError('');
        setSaving(true);
        try {
            await api.patch(`/keuangan/kendaraan/${modalEditK.id}/`, formK);
            showSuccess('Kendaraan berhasil diupdate!');
            setModalEditK(null); setFormK(initialFormKendaraan); fetchAll();
        } catch { setError('Gagal mengupdate.'); }
        finally { setSaving(false); }
    };

    const handleHapusK = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/kendaraan/${modalHapusK.id}/`);
            showSuccess('Kendaraan berhasil dihapus.');
            setModalHapusK(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menghapus.'); }
        finally { setSaving(false); }
    };

    /* -------------------------------- RENDER -------------------------------- */
    return (
        <div className="dr-page dr-shell">
            <style>{CSS}</style>

            {/* Header */}
            <div className="dr-hero">
                <div className="dr-hero-main">
                    <span className="dr-eyebrow"><Navigation size={14} /> Operasional Driver</span>
                    <h1 className="dr-title">Modul Driver</h1>
                    <p className="dr-subtitle">Pantau izin perjalanan, pemakaian BBM, maintenance, dan pool kendaraan dalam satu halaman kerja.</p>
                </div>
            </div>

            {success && <div className="dr-alert-ok">{success}</div>}

            {/* Stats */}
            <div className="dr-stat-grid">
                {[
                    { Icon: Car, label: 'Total Perjalanan', value: logPerjalanan.length + ' trip', color: '#1d4ed8', bg: '#eff6ff' },
                    { Icon: MapPin, label: 'Total Jarak', value: totalJarak.toLocaleString('id-ID') + ' km', color: '#1a4731', bg: '#e8f5ee' },
                    { Icon: Droplet, label: 'Total Biaya BBM', value: fmt(totalBBM), color: '#92400e', bg: '#fef3c7' },
                    { Icon: Wrench, label: 'Total Biaya Maintenance', value: fmt(totalMaint), color: '#7c3aed', bg: '#f5f3ff' },
                ].map((s, i) => (
                    <div key={i} className="dr-stat" style={{ animationDelay: `${i * .07}s`, '--accent': s.color, '--accent-bg': s.bg }}>
                        <div className="dr-stat-top">
                            <div>
                                <p className="dr-stat-label">{s.label}</p>
                                <p className="dr-stat-value" style={{ color: s.color }}>{s.value}</p>
                            </div>
                            <div className="dr-stat-icon">
                                <s.Icon size={20} strokeWidth={1.8} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="dr-tabs">
                {[
                    { key: 'perjalanan', label: 'Log Perjalanan', Icon: Navigation },
                    { key: 'bbm', label: 'Log BBM', Icon: Droplet },
                    { key: 'maintenance', label: 'Maintenance', Icon: Wrench },
                    { key: 'kendaraan', label: 'Pool Kendaraan', Icon: Truck },
                ].map(t => (
                    <button key={t.key} className={`dr-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
                        <t.Icon size={16} strokeWidth={1.8} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* -- TAB PERJALANAN -- */}
            {activeTab === 'perjalanan' && <LogPerjalanan isAdmin={isAdmin} />}

            {/* -- TAB BBM -- */}
            {activeTab === 'bbm' && (
                <div className="dr-panel">
                    <div className="dr-panel-head">
                        <div>
                            <h2 className="dr-panel-title">Log BBM</h2>
                            <p className="dr-panel-subtitle">Riwayat pengisian bahan bakar dan biaya per kendaraan.</p>
                        </div>
                        <button className="dr-btn-primary" onClick={() => { setFormB(initialFormBBM); setFotoBBM(null); setFotoBBMInfo(null); resetError(); setModalBuatB(true); }}><Plus size={16} /> Log BBM</button>
                    </div>
                    <div className="dr-filter-bar">
                        <div className="dr-filter-search">
                            <Search size={16} />
                            <input className="dr-input" placeholder="Cari kendaraan, driver, atau keterangan..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className="dr-select dr-filter-select" value={filterKendaraan} onChange={e => setFilterKendaraan(e.target.value)}>
                            <option value="">Semua Kendaraan</option>
                            {kendaraanList.map(k => <option key={k.id} value={k.id}>{k.plat_nomor} - {k.nama}</option>)}
                        </select>
                        <div className="dr-date-range">
                            <span className="dr-date-range-label"><CalendarDays size={14} /> Tgl</span>
                            <DatePicker selected={filterDari} onChange={setFilterDari} selectsStart startDate={filterDari} endDate={filterSampai} placeholderText="Dari" dateFormat="dd/MM/yy" locale={id} isClearable popperPlacement="bottom-end"
                                customInput={<input className="dr-date-input" />} />
                            <span style={{ fontSize: 11, color: '#cbd5e1' }}>–</span>
                            <DatePicker selected={filterSampai} onChange={setFilterSampai} selectsEnd startDate={filterDari} endDate={filterSampai} minDate={filterDari} placeholderText="Sampai" dateFormat="dd/MM/yy" locale={id} isClearable popperPlacement="bottom-end"
                                customInput={<input className="dr-date-input" />} />
                        </div>
                        {(search || filterKendaraan || filterDari || filterSampai) && (
                            <button className="dr-reset-btn"
                                onClick={() => { setSearch(''); setFilterKendaraan(''); setFilterDari(null); setFilterSampai(null); }}>
                                <X size={14} /> Reset
                            </button>
                        )}
                    </div>
                    {loading ? <div className="dr-empty">Memuat data...</div>
                        : filteredB.length === 0 ? <div className="dr-empty">Belum ada log BBM.</div>
                            : <div className="dr-table-wrap">
                                <table className="dr-table">
                                    <thead><tr>
                                        <th>Tanggal</th><th>Kendaraan</th>{isAdmin && <th>Driver</th>}
                                        <th style={{ textAlign: 'right' }}>KM Saat Isi</th><th style={{ textAlign: 'right' }}>Total Biaya</th><th>Keterangan</th><th style={{ textAlign: 'center' }}>Aksi</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredB.map((item, idx) => (
                                            <tr key={item.id} className="dr-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                                <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{fmtTgl(item.tanggal)}</td>
                                                <td><span style={{ fontWeight: 600, color: '#1a4731', fontSize: 12 }}>{item.kendaraan_info}</span></td>
                                                {isAdmin && <td style={{ fontSize: 12, color: '#64748b' }}>{item.driver_name || item.driver_username}</td>}
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{item.km_saat_isi ? item.km_saat_isi.toLocaleString('id-ID') + ' km' : '-'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{fmt(item.total_biaya)}</td>
                                                <td style={{ color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keterangan || '-'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div className="dr-action-cell">
                                                        {item.foto_url && <button className="dr-btn-sm n" onClick={() => setModalImagePreview(item.foto_url)}>Preview Foto</button>}
                                                        {isAdmin && <button className="dr-btn-sm b" onClick={() => { setFormB({ kendaraan: item.kendaraan, tanggal: item.tanggal, total_biaya: item.total_biaya, km_saat_isi: item.km_saat_isi || '', keterangan: item.keterangan || '' }); setFotoBBM(null); setFotoBBMInfo(null); resetError(); setModalBuatB(false); setModalEditB(item); }}>Edit</button>}
                                                        {isAdmin && <button className="dr-btn-sm r" onClick={() => { resetError(); setModalHapusB(item); }}>Hapus</button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>}
                </div>
            )}

            {/* -- TAB MAINTENANCE -- */}
            {activeTab === 'maintenance' && (
                <div className="dr-panel">
                    <div className="dr-panel-head">
                        <div>
                            <h2 className="dr-panel-title">Maintenance</h2>
                            <p className="dr-panel-subtitle">Catatan servis, penggantian komponen, dan biaya perawatan kendaraan.</p>
                        </div>
                        <button className="dr-btn-primary" onClick={() => { setFormM(initialFormMaint); setFotoMaintenance(null); setFotoMaintenanceInfo(null); resetError(); setModalBuatM(true); }}><Plus size={16} /> Log Maintenance</button>
                    </div>
                    <div className="dr-filter-bar">
                        <div className="dr-filter-search">
                            <Search size={16} />
                            <input className="dr-input" placeholder="Cari kendaraan, petugas, atau deskripsi..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className="dr-select dr-filter-select" value={filterKendaraan} onChange={e => setFilterKendaraan(e.target.value)}>
                            <option value="">Semua Kendaraan</option>
                            {kendaraanList.map(k => <option key={k.id} value={k.id}>{k.plat_nomor} - {k.nama}</option>)}
                        </select>
                        <div className="dr-date-range">
                            <span className="dr-date-range-label"><CalendarDays size={14} /> Tgl</span>
                            <DatePicker selected={filterDari} onChange={setFilterDari} selectsStart startDate={filterDari} endDate={filterSampai} placeholderText="Dari" dateFormat="dd/MM/yy" locale={id} isClearable popperPlacement="bottom-end"
                                customInput={<input className="dr-date-input" />} />
                            <span style={{ fontSize: 11, color: '#cbd5e1' }}>–</span>
                            <DatePicker selected={filterSampai} onChange={setFilterSampai} selectsEnd startDate={filterDari} endDate={filterSampai} minDate={filterDari} placeholderText="Sampai" dateFormat="dd/MM/yy" locale={id} isClearable popperPlacement="bottom-end"
                                customInput={<input className="dr-date-input" />} />
                        </div>
                        {(search || filterKendaraan || filterDari || filterSampai) && (
                            <button className="dr-reset-btn"
                                onClick={() => { setSearch(''); setFilterKendaraan(''); setFilterDari(null); setFilterSampai(null); }}>
                                <X size={14} /> Reset
                            </button>
                        )}
                    </div>
                    {loading ? <div className="dr-empty">Memuat data...</div>
                        : filteredM.length === 0 ? <div className="dr-empty">Belum ada log maintenance.</div>
                            : <div className="dr-table-wrap">
                                <table className="dr-table">
                                    <thead><tr>
                                        <th>Tanggal</th><th>Kendaraan</th><th>Jenis</th>
                                        <th style={{ textAlign: 'right' }}>Biaya</th><th>Deskripsi</th><th>Dicatat Oleh</th><th style={{ textAlign: 'center' }}>Aksi</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredM.map((item, idx) => (
                                            <tr key={item.id} className="dr-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                                <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{fmtTgl(item.tanggal)}</td>
                                                <td><span style={{ fontWeight: 600, color: '#1a4731', fontSize: 12 }}>{item.kendaraan_info}</span></td>
                                                <td>
                                                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>
                                                        {item.jenis_label}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmt(item.biaya)}</td>
                                                <td style={{ color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.deskripsi || '-'}</td>
                                                <td style={{ fontSize: 12, color: '#64748b' }}>{item.dilaporkan_oleh_name || '-'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div className="dr-action-cell">
                                                        {item.foto_url && <button className="dr-btn-sm n" onClick={() => setModalImagePreview(item.foto_url)}>Preview Foto</button>}
                                                        {isAdmin && <button className="dr-btn-sm b" onClick={() => { setFormM({ kendaraan: item.kendaraan, jenis: item.jenis, tanggal: item.tanggal, biaya: item.biaya, deskripsi: item.deskripsi || '' }); setFotoMaintenance(null); setFotoMaintenanceInfo(null); resetError(); setModalBuatM(false); setModalEditM(item); }}>Edit</button>}
                                                        {isAdmin && <button className="dr-btn-sm r" onClick={() => { resetError(); setModalHapusM(item); }}>Hapus</button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>}
                </div>
            )}

            {/* -- TAB KENDARAAN -- */}
            {activeTab === 'kendaraan' && (
                <div className="dr-panel">
                    <div className="dr-panel-head">
                        <div>
                            <h2 className="dr-panel-title">Pool Kendaraan</h2>
                            <p className="dr-panel-subtitle">Daftar kendaraan aktif dan non-aktif yang tersedia untuk operasional.</p>
                        </div>
                        {isAdmin && <button className="dr-btn-primary" onClick={() => { setFormK(initialFormKendaraan); resetError(); setModalBuatK(true); }}><Plus size={16} /> Tambah Kendaraan</button>}
                    </div>
                    <div className="dr-vehicle-grid" style={{ padding: 16 }}>
                        {loading ? <div className="dr-empty" style={{ gridColumn: '1/-1' }}>Memuat data...</div>
                            : kendaraanList.length === 0 ? <div className="dr-empty" style={{ gridColumn: '1/-1' }}>Belum ada kendaraan.</div>
                                : kendaraanList.map((k, idx) => {
                                    const meta = JENIS_KENDARAAN[k.jenis] || JENIS_KENDARAAN.lainnya;
                                    return (
                                        <div key={k.id} className="dr-kendaraan-card" style={{ animationDelay: `${idx * .07}s` }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ width: 44, height: 44, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}><meta.Icon size={24} color={meta.color} strokeWidth={1.5} /></div>
                                                    <div>
                                                        <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{k.nama}</p>
                                                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color }}>{meta.label}</span>
                                                    </div>
                                                </div>
                                                {!k.is_active && <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99 }}>Non-aktif</span>}
                                            </div>
                                            <div className="dr-plate-box">
                                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>Plat Nomor</p>
                                                <p style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#1e293b', letterSpacing: '.05em' }}>{k.plat_nomor}</p>
                                            </div>
                                            {k.keterangan && <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>{k.keterangan}</p>}
                                            {isAdmin && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button className="dr-btn-sm b" onClick={() => { setFormK({ plat_nomor: k.plat_nomor, nama: k.nama, jenis: k.jenis, keterangan: k.keterangan || '', is_active: k.is_active }); resetError(); setModalEditK(k); }}>Edit</button>
                                                    <button className="dr-btn-sm r" onClick={() => { resetError(); setModalHapusK(k); }}>Hapus</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                    </div>
                </div>
            )}

            {/* ---- MODALS ---- */}

            {/* Modal Buat/Edit Perjalanan */}
            {(modalBuatP || modalEditP) && (
                <Modal>
                    <div className="dr-modal">
                        <ModalHeader
                            icon={<Navigation size={18} />}
                            title={modalEditP ? 'Edit Log Perjalanan' : 'Tambah Log Perjalanan'}
                            subtitle="Isi data kendaraan, rute, odometer, waktu perjalanan, dan foto bila ada."
                        />
                        {error && <div className="dr-alert-err">{error}</div>}
                        <ModalSection icon={<BookOpen size={14} />} title="Data Perjalanan">
                            <div className="dr-field">
                                <label className="dr-label">Kendaraan *</label>
                                <select className="dr-select" value={formP.kendaraan} onChange={e => setFormP({ ...formP, kendaraan: e.target.value })}>
                                    <option value="">-- Pilih Kendaraan --</option>
                                    {kendaraanList.filter(k => k.is_active).map(k => <option key={k.id} value={k.id}>{k.plat_nomor} - {k.nama}</option>)}
                                </select>
                            </div>
                            <div className="dr-grid2">
                                <div className="dr-field">
                                    <label className="dr-label">Tanggal *</label>
                                    <DatePicker selected={strToDate(formP.tanggal)} onChange={d => setFormP({ ...formP, tanggal: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                                </div>
                                <div className="dr-field">
                                    <label className="dr-label">Tujuan *</label>
                                    <input className="dr-input" placeholder="Contoh: RSUD Samarinda" value={formP.tujuan} onChange={e => setFormP({ ...formP, tujuan: e.target.value })} />
                                </div>
                            </div>
                            <div className="dr-grid2">
                                <div className="dr-field">
                                    <label className="dr-label">Jam Berangkat *</label>
                                    <input className="dr-input" type="time" value={formP.jam_berangkat} onChange={e => setFormP({ ...formP, jam_berangkat: e.target.value })} />
                                </div>
                                <div className="dr-field">
                                    <label className="dr-label">Jam Kembali <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                    <input className="dr-input" type="time" value={formP.jam_kembali} onChange={e => setFormP({ ...formP, jam_kembali: e.target.value })} />
                                </div>
                            </div>
                            <div className="dr-grid2">
                                <div className="dr-field">
                                    <label className="dr-label">KM Awal *</label>
                                    <input className="dr-input" type="number" placeholder="Contoh: 12500" value={formP.km_awal} onChange={e => setFormP({ ...formP, km_awal: e.target.value })} />
                                </div>
                                <div className="dr-field">
                                    <label className="dr-label">KM Akhir <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                    <input className="dr-input" type="number" placeholder="Contoh: 12560" value={formP.km_akhir} onChange={e => setFormP({ ...formP, km_akhir: e.target.value })} />
                                    {formP.km_akhir && formP.km_awal && Number(formP.km_akhir) > Number(formP.km_awal) && (
                                        <p style={{ fontSize: 11, color: '#166534', marginTop: 3, fontWeight: 600 }}>Jarak: {(Number(formP.km_akhir) - Number(formP.km_awal)).toLocaleString('id-ID')} km</p>
                                    )}
                                </div>
                            </div>
                            <div className="dr-field">
                                <label className="dr-label">Penumpang <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                <input className="dr-input" placeholder="Nama penumpang jika ada" value={formP.penumpang} onChange={e => setFormP({ ...formP, penumpang: e.target.value })} />
                            </div>
                            <div className="dr-field">
                                <label className="dr-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                <textarea className="dr-textarea" style={{ minHeight: 60 }} value={formP.keterangan} onChange={e => setFormP({ ...formP, keterangan: e.target.value })} />
                            </div>
                        </ModalSection>
                        <ModalSection icon={<Camera size={14} />} title="Lampiran">
                            <input ref={fotoPerjalananRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoPerjalananChange} />
                            <FileUploadZone file={fotoPerjalanan} label="Upload Foto (opsional)" hint="Foto kendaraan / bukti perjalanan akan dikompres otomatis." onPick={() => fotoPerjalananRef.current.click()} />
                            <UploadPreview file={fotoPerjalanan} info={fotoPerjalananInfo} existingUrl={modalEditP?.foto_url && !fotoPerjalanan ? modalEditP.foto_url : ''} label="Foto perjalanan" onPreview={setModalImagePreview} />
                        </ModalSection>
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalBuatP(false); setModalEditP(null); setFotoPerjalanan(null); setFotoPerjalananInfo(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary" onClick={modalEditP ? handleEditP : handleBuatP} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Detail Perjalanan */}
            {modalDetailP && (
                <Modal>
                    <div className="dr-modal lg">
                        <ModalHeader
                            icon={<Navigation size={18} />}
                            title="Detail Log Perjalanan"
                            subtitle="Ringkasan rute, kendaraan, waktu, odometer, dan foto perjalanan."
                        />
                        <ModalSummary
                            label={modalDetailP.no_perjalanan || 'Log Perjalanan'}
                            value={modalDetailP.tujuan}
                            description={modalDetailP.kendaraan_info}
                            meta={`Tanggal ${fmtTgl(modalDetailP.tanggal)}`}
                            side={<MiniStatus label={`${modalDetailP.jarak_km || 0} km`} color="#1d4ed8" bg="#eff6ff" />}
                        />
                        <ModalSection icon={<BookOpen size={14} />} title="Data Perjalanan">
                            <DetailGrid items={[
                                ['Tanggal', fmtTgl(modalDetailP.tanggal)],
                                ['Kendaraan', modalDetailP.kendaraan_info],
                                ['Driver', modalDetailP.driver_name || modalDetailP.driver_username],
                                ['Tujuan', modalDetailP.tujuan],
                                ['Jam Berangkat', modalDetailP.jam_berangkat?.slice(0, 5)],
                                ['Jam Kembali', modalDetailP.jam_kembali?.slice(0, 5) || '-'],
                                ['KM Awal', modalDetailP.km_awal?.toLocaleString('id-ID') + ' km'],
                                ['KM Akhir', modalDetailP.km_akhir ? modalDetailP.km_akhir.toLocaleString('id-ID') + ' km' : '-'],
                                ['Jarak Tempuh', modalDetailP.jarak_km ? modalDetailP.jarak_km.toLocaleString('id-ID') + ' km' : '-'],
                                ['Penumpang', modalDetailP.penumpang || '-'],
                            ]} />
                            {modalDetailP.keterangan && <div><p className="dr-detail-label">Keterangan</p><p className="dr-detail-value">{modalDetailP.keterangan}</p></div>}
                        </ModalSection>
                        {modalDetailP.foto_url && (
                            <ModalSection icon={<Camera size={14} />} title="Lampiran">
                                <UploadPreview existingUrl={modalDetailP.foto_url} label="Foto perjalanan" onPreview={setModalImagePreview} />
                            </ModalSection>
                        )}
                        <div className="dr-modal-footer"><button className="dr-btn-ghost" onClick={() => setModalDetailP(null)}>Tutup</button></div>
                    </div>
                </Modal>
            )}

            {/* Modal Hapus Perjalanan */}
            {modalHapusP && (
                <Modal>
                    <div className="dr-modal sm">
                        <h2 style={S.mt}>Hapus Log Perjalanan</h2>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{fmtTgl(modalHapusP.tanggal)} - {modalHapusP.tujuan}</p>
                            <p style={{ fontSize: 13, color: '#64748b' }}>{modalHapusP.kendaraan_info}</p>
                        </div>
                        {error && <div className="dr-alert-err">{error}</div>}
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalHapusP(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary danger" onClick={handleHapusP} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Buat/Edit BBM */}
            {(modalBuatB || modalEditB) && (
                <Modal>
                    <div className="dr-modal">
                        <ModalHeader
                            icon={<Droplet size={18} />}
                            title={modalEditB ? 'Edit Log BBM' : 'Tambah Log BBM'}
                            subtitle="Catat pengisian BBM, biaya, odometer, dan bukti struk bila ada."
                        />
                        {error && <div className="dr-alert-err">{error}</div>}
                        <ModalSection icon={<BookOpen size={14} />} title="Data BBM">
                            <div className="dr-field">
                                <label className="dr-label">Kendaraan *</label>
                                <select className="dr-select" value={formB.kendaraan} onChange={e => setFormB({ ...formB, kendaraan: e.target.value })}>
                                    <option value="">-- Pilih Kendaraan --</option>
                                    {kendaraanList.filter(k => k.is_active).map(k => <option key={k.id} value={k.id}>{k.plat_nomor} - {k.nama}</option>)}
                                </select>
                            </div>
                            <div className="dr-grid2">
                                <div className="dr-field">
                                    <label className="dr-label">Tanggal *</label>
                                    <DatePicker selected={strToDate(formB.tanggal)} onChange={d => setFormB({ ...formB, tanggal: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                                </div>
                                <div className="dr-field">
                                    <label className="dr-label">Total Biaya (Rp) *</label>
                                    <input className="dr-input" type="number" placeholder="0" value={formB.total_biaya} onChange={e => setFormB({ ...formB, total_biaya: e.target.value })} />
                                </div>
                            </div>
                            <div className="dr-field">
                                <label className="dr-label">KM Odometer Saat Isi <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                <input className="dr-input" type="number" placeholder="Contoh: 12560" value={formB.km_saat_isi} onChange={e => setFormB({ ...formB, km_saat_isi: e.target.value })} />
                            </div>
                            <div className="dr-field">
                                <label className="dr-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                <textarea className="dr-textarea" style={{ minHeight: 60 }} value={formB.keterangan} onChange={e => setFormB({ ...formB, keterangan: e.target.value })} />
                            </div>
                        </ModalSection>
                        <ModalSection icon={<Camera size={14} />} title="Lampiran">
                            <input ref={fotoBBMRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoBBMChange} />
                            <FileUploadZone file={fotoBBM instanceof File ? fotoBBM : null} label="Upload Struk / Bukti (opsional)" hint="Foto struk akan dikompres otomatis." onPick={() => fotoBBMRef.current.click()} />
                            <UploadPreview file={fotoBBM instanceof File ? fotoBBM : null} info={fotoBBMInfo} existingUrl={modalEditB?.foto_url && !fotoBBM ? modalEditB.foto_url : ''} label="Foto struk BBM" onPreview={setModalImagePreview} />
                            {modalEditB && modalEditB.foto_url && !fotoBBM && (
                                <button type="button" className="dr-btn-sm r" onClick={() => setFotoBBM({ remove: true })}>Hapus Foto</button>
                            )}
                        </ModalSection>
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalBuatB(false); setModalEditB(null); setFormB(initialFormBBM); setFotoBBM(null); setFotoBBMInfo(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary" onClick={modalEditB ? handleEditB : handleBuatB} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Hapus BBM */}
            {modalHapusB && (
                <Modal>
                    <div className="dr-modal sm">
                        <h2 style={S.mt}>Hapus Log BBM</h2>
                        <p style={{ fontSize: 14, color: '#475569', marginBottom: 20 }}>Hapus log BBM <strong>{fmtTgl(modalHapusB.tanggal)}</strong> - {fmt(modalHapusB.total_biaya)}?</p>
                        {error && <div className="dr-alert-err">{error}</div>}
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalHapusB(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary danger" onClick={handleHapusB} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Buat Maintenance */}
            {(modalBuatM || modalEditM) && (
                <Modal>
                    <div className="dr-modal">
                        <ModalHeader
                            icon={<Wrench size={18} />}
                            title={modalEditM ? 'Edit Log Maintenance' : 'Tambah Log Maintenance'}
                            subtitle="Catat perawatan kendaraan, jenis pekerjaan, biaya, dan foto dokumentasi."
                        />
                        {error && <div className="dr-alert-err">{error}</div>}
                        <ModalSection icon={<BookOpen size={14} />} title="Data Maintenance">
                            <div className="dr-field">
                                <label className="dr-label">Kendaraan *</label>
                                <select className="dr-select" value={formM.kendaraan} onChange={e => setFormM({ ...formM, kendaraan: e.target.value })}>
                                    <option value="">-- Pilih Kendaraan --</option>
                                    {kendaraanList.map(k => <option key={k.id} value={k.id}>{k.plat_nomor} - {k.nama}</option>)}
                                </select>
                            </div>
                            <div className="dr-grid2">
                                <div className="dr-field">
                                    <label className="dr-label">Jenis Maintenance *</label>
                                    <select className="dr-select" value={formM.jenis} onChange={e => setFormM({ ...formM, jenis: e.target.value })}>
                                        {JENIS_MAINTENANCE.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                                    </select>
                                </div>
                                <div className="dr-field">
                                    <label className="dr-label">Tanggal *</label>
                                    <DatePicker selected={strToDate(formM.tanggal)} onChange={d => setFormM({ ...formM, tanggal: dateToStr(d) })} dateFormat="dd MMMM yyyy" locale={id} placeholderText="Pilih tanggal..." showMonthDropdown showYearDropdown dropdownMode="select" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }} />
                                </div>
                            </div>
                            <div className="dr-field">
                                <label className="dr-label">Biaya (Rp)</label>
                                <input className="dr-input" type="number" placeholder="0" value={formM.biaya} onChange={e => setFormM({ ...formM, biaya: e.target.value })} />
                            </div>
                            <div className="dr-field">
                                <label className="dr-label">Deskripsi <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                <textarea className="dr-textarea" style={{ minHeight: 70 }} placeholder="Detail pekerjaan maintenance..." value={formM.deskripsi} onChange={e => setFormM({ ...formM, deskripsi: e.target.value })} />
                            </div>
                        </ModalSection>
                        <ModalSection icon={<Camera size={14} />} title="Lampiran">
                            <input ref={fotoMaintenanceRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoMaintenanceChange} />
                            <FileUploadZone file={fotoMaintenance instanceof File ? fotoMaintenance : null} label="Upload Foto (opsional)" hint="Foto maintenance akan dikompres otomatis." onPick={() => fotoMaintenanceRef.current.click()} />
                            <UploadPreview file={fotoMaintenance instanceof File ? fotoMaintenance : null} info={fotoMaintenanceInfo} existingUrl={modalEditM?.foto_url && !fotoMaintenance ? modalEditM.foto_url : ''} label="Foto maintenance" onPreview={setModalImagePreview} />
                        </ModalSection>
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalBuatM(false); setModalEditM(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary" onClick={modalEditM ? handleEditM : handleBuatM} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Hapus Maintenance */}
            {modalHapusM && (
                <Modal>
                    <div className="dr-modal sm">
                        <h2 style={S.mt}>Hapus Log Maintenance</h2>
                        <p style={{ fontSize: 14, color: '#475569', marginBottom: 20 }}>Hapus log <strong>{modalHapusM.jenis_label}</strong> untuk {modalHapusM.kendaraan_info}?</p>
                        {error && <div className="dr-alert-err">{error}</div>}
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalHapusM(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary danger" onClick={handleHapusM} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Buat/Edit Kendaraan */}
            {(modalBuatK || modalEditK) && (
                <Modal>
                    <div className="dr-modal sm">
                        <h2 style={S.mt}>{modalEditK ? 'Edit Kendaraan' : 'Tambah Kendaraan'}</h2>
                        {error && <div className="dr-alert-err">{error}</div>}
                        <div className="dr-field">
                            <label className="dr-label">Plat Nomor *</label>
                            <input className="dr-input" placeholder="Contoh: KT 1234 AB" value={formK.plat_nomor} onChange={e => setFormK({ ...formK, plat_nomor: e.target.value.toUpperCase() })} />
                        </div>
                        <div className="dr-field">
                            <label className="dr-label">Nama Kendaraan *</label>
                            <input className="dr-input" placeholder="Contoh: Avanza Putih, Ambulans 1" value={formK.nama} onChange={e => setFormK({ ...formK, nama: e.target.value })} />
                        </div>
                        <div className="dr-field">
                            <label className="dr-label">Jenis *</label>
                            <select className="dr-select" value={formK.jenis} onChange={e => setFormK({ ...formK, jenis: e.target.value })}>
                                {Object.entries(JENIS_KENDARAAN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                        <div className="dr-field">
                            <label className="dr-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                            <textarea className="dr-textarea" style={{ minHeight: 60 }} value={formK.keterangan} onChange={e => setFormK({ ...formK, keterangan: e.target.value })} />
                        </div>
                        {modalEditK && (
                            <div className="dr-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={formK.is_active} onChange={e => setFormK({ ...formK, is_active: e.target.checked })} />
                                    Kendaraan aktif
                                </label>
                            </div>
                        )}
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalBuatK(false); setModalEditK(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary" onClick={modalEditK ? handleEditK : handleBuatK} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Hapus Kendaraan */}
            {modalHapusK && (
                <Modal>
                    <div className="dr-modal sm">
                        <h2 style={S.mt}>Hapus Kendaraan</h2>
                        <p style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>Yakin hapus <strong>{modalHapusK.nama}</strong> ({modalHapusK.plat_nomor})?</p>
                        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>Data log perjalanan yang sudah ada tidak akan terhapus.</p>
                        {error && <div className="dr-alert-err">{error}</div>}
                        <div className="dr-modal-footer">
                            <button className="dr-btn-ghost" onClick={() => { setModalHapusK(null); resetError(); }}>Batal</button>
                            <button className="dr-btn-primary danger" onClick={handleHapusK} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Preview Foto */}
            {modalImagePreview && createPortal(
                <div className="dr-overlay" onClick={() => setModalImagePreview(null)} style={{ backdropFilter: 'blur(4px)', padding: '20px' }}>
                    <div style={{ position: 'relative', width: 'min(95vw, 95vh)', height: 'min(95vh, 95vw)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <img src={modalImagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: '8px' }} />
                        <button style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s' }} onMouseEnter={e => e.target.style.background = 'rgba(0,0,0,0.4)'} onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.2)'} onClick={() => setModalImagePreview(null)}>x</button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

const S = {
    mt: { fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 24 },
    dk: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
    dv: { fontSize: 14, color: '#1e293b', fontWeight: 500 },
};



