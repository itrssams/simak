
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.db import connection, transaction
from django.utils import timezone
from .models import (
    LogistikBarang, LogistikPembelian, LogistikBatch,
    LogistikMutasi, LogistikPermintaan, LogistikOpname
)
from .serializers import (
    LogistikBarangSerializer, LogistikPembelianSerializer, LogistikBatchSerializer,
    LogistikMutasiSerializer, LogistikPermintaanSerializer, LogistikOpnameSerializer
)
from django.db.models import Sum, F, Q

def is_logistik(user):
    return user.is_authenticated and (getattr(user, 'is_logistik', False) or user.is_superuser or is_manajer_or_above(user))

class IsLogistikPermission(IsAuthenticated):
    def has_permission(self, request, view):
        return is_logistik(request.user)

from keuangan.views import (
    legacy_fetchall, legacy_fetchone, legacy_paginated,
    _fetch_logistik_pembelian, _build_pending_where_logistik,
    _pending_base_sql_logistik, _utang_order_clause, parse_lenient_date,
    can_access_catatan_utang_obat_bhp, is_manajer_or_above, _get_rekanan_columns
)

class IsLogistikOrCatatanUtangPermission(IsAuthenticated):
    def has_permission(self, request, view):
        return is_logistik(request.user) or can_access_catatan_utang_obat_bhp(request.user)

_dafbrg_log_columns_cache = None

def _get_dafbrg_log_columns():
    global _dafbrg_log_columns_cache
    if _dafbrg_log_columns_cache is not None:
        return _dafbrg_log_columns_cache

    cols = set()
    table_name = "rssams.dafbrg_log"
    with connection.cursor() as cursor:
        try:
            cursor.execute("SHOW COLUMNS FROM rssams.dafbrg_log")
            cols = {row[0].lower() for row in cursor.fetchall()}
        except Exception:
            try:
                cursor.execute("SHOW COLUMNS FROM dafbrg_log")
                cols = {row[0].lower() for row in cursor.fetchall()}
                table_name = "dafbrg_log"
            except Exception:
                pass

        if cols:
            if 'kode_material' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN kode_material VARCHAR(50) DEFAULT ''")
                    cols.add('kode_material')
                except Exception:
                    pass
            if 'gol_baru' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN gol_baru VARCHAR(50) DEFAULT ''")
                    cols.add('gol_baru')
                except Exception:
                    pass
            if 'stock_buffer' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN stock_buffer INT DEFAULT 0")
                    cols.add('stock_buffer')
                except Exception:
                    pass

    _dafbrg_log_columns_cache = cols
    return _dafbrg_log_columns_cache


def legacy_stock(id_brg):
    row = legacy_fetchone(
        """
        SELECT
            COALESCE((SELECT SUM(qty * isi) FROM rssams.item_logistik WHERE id_brg = %s), 0)
            - COALESCE((SELECT SUM(qty) FROM rssams.item_out_log WHERE id_brg = %s), 0) AS stock
        """,
        [id_brg, id_brg],
    )
    stock = row['stock'] or 0
    with connection.cursor() as cursor:
        cursor.execute('UPDATE rssams.dafbrg_log SET stock = %s WHERE id_brg = %s', [stock, id_brg])
    return stock


def legacy_next_logistik_id(width=4, where_prefix=True):
    prefix = timezone.localdate().strftime('%y')
    where = 'WHERE LEFT(id,2) = %s' if where_prefix else ''
    q1 = f"SELECT COALESCE(MAX(CAST(SUBSTR(id,3,{width}) AS UNSIGNED)), 0) AS max_id FROM rssams.tran_beli_brg_log {where}"
    q2 = f"SELECT COALESCE(MAX(CAST(SUBSTR(id,3,{width}) AS UNSIGNED)), 0) AS max_id FROM rssams.logistik_spb {where}"
    
    r1 = legacy_fetchone(q1, [prefix] if where_prefix else [])
    r2 = legacy_fetchone(q2, [prefix] if where_prefix else [])
    
    max_id = max(int(r1['max_id'] if r1 else 0), int(r2['max_id'] if r2 else 0)) + 1
    return f"{prefix}{max_id:0{width}d}"


def legacy_next_year_id(table, width=4, where_prefix=True):
    prefix = timezone.localdate().strftime('%y')
    where = 'WHERE LEFT(id,2) = %s' if where_prefix else ''
    row = legacy_fetchone(
        f"SELECT COALESCE(MAX(CAST(SUBSTR(id,3,{width}) AS UNSIGNED)), 0) + 1 AS next_id FROM rssams.{table} {where}",
        [prefix] if where_prefix else [],
    )
    return f"{prefix}{int(row['next_id']):0{width}d}"


def legacy_next_item_out_id(master_id):
    row = legacy_fetchone(
        "SELECT COALESCE(MAX(CAST(SUBSTR(id,8,3) AS UNSIGNED)), 0) + 1 AS next_id FROM rssams.item_out_log WHERE LEFT(id,6) = %s",
        [master_id],
    )
    return f"{master_id}-{int(row['next_id'])}"


class LogistikBarangViewSet(viewsets.ViewSet):
    serializer_class = LogistikBarangSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        minimum = request.query_params.get('minimum')
        positive_only = str(request.query_params.get('positive_only') or '').lower() in ('1', 'true', 'yes')
        golongan_filter = request.query_params.get('golongan') or ''
        show_all = str(request.query_params.get('show_all') or '').lower() in ('1', 'true', 'yes')
        where = ["del = 'N'"]
        params = []
        if search:
            where.append('(nama_barang LIKE %s OR merk LIKE %s OR kode_material LIKE %s)')
            params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
        if golongan_filter:
            where.append('(gol_baru = %s OR id_gol = %s)')
            params.extend([golongan_filter, golongan_filter])
        if minimum == 'true':
            where.append('stock_buffer > 0 AND stock < stock_buffer')
        elif positive_only:
            where.append('stock > 0')
        where_sql = ' AND '.join(where)
        base = f"""
            SELECT id_brg AS id, id_brg, kode_material, nama_barang, kemasan, satuan, isi, merk,
                COALESCE(NULLIF(gol_baru, ''), CAST(id_gol AS CHAR)) AS golongan, gol_baru,
                stock AS stok, stock_buffer AS stok_minimum,
                del = 'N' AS is_active,
                stock_buffer > 0 AND stock < stock_buffer AS stok_minimum_alert
            FROM rssams.dafbrg_log
            WHERE {where_sql}
            ORDER BY nama_barang
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.dafbrg_log WHERE {where_sql}"
        return legacy_paginated(request, base, count, params)

    @action(detail=False, methods=['get'], url_path='generate-kode')
    def generate_kode(self, request):
        golongan = (request.query_params.get('golongan') or '').strip()
        prefix = 'B8'
        match = re.search(r'([A-Za-z]\d+)', golongan)
        if match:
            prefix = match.group(1).upper()

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT kode_material FROM rssams.dafbrg_log WHERE kode_material LIKE %s",
                [f'{prefix}%']
            )
            rows = cursor.fetchall()
        
        max_num = 0
        for r in rows:
            code = r[0] or ''
            num_part = re.sub(r'[^\d]', '', code[len(prefix):]) if code.startswith(prefix) else ''
            if num_part and num_part.isdigit():
                max_num = max(max_num, int(num_part))

        next_code = f"{prefix}{max_num + 1:03d}"
        return Response({'kode_material': next_code, 'prefix': prefix, 'next_num': max_num + 1})

    def create(self, request):
        data = request.data
        row = legacy_fetchone('SELECT COALESCE(MAX(id_brg), 0) + 1 AS next_id FROM rssams.dafbrg_log')
        id_brg = row['next_id']
        nama_barang = _normalize_logistik_name(data.get('nama_barang', ''))
        merk = _normalize_logistik_name(data.get('merk'))
        golongan = (data.get('golongan') or '').strip()
        kode_material = (data.get('kode_material') or '').strip()

        if not kode_material and golongan:
            match = re.search(r'([A-Za-z]\d+)', golongan)
            prefix = match.group(1).upper() if match else 'B8'
            with connection.cursor() as cursor:
                cursor.execute("SELECT kode_material FROM rssams.dafbrg_log WHERE kode_material LIKE %s", [f'{prefix}%'])
                rows = cursor.fetchall()
            max_num = 0
            for r in rows:
                c = r[0] or ''
                num_part = re.sub(r'[^\d]', '', c[len(prefix):]) if c.startswith(prefix) else ''
                if num_part and num_part.isdigit():
                    max_num = max(max_num, int(num_part))
            kode_material = f"{prefix}{max_num + 1:03d}"

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.dafbrg_log(id_brg, kode_material, nama_barang, kemasan, satuan, isi, merk, id_gol, gol_baru, stock_buffer)
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    id_brg,
                    kode_material or None,
                    str(nama_barang).upper(),
                    data.get('kemasan') or '',
                    data.get('satuan') or '',
                    data.get('isi') or 1,
                    str(merk).upper(),
                    None,
                    golongan or None,
                    data.get('stok_minimum') or 0,
                ],
            )
        return Response({'id': id_brg, 'kode_material': kode_material}, status=201)

    def update(self, request, pk=None):
        data = request.data
        nama_barang = _normalize_logistik_name(data.get('nama_barang', ''))
        merk = _normalize_logistik_name(data.get('merk'))
        golongan = (data.get('golongan') or '').strip()
        kode_material = (data.get('kode_material') or '').strip()

        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.dafbrg_log
                SET kode_material = %s,
                    nama_barang = %s,
                    kemasan = %s,
                    satuan = %s,
                    isi = %s,
                    merk = %s,
                    gol_baru = %s,
                    stock_buffer = %s
                WHERE id_brg = %s
                """,
                [
                    kode_material or None,
                    str(nama_barang).upper(),
                    data.get('kemasan') or '',
                    data.get('satuan') or '',
                    data.get('isi') or 1,
                    str(merk).upper(),
                    golongan or None,
                    data.get('stok_minimum') or 0,
                    pk,
                ],
            )
        return Response({'id': pk, 'kode_material': kode_material}, status=200)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE rssams.dafbrg_log SET del = 'Y' WHERE id_brg = %s", [pk])
        return Response(status=204)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        row = legacy_fetchone(
            """
            SELECT COUNT(*) AS total_barang,
                COALESCE(SUM(stock), 0) AS total_stok,
                SUM(CASE WHEN stock_buffer > 0 AND stock < stock_buffer THEN 1 ELSE 0 END) AS stok_minimum,
                SUM(CASE WHEN del = 'Y' THEN 1 ELSE 0 END) AS nonaktif
            FROM rssams.dafbrg_log
            """
        )
        return Response(row)

    @action(detail=False, methods=['get'], url_path='ruang-options')
    def ruang_options(self, request):
        return Response({
            'results': legacy_fetchall("SELECT id_ruang AS id, ruangan AS nama FROM rssams.kode_ruang ORDER BY ruangan")
        })

    @action(detail=True, methods=['get'], url_path='kartu-stok')
    def kartu_stok(self, request, pk=None):
        masuk = legacy_fetchall(
            """
            SELECT DATE(i.tgl_entri) AS tanggal, 'Masuk' AS jenis, i.id AS nomor, t.rekanan AS ruang,
                   i.qty * i.isi AS masuk, 0 AS keluar, i.harga AS harga
            FROM rssams.item_logistik i
            LEFT JOIN rssams.tran_beli_brg_log t ON t.id = i.id
            WHERE i.id_brg = %s AND (i.qty * i.isi > 0 OR COALESCE(t.rekanan, '') != 'STOCK OPNAME')
            """,
            [pk],
        )
        keluar = legacy_fetchall(
            """
            SELECT DATE(o.tgl) AS tanggal, 'Keluar' AS jenis, o.id AS nomor, COALESCE(r.ruangan, 'STOCK OPNAME') AS ruang,
                   0 AS masuk, o.qty AS keluar, o.harga AS harga
            FROM rssams.item_out_log o
            LEFT JOIN rssams.kode_ruang r ON r.id_ruang = o.id_ruang
            WHERE o.id_brg = %s AND o.qty > 0
            """,
            [pk],
        )
        rows = sorted(masuk + keluar, key=lambda x: (str(x['tanggal']), str(x['nomor'])))
        saldo = 0
        for row in rows:
            saldo += float(row['masuk'] or 0) - float(row['keluar'] or 0)
            row['saldo'] = saldo
        rows.reverse()
        return Response(rows)


class LogistikVendorViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsLogistikOrCatatanUtangPermission]

    def list(self, request):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols
        has_kategori = 'kategori' in cols

        search = request.query_params.get('search') or ''
        sumber = (request.query_params.get('sumber') or 'semua').strip().lower()
        kategori = (request.query_params.get('kategori') or '').strip()
        where = "WHERE del = 'N'"
        params = []

        if has_sumber and sumber not in ['semua', 'all', '']:
            where += " AND (sumber = %s OR (%s = 'logistik' AND (sumber IS NULL OR sumber = '')))"
            params.extend([sumber, sumber])
        if has_kategori and kategori:
            where += " AND kategori = %s"
            params.append(kategori)

        if search:
            search_conds = ['nama LIKE %s', 'alamat LIKE %s', 'telp LIKE %s', 'kc LIKE %s']
            if has_kategori:
                search_conds.append('kategori LIKE %s')
            where += ' AND (' + ' OR '.join(search_conds) + ')'
            params.extend([f'%{search}%'] * len(search_conds))

        kategori_expr = "COALESCE(kategori, '') AS kategori" if has_kategori else "'' AS kategori"
        sumber_expr = "COALESCE(sumber, 'farmasi') AS sumber" if has_sumber else "'farmasi' AS sumber"

        base = f"""
            SELECT id_rekanan AS id, id_rekanan, nama, alamat, telp, kc, {kategori_expr}, {sumber_expr}, del
            FROM rssams.rekanan
            {where}
            ORDER BY nama
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.rekanan {where}"
        return legacy_paginated(request, base, count, params)

    def create(self, request):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols
        has_kategori = 'kategori' in cols

        data = request.data
        row = legacy_fetchone('SELECT COALESCE(MAX(id_rekanan), 0) + 1 AS next_id FROM rssams.rekanan')
        vendor_id = row['next_id']
        nama_vendor = _normalize_logistik_name(data.get('nama') or '')
        sumber = data.get('sumber') or 'logistik'

        insert_cols = ['id_rekanan', 'nama', 'alamat', 'telp', 'kc', 'del']
        val_placeholders = ['%s', '%s', '%s', '%s', '%s', "'N'"]
        params = [
            vendor_id,
            str(nama_vendor).upper(),
            data.get('alamat') or '',
            data.get('telp') or '',
            data.get('kc') or '',
        ]

        if has_kategori:
            insert_cols.append('kategori')
            val_placeholders.append('%s')
            params.append(data.get('kategori') or '')
        if has_sumber:
            insert_cols.append('sumber')
            val_placeholders.append('%s')
            params.append(sumber)

        sql = f"""
            INSERT INTO rssams.rekanan({', '.join(insert_cols)})
            VALUES({', '.join(val_placeholders)})
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
        return Response({'id': vendor_id, 'id_rekanan': vendor_id}, status=201)

    def partial_update(self, request, pk=None):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols
        has_kategori = 'kategori' in cols

        data = request.data
        nama_vendor = _normalize_logistik_name(data.get('nama') or '')
        updates = ['nama = %s', 'alamat = %s', 'telp = %s', 'kc = %s']
        params = [
            str(nama_vendor).upper(),
            data.get('alamat') or '',
            data.get('telp') or '',
            data.get('kc') or '',
        ]
        if has_kategori and 'kategori' in data:
            updates.append('kategori = %s')
            params.append(data.get('kategori') or '')
        if has_sumber and 'sumber' in data:
            updates.append('sumber = %s')
            params.append(data.get('sumber') or 'logistik')
        params.append(pk)
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE rssams.rekanan
                SET {', '.join(updates)}
                WHERE id_rekanan = %s
                """,
                params,
            )
        return Response({'detail': 'OK'})

    def destroy(self, request, pk=None):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE rssams.rekanan SET del = 'Y' WHERE id_rekanan = %s", [pk])
        return Response(status=204)

    @action(detail=False, methods=['get'], url_path='options')
    def options(self, request):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols

        sumber = request.query_params.get('sumber') or 'all'
        where = "WHERE del = 'N'"
        params = []
        if has_sumber and sumber != 'all' and sumber != 'semua':
            where += " AND (sumber = %s OR (%s = 'logistik' AND (sumber IS NULL OR sumber = '')))"
            params.extend([sumber, sumber])
        rows = legacy_fetchall(f"SELECT id_rekanan AS id, nama FROM rssams.rekanan {where} ORDER BY nama", params)
        return Response({'results': rows})



class LogistikPembelianViewSet(viewsets.ViewSet):
    serializer_class = LogistikPembelianSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = ''
        params = []
        if search:
            where_sql = "WHERE (t.rekanan LIKE %s OR t.no_spk LIKE %s OR t.id LIKE %s) AND COALESCE(t.rekanan, '') != 'STOCK OPNAME' AND COALESCE(t.no_spk, '') NOT LIKE 'OPNAME-%%'"
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        else:
            where_sql = "WHERE COALESCE(t.rekanan, '') != 'STOCK OPNAME' AND COALESCE(t.no_spk, '') NOT LIKE 'OPNAME-%%'" 
        base = f"""
            SELECT t.id, t.id AS nomor, t.tgl_spk AS tanggal, t.rekanan AS pemasok,
                   t.no_spk AS no_faktur, t.nilai, t.done AS status, t.tgl_entri AS created_at, t.id_spb, t.metode_pembayaran,
                   CASE
                     WHEN t.id_spb IS NULL OR t.id_spb = '' THEN 'Tanpa SPB'
                     WHEN s.id IS NOT NULL THEN 'Ada SPB'
                     ELSE 'SPB Terhapus'
                   END AS spb_status_label,
                   CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_spb
            FROM rssams.tran_beli_brg_log t
            LEFT JOIN rssams.logistik_spb s ON s.id = t.id_spb
            {where_sql}
            ORDER BY t.tgl_spk DESC, t.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.tran_beli_brg_log t {where_sql}" 
        
        res = legacy_paginated(request, base, count, params)
        for item in res.data['results']:
            item['items'] = legacy_fetchall(
                """
                SELECT i.id, i.id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                       b.satuan, i.qty_pesan, i.qty, i.isi, i.harga, i.jml_mutasi,
                       i.qty * i.isi - i.jml_mutasi AS stok_batch
                FROM rssams.item_logistik i
                INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
                WHERE i.id = %s
                ORDER BY b.nama_barang
                """,
                [item['id']],
            )
        return res

    def create(self, request):
        data = request.data
        xid = data.get('id_spb') or legacy_next_logistik_id()
        vendor_name = data.get('pemasok') or ''
        if data.get('id_rekanan'):
            vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
            vendor_name = vendor['nama'] if vendor else vendor_name
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.tran_beli_brg_log(id, rekanan, tgl_spk, no_spk, nilai, id_spb, metode_pembayaran)
                VALUES(%s, %s, %s, %s, %s, %s, %s)
                """,
                [xid, str(vendor_name or '').upper(), data.get('tanggal') or timezone.localdate(), data.get('no_faktur') or data.get('no_spb') or '', 0, data.get('id_spb'), data.get('metode_pembayaran') or 'Kredit']
            )
            
            if data.get('id_spb'):
                # Copy items from SPB to Penerimaan
                cursor.execute(
                    """
                    INSERT INTO rssams.item_logistik(id, id_brg, qty, qty_pesan, isi, harga, jml_mutasi)
                    SELECT %s, id_brg, qty, qty, isi, harga, 0
                    FROM rssams.logistik_spb_item
                    WHERE spb_id = %s
                    """,
                    [xid, data.get('id_spb')]
                )
                _refresh_pembelian_total(xid)
                # Update SPB status
                cursor.execute("UPDATE rssams.logistik_spb SET status = 'Selesai' WHERE id = %s", [data.get('id_spb')])

        return Response({'id': xid, 'nomor': xid}, status=201)

    def retrieve(self, request, pk=None):
        item = legacy_fetchone(
            """
            SELECT t.id, t.id AS nomor, t.tgl_spk AS tanggal, t.rekanan AS pemasok,
                   t.no_spk AS no_faktur, t.nilai, t.done AS status, t.tgl_entri AS created_at, t.id_spb, t.metode_pembayaran,
                   CASE
                     WHEN t.id_spb IS NULL OR t.id_spb = '' THEN 'Tanpa SPB'
                     WHEN s.id IS NOT NULL THEN 'Ada SPB'
                     ELSE 'SPB Terhapus'
                   END AS spb_status_label,
                   CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_spb
            FROM rssams.tran_beli_brg_log t
            LEFT JOIN rssams.logistik_spb s ON s.id = t.id_spb
            WHERE t.id = %s
            """,
            [pk]
        )
        if not item:
            return Response({'detail': 'Not found.'}, status=404)
        
        item['items'] = legacy_fetchall(
            """
            SELECT i.id, i.id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                   b.satuan, i.qty_pesan, i.qty, i.isi, i.harga, i.jml_mutasi,
                   i.qty * i.isi - i.jml_mutasi AS stok_batch
            FROM rssams.item_logistik i
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
            WHERE i.id = %s
            ORDER BY b.nama_barang
            """,
            [pk]
        )
        return Response(item)

    def partial_update(self, request, pk=None):
        data = request.data
        updates = []
        values = []
        if 'tanggal' in data:
            updates.append('tgl_spk = %s')
            values.append(data.get('tanggal') or timezone.localdate())
        if 'id_rekanan' in data or 'pemasok' in data:
            vendor_name = data.get('pemasok') or ''
            if data.get('id_rekanan'):
                vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
                vendor_name = vendor['nama'] if vendor else vendor_name
            updates.append('rekanan = %s')
            values.append(str(vendor_name or '').upper())
        if 'no_faktur' in data or 'no_spb' in data:
            updates.append('no_spk = %s')
            values.append(data.get('no_faktur') or data.get('no_spb') or '')
        if 'metode_pembayaran' in data:
            updates.append('metode_pembayaran = %s')
            values.append(data.get('metode_pembayaran') or 'Kredit')
        if not updates:
            return Response({'detail': 'Tidak ada data yang diubah.'}, status=400)
        values.append(pk)
        with connection.cursor() as cursor:
            cursor.execute(f"UPDATE rssams.tran_beli_brg_log SET {', '.join(updates)} WHERE id = %s", values)
        return Response({'detail': 'OK'})

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        existing = legacy_fetchone("SELECT id, done FROM rssams.tran_beli_brg_log WHERE id = %s", [pk])
        if not existing:
            return Response({'detail': 'Penerimaan tidak ditemukan.'}, status=404)
        count = legacy_fetchone("SELECT COUNT(*) AS total FROM rssams.item_logistik WHERE id = %s", [pk])
        if not count or count['total'] == 0:
            return Response({'detail': 'Tidak dapat mengirim penerimaan kosong. Tambahkan barang terlebih dahulu.'}, status=400)
        with connection.cursor() as cursor:
            cursor.execute("UPDATE rssams.tran_beli_brg_log SET done = 'Y' WHERE id = %s", [pk])
        return Response({'detail': 'Penerimaan berhasil dikirim ke Keuangan.'})

    def destroy(self, request, pk=None):
        existing = legacy_fetchone("SELECT id, done, id_spb FROM rssams.tran_beli_brg_log WHERE id = %s", [pk])
        if not existing:
            return Response({'detail': 'Penerimaan tidak ditemukan.'}, status=404)
        if str(existing.get('done') or '').upper() == 'Y':
            return Response({'detail': 'Penerimaan ini telah dikirim ke Keuangan dan statusnya Terkunci. Data tidak dapat dihapus.'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rssams.item_logistik WHERE id = %s", [pk])
            cursor.execute("DELETE FROM rssams.tran_beli_brg_log WHERE id = %s", [pk])
            spb_target_id = existing.get('id_spb') or pk
            cursor.execute("UPDATE rssams.logistik_spb SET status = 'Draft' WHERE id = %s", [spb_target_id])
        return Response(status=204)



class LogistikBatchViewSet(viewsets.ViewSet):
    serializer_class = LogistikBatchSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def _check_not_submitted(self, pembelian_id):
        row = legacy_fetchone("SELECT done FROM rssams.tran_beli_brg_log WHERE id = %s", [pembelian_id])
        if row and str(row.get('done') or '').upper() == 'Y':
            raise ValidationError('Penerimaan ini sudah dikirim ke Keuangan dan tidak dapat diubah.')

    def _refresh_pembelian_total(self, pembelian_id, no_invoice=None):
        with connection.cursor() as cursor:
            if no_invoice is not None:
                cursor.execute(
                    "UPDATE rssams.tran_beli_brg_log SET no_spk = %s WHERE id = %s",
                    [no_invoice or '', pembelian_id],
                )
            cursor.execute(
                """
                UPDATE rssams.tran_beli_brg_log
                SET nilai = COALESCE((SELECT SUM(qty * harga) FROM rssams.item_logistik WHERE id = %s), 0)
                WHERE id = %s
                """,
                [pembelian_id, pembelian_id],
            )

    def create(self, request):
        data = request.data
        pembelian_id = data.get('pembelian')
        self._check_not_submitted(pembelian_id)
        barang = legacy_fetchone('SELECT isi FROM rssams.dafbrg_log WHERE id_brg = %s', [data.get('barang')])
        if not barang:
            return Response({'detail': 'Barang tidak ditemukan.'}, status=400)
        qty = data.get('qty') or 0
        qty_pesan = data.get('qty_pesan') or 0
        harga = data.get('harga') or 0
        isi = data.get('isi') or barang['isi'] or 1
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.item_logistik(id, id_brg, qty, qty_pesan, harga, isi)
                VALUES(%s, %s, %s, %s, %s, %s)
                """,
                [pembelian_id, data.get('barang'), qty, qty_pesan, harga, isi],
            )
        _refresh_pembelian_total(pembelian_id, data.get('no_invoice') if data.get('no_invoice') is not None else None)
        legacy_stock(data.get('barang'))
        return Response({'detail': 'OK'}, status=201)

    def partial_update(self, request, pk=None):
        data = request.data
        pembelian_id = pk
        self._check_not_submitted(pembelian_id)
        original_barang = data.get('original_barang') or data.get('barang')
        next_barang = data.get('barang')
        if not original_barang or not next_barang:
            return Response({'detail': 'Barang wajib dipilih.'}, status=400)
        barang = legacy_fetchone('SELECT isi FROM rssams.dafbrg_log WHERE id_brg = %s', [next_barang])
        if not barang:
            return Response({'detail': 'Barang tidak ditemukan.'}, status=400)
        existing = legacy_fetchone(
            'SELECT id, id_brg FROM rssams.item_logistik WHERE id = %s AND id_brg = %s LIMIT 1',
            [pembelian_id, original_barang],
        )
        if not existing:
            return Response({'detail': 'Item barang masuk tidak ditemukan.'}, status=404)
        if str(original_barang) != str(next_barang):
            duplicate = legacy_fetchone(
                'SELECT id, id_brg FROM rssams.item_logistik WHERE id = %s AND id_brg = %s LIMIT 1',
                [pembelian_id, next_barang],
            )
            if duplicate:
                return Response({'detail': 'Barang tersebut sudah ada di invoice/SPB ini.'}, status=400)
        qty = data.get('qty') or 0
        qty_pesan = data.get('qty_pesan') or 0
        harga = data.get('harga') or 0
        isi = data.get('isi') or barang['isi'] or 1
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.item_logistik
                SET id_brg = %s, qty = %s, qty_pesan = %s, harga = %s, isi = %s
                WHERE id = %s AND id_brg = %s
                """,
                [next_barang, qty, qty_pesan, harga, isi, pembelian_id, original_barang],
            )
        _refresh_pembelian_total(pembelian_id, data.get('no_invoice') if data.get('no_invoice') is not None else None)
        legacy_stock(original_barang)
        if str(original_barang) != str(next_barang):
            legacy_stock(next_barang)
        return Response({'detail': 'OK'})

    def destroy(self, request, pk=None):
        pembelian_id = pk
        self._check_not_submitted(pembelian_id)
        barang_id = request.query_params.get('barang')
        if not barang_id:
            return Response({'detail': 'ID Barang wajib disertakan.'}, status=400)
        
        existing = legacy_fetchone(
            'SELECT id, id_brg FROM rssams.item_logistik WHERE id = %s AND id_brg = %s LIMIT 1',
            [pembelian_id, barang_id],
        )
        if not existing:
            return Response({'detail': 'Item barang tidak ditemukan.'}, status=404)
        
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM rssams.item_logistik
                WHERE id = %s AND id_brg = %s
                """,
                [pembelian_id, barang_id],
            )
        
        _refresh_pembelian_total(pembelian_id)
        legacy_stock(barang_id)
        return Response(status=204)


