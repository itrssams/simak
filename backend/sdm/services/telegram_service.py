import os
import time
import threading
import logging
import requests
import datetime
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

DEFAULT_BOT_TOKEN = '8654069034:AAHbdAo-sYyixpgWVN42dU0YGPmVjxxSx2s'
DEFAULT_BOT_USERNAME = 'simak_rssiaga_bot'

DEFAULT_SDM_BOT_TOKEN = '8407492016:AAGY1LgVCLLQm5LYmr0wbZypTK1D9Mys7uA'
DEFAULT_SDM_BOT_USERNAME = 'simak_sdm_bot'

HARI_MAP = {
    0: 'Senin', 1: 'Selasa', 2: 'Rabu', 3: 'Kamis',
    4: 'Jumat', 5: 'Sabtu', 6: 'Minggu'
}

BULAN_MAP = {
    1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
    5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember'
}


def get_telegram_bot_token():
    return getattr(settings, 'TELEGRAM_BOT_TOKEN', None) or os.getenv('TELEGRAM_BOT_TOKEN', DEFAULT_BOT_TOKEN)


def get_telegram_bot_username():
    return getattr(settings, 'TELEGRAM_BOT_USERNAME', None) or os.getenv('TELEGRAM_BOT_USERNAME', DEFAULT_BOT_USERNAME)


def get_sdm_bot_token():
    return getattr(settings, 'TELEGRAM_SDM_BOT_TOKEN', None) or os.getenv('TELEGRAM_SDM_BOT_TOKEN', DEFAULT_SDM_BOT_TOKEN)


def get_sdm_bot_username():
    return getattr(settings, 'TELEGRAM_SDM_BOT_USERNAME', None) or os.getenv('TELEGRAM_SDM_BOT_USERNAME', DEFAULT_SDM_BOT_USERNAME)


def send_telegram_message(chat_id, text, parse_mode='HTML', bot_token=None):
    """
    Mengirim pesan langsung ke Telegram Chat ID via Bot API (Synchronous).
    mendukung bot_token spesifik (misal: bot utama atau bot SDM).
    """
    token = bot_token or get_telegram_bot_token()
    if not token or not chat_id:
        return False, "Token atau Chat ID tidak tersedia"

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        'chat_id': str(chat_id).strip(),
        'text': text,
        'parse_mode': parse_mode,
        'disable_web_page_preview': True,
    }

    try:
        res = requests.post(url, json=payload, timeout=6)
        data = res.json()
        if res.status_code == 200 and data.get('ok'):
            return True, data.get('result')
        return False, data.get('description', f"HTTP {res.status_code}")
    except Exception as e:
        logger.warning(f"[TelegramService] Gagal kirim pesan ke {chat_id}: {str(e)}")
        return False, str(e)


def send_telegram_message_async(chat_id, text, parse_mode='HTML', bot_token=None):
    """
    Mengirim pesan Telegram di background thread terpisah (Non-blocking).
    """
    thread = threading.Thread(
        target=send_telegram_message,
        args=(chat_id, text, parse_mode, bot_token),
        daemon=True
    )
    thread.start()
    return thread


def format_tanggal_indo(dt):
    if not dt:
        dt = timezone.localtime(timezone.now())
    hari = HARI_MAP.get(dt.weekday(), '')
    bulan = BULAN_MAP.get(dt.month, '')
    return f"{hari}, {dt.day:02d} {bulan} {dt.year}"


