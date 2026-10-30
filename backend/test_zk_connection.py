import sys
from zk import ZK

def test_connection(ip='192.168.44.120', port=4370):
    print(f"Mencoba menghubungkan ke mesin absen di {ip}:{port}...")
    zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        print(">> BERHASIL TERHUBUNG KE MESIN ABSEN! <<")
        
        # Cek info mesin
        try:
            device_name = conn.get_device_name()
            serial_number = conn.get_serialnumber()
            mac = conn.get_mac()
            print(f"Device Name: {device_name}")
            print(f"Serial Number: {serial_number}")
            print(f"MAC Address: {mac}")
        except Exception as e:
            print("Info dasar:", e)

        # Cek daftar user
        users = conn.get_users()
        print(f"\nTotal User Terdaftar di Mesin: {len(users)}")
        for u in users[:5]:
            print(f"  - UID: {u.uid}, UserID (PIN): {u.user_id}, Name: {u.name}, Privilege: {u.privilege}")

        # Cek log absensi
        attendances = conn.get_attendance()
        print(f"\nTotal Log Absensi Tersimpan: {len(attendances)}")
        for att in attendances[-5:]:
            print(f"  - UserID: {att.user_id}, Waktu: {att.timestamp}, Status: {att.status}, Punch: {att.punch}")

    except Exception as e:
        print(f">> GAGAL KONEK: {e}")
    finally:
        if conn:
            conn.disconnect()
            print("\nKoneksi ditutup.")

if __name__ == '__main__':
    target_ip = sys.argv[1] if len(sys.argv) > 1 else '192.168.44.120'
    test_connection(target_ip)

