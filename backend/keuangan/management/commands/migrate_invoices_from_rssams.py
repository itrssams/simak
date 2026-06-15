from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Sum
from django.utils import timezone
from django.contrib.auth import get_user_model
from keuangan.models import Faktur, PembayaranFaktur
from decimal import Decimal
from datetime import date, datetime

User = get_user_model()


class Command(BaseCommand):
    help = 'Migrate invoice data from rssams (app_siaga) to simak'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without actually migrating',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)

        if dry_run:
            self.stdout.write(self.style.WARNING('Running in DRY RUN mode - no data will be saved'))

        try:
            invoices = self._get_invoices_from_rssams()
            self.stdout.write(f'Found {len(invoices)} invoices to migrate')

            if not invoices:
                self.stdout.write(self.style.SUCCESS('No invoices to migrate'))
                return

            admin_user = User.objects.filter(is_superuser=True).first()
            if not admin_user:
                admin_user = User.objects.create_superuser(
                    username='admin',
                    email='admin@localhost',
                    password='admin123'
                )

            created_count = 0
            skipped_count = 0
            error_count = 0

            for invoice_data in invoices:
                try:
                    if not dry_run:
                        faktur, created = self._create_faktur_if_not_exists(invoice_data, admin_user)

                        if not created:
                            skipped_count += 1
                            self.stdout.write(
                                self.style.WARNING(f"SKIP Invoice {invoice_data['no']} already exists")
                            )
                            continue

                        # Create payment only for new invoices
                        if Decimal(str(invoice_data['jml_bayar'] or 0)) > 0:
                            self._create_pembayaran_if_not_exists(faktur, invoice_data, admin_user)

                        created_count += 1
                        self.stdout.write(
                            self.style.SUCCESS(f"OK Invoice {invoice_data['no']} created")
                        )
                    else:
                        # Dry run: just check if exists
                        exists = Faktur.objects.filter(nomor_faktur=invoice_data['no']).exists()
                        if exists:
                            skipped_count += 1
                            self.stdout.write(
                                self.style.WARNING(f"SKIP Invoice {invoice_data['no']} already exists (dry run)")
                            )
                        else:
                            created_count += 1
                            self.stdout.write(
                                self.style.SUCCESS(f"OK Invoice {invoice_data['no']} would be created (dry run)")
                            )

                except Exception as e:
                    error_count += 1
                    self.stdout.write(
                        self.style.ERROR(f"ERROR migrating invoice {invoice_data.get('no', 'unknown')}: {str(e)}")
                    )

            self.stdout.write(
                self.style.SUCCESS(
                    f'\nMigration complete: {created_count} created, {skipped_count} skipped, {error_count} errors'
                )
            )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Fatal error: {str(e)}'))

    def _get_invoices_from_rssams(self):
        """Query invoices from rssams.invoice"""
        with connection.cursor() as cursor:
            sql = """
                SELECT 
                    a.no, a.id_pembiayaan, b.pembiayaan as nama_pembiayaan,
                    a.adm, a.jasa, a.farmasi, a.tindakan, a.fisio, a.lab,
                    a.kamar, a.rad, a.bhp, a.lainnya, a.ambulan, a.alat,
                    a.jml_bayar, a.cek, a.tgl, a.jenis, a.periode, a.beban,
                    a.tgl_kirim, a.tgl_bayar, a.tgl_jtempo, a.catatan,
                    a.ppn_farmasi, a.xround
                FROM rssams.invoice a
                LEFT JOIN rssams.pbiaya b ON a.id_pembiayaan = b.id_pembiayaan
                ORDER BY a.tgl DESC, a.no DESC
            """
            cursor.execute(sql)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def _build_faktur_defaults(self, invoice_data, user):
        """Build Faktur fields from rssams invoice data."""
        tgl = invoice_data['tgl'] if invoice_data['tgl'] and str(invoice_data['tgl']) != '0000-00-00' else date.today()
        tgl_jtempo = invoice_data['tgl_jtempo'] if invoice_data['tgl_jtempo'] and str(invoice_data['tgl_jtempo']) != '0000-00-00' else tgl
        tgl_kirim = invoice_data['tgl_kirim'] if invoice_data['tgl_kirim'] and str(invoice_data['tgl_kirim']) != '0000-00-00' else None

        if isinstance(tgl, str):
            tgl = datetime.strptime(tgl, '%Y-%m-%d').date()
        if isinstance(tgl_jtempo, str):
            tgl_jtempo = datetime.strptime(tgl_jtempo, '%Y-%m-%d').date()
        if tgl_kirim and isinstance(tgl_kirim, str):
            tgl_kirim = datetime.strptime(tgl_kirim, '%Y-%m-%d').date()

        return {
            'tanggal': tgl,
            'jatuh_tempo': tgl_jtempo,
            'id_pembiayaan': str(invoice_data['id_pembiayaan']) if invoice_data['id_pembiayaan'] else None,
            'nama_pembiayaan': invoice_data['nama_pembiayaan'] or 'Unknown',
            'jenis': invoice_data['jenis'] or '',
            'periode': invoice_data['periode'] or '',
            'beban': invoice_data['beban'] or '',
            'adm': Decimal(str(invoice_data['adm'] or 0)),
            'jasa': Decimal(str(invoice_data['jasa'] or 0)),
            'farmasi': Decimal(str(invoice_data['farmasi'] or 0)),
            'tindakan': Decimal(str(invoice_data['tindakan'] or 0)),
            'fisio': Decimal(str(invoice_data['fisio'] or 0)),
            'lab': Decimal(str(invoice_data['lab'] or 0)),
            'rad': Decimal(str(invoice_data['rad'] or 0)),
            'kamar': Decimal(str(invoice_data['kamar'] or 0)),
            'bhp': Decimal(str(invoice_data['bhp'] or 0)),
            'lainnya': Decimal(str(invoice_data['lainnya'] or 0)),
            'ambulan': Decimal(str(invoice_data['ambulan'] or 0)),
            'alat': Decimal(str(invoice_data['alat'] or 0)),
            'ppn_farmasi': Decimal(str(invoice_data['ppn_farmasi'] or 0)),
            'tgl_kirim': tgl_kirim,
            'xround': invoice_data['xround'] or 'N',
            'created_by': user,
            'keterangan': f"Migrated from app_siaga - {invoice_data['catatan']}" if invoice_data['catatan'] else 'Migrated from app_siaga',
        }

    def _create_faktur_if_not_exists(self, invoice_data, user):
        """Create Faktur only if nomor_faktur doesn't already exist."""
        defaults = self._build_faktur_defaults(invoice_data, user)

        faktur, created = Faktur.objects.get_or_create(
            nomor_faktur=invoice_data['no'],
            defaults=defaults,
        )

        return faktur, created

    def _create_pembayaran_if_not_exists(self, faktur, invoice_data, user):
        """Create PembayaranFaktur only if no migration payment exists yet."""
        jumlah_bayar = Decimal(str(invoice_data['jml_bayar'] or 0))

        if jumlah_bayar <= 0:
            return

        # Skip if migration payment already exists for this invoice
        already_exists = PembayaranFaktur.objects.filter(
            faktur=faktur,
            keterangan='Payment from app_siaga migration',
        ).exists()

        if already_exists:
            self.stdout.write(
                self.style.WARNING(f"SKIP Payment for invoice {faktur.nomor_faktur} already exists")
            )
            return

        tgl_bayar = invoice_data['tgl_bayar']
        if tgl_bayar and str(tgl_bayar) != '0000-00-00':
            if isinstance(tgl_bayar, str):
                tgl_bayar = datetime.strptime(tgl_bayar, '%Y-%m-%d').date()
        else:
            tgl_bayar = faktur.tanggal

        PembayaranFaktur.objects.create(
            faktur=faktur,
            keterangan='Payment from app_siaga migration',
            tanggal=tgl_bayar,
            jumlah=jumlah_bayar,
            metode='tunai',
            created_by=user,
            status_verifikasi='terverifikasi',
            verified_by=user,
            verified_at=timezone.now(),
        )