def format_presensi_masuk(pegawai_nama, waktu_tap, shift_nama=None, status='hadir', menit_terlambat=0, mesin_nama='Mesin Absen'):
    waktu_local = timezone.localtime(waktu_tap) if waktu_tap else timezone.localtime(timezone.now())
    tgl_str = format_tanggal_indo(waktu_local)
    jam_str = waktu_local.strftime('%H:%M:%S WITA')

    if menit_terlambat and menit_terlambat > 0:
        status_text = f"⚠️ Terlambat (+{menit_terlambat} Menit)"
    elif status == 'hadir':
        status_text = "⚡ Tepat Waktu (Hadir)"
    else:
        status_text = f"ℹ️ {status.replace('_', ' ').capitalize()}"

    msg = (
        "✅ <b>Presensi Masuk Berhasil Dicatat</b>\n\n"
        f"Halo, <b>{pegawai_nama}</b>!\n"
        "Presensi kehadiran Anda telah diverifikasi oleh sistem SIMAK RS Siaga.\n\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 <b>Tanggal:</b> {tgl_str}\n"
        f"⏰ <b>Waktu Tap:</b> {jam_str}\n"
        f"🏢 <b>Shift:</b> {shift_nama or 'Shift Terjadwal'}\n"
        f"📍 <b>Mesin / Lokasi:</b> {mesin_nama}\n"
        f"⚡ <b>Status:</b> {status_text}\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "<i>Semoga harimu menyenangkan dan lancar bertugas! 🙏</i>"
    )
    return msg


def format_presensi_pulang(pegawai_nama, waktu_tap, shift_nama=None, durasi_kerja_jam=None, mesin_nama='Mesin Absen'):
    waktu_local = timezone.localtime(waktu_tap) if waktu_tap else timezone.localtime(timezone.now())
    tgl_str = format_tanggal_indo(waktu_local)
    jam_str = waktu_local.strftime('%H:%M:%S WITA')

    if durasi_kerja_jam is not None:
        durasi_str = f"{float(durasi_kerja_jam):.1f} Jam"
    else:
        durasi_str = "-"

    msg = (
        "🚪 <b>Presensi Pulang Berhasil Dicatat</b>\n\n"
        f"Halo, <b>{pegawai_nama}</b>!\n"
        "Presensi kepulangan Anda telah tercatat dengan aman di SIMAK RS Siaga.\n\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 <b>Tanggal:</b> {tgl_str}\n"
        f"⏰ <b>Waktu Tap:</b> {jam_str}\n"
        f"🏢 <b>Shift:</b> {shift_nama or 'Shift Terjadwal'}\n"
        f"⏳ <b>Durasi Jam Kerja:</b> {durasi_str}\n"
        f"📍 <b>Mesin / Lokasi:</b> {mesin_nama}\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "<i>Terima kasih atas dedikasi dan kerja keras Anda hari ini. Hati-hati di jalan dan selamat beristirahat! 🌟</i>"
    )
    return msg


def notify_presensi_telegram(pegawai, waktu_tap, tipe='masuk', presensi_harian=None, mesin_nama='Mesin Absen'):
    """
    Fungsi pemicu notifikasi presensi otomatis via Telegram ke pegawai yang bersangkutan.
    """
    if not pegawai:
        return False

    chat_id = getattr(pegawai, 'telegram_chat_id', None)
    if not chat_id and pegawai.user and hasattr(pegawai.user, 'telegram_chat_id'):
        chat_id = pegawai.user.telegram_chat_id

    if not chat_id:
        return False

    is_aktif = getattr(pegawai, 'telegram_notif_aktif', True)
    if not is_aktif:
        return False

    pegawai_nama = pegawai.nama or (pegawai.user.get_full_name() if pegawai.user else 'Pegawai')
    shift_nama = None
    status = 'hadir'
    menit_terlambat = 0
    durasi_jam = None

    if presensi_harian:
        if presensi_harian.shift:
            shift_nama = presensi_harian.shift.nama
        status = presensi_harian.status or 'hadir'
        menit_terlambat = getattr(presensi_harian, 'menit_keterlambatan', 0) or 0
        durasi_jam = getattr(presensi_harian, 'total_jam_kerja', None)

    if tipe == 'pulang':
        text = format_presensi_pulang(pegawai_nama, waktu_tap, shift_nama, durasi_jam, mesin_nama)
    else:
        text = format_presensi_masuk(pegawai_nama, waktu_tap, shift_nama, status, menit_terlambat, mesin_nama)

    send_telegram_message_async(chat_id, text)
    return True


