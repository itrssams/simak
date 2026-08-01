import { jsPDF } from "jspdf";

const ROMAN_MONTH = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function romanMonth(dateStr) {
    if (!dateStr) return '';
    const m = parseInt(dateStr.split('-')[1], 10);
    return ROMAN_MONTH[m - 1] || '';
}

function getYear(dateStr) {
    return dateStr ? dateStr.split('-')[0] : '';
}

function formatDateToIndo(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
}

function fmtMoney(num) {
    if (!num) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadImageWithDimensions(path) {
    try {
        const res = await fetch(encodeURI(path));
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result;
                const img = new Image();
                img.onload = () => resolve({ dataUrl, width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
                img.onerror = () => resolve({ dataUrl: null, width: 1, height: 1 });
                img.src = dataUrl;
            };
            reader.onerror = () => resolve({ dataUrl: null, width: 1, height: 1 });
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('Gagal memuat image logo:', path, err);
        return { dataUrl: null, width: 1, height: 1 };
    }
}

// Definisi kolom tabel: satu sumber kebenaran dipakai bareng
// buat header maupun isi baris, supaya selalu sejajar.
const COLUMNS = [
    { key: 'no', label: 'NO', x: 15, width: 8, align: 'left' },
    { key: 'kode', label: 'KODE', x: 23, width: 15, align: 'left' },
    { key: 'nama', label: 'NAMA BARANG', x: 39, width: 55, align: 'left' },
    { key: 'qty', label: 'QTY', x: 96, width: 12, align: 'right' },
    { key: 'satuan', label: '', x: 110, width: 14, align: 'left' },
    { key: 'disc', label: 'DISC', x: 126, width: 12, align: 'right' },
    { key: 'harga', label: 'HARGA', x: 140, width: 20, align: 'right' },
    { key: 'total', label: 'TOTAL', x: 162, width: 22, align: 'right' },
    { key: 'ket', label: 'KET', x: 186, width: 19, align: 'left' },
];
const TABLE_LEFT = 15;
const TABLE_RIGHT = 205;

function drawColumnText(doc, col, text, y) {
    if (text === '' || text === null || text === undefined) return;
    const align = col.align === 'right' ? 'right' : (col.align === 'center' ? 'center' : 'left');
    const tx = align === 'right' ? col.x + col.width : (align === 'center' ? col.x + col.width / 2 : col.x);
    doc.text(String(text), tx, y, { align });
}

export async function generateSpbPdf(row, currentUser = null, targetWindow = null) {
    let win = targetWindow;
    if (!win && typeof window !== 'undefined') {
        try {
            win = window.open('', '_blank');
            if (win) {
                win.document.write('<!DOCTYPE html><html><head><title>Mencetak SPB...</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;"><div style="text-align:center;color:#475569;"><h3>Memuat Dokumen SPB...</h3><p>Mohon tunggu sebentar.</p></div></body></html>');
            }
        } catch (e) {
            console.warn('Gagal membuka window popup:', e);
        }
    }

    try {
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [215, 279] });
        const items = row.items || [];

        // ---------- KOP SURAT ----------
        try {
            const { dataUrl, width: naturalWidth, height: naturalHeight } = await loadImageWithDimensions('/Logo Vertikal.png');
            if (dataUrl) {
                const maxH = 18;
                const aspectRatio = (naturalWidth && naturalHeight) ? (naturalWidth / naturalHeight) : 1;
                const logoH = maxH;
                const logoW = maxH * aspectRatio;
                doc.addImage(dataUrl, 'PNG', 15, 8, logoW, logoH);
            }
        } catch (e) {
            console.warn('Logo gagal dimuat, lanjut tanpa logo:', e);
        }

    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('RS. SIAGA AL MUNAWWARAH SAMARINDA', 107.5, 14, { align: 'center' });

    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Jl. Ramania No. 3 Kel. Sidodadi Kec. Samarinda Ulu, Kota Samarinda', 107.5, 19, { align: 'center' });
    doc.text('Telp. 0541-739722, Fax. 0541-7272700', 107.5, 23, { align: 'center' });

    doc.setLineWidth(0.6);
    doc.line(15, 27, 205, 27);

    // ---------- JUDUL ----------
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    const judul = 'SURAT PESANAN BARANG';
    doc.text(judul, 107.5, 35, { align: 'center' });
    const judulWidth = doc.getTextWidth(judul);
    doc.setLineWidth(0.3);
    doc.line(107.5 - judulWidth / 2, 36.5, 107.5 + judulWidth / 2, 36.5);

    // ---------- INFO SURAT ----------
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const thn = getYear(row.tanggal);
    const bln = romanMonth(row.tanggal);
    const rawNo = row.no_spb || row.nomor || '___';
    const formattedNo = String(rawNo).includes('/') ? rawNo : `${rawNo}/LOGISTIK-RSSAMS/${bln}/${thn}`;

    let infoY = 43;
    doc.text('Nomor', 15, infoY);
    doc.text(`: ${formattedNo}`, 33, infoY);
    infoY += 5;
    doc.text('Tanggal', 15, infoY);
    doc.text(`: ${formatDateToIndo(row.tanggal)}`, 33, infoY);
    infoY += 5;
    doc.text('Kepada', 15, infoY);
    doc.text(`: ${row.pemasok || '-'}`, 33, infoY);
    infoY += 6;
    doc.text('Mohon pesanan untuk pengadaan barang-barang tersebut di bawah ini :', 15, infoY);

    // ---------- HEADER TABEL ----------
    let tableY = infoY + 5;
    doc.setLineWidth(0.3);
    doc.line(TABLE_LEFT, tableY, TABLE_RIGHT, tableY);
    tableY += 4.5;

    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    COLUMNS.forEach(col => drawColumnText(doc, col, col.label, tableY));
    tableY += 2;
    doc.setLineWidth(0.3);
    doc.line(TABLE_LEFT, tableY, TABLE_RIGHT, tableY);

    // ---------- ISI TABEL ----------
    const ROW_HEIGHT = 5.5;
    let y = tableY + ROW_HEIGHT;
    let yno = 1;
    let mgtotal = 0;

    doc.setFont('times', 'normal');
    doc.setFontSize(9);

    items.forEach((item) => {
        const mqty = item.qty_pesan || item.qty || 0;
        const mharga = Number(item.harga || 0);
        const mtotal = mqty * mharga;
        mgtotal += mtotal;

        const mkem = item.kemasan || item.satuan || '';
        const mket = `${item.isi || 1} ${item.satuan || ''}/${item.kemasan || ''}`;

        let namaBarang = item.barang_nama || '';
        if (namaBarang.length > 30) namaBarang = namaBarang.substring(0, 30) + '...';

        const rowData = {
            no: yno,
            kode: '',           // logic tetap: kode belum diisi di konteks ini
            nama: namaBarang,
            qty: fmtMoney(mqty).replace('.00', ''),
            satuan: mkem,
            disc: '',           // logic tetap: disc belum dihitung di konteks ini
            harga: fmtMoney(mharga),
            total: fmtMoney(mtotal),
            ket: mket,
        };

        COLUMNS.forEach(col => drawColumnText(doc, col, rowData[col.key], y));

        y += ROW_HEIGHT;
        yno++;
    });

    y += 1;
    doc.setLineWidth(0.3);
    doc.line(TABLE_LEFT, y, TABLE_RIGHT, y);
    y += 6;

    // ---------- RINGKASAN TOTAL ----------
    const mgtotalx = fmtMoney(mgtotal);
    const mdisc = '0.00';
    const mppn = '0.00';
    const mttl = fmtMoney(mgtotal);

    const summaryLabelX = 205 - 45;
    const summaryValueRight = 205;
    const summaryLine = (label, value) => {
        doc.text(label, summaryLabelX, y);
        doc.text(value, summaryValueRight, y, { align: 'right' });
        y += 5;
    };

    doc.setFontSize(10);
    summaryLine('TOTAL', mgtotalx);
    summaryLine('DISCOUNT', mdisc);
    summaryLine('PPN', mppn);
    doc.setFont('times', 'bold');
    summaryLine('TOTAL NETTO', mttl);
    doc.setFont('times', 'normal');

    // ---------- TANDA TANGAN ----------
    y += 6;
    doc.text(`Samarinda, ${formatDateToIndo(row.tanggal)}`, summaryLabelX, y);
    y += 5;
    doc.text('Dipesan Oleh', summaryLabelX, y);

    y += 18;
    const userFullName = currentUser?.first_name
        ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim()
        : (currentUser?.nama_lengkap || currentUser?.nama || currentUser?.username || 'Ardianti Guspari S. Si., Apt.');
    const namaTtd = userFullName;
    doc.setFont('times', 'bold');
    doc.text(namaTtd, summaryLabelX, y);
    doc.setLineWidth(0.2);
    doc.line(summaryLabelX, y + 1, summaryLabelX + doc.getTextWidth(namaTtd), y + 1);

    // ---------- OUTPUT ----------
    const pdfBlobUrl = doc.output('bloburl');
    if (win) {
        win.location.href = pdfBlobUrl;
    } else {
        window.open(pdfBlobUrl, '_blank');
    }
    } catch (err) {
        if (win && !win.closed) {
            try { win.close(); } catch {}
        }
        console.error('Gagal mencetak PDF SPB:', err);
    }
}