def create_logistik_mutasi_fifo_legacy(id_brg, id_ruang, qty, tanggal=None, keterangan=''):
    stock = legacy_stock(id_brg)
    qty = float(qty)
    if stock < qty:
        raise ValidationError('Stok barang tidak cukup.')
    master_id = legacy_next_year_id('tran_out_brg_log')
    tgl = f"{tanggal or timezone.localdate()} {timezone.localtime().strftime('%H:%M:%S')}"
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO rssams.tran_out_brg_log(id, tgl, id_ruang, pemberi, penerima)
            VALUES(%s, %s, %s, %s, %s)
            """,
            [master_id, tgl, id_ruang, '', keterangan or 'SIMAK'],
        )
    remaining = qty
    for batch in legacy_fetchall("SELECT * FROM rssams.item_logistik WHERE id_brg = %s ORDER BY id", [id_brg]):
        tersedia = float(batch['qty'] or 0) * float(batch['isi'] or 0) - float(batch['jml_mutasi'] or 0)
        if tersedia <= 0:
            continue
        ambil = min(remaining, tersedia)
        harga = float(batch['harga'] or 0) / (float(batch['isi'] or 1) or 1)
        item_id = legacy_next_item_out_id(master_id)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.item_out_log(id, id_brg, qty_minta, qty, harga, tgl, id_ruang, id_item_logistik, status)
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s, 'Sudah Diberikan')
                """,
                [item_id, id_brg, ambil, ambil, harga, tgl, id_ruang, batch['id']],
            )
            cursor.execute(
                """
                UPDATE rssams.item_logistik
                SET jml_mutasi = COALESCE((SELECT SUM(qty) FROM rssams.item_out_log WHERE id_brg = %s AND id_item_logistik = %s), 0)
                WHERE id = %s AND id_brg = %s
                """,
                [id_brg, batch['id'], batch['id'], id_brg],
            )
        remaining -= ambil
        if remaining == 0:
            break
    if remaining > 0:
        raise ValidationError('Stok batch tidak cukup.')
    total = legacy_fetchone("SELECT COALESCE(SUM(qty),0) AS jmlbrg, COALESCE(SUM(qty*harga),0) AS nilai FROM rssams.item_out_log WHERE LEFT(id,6) = %s", [master_id])
    with connection.cursor() as cursor:
        cursor.execute("UPDATE rssams.tran_out_brg_log SET jmlbrg = %s, nilai = %s, done = 'Y' WHERE id = %s", [total['jmlbrg'], total['nilai'], master_id])
    legacy_stock(id_brg)
    return master_id


