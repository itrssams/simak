export const AKUN_BIAYA_KAS_BESAR = [
    {
        pos: 'POS BIAYA ADMINISTRASI',
        kode_pos: '53.12',
        accounts: [
            { kode: '53.12.01', nama: 'B. Alat Tulis' },
            { kode: '53.12.02', nama: 'B. Komputer & Supplies' },
            { kode: '53.12.03', nama: 'B. Cetakan' },
            { kode: '53.12.04', nama: 'B. Pos' },
            { kode: '53.12.05', nama: 'B. Telepon' },
            { kode: '53.12.06', nama: 'B. Peralatan Kantor' },
            { kode: '53.12.07', nama: 'B. Photo Copy' },
            { kode: '53.12.08', nama: 'B. Pengurusan Ijin' },
            { kode: '53.12.09', nama: 'B. Perjalanan Dinas' },
            { kode: '53.12.10', nama: 'B. Training' },
            { kode: '53.12.11', nama: 'B. Audit' },
        ]
    },
    {
        pos: 'POS BIAYA UMUM',
        kode_pos: '53.21',
        accounts: [
            { kode: '53.21.01', nama: 'Biaya Sewa Kantor' },
            { kode: '53.21.02', nama: 'Biaya Sewa Kendaraan' },
            { kode: '53.21.03', nama: 'Biaya Sewa Alat Kesehatan' },
            { kode: '53.21.05', nama: 'Biaya Catering' },
            { kode: '53.21.06', nama: 'Biaya Internet' },
            { kode: '53.21.07', nama: 'Biaya Loundry' },
            { kode: '53.21.08', nama: 'Biaya Listrik' },
            { kode: '53.21.09', nama: 'Biaya Keperluan RT' },
            { kode: '53.21.10', nama: 'Biaya Bahan Bakar' },
            { kode: '53.21.14', nama: 'Biaya Rapat & Pertemuan' },
            { kode: '53.21.15', nama: 'Biaya Operasional R.S' },
            { kode: '53.21.16', nama: 'Biaya Pemakaian Air' },
        ]
    },
    {
        pos: 'POS BIAYA PEMELIHARAAN',
        kode_pos: '53.22',
        accounts: [
            { kode: '53.22.01', nama: 'Biaya Pemel. Alat Kesehatan' },
            { kode: '53.22.02', nama: 'Biaya Pemel. Kantor' },
            { kode: '53.22.03', nama: 'Biaya Pemel. Kendaraan' },
            { kode: '53.22.04', nama: 'Biaya Pemel. Lingkungan' },
            { kode: '53.22.05', nama: 'Biaya Pemel. Bangunan RS' },
            { kode: '53.22.06', nama: 'Biaya Pemel. Alat Kantor' },
            { kode: '53.22.07', nama: 'Biaya Pemel. Komputer' },
        ]
    }
];

export const AKUN_MAP = AKUN_BIAYA_KAS_BESAR.reduce((acc, group) => {
    group.accounts.forEach(item => {
        acc[item.kode] = { ...item, pos: group.pos };
    });
    return acc;
}, {});
