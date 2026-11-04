import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import useBodyScrollLock from './useBodyScrollLock';
import './Aset.css';

export default function QrLabelModal({ aset, isOpen, onClose }) {
    useBodyScrollLock(isOpen, onClose);

    const printAreaRef = useRef(null);

    if (!isOpen || !aset) return null;

    // Format payload lengkap agar saat QR di-scan oleh kamera HP / barcode reader
    // memunculkan detail lengkap: Kode Aset, Nama Barang, Spesifikasi/Merek, dan Unit Penanggung Jawab
    const spesifikasiText = [aset.merk, aset.spesifikasi].filter(Boolean).join(' - ') || '-';
    const unitText = [aset.unit_nama, aset.ruangan_nama || aset.lokasi_teks].filter(Boolean).join(' - ') || '-';

    const qrPayload = [
        `RS SIAGA AL-MUNAWWARAH`,
        `Kode Aset: ${aset.kode_aset || '-'}`,
        `Nama Barang: ${aset.deskripsi || '-'}`,
        `Spesifikasi: ${spesifikasiText}`,
        aset.nomor_seri ? `No. Seri: ${aset.nomor_seri}` : null,
        `Unit: ${unitText}`,
    ].filter(Boolean).join('\n');

    const handlePrint = () => {
        const printContent = printAreaRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '', 'width=650,height=450');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Label Stiker Aset - ${aset.kode_aset}</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            margin: 0;
                            padding: 12px;
                            background: #ffffff;
                            color: #000000;
                        }
                        .aset-qr-tag {
                            border: 2px solid #000000;
                            border-radius: 6px;
                            padding: 12px 14px;
                            width: 350px;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            box-sizing: border-box;
                            background: #ffffff;
                            color: #000000;
                        }
                        .aset-qr-box {
                            flex-shrink: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .aset-qr-info {
                            flex: 1;
                            text-align: left;
                        }
                        .aset-qr-hospital {
                            font-size: 8.5px;
                            font-weight: 800;
                            letter-spacing: 0.05em;
                            color: #444444;
                            text-transform: uppercase;
                            margin-bottom: 2px;
                        }
                        .aset-qr-code {
                            font-size: 15px;
                            font-weight: 900;
                            color: #000000;
                            margin: 1px 0;
                            font-family: monospace;
                        }
                        .aset-qr-desc {
                            font-size: 11px;
                            font-weight: 700;
                            color: #111111;
                            line-height: 1.3;
                        }
                        .aset-qr-loc {
                            font-size: 9.5px;
                            color: #555555;
                            margin-top: 3px;
                            font-weight: 500;
                        }
                        @media print {
                            body { padding: 0; margin: 0; }
                            .aset-qr-tag { border-width: 1.5px; }
                        }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                    <script>
                        window.onload = function() { window.print(); window.close(); };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return createPortal(
        <div className="aset-modal-overlay" onClick={onClose}>
            <div className="aset-modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
                <div className="aset-modal-header">
                    <h3>
                        <QrCode size={18} color="#6366f1" />
                        Label QR Code Aset
                    </h3>
                    <button className="aset-modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="aset-modal-body" style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '0 0 14px 0' }}>
                        Label stiker inventaris siap cetak. QR Code berisi informasi lengkap aset saat di-scan kamera smartphone.
                    </p>

                    {/* Printable Tag Area */}
                    <div ref={printAreaRef} style={{ display: 'inline-block' }}>
                        <div className="aset-qr-tag">
                            <div className="aset-qr-box">
                                <QRCodeSVG
                                    value={qrPayload}
                                    size={92}
                                    level="M"
                                    includeMargin={false}
                                />
                            </div>
                            <div className="aset-qr-info" style={{ textAlign: 'left' }}>
                                <div className="aset-qr-hospital">RS SIAGA AL-MUNAWWARAH</div>
                                <div className="aset-qr-code">{aset.kode_aset}</div>
                                <div className="aset-qr-desc">
                                    {aset.deskripsi} {aset.merk ? `(${aset.merk})` : ''}
                                    {aset.spesifikasi ? ` - ${aset.spesifikasi}` : ''}
                                </div>
                                <div className="aset-qr-loc">
                                    {unitText}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payload Preview */}
                    <div className="aset-form-section" style={{ marginTop: '16px', padding: '12px 14px', textAlign: 'left' }}>
                        <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <QrCode size={13} />
                            Teks Muncul Saat QR Di-Scan:
                        </div>
                        <pre className="aset-readonly-box" style={{
                            margin: 0,
                            fontSize: '11px',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            padding: '8px 10px',
                            height: 'auto',
                            display: 'block',
                            lineHeight: 1.45,
                        }}>
                            {qrPayload}
                        </pre>
                    </div>
                </div>

                <div className="aset-modal-footer">
                    <button type="button" className="btn-aset btn-aset-secondary" onClick={onClose}>
                        Tutup
                    </button>
                    <button type="button" className="btn-aset btn-aset-primary" onClick={handlePrint}>
                        <Printer size={14} /> Cetak Label Stiker
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