class LogistikMutasiViewSet(viewsets.ViewSet):
    serializer_class = LogistikMutasiSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = 'WHERE o.qty > 0'
        params = []
        if search:
            where += ' AND (b.nama_barang LIKE %s OR r.ruangan LIKE %s OR o.id LIKE %s)'
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        base = f"""
            SELECT o.id, o.id AS nomor, o.id_brg AS barang, b.nama_barang AS barang_nama, b.satuan,
                   DATE(o.tgl) AS tanggal, o.id_ruang, r.ruangan AS ruang, o.qty, o.harga, o.status
            FROM rssams.item_out_log o
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg
            LEFT JOIN rssams.kode_ruang r ON r.id_ruang = o.id_ruang
            {where}
            ORDER BY o.tgl DESC, o.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.item_out_log o INNER JOIN rssams.dafbrg_log b ON b.id_brg=o.id_brg LEFT JOIN rssams.kode_ruang r ON r.id_ruang=o.id_ruang {where}"
        return legacy_paginated(request, base, count, params)

    @transaction.atomic
    def create(self, request):
        master_id = create_logistik_mutasi_fifo_legacy(
            request.data.get('barang'),
            request.data.get('ruang'),
            request.data.get('qty') or 0,
            request.data.get('tanggal'),
            request.data.get('keterangan') or '',
        )
        return Response({'id': master_id, 'nomor': master_id}, status=201)


class LogistikPermintaanViewSet(viewsets.ViewSet):
    serializer_class = LogistikPermintaanSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        status_param = request.query_params.get('status')
        where = 'WHERE o.qty_minta > 0'
        params = []
        if status_param == 'menunggu':
            where += " AND o.status = 'Belum Ditanggapi'"
        elif status_param == 'disetujui':
            where += " AND (o.status LIKE 'Disetujui%%' OR o.status IN ('Sudah Diberikan','Sudah Diterima'))"
        elif status_param == 'ditolak':
            where += " AND o.status NOT IN ('Belum Ditanggapi', 'Sudah Diberikan', 'Sudah Diterima') AND o.status NOT LIKE 'Disetujui%%'" 
        if search:
            where += ' AND (b.nama_barang LIKE %s OR r.ruangan LIKE %s OR o.id LIKE %s)'
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        base = f"""
            SELECT o.id, o.id_brg AS barang, b.nama_barang AS barang_nama, b.satuan,
                   DATE(o.tgl) AS tanggal, o.id_ruang, r.ruangan AS ruang,
                   o.qty_minta, o.qty AS qty_setuju,
                   CASE WHEN o.status = 'Belum Ditanggapi' THEN 'menunggu'
                        WHEN o.status LIKE 'Disetujui%%' OR o.status IN ('Sudah Diberikan','Sudah Diterima') THEN 'disetujui'
                        ELSE 'ditolak' END AS status,
                   o.status AS status_label, o.tgl_verif AS verified_at
            FROM rssams.item_out_log o
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg
            LEFT JOIN rssams.kode_ruang r ON r.id_ruang = o.id_ruang
            {where}
            ORDER BY o.tgl DESC, o.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.item_out_log o INNER JOIN rssams.dafbrg_log b ON b.id_brg=o.id_brg LEFT JOIN rssams.kode_ruang r ON r.id_ruang=o.id_ruang {where}"
        return legacy_paginated(request, base, count, params)

    def create(self, request):
        prefix = timezone.localdate().strftime('%y')
        next_row = legacy_fetchone(
            "SELECT COALESCE(MAX(CAST(SUBSTR(id,4,6) AS UNSIGNED)),0)+1 AS next_id FROM rssams.item_out_log WHERE LEFT(id,2) = %s",
            [prefix],
        )
        xid = f"{prefix}-{int(next_row['next_id']):06d}"
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.item_out_log(id, id_brg, qty_minta, qty, harga, tgl, id_ruang, id_item_logistik, status)
                VALUES(%s, %s, %s, 0, 0, NOW(), %s, '', 'Belum Ditanggapi')
                """,
                [xid, request.data.get('barang'), request.data.get('qty_minta') or 0, request.data.get('ruang')],
            )
        return Response({'id': xid}, status=201)

    @action(detail=True, methods=['post'], url_path='verifikasi')
    @transaction.atomic
    def verifikasi(self, request, pk=None):
        item = legacy_fetchone('SELECT * FROM rssams.item_out_log WHERE id = %s', [pk])
        if not item:
            return Response({'error': 'Permintaan tidak ditemukan.'}, status=404)
        if item['status'] != 'Belum Ditanggapi':
            return Response({'error': 'Permintaan sudah diverifikasi.'}, status=400)
        status_baru = request.data.get('status')
        qty_setuju = int(request.data.get('qty_setuju') or 0)
        if status_baru not in ('disetujui', 'ditolak'):
            return Response({'error': 'Status verifikasi tidak valid.'}, status=400)
        if status_baru == 'disetujui':
            if qty_setuju <= 0 or qty_setuju > int(item['qty_minta'] or 0):
                return Response({'error': 'Qty disetujui harus lebih dari 0 dan tidak melebihi permintaan.'}, status=400)
            with connection.cursor() as cursor:
                cursor.execute("UPDATE rssams.item_out_log SET qty = %s, status = 'Disetujui', tgl_verif = NOW() WHERE id = %s", [qty_setuju, pk])
        else:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE rssams.item_out_log SET qty = 0, status = 'Tidak Disetujui', tgl_verif = NOW() WHERE id = %s", [pk])
        return Response({'detail': 'OK'})


class LogistikOpnameViewSet(viewsets.ViewSet):
    serializer_class = LogistikOpnameSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = ''
        params = []
        if search:
            where = 'WHERE b.nama_barang LIKE %s'
            params = [f'%{search}%']
        base = f"""
            SELECT o.id, o.id_brg AS barang, b.nama_barang AS barang_nama,
                   o.tgl AS tanggal, o.stock_komp AS stok_sistem, o.real_stock,
                   o.real_stock - o.stock_komp AS selisih, '' AS keterangan
            FROM rssams.opname_brg_log o
            LEFT JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg
            {where}
            ORDER BY o.tgl DESC, o.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.opname_brg_log o LEFT JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg {where}"
        return legacy_paginated(request, base, count, params)

    def create(self, request):
        data = request.data
        id_brg = data.get('barang')
        real_stock = float(data.get('real_stock') or 0)
        tanggal = data.get('tanggal') or timezone.localdate()

        # 1. Hitung stok sistem terkini dan catat opname
        stock_sistem = float(legacy_stock(id_brg) or 0)
        selisih = real_stock - stock_sistem

        opname_row = legacy_fetchone('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM rssams.opname_brg_log')
        opname_id = opname_row['next_id']

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.opname_brg_log(id, id_brg, real_stock, stock_komp, harga, tgl)
                VALUES(%s, %s, %s, %s, 0, %s)
                """,
                [opname_id, id_brg, real_stock, stock_sistem, tanggal],
            )

        # 2. Terapkan penyesuaian stok jika ada selisih
        if abs(selisih) >= 0.01:
            opname_spb_id = legacy_next_logistik_id()
            tgl_dt = f"{tanggal} {timezone.localtime().strftime('%H:%M:%S')}"

            # Buat SPB OPNAME sebagai referensi
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO rssams.tran_beli_brg_log(id, tgl_spk, no_spk, rekanan, nilai, done)
                    VALUES(%s, %s, %s, 'STOCK OPNAME', 0, 'Y')
                    """,
                    [opname_spb_id, tanggal, f'OPNAME-{opname_id}'],
                )

            if selisih > 0:
                # Stok sistem lebih rendah dari real: tambah stok masuk
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.item_logistik(id, id_brg, qty, isi, harga)
                        VALUES(%s, %s, %s, 1, 0)
                        """,
                        [opname_spb_id, id_brg, selisih],
                    )
            else:
                # Stok sistem lebih tinggi dari real: kurangi dengan out record
                # Dummy batch masuk (qty=0) sebagai referensi id_item_logistik
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.item_logistik(id, id_brg, qty, isi, harga)
                        VALUES(%s, %s, 0, 1, 0)
                        """,
                        [opname_spb_id, id_brg],
                    )

                # Master tran_out_brg_log untuk opname
                opname_out_id = legacy_next_year_id('tran_out_brg_log')
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.tran_out_brg_log(id, tgl, id_ruang, pemberi, penerima, done)
                        VALUES(%s, %s, 1, 'SIMAK', 'STOCK OPNAME', 'Y')
                        """,
                        [opname_out_id, tgl_dt],
                    )

                # Item out yang mengurangi stok, referensi ke dummy batch
                out_item_id = legacy_next_item_out_id(opname_out_id)
                qty_kurang = abs(selisih)
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.item_out_log(id, id_brg, qty_minta, qty, harga, tgl, id_ruang, id_item_logistik, status)
                        VALUES(%s, %s, %s, %s, 0, %s, 1, %s, 'Sudah Diberikan')
                        """,
                        [out_item_id, id_brg, qty_kurang, qty_kurang, tgl_dt, opname_spb_id],
                    )

            # Refresh cache stok di dafbrg_log
            legacy_stock(id_brg)

        return Response({'id': opname_id}, status=201)

