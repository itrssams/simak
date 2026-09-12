from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from logbook.models import UraianTugas

DEFAULT_ELOK_JOBDESCS = [
    "Menyusun Rencana Kerja Anggaran (RKA) tahunan, serta menyelaraskannya dengan seluruh unit",
    "Memantau dan mengevaluasi kinerja organisasi dan rencana tindak lanjutnya",
    "Memetakan proses bisnis End-to-End Rumah Sakit, mengidentifikasi efisiensi alur kerja harian, dan merancang perbaikan sistem operasional.",
    "Merancang, memperbarui, dan mendistribusikan kebijakan, PerDir, Standar Prosedur Operasional (SPO), SK, memo internal, Surat Edaran, formulir, dan informasi terdokumentasi lainnya",
    "Menyelenggarakan program sosialisasi, edukasi berkelanjutan, aturan terbaru pemerintah, peraturan internal serta nilai-nilai budaya kerja (core values) kepada seluruh karyawan rumah sakit",
    "Memfasilitasi program pemetaan masalah (problem-solving), mengelola wadah ide inovasi staf, serta mengawal implementasi proyek perbaikan berkelanjutan (Continuous Improvement/Kaizen) di seluruh unit kerja.",
    "Menyusun dan menegosiasikan Nota Kesepahaman (MoU), Perjanjian Kerja Sama (PKS), berita acara kesepakatan, serta menjalin kemitraan dengan pihak asuransi, Perusahaan swasta, jaringan penunjang, asosiasi kesehatan, dan mitra strategis RS lainnya",
    "Mengendalikan tata kelola kearsipan dan sistem pendistribusian dokumen kebijakan dan regulasi di seluruh RS.",
    "Mengelola risiko, merekomendasikan strategi mitigasi dan pengendalian risiko yang bersumber dari internal, perubahan kebijakan kesehatan nasional, ataupun faktor eksternal lainnya.",
    "Menganalisis data pasar, demografi pasien, peta kompetitor, dan peta potensi kemitraan RS untuk menentukan arah strategi promosi dan menyusun rencana strategi pemasaran",
    "Mempromosikan layanan kepada pihak eksternal, menyediakan berbagai alat pemasaran, memberikan penawaran paket layanan yang tepat sasaran, dan mengevaluasi efektivitas program promosi",
    "Mengelola dan menganalisis performa akun media sosial dan website resmi RS untuk meningkatkan brand awareness",
    "Melakukan studi kelayakan peluang baru atas potensi pengembangan fasilitas dan layanan baru",
    "Mengelola dan memberikan tanggapan atas keluhan pasien yang diterima melalui media sosial maupun secara langsung, serta berkoordinasi dengan unit terkait untuk penyelesaian masalah.",
    "Mengoordinasikan pemenuhan dokumen standar Akreditasi RS, kredensialing BPJS, program nasional, ISO, dan standar nasional/internasional lainnya.",
]


class Command(BaseCommand):
    help = "Seed/Import uraian tugas (job description) untuk pegawai"

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default='elok',
            help='Username user yang akan diisi jobdesc-nya (default: elok)'
        )

    def handle(self, *args, **options):
        username = options['username'].strip()
        User = get_user_model()
        user = User.objects.filter(username__iexact=username).first()

        if not user:
            self.stderr.write(self.style.ERROR(f"User dengan username '{username}' tidak ditemukan di database."))
            return

        self.stdout.write(self.style.SUCCESS(f"Mengimpor job description untuk: {user.username} ({user.get_full_name() or user.role})"))

        jobdescs = DEFAULT_ELOK_JOBDESCS
        created_count = 0
        existing_count = 0

        for idx, desc in enumerate(jobdescs, 1):
            clean_desc = desc.strip()
            obj, created = UraianTugas.objects.get_or_create(
                user=user,
                deskripsi=clean_desc,
                defaults={'is_active': True}
            )
            if created:
                created_count += 1
                self.stdout.write(f"  [{idx}] + Ditambahkan: {clean_desc[:50]}...")
            else:
                existing_count += 1
                self.stdout.write(f"  [{idx}] = Sudah ada: {clean_desc[:50]}...")

        self.stdout.write(self.style.SUCCESS(
            f"\nSelesai! {created_count} baru ditambahkan, {existing_count} sudah ada sebelumnya."
        ))
