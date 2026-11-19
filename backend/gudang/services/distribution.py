from decimal import Decimal
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.db.models import Sum
from django.core.exceptions import ValidationError
from django.utils import timezone

from gudang.models.master import Gudang, Barang, Ruang
from gudang.models.numbering import NumberingSequence
from gudang.models.distribution import Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem
from gudang.models.ledger import StokSaldo
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

            satuan = item.get('satuan') or (barang.satuan_dasar.kode if barang.satuan_dasar else 'PCS')

            PermintaanItem.objects.create(
                permintaan=permintaan,
                barang=barang,
                qty_minta=qty_minta,
                satuan=satuan,
                qty_disetujui=Decimal('0.000'),
                qty_dikeluarkan=Decimal('0.000'),
                status=PermintaanItem.STATUS_MENUNGGU,
                legacy_out_id=item.get('legacy_out_id') or None,
                keterangan=str(item.get('keterangan') or '').strip()
            )

        return permintaan

    @classmethod
    def _get_total_stok(cls, barang: Barang) -> Decimal:
        return StokSaldo.objects.filter(barang=barang).aggregate(total=Sum('qty'))['total'] or Decimal('0')

    @classmethod
    def recompute_permintaan_status(cls, permintaan: Permintaan, save: bool = True) -> str:
        """
        Sinkronkan status header Permintaan berdasarkan status seluruh PermintaanItem.
        """
        all_items = list(PermintaanItem.objects.filter(permintaan=permintaan))
        if not all_items:
            return permintaan.status

        if permintaan.status == Permintaan.STATUS_BATAL:
            return permintaan.status

        has_menunggu = any(pi.status == PermintaanItem.STATUS_MENUNGGU for pi in all_items)
        has_sedang_diajukan = any(pi.status == PermintaanItem.STATUS_SEDANG_DIAJUKAN for pi in all_items)
        has_siap_serah = any(
            pi.status == PermintaanItem.STATUS_DISETUJUI
            and (pi.qty_disetujui or Decimal('0')) > (pi.qty_dikeluarkan or Decimal('0'))
            for pi in all_items
        )
        has_selesai = any(
            pi.status == PermintaanItem.STATUS_SELESAI
            or (
                pi.status == PermintaanItem.STATUS_DISETUJUI
                and (pi.qty_disetujui or Decimal('0')) > Decimal('0')
                and (pi.qty_dikeluarkan or Decimal('0')) >= (pi.qty_disetujui or Decimal('0'))
            )
            for pi in all_items
        )

        if has_menunggu and permintaan.status in (Permintaan.STATUS_DRAFT, Permintaan.STATUS_MENUNGGU):
            return permintaan.status

        update_fields = ['status', 'updated_at']
        if has_sedang_diajukan:
            new_status = Permintaan.STATUS_PROSES_SEBAGIAN
        elif has_siap_serah:
            new_status = Permintaan.STATUS_DISETUJUI
        elif has_selesai:
            new_status = Permintaan.STATUS_SELESAI
        else:
            new_status = Permintaan.STATUS_DITOLAK
            if not permintaan.alasan_tolak:
                reasons = [
                    f"{pi.barang.nama}: {pi.alasan_tolak}"
                    for pi in all_items
                    if pi.status in (PermintaanItem.STATUS_DITOLAK, PermintaanItem.STATUS_BATAL_PENGADAAN) and pi.alasan_tolak
                ]
                if reasons:
                    permintaan.alasan_tolak = '; '.join(reasons[:5])
                    update_fields.append('alasan_tolak')

        permintaan.status = new_status
        if save:
            permintaan.save(update_fields=update_fields)
        return new_status

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
        Approver (Koordinator/Kasi) meninjau permintaan barang dari unit ruangan:
        - SETUJUI: isi qty_disetujui (> 0 dan <= stok gudang). Tidak membuat backorder untuk selisih pengurangan.
        - AJUKAN: masukkan ke antrean pengadaan (SEDANG_DIAJUKAN) karena stok kosong / belum mencukupi.
        - TOLAK: tolak baris barang dengan alasan penolakan yang jelas.
        """
        if permintaan.status not in (Permintaan.STATUS_MENUNGGU, Permintaan.STATUS_DRAFT):
            raise ValidationError(f"Permintaan {permintaan.nomor} tidak dalam status menunggu persetujuan (status: {permintaan.status}).")

        if items_approval:
            approval_map = {}
            has_explicit_decision = False
            for item in items_approval:
                if 'id' not in item:
                    continue
                try:
                    pi_id = int(item['id'])
                except (ValueError, TypeError):
                    continue
                keputusan_raw = str(item.get('keputusan') or '').strip().upper()
                if keputusan_raw:
                    has_explicit_decision = True
                qty_val = Decimal('0')
                if item.get('qty_disetujui') is not None and str(item.get('qty_disetujui')).strip() != '':
                    try:
                        qty_val = Decimal(str(item['qty_disetujui']))
                    except (ValueError, TypeError):
                        raise ValidationError("Format qty disetujui tidak valid.")
                approval_map[pi_id] = {
                    'keputusan': keputusan_raw,
                    'qty_disetujui': qty_val,
                    'alasan_tolak': str(item.get('alasan_tolak') or item.get('alasan') or '').strip(),
                    'keterangan': str(item.get('keterangan') or '').strip(),
                }

            total_qty_approved = Decimal('0')
            total_sedang_diajukan = 0
            total_ditolak = 0

            for pi in permintaan.items.select_related('barang', 'barang__satuan_dasar').all():
                cfg = approval_map.get(pi.id)
                if not cfg:
                    continue

                satuan_txt = pi.satuan or (pi.barang.satuan_dasar.kode if pi.barang.satuan_dasar else 'item')
                keputusan = cfg['keputusan']
                qty_app = cfg['qty_disetujui']
                alasan = cfg['alasan_tolak']
                catatan_verif = cfg['keterangan']

                if not keputusan:
                    # Kompatibilitas pemanggil lama yang hanya mengirim qty_disetujui
                    keputusan = 'SETUJUI' if qty_app > Decimal('0') else 'TOLAK'

                update_pi_fields = ['qty_disetujui', 'status', 'alasan_tolak']
                if keputusan == 'SETUJUI':
                    if qty_app <= Decimal('0'):
                        raise ValidationError(
                            f"Qty disetujui untuk '{pi.barang.nama}' harus lebih dari 0 jika memilih Setujui."
                        )
                    total_stok = cls._get_total_stok(pi.barang)
                    if qty_app > total_stok:
                        raise ValidationError(
                            f"Qty disetujui untuk '{pi.barang.nama}' ({qty_app} {satuan_txt}) melebihi stok gudang yang tersedia ({total_stok} {satuan_txt})."
                        )
                    pi.qty_disetujui = qty_app
                    pi.status = PermintaanItem.STATUS_DISETUJUI
                    pi.alasan_tolak = ''
                    if catatan_verif:
                        existing_ket = (pi.keterangan or '').strip()
                        pi.keterangan = (
                            f"{existing_ket} · ACC: {catatan_verif}" if existing_ket and catatan_verif not in existing_ket else catatan_verif
                        )[:255]
                        update_pi_fields.append('keterangan')
                    total_qty_approved += qty_app
                elif keputusan == 'AJUKAN':
                    total_stok = cls._get_total_stok(pi.barang)
                    if total_stok > Decimal('0'):
                        raise ValidationError(
                            f"Stok '{pi.barang.nama}' masih tersedia di gudang ({total_stok} {satuan_txt}); gunakan keputusan Setujui atau Tolak."
                        )
                    pi.qty_disetujui = Decimal('0.000')
                    pi.status = PermintaanItem.STATUS_SEDANG_DIAJUKAN
                    pi.alasan_tolak = ''
                    if catatan_verif:
                        existing_ket = (pi.keterangan or '').strip()
                        pi.keterangan = (
                            f"{existing_ket} · Pengadaan: {catatan_verif}" if existing_ket and catatan_verif not in existing_ket else catatan_verif
                        )[:255]
                        update_pi_fields.append('keterangan')
                    total_sedang_diajukan += 1
                elif keputusan == 'TOLAK':
                    reason_text = alasan or catatan_verif
                    if has_explicit_decision and not reason_text:
                        raise ValidationError(
                            f"Alasan penolakan untuk '{pi.barang.nama}' wajib diisi saat menolak item."
                        )
                    pi.qty_disetujui = Decimal('0.000')
                    pi.status = PermintaanItem.STATUS_DITOLAK
                    pi.alasan_tolak = reason_text[:255] if reason_text else 'Tidak disetujui oleh verifikator logistik'
                    total_ditolak += 1
                else:
                    raise ValidationError(f"Keputusan '{keputusan}' untuk '{pi.barang.nama}' tidak dikenal.")

                pi.save(update_fields=update_pi_fields)

            if not has_explicit_decision and total_qty_approved <= Decimal('0') and total_sedang_diajukan == 0:
                raise ValidationError(
                    "Tidak ada barang yang disetujui (seluruh kuantitas 0). Jika seluruh barang tidak disetujui atau stok kosong, silakan gunakan tombol Tolak Permintaan."
                )
        else:
            total_qty_approved = Decimal('0')
            for pi in permintaan.items.select_related('barang', 'barang__satuan_dasar').all():
                if pi.qty_minta <= Decimal('0'):
                    raise ValidationError(f"Qty minta untuk '{pi.barang.nama}' tidak boleh 0.")
                total_stok = cls._get_total_stok(pi.barang)
                if total_stok <= Decimal('0'):
                    pi.qty_disetujui = Decimal('0.000')
                    pi.status = PermintaanItem.STATUS_SEDANG_DIAJUKAN
                    pi.alasan_tolak = ''
                elif pi.qty_minta > total_stok:
                    pi.qty_disetujui = total_stok
                    pi.status = PermintaanItem.STATUS_DISETUJUI
                    pi.alasan_tolak = ''
                    total_qty_approved += total_stok
                else:
                    pi.qty_disetujui = pi.qty_minta
                    pi.status = PermintaanItem.STATUS_DISETUJUI
                    pi.alasan_tolak = ''
                    total_qty_approved += pi.qty_minta
                pi.save(update_fields=['qty_disetujui', 'status', 'alasan_tolak'])

            if total_qty_approved <= Decimal('0') and not permintaan.items.filter(status=PermintaanItem.STATUS_SEDANG_DIAJUKAN).exists():
                raise ValidationError(
                    "Seluruh barang yang diminta kosong di gudang (0 stok). Permintaan tidak dapat disetujui."
                )

        cls.recompute_permintaan_status(permintaan, save=False)
        permintaan.approved_by = user
        permintaan.approved_at = timezone.now()
        permintaan.save(update_fields=['status', 'alasan_tolak', 'approved_by', 'approved_at', 'updated_at'])
        return permintaan

    @classmethod
    @transaction.atomic
    def approve_followup_items(
        cls,
        permintaan: Permintaan,
        user: Any,
        items_approval: List[Dict[str, Any]]
    ) -> Permintaan:
        """
        Verifikasi susulan oleh Approver (Mas Febri) untuk item berstatus SEDANG_DIAJUKAN
        setelah stok gudang terisi kembali (via Penerimaan/GRN) agar qty_disetujui tetap dikontrol.
        """
        if permintaan.status not in (Permintaan.STATUS_PROSES_SEBAGIAN, Permintaan.STATUS_DISETUJUI):
            raise ValidationError(
                f"Permintaan {permintaan.nomor} tidak memiliki antrean verifikasi susulan (status: {permintaan.status})."
            )
        if not items_approval:
            raise ValidationError("Data verifikasi susulan item tidak boleh kosong.")

        pi_map = {
            pi.id: pi
            for pi in PermintaanItem.objects.select_for_update().select_related('barang', 'barang__satuan_dasar').filter(permintaan=permintaan)
        }

        processed = 0
        for item in items_approval:
            try:
                pi_id = int(item.get('id'))
            except (TypeError, ValueError):
                continue
            pi = pi_map.get(pi_id)
            if not pi or pi.status != PermintaanItem.STATUS_SEDANG_DIAJUKAN:
                continue

            keputusan = str(item.get('keputusan') or 'SETUJUI').strip().upper()
            alasan = str(item.get('alasan_tolak') or item.get('alasan') or '').strip()
            satuan_txt = pi.satuan or (pi.barang.satuan_dasar.kode if pi.barang.satuan_dasar else 'item')

            if keputusan == 'AJUKAN':
                # Masih tetap menunggu pengadaan
                continue
            elif keputusan == 'SETUJUI':
                try:
                    qty_app = Decimal(str(item.get('qty_disetujui') or 0))
                except (ValueError, TypeError):
                    raise ValidationError(f"Format qty disetujui untuk '{pi.barang.nama}' tidak valid.")
                if qty_app <= Decimal('0'):
                    raise ValidationError(f"Qty disetujui susulan untuk '{pi.barang.nama}' harus lebih dari 0.")
                total_stok = cls._get_total_stok(pi.barang)
                if qty_app > total_stok:
                    raise ValidationError(
                        f"Qty disetujui untuk '{pi.barang.nama}' ({qty_app} {satuan_txt}) melebihi stok gudang saat ini ({total_stok} {satuan_txt})."
                    )
                pi.qty_disetujui = qty_app
                pi.status = PermintaanItem.STATUS_DISETUJUI
                pi.alasan_tolak = ''
                pi.save(update_fields=['qty_disetujui', 'status', 'alasan_tolak'])
                processed += 1
            elif keputusan == 'TOLAK':
                if not alasan:
                    raise ValidationError(f"Alasan penolakan susulan untuk '{pi.barang.nama}' wajib diisi.")
                pi.qty_disetujui = Decimal('0.000')
                pi.status = PermintaanItem.STATUS_DITOLAK
                pi.alasan_tolak = alasan[:255]
                pi.save(update_fields=['qty_disetujui', 'status', 'alasan_tolak'])
                processed += 1
            elif keputusan in ('BATAL_PENGADAAN', 'TUTUP'):
                pi.qty_disetujui = Decimal('0.000')
                pi.status = PermintaanItem.STATUS_BATAL_PENGADAAN
                pi.alasan_tolak = (alasan or 'Pengadaan item ditutup oleh petugas')[:255]
                pi.save(update_fields=['qty_disetujui', 'status', 'alasan_tolak'])
                processed += 1
            else:
                raise ValidationError(f"Keputusan susulan '{keputusan}' tidak dikenal.")

        if processed == 0:
            raise ValidationError("Pilih minimal satu item pengadaan untuk disetujui, ditolak, atau ditutup.")

        cls.recompute_permintaan_status(permintaan, save=False)
        permintaan.approved_by = user
        permintaan.approved_at = timezone.now()
        permintaan.save(update_fields=['status', 'alasan_tolak', 'approved_by', 'approved_at', 'updated_at'])
        return permintaan

    @classmethod
    @transaction.atomic
    def close_procurement_item(
        cls,
        permintaan: Permintaan,
        item_id: int,
        user: Any,
        alasan: str = ''
    ) -> Permintaan:
        """
        Menutup / membatalkan sisa item yang berstatus SEDANG_DIAJUKAN secara manual
        agar dokumen permintaan tidak menggantung terbuka selamanya.
        """
        pi = PermintaanItem.objects.select_for_update().filter(permintaan=permintaan, id=item_id).first()
        if not pi:
            raise ValidationError("Item permintaan tidak ditemukan.")
        if pi.status != PermintaanItem.STATUS_SEDANG_DIAJUKAN:
            raise ValidationError(f"Hanya item berstatus SEDANG_DIAJUKAN yang dapat ditutup (status saat ini: {pi.status}).")

        pi.qty_disetujui = Decimal('0.000')
        pi.status = PermintaanItem.STATUS_BATAL_PENGADAAN
        pi.alasan_tolak = (alasan or 'Pengadaan item ditutup / tidak dilanjutkan')[:255]
        pi.save(update_fields=['qty_disetujui', 'status', 'alasan_tolak'])

        cls.recompute_permintaan_status(permintaan, save=True)
        return permintaan

    @classmethod
    @transaction.atomic
    def reject_permintaan(cls, permintaan: Permintaan, user: Any, alasan: str) -> Permintaan:
        if permintaan.status in (Permintaan.STATUS_SELESAI, Permintaan.STATUS_BATAL):
            raise ValidationError(f"Permintaan dengan status {permintaan.status} tidak dapat ditolak.")
        alasan_clean = str(alasan or '').strip()
        for pi in permintaan.items.all():
            if pi.status in (PermintaanItem.STATUS_MENUNGGU, PermintaanItem.STATUS_DISETUJUI, PermintaanItem.STATUS_SEDANG_DIAJUKAN):
                pi.qty_disetujui = Decimal('0.000')
                pi.status = PermintaanItem.STATUS_DITOLAK
                pi.alasan_tolak = alasan_clean[:255]
                pi.save(update_fields=['qty_disetujui', 'status', 'alasan_tolak'])
        permintaan.status = Permintaan.STATUS_DITOLAK
        permintaan.alasan_tolak = alasan_clean
        permintaan.approved_by = user
        permintaan.approved_at = timezone.now()
        permintaan.save(update_fields=['status', 'alasan_tolak', 'approved_by', 'approved_at', 'updated_at'])
        return permintaan

    @classmethod
    def can_user_cancel_permintaan(cls, user: Any, permintaan: Permintaan) -> bool:
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if permintaan.status not in (
            Permintaan.STATUS_DRAFT,
            Permintaan.STATUS_MENUNGGU,
            Permintaan.STATUS_DISETUJUI,
            Permintaan.STATUS_PROSES_SEBAGIAN,
        ):
            return False
        role = getattr(user, 'role', '')
        if (
            user.is_superuser
            or getattr(user, 'username', '') == 'super'
            or getattr(user, 'is_logistik', False)
            or role in ('direktur', 'wakil_direktur', 'superadmin')
        ):
            return True
        if permintaan.created_by_id == user.id:
            return True
        user_unit = getattr(user, 'unit', None)
        if user_unit:
            if permintaan.ruang and permintaan.ruang.unit_id == user_unit.id:
                return True
            unit_name = (user_unit.nama or '').strip().lower()
            ruang_name = (permintaan.ruang_nama or (permintaan.ruang.nama if permintaan.ruang else '')).strip().lower()
            if unit_name and ruang_name == unit_name:
                return True
        return False

    @classmethod
    def can_user_cancel_pengeluaran(cls, user: Any, pengeluaran: Pengeluaran) -> bool:
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if pengeluaran.status != Pengeluaran.STATUS_DRAFT:
            return False
        role = getattr(user, 'role', '')
        if (
            user.is_superuser
            or getattr(user, 'username', '') == 'super'
            or getattr(user, 'is_logistik', False)
            or role in ('direktur', 'wakil_direktur', 'superadmin')
        ):
            return True
        return pengeluaran.created_by_id == user.id

    @classmethod
    @transaction.atomic
    def batal_permintaan(cls, permintaan: Permintaan, user: Any, alasan: str = '') -> Permintaan:
        """
        Membatalkan permintaan (amprahan) yang belum selesai diserahkan
        (DRAFT, MENUNGGU, DISETUJUI, atau PROSES_SEBAGIAN).
        Penyerahan fisik yang sudah telanjur DISETUJUI tidak diubah/dihapus;
        hanya sisa item yang belum diserahkan dan bon DRAFT yang ditutup/dibatalkan.
        """
        permintaan = Permintaan.objects.select_for_update().get(pk=permintaan.pk)
        if permintaan.status == Permintaan.STATUS_SELESAI:
            raise ValidationError("Permintaan yang sudah selesai diserahkan tidak dapat dibatalkan.")
        if permintaan.status in (Permintaan.STATUS_DITOLAK, Permintaan.STATUS_BATAL):
            raise ValidationError(f"Permintaan dengan status {permintaan.status} tidak dapat dibatalkan.")

        alasan_clean = str(alasan or '').strip()

        # Batalkan bon pengeluaran DRAFT yang belum dipotong stoknya
        draft_outs = Pengeluaran.objects.select_for_update().filter(
            permintaan=permintaan,
            status=Pengeluaran.STATUS_DRAFT
        )
        for out in draft_outs:
            out.status = Pengeluaran.STATUS_BATAL
            out.alasan_batal = alasan_clean or f"Permintaan {permintaan.nomor} dibatalkan."
            out.save(update_fields=['status', 'alasan_batal', 'updated_at'])

        for pi in PermintaanItem.objects.select_for_update().filter(permintaan=permintaan):
            qty_out = pi.qty_dikeluarkan or Decimal('0.000')
            if qty_out > Decimal('0.000'):
                # Item sudah pernah diserahkan sebagian/penuh: kunci sesuai realisasi agar stok/histori konsisten
                pi.qty_disetujui = qty_out
                pi.status = PermintaanItem.STATUS_SELESAI
                pi.save(update_fields=['qty_disetujui', 'status'])
            elif pi.status in (
                PermintaanItem.STATUS_MENUNGGU,
                PermintaanItem.STATUS_DISETUJUI,
                PermintaanItem.STATUS_SEDANG_DIAJUKAN,
            ):
                pi.qty_disetujui = Decimal('0.000')
                pi.status = PermintaanItem.STATUS_BATAL_PENGADAAN
                update_pi = ['qty_disetujui', 'status']
                if alasan_clean:
                    pi.alasan_tolak = alasan_clean[:255]
                    update_pi.append('alasan_tolak')
                pi.save(update_fields=update_pi)

        permintaan.status = Permintaan.STATUS_BATAL
        if alasan_clean:
            permintaan.alasan_tolak = alasan_clean
        permintaan.save(update_fields=['status', 'alasan_tolak', 'updated_at'])
        return permintaan

    @classmethod
    @transaction.atomic
    def batal_pengeluaran(cls, pengeluaran: Pengeluaran, user: Any, alasan: str = '') -> Pengeluaran:
        pengeluaran = Pengeluaran.objects.select_for_update().get(pk=pengeluaran.pk)
        if pengeluaran.status != Pengeluaran.STATUS_DRAFT:
            raise ValidationError("Hanya bon pengeluaran berstatus DRAFT (belum diserahkan) yang dapat dibatalkan.")
        pengeluaran.status = Pengeluaran.STATUS_BATAL
        pengeluaran.alasan_batal = str(alasan or '').strip()
        pengeluaran.save(update_fields=['status', 'alasan_batal', 'updated_at'])
        return pengeluaran

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

            # Update fulfilled qty & item status on the room's requisition
            if item.permintaan_item:
                pi = item.permintaan_item
                pi.qty_dikeluarkan += item.qty
                update_pi_fields = ['qty_dikeluarkan']
                if (pi.qty_disetujui or Decimal('0')) > Decimal('0') and pi.qty_dikeluarkan >= pi.qty_disetujui:
                    pi.status = PermintaanItem.STATUS_SELESAI
                    update_pi_fields.append('status')
                pi.save(update_fields=update_pi_fields)

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

        # Sinkronkan status permintaan asal (tetap PROSES_SEBAGIAN bila masih ada item SEDANG_DIAJUKAN)
        if pengeluaran.permintaan_id:
            permintaan = Permintaan.objects.select_for_update().get(id=pengeluaran.permintaan_id)
            cls.recompute_permintaan_status(permintaan, save=True)

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