def _refresh_pembelian_total(pembelian_id, no_invoice=None):
    from django.db import connection
    with connection.cursor() as cursor:
        if no_invoice is not None:
            cursor.execute(
                "UPDATE rssams.tran_beli_brg_log SET no_spk = %s WHERE id = %s",
                [no_invoice or '', pembelian_id],
            )
        cursor.execute(
            """
            UPDATE rssams.tran_beli_brg_log
            SET nilai = COALESCE((SELECT SUM(qty * harga) FROM rssams.item_logistik WHERE id = %s), 0)
            WHERE id = %s
            """,
            [pembelian_id, pembelian_id],
        )


def _refresh_spb_total(spb_id):
    from django.db import connection
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE rssams.logistik_spb s
            SET nilai = COALESCE((
                SELECT SUM(qty * harga) FROM rssams.logistik_spb_item WHERE spb_id = s.id
            ), 0)
            WHERE id = %s
            """,
            [spb_id]
        )

class LogistikSpbViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def retrieve(self, request, pk=None):
        item = legacy_fetchone(
            """
            SELECT id, id AS nomor, tanggal, rekanan AS pemasok,
                   no_spb, nilai, status, tgl_entri AS created_at, metode_pembayaran
            FROM rssams.logistik_spb
            WHERE id = %s
            """,
            [pk]
        )
        if not item:
            return Response({'detail': 'SPB tidak ditemukan.'}, status=404)
        item['items'] = legacy_fetchall(
            """
            SELECT i.id, i.spb_id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                   b.satuan, i.qty AS qty_pesan, 0 AS qty, i.isi, i.harga, 0 AS jml_mutasi,
                   i.qty * i.isi AS stok_batch
            FROM rssams.logistik_spb_item i
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
            WHERE i.spb_id = %s
            ORDER BY b.nama_barang
            """,
            [pk]
        )
        return Response(item)

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = ''
        params = []
        if search:
            where = 'WHERE rekanan LIKE %s OR no_spb LIKE %s OR id LIKE %s'
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        base = f"""
            SELECT id, id AS nomor, tanggal, rekanan AS pemasok,
                   no_spb, nilai, status, tgl_entri AS created_at, metode_pembayaran
            FROM rssams.logistik_spb {where}
            ORDER BY tanggal DESC, id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.logistik_spb {where}"
        res = legacy_paginated(request, base, count, params)
        for item in res.data['results']:
            item['items'] = legacy_fetchall(
                """
                SELECT i.id, i.spb_id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                       b.satuan, i.qty AS qty_pesan, 0 AS qty, i.isi, i.harga, 0 AS jml_mutasi,
                       i.qty * i.isi AS stok_batch
                FROM rssams.logistik_spb_item i
                INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
                WHERE i.spb_id = %s
                ORDER BY b.nama_barang
                """,
                [item['id']],
            )
        return res

    def create(self, request):
        data = request.data
        xid = data.get('id_spb') or legacy_next_logistik_id() # Keep same numbering sequence as pembelian
        vendor_name = data.get('pemasok') or ''
        if data.get('id_rekanan'):
            vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
            vendor_name = vendor['nama'] if vendor else vendor_name
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.logistik_spb(id, rekanan, tanggal, no_spb, nilai, metode_pembayaran)
                VALUES(%s, %s, %s, %s, %s, %s)
                """,
                [xid, str(vendor_name or '').upper(), data.get('tanggal') or timezone.localdate(), data.get('no_spb') or '', 0, data.get('metode_pembayaran') or 'Kredit'],
            )
        return self.retrieve(request, pk=xid)

    def partial_update(self, request, pk=None):
        data = request.data
        vendor_name = data.get('pemasok') or ''
        if data.get('id_rekanan'):
            vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
            vendor_name = vendor['nama'] if vendor else vendor_name
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.logistik_spb
                SET rekanan = %s, tanggal = %s, no_spb = %s, metode_pembayaran = %s
                WHERE id = %s
                """,
                [str(vendor_name or '').upper(), data.get('tanggal'), data.get('no_spb') or '', data.get('metode_pembayaran') or 'Kredit', pk]
            )
        return Response({'status': 'ok'})

    def destroy(self, request, pk=None):
        penerimaan = legacy_fetchone(
            "SELECT id FROM rssams.tran_beli_brg_log WHERE id = %s OR id_spb = %s LIMIT 1",
            [pk, pk]
        )
        if penerimaan:
            return Response(
                {'detail': 'SPB ini sudah diproses menjadi Penerimaan Gudang dan tidak dapat dihapus.'},
                status=400
            )
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rssams.logistik_spb_item WHERE spb_id = %s", [pk])
            cursor.execute("DELETE FROM rssams.logistik_spb WHERE id = %s", [pk])
        return Response(status=204)

class LogistikSpbItemViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def create(self, request):
        data = request.data
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.logistik_spb_item(spb_id, id_brg, qty, isi, harga)
                VALUES(%s, %s, %s, %s, %s)
                """,
                [data.get('pembelian'), data.get('barang'), data.get('qty_pesan') or data.get('qty') or 0, data.get('isi', 1), data.get('harga', 0)]
            )
        _refresh_spb_total(data.get('pembelian'))
        return Response({'status': 'created'}, status=201)

    def partial_update(self, request, pk=None):
        data = request.data
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.logistik_spb_item
                SET qty = %s, isi = %s, harga = %s
                WHERE id = %s
                """,
                [data.get('qty_pesan') or data.get('qty') or 0, data.get('isi', 1), data.get('harga', 0), pk]
            )
            # Fetch spb_id
            cursor.execute("SELECT spb_id FROM rssams.logistik_spb_item WHERE id = %s", [pk])
            row = cursor.fetchone()
        if row:
            _refresh_spb_total(row[0])
        return Response({'status': 'updated'})

    def destroy(self, request, pk=None):
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT spb_id FROM rssams.logistik_spb_item WHERE id = %s", [pk])
            row = cursor.fetchone()
            cursor.execute("DELETE FROM rssams.logistik_spb_item WHERE id = %s", [pk])
        if row:
            _refresh_spb_total(row[0])
        return Response(status=204)
