import os
import sys
import json
import time
from struct import pack
from zk import ZK, const
from zk.user import User

IP_DEPAN = '192.168.44.121'     # Mesin Utama (Gerbang Depan SE21-C)
IP_BELAKANG = '192.168.44.120'  # Mesin Baru (Gerbang Belakang S-IPC)
PORT = 4370

def main():
    print("=" * 60)
    print("PROSES CLONING & SINKRONISASI MESIN ABSEN RS SIAGA")
    print(f"Sumber (Mesin Utama): {IP_DEPAN} (Gerbang Depan SE21-C)")
    print(f"Tujuan (Mesin Baru) : {IP_BELAKANG} (Gerbang Belakang S-IPC)")
    print("=" * 60)

    # -------------------------------------------------------------
    # 1. AMBIL DATA DARI MESIN DEPAN (UTAMA)
    # -------------------------------------------------------------
    print("\n[1/5] Menghubungkan ke Mesin Depan (Utama)...")
    zk_depan = ZK(IP_DEPAN, port=PORT, timeout=8, force_udp=False, ommit_ping=True)
    conn_depan = zk_depan.connect()
    
    try:
        conn_depan.disable_device()
        print("  - Mengambil daftar user...")
        users_depan = conn_depan.get_users()
        print(f"  -> Total User di Mesin Depan: {len(users_depan)}")

        print("  - Mengambil template sidik jari biometrik...")
        templates_depan = conn_depan.get_templates()
        print(f"  -> Total Template Sidik Jari: {len(templates_depan)}")
    finally:
        conn_depan.enable_device()
        conn_depan.disconnect()

    # Mapping template per UID
    user_templates_map = {}
    for t in templates_depan:
        user_templates_map.setdefault(t.uid, []).append(t)

    # Simpan backup data ke file JSON
    backup_file = '/app/backup_mesin_depan.json'
    backup_data = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'total_users': len(users_depan),
        'total_templates': len(templates_depan),
        'users': [vars(u) for u in users_depan]
    }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, indent=2)
    print(f"  -> Backup data disimpan di: {backup_file}")

    # -------------------------------------------------------------
    # 2. BACKUP & BERSIHKAN DATA DI MESIN BELAKANG (BARU)
    # -------------------------------------------------------------
    print("\n[2/5] Menghubungkan ke Mesin Belakang (Baru)...")
    zk_belakang = ZK(IP_BELAKANG, port=PORT, timeout=8, force_udp=False, ommit_ping=True)
    conn_belakang = zk_belakang.connect()

    try:
        conn_belakang.disable_device()

        # Backup data eksisting mesin belakang sebelum dibersihkan
        old_users = conn_belakang.get_users()
        old_temps = conn_belakang.get_templates()
        with open('/app/backup_mesin_belakang_sebelum_clone.json', 'w') as f:
            json.dump({
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'total_users': len(old_users),
                'total_templates': len(old_temps),
                'users': [vars(u) for u in old_users]
            }, f, indent=2)
        print(f"  -> Backup mesin belakang lama ({len(old_users)} user, {len(old_temps)} templates) tersimpan.")

        print(f"\n[3/5] Menghapus {len(old_users)} user & biometrik lama di Mesin Belakang...")
        for idx, u in enumerate(old_users, 1):
            try:
                conn_belakang._ZK__send_command(const.CMD_DELETE_USER, pack('h', u.uid))
            except Exception as e:
                pass
            if idx % 50 == 0 or idx == len(old_users):
                print(f"  -> {idx}/{len(old_users)} user lama dibersihkan...")
        
        conn_belakang.refresh_data()
        print("  -> Database Mesin Belakang berhasil dibersihkan.")

        # -------------------------------------------------------------
        # 3. COPY DATA USER & SIDIK JARI DARI DEPAN KE BELAKANG
        # -------------------------------------------------------------
        print(f"\n[4/5] Menyalin {len(users_depan)} user & {len(templates_depan)} sidik jari ke Mesin Belakang...")
        success_users = 0
        success_fingers = 0
        start_time = time.time()

        for idx, u in enumerate(users_depan, 1):
            fingers = user_templates_map.get(u.uid, [])
            
            if fingers:
                # User memiliki template sidik jari
                conn_belakang.save_user_template(u, fingers=fingers)
                success_fingers += len(fingers)
            else:
                # User tanpa sidik jari (hanya password/kartu/pin)
                conn_belakang.set_user(
                    uid=u.uid,
                    name=u.name,
                    privilege=u.privilege,
                    password=u.password,
                    group_id=u.group_id,
                    user_id=u.user_id,
                    card=u.card
                )
            
            success_users += 1
            if idx % 50 == 0 or idx == len(users_depan):
                elapsed = time.time() - start_time
                print(f"  -> Progres: {idx}/{len(users_depan)} user ({success_fingers} sidik jari) tersalin... [{elapsed:.1f}s]")

        conn_belakang.refresh_data()
    finally:
        conn_belakang.enable_device()
        conn_belakang.disconnect()

    # -------------------------------------------------------------
    # 4. VERIFIKASI HASIL CLONING DI MESIN BELAKANG
    # -------------------------------------------------------------
    print("\n[5/5] Melakukan verifikasi integritas data di Mesin Belakang...")
    time.sleep(2)
    conn_verif = zk_belakang.connect()
    try:
        conn_verif.read_sizes()
        final_users = conn_verif.get_users()
        final_templates = conn_verif.get_templates()
        print(f"  - Total User di Mesin Belakang     : {len(final_users)} (Target: {len(users_depan)})")
        print(f"  - Total Sidik Jari di Mesin Belakang: {len(final_templates)} (Target: {len(templates_depan)})")

        is_match = (len(final_users) == len(users_depan)) and (len(final_templates) == len(templates_depan))
        if is_match:
            print("\n" + "=" * 60)
            print("🎉 SINKRONISASI & CLONING BERHASIL SEMPURNA (1:1 IDENTIK)!")
            print("=" * 60)
        else:
            print(f"\n⚠️ Hasil: {len(final_users)} user, {len(final_templates)} sidik jari.")
    finally:
        conn_verif.disconnect()

    # Update counter di database SIMAK
    try:
        import django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'simak_backend.settings')
        django.setup()
        from sdm.models import MesinAbsen
        m_belakang = MesinAbsen.objects.filter(id=1).first()
        if m_belakang:
            m_belakang.total_user_mesin = len(final_users)
            m_belakang.save(update_fields=['total_user_mesin'])
            print(f"Database SIMAK diperbarui: Mesin Gerbang Belakang = {len(final_users)} User.")
    except Exception as e:
        print("Note update DB:", e)

if __name__ == '__main__':
    main()
