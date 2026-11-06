from decimal import Decimal
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from gudang.models.master import Gudang, Barang, Ruang
from gudang.models.numbering import NumberingSequence
from gudang.models.distribution import Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem
from gudang.services.stock import StockService


class DistributionService:
    @classmethod
    @transaction.atomic
    def create_permintaan(
        cls,
        ruang: Any,
        items_data: List[Dict[str, Any]],
        user: Any = None,
        tanggal: Optional[Any] = None,
        catatan: str = '',
        legacy_out_id: Optional[int] = None,
        auto_submit: bool = True
    ) -> Permintaan:
        """
        Membuat permohonan amprahan/barang dari unit ruangan.
        Jika auto_submit=True, status langsung MENUNGGU (siap direview gudang).
        """
        if not items_data:
            raise ValidationError("Daftar barang permintaan tidak boleh kosong.")

        if isinstance(ruang, (int, str)):
            ruang = Ruang.objects.get(id=ruang)

        tgl = tanggal or timezone.now().date()
        tahun = tgl.year if hasattr(tgl, 'year') else timezone.now().year
        nomor = NumberingSequence.get_next('REQ', tahun=tahun, width=5)

        permintaan = Permintaan.objects.create(
            nomor=nomor,
            tanggal=tgl,
            ruang=ruang,
            ruang_nama=ruang.nama,
            catatan=catatan,
            legacy_out_id=legacy_out_id,
            status=Permintaan.STATUS_MENUNGGU if auto_submit else Permintaan.STATUS_DRAFT,
            created_by=user
        )

        for item in items_data:
            barang = item['barang']
            if isinstance(barang, (int, str)):
                barang = Barang.objects.get(id=barang)

            qty_minta = Decimal(str(item.get('qty_minta') or item.get('qty') or 0))
            if qty_minta <= Decimal('0'):
                raise ValidationError(f"Jumlah minta untuk '{barang.nama}' harus lebih dari 0.")

            satuan = item.get('satuan') or barang.satuan_dasar.kode
            qty_disetujui = Decimal(str(item.get('qty_disetujui', qty_minta)))

            PermintaanItem.objects.create(
                permintaan=permintaan,
                barang=barang,
                qty_minta=qty_minta,
                satuan=satuan,
                qty_disetujui=qty_disetujui,
                qty_dikeluarkan=Decimal('0.000'),
                legacy_out_id=item.get('legacy_out_id') or None,
                keterangan=str(item.get('keterangan') or '').strip()
            )

        return permintaan

    @classmethod
    @transaction.atomic
    def submit_permintaan(cls, permintaan: Permintaan, user: Any = None) -> Permintaan:
        if permintaan.status != Permintaan.STATUS_DRAFT:
            raise ValidationError(f"Hanya permintaan berstatus DRAFT yang dapat diajukan (status saat ini: {permintaan.status}).")
        permintaan.status = Permintaan.STATUS_MENUNGGU
        permintaan.save(update_fields=['status', 'updated_at'])
        return permintaan

    @classmethod
    @transaction.atomic
    def approve_permintaan(
        cls,
        permintaan: Permintaan,
        user: Any,
        items_approval: Optional[List[Dict[str, Any]]] = None
    ) -> Permintaan:
        """
        Gudang menyetujui permintaan barang dari unit ruangan.
        Bisa menyesuaikan qty_disetujui jika kuantitas disesuaikan dengan ketersediaan stok.
        """
        if permintaan.status not in (Permintaan.STATUS_MENUNGGU, Permintaan.STATUS_DRAFT):
            raise ValidationError(f"Permintaan {permintaan.nomor} tidak dalam status menunggu persetujuan (status: {permintaan.status}).")

        if items_approval:
            approval_map = {}
            for item in items_approval:
                if 'id' in item and item.get('qty_disetujui') is not None:
                    try:
                        approval_map[int(item['id'])] = max(Decimal('0'), Decimal(str(item['qty_disetujui'])))
                    except (ValueError, TypeError):
                        pass

            for pi in permintaan.items.all():
                if pi.id in approval_map:
                    pi.qty_disetujui = approval_map[pi.id]
                    pi.save(update_fields=['qty_disetujui'])

        permintaan.status = Permintaan.STATUS_DISETUJUI
        permintaan.approved_by = user
        permintaan.approved_at = timezone.now()
        permintaan.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
        return permintaan

    @classmethod
    @transaction.atomic
    def reject_permintaan(cls, permintaan: Permintaan, user: Any, alasan: str) -> Permintaan:
        if permintaan.status in (Permintaan.STATUS_SELESAI, Permintaan.STATUS_BATAL):
            raise ValidationError(f"Permintaan dengan status {permintaan.status} tidak dapat ditolak.")
        permintaan.status = Permintaan.STATUS_DITOLAK
        permintaan.alasan_tolak = alasan
        permintaan.approved_by = user
        permintaan.approved_at = timezone.now()
        permintaan.save(update_fields=['status', 'alasan_tolak', 'approved_by', 'approved_at', 'updated_at'])
        return permintaan

    @classmethod
    @transaction.atomic
    def create_pengeluaran(
        cls,
        ruang: Any,
        items_data: List[Dict[str, Any]],
        user: Any = None,
        permintaan: Optional[Permintaan] = None,
        gudang: Optional[Gudang] = None,
        tanggal: Optional[Any] = None,
        penerima_nama: str = '',
        catatan: str = '',
        legacy_out_id: Optional[int] = None
    ) -> Pengeluaran:
        """
        Membuat draft pengeluaran barang (bon serah terima fisik).
        """
        if not items_data:
            raise ValidationError("Daftar barang pengeluaran tidak boleh kosong.")

        if not permintaan and not legacy_out_id:
            raise ValidationError("Pengeluaran barang fisik wajib berdasarkan dokumen Permintaan Ruangan (Amprahan). Pengeluaran langsung tanpa permintaan tidak diperbolehkan.")

        if isinstance(ruang, (int, str)):
            ruang = Ruang.objects.get(id=ruang)

        if not gudang:
            gudang = Gudang.get_default()

        tgl = tanggal or timezone.now().date()
        tahun = tgl.year if hasattr(tgl, 'year') else timezone.now().year
        nomor = NumberingSequence.get_next('OUT', tahun=tahun, width=5)

        pengeluaran = Pengeluaran.objects.create(
            nomor=nomor,
            permintaan=permintaan,
            gudang=gudang,
            ruang=ruang,
            ruang_nama=ruang.nama,
            tanggal=tgl,
            penerima_nama=str(penerima_nama or '').strip(),
            status=Pengeluaran.STATUS_DRAFT,
            catatan=catatan,
            legacy_out_id=legacy_out_id,
            created_by=user
        )

        total_nilai = Decimal('0.00')

        for item in items_data:
            barang = item['barang']
            if isinstance(barang, (int, str)):
                barang = Barang.objects.get(id=barang)

            permintaan_item = item.get('permintaan_item')
            if isinstance(permintaan_item, (int, str)):
                permintaan_item = PermintaanItem.objects.get(id=permintaan_item)

            qty = Decimal(str(item.get('qty') or 0))
            if qty <= Decimal('0'):
                raise ValidationError(f"Jumlah pengeluaran untuk '{barang.nama}' harus lebih dari 0.")

            satuan = item.get('satuan') or barang.satuan_dasar.kode

            # Dapatkan estimasi HPP berjalan dari stok saldo saat draft dibuat
            saldo = StockService.get_or_lock_saldo(barang, gudang)
            harga_unit = saldo.avg_cost
            subtotal = (qty * harga_unit).quantize(Decimal('0.01'))
            total_nilai += subtotal

            PengeluaranItem.objects.create(
                pengeluaran=pengeluaran,
                permintaan_item=permintaan_item,
                barang=barang,
                qty=qty,
                satuan=satuan,
                harga_unit=harga_unit,
                subtotal=subtotal,
                legacy_out_id=item.get('legacy_out_id') or (permintaan_item.legacy_out_id if permintaan_item else None),
                keterangan=str(item.get('keterangan') or '').strip()
            )

        pengeluaran.total_nilai = total_nilai
        pengeluaran.save(update_fields=['total_nilai'])

        return pengeluaran

    @classmethod
    @transaction.atomic
    def approve_pengeluaran(cls, pengeluaran: Pengeluaran, user: Any) -> Pengeluaran:
        """
        Persetujuan pengeluaran & serah terima fisik:
        1. Potong stok via StockService.record_out (anti stok minus aktif).
        2. Catat nilai HPP aktual dan perbarui subtotal tiap item.
        3. Perbarui qty_dikeluarkan pada permohonan ruang (PermintaanItem).
        4. Jika semua item permohonan telah terpenuhi, ubah status Permintaan jadi SELESAI.
        """
        if pengeluaran.status != Pengeluaran.STATUS_DRAFT:
            raise ValidationError(f"Pengeluaran {pengeluaran.nomor} sudah berstatus {pengeluaran.status}.")

        actual_total_nilai = Decimal('0.00')

        for item in pengeluaran.items.select_related('barang', 'permintaan_item').all():
            ledger = StockService.record_out(
                barang=item.barang,
                gudang=pengeluaran.gudang,
                qty=item.qty,
                sumber_tipe='OUT',
                sumber_id=str(pengeluaran.id),
                sumber_nomor=pengeluaran.nomor,
                keterangan=f"Pengeluaran ke {pengeluaran.ruang_nama} (Penerima: {pengeluaran.penerima_nama or '-'})",
                user=user
            )

            # Update actual HPP and subtotal from ledger
            item.harga_unit = ledger.nilai_unit
            item.subtotal = abs(ledger.nilai_total)
            item.save(update_fields=['harga_unit', 'subtotal'])

            actual_total_nilai += item.subtotal

            # Update fulfilled qty on the room's requisition
            if item.permintaan_item:
                pi = item.permintaan_item
                pi.qty_dikeluarkan += item.qty
                pi.save(update_fields=['qty_dikeluarkan'])

            # Update status di Siaga lama jika terhubung dengan legacy_out_id
            leg_id = item.legacy_out_id or (item.permintaan_item.legacy_out_id if item.permintaan_item else None)
            if leg_id:
                try:
                    from django.db import connection
                    with connection.cursor() as cursor:
                        cursor.execute("""
                            UPDATE rssams.item_out_log
                            SET status = 'Sudah Diberikan',
                                qty = %s,
                                tgl_verif = NOW()
                            WHERE id = %s
                        """, [item.qty, leg_id])
                except Exception:
                    pass

        # Cek apakah permintaan asal sudah terpenuhi penuh
        if pengeluaran.permintaan:
            permintaan = pengeluaran.permintaan
            all_fulfilled = True
            for pi in permintaan.items.all():
                target_qty = pi.qty_disetujui if pi.qty_disetujui > Decimal('0') else pi.qty_minta
                if pi.qty_dikeluarkan < target_qty:
                    all_fulfilled = False
                    break
            if all_fulfilled:
                permintaan.status = Permintaan.STATUS_SELESAI
                permintaan.save(update_fields=['status', 'updated_at'])

        pengeluaran.total_nilai = actual_total_nilai
        pengeluaran.status = Pengeluaran.STATUS_DISETUJUI
        pengeluaran.approved_by = user
        pengeluaran.approved_at = timezone.now()
        pengeluaran.save(update_fields=['total_nilai', 'status', 'approved_by', 'approved_at', 'updated_at'])

        return pengeluaran

    @classmethod
    @transaction.atomic
    def sync_from_legacy_siaga(cls, user: Any = None) -> Dict[str, Any]:
        """
        Menarik permohonan yang berstatus 'Belum Ditanggapi' dari rssams.item_out_log (SIMRS Siaga)
        ke dalam Permintaan Gudang v2 (gdg_permintaan) dengan status MENUNGGU.
        """
        existing_legacy_ids = set(
            PermintaanItem.objects.filter(legacy_out_id__isnull=False)
            .values_list('legacy_out_id', flat=True)
        )

        barang_map = {b.legacy_id_brg: b for b in Barang.objects.filter(legacy_id_brg__isnull=False)}
        ruang_map = {r.legacy_id_ruang: r for r in Ruang.objects.filter(legacy_id_ruang__isnull=False)}

        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, id_brg, id_ruang, qty_minta, tgl
                FROM rssams.item_out_log
                WHERE status = 'Belum Ditanggapi'
                ORDER BY tgl ASC, id ASC
            """)
            rows = cursor.fetchall()

        groups = {}
        for r in rows:
            leg_id, id_brg, id_ruang, qty_minta, tgl = r
            if str(leg_id) in existing_legacy_ids:
                continue

            barang = barang_map.get(id_brg)
            ruang = ruang_map.get(id_ruang)
            if not barang or not ruang:
                continue

            tgl_date = tgl.date() if hasattr(tgl, 'date') else tgl
            key = (ruang.id, tgl_date)
            if key not in groups:
                groups[key] = {
                    'ruang': ruang,
                    'tanggal': tgl_date,
                    'items': []
                }

            groups[key]['items'].append({
                'barang': barang,
                'qty_minta': Decimal(str(qty_minta)),
                'satuan': barang.satuan_dasar.kode,
                'qty_disetujui': Decimal(str(qty_minta)),
                'legacy_out_id': str(leg_id),
                'keterangan': f'Sync Siaga {leg_id}'
            })

        permintaan_count = 0
        items_count = 0

        for key, g in groups.items():
            if not g['items']:
                continue
            p = cls.create_permintaan(
                ruang=g['ruang'],
                items_data=g['items'],
                user=user,
                tanggal=g['tanggal'],
                catatan='Sinkronisasi otomatis dari antrean Siaga RS',
                auto_submit=True
            )
            permintaan_count += 1
            items_count += len(g['items'])

        return {
            'permintaan_created': permintaan_count,
            'items_created': items_count
        }
