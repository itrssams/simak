from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict, Any
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from gudang.models import (
    Barang, Gudang, StokLedger, StokSaldo
)


def _round_cur(val: Decimal) -> Decimal:
    return Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _round_avg(val: Decimal) -> Decimal:
    return Decimal(str(val)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)


class StockService:
    """
    Satu-satunya service di seluruh aplikasi yang berhak menambah / mengurangi stok.
    Menggunakan Weighted Moving Average (Rata-rata Bergerak) dan append-only StokLedger.
    Semua operasi dijamin atomic dan thread-safe menggunakan select_for_update().
    """

    @classmethod
    def get_or_lock_saldo(cls, barang: Barang, gudang: Gudang) -> StokSaldo:
        """
        Mengambil atau membuat baris StokSaldo dengan row-level lock (select_for_update).
        Wajib dipanggil di dalam transaction.atomic().
        """
        saldo, _ = StokSaldo.objects.select_for_update().get_or_create(
            barang=barang,
            gudang=gudang,
            defaults={
                'qty': Decimal('0'),
                'nilai': Decimal('0'),
                'avg_cost': Decimal('0'),
            }
        )
        return saldo

    @classmethod
    def record_in(
        cls,
        barang: Barang,
        gudang: Gudang,
        qty: Decimal,
        harga_unit: Decimal,
        sumber_tipe: str,
        sumber_id: str,
        sumber_nomor: str = '',
        keterangan: str = '',
        user: Any = None,
        tanggal_efektif: Optional[Any] = None,
        jenis: str = 'IN'
    ) -> StokLedger:
        """
        Mencatat mutasi masuk (Penerimaan / Saldo Awal / Adjustment Plus).
        """
        qty = Decimal(str(qty))
        harga_unit = Decimal(str(harga_unit))

        if qty <= Decimal('0'):
            raise ValidationError(f"Kuantitas barang masuk harus lebih dari 0. Diberikan: {qty}")
        if harga_unit < Decimal('0'):
            raise ValidationError(f"Harga unit tidak boleh negatif. Diberikan: {harga_unit}")

        nilai_transaksi = _round_cur(qty * harga_unit)
        tgl = tanggal_efektif or timezone.now()

        with transaction.atomic():
            saldo = cls.get_or_lock_saldo(barang, gudang)

            new_qty = saldo.qty + qty
            new_nilai = _round_cur(saldo.nilai + nilai_transaksi)
            new_avg = _round_avg(new_nilai / new_qty) if new_qty > Decimal('0') else Decimal('0')

            saldo.qty = new_qty
            saldo.nilai = new_nilai
            saldo.avg_cost = new_avg
            saldo.save(update_fields=['qty', 'nilai', 'avg_cost', 'updated_at'])

            ledger = StokLedger.objects.create(
                gudang=gudang,
                barang=barang,
                tanggal_efektif=tgl,
                jenis=jenis,
                qty_dasar=qty,
                nilai_unit=harga_unit,
                nilai_total=nilai_transaksi,
                saldo_qty_setelah=new_qty,
                saldo_nilai_setelah=new_nilai,
                sumber_tipe=sumber_tipe,
                sumber_id=str(sumber_id),
                sumber_nomor=str(sumber_nomor or ''),
                keterangan=keterangan,
                created_by=user,
            )

            return ledger

    @classmethod
    def record_out(
        cls,
        barang: Barang,
        gudang: Gudang,
        qty: Decimal,
        sumber_tipe: str,
        sumber_id: str,
        sumber_nomor: str = '',
        keterangan: str = '',
        user: Any = None,
        tanggal_efektif: Optional[Any] = None,
        jenis: str = 'OUT'
    ) -> StokLedger:
        """
        Mencatat mutasi keluar (Pengeluaran Unit / Adjustment Minus).
        Ditolak jika stok tidak mencukupi (anti stok minus).
        Mengurangi nilai menggunakan avg_cost berjalan saat ini.
        """
        qty = Decimal(str(qty))
        if qty <= Decimal('0'):
            raise ValidationError(f"Kuantitas barang keluar harus lebih dari 0. Diberikan: {qty}")

        tgl = tanggal_efektif or timezone.now()

        with transaction.atomic():
            saldo = cls.get_or_lock_saldo(barang, gudang)

            if saldo.qty < qty:
                raise ValidationError(
                    f"Stok barang '{barang.nama}' tidak cukup. "
                    f"Tersedia: {saldo.qty} {barang.satuan_dasar.kode}, diminta: {qty} {barang.satuan_dasar.kode}."
                )

            biaya_unit = saldo.avg_cost
            nilai_keluar = _round_cur(qty * biaya_unit)

            new_qty = saldo.qty - qty
            new_nilai = _round_cur(saldo.nilai - nilai_keluar)

            # Jika stok habis sampai 0, serap sisa pembulatan sen ke 0
            if new_qty == Decimal('0'):
                new_nilai = Decimal('0')
                new_avg = Decimal('0')
            else:
                if new_nilai < Decimal('0'):
                    new_nilai = Decimal('0')
                new_avg = _round_avg(new_nilai / new_qty)

            saldo.qty = new_qty
            saldo.nilai = new_nilai
            saldo.avg_cost = new_avg
            saldo.save(update_fields=['qty', 'nilai', 'avg_cost', 'updated_at'])

            ledger = StokLedger.objects.create(
                gudang=gudang,
                barang=barang,
                tanggal_efektif=tgl,
                jenis=jenis,
                qty_dasar=-qty,  # Negatif untuk pengeluaran
                nilai_unit=biaya_unit,
                nilai_total=-nilai_keluar,
                saldo_qty_setelah=new_qty,
                saldo_nilai_setelah=new_nilai,
                sumber_tipe=sumber_tipe,
                sumber_id=str(sumber_id),
                sumber_nomor=str(sumber_nomor or ''),
                keterangan=keterangan,
                created_by=user,
            )

            return ledger

    @classmethod
    def record_reversal(
        cls,
        ledger_target: StokLedger,
        alasan: str,
        user: Any = None
    ) -> StokLedger:
        """
        Membatalkan (reversal) mutasi ledger sebelumnya dengan baris baru yang berlawanan.
        """
        if ledger_target.reversed_by.exists():
            raise ValidationError(f"Mutasi ledger {ledger_target.id} sudah pernah dibalik sebelumnya.")

        with transaction.atomic():
            saldo = cls.get_or_lock_saldo(ledger_target.barang, ledger_target.gudang)

            # Jika target adalah penambahan (+), membalik artinya mengurangi stok (-)
            if ledger_target.qty_dasar > Decimal('0'):
                qty_reversal = -ledger_target.qty_dasar
                if saldo.qty < ledger_target.qty_dasar:
                    raise ValidationError(
                        f"Tidak dapat membatalkan penerimaan {ledger_target.sumber_nomor}: "
                        f"Stok saat ini ({saldo.qty}) kurang dari jumlah penerimaan ({ledger_target.qty_dasar}). "
                        f"Sebagian barang kemungkinan sudah terpakai."
                    )
                new_qty = saldo.qty + qty_reversal
                new_nilai = _round_cur(saldo.nilai - ledger_target.nilai_total)
                jenis_rev = 'REV_IN'
            else:
                # Jika target adalah pengurangan (-), membalik artinya mengembalikan stok (+)
                qty_reversal = -ledger_target.qty_dasar  # Jadi positif
                new_qty = saldo.qty + qty_reversal
                new_nilai = _round_cur(saldo.nilai + (-ledger_target.nilai_total))
                jenis_rev = 'REV_OUT'

            if new_qty == Decimal('0'):
                new_nilai = Decimal('0')
                new_avg = Decimal('0')
            else:
                if new_nilai < Decimal('0'):
                    new_nilai = Decimal('0')
                new_avg = _round_avg(new_nilai / new_qty)

            saldo.qty = new_qty
            saldo.nilai = new_nilai
            saldo.avg_cost = new_avg
            saldo.save(update_fields=['qty', 'nilai', 'avg_cost', 'updated_at'])

            rev_ledger = StokLedger.objects.create(
                gudang=ledger_target.gudang,
                barang=ledger_target.barang,
                tanggal_efektif=timezone.now(),
                jenis=jenis_rev,
                qty_dasar=qty_reversal,
                nilai_unit=ledger_target.nilai_unit,
                nilai_total=-ledger_target.nilai_total,
                saldo_qty_setelah=new_qty,
                saldo_nilai_setelah=new_nilai,
                sumber_tipe='VOID',
                sumber_id=str(ledger_target.id),
                sumber_nomor=ledger_target.sumber_nomor,
                reversal_of=ledger_target,
                keterangan=f"Reversal transaksi {ledger_target.id} ({ledger_target.sumber_nomor}): {alasan}",
                created_by=user,
            )

            return rev_ledger

