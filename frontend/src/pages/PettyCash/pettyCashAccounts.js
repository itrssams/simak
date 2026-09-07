// Daftar Akun Biaya Kas Kecil dari NAMA AKUN (code account).xlsx (Format kode tanpa titik)
export const AKUN_BIAYA_PETTY_CASH = [
    {
        pos: 'POS BIAYA ADMINISTRASI',
        kode_pos: '5312',
        accounts: [
            { kode: '531201', nama: 'B. Alat Tulis' },
            { kode: '531202', nama: 'B. Komputer & Supplies' },
            { kode: '531203', nama: 'B. Cetakan' },
            { kode: '531204', nama: 'B. Pos' },
            { kode: '531205', nama: 'B. Telepon' },
            { kode: '531206', nama: 'B. Peralatan Kantor' },
            { kode: '531207', nama: 'B. Photo Copy' },
            { kode: '531208', nama: 'B. Pengurusan Ijin' },
            { kode: '531209', nama: 'B. Perjalanan Dinas' },
            { kode: '531210', nama: 'B. Training' },
            { kode: '531211', nama: 'B. Audit' },
        ]
    },
    {
        pos: 'POS BIAYA UMUM',
        kode_pos: '5321',
        accounts: [
            { kode: '532101', nama: 'Biaya Sewa Kantor' },
            { kode: '532102', nama: 'Biaya Sewa Kendaraan' },
            { kode: '532103', nama: 'Biaya Sewa Alat Kesehatan' },
            { kode: '532105', nama: 'Biaya Catering' },
            { kode: '532106', nama: 'Biaya Internet' },
            { kode: '532107', nama: 'Biaya Loundry' },
            { kode: '532108', nama: 'Biaya Listrik' },
            { kode: '532109', nama: 'Biaya Keperluan RT' },
            { kode: '532110', nama: 'Biaya Bahan Bakar' },
            { kode: '532114', nama: 'Biaya Rapat & Pertemuan' },
            { kode: '532115', nama: 'Biaya Operasional R.S' },
            { kode: '532116', nama: 'Biaya Pemakaian Air' },
        ]
    },
    {
        pos: 'POS BIAYA PEMELIHARAAN',
        kode_pos: '5322',
        accounts: [
            { kode: '532201', nama: 'Biaya Pemel. Alat Kesehatan' },
            { kode: '532202', nama: 'Biaya Pemel. Kantor' },
            { kode: '532203', nama: 'Biaya Pemel. Kendaraan' },
            { kode: '532204', nama: 'Biaya Pemel. Lingkungan' },
            { kode: '532205', nama: 'Biaya Pemel. Bangunan RS' },
            { kode: '532206', nama: 'Biaya Pemel. Alat Kantor' },
            { kode: '532207', nama: 'Biaya Pemel. Komputer' },
        ]
    }
];

// Helper map untuk lookup cepat berdasarkan kode (dukung kode tanpa titik dan kode lama bertitik)
export const AKUN_MAP = AKUN_BIAYA_PETTY_CASH.reduce((acc, group) => {
    group.accounts.forEach(item => {
        const entry = { ...item, pos: group.pos };
        acc[item.kode] = entry;
        // Fallback untuk kode format bertitik lama jika ada
        const dotted = `${item.kode.slice(0, 2)}.${item.kode.slice(2, 4)}.${item.kode.slice(4)}`;
        acc[dotted] = entry;
    });
    return acc;
}, {});
