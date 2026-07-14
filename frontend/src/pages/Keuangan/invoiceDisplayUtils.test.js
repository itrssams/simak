import test from 'node:test';
import assert from 'node:assert/strict';

import { getInvoiceDisplayAmounts } from './invoiceDisplayUtils.js';

test('uses pembiayaan-side piutang when invoice has both pembiayaan and pasien amounts', () => {
  const invoice = {
    total_tagihan: 1000,
    total_dibayar: 100,
    total_piutang: 600,
  };

  const result = getInvoiceDisplayAmounts(invoice);

  assert.equal(result.total, 600);
  assert.equal(result.dibayar, 100);
  assert.equal(result.sisa, 500);
});

test('falls back to total tagihan when total piutang is unavailable', () => {
  const invoice = {
    total_tagihan: 1000,
    total_dibayar: 250,
  };

  const result = getInvoiceDisplayAmounts(invoice);

  assert.equal(result.total, 1000);
  assert.equal(result.dibayar, 250);
  assert.equal(result.sisa, 750);
});