# ==============================================================================
# TEMBUSAN REKONSILIASI PRESENSI KHUSUS SDM (RADIOLOGI & TESTING)
# ==============================================================================

DEFAULT_SDM_TEMBUSAN_CHAT_IDS = ['8912439956']  # Pak Muhammad Saleh (SDM)


def get_sdm_tembusan_chat_ids():
    """
    Mengambil daftar Telegram Chat ID penerima tembusan rekonsiliasi presensi SDM.
    """
    ids = list(DEFAULT_SDM_TEMBUSAN_CHAT_IDS)
    extra = getattr(settings, 'TELEGRAM_SDM_TEMBUSAN_CHAT_IDS', None) or os.getenv('TELEGRAM_SDM_TEMBUSAN_CHAT_IDS')
    if extra:
        if isinstance(extra, str):
            extra = [x.strip() for x in extra.split(',') if x.strip()]
        for x in extra:
            if x not in ids:
                ids.append(x)
    return ids


def is_monitored_for_sdm_tembusan(pegawai):
    """
    Mengecek apakah pegawai masuk dalam radar pemantauan tembusan SDM
    (Semua staf Radiologi, dan Mas Fasa PIN 1000 untuk pengujian sementara).
    """
    if not pegawai:
        return False

    pin_str = str(getattr(pegawai, 'pin', '') or '').strip()

    # 1. Testing spesifik: Mas Fasa (PIN 1000) disimulasikan sebagai Radiologi
    if pin_str == '1000':
        return True

    # 2. PIN Staf Radiologi Resmi RS Siaga
    radiologi_pins = {'0283', '1101', '1119', '1120', '1121', '338'}
    if pin_str in radiologi_pins:
        return True

    # 3. Unit Kerja atau Jabatan yang mengandung kata 'radiologi'
    unit = str(getattr(pegawai, 'unit_kerja', '') or '').lower()
    jabatan = str(getattr(pegawai, 'jabatan', '') or '').lower()
    if 'radiologi' in unit or 'radiologi' in jabatan:
        return True

    return False


def format_tembusan_sdm(pegawai_nama, pin, unit_kerja, waktu_tap, shift_nama=None, status='hadir', menit_terlambat=0, tipe='masuk', mesin_nama='Mesin Absen'):
    """
    Format pesan audit rekonsiliasi presensi khusus untuk Tim SDM (Pak Saleh).
    """
    waktu_local = timezone.localtime(waktu_tap) if waktu_tap else timezone.localtime(timezone.now())
    tgl_str = format_tanggal_indo(waktu_local)
    jam_str = waktu_local.strftime('%H:%M:%S WITA')

    if menit_terlambat and menit_terlambat > 0:
        status_text = f"⚠️ Terlambat (+{menit_terlambat} Menit)"
    elif status == 'hadir':
        status_text = "🟢 Tepat Waktu (Hadir)"
    elif status == 'pulang_cepat':
        status_text = "🟡 Pulang Cepat"
    else:
        status_text = f"ℹ️ {status.replace('_', ' ').capitalize()}"

    tipe_label = "🟢 TAP MASUK" if tipe == 'masuk' else "🔴 TAP PULANG"

    # Tandai jika Fasa (sedang mode simulasi testing)
    simulasi_badge = " <i>(Simulasi Pengujian)</i>" if str(pin).strip() == '1000' else ""

    unit_display = unit_kerja or ('RADIOLOGI (Testing)' if str(pin).strip() == '1000' else 'RADIOLOGI')

    msg = (
        "📋 <b>[TEMBUSAN SDM] Rekonsiliasi Presensi Unit</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>Pegawai:</b> {pegawai_nama}{simulasi_badge}\n"
        f"🔢 <b>PIN Mesin:</b> #{pin}\n"
        f"🏢 <b>Unit Kerja:</b> {unit_display}\n"
        f"📅 <b>Tanggal:</b> {tgl_str}\n"
        f"⏰ <b>Waktu Tap:</b> <code>{jam_str}</code> <i>(Realtime)</i>\n"
        f"📍 <b>Mesin:</b> {mesin_nama}\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"🏢 <b>Shift:</b> {shift_nama or 'Shift Normal'}\n"
        f"⚡ <b>Status:</b> {status_text}\n"
        f"🔄 <b>Aksi:</b> {tipe_label}\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "ℹ️ <i>Data tercatat otomatis detik ini dari mesin fisik untuk arsip rekonsiliasi SDM RS Siaga.</i>"
    )
    return msg


