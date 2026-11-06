from decimal import Decimal
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from gudang.models.master import Gudang, Barang
from gudang.models.numbering import NumberingSequence
from gudang.models.opname import StockOpname, StockOpnameItem
from gudang.models.ledger import StokSaldo
from gudang.services.stock import StockService


class OpnameService:
    @classmethod
    @transaction.atomic
    def create_opname(
        cls,
        tanggal: Optional[Any] = None,
        items_data: Optional[List[Dict[str, Any]]] = None,
        jenis: str = StockOpname.JENIS_SALDO_AWAL,
        gudang: Optional[Gudang] = None,
        user: Any = None,
        catatan: str = ''
    ) -> StockOpname:
        """
        Membuat draft dokumen Stock Opname (Saldo Awal Cut-Over atau Opname Fisik Rutin).
        """
        if not items_data:
            raise ValidationError("Daftar barang opname tidak boleh kosong.")

        if not gudang:
            gudang = Gudang.get_default()

        tgl = tanggal or timezone.now().date()
        tahun = tgl.year if hasattr(tgl, 'year') else timezone.now().year
        nomor = NumberingSequence.get_next('OPN', tahun=tahun, width=5)

        opname = StockOpname.objects.create(
            nomor=nomor,
            tanggal=tgl,
            gudang=gudang,
            jenis=jenis,
            status=StockOpname.STATUS_DRAFT,
            catatan=catatan,
            created_by=user
        )

        total_selisih_qty = Decimal('0.000')
        total_nilai_fisik = Decimal('0.00')

        for item in items_data:
            barang = item['barang']
            if isinstance(barang, (int, str)):
                barang = Barang.objects.get(id=barang)

            # Snapshot saldo sistem saat ini
            saldo = StokSaldo.objects.filter(barang=barang, gudang=gudang).first()
            qty_sistem = saldo.qty if saldo else Decimal('0.000')

            qty_fisik = Decimal(str(item.get('qty_fisik') or 0))
            if qty_fisik < Decimal('0'):
                raise ValidationError(f"Jumlah fisik untuk '{barang.nama}' tidak boleh negatif.")

            satuan = item.get('satuan') or barang.satuan_dasar.kode

            if jenis == StockOpname.JENIS_SALDO_AWAL:
                selisih = qty_fisik
                # Saldo awal cut-over: ambil harga_unit yang tersimpan di saldo/input jika ada, atau 0
                harga_unit = Decimal(str(item.get('harga_unit') or (saldo.avg_cost if saldo else 0)))
            else:
                selisih = qty_fisik - qty_sistem
                # Opname fisik rutin: murni penyesuaian kuantitas fisik, harga selalu mengikuti avg_cost sistem
                harga_unit = saldo.avg_cost if saldo else Decimal(str(item.get('harga_unit') or 0))

            subtotal_fisik = (qty_fisik * harga_unit).quantize(Decimal('0.01'))
            subtotal_selisih = (selisih * harga_unit).quantize(Decimal('0.01'))

            total_selisih_qty += selisih
            total_nilai_fisik += subtotal_fisik

            StockOpnameItem.objects.create(
                opname=opname,
                barang=barang,
                qty_sistem=qty_sistem,
                qty_fisik=qty_fisik,
                selisih=selisih,
                satuan=satuan,
                harga_unit=harga_unit,
                subtotal_fisik=subtotal_fisik,
                subtotal_selisih=subtotal_selisih,
                keterangan=str(item.get('keterangan') or '').strip()
            )

        opname.total_selisih_qty = total_selisih_qty
        opname.total_nilai_fisik = total_nilai_fisik
        opname.save(update_fields=['total_selisih_qty', 'total_nilai_fisik'])

        return opname

    @classmethod
    @transaction.atomic
    def approve_opname(cls, opname: StockOpname, user: Any) -> StockOpname:
        """
        Persetujuan dokumen Opname & eksekusi penyesuaian stok:
        1. Jika SALDO_AWAL: catat mutasi masuk awal (INIT) sejumlah qty_fisik @ harga_unit.
        2. Jika RUTIN:
           - Jika selisih > 0: catat penyesuaian masuk (ADJ_IN).
           - Jika selisih < 0: catat penyesuaian keluar (ADJ_OUT).
        """
        if opname.status != StockOpname.STATUS_DRAFT:
            raise ValidationError(f"Dokumen opname {opname.nomor} sudah berstatus {opname.status}.")

        for item in opname.items.select_related('barang').all():
            if opname.jenis == StockOpname.JENIS_SALDO_AWAL:
                if item.qty_fisik > Decimal('0'):
                    StockService.record_in(
                        barang=item.barang,
                        gudang=opname.gudang,
                        qty=item.qty_fisik,
                        harga_unit=item.harga_unit,
                        sumber_tipe='INIT',
                        sumber_id=str(opname.id),
                        sumber_nomor=opname.nomor,
                        keterangan=f"Saldo Awal Cut-Over: {opname.nomor} ({item.keterangan or '-'})",
                        user=user,
                        jenis='SALDO_AWAL'
                    )
            else:
                # Opname Fisik Rutin
                if item.selisih > Decimal('0'):
                    StockService.record_in(
                        barang=item.barang,
                        gudang=opname.gudang,
                        qty=item.selisih,
                        harga_unit=item.harga_unit,
                        sumber_tipe='ADJ_IN',
                        sumber_id=str(opname.id),
                        sumber_nomor=opname.nomor,
                        keterangan=f"Penyesuaian Fisik Lebih: {opname.nomor} ({item.keterangan or '-'})",
                        user=user,
                        jenis='ADJ_PLUS'
                    )
                elif item.selisih < Decimal('0'):
                    StockService.record_out(
                        barang=item.barang,
                        gudang=opname.gudang,
                        qty=abs(item.selisih),
                        sumber_tipe='ADJ_OUT',
                        sumber_id=str(opname.id),
                        sumber_nomor=opname.nomor,
                        keterangan=f"Penyesuaian Fisik Kurang: {opname.nomor} ({item.keterangan or '-'})",
                        user=user,
                        jenis='ADJ_MINUS'
                    )

        opname.status = StockOpname.STATUS_DISETUJUI
        opname.approved_by = user
        opname.approved_at = timezone.now()
        opname.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

        return opname

    @classmethod
    @transaction.atomic
    def cancel_opname(cls, opname: StockOpname, user: Any, alasan: str = '') -> StockOpname:
        if opname.status != StockOpname.STATUS_DRAFT:
            raise ValidationError(f"Hanya dokumen opname DRAFT yang dapat dibatalkan (status saat ini: {opname.status}).")

        opname.status = StockOpname.STATUS_BATAL
        if alasan:
            opname.catatan = f"{opname.catatan} [Dibatalkan: {alasan}]".strip()
        opname.approved_by = user
        opname.approved_at = timezone.now()
        opname.save(update_fields=['status', 'catatan', 'approved_by', 'approved_at', 'updated_at'])

        return opname

