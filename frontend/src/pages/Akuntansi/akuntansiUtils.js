/**
 * Utility helpers for SIMAK Accounting Module (FASE 4)
 * - Currency & Date formatting with tabular figures support
 * - Client-side Excel (.xlsx / SpreadsheetML) & Print PDF export
 */

export const JENIS_JURNAL_OPTIONS = [
    { value: '', label: 'Semua Jenis Jurnal' },
    { value: 'umum', label: 'Jurnal Umum (UM)' },
    { value: 'penjualan', label: 'Penjualan / Klaim (PJ)' },
    { value: 'pembelian', label: 'Pembelian / GRN (PB)' },
    { value: 'kas_bank', label: 'Kas & Bank (KB)' },
    { value: 'persediaan', label: 'Persediaan & Opname (PS)' },
    { value: 'penyusutan', label: 'Penyusutan Aset (PY)' },
    { value: 'penyesuaian', label: 'Penyesuaian (AJ)' },
];

export const JENIS_JURNAL_LABELS = {
    umum: 'Jurnal Umum',
    penjualan: 'Penjualan / Klaim',
    pembelian: 'Pembelian',
    kas_bank: 'Kas & Bank',
    persediaan: 'Persediaan',
    penyusutan: 'Penyusutan',
    penyesuaian: 'Penyesuaian',
};

export const TIPE_AKUN_OPTIONS = [
    { value: 'aset_lancar', label: 'Aset Lancar', kategori: 'neraca', saldo_normal: 'debit' },
    { value: 'aset_tetap', label: 'Aset Tetap', kategori: 'neraca', saldo_normal: 'debit' },
    { value: 'aset_lainnya', label: 'Aset Lainnya', kategori: 'neraca', saldo_normal: 'debit' },
    { value: 'kewajiban_lancar', label: 'Kewajiban Lancar', kategori: 'neraca', saldo_normal: 'kredit' },
    { value: 'kewajiban_jangka_panjang', label: 'Kewajiban Jangka Panjang', kategori: 'neraca', saldo_normal: 'kredit' },
    { value: 'ekuitas', label: 'Ekuitas', kategori: 'neraca', saldo_normal: 'kredit' },
    { value: 'pendapatan', label: 'Pendapatan Pelayanan', kategori: 'laba_rugi', saldo_normal: 'kredit' },
    { value: 'harga_pokok', label: 'Harga Pokok Pelayanan (HPP)', kategori: 'laba_rugi', saldo_normal: 'debit' },
    { value: 'beban_operasional', label: 'Beban Operasional', kategori: 'laba_rugi', saldo_normal: 'debit' },
    { value: 'pendapatan_lainnya', label: 'Pendapatan Lain-Lain', kategori: 'laba_rugi', saldo_normal: 'kredit' },
    { value: 'beban_lainnya', label: 'Beban Lain-Lain', kategori: 'laba_rugi', saldo_normal: 'debit' },
];

export function formatRp(value, showPrefix = true) {
    const num = Number(value || 0);
    if (Number.isNaN(num)) return showPrefix ? 'Rp 0,00' : '0,00';
    const isNeg = num < 0;
    const absStr = Math.abs(num).toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const prefix = showPrefix ? 'Rp ' : '';
    return isNeg ? `(${prefix}${absStr})` : `${prefix}${absStr}`;
}

export function formatDateId(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function getMonthDateRange(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const toIso = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
        start_date: toIso(first),
        end_date: toIso(last),
        today: toIso(dateObj),
    };
}

/**
 * Exports structured rows to an Excel-compatible SpreadsheetML (.xlsx / .xls) file.
 */
export function exportToExcel({ filename = 'Laporan_Akuntansi.xlsx', sheetName = 'Laporan', headers = [], rows = [] }) {
    const esc = (v) =>
        String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    const headerCells = headers
        .map((h) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${esc(h)}</Data></Cell>`)
        .join('');

    const bodyRows = rows
        .map((row) => {
            const cells = row
                .map((cell) => {
                    if (typeof cell === 'number' && !Number.isNaN(cell)) {
                        return `<Cell ss:StyleID="sNum"><Data ss:Type="Number">${cell}</Data></Cell>`;
                    }
                    return `<Cell><Data ss:Type="String">${esc(cell)}</Data></Cell>`;
                })
                .join('');
            return `<Row>${cells}</Row>`;
        })
        .join('\n');

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="sHeader">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sNum">
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${esc(sheetName.slice(0, 31))}">
  <Table>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename : `${filename}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Opens a clean print-to-PDF window for any Financial Report table.
 */
export function printReportPdf({ title, subtitle, htmlContent }) {
    const win = window.open('', '_blank', 'width=1024,height=768');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      color: #1a1f36;
      margin: 24px;
      font-size: 12px;
    }
    .hdr {
      border-bottom: 2px solid #1a1f36;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .hdr h1 { margin: 0; font-size: 18px; }
    .hdr p { margin: 4px 0 0; color: #697386; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      color: #697386;
      border-bottom: 1px solid #d8dee4;
      padding: 7px 8px;
    }
    td {
      padding: 7px 8px;
      border-bottom: 1px solid #e3e8ee;
    }
    .akt-num { text-align: right; font-variant-numeric: tabular-nums; }
    .akt-row-section td {
      font-weight: 700;
      text-transform: uppercase;
      color: #697386;
      padding-top: 12px;
    }
    .akt-row-subtotal td {
      font-weight: 600;
      background: #f7fafc;
      border-top: 1px solid #d8dee4;
    }
    .akt-row-grandtotal td {
      font-weight: 700;
      background: #f7fafc;
      border-top: 1px solid #1a1f36;
      border-bottom: 2px solid #1a1f36;
    }
  </style>
</head>
<body onload="setTimeout(() => { window.print(); }, 200)">
  <div class="hdr">
    <h1>RS SIAGA AL MUNAWWARAH SAMARINDA — ${title}</h1>
    <p>${subtitle || ''}</p>
  </div>
  ${htmlContent}
</body>
</html>`);
    win.document.close();
}