def notify_sdm_tembusan(pegawai, waktu_tap, tipe='masuk', presensi_harian=None, mesin_nama='Mesin Absen'):
    """
    Mengirimkan pesan tembusan rekonsiliasi ke SDM (Pak Saleh & Admin SDM).
    """
    if not pegawai:
        return False

    recipients = get_sdm_tembusan_chat_ids()
    if not recipients:
        return False

    pegawai_nama = pegawai.nama or 'Pegawai'
    pin = pegawai.pin or '-'
    unit = pegawai.unit_kerja or 'RADIOLOGI'
    shift_nama = None
    status = 'hadir'
    menit_terlambat = 0

    if presensi_harian:
        if presensi_harian.shift:
            shift_nama = presensi_harian.shift.nama
        status = presensi_harian.status or 'hadir'
        menit_terlambat = getattr(presensi_harian, 'menit_keterlambatan', 0) or 0

    text = format_tembusan_sdm(
        pegawai_nama=pegawai_nama,
        pin=pin,
        unit_kerja=unit,
        waktu_tap=waktu_tap,
        shift_nama=shift_nama,
        status=status,
        menit_terlambat=menit_terlambat,
        tipe=tipe,
        mesin_nama=mesin_nama
    )

    sdm_token = get_sdm_bot_token()

    for cid in recipients:
        send_telegram_message_async(cid, text, bot_token=sdm_token)

    return True


# ==============================================================================
# TELEGRAM BOT INTERACTIVE COMMAND HANDLER (Long-Polling Support)
# ==============================================================================

def handle_bot_command(chat_id, username, text, first_name=""):
    """
    Menangani pesan masuk dari user di Telegram Bot:
    - /start
    - /hubungkan <PIN>
    - /status atau /hariini
    - /putus
    - /bantuan
    """
    from ..models import Pegawai, PresensiHarian

    text = (text or '').strip()
    if not text:
        return

    try:
        parts = text.split()
        cmd = parts[0].lower() if parts else ''
        args = parts[1:] if len(parts) > 1 else []

        # Normalisasi command (hapus @username_bot jika ada, misal /start@simak_rssiaga_bot)
        if '@' in cmd:
            cmd = cmd.split('@')[0]

        chat_id_str = str(chat_id).strip()

        # Cari pegawai yang sudah terhubung dengan chat_id ini
        pegawai = Pegawai.objects.filter(telegram_chat_id=chat_id_str, is_active=True).first()

        if cmd in ['/start', 'start']:
            if pegawai:
                reply = (
                    f"🎉 <b>Halo, {pegawai.nama}!</b>\n\n"
                    f"Akun Telegram Anda saat ini <b>sudah terhubung</b> dengan data kepegawaian SIMAK RS Siaga.\n\n"
                    f"• <b>PIN Mesin:</b> #{pegawai.pin}\n"
                    f"• <b>Status Notifikasi:</b> {'Aktif ✅' if pegawai.telegram_notif_aktif else 'Nonaktif ❌'}\n\n"
                    "<b>Menu Perintah:</b>\n"
                    "• /status - Cek status kehadiran hari ini\n"
                    "• /bantuan - Informasi bantuan bot\n"
                    "• /putus - Putuskan tautan akun dari bot ini"
                )
            else:
                reply = (
                    f"👋 <b>Selamat datang di Bot SIMAK RS Siaga!</b>\n\n"
                    f"ID Telegram Anda adalah: <code>{chat_id_str}</code>\n\n"
                    "Untuk menerima notifikasi otomatis setiap kali Anda tap di mesin sidik jari/wajah, hubungkan akun dengan mengetik:\n\n"
                    "<code>/hubungkan &lt;PIN_MESIN&gt;</code>\n\n"
                    "<i>Contoh:</i> <code>/hubungkan 1000</code>\n"
                    "<i>(Gunakan nomor PIN yang biasa Anda pakai saat absensi)</i>"
                )
            send_telegram_message(chat_id, reply)

        elif cmd in ['/hubungkan', 'hubungkan', '/connect']:
            if not args:
                reply = (
                    "⚠️ <b>Format Perintah Salah</b>\n\n"
                    "Ketik: <code>/hubungkan &lt;PIN_MESIN&gt;</code>\n"
                    "Contoh: <code>/hubungkan 1000</code>"
                )
                send_telegram_message(chat_id, reply)
                return

            input_pin = args[0].strip()
            # Cari pegawai berdasarkan PIN (dukung varian exact, stripped, zfill)
            target = Pegawai.objects.filter(pin=input_pin, is_active=True).first()
            if not target:
                target = Pegawai.objects.filter(pin=input_pin.lstrip('0'), is_active=True).first()
            if not target:
                target = Pegawai.objects.filter(pin=input_pin.zfill(3), is_active=True).first()
            if not target:
                target = Pegawai.objects.filter(pin=input_pin.zfill(4), is_active=True).first()

            if not target:
                reply = (
                    f"❌ <b>PIN #{input_pin} tidak ditemukan</b> di direktori pegawai SIMAK RS Siaga.\n\n"
                    "Pastikan PIN yang Anda masukkan sama dengan nomor PIN ID di mesin absen RS Siaga."
                )
                send_telegram_message(chat_id, reply)
                return

            # =========================================================================
            # ATURAN 1-to-1: PROTEKSI KETAT SATU TELEGRAM = SATU PIN PEGAWAI
            # =========================================================================

            # Proteksi 1: Cek apakah akun Telegram ini SUDAH terhubung ke pegawai lain
            if pegawai:
                if str(pegawai.id) == str(target.id) or str(pegawai.pin).strip() == str(target.pin).strip():
                    reply = (
                        f"ℹ️ <b>Akun Sudah Terhubung</b>\n\n"
                        f"Akun Telegram Anda saat ini memang sudah terhubung dengan data <b>{pegawai.nama}</b> (PIN #{pegawai.pin}).\n\n"
                        "Tidak perlu menghubungkan ulang. Notifikasi presensi Anda sudah aktif! ✅"
                    )
                    send_telegram_message(chat_id, reply)
                    return
                else:
                    reply = (
                        f"⚠️ <b>Akun Telegram Anda Sudah Terhubung ke Pegawai Lain</b>\n\n"
                        f"Akun ini saat ini masih terdaftar atas nama <b>{pegawai.nama}</b> (PIN #{pegawai.pin}).\n\n"
                        "Untuk alasan keamanan dan integritas presensi, <b>satu akun Telegram hanya boleh terhubung ke 1 data pegawai</b>.\n\n"
                        f"Jika Anda ingin berganti ke PIN #{target.pin}, silakan ketik <code>/putus</code> terlebih dahulu untuk memutuskan tautan lama."
                    )
                    send_telegram_message(chat_id, reply)
                    return

            # Proteksi 2: Cek apakah PIN TARGET SUDAH terhubung ke akun Telegram orang lain
            if target.telegram_chat_id and str(target.telegram_chat_id).strip() != chat_id_str:
                reply = (
                    f"⛔ <b>PIN #{target.pin} Sudah Terhubung ke Akun Lain</b>\n\n"
                    f"Data pegawai atas nama <b>{target.nama}</b> sudah ditautkan dengan akun Telegram lain.\n\n"
                    "Untuk melindungi privasi absensi, <b>satu nomor PIN tidak dapat diklaim oleh lebih dari satu akun Telegram</b>.\n\n"
                    "Jika ini adalah data Anda dan Anda baru berganti akun/nomor Telegram, silakan hubungi <b>Tim SDM RS Siaga</b> untuk mereset tautan akun Anda."
                )
                send_telegram_message(chat_id, reply)
                return

            # Bersihkan riwayat chat_id ini jika ada di pegawai lain (menjaga konsistensi 1-to-1)
            Pegawai.objects.filter(telegram_chat_id=chat_id_str).exclude(id=target.id).update(
                telegram_chat_id=None,
                telegram_username=None,
                telegram_notif_aktif=False
            )

            target.telegram_chat_id = chat_id_str
            target.telegram_username = f"@{username}" if username else ''
            target.telegram_notif_aktif = True
            target.save(update_fields=['telegram_chat_id', 'telegram_username', 'telegram_notif_aktif'])

            jabatan_str = str(target.jabatan).strip() if target.jabatan else ''
            unit_str = str(target.unit_kerja).strip() if target.unit_kerja else ''
            if jabatan_str and unit_str and jabatan_str.lower() != unit_str.lower():
                jabatan_nama = f"{jabatan_str} ({unit_str})"
            else:
                jabatan_nama = jabatan_str or unit_str or '-'

            reply = (
                "🎉 <b>Berhasil Terhubung!</b>\n\n"
                f"Halo, <b>{target.nama}</b>!\n"
                "Akun Telegram Anda kini resmi terdaftar untuk menerima notifikasi presensi otomatis SIMAK RS Siaga.\n\n"
                f"• <b>PIN Absen:</b> #{target.pin}\n"
                f"• <b>Jabatan:</b> {jabatan_nama}\n"
                f"• <b>Notifikasi:</b> Aktif ✅\n\n"
                "Setiap kali Anda tap di mesin sidik jari/wajah RS Siaga, Anda akan langsung menerima laporan kehadiran. 🙏"
            )
            send_telegram_message(chat_id, reply)

        elif cmd in ['/status', 'status', '/presensi', '/hariini']:
            if not pegawai:
                reply = (
                    "⚠️ <b>Akun Belum Terhubung</b>\n\n"
                    "Silakan hubungkan akun Telegram Anda terlebih dahulu dengan perintah:\n"
                    "<code>/hubungkan &lt;PIN_MESIN&gt;</code>"
                )
                send_telegram_message(chat_id, reply)
                return

            today = timezone.localdate()
            presensi = PresensiHarian.objects.filter(pegawai=pegawai, tanggal=today).first()
            tgl_str = format_tanggal_indo(timezone.localtime(timezone.now()))

            if not presensi or (not presensi.jam_masuk and not presensi.jam_pulang):
                reply = (
                    f"📅 <b>Presensi Hari Ini: {tgl_str}</b>\n\n"
                    f"Pegawai: <b>{pegawai.nama}</b>\n"
                    "Status: <i>Belum ada catatan tap mesin presensi hari ini.</i>"
                )
            else:
                masuk_str = presensi.jam_masuk.strftime('%H:%M:%S WITA') if presensi.jam_masuk else '-'
                pulang_str = presensi.jam_pulang.strftime('%H:%M:%S WITA') if presensi.jam_pulang else '<i>(Belum Tap Pulang)</i>'
                durasi_str = f"{float(presensi.total_jam_kerja):.1f} Jam" if presensi.total_jam_kerja else "-"
                shift_str = presensi.shift.nama if presensi.shift else 'Shift Normal'

                telat_info = ""
                if presensi.menit_keterlambatan and presensi.menit_keterlambatan > 0:
                    telat_info = f" (Terlambat +{presensi.menit_keterlambatan}m)"

                reply = (
                    f"📊 <b>Status Presensi Hari Ini</b>\n"
                    f"Pegawai: <b>{pegawai.nama}</b>\n"
                    f"📅 Tanggal: {tgl_str}\n\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    f"🏢 <b>Shift:</b> {shift_str}\n"
                    f"🟢 <b>Tap Masuk:</b> {masuk_str}{telat_info}\n"
                    f"🔴 <b>Tap Pulang:</b> {pulang_str}\n"
                    f"⏳ <b>Durasi Kerja:</b> {durasi_str}\n"
                    f"⚡ <b>Status Akhir:</b> {presensi.status.upper()}\n"
                    "━━━━━━━━━━━━━━━━━━━━"
                )
            send_telegram_message(chat_id, reply)

        elif cmd in ['/putus', 'putus', '/disconnect']:
            if pegawai:
                pegawai.telegram_chat_id = None
                pegawai.telegram_username = None
                pegawai.telegram_notif_aktif = False
                pegawai.save(update_fields=['telegram_chat_id', 'telegram_username', 'telegram_notif_aktif'])
                reply = "🔌 Tautan akun Telegram Anda ke SIMAK RS Siaga telah berhasil diputuskan."
            else:
                reply = "Akun Telegram Anda memang belum terhubung dengan data SIMAK."
            send_telegram_message(chat_id, reply)

        elif cmd in ['/bantuan', 'bantuan', '/help', 'help']:
            reply = (
                "🤖 <b>Bantuan Bot SIMAK RS Siaga</b>\n\n"
                "Daftar Perintah:\n"
                "• <code>/start</code> - Memulai bot dan cek status tautan\n"
                "• <code>/hubungkan &lt;PIN&gt;</code> - Hubungkan akun Telegram dengan PIN mesin absen Anda\n"
                "• <code>/status</code> - Melihat catatan presensi hari ini secara real-time\n"
                "• <code>/putus</code> - Memutuskan tautan akun Telegram dari SIMAK\n"
                "• <code>/bantuan</code> - Menampilkan panduan ini"
            )
            send_telegram_message(chat_id, reply)
    except Exception as err:
        logger.exception(f"[TelegramBot] Error handling command '{text}' from {chat_id}: {err}")
        send_telegram_message(chat_id, "⚠️ Terjadi kesalahan saat memproses permintaan. Silakan coba kembali.")


