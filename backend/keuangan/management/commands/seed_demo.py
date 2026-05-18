from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from keuangan.models import (
    Kendaraan,
    LaporanPenggunaan,
    LaporanPerjalanan,
    LogBBM,
    LogMaintenance,
    LogPerjalanan,
    PettyCash,
    Reimbursement,
    RiwayatSaldoPettyCash,
    SaldoPettyCash,
)
from users.models import Unit


SEED_MARK = "DEMO_SEED"
DEMO_PASSWORD = "demo12345"


class Command(BaseCommand):
    help = "Seed data demo untuk dashboard PC, reimbursement, dan driver."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Hapus data demo lama lalu seed ulang.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["force"]:
            self.clear_seed_data()
        elif self.seed_exists():
            self.stdout.write(
                self.style.WARNING(
                    "Data demo sudah ada. Pakai --force kalau mau seed ulang."
                )
            )
            return

        units = self.create_units()
        users = self.create_users(units)
        vehicles = self.create_vehicles()

        self.seed_saldo(users)
        self.seed_petty_cash(users)
        self.seed_reimbursement(users)
        self.seed_driver(users, vehicles)

        self.stdout.write(self.style.SUCCESS("Seed data demo selesai."))
        self.stdout.write(
            "Akun demo: demo_manager, demo_direktur, demo_karyawan, demo_driver"
        )
        self.stdout.write(f"Password semua akun demo: {DEMO_PASSWORD}")

    def seed_exists(self):
        return (
            PettyCash.objects.filter(keterangan__icontains=SEED_MARK).exists()
            or Reimbursement.objects.filter(keterangan__icontains=SEED_MARK).exists()
            or LogPerjalanan.objects.filter(keterangan__icontains=SEED_MARK).exists()
            or LogBBM.objects.filter(keterangan__icontains=SEED_MARK).exists()
            or LogMaintenance.objects.filter(deskripsi__icontains=SEED_MARK).exists()
        )

    def clear_seed_data(self):
        LaporanPenggunaan.objects.filter(rincian__icontains=SEED_MARK).delete()
        PettyCash.objects.filter(keterangan__icontains=SEED_MARK).delete()
        Reimbursement.objects.filter(keterangan__icontains=SEED_MARK).delete()
        LaporanPerjalanan.objects.filter(keterangan__icontains=SEED_MARK).delete()
        LogPerjalanan.objects.filter(keterangan__icontains=SEED_MARK).delete()
        LogBBM.objects.filter(keterangan__icontains=SEED_MARK).delete()
        LogMaintenance.objects.filter(deskripsi__icontains=SEED_MARK).delete()
        RiwayatSaldoPettyCash.objects.filter(keterangan__icontains=SEED_MARK).delete()

    def create_units(self):
        names = ["Keuangan", "Radiologi", "Rawat Inap", "Driver", "IT"]
        return {
            name: Unit.objects.get_or_create(
                nama=name,
                defaults={"is_active": True},
            )[0]
            for name in names
        }

    def create_users(self, units):
        User = get_user_model()
        specs = [
            {
                "username": "demo_manager",
                "first_name": "Maya",
                "last_name": "Lestari",
                "role": "manajer",
                "unit": units["Keuangan"],
            },
            {
                "username": "demo_direktur",
                "first_name": "Arman",
                "last_name": "Prasetyo",
                "role": "direktur",
                "unit": units["Keuangan"],
            },
            {
                "username": "demo_karyawan",
                "first_name": "Rina",
                "last_name": "Safitri",
                "role": "karyawan",
                "unit": units["Radiologi"],
            },
            {
                "username": "demo_driver",
                "first_name": "Dedi",
                "last_name": "Saputra",
                "role": "karyawan",
                "unit": units["Driver"],
                "is_driver": True,
            },
        ]

        users = {}
        for spec in specs:
            username = spec.pop("username")
            user, _ = User.objects.get_or_create(username=username)
            for field, value in spec.items():
                setattr(user, field, value)
            user.is_active = True
            user.set_password(DEMO_PASSWORD)
            user.save()
            users[username] = user
        return users

    def create_vehicles(self):
        specs = [
            ("KT 1234 SA", "Ambulans 1", "ambulans"),
            ("KT 4321 SB", "Avanza Operasional", "mobil"),
            ("KT 8899 SC", "Motor Kurir", "motor"),
        ]
        vehicles = {}
        for plat, nama, jenis in specs:
            vehicle, _ = Kendaraan.objects.update_or_create(
                plat_nomor=plat,
                defaults={
                    "nama": nama,
                    "jenis": jenis,
                    "is_active": True,
                    "keterangan": "Kendaraan demo untuk dashboard.",
                },
            )
            vehicles[plat] = vehicle
        return vehicles

    def seed_saldo(self, users):
        saldo, _ = SaldoPettyCash.objects.get_or_create(pk=1)
        saldo.saldo = Decimal("5000000")
        saldo.updated_by = users["demo_manager"]
        saldo.save()

        RiwayatSaldoPettyCash.objects.create(
            nama_pengaju="Maya Lestari",
            unit_pengaju="Keuangan",
            jenis="penambahan",
            jumlah=Decimal("5000000"),
            saldo_sebelum=Decimal("0"),
            saldo_sesudah=Decimal("5000000"),
            keterangan=f"{SEED_MARK} - Saldo awal demo.",
            created_by=users["demo_manager"],
        )

    def seed_petty_cash(self, users):
        today = timezone.localdate()
        manager = users["demo_manager"]
        director = users["demo_direktur"]
        employee = users["demo_karyawan"]
        driver = users["demo_driver"]

        specs = [
            (employee, today, "Pembelian ATK ruangan radiologi", "350000", "pending"),
            (driver, today - timedelta(days=1), "Transport koordinasi rujukan", "220000", "pending"),
            (employee, today - timedelta(days=2), "Konsumsi rapat kecil unit", "185000", "pending"),
            (employee, today - timedelta(days=4), "Pembelian perlengkapan administrasi", "475000", "disetujui"),
            (driver, today - timedelta(days=6), "Biaya parkir dan tol operasional", "160000", "dicairkan"),
            (employee, today - timedelta(days=9), "Pembelian map arsip dan label", "275000", "selesai"),
            (employee, today - timedelta(days=12), "Permintaan biaya dekorasi tambahan", "500000", "ditolak"),
        ]

        for created_by, tanggal, keperluan, nominal, status in specs:
            petty_cash = PettyCash.objects.create(
                tanggal=tanggal,
                keperluan=keperluan,
                nominal=Decimal(nominal),
                keterangan=f"{SEED_MARK} - Data contoh petty cash.",
                status=status,
                created_by=created_by,
                disetujui_oleh=director if status in ["disetujui", "dicairkan", "selesai"] else None,
                dicairkan_oleh=manager if status in ["dicairkan", "selesai"] else None,
                catatan_tolak="Tidak sesuai prioritas bulan ini." if status == "ditolak" else "",
            )
            if status == "selesai":
                LaporanPenggunaan.objects.create(
                    petty_cash=petty_cash,
                    tanggal_laporan=tanggal + timedelta(days=1),
                    nominal_digunakan=Decimal("250000"),
                    selisih=Decimal("25000"),
                    rincian=f"{SEED_MARK} - Map arsip Rp 200.000, label Rp 50.000.",
                    pengembalian_selesai=True,
                    dikonfirmasi_oleh=manager,
                )

    def seed_reimbursement(self, users):
        today = timezone.localdate()
        manager = users["demo_manager"]
        director = users["demo_direktur"]
        employee = users["demo_karyawan"]
        driver = users["demo_driver"]

        specs = [
            (employee, today, "Penggantian pembelian tinta printer", "320000", "pending"),
            (driver, today - timedelta(days=1), "Penggantian e-toll rujukan pasien", "150000", "pending"),
            (employee, today - timedelta(days=3), "Penggantian biaya fotokopi dokumen", "90000", "disetujui"),
            (driver, today - timedelta(days=5), "Penggantian BBM operasional mendadak", "250000", "dicairkan"),
            (employee, today - timedelta(days=8), "Penggantian pembelian item non prioritas", "410000", "ditolak"),
        ]

        for created_by, tanggal, keperluan, nominal, status in specs:
            Reimbursement.objects.create(
                tanggal=tanggal,
                keperluan=keperluan,
                nominal=Decimal(nominal),
                keterangan=f"{SEED_MARK} - Data contoh reimbursement.",
                berkas="",
                status=status,
                created_by=created_by,
                disetujui_oleh=director if status in ["disetujui", "dicairkan"] else None,
                dicairkan_oleh=manager if status == "dicairkan" else None,
                catatan_tolak="Bukti transaksi belum memadai." if status == "ditolak" else "",
            )

    def seed_driver(self, users, vehicles):
        today = timezone.localdate()
        driver = users["demo_driver"]
        manager = users["demo_manager"]

        specs = [
            (today, vehicles["KT 1234 SA"], "Rujukan pasien ke RSUD", 12450, None, "pending"),
            (today - timedelta(days=1), vehicles["KT 4321 SB"], "Antar dokumen klaim", 55200, None, "pending"),
            (today - timedelta(days=2), vehicles["KT 1234 SA"], "Jemput pasien pulang rawat", 12400, None, "disetujui"),
            (today - timedelta(days=4), vehicles["KT 8899 SC"], "Pengantaran berkas laboratorium", 18800, 18832, "dilaporkan"),
            (today - timedelta(days=7), vehicles["KT 4321 SB"], "Koordinasi pengadaan alat", 55100, 55158, "selesai"),
            (today - timedelta(days=10), vehicles["KT 1234 SA"], "Perjalanan tanpa surat tugas", 12310, None, "ditolak"),
        ]

        for tanggal, vehicle, tujuan, km_awal, km_akhir, status in specs:
            log = LogPerjalanan.objects.create(
                driver=driver,
                kendaraan=vehicle,
                tanggal=tanggal,
                jam_berangkat=time(8, 15),
                jam_kembali=time(10, 30) if km_akhir else None,
                tujuan=tujuan,
                km_awal=km_awal,
                km_akhir=km_akhir,
                penumpang="Petugas unit terkait",
                keterangan=f"{SEED_MARK} - Data contoh perjalanan driver.",
                status=status,
                disetujui_oleh=manager if status in ["disetujui", "dilaporkan", "selesai"] else None,
                catatan_tolak="Tujuan belum dilengkapi dokumen pendukung." if status == "ditolak" else "",
            )
            if status in ["dilaporkan", "selesai"]:
                LaporanPerjalanan.objects.create(
                    log_perjalanan=log,
                    tanggal_laporan=tanggal,
                    deskripsi="Perjalanan selesai dan kendaraan kembali dalam kondisi baik.",
                    tujuan_tercapai=True,
                    keterangan=f"{SEED_MARK} - Laporan perjalanan demo.",
                )

        LogBBM.objects.create(
            driver=driver,
            kendaraan=vehicles["KT 1234 SA"],
            tanggal=today - timedelta(days=2),
            total_biaya=Decimal("350000"),
            km_saat_isi=12425,
            keterangan=f"{SEED_MARK} - Isi BBM ambulans.",
        )
        LogBBM.objects.create(
            driver=driver,
            kendaraan=vehicles["KT 4321 SB"],
            tanggal=today - timedelta(days=5),
            total_biaya=Decimal("250000"),
            km_saat_isi=55120,
            keterangan=f"{SEED_MARK} - Isi BBM operasional.",
        )
        LogBBM.objects.create(
            driver=driver,
            kendaraan=vehicles["KT 8899 SC"],
            tanggal=today - timedelta(days=6),
            total_biaya=Decimal("65000"),
            km_saat_isi=18790,
            keterangan=f"{SEED_MARK} - Isi BBM motor kurir.",
        )

        LogMaintenance.objects.create(
            kendaraan=vehicles["KT 1234 SA"],
            dilaporkan_oleh=driver,
            jenis="servis_rutin",
            tanggal=today - timedelta(days=14),
            biaya=Decimal("750000"),
            deskripsi=f"{SEED_MARK} - Servis rutin ambulans.",
        )
        LogMaintenance.objects.create(
            kendaraan=vehicles["KT 4321 SB"],
            dilaporkan_oleh=driver,
            jenis="ganti_oli",
            tanggal=today - timedelta(days=20),
            biaya=Decimal("320000"),
            deskripsi=f"{SEED_MARK} - Ganti oli kendaraan operasional.",
        )
