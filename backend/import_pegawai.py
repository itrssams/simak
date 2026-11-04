import sys
import openpyxl
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from sdm.models import Pegawai, KaryawanMesinMapping, LogPresensi, PresensiHarian

User = get_user_model()

def run_import(dry_run=True):
    excel_path = '/app/excel_oktober.xlsm'
    print(f"=== {'DRY-RUN' if dry_run else 'EXECUTING'} IMPORT PEGAWAI FROM EXCEL ===")
    
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    
    # 1. Parse MASTER
    ws_m = wb['MASTER']
    employees = {}
    for r in list(ws_m.iter_rows(values_only=True))[8:]:
        kat = str(r[0]).strip() if r[0] is not None else ''
        no = r[1]
        pin = str(r[2]).strip() if r[2] is not None else ''
        nama = str(r[3]).strip() if r[3] is not None else ''
        nik = str(r[4]).strip() if r[4] is not None else ''
        jab = str(r[5]).strip() if r[5] is not None else ''
        
        if nama and not nama.startswith('=') and jab not in ['P', 'P1', 'P2', 'S', 'M', 'L']:
            if pin and pin != 'None':
                u_lower = (jab).lower()
                if 'clearning' in u_lower or 'cs' in u_lower or 'kebersihan' in u_lower:
                    kategori_code = 'CS'
                elif 'security' in u_lower or 'driver' in u_lower or 'satpam' in u_lower:
                    kategori_code = 'SECURITY_DRIVER'
                elif 'rohani' in u_lower:
                    kategori_code = 'MITRA'
                elif kat.upper() == 'NON SHIFT' or jab in ['Direksi', 'Manajer', 'SDM', 'Keuangan', 'IT', 'IPSRS', 'Umum']:
                    kategori_code = 'NON_SHIFT'
                else:
                    kategori_code = 'SHIFT'
                    
                employees[pin] = {
                    'pin': pin,
                    'nama': nama,
                    'nik': nik if (nik and nik != '0' and nik != 'None') else '',
                    'unit_kerja': jab,
                    'jabatan': jab,
                    'kategori': kategori_code,
                    'source': 'MASTER'
                }
                
    # 2. Parse Data Karyawan for any extra staff
    ws_dk = wb['Data Karyawan']
    for r in list(ws_dk.iter_rows(values_only=True))[5:]:
        pin = str(r[0]).strip() if r[0] is not None else ''
        nama = str(r[1]).strip() if r[1] is not None else ''
        unit = str(r[2]).strip() if r[2] is not None else ''
        
        if pin and pin != 'None' and nama and nama != 'None':
            if pin not in employees:
                u_lower = (unit).lower()
                if 'cs' in u_lower or 'kebersihan' in u_lower:
                    kategori_code = 'CS'
                elif 'keamanan' in u_lower or 'security' in u_lower or 'driver' in u_lower or 'transportasi' in u_lower:
                    kategori_code = 'SECURITY_DRIVER'
                else:
                    kategori_code = 'SHIFT'
                employees[pin] = {
                    'pin': pin,
                    'nama': nama,
                    'nik': '',
                    'unit_kerja': unit if unit and unit != 'None' else 'Umum',
                    'jabatan': unit if unit and unit != 'None' else 'Staf',
                    'kategori': kategori_code,
                    'source': 'Data Karyawan'
                }
                
    print(f"Total Pegawai ditemukan di Excel: {len(employees)}")
    
    # 3. Match with existing Users in DB cleanly (strictly 1 user -> at most 1 pegawai)
    # Known primary PIN mappings for existing users
    PRIMARY_USER_PIN = {
        'fasa': '4',
        'saleh': '2',
        'edy': '103',
        'elok': '107',
        'fauzi': '108',
        'muly': '109',
        'mela': '202',
        'evi': '210',
        'febry': '1409',
        'rina': '339',
        'ulfa': '336',
        'suyitno': '14011',
        'nevi': '260219',
        'erfandi': '2405',
        'nena': '70027',
        'hasanuddin': '1704',
        'natasya': '250201',
        'dini': '1008',
    }
    
    assigned_user_ids = set()
    matched_users = 0
    
    for pin, data in employees.items():
        matched_user = None
        # Check primary PIN mapping first
        for username, p_pin in PRIMARY_USER_PIN.items():
            if pin == p_pin:
                try:
                    u = User.objects.get(username=username)
                    if u.id not in assigned_user_ids:
                        matched_user = u
                        assigned_user_ids.add(u.id)
                except User.DoesNotExist:
                    pass
                break
                
        # If not matched, try exact full_name match
        if not matched_user:
            clean_nama = data['nama'].strip().lower()
            for u in User.objects.all():
                if u.id in assigned_user_ids:
                    continue
                ufn = u.get_full_name().strip().lower()
                if ufn and (ufn == clean_nama or (len(ufn) > 5 and ufn in clean_nama)):
                    matched_user = u
                    assigned_user_ids.add(u.id)
                    break
                    
        data['matched_user'] = matched_user
        if matched_user:
            matched_users += 1
            
    print(f"Pegawai yang terhubung ke akun User SIMAK: {matched_users}")
    print(f"Pegawai profil murni (tanpa login): {len(employees) - matched_users}")
    
    kats = {}
    for d in employees.values():
        kats[d['kategori']] = kats.get(d['kategori'], 0) + 1
    print(f"Rincian Kategori: {kats}")
    
    if dry_run:
        print("\n[DRY RUN SELESAI] Jalankan dengan --commit untuk menyimpan ke DB.")
        return
        
    # Execute Real DB writes inside atomic transaction
    from django.db import transaction
    with transaction.atomic():
        created_count = 0
        updated_count = 0
        pegawai_by_pin = {}
        
        for pin, data in employees.items():
            pegawai, created = Pegawai.objects.update_or_create(
                pin=pin,
                defaults={
                    'nama': data['nama'],
                    'nik': data['nik'],
                    'jabatan': data['jabatan'],
                    'unit_kerja': data['unit_kerja'],
                    'kategori': data['kategori'],
                    'user': data['matched_user'],
                    'is_active': True
                }
            )
            pegawai_by_pin[pin] = pegawai
            if created:
                created_count += 1
            else:
                updated_count += 1
                
        print(f"\n[HASIL DB] Pegawai baru dibuat: {created_count}, Pegawai diupdate: {updated_count}")
        
        # Link KaryawanMesinMapping
        mapping_updated = 0
        for mapping in KaryawanMesinMapping.objects.all():
            if mapping.pin in pegawai_by_pin:
                p = pegawai_by_pin[mapping.pin]
                mapping.pegawai = p
                # If mapping has no user but pegawai has user, link it
                mapping.user = p.user
                mapping.save(update_fields=['pegawai', 'user'])
                mapping_updated += 1
        print(f"[HASIL DB] KaryawanMesinMapping terhubung: {mapping_updated}")
        
        # Link LogPresensi
        log_updated = 0
        for log in LogPresensi.objects.all():
            if log.pin in pegawai_by_pin:
                p = pegawai_by_pin[log.pin]
                log.pegawai = p
                log.user = p.user
                log.save(update_fields=['pegawai', 'user'])
                log_updated += 1
        print(f"[HASIL DB] LogPresensi terhubung: {log_updated}")
        
        # Link PresensiHarian
        ph_updated = 0
        for ph in PresensiHarian.objects.all():
            if ph.user and hasattr(ph.user, 'profil_pegawai') and ph.user.profil_pegawai:
                ph.pegawai = ph.user.profil_pegawai
                ph.save(update_fields=['pegawai'])
                ph_updated += 1
        print(f"[HASIL DB] PresensiHarian terhubung: {ph_updated}")
        
    print("=== IMPORT BERHASIL 100% ===")

if __name__ == '__main__':
    dry = '--commit' not in sys.argv
    run_import(dry_run=dry)