_POLLING_RUNNING = False

def start_telegram_bot_listener():
    """
    Menjalankan background daemon listener untuk memproses perintah user di Telegram Bot
    menggunakan getUpdates (Long Polling). Berjalan non-blocking tanpa mengganggu Django server.
    """
    global _POLLING_RUNNING
    if _POLLING_RUNNING:
        return
    _POLLING_RUNNING = True

    def _worker():
        logger.info("[TelegramBotListener] Memulai Telegram Bot Long Polling...")
        last_update_id = 0
        while True:
            token = get_telegram_bot_token()
            if not token:
                time.sleep(10)
                continue

            try:
                url = f"https://api.telegram.org/bot{token}/getUpdates"
                params = {'offset': last_update_id + 1, 'timeout': 15}
                res = requests.get(url, params=params, timeout=20)
                if res.status_code == 200:
                    data = res.json()
                    for update in data.get('result', []):
                        last_update_id = update['update_id']
                        msg = update.get('message')
                        if msg and 'text' in msg:
                            chat_id = msg['chat']['id']
                            username = msg.get('from', {}).get('username', '')
                            first_name = msg.get('from', {}).get('first_name', '')
                            text = msg['text']
                            logger.info(f"[TelegramBot] Pesan masuk dari {chat_id} (@{username}): {text}")
                            handle_bot_command(chat_id, username, text, first_name)
            except Exception as e:
                # Sleep sebentar jika ada gangguan koneksi internet
                time.sleep(5)

    thread = threading.Thread(target=_worker, daemon=True, name="TelegramBotListenerThread")
    thread.start()
    return thread


