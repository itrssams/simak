from datetime import timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from keuangan.models import (
    Akun,
    PettyCash,
    LaporanPenggunaan,
    ItemLaporanPenggunaan,
    FotoLaporanPenggunaan,
    FotoPettyCash,
    KasBesar,
    LaporanPenggunaanKasBesar,
    ItemLaporanKasBesar,
    FotoLaporanKasBesar,
    Reimbursement,
    FotoReimbursement,
    SaldoPettyCash,
    RiwayatSaldoPettyCash,
    PengajuanPenambahanSaldo,
    UtangSupplier,
    PembayaranUtang,
)
from users.models import User, Unit


class Command(BaseCommand):
    help = "Bersihkan total dan seed data Petty Cash, Kas Besar, dan Reimbursement dalam jumlah banyak dan realistis."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("=== 1. MEMBERSIHKAN DATA LAMA ==="))
        self.clean_all()

        self.stdout.write(self.style.WARNING("=== 2. MENYIAPKAN MASTER AKUN & PENGGUNA ==="))
        self.seed_master_akun()
        users = self.get_or_create_users()

        self.stdout.write(self.style.WARNING("=== 3. SEED SALDO & PETTY CASH (BANYAK DATA) ==="))
        self.seed_petty_cash(users)

        self.stdout.write(self.style.WARNING("=== 4. SEED KAS BESAR (BANYAK DATA) ==="))
        self.seed_kas_besar(users)

        self.stdout.write(self.style.WARNING("=== 5. SEED REIMBURSEMENT (BANYAK DATA) ==="))
        self.seed_reimbursement(users)

        self.stdout.write(self.style.SUCCESS("=== SEED SELESAI DENGAN SUKSES ==="))

    def clean_all(self):
        # 1. Hapus UtangSupplier & Pembayaran terkait KBS-, PPC-, KEU-, RMB-
        utangs = (
            UtangSupplier.objects.filter(app_siaga_faktur_id__startswith="KBS-")
            | UtangSupplier.objects.filter(app_siaga_faktur_id__startswith="PPC-")
            | UtangSupplier.objects.filter(app_siaga_faktur_id__startswith="KEU-")
            | UtangSupplier.objects.filter(app_siaga_faktur_id__startswith="RMB-")
            | UtangSupplier.objects.filter(kategori__in=['PENGISIAN PETTY CASH', 'REIMBURSEMENT', 'KAS BESAR'])
        )
        pemb_count = PembayaranUtang.objects.filter(utang__in=utangs).delete()[0]
        utang_count = utangs.delete()[0]
        self.stdout.write(f"  - Dihapus: {pemb_count} PembayaranUtang & {utang_count} UtangSupplier terkait KBS/PPC/KEU/RMB")

        # 2. Hapus Kas Besar beserta child-nya
        foto_kb_count = FotoLaporanKasBesar.objects.all().delete()[0]
        item_kb_count = ItemLaporanKasBesar.objects.all().delete()[0]
        lap_kb_count = LaporanPenggunaanKasBesar.objects.all().delete()[0]
        kb_count = KasBesar.objects.all().delete()[0]
        self.stdout.write(f"  - Dihapus: {kb_count} Kas Besar, {lap_kb_count} Laporan, {item_kb_count} Item, {foto_kb_count} Foto")

        # 3. Hapus Reimbursement beserta child-nya
        foto_rb_count = FotoReimbursement.objects.all().delete()[0]
        rb_count = Reimbursement.objects.all().delete()[0]
        self.stdout.write(f"  - Dihapus: {rb_count} Reimbursement, {foto_rb_count} Foto")

        # 4. Hapus Petty Cash beserta child-nya
        foto_lap_pc_count = FotoLaporanPenggunaan.objects.all().delete()[0]
        item_pc_count = ItemLaporanPenggunaan.objects.all().delete()[0]
        lap_pc_count = LaporanPenggunaan.objects.all().delete()[0]
        foto_pc_count = FotoPettyCash.objects.all().delete()[0]
        pc_count = PettyCash.objects.all().delete()[0]
        self.stdout.write(f"  - Dihapus: {pc_count} Petty Cash, {lap_pc_count} Laporan, {item_pc_count} Item, {foto_pc_count} Foto")

        # 5. Hapus Pengajuan Penambahan Saldo & Riwayat Saldo
        pengajuan_saldo_count = PengajuanPenambahanSaldo.objects.all().delete()[0]
        riwayat_count = RiwayatSaldoPettyCash.objects.all().delete()[0]
        self.stdout.write(f"  - Dihapus: {pengajuan_saldo_count} Pengajuan Penambahan Saldo & {riwayat_count} Riwayat Saldo")

        # 6. Reset Saldo Petty Cash ke 0 dulu
        SaldoPettyCash.objects.all().delete()
        self.stdout.write("  - Saldo Petty Cash di-reset bersih.")

    def seed_master_akun(self):
        import openpyxl, os
        excel_path = '/app/nama_akun.xlsx'
        count = 0
        if os.path.exists(excel_path):
            wb = openpyxl.load_workbook(excel_path, data_only=True)
            for sheet_name in ['laba rugi', 'neraca']:
                ws = wb[sheet_name]
                curr_pos = ''
                for r in ws.iter_rows(values_only=True):
                    name = str(r[0]).strip() if r[0] is not None else ''
                    acc = str(r[1]).strip() if r[1] is not None else ''
                    if name.startswith('POS '):
                        curr_pos = name
                    elif name and acc and acc != 'ACCOUNT' and not acc.startswith(':'):
                        clean_acc = acc.replace('.', '').strip()
                        tipe = 'beban_operasional' if clean_acc.startswith(('5', '6')) else 'aset_lancar'
                        if clean_acc.startswith('2'): tipe = 'kewajiban_lancar'
                        elif clean_acc.startswith('3'): tipe = 'ekuitas'
                        elif clean_acc.startswith('4'): tipe = 'pendapatan'

                        _, created = Akun.objects.get_or_create(
                            kode_akun=clean_acc,
                            defaults={
                                'nama_akun': name,
                                'tipe': tipe,
                                'saldo_normal': 'debit' if not clean_acc.startswith(('2', '3', '4')) else 'kredit',
                                'is_kas_setara': clean_acc.startswith(('1111', '1112', '1101', '1102')),
                                'keterangan': curr_pos,
                                'is_active': True,
                            }
                        )
                        if created:
                            count += 1
            self.stdout.write(f"  - Master Akun (COA Excel): {Akun.objects.count()} total akun ({count} baru).")
        else:
            self.stdout.write("  - File nama_akun.xlsx tidak ditemukan, lewati import Excel.")

    def get_or_create_users(self):
        keuangan_unit, _ = Unit.objects.get_or_create(nama="Keuangan", defaults={"is_active": True})
        umum_unit, _ = Unit.objects.get_or_create(nama="Umum", defaults={"is_active": True})
        igd_unit, _ = Unit.objects.get_or_create(nama="IGD", defaults={"is_active": True})
        lab_unit, _ = Unit.objects.get_or_create(nama="Laboratorium", defaults={"is_active": True})
        rawat_unit, _ = Unit.objects.get_or_create(nama="Rawat Inap", defaults={"is_active": True})

        def ensure_user(username, defaults):
            u, _ = User.objects.get_or_create(username=username, defaults=defaults)
            for k, v in defaults.items():
                setattr(u, k, v)
            if not u.password:
                u.set_password("simak12345")
            u.save()
            return u

        nevi = ensure_user("nevi", {
            "first_name": "Nevi",
            "last_name": "Nevada",
            "role": "wakil_direktur",
            "is_active": True,
        })
        evi = ensure_user("evi", {
            "first_name": "Evi",
            "last_name": "Setyaningrum, S.Ak",
            "role": "karyawan",
            "unit": keuangan_unit,
            "is_keuangan": True,
            "akses_kas_besar": True,
            "akses_reimbursement": True,
            "view_petty_cash": True,
            "view_kas_besar": True,
            "is_active": True,
        })
        ulfa = ensure_user("ulfa", {
            "first_name": "Ulfa",
            "last_name": "Santika",
            "role": "karyawan",
            "unit": keuangan_unit,
            "is_petty_cash_cashier": True,
            "view_petty_cash": True,
            "akses_kas_besar": False,
            "akses_reimbursement": False,
            "is_active": True,
        })
        fauzi = ensure_user("fauzi", {
            "first_name": "Ahmad",
            "last_name": "Fauzi, A.Md",
            "role": "kepala_seksi",
            "unit": umum_unit,
            "is_active": True,
        })
        febry = ensure_user("febry", {
            "first_name": "Febry",
            "last_name": "Setiawan, S.E",
            "role": "karyawan",
            "unit": keuangan_unit,
            "is_active": True,
        })
        rina = ensure_user("rina", {
            "first_name": "Rina",
            "last_name": "Handayani",
            "role": "karyawan",
            "unit": keuangan_unit,
            "is_active": True,
        })
        dewi = ensure_user("dewi", {
            "first_name": "Siti Dewi",
            "last_name": "Lestari, S.Kep",
            "role": "karyawan",
            "unit": igd_unit,
            "is_active": True,
        })
        budi = ensure_user("budi", {
            "first_name": "Budi",
            "last_name": "Santoso, A.Md.AK",
            "role": "karyawan",
            "unit": lab_unit,
            "is_active": True,
        })
        andi = ensure_user("andi", {
            "first_name": "dr. Andi",
            "last_name": "Pratama, Sp.PD",
            "role": "karyawan",
            "unit": rawat_unit,
            "is_active": True,
        })

        return {
            "nevi": nevi,
            "evi": evi,
            "ulfa": ulfa,
            "fauzi": fauzi,
            "febry": febry,
            "rina": rina,
            "dewi": dewi,
            "budi": budi,
            "andi": andi,
        }

    def seed_petty_cash(self, users):
        today = timezone.localdate()
        nevi = users["nevi"]
        evi = users["evi"]
        ulfa = users["ulfa"]
        fauzi = users["fauzi"]
        febry = users["febry"]
        rina = users["rina"]
        dewi = users["dewi"]
        budi = users["budi"]

        # ==================== SALDO & RIWAYAT HISTORIS ====================
        saldo_plafon = Decimal("5000000.00")
        saldo_obj = SaldoPettyCash.objects.create(pk=1, saldo=saldo_plafon, updated_by=nevi)

        # 1. Saldo Awal (30 hari lalu)
        t_hist_1 = timezone.now() - timedelta(days=30)
        rw1 = RiwayatSaldoPettyCash.objects.create(
            nama_pengaju=f"{evi.first_name} {evi.last_name}".strip(),
            unit_pengaju="Keuangan",
            jenis="penambahan",
            jumlah=saldo_plafon,
            saldo_sebelum=Decimal("0.00"),
            saldo_sesudah=saldo_plafon,
            keterangan="Saldo Awal Kas Kecil Rumah Sakit (Plafon Rp 5.000.000)",
            created_by=nevi,
        )
        RiwayatSaldoPettyCash.objects.filter(pk=rw1.pk).update(created_at=t_hist_1)

        # 4 transaksi periode lama sebelum top up terakhir (28 - 14 hari lalu)
        old_completed = [
            (fauzi, "Umum", 28, "Pembelian kabel roll & steker colokan ruang farmasi", "160000.00", "53.22.06", "Biaya Pemel. Alat Kantor", "POS BIAYA PEMELIHARAAN"),
            (febry, "Keuangan", 24, "Fotokopi & penjilidan buku panduan SOP akreditasi KARS", "290000.00", "53.12.07", "B. Photo Copy", "POS BIAYA ADMINISTRASI"),
            (dewi, "IGD", 20, "Pembelian sabun desinfektan hand rub cuci tangan IGD", "350000.00", "53.21.09", "Biaya Keperluan RT", "POS BIAYA UMUM"),
            (rina, "Keuangan", 16, "Pembelian spidol whiteboard & penghapus ruang pertemuan", "85000.00", "53.12.01", "B. Alat Tulis", "POS BIAYA ADMINISTRASI"),
        ]
        curr_saldo = saldo_plafon
        for u, unit_nm, d_ago, kep, nom, kd_ak, nm_ak, pos_nm in old_completed:
            t_dt = today - timedelta(days=d_ago)
            nom_dec = Decimal(nom)
            pc = PettyCash.objects.create(
                tanggal=t_dt,
                keperluan=kep,
                nominal=nom_dec,
                keterangan="Kebutuhan operasional unit",
                status="selesai",
                created_by=u,
                disetujui_oleh=nevi,
                dicairkan_oleh=ulfa,
                laporan_disetujui_oleh=nevi,
                laporan_disetujui_at=timezone.now() - timedelta(days=d_ago - 1),
            )
            lap = LaporanPenggunaan.objects.create(
                petty_cash=pc,
                tanggal_laporan=t_dt + timedelta(days=1),
                nominal_digunakan=nom_dec,
                selisih=Decimal("0.00"),
                rincian=f"[{kd_ak}] {kep} (Rp {nom_dec:,.0f})",
                pengembalian_selesai=True,
                dikonfirmasi_oleh=ulfa,
            )
            ItemLaporanPenggunaan.objects.create(
                laporan=lap,
                kode_akun=kd_ak,
                nama_akun=nm_ak,
                pos_biaya=pos_nm,
                deskripsi=kep,
                nilai=nom_dec,
            )
            s_seb = curr_saldo
            curr_saldo -= nom_dec
            rw = RiwayatSaldoPettyCash.objects.create(
                jenis="pengurangan",
                jumlah=nom_dec,
                saldo_sebelum=s_seb,
                saldo_sesudah=curr_saldo,
                keterangan=f"Realisasi petty cash {pc.no_pengajuan} - {kep[:50]}",
                created_by=ulfa,
                nama_pengaju=f"{u.first_name} {u.last_name}".strip(),
                unit_pengaju=unit_nm,
            )
            RiwayatSaldoPettyCash.objects.filter(pk=rw.pk).update(created_at=timezone.now() - timedelta(days=d_ago - 1))

        # Total terpakai periode lalu = 160.000 + 290.000 + 350.000 + 85.000 = 885.000
        # 2. TOP UP TERAKHIR (12 hari lalu) -> Mengisi kembali ke Rp 5.000.000!
        top_up_date = timezone.now() - timedelta(days=12)
        top_up_amt = saldo_plafon - curr_saldo
        rw_topup = RiwayatSaldoPettyCash.objects.create(
            nama_pengaju=f"{evi.first_name} {evi.last_name}".strip(),
            unit_pengaju="Keuangan",
            jenis="penambahan",
            jumlah=top_up_amt,
            saldo_sebelum=curr_saldo,
            saldo_sesudah=saldo_plafon,
            keterangan="Pengisian Kembali Saldo Kas Kecil (Reimburse Plafon Rp 5.000.000)",
            created_by=nevi,
        )
        RiwayatSaldoPettyCash.objects.filter(pk=rw_topup.pk).update(created_at=top_up_date)
        curr_saldo = saldo_plafon

        # ==================== PEMAKAIAN SEJAK TOP UP TERAKHIR (SELESAI) ====================
        # 7 transaksi selesai sejak 10 hari lalu s/d kemarin:
        recent_completed = [
            (fauzi, "Umum", 10, "Pembelian snack rapat komite medik & air mineral galon poliklinik", "175000.00", "53.21.14", "Biaya Rapat & Pertemuan", "POS BIAYA UMUM"),
            (febry, "Keuangan", 8, "Pembelian kertas formulir rekam medis & map arsip rawat jalan", "320000.00", "53.12.03", "B. Cetakan", "POS BIAYA ADMINISTRASI"),
            (dewi, "IGD", 7, "Pembelian baterai alkaline AA/AAA tensimeter & termometer IGD", "145000.00", "53.21.09", "Biaya Keperluan RT", "POS BIAYA UMUM"),
            (fauzi, "Umum", 5, "Pembelian refill gas LPG 12kg dapur instalasi gizi (2 tabung)", "420000.00", "53.21.10", "Biaya Bahan Bakar", "POS BIAYA UMUM"),
            (febry, "Keuangan", 4, "Pembelian materai 10.000 (15 lembar) untuk berkas kontrak kerja sama", "150000.00", "53.12.01", "B. Alat Tulis", "POS BIAYA ADMINISTRASI"),
            (fauzi, "Umum", 3, "Pembelian cairan pembersih lantai & pengharum ruang poliklinik", "185000.00", "53.21.09", "Biaya Keperluan RT", "POS BIAYA UMUM"),
            (dewi, "IGD", 1, "Penggantian kran air wastafel tindakan & selang fleksibel IGD", "95000.00", "53.22.05", "Biaya Pemel. Bangunan RS", "POS BIAYA PEMELIHARAAN"),
        ]

        for u, unit_nm, d_ago, kep, nom, kd_ak, nm_ak, pos_nm in recent_completed:
            t_dt = today - timedelta(days=d_ago)
            nom_dec = Decimal(nom)
            pc = PettyCash.objects.create(
                tanggal=t_dt,
                keperluan=kep,
                nominal=nom_dec,
                keterangan="Kebutuhan rutin unit pelayanan",
                status="selesai",
                created_by=u,
                disetujui_oleh=nevi,
                dicairkan_oleh=ulfa,
                laporan_disetujui_oleh=nevi,
                laporan_disetujui_at=timezone.now() - timedelta(days=d_ago - 1 if d_ago > 1 else 0),
            )
            lap = LaporanPenggunaan.objects.create(
                petty_cash=pc,
                tanggal_laporan=t_dt + timedelta(days=1),
                nominal_digunakan=nom_dec,
                selisih=Decimal("0.00"),
                rincian=f"[{kd_ak}] {kep} (Rp {nom_dec:,.0f})",
                pengembalian_selesai=True,
                dikonfirmasi_oleh=ulfa,
            )
            ItemLaporanPenggunaan.objects.create(
                laporan=lap,
                kode_akun=kd_ak,
                nama_akun=nm_ak,
                pos_biaya=pos_nm,
                deskripsi=kep,
                nilai=nom_dec,
            )
            s_seb = curr_saldo
            curr_saldo -= nom_dec
            rw = RiwayatSaldoPettyCash.objects.create(
                jenis="pengurangan",
                jumlah=nom_dec,
                saldo_sebelum=s_seb,
                saldo_sesudah=curr_saldo,
                keterangan=f"Realisasi petty cash {pc.no_pengajuan} - {kep[:50]}",
                created_by=ulfa,
                nama_pengaju=f"{u.first_name} {u.last_name}".strip(),
                unit_pengaju=unit_nm,
            )
            RiwayatSaldoPettyCash.objects.filter(pk=rw.pk).update(created_at=timezone.now() - timedelta(days=d_ago - 1 if d_ago > 1 else 0))

        # Update Saldo Akhir
        saldo_obj.saldo = curr_saldo
        saldo_obj.updated_by = ulfa
        saldo_obj.save()
        total_terpakai_sejak_topup = saldo_plafon - curr_saldo
        self.stdout.write(f"  - Saldo kas kecil saat ini: Rp {curr_saldo:,.2f} (Terpakai sejak top up: Rp {total_terpakai_sejak_topup:,.2f})")

        # ==================== STATUS LAINNYA ====================
        # DICAIRKAN (4 transaksi)
        PettyCash.objects.create(
            tanggal=today - timedelta(days=2),
            keperluan="Pembelian gembok gerbang instalasi gizi & silinder kunci pintu arsip",
            nominal=Decimal("220000.00"),
            keterangan="Keamanan ruang arsip rekam medis dan gudang logistik",
            status="dicairkan",
            created_by=fauzi,
            disetujui_oleh=nevi,
            dicairkan_oleh=ulfa,
        )
        PettyCash.objects.create(
            tanggal=today - timedelta(days=2),
            keperluan="Pembelian bohlam LED 18W (10 pcs) koridor lantai 2 rawat inap",
            nominal=Decimal("260000.00"),
            keterangan="Penerangan lorong rawat inap bedah",
            status="dicairkan",
            created_by=fauzi,
            disetujui_oleh=nevi,
            dicairkan_oleh=ulfa,
        )
        PettyCash.objects.create(
            tanggal=today - timedelta(days=1),
            keperluan="Konsumsi pendampingan visitasi dinas kesehatan kota",
            nominal=Decimal("325000.00"),
            keterangan="Snack box & makan siang tim surveyor visitasi",
            status="dicairkan",
            created_by=febry,
            disetujui_oleh=nevi,
            dicairkan_oleh=ulfa,
        )
        PettyCash.objects.create(
            tanggal=today - timedelta(days=1),
            keperluan="Pembelian pot urine & wadah spesimen darurat laboratorium",
            nominal=Decimal("210000.00"),
            keterangan="Kebutuhan mendesak pemeriksaan cito laboratorium",
            status="dicairkan",
            created_by=budi,
            disetujui_oleh=nevi,
            dicairkan_oleh=ulfa,
        )

        # MENUNGGU APPROVAL LAPORAN (2 transaksi - dilengkapi item rincian COA)
        pc_rep1 = PettyCash.objects.create(
            tanggal=today - timedelta(days=3),
            keperluan="Pembelian termometer digital dahi infrared poliklinik anak",
            nominal=Decimal("350000.00"),
            keterangan="Penggantian alat ukur suhu poli anak",
            status="menunggu_approval_laporan",
            created_by=dewi,
            disetujui_oleh=nevi,
            dicairkan_oleh=ulfa,
        )
        lap1 = LaporanPenggunaan.objects.create(
            petty_cash=pc_rep1,
            tanggal_laporan=today - timedelta(days=1),
            nominal_digunakan=Decimal("350000.00"),
            selisih=Decimal("0.00"),
            rincian="[53.22.01] Termometer Microlife NC200 1 unit (Rp 350.000)",
            pengembalian_selesai=False,
        )
        ItemLaporanPenggunaan.objects.create(
            laporan=lap1,
            kode_akun="53.22.01",
            nama_akun="Biaya Pemel. Alat Kesehatan",
            pos_biaya="POS BIAYA PEMELIHARAAN",
            deskripsi="Termometer Microlife NC200 1 unit",
            nilai=Decimal("350000.00"),
        )

        pc_rep2 = PettyCash.objects.create(
            tanggal=today - timedelta(days=2),
            keperluan="Servis perbaikan dispenser air galon ruang jaga perawat",
            nominal=Decimal("130000.00"),
            keterangan="Perbaikan kran panas & pembersihan kerak tangki",
            status="menunggu_approval_laporan",
            created_by=fauzi,
            disetujui_oleh=nevi,
            dicairkan_oleh=ulfa,
        )
        lap2 = LaporanPenggunaan.objects.create(
            petty_cash=pc_rep2,
            tanggal_laporan=today,
            nominal_digunakan=Decimal("130000.00"),
            selisih=Decimal("0.00"),
            rincian="[53.22.06] Jasa servis dispenser & ganti kran silicone (Rp 130.000)",
            pengembalian_selesai=False,
        )
        ItemLaporanPenggunaan.objects.create(
            laporan=lap2,
            kode_akun="53.22.06",
            nama_akun="Biaya Pemel. Alat Kantor",
            pos_biaya="POS BIAYA PEMELIHARAAN",
            deskripsi="Jasa servis dispenser & ganti kran silicone",
            nilai=Decimal("130000.00"),
        )

        # DISETUJUI (4 transaksi)
        PettyCash.objects.create(
            tanggal=today - timedelta(days=1),
            keperluan="Pengiriman kilat berkas berkala ke BPJS KC Balikpapan via kurir",
            nominal=Decimal("180000.00"),
            keterangan="Kirim berkas fisik klaim rawat inap sebelum batas cut-off",
            status="disetujui",
            created_by=febry,
            disetujui_oleh=nevi,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pembelian kain pel microfiber & ember pembersih ICU",
            nominal=Decimal("195000.00"),
            keterangan="Peremajaan alat kebersihan zona steril ICU",
            status="disetujui",
            created_by=fauzi,
            disetujui_oleh=nevi,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Refill tinta stempel dan bantalan stempel poli spesialis",
            nominal=Decimal("110000.00"),
            keterangan="Tinta ungu flash 4 botol & bak stempel",
            status="disetujui",
            created_by=rina,
            disetujui_oleh=nevi,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pembelian lakban cokelat & kardus arsip keuangan",
            nominal=Decimal("140000.00"),
            keterangan="Penyusunan arsip bukti kas tahun berjalan",
            status="disetujui",
            created_by=febry,
            disetujui_oleh=nevi,
        )

        # PENDING (6 transaksi)
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pembelian sabun cuci tangan & cairan desinfektan wastafel poliklinik",
            nominal=Decimal("285000.00"),
            keterangan="Refill berkala hand soap untuk 8 wastafel rawat jalan",
            status="pending",
            created_by=fauzi,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pengadaan kabel HDMI 10m & converter proyektor ruang pertemuan lantai 3",
            nominal=Decimal("245000.00"),
            keterangan="Kebutuhan presentasi evaluasi pelayanan bulanan",
            status="pending",
            created_by=febry,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pembelian tisu gulung & tisu kotak ruang tindakan IGD",
            nominal=Decimal("190000.00"),
            keterangan="Tisu higienis tindakan medis dan cuci tangan dokter",
            status="pending",
            created_by=dewi,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Penggantian fitting lampu taman & kabel luar pos satpam utama",
            nominal=Decimal("165000.00"),
            keterangan="Penerangan area gerbang masuk pengunjung malam hari",
            status="pending",
            created_by=fauzi,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pembelian amplop dinas berkop RS Siaga (5 pack) dan binder clip",
            nominal=Decimal("125000.00"),
            keterangan="Stok ATK pengiriman surat rujukan dan invoice",
            status="pending",
            created_by=rina,
        )
        PettyCash.objects.create(
            tanggal=today,
            keperluan="Pembelian plastik sampah medis kuning (infeksius) ukuran 60x80cm",
            nominal=Decimal("380000.00"),
            keterangan="Penampungan sementara limbah medis padat B3",
            status="pending",
            created_by=budi,
        )

        # DITOLAK (3 transaksi)
        PettyCash.objects.create(
            tanggal=today - timedelta(days=4),
            keperluan="Pembelian kue tart dan bingkisan perpisahan rekan kerja",
            nominal=Decimal("300000.00"),
            keterangan="Acara internal pelepasan staf perawat",
            status="ditolak",
            catatan_tolak="Pengeluaran perpisahan personal tidak dapat dibebankan pada kas kecil operasional rumah sakit.",
            created_by=rina,
            disetujui_oleh=nevi,
        )
        PettyCash.objects.create(
            tanggal=today - timedelta(days=3),
            keperluan="Pembelian tumbler minum stainless souvenir perawat",
            nominal=Decimal("450000.00"),
            keterangan="Cinderamata peringatan hari perawat nasional",
            status="ditolak",
            catatan_tolak="Bukan merupakan pengeluaran mendesak operasional kas kecil.",
            created_by=dewi,
            disetujui_oleh=nevi,
        )
        PettyCash.objects.create(
            tanggal=today - timedelta(days=2),
            keperluan="Pemesanan catering makan malam lembur di luar pagu anggaran",
            nominal=Decimal("380000.00"),
            keterangan="Lembur penyiapan data akreditasi",
            status="ditolak",
            catatan_tolak="Lembur belum dilengkapi dengan Surat Perintah Lembur dari pimpinan.",
            created_by=febry,
            disetujui_oleh=nevi,
        )

        # DIBATALKAN (1 transaksi)
        PettyCash.objects.create(
            tanggal=today - timedelta(days=5),
            keperluan="Pembelian tempat sampah injak 20 liter poliklinik",
            nominal=Decimal("210000.00"),
            keterangan="Tempat sampah non-medis rawat jalan",
            status="dibatalkan",
            catatan_tolak="Dibatalkan: Barang serupa masih tersedia di gudang logistik umum.",
            created_by=fauzi,
        )

        self.stdout.write("  - Total Petty Cash berhasil di-seed: 31 transaksi.")

    def seed_kas_besar(self, users):
        today = timezone.localdate()
        nevi = users["nevi"]
        evi = users["evi"]
        fauzi = users["fauzi"]
        febry = users["febry"]
        dewi = users["dewi"]
        andi = users["andi"]

        kb_specs = [
            # SELESAI (5 item)
            {
                "tanggal": today - timedelta(days=35),
                "keperluan": "Pengadaan UPS 1200VA Server Simak & Stabilizer Ruang Radiologi",
                "nominal": "3850000.00",
                "keterangan": "Menjaga stabilitas server dan perangkat radiologi saat terjadi fluktuasi listrik",
                "status": "selesai",
                "created_by": evi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.07", "Biaya Pemel. Komputer", "POS BIAYA PEMELIHARAAN", "UPS 1200VA Server Simak", "2650000.00"),
                    ("53.22.01", "Biaya Pemel. Alat Kesehatan", "POS BIAYA PEMELIHARAAN", "Stabilizer 1000W Radiologi", "1200000.00"),
                ],
            },
            {
                "tanggal": today - timedelta(days=28),
                "keperluan": "Perbaikan kompresor & penggantian freon AC sentral poliklinik spesialis",
                "nominal": "4200000.00",
                "keterangan": "Overhaul pendingin udara poli spesialis lantai 1",
                "status": "selesai",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.05", "Biaya Pemel. Bangunan RS", "POS BIAYA PEMELIHARAAN", "Kompresor AC Daikin 3PK", "3500000.00"),
                    ("53.22.05", "Biaya Pemel. Bangunan RS", "POS BIAYA PEMELIHARAAN", "Jasa vacuum & pengisian freon R410", "700000.00"),
                ],
            },
            {
                "tanggal": today - timedelta(days=22),
                "keperluan": "Pengadaan tirai anti-bakteri ruang rawat inap VIP (6 set)",
                "nominal": "5600000.00",
                "keterangan": "Standar akreditasi PPI untuk tirai pembatas pasien kelas VIP",
                "status": "selesai",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.06", "Biaya Pemel. Alat Kantor", "POS BIAYA PEMELIHARAAN", "Tirai anti-bakteri waterproof 6 set", "5600000.00"),
                ],
            },
            {
                "tanggal": today - timedelta(days=18),
                "keperluan": "Pengadaan rak besi arsip rekam medis heavy duty 5 tingkat",
                "nominal": "6800000.00",
                "keterangan": "Penataan kapasitas gudang arsip dokumen rekam medis inaktif",
                "status": "selesai",
                "created_by": febry,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.06", "Biaya Pemel. Alat Kantor", "POS BIAYA PEMELIHARAAN", "Rak besi siku lubang heavy duty 4 unit", "6800000.00"),
                ],
            },
            {
                "tanggal": today - timedelta(days=12),
                "keperluan": "Penggantian water heater ruang operasi OK 2 & instalasi pipa tembaga",
                "nominal": "3400000.00",
                "keterangan": "Penyedia air hangat steril untuk scrub station dokter bedah",
                "status": "selesai",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.05", "Biaya Pemel. Bangunan RS", "POS BIAYA PEMELIHARAAN", "Water heater Ariston 50L & instalasi", "3400000.00"),
                ],
            },

            # DICAIRKAN (4 item)
            {
                "tanggal": today - timedelta(days=6),
                "keperluan": "Perbaikan blower AC sentral & penggantian exhaust fan ruang rawat inap VIP",
                "nominal": "2400000.00",
                "keterangan": "Pekerjaan maintenance tata udara rawat inap lantai 2",
                "status": "dicairkan",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
            },
            {
                "tanggal": today - timedelta(days=5),
                "keperluan": "Pembuatan kanopi drop-off pasien ambulans IGD rangka baja ringan",
                "nominal": "7500000.00",
                "keterangan": "Perlindungan cuaca bagi pasien kritis saat diturunkan dari ambulans",
                "status": "dicairkan",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
            },
            {
                "tanggal": today - timedelta(days=4),
                "keperluan": "Kalibrasi tahunan alat spirometri & EKG 12-channel poliklinik",
                "nominal": "4800000.00",
                "keterangan": "Kalibrasi bersertifikasi BPFK Kemenkes untuk akreditasi",
                "status": "dicairkan",
                "created_by": dewi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
            },
            {
                "tanggal": today - timedelta(days=3),
                "keperluan": "Pengadaan switch hub manageable 24-port Gigabit & roll kabel Cat6 SIMAK",
                "nominal": "3900000.00",
                "keterangan": "Perluasan jaringan LAN lokal farmasi rawat jalan dan kasir",
                "status": "dicairkan",
                "created_by": evi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
            },

            # MENUNGGU APPROVAL LAPORAN (2 item)
            {
                "tanggal": today - timedelta(days=8),
                "keperluan": "Pengecatan ulang dinding lorong rawat inap bedah cat anti-noda",
                "nominal": "3750000.00",
                "keterangan": "Maintenance kebersihan dan estetika area perawatan bedah",
                "status": "menunggu_approval_laporan",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.05", "Biaya Pemel. Bangunan RS", "POS BIAYA PEMELIHARAAN", "Cat Jotun Medis 4 pail & ongkos kerja", "3750000.00"),
                ],
            },
            {
                "tanggal": today - timedelta(days=7),
                "keperluan": "Penggantian pompa air pendorong (booster pump) tangki air bersih utama",
                "nominal": "2900000.00",
                "keterangan": "Menjaga debit air ruang operasi dan instalasi sterilisasi CSSD",
                "status": "menunggu_approval_laporan",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
                "dicairkan_oleh": evi,
                "items": [
                    ("53.22.05", "Biaya Pemel. Bangunan RS", "POS BIAYA PEMELIHARAAN", "Pompa Booster Shimizu 300W & aksesoris", "2900000.00"),
                ],
            },

            # MENUNGGU REALISASI (3 item)
            {
                "tanggal": today - timedelta(days=2),
                "keperluan": "Perpanjangan lisensi antivirus endpoint 50 node & pembaruan SSL certificate portal SIMAK",
                "nominal": "4500000.00",
                "keterangan": "Keamanan jaringan dan proteksi data rekam medis elektronik rumah sakit",
                "status": "menunggu_realisasi",
                "created_by": evi,
                "disetujui_oleh": nevi,
            },
            {
                "tanggal": today - timedelta(days=1),
                "keperluan": "Penggantian motor penggerak pintu geser otomatis (sliding door) IGD",
                "nominal": "8200000.00",
                "keterangan": "Pintu otomatis darurat sering macet dan mengganggu evakuasi",
                "status": "menunggu_realisasi",
                "created_by": fauzi,
                "disetujui_oleh": nevi,
            },
            {
                "tanggal": today,
                "keperluan": "Pengadaan brankar transfer pasien darurat hydraulic transfer stretcher",
                "nominal": "9500000.00",
                "keterangan": "Penggantian brankar transfer IGD yang sudah aus hidroliknya",
                "status": "menunggu_realisasi",
                "created_by": dewi,
                "disetujui_oleh": nevi,
            },

            # PENDING (3 item)
            {
                "tanggal": today,
                "keperluan": "Penggantian aki genset cadangan 150 kVA & penggantian filter solar utama",
                "nominal": "3200000.00",
                "keterangan": "Maintenance wajib power backup RS Siaga menjelang musim hujan",
                "status": "pending",
                "created_by": fauzi,
            },
            {
                "tanggal": today,
                "keperluan": "Pengadaan barcode scanner 2D nirkabel farmasi & rawat jalan (4 unit)",
                "nominal": "4800000.00",
                "keterangan": "Mendukung e-prescribing dan verifikasi obat satu pintu",
                "status": "pending",
                "created_by": febry,
            },
            {
                "tanggal": today,
                "keperluan": "Pemasangan peredam suara kamar mesin genset cadangan",
                "nominal": "6000000.00",
                "keterangan": "Kepatuhan baku mutu kebisingan lingkungan rawat inap",
                "status": "pending",
                "created_by": fauzi,
            },

            # DITOLAK (2 item)
            {
                "tanggal": today - timedelta(days=10),
                "keperluan": "Pengadaan sofa lobi tunggu tambahan 2 set",
                "nominal": "5000000.00",
                "keterangan": "Penambahan kursi tunggu keluarga pasien rawat inap",
                "status": "ditolak",
                "catatan_tolak": "Anggaran dialihkan untuk prioritas perbaikan genset dan sistem penunjang listrik.",
                "created_by": febry,
                "disetujui_oleh": nevi,
            },
            {
                "tanggal": today - timedelta(days=15),
                "keperluan": "Pengadaan Smart TV 65 inch display informasi lobi utama",
                "nominal": "8500000.00",
                "keterangan": "Media informasi dokter dan antrean poliklinik",
                "status": "ditolak",
                "catatan_tolak": "Disarankan menggunakan monitor signage yang ada terlebih dahulu.",
                "created_by": febry,
                "disetujui_oleh": nevi,
            },
        ]

        for spec in kb_specs:
            items_data = spec.pop("items", None)
            st = spec.get("status")
            kb = KasBesar.objects.create(
                tanggal=spec["tanggal"],
                keperluan=spec["keperluan"],
                nominal=Decimal(spec["nominal"]),
                keterangan=spec["keterangan"],
                status=st,
                created_by=spec["created_by"],
                disetujui_oleh=spec.get("disetujui_oleh"),
                dicairkan_oleh=spec.get("dicairkan_oleh"),
                catatan_tolak=spec.get("catatan_tolak", ""),
            )
            if st in ("selesai", "menunggu_approval_laporan") and items_data:
                lap = LaporanPenggunaanKasBesar.objects.create(
                    kas_besar=kb,
                    tanggal_laporan=spec["tanggal"] + timedelta(days=2),
                    nominal_digunakan=Decimal(spec["nominal"]),
                    selisih=Decimal("0.00"),
                    rincian="; ".join(f"[{it[0]}] {it[3]} (Rp {Decimal(it[4]):,.0f})" for it in items_data),
                    pengembalian_selesai=(st == "selesai"),
                    dikonfirmasi_oleh=evi if st == "selesai" else None,
                )
                for it in items_data:
                    # it = (kode, nama, pos, deskripsi, nilai)
                    ItemLaporanKasBesar.objects.create(
                        laporan=lap,
                        kode_akun=it[0],
                        nama_akun=it[1],
                        pos_biaya=it[2],
                        deskripsi=it[3],
                        nilai=Decimal(it[4]),
                    )

        self.stdout.write(f"  - Total Kas Besar berhasil di-seed: {len(kb_specs)} pengajuan.")

    def seed_reimbursement(self, users):
        today = timezone.localdate()
        nevi = users["nevi"]
        ulfa = users["ulfa"]
        evi = users["evi"]
        fauzi = users["fauzi"]
        febry = users["febry"]
        rina = users["rina"]
        dewi = users["dewi"]

        rb_specs = [
            # DICAIRKAN (6 item)
            (fauzi, 25, 26, "BBM darurat & tol ambulans rujukan pasien BPJS ke RSUD Tarakan", "275000.00", "Kuitansi SPBU Pertamina & struk e-toll rujukan darurat", "dicairkan"),
            (febry, 20, 21, "Penggantian konsumsi makan malam lembur closing akhir bulan tim accounting", "310000.00", "Nota rumah makan lembur penyusunan laporan keuangan", "dicairkan"),
            (dewi, 16, 17, "Pembelian obat darurat luar faskes saat stok apotek kosong mendadak", "285000.00", "Struk kuitansi Apotek Kimia Farma 24 Jam", "dicairkan"),
            (evi, 12, 13, "Penggantian voucher internet darurat router pendaftaran SIMAK saat ISP down", "150000.00", "Pembelian kuota data darurat Telkomsel Orbit", "dicairkan"),
            (fauzi, 8, 9, "Penggantian biaya tambal ban & oli darurat mobil operasional ambulans 2", "190000.00", "Kuitansi bengkel tambal ban tubeless & oli pertamina", "dicairkan"),
            (rina, 5, 6, "Biaya fotokopi dan jilid proposal kerja sama klinik jejaring faskes 1", "165000.00", "Nota percetakan berkas MOU klinik rekanan", "dicairkan"),

            # DISETUJUI (4 item)
            (febry, 3, 4, "Penggantian biaya fotokopi, jilid spiral, dan materai berkas audit keuangan eksternal", "140000.00", "Nota percetakan berkas laporan audit KAP", "disetujui"),
            (dewi, 2, 3, "Pembelian rapid test antigen mendadak nakes kontak erat pasien positif", "250000.00", "Struk pembelian alat antigen Panbio 2 pcs", "disetujui"),
            (febry, 2, 2, "Penggantian biaya cetak kartu identitas pasien darurat rawat jalan", "120000.00", "Nota percetakan kartu berobat plastik", "disetujui"),
            (fauzi, 1, 2, "Biaya parkir dan tiket tol koordinasi dinas kesehatan provinsi di Samarinda", "180000.00", "Struk e-toll Balikpapan-Samarinda & karcis parkir kantor dinkes", "disetujui"),

            # PENDING (4 item)
            (rina, 0, 1, "Penggantian biaya cetak banner informasi alur pendaftaran pasien BPJS Kesehatan", "195000.00", "Banner sosialisasi diletakkan di pintu masuk loket pendaftaran", "pending"),
            (dewi, 0, 1, "Penggantian pembelian kabel konverter monitor USG portabel IGD", "220000.00", "Kabel micro HDMI to VGA display USG darurat", "pending"),
            (febry, 0, 0, "Penggantian transport kurir pengantar berkas tagihan klaim BPJS", "90000.00", "Transport ojek online pengantaran dokumen berkas", "pending"),
            (fauzi, 0, 1, "Biaya pembelian snack konsumsi visitasi tim pengawas limbah medis DLH", "170000.00", "Kue kotak & air mineral jamuan inspeksi TPS B3", "pending"),

            # DITOLAK (2 item)
            (fauzi, 14, 15, "Penggantian pembelian mantel / jas hujan pelindung pribadi staf umum", "150000.00", "Perlengkapan hujan pribadi", "ditolak", "Pengeluaran perlengkapan pribadi tidak dapat diajukan sebagai reimbursement operasional."),
            (fauzi, 7, 8, "Penggantian cuci mobil operasional di car wash premium salon mobil", "120000.00", "Cuci poles mobil direksi", "ditolak", "Gunakan fasilitas cuci mandiri tim operasional RS."),
        ]

        for spec in rb_specs:
            u = spec[0]
            d_ago = spec[1]
            nota_ago = spec[2]
            kep = spec[3]
            nom = spec[4]
            ket = spec[5]
            st = spec[6]
            tolak = spec[7] if len(spec) > 7 else ""

            Reimbursement.objects.create(
                tanggal=today - timedelta(days=d_ago),
                tanggal_nota=today - timedelta(days=nota_ago),
                keperluan=kep,
                nominal=Decimal(nom),
                keterangan=ket,
                berkas="",
                status=st,
                catatan_tolak=tolak,
                created_by=u,
                disetujui_oleh=nevi if st in ("disetujui", "dicairkan") else None,
                dicairkan_oleh=ulfa if st == "dicairkan" else None,
            )

        self.stdout.write(f"  - Total Reimbursement berhasil di-seed: {len(rb_specs)} pengajuan.")
