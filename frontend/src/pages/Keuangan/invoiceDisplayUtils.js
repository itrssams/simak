export const roundMoney = (val) => Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;

export const getInvoiceDisplayAmounts = (invoice = {}) => {
  const totalTagihan = roundMoney(invoice?.total_tagihan || 0);
  const totalDibayar = roundMoney(invoice?.total_dibayar || 0);
  const totalPiutang = roundMoney(invoice?.total_piutang ?? 0);
  const fallbackPiutang = roundMoney(invoice?.sisa_tagihan ?? invoice?.total_tagihan ?? 0);
  const displayTotal = Number.isFinite(totalPiutang) && totalPiutang > 0
    ? totalPiutang
    : (Number.isFinite(fallbackPiutang) && fallbackPiutang > 0 ? fallbackPiutang : totalTagihan);
  const displaySisa = Math.max(0, roundMoney(displayTotal - totalDibayar));

  return {
    total: roundMoney(displayTotal),
    dibayar: totalDibayar,
    sisa: displaySisa,
  };
};