# ==============================================================================
# SDM MONITORING BOT LISTENER (@simak_sdm_bot)
# ==============================================================================

def handle_sdm_bot_command(chat_id, username, text, first_name=""):
    """
    Menangani interaksi langsung di Bot Khusus SDM (@simak_sdm_bot).
    """
    text = (text or '').strip()
    if not text:
        return

    try:
        parts = text.split()
        cmd = parts[0].lower() if parts else ''
        if '@' in cmd:
            cmd = cmd.split('@')[0]

        chat_id_str = str(chat_id).strip()
        sdm_token = get_sdm_bot_token()

        # Otomatis daftarkan Chat ID ini ke list penerima tembusan jika belum ada
        if chat_id_str not in DEFAULT_SDM_TEMBUSAN_CHAT_IDS:
            DEFAULT_SDM_TEMBUSAN_CHAT_IDS.append(chat_id_str)

        if cmd in ['/start', 'start', '/help', '/bantuan']:
            reply = (
                "👋 <b>Selamat Datang di SIMAK SDM Monitoring Bot!</b>\n\n"
                "Bot ini difungsikan khusus untuk <b>Tim Manajemen SDM RS Siaga Al Munawwaroh</b> "
                "guna menerima arsip rekonsiliasi presensi unit (termasuk Unit Radiologi) secara <i>real-time</i>.\n\n"
                f"• <b>Telegram Chat ID Anda:</b> <code>{chat_id_str}</code>\n"
                f"• <b>Status Jalur Tembusan:</b> Aktif ✅\n\n"
                "<i>Setiap kali staf unit yang dipantau melakukan tap sidik jari/wajah di mesin absen, "
                "data rekonsiliasi kehadiran detik tersebut akan otomatis dikirimkan ke sini.</i> 🙏"
            )
            send_telegram_message(chat_id, reply, bot_token=sdm_token)
    except Exception as err:
        logger.exception(f"[SdmBot] Error handling SDM command: {err}")


