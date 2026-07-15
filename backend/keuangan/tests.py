from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from .models import Faktur, PembayaranFaktur


class FakePaymentsQuerySet:
    def __init__(self, total):
        self.total = total

    def filter(self, **kwargs):
        return self

    def aggregate(self, **kwargs):
        return {'total': self.total}


class FakeFaktur:
    def __init__(self, total):
        self.total_dibayar = Decimal('0')
        self.status = 'belum_bayar'
        self.pembayaran = FakePaymentsQuerySet(total)

    def save(self, *args, **kwargs):
        return None


class FakturStatusTests(SimpleTestCase):
    def test_marks_invoice_lunas_when_paid_amount_matches_piutang(self):
        faktur = Faktur(
            nomor_faktur='260298',
            total_tagihan=Decimal('3885624.83'),
            total_dibayar=Decimal('3401074.00'),
            status='bayar_sebagian',
        )

        class FakeCursor:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def execute(self, query, params=None):
                return None

            def fetchone(self):
                return Decimal('3401074.00'), 1

        with patch('keuangan.models.connection.cursor', return_value=FakeCursor()), patch('django.db.models.base.Model.save', return_value=None):
            faktur.save()

        self.assertEqual(faktur.status, 'lunas')

    def test_unverified_payment_does_not_reduce_invoice_balance(self):
        fake_faktur = FakeFaktur(Decimal('0'))
        pembayaran = PembayaranFaktur.__new__(PembayaranFaktur)
        pembayaran.__dict__['faktur'] = fake_faktur

        pembayaran._update_faktur_status()

        self.assertEqual(fake_faktur.total_dibayar, Decimal('0'))
