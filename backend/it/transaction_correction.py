import os
import MySQLdb
import MySQLdb.cursors
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import APIException
from .views import get_rssams_connection, is_it, IsITPermission
import datetime
from decimal import Decimal
from django.db import connection as django_connection

def serialize_val(v):
    if v is None:
        return None
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.strftime('%Y-%m-%d %H:%M:%S') if isinstance(v, datetime.datetime) else v.strftime('%Y-%m-%d')
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, bytes):
        return v.decode('utf-8', errors='replace')
    if isinstance(v, dict):
        return {k: serialize_val(val) for k, val in v.items()}
    if isinstance(v, list):
        return [serialize_val(item) for item in v]
    return v

def recalculate_kunjung(cursor, no_kunj):
    # 1. Adm
    cursor.execute("SELECT SUM(harga*qty) as tot FROM tb_biaya_adm WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    adm = res['tot'] if res and res['tot'] else 0

    # 2. Jasa
    cursor.execute("SELECT SUM(harga*qty) as tot FROM tb_biaya_jasa WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    jasa = res['tot'] if res and res['tot'] else 0

    # 3. Farmasi
    cursor.execute("SELECT SUM(total) as tot FROM tran_apt WHERE no_kunj = %s", [no_kunj])
    res = cursor.fetchone()
    farmasi = res['tot'] if res and res['tot'] else 0

    # 4. Tindakan
    cursor.execute("SELECT SUM(tarif*qty) as tot FROM tb_biaya_tindakan WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    tindakan = res['tot'] if res and res['tot'] else 0

    # 5. BHP
    cursor.execute("SELECT SUM(harga*qty) as tot FROM tb_biaya_bhp WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    bhp = res['tot'] if res and res['tot'] else 0

    # 6. Lab
    cursor.execute("SELECT SUM(total) as tot FROM tran_lab WHERE no_kunj = %s", [no_kunj])
    res = cursor.fetchone()
    lab = res['tot'] if res and res['tot'] else 0

    # 7. Rad
    cursor.execute("SELECT SUM(total) as tot FROM tran_rad WHERE no_kunj = %s", [no_kunj])
    res = cursor.fetchone()
    rad = res['tot'] if res and res['tot'] else 0

    # 8. Kamar
    cursor.execute("SELECT SUM(tarif*jml_hari) as tot FROM tb_biaya_kamar WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    kamar = res['tot'] if res and res['tot'] else 0

    # 9. Alat
    cursor.execute("SELECT SUM(harga*qty) as tot FROM tb_biaya_alat WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    alat = res['tot'] if res and res['tot'] else 0

    # 10. Lainnya
    cursor.execute("SELECT SUM(harga*qty) as tot FROM tb_biaya_lain2 WHERE LEFT(no, 8) = %s", [no_kunj])
    res = cursor.fetchone()
    lainnya = res['tot'] if res and res['tot'] else 0

    # Update kunjung subtotals
    cursor.execute("""
        UPDATE kunjung 
        SET adm=%s, jasa=%s, farmasi=%s, tindakan=%s, bhp=%s, 
            lab=%s, rad=%s, kamar=%s, alat=%s, lainnya=%s 
        WHERE no=%s
    """, [adm, jasa, farmasi, tindakan, bhp, lab, rad, kamar, alat, lainnya, no_kunj])

    # Recalculate jmlbyr ONLY IF id_pembiayaan is not BPJS (71, 72, 74)
    cursor.execute("SELECT id_pembiayaan, lab_pa, ambulan FROM kunjung WHERE no=%s", [no_kunj])
    k_data = cursor.fetchone()
    if k_data:
        id_pembiayaan = str(k_data['id_pembiayaan'])
        if id_pembiayaan not in ['71', '72', '74']:
            lab_pa = k_data['lab_pa'] or 0
            ambulan = k_data['ambulan'] or 0
            jmlbyr = (
                float(adm) + float(jasa) + float(farmasi) + float(tindakan) + float(bhp) +
                float(lab) + float(lab_pa) + float(rad) + float(kamar) + float(alat) + 
                float(lainnya) + float(ambulan)
            )
            cursor.execute("UPDATE kunjung SET jmlbyr=%s WHERE no=%s", [jmlbyr, no_kunj])

class TransactionCorrectionView(APIView):
    permission_classes = [IsAuthenticated, IsITPermission]

    def check_it_permission(self, request):
        if not is_it(request.user):
            raise APIException("Akses ditolak. Harus tim IT.")

    def get(self, request, action_type):
        self.check_it_permission(request)
        conn = None
        try:
            conn = get_rssams_connection()
            with conn.cursor(MySQLdb.cursors.DictCursor) as cursor:
                if action_type == 'search':
                    q = request.query_params.get('q', '').strip()
                    if not q:
                        return Response([])
                    cursor.execute("""
                        SELECT a.no, a.noreg, b.nama, a.tgl_masuk 
                        FROM kunjung a 
                        LEFT JOIN regpasien b ON a.noreg = b.noreg 
                        WHERE a.no = %s OR a.noreg = %s OR b.nama LIKE %s
                        ORDER BY a.tgl_masuk DESC LIMIT 50
                    """, [q, q, f"%{q}%"])
                    return Response(serialize_val(cursor.fetchall()))
                
                elif action_type == 'detail':
                    no_kunj = request.query_params.get('no_kunj')
                    if not no_kunj:
                        return Response({"error": "no_kunj required"}, status=400)
                    
                    data = {}
                    
                    # 1. Header Pasien
                    cursor.execute("""
                        SELECT a.no, a.noreg, b.nama, a.tgl_masuk, a.tgl_keluar, a.no_sep, a.dpjp,
                            a.id_pembiayaan, c.pembiayaan, a.adm, a.jasa, a.farmasi, a.tindakan, a.bhp, 
                            a.lab, a.rad, a.kamar, a.alat, a.lainnya, a.jmlbyr, a.cek,
                            CASE 
                                WHEN a.kelas = '1' THEN 'VVIP'
                                WHEN a.kelas = '2' THEN 'VIP'
                                WHEN a.kelas = '3' THEN 'Kelas I'
                                WHEN a.kelas = '4' THEN 'Kelas II'
                                WHEN a.kelas = '5' THEN 'Kelas III'
                                WHEN a.kelas = '6' THEN 'Rawat Jalan'
                                WHEN a.kelas = '8' THEN 'Covid 19'
                            END as kelas_nama
                        FROM kunjung a
                        LEFT JOIN regpasien b ON a.noreg = b.noreg
                        LEFT JOIN pbiaya c ON a.id_pembiayaan = c.id_pembiayaan
                        WHERE a.no = %s
                    """, [no_kunj])
                    data['pasien'] = cursor.fetchone()
                    
                    if not data['pasien']:
                        return Response({"error": "Kunjungan tidak ditemukan"}, status=404)
                        
                    # 2. Biaya Administrasi
                    cursor.execute("""
                        SELECT a.no, a.kode, a.qty, a.harga, a.tgl, b.uraian, (a.harga * a.qty) as total
                        FROM tb_biaya_adm a 
                        LEFT JOIN tarif_adm b ON a.kode = b.id_adm 
                        WHERE LEFT(a.no, 8) = %s ORDER BY a.tgl
                    """, [no_kunj])
                    data['adm'] = cursor.fetchall()
                    
                    # 3. Biaya Farmasi
                    cursor.execute("""
                        SELECT no as no_resep, tgl, total, jf, embalace
                        FROM tran_apt WHERE no_kunj = %s ORDER BY tgl
                    """, [no_kunj])
                    farmasi_headers = cursor.fetchall()
                    data['farmasi'] = []
                    for fh in farmasi_headers:
                        cursor.execute("""
                            SELECT i.no, i.id_brg, b.nama_barang, i.qty, i.harga, i.tgl, b.satuan, (i.qty * i.harga) as total
                            FROM item_tran_apt i
                            LEFT JOIN dafbrg_farmasi b ON i.id_brg = b.id_brg
                            WHERE i.no LIKE %s ORDER BY i.tgl
                        """, [f"{fh['no_resep']}%"])
                        fh['items'] = cursor.fetchall()
                        data['farmasi'].append(fh)
                        
                    # 4. Biaya Jasa
                    cursor.execute("""
                        SELECT a.no, a.id_jasa, b.uraian, a.harga, a.qty, (a.harga * a.qty) as total,
                            a.tgl, a.id_petugas, c.nama as nama_petugas
                        FROM tb_biaya_jasa a
                        LEFT JOIN tarif_jasa_tindakan b ON a.id_jasa = b.id
                        LEFT JOIN petugas c ON a.id_petugas = c.id_petugas
                        WHERE LEFT(a.no, 8) = %s ORDER BY a.tgl
                    """, [no_kunj])
                    data['jasa'] = cursor.fetchall()
                    
                    # 5. Biaya Tindakan
                    cursor.execute("""
                        SELECT a.no, a.id_tindakan, b.uraian, a.tarif as harga, a.qty, (a.tarif * a.qty) as total,
                            a.mulai as tgl, a.operator as id_petugas, c.nama as nama_petugas
                        FROM tb_biaya_tindakan a
                        LEFT JOIN tarif_jasa_tindakan b ON a.id_tindakan = b.id
                        LEFT JOIN petugas c ON a.operator = c.id_petugas
                        WHERE LEFT(a.no, 8) = %s ORDER BY a.mulai
                    """, [no_kunj])
                    data['tindakan'] = cursor.fetchall()
                    
                    # 6. Biaya BHP
                    cursor.execute("""
                        SELECT no, id_bhp, uraian, harga, qty, (harga * qty) as total, tgl, satuan
                        FROM tb_biaya_bhp WHERE LEFT(no, 8) = %s ORDER BY tgl
                    """, [no_kunj])
                    data['bhp'] = cursor.fetchall()
                    
                    # 7. Biaya Kamar
                    cursor.execute("""
                        SELECT no, tgl_masuk as tgl, tgl_keluar, jml_hari as qty, tarif as harga, kelas, (tarif * jml_hari) as total
                        FROM tb_biaya_kamar WHERE LEFT(no, 8) = %s ORDER BY tgl_masuk
                    """, [no_kunj])
                    data['kamar'] = cursor.fetchall()
                    
                    # 8. Biaya Lab
                    cursor.execute("SELECT no as no_lab, tgl, total FROM tran_lab WHERE no_kunj = %s ORDER BY tgl", [no_kunj])
                    lab_headers = cursor.fetchall()
                    data['lab'] = []
                    for lh in lab_headers:
                        cursor.execute("""
                            SELECT i.no, i.id_lab, b.jenis as uraian, i.qty, i.harga, i.bhp, ((i.harga + i.bhp) * i.qty) as total
                            FROM item_tran_lab i
                            LEFT JOIN tarif_lab b ON i.id_lab = b.id_lab
                            WHERE i.no LIKE %s
                        """, [f"{lh['no_lab']}%"])
                        lh['items'] = cursor.fetchall()
                        data['lab'].append(lh)
                        
                    # 9. Biaya Rad
                    cursor.execute("SELECT no as no_rad, tgl, total FROM tran_rad WHERE no_kunj = %s ORDER BY tgl", [no_kunj])
                    rad_headers = cursor.fetchall()
                    data['rad'] = []
                    for rh in rad_headers:
                        cursor.execute("""
                            SELECT i.no, i.id_rad, b.jenis as uraian, i.qty, i.jasa_layan as harga, i.bhp, ((i.jasa_layan + i.bhp) * i.qty) as total
                            FROM item_tran_rad i
                            LEFT JOIN tarif_radiologi b ON i.id_rad = b.id_rad
                            WHERE i.no LIKE %s
                        """, [f"{rh['no_rad']}%"])
                        rh['items'] = cursor.fetchall()
                        data['rad'].append(rh)

                    # 10. Alat
                    cursor.execute("""
                        SELECT no, nama_alat as uraian, harga, qty, (harga * qty) as total, tgl
                        FROM tb_biaya_alat WHERE LEFT(no, 8) = %s ORDER BY tgl
                    """, [no_kunj])
                    data['alat'] = cursor.fetchall()

                    # 11. Lain-lain
                    cursor.execute("""
                        SELECT no, uraian, harga, qty, (harga * qty) as total, tgl
                        FROM tb_biaya_lain2 WHERE LEFT(no, 8) = %s ORDER BY tgl
                    """, [no_kunj])
                    data['lainnya'] = cursor.fetchall()
                        
                    return Response(serialize_val(data))
                
                else:
                    return Response({"error": "Unknown GET action"}, status=400)
                    
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=500)
        finally:
            if conn and conn != getattr(django_connection, 'connection', None):
                try:
                    conn.close()
                except Exception:
                    pass

    def post(self, request, action_type):
        self.check_it_permission(request)
        conn = None
        try:
            conn = get_rssams_connection()
            with conn.cursor(MySQLdb.cursors.DictCursor) as cursor:
                if action_type == 'update-date':
                    table = request.data.get('table')
                    item_no = request.data.get('item_no')
                    new_date = request.data.get('new_date')
                    no_kunj = request.data.get('no_kunj')
                    
                    if not all([table, item_no, new_date, no_kunj]):
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    new_date_str = str(new_date).replace('T', ' ')
                    
                    if table == 'jasa':
                        cursor.execute("UPDATE tb_biaya_jasa SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'tindakan':
                        cursor.execute("UPDATE tb_biaya_tindakan SET mulai = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'adm':
                        cursor.execute("UPDATE tb_biaya_adm SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'bhp':
                        cursor.execute("UPDATE tb_biaya_bhp SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'farmasi_item':
                        cursor.execute("UPDATE item_tran_apt SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table in ['farmasi', 'farmasi_resep']:
                        cursor.execute("UPDATE tran_apt SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                        cursor.execute("UPDATE item_tran_apt SET tgl = %s WHERE no LIKE %s", [new_date_str, f"{item_no}%"])
                    elif table == 'lab':
                        cursor.execute("UPDATE tran_lab SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'rad':
                        cursor.execute("UPDATE tran_rad SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'kamar':
                        cursor.execute("UPDATE tb_biaya_kamar SET tgl_masuk = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'alat':
                        cursor.execute("UPDATE tb_biaya_alat SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                    elif table == 'lainnya':
                        cursor.execute("UPDATE tb_biaya_lain2 SET tgl = %s WHERE no = %s", [new_date_str, item_no])
                        
                    return Response({"message": "Berhasil mengubah tanggal item"})
                    
                elif action_type == 'update-qty':
                    table = request.data.get('table')
                    item_no = request.data.get('item_no')
                    new_qty = request.data.get('new_qty')
                    no_kunj = request.data.get('no_kunj')
                    
                    if not all([table, item_no, new_qty is not None, no_kunj]):
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    try:
                        qty_val = float(new_qty)
                    except ValueError:
                        return Response({"error": "Nilai qty tidak valid"}, status=400)
                        
                    if table == 'farmasi_item':
                        resep_no = item_no.rsplit('-', 1)[0] if '-' in item_no else item_no
                        cursor.execute("UPDATE item_tran_apt SET qty = %s, total = (%s * harga) + embalace WHERE no = %s", [qty_val, qty_val, item_no])
                        cursor.execute("""
                            SELECT COALESCE(SUM(qty * harga), 0) as subtotal, 
                                   COALESCE(SUM(embalace), 0) as tot_emb 
                            FROM item_tran_apt WHERE no LIKE %s
                        """, [f"{resep_no}%"])
                        tot_res = cursor.fetchone()
                        subtotal = tot_res['subtotal'] if tot_res else 0
                        tot_emb = tot_res['tot_emb'] if tot_res else 0
                        cursor.execute("UPDATE tran_apt SET total = %s, embalace = %s WHERE no = %s", [subtotal, tot_emb, resep_no])
                        recalculate_kunjung(cursor, no_kunj)
                        return Response({"message": f"Qty obat {item_no} berhasil diubah menjadi {qty_val}"})
                    elif table == 'jasa':
                        cursor.execute("UPDATE tb_biaya_jasa SET qty = %s WHERE no = %s", [qty_val, item_no])
                        recalculate_kunjung(cursor, no_kunj)
                        return Response({"message": f"Qty jasa berhasil diubah menjadi {qty_val}"})
                    elif table == 'tindakan':
                        cursor.execute("UPDATE tb_biaya_tindakan SET qty = %s WHERE no = %s", [qty_val, item_no])
                        recalculate_kunjung(cursor, no_kunj)
                        return Response({"message": f"Qty tindakan berhasil diubah menjadi {qty_val}"})
                    elif table == 'bhp':
                        cursor.execute("UPDATE tb_biaya_bhp SET qty = %s WHERE no = %s", [qty_val, item_no])
                        recalculate_kunjung(cursor, no_kunj)
                        return Response({"message": f"Qty BHP berhasil diubah menjadi {qty_val}"})

                elif action_type == 'batch-sync-date':
                    no_kunj = request.data.get('no_kunj')
                    target_date = request.data.get('target_date')
                    items = request.data.get('items', []) # e.g. [{"table": "jasa", "item_no": "26045602-001"}, ...]
                    
                    if not no_kunj or not target_date or not items:
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    target_date_str = str(target_date).replace('T', ' ')
                    
                    for item in items:
                        t = item.get('table')
                        ino = item.get('item_no')
                        if t == 'jasa':
                            cursor.execute("UPDATE tb_biaya_jasa SET tgl = %s WHERE no = %s", [target_date_str, ino])
                        elif t == 'tindakan':
                            cursor.execute("UPDATE tb_biaya_tindakan SET mulai = %s WHERE no = %s", [target_date_str, ino])
                        elif t == 'adm':
                            cursor.execute("UPDATE tb_biaya_adm SET tgl = %s WHERE no = %s", [target_date_str, ino])
                        elif t == 'bhp':
                            cursor.execute("UPDATE tb_biaya_bhp SET tgl = %s WHERE no = %s", [target_date_str, ino])
                        elif t == 'farmasi_item':
                            cursor.execute("UPDATE item_tran_apt SET tgl = %s WHERE no = %s", [target_date_str, ino])
                        elif t in ['farmasi', 'farmasi_resep']:
                            cursor.execute("UPDATE tran_apt SET tgl = %s WHERE no = %s", [target_date_str, ino])
                            cursor.execute("UPDATE item_tran_apt SET tgl = %s WHERE no LIKE %s", [target_date_str, f"{ino}%"])
                        elif t == 'lab':
                            cursor.execute("UPDATE tran_lab SET tgl = %s WHERE no = %s", [target_date_str, ino])
                        elif t == 'rad':
                            cursor.execute("UPDATE tran_rad SET tgl = %s WHERE no = %s", [target_date_str, ino])
                            
                    return Response({"message": f"Berhasil sinkronisasi {len(items)} item ke tanggal SEP/Target"})
                
                elif action_type == 'update-practitioner':
                    table = request.data.get('table')
                    item_no = request.data.get('item_no')
                    new_petugas_id = request.data.get('new_petugas_id')
                    
                    if not all([table, item_no, new_petugas_id]):
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    if table == 'jasa':
                        cursor.execute("UPDATE tb_biaya_jasa SET id_petugas = %s WHERE no = %s", [new_petugas_id, item_no])
                    elif table == 'tindakan':
                        cursor.execute("UPDATE tb_biaya_tindakan SET operator = %s WHERE no = %s", [new_petugas_id, item_no])
                        
                    return Response({"message": "Berhasil mengubah petugas pelaksana"})
                
                elif action_type == 'move-prescription':
                    apt_no = request.data.get('apt_no')
                    target_kunj = request.data.get('target_kunj')
                    old_kunj = request.data.get('old_kunj')
                    
                    if not all([apt_no, target_kunj, old_kunj]):
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    # Check target_kunj
                    cursor.execute("SELECT no, noreg FROM kunjung WHERE no = %s", [target_kunj])
                    k_baru = cursor.fetchone()
                    if not k_baru:
                        return Response({"error": f"Kunjungan tujuan {target_kunj} tidak ditemukan"}, status=404)
                    
                    target_noreg = k_baru['noreg']
                    cursor.execute("SELECT nama FROM regpasien WHERE noreg = %s", [target_noreg])
                    p_baru = cursor.fetchone()
                    nama_baru = p_baru['nama'] if p_baru else ''
                    
                    # Update farmasi
                    cursor.execute("UPDATE tran_apt SET no_kunj = %s, id_pasien = %s, nama = %s WHERE no = %s", 
                                  [target_kunj, target_noreg, nama_baru, apt_no])
                    cursor.execute("UPDATE item_tran_apt SET no_kunj = %s, noreg = %s WHERE no LIKE %s", 
                                  [target_kunj, target_noreg, f"{apt_no}%"])
                                  
                    # Recalculate both
                    recalculate_kunjung(cursor, old_kunj)
                    recalculate_kunjung(cursor, target_kunj)
                    
                    return Response({"message": "Resep berhasil dipindahkan"})
                
                elif action_type == 'toggle-lock':
                    no_kunj = request.data.get('no_kunj')
                    new_status = request.data.get('new_status') # 0 or 1
                    
                    if not no_kunj or new_status is None:
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    cursor.execute("UPDATE kunjung SET cek = %s WHERE no = %s", [new_status, no_kunj])
                    status_text = "Terkunci" if str(new_status) == '1' else "Terbuka"
                    return Response({"message": f"Status billing berhasil diubah menjadi {status_text}"})
                
                elif action_type == 'delete-item':
                    table = request.data.get('table')
                    item_no = request.data.get('item_no')
                    no_kunj = request.data.get('no_kunj')
                    
                    if not all([table, item_no, no_kunj]):
                        return Response({"error": "Missing parameters"}, status=400)
                        
                    if table == 'jasa':
                        cursor.execute("DELETE FROM tb_biaya_jasa WHERE no = %s", [item_no])
                    elif table == 'tindakan':
                        cursor.execute("DELETE FROM tb_biaya_tindakan WHERE no = %s", [item_no])
                    elif table == 'adm':
                        cursor.execute("DELETE FROM tb_biaya_adm WHERE no = %s", [item_no])
                    elif table == 'bhp':
                        cursor.execute("DELETE FROM tb_biaya_bhp WHERE no = %s", [item_no])
                    elif table == 'farmasi_item':
                        resep_no = item_no.rsplit('-', 1)[0] if '-' in item_no else item_no
                        cursor.execute("DELETE FROM item_tran_apt WHERE no = %s", [item_no])
                        cursor.execute("""
                            SELECT COALESCE(SUM(qty * harga), 0) as subtotal, 
                                   COALESCE(SUM(embalace), 0) as tot_emb 
                            FROM item_tran_apt WHERE no LIKE %s
                        """, [f"{resep_no}%"])
                        tot_res = cursor.fetchone()
                        subtotal = tot_res['subtotal'] if tot_res else 0
                        tot_emb = tot_res['tot_emb'] if tot_res else 0
                        if subtotal == 0:
                            cursor.execute("DELETE FROM tran_apt WHERE no = %s", [resep_no])
                        else:
                            cursor.execute("UPDATE tran_apt SET total = %s, embalace = %s WHERE no = %s", [subtotal, tot_emb, resep_no])
                    elif table in ['farmasi', 'farmasi_resep']:
                        cursor.execute("DELETE FROM item_tran_apt WHERE no LIKE %s", [f"{item_no}%"])
                        cursor.execute("DELETE FROM tran_apt WHERE no = %s", [item_no])
                    elif table == 'lab_item':
                        lab_no = item_no.rsplit('-', 1)[0] if '-' in item_no else item_no
                        cursor.execute("DELETE FROM item_tran_lab WHERE no = %s", [item_no])
                        cursor.execute("SELECT COALESCE(SUM((harga + bhp) * qty), 0) as tot FROM item_tran_lab WHERE no LIKE %s", [f"{lab_no}%"])
                        tot_res = cursor.fetchone()
                        tot_lab = tot_res['tot'] if tot_res else 0
                        if tot_lab == 0:
                            cursor.execute("DELETE FROM tran_lab WHERE no = %s", [lab_no])
                        else:
                            cursor.execute("UPDATE tran_lab SET total = %s WHERE no = %s", [tot_lab, lab_no])
                    elif table in ['lab', 'lab_resep', 'lab_header']:
                        cursor.execute("DELETE FROM item_tran_lab WHERE no LIKE %s", [f"{item_no}%"])
                        cursor.execute("DELETE FROM tran_lab WHERE no = %s", [item_no])
                    elif table == 'rad_item':
                        rad_no = item_no.rsplit('-', 1)[0] if '-' in item_no else item_no
                        cursor.execute("DELETE FROM item_tran_rad WHERE no = %s", [item_no])
                        cursor.execute("SELECT COALESCE(SUM((jasa_layan + bhp) * qty), 0) as tot FROM item_tran_rad WHERE no LIKE %s", [f"{rad_no}%"])
                        tot_res = cursor.fetchone()
                        tot_rad = tot_res['tot'] if tot_res else 0
                        if tot_rad == 0:
                            cursor.execute("DELETE FROM tran_rad WHERE no = %s", [rad_no])
                        else:
                            cursor.execute("UPDATE tran_rad SET total = %s WHERE no = %s", [tot_rad, rad_no])
                    elif table in ['rad', 'rad_resep', 'rad_header']:
                        cursor.execute("DELETE FROM item_tran_rad WHERE no LIKE %s", [f"{item_no}%"])
                        cursor.execute("DELETE FROM tran_rad WHERE no = %s", [item_no])
                    elif table == 'kamar':
                        cursor.execute("DELETE FROM tb_biaya_kamar WHERE no = %s", [item_no])
                    elif table == 'alat':
                        cursor.execute("DELETE FROM tb_biaya_alat WHERE no = %s", [item_no])
                    elif table == 'lainnya':
                        cursor.execute("DELETE FROM tb_biaya_lain2 WHERE no = %s", [item_no])
                    
                    recalculate_kunjung(cursor, no_kunj)
                    
                    return Response({"message": "Item berhasil dihapus"})
                
                else:
                    return Response({"error": "Unknown POST action"}, status=400)
                    
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=500)
        finally:
            if conn and conn != getattr(django_connection, 'connection', None):
                try:
                    conn.close()
                except Exception:
                    pass