_SDM_POLLING_RUNNING = False

def start_telegram_sdm_bot_listener():
    """
    Daemon listener khusus untuk bot SDM (@simak_sdm_bot).
    """
    global _SDM_POLLING_RUNNING
    if _SDM_POLLING_RUNNING:
        return
    _SDM_POLLING_RUNNING = True

    def _worker():
        logger.info("[TelegramSdmBotListener] Memulai @simak_sdm_bot Long Polling...")
        last_update_id = 0
        while True:
            token = get_sdm_bot_token()
            if not token:
                time.sleep(10)
                continue

            try:
                url = f"https://api.telegram.org/bot{token}/getUpdates"
                params = {'offset': last_update_id + 1, 'timeout': 15}
                res = requests.get(url, params=params, timeout=20)
                if res.status_code == 200:
                    data = res.json()
                    for update in data.get('result', []):
                        last_update_id = update['update_id']
                        msg = update.get('message')
                        if msg and 'text' in msg:
                            chat_id = msg['chat']['id']
                            username = msg.get('from', {}).get('username', '')
                            first_name = msg.get('from', {}).get('first_name', '')
                            text = msg['text']
                            logger.info(f"[TelegramSdmBot] Pesan masuk dari {chat_id} (@{username}): {text}")
                            handle_sdm_bot_command(chat_id, username, text, first_name)
            except Exception:
                time.sleep(5)

    thread = threading.Thread(target=_worker, daemon=True, name="TelegramSdmBotListenerThread")
    thread.start()
    return thread
