import { jsPDF } from "jspdf";

function romanMonth(dateStr) {
    if (!dateStr) return '';
    const m = parseInt(dateStr.split('-')[1], 10);
    const map = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    return map[m - 1] || '';
}

function getYear(dateStr) {
    if (!dateStr) return '';
    return dateStr.split('-')[0];
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

export async function generateSpbPdf(row) {
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [215, 279]
    });

    const items = row.items || [];
    
    const imgData = await fetch('/logo1.jpg')
        .then(res => res.blob())
        .then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }));

    doc.addImage(imgData, 'JPEG', 15, 7, 24, 24); 

    const cell = (x, y, w, h, text, align = 'left', fontStyle = 'normal') => {
        if (!text && text !== 0) return;
        doc.setFont('times', fontStyle);
        let tx = x;
        let alignPdf = 'left';
        if (align === 'C' || align === 'center') {
            tx = x + (w / 2);
            alignPdf = 'center';
        } else if (align === 'R' || align === 'right') {
            tx = x + w;
            alignPdf = 'right';
        }
        doc.text(String(text), tx, y + (h / 2), { align: alignPdf, baseline: 'middle' });
    };

    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    cell(10, 10, 195, 5, 'RS. SIAGA AL MUNAWWARAH SAMARINDA', 'C', 'bold');
    
    doc.setFontSize(10);
    doc.setFont('times', 'normal');
    cell(10, 15, 195, 5, 'Jl. Ramania No. 3 Kel. Sidodadi Kec. Samarinda Ulu, Kota Samarinda', 'C', 'normal');
    cell(10, 19, 195, 5, 'Telp. 0541-739722, Fax. 0541-7272700', 'C', 'normal');
    
    doc.setLineWidth(0.5);
    doc.line(15, 25, 205, 25);
    
    doc.setFont('times', 'bold'); 
    doc.setFontSize(14);
    cell(10, 32, 195, 5, 'SURAT PESANAN BARANG', 'C', 'bold');
    doc.setLineWidth(0.3);
    doc.line(75, 35, 140, 35); 

    doc.setFontSize(10);
    doc.setFont('times', 'normal');
    
    const thn = getYear(row.tanggal);
    const bln = romanMonth(row.tanggal);
    const no_faktur = row.nomor || '___';
    
    doc.text("Nomor", 15, 39);
    doc.text(` : ${no_faktur}/FARMASI-RSSAMS/${bln}/${thn}`, 30, 39);
    doc.text("Tanggal", 15, 43);
    doc.text(` : ${formatDateToIndo(row.tanggal)}`, 30, 43);
    doc.text("Kepada", 15, 47);
    doc.text(` : ${row.pemasok || '-'}`, 30, 47);
    doc.text("Mohon pesanan untuk pengadaan barang-barang tersebut di bawah ini :", 15, 53);

    doc.text("-".repeat(110), 15, 56);
    doc.text("-".repeat(110), 15, 63);

    doc.setFontSize(9);
    doc.text("NO", 15, 60);
    doc.text("KODE", 23, 60);
    doc.text("NAMA BARANG", 39, 60);
    doc.text("QTY", 108, 60, { align: 'right' }); 
    doc.text("DISC", 129, 60);
    doc.text("HARGA", 140, 60);
    doc.text("TOTAL", 171, 60);
    doc.text("KET", 184, 60);

    let y = 64;
    let yno = 1;
    let mgtotal = 0;
    
    items.forEach((item) => {
        const mqty = item.qty_pesan || item.qty || 0; 
        const mharga = Number(item.harga || 0);
        const mtotal = mqty * mharga;
        mgtotal += mtotal;
        const mkem = item.kemasan || item.satuan || '';
        const mket = `${item.isi || 1} ${item.satuan || ''}/${item.kemasan || ''}`; 

        let namaBarang = item.barang_nama;
        if (namaBarang && namaBarang.length > 25) {
            namaBarang = namaBarang.substring(0, 25) + '...';
        }

        cell(15, y, 7, 4, yno, 'L');
        cell(23, y, 16, 4, '', 'L'); 
        cell(39, y, 69, 4, namaBarang, 'L');
        cell(108, y, 10, 4, fmtMoney(mqty).replace('.00', ''), 'R');
        cell(118, y, 13, 4, mkem, 'L');
        cell(129, y, 11, 4, '', 'R'); 
        cell(140, y, 20, 4, fmtMoney(mharga), 'R');
        cell(160, y, 22, 4, fmtMoney(mtotal), 'R');
        cell(183, y, 20, 4, mket, 'L');
        
        y += 4;
        yno++;
    });

    y += 2;
    doc.text("-".repeat(110), 14, y);
    y += 4;

    const mgtotalx = fmtMoney(mgtotal);
    const mdisc = "0.00";
    const mppn = "0.00";
    const mttl = fmtMoney(mgtotal);

    cell(145, y, 15, 4, 'TOTAL :', 'R');
    cell(160, y, 22, 4, mgtotalx, 'R');
    y += 4;
    cell(145, y, 15, 4, 'DISCOUNT :', 'R');
    cell(160, y, 22, 4, mdisc, 'R');
    y += 4;
    cell(145, y, 15, 4, 'PPN :', 'R');
    cell(160, y, 22, 4, mppn, 'R');
    y += 4;
    cell(145, y, 15, 4, 'TOTAL NETTO :', 'R');
    cell(160, y, 22, 4, mttl, 'R');
    
    y += 8;
    doc.setFontSize(10);
    cell(145, y, 38, 4, `Samarinda, ${formatDateToIndo(row.tanggal)}`, 'L');
    y += 4;
    cell(145, y, 38, 4, 'Dipesan Oleh', 'L');
    
    y += 15;
    doc.setFont('times', 'bold');
    doc.text('Ardianti Guspari S. Si., Apt.', 145, y);
    doc.line(145, y + 1, 195, y + 1); 

    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
}
