from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.db import connections
from django.test import SimpleTestCase

from config.db_utils import get_rssams_db_alias
from keuangan.models import Faktur
from keuangan.views import (
    _is_farmasi_excluded,
    _is_logistik_excluded,
    _sort_pending_rows,
)


class DualDbRoutingHelpersTests(SimpleTestCase):
    def test_get_rssams_db_alias_falls_back_to_default_when_unconfigured(self):
        with patch.dict(connections.databases, {'default': {}}, clear=True):
            self.assertEqual(get_rssams_db_alias(), 'default')

        with patch.dict(connections.databases, {'default': {}, 'rssams': {}}, clear=True):
            self.assertEqual(get_rssams_db_alias(), 'rssams')

    def test_faktur_effective_tagihan_uses_rssams_cursor(self):
        faktur = Faktur(
            pk=1,
            nomor_faktur='260298',
            total_tagihan=Decimal('3885624.83'),
            status='bayar_sebagian',
        )
        executed = []

        class FakeCursor:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def execute(self, query, params=None):
                executed.append((query, params))

            def fetchone(self):
                return Decimal('3401074.00'), 1

        with patch('keuangan.models.get_rssams_cursor', return_value=FakeCursor()), patch.object(
            faktur, '_get_verified_total_dibayar', return_value=Decimal('3401074.00')
        ), patch('django.db.models.base.Model.save', return_value=None):
            faktur.save()

        self.assertEqual(len(executed), 1)
        self.assertIn('rssams.verif_kunjung', executed[0][0])
        self.assertEqual(faktur.status, 'lunas')

    def test_pending_utang_exclusion_filters(self):
        app_ids = {'261000', 'LOG-260010'}
        spbs = {'SPB-001', '260020'}
        fakturs = {'FAK-999', 'SPK-777'}

        self.assertTrue(_is_farmasi_excluded('261000', 'X', app_ids, spbs, fakturs))
        self.assertTrue(_is_farmasi_excluded('999', 'FAK-999', app_ids, spbs, fakturs))
        self.assertFalse(_is_farmasi_excluded('261091', 'FAK-NEW', app_ids, spbs, fakturs))

        self.assertTrue(_is_logistik_excluded('260010', '', '', app_ids, spbs, fakturs))
        self.assertTrue(_is_logistik_excluded('260099', 'SPB-001', '', app_ids, spbs, fakturs))
        self.assertTrue(_is_logistik_excluded('260099', '', 'SPK-777', app_ids, spbs, fakturs))
        self.assertFalse(_is_logistik_excluded('260099', 'SPB-NEW', 'SPK-NEW', app_ids, spbs, fakturs))

    def test_sort_pending_rows_handles_null_dates_and_ties(self):
        rows = [
            {'app_siaga_faktur_id': '1', 'tanggal_spb': None, 'nominal': Decimal('100')},
            {'app_siaga_faktur_id': '2', 'tanggal_spb': date(2026, 11, 20), 'nominal': Decimal('300')},
            {'app_siaga_faktur_id': '3', 'tanggal_spb': date(2026, 11, 20), 'nominal': Decimal('200')},
            {'app_siaga_faktur_id': '4', 'tanggal_spb': date(2026, 11, 25), 'nominal': Decimal('50')},
        ]
        _sort_pending_rows(rows, '-tanggal_spb')
        self.assertEqual([r['app_siaga_faktur_id'] for r in rows], ['4', '3', '2', '1'])

        _sort_pending_rows(rows, 'tanggal_spb')
        self.assertEqual([r['app_siaga_faktur_id'] for r in rows], ['1', '3', '2', '4'])
