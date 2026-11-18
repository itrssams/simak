from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from gudang.models import (
    SuratPesanan, SuratPesananItem, Penerimaan, PenerimaanItem,
    NumberingSequence, Gudang, Barang
)
from gudang.services.stock import StockService


class PurchasingService:
    @staticmethod
    def _check_approver_permission(user, creator):
        """
        Validasi aturan approval:
        1. Khusus superuser atau username 'super' bisa semuanya tanpa batasan
        2. Role minimal kepala_seksi ke atas (kepala_seksi, manajer, wakil_direktur, direktur)
        3. Pembuat dokumen TIDAK BOLEH menyetujui dokumen buatannya sendiri (creator != approver)
        """
        if not user or not user.is_authenticated:
            raise ValidationError("Pengguna harus login untuk menyetujui dokumen.")

        if user.is_superuser or getattr(user, 'username', '') == 'super':
            return True

        role = getattr(user, 'role', None)
        valid_roles = ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        if role not in valid_roles:
            raise ValidationError("Hanya Koordinator, Kepala Seksi, Manajer, Wadir, atau Direktur yang dapat memberikan persetujuan.")

        if creator and creator.id == user.id:
            raise ValidationError("Pembuat dokumen tidak boleh menyetujui dokumen buatannya sendiri.")

        return True

    @classmethod
    @transaction.atomic
    def create_po(cls, tanggal, vendor_nama, items_data, user=None, vendor_id=None, catatan=''):
        tahun = tanggal.year if hasattr(tanggal, 'year') else timezone.now().year
        nomor = NumberingSequence.get_next('PO', tahun=tahun, width=5)

        po = SuratPesanan.objects.create(
            nomor=nomor,
            tanggal=tanggal,
            vendor_id=vendor_id,
            vendor_nama=str(vendor_nama).strip(),
            catatan=catatan,
            status=SuratPesanan.STATUS_DRAFT,
            created_by=user
        )

        for item in items_data:
            barang = item['barang']
            if isinstance(barang, (int, str)):
                barang = Barang.objects.get(id=barang)

            kemasan = str(item.get('kemasan') or barang.satuan_dasar.kode).strip().upper()
            isi = Decimal(str(item.get('isi') or 1))
            qty_kemasan = Decimal(str(item.get('qty_kemasan') or 0))
            harga_kemasan = Decimal(str(item.get('harga_kemasan') or 0))

            if qty_kemasan <= 0:
                raise ValidationError(f"Jumlah pesanan untuk {barang.nama} harus lebih dari 0.")

            SuratPesananItem.objects.create(
                po=po,
                barang=barang,
                kemasan=kemasan,
                isi=isi,
                qty_kemasan=qty_kemasan,
                harga_kemasan=harga_kemasan
            )

        po.recalculate_total()
        return po

    @classmethod
    def submit_po(cls, po, user):
        if po.status != SuratPesanan.STATUS_DRAFT:
            raise ValidationError("Hanya PO berstatus Draft yang dapat diajukan.")
        if not po.items.exists():
            raise ValidationError("PO tidak memiliki item barang.")

        po.status = SuratPesanan.STATUS_MENUNGGU
        po.submitted_at = timezone.now()
        po.save(update_fields=['status', 'submitted_at', 'updated_at'])
        return po

    @classmethod
    def approve_po(cls, po, user):
        if po.status != SuratPesanan.STATUS_MENUNGGU:
            raise ValidationError("Hanya PO berstatus Menunggu Approval yang dapat disetujui.")

        cls._check_approver_permission(user, po.created_by)

        po.status = SuratPesanan.STATUS_DISETUJUI
        po.approved_by = user
        po.approved_at = timezone.now()
        po.catatan_tolak = ''
        po.save(update_fields=['status', 'approved_by', 'approved_at', 'catatan_tolak', 'updated_at'])
        return po

    @classmethod
    def reject_po(cls, po, user, catatan_tolak=''):
        if po.status != SuratPesanan.STATUS_MENUNGGU:
            raise ValidationError("Hanya PO berstatus Menunggu Approval yang dapat ditolak.")

        cls._check_approver_permission(user, po.created_by)

        po.status = SuratPesanan.STATUS_DITOLAK
        po.approved_by = user
        po.approved_at = timezone.now()
        po.catatan_tolak = str(catatan_tolak or '').strip()
        po.save(update_fields=['status', 'approved_by', 'approved_at', 'catatan_tolak', 'updated_at'])
        return po

    @classmethod
    def _normalize_diskon_items(cls, diskon_items):
        if not diskon_items:
            return [], Decimal('0.00')
        if not isinstance(diskon_items, list):
            raise ValidationError("Format baris diskon tidak valid.")

        cleaned = []
        total_diskon = Decimal('0.00')
        for idx, row in enumerate(diskon_items, start=1):
            if not isinstance(row, dict):
                raise ValidationError(f"Format baris diskon #{idx} tidak valid.")
            desc = str(row.get('deskripsi') or '').strip()
            raw_val = row.get('nilai')
            has_val = raw_val not in (None, '', 0, '0')
            if has_val:
                try:
                    val = Decimal(str(raw_val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                except Exception:
                    raise ValidationError(f"Nominal potongan pada baris diskon #{idx} tidak valid.")
            else:
                val = Decimal('0.00')

            if desc and val <= Decimal('0.00'):
                raise ValidationError(f"Baris diskon #{idx} memiliki keterangan '{desc}', tetapi nominal potongan harus lebih dari 0.")
            if not desc and val > Decimal('0.00'):
                raise ValidationError(f"Baris diskon #{idx} memiliki nominal potongan, tetapi keterangan diskonnya masih kosong.")
            if desc and val > Decimal('0.00'):
                cleaned.append({'deskripsi': desc[:150], 'nilai': float(val)})
                total_diskon += val

        return cleaned, total_diskon

    @classmethod
    @transaction.atomic
    def create_grn(cls, tanggal, vendor_nama, items_data, user=None, po=None,
                   gudang=None, vendor_id=None, no_faktur='', tgl_jatuh_tempo=None,
                   metode_pembayaran='Kredit', kirim_keuangan=False, catatan='', tutup_po=True,
                   diskon_items=None):
        tahun = tanggal.year if hasattr(tanggal, 'year') else timezone.now().year
        nomor = NumberingSequence.get_next('GRN', tahun=tahun, width=5)

        if not gudang:
            gudang = Gudang.get_default()

        cleaned_diskon, total_diskon = cls._normalize_diskon_items(diskon_items)

        grn = Penerimaan.objects.create(
            nomor=nomor,
            po=po,
            gudang=gudang,
            tanggal=tanggal,
            vendor_id=vendor_id or (po.vendor_id if po else None),
            vendor_nama=str(vendor_nama).strip(),
            no_faktur=str(no_faktur or '').strip(),
            tgl_jatuh_tempo=tgl_jatuh_tempo,
            metode_pembayaran=metode_pembayaran,
            diskon_items=cleaned_diskon,
            diskon_total=total_diskon,
            status=Penerimaan.STATUS_DRAFT,
            tutup_po=bool(tutup_po),
            kirim_keuangan=kirim_keuangan,
            catatan=catatan,
            created_by=user
        )

        subtotal_bruto = Decimal('0.00')
        for item in items_data:
            barang = item['barang']
            if isinstance(barang, (int, str)):
                barang = Barang.objects.get(id=barang)

            po_item = item.get('po_item')
            if isinstance(po_item, (int, str)):
                po_item = SuratPesananItem.objects.get(id=po_item)

            kemasan = str(item.get('kemasan') or barang.satuan_dasar.kode).strip().upper()
            isi = Decimal(str(item.get('isi') or 1))
            qty_kemasan = Decimal(str(item.get('qty_kemasan') or 0))
            harga_kemasan = Decimal(str(item.get('harga_kemasan') or 0))

            if qty_kemasan <= 0:
                raise ValidationError(f"Jumlah penerimaan untuk {barang.nama} harus lebih dari 0.")

            pi = PenerimaanItem.objects.create(
                penerimaan=grn,
                po_item=po_item,
                barang=barang,
                kemasan=kemasan,
                isi=isi,
                qty_kemasan=qty_kemasan,
                harga_kemasan=harga_kemasan,
                batch_no=str(item.get('batch_no') or '').strip(),
                exp_date=item.get('exp_date')
            )
            subtotal_bruto += pi.subtotal

        if total_diskon > subtotal_bruto:
            raise ValidationError(
                f"Total potongan diskon (Rp {total_diskon:,.0f}) tidak boleh melebihi subtotal nilai barang (Rp {subtotal_bruto:,.0f})."
            )

        grn.recalculate_total()
        return grn

    @classmethod
    @transaction.atomic
    def approve_grn(cls, grn, user):
        if grn.status != Penerimaan.STATUS_DRAFT:
            raise ValidationError("Hanya Penerimaan berstatus Draft yang dapat disetujui.")

        cls._check_approver_permission(user, grn.created_by)

        items = list(grn.items.select_related('barang', 'po_item').all())
        if not items:
            raise ValidationError("Penerimaan tidak memiliki item barang.")

        grn.recalculate_total()

        # Hitung HPP net per unit (prorata proporsional bila GRN memiliki potongan diskon)
        has_discount = grn.diskon_total > Decimal('0.00') and grn.subtotal_bruto > Decimal('0.00')
        item_hpp_map = {}
        if has_discount:
            positive_items = [it for it in items if it.subtotal > Decimal('0.00')]
            remaining_net = grn.total_nilai
            for idx, it in enumerate(positive_items):
                if idx == len(positive_items) - 1:
                    item_net = max(Decimal('0.00'), remaining_net)
                else:
                    item_net = (it.subtotal * grn.total_nilai / grn.subtotal_bruto).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    remaining_net -= item_net
                item_hpp_map[it.id] = (item_net / it.qty_dasar).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP) if it.qty_dasar > 0 else Decimal('0.0000')

        # 1. Tambah stok via StockService & update PO fulfillment
        for item in items:
            harga_unit_hpp = item_hpp_map.get(item.id, item.harga_dasar)
            ket_diskon = " · Prorata Diskon GRN" if has_discount else ""
            StockService.record_in(
                barang=item.barang,
                gudang=grn.gudang,
                qty=item.qty_dasar,
                harga_unit=harga_unit_hpp,
                sumber_tipe='GRN',
                sumber_id=str(grn.id),
                sumber_nomor=grn.nomor,
                keterangan=f"Penerimaan {grn.nomor} dari {grn.vendor_nama} (Faktur: {grn.no_faktur or '-'}){ket_diskon}",
                user=user
            )

            if item.po_item:
                po_item = item.po_item
                po_item.qty_diterima += item.qty_dasar
                po_item.save(update_fields=['qty_diterima'])

        # 2. Cek apakah PO ditutup (default: tutup_po=True langsung SELESAI, atau jika all_fulfilled)
        if grn.po:
            po = grn.po
            tutup = getattr(grn, 'tutup_po', True)
            if tutup:
                po.status = SuratPesanan.STATUS_SELESAI
                po.save(update_fields=['status', 'updated_at'])
            else:
                all_fulfilled = True
                for pi in po.items.all():
                    if pi.qty_diterima < pi.qty_dasar:
                        all_fulfilled = False
                        break
                if all_fulfilled:
                    po.status = SuratPesanan.STATUS_SELESAI
                    po.save(update_fields=['status', 'updated_at'])

        grn.status = Penerimaan.STATUS_DISETUJUI
        grn.approved_by = user
        grn.approved_at = timezone.now()
        grn.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

        return grn
