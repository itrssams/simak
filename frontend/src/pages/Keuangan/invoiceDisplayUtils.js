export const getInvoiceDisplayAmounts = (invoice = {}) => {
  const totalTagihan = Number(invoice?.total_tagihan || 0);
  const totalDibayar = Number(invoice?.total_dibayar || 0);
  const totalPiutang = Number(invoice?.total_piutang ?? 0);
  const fallbackPiutang = Number(invoice?.sisa_tagihan ?? invoice?.total_tagihan ?? 0);
  const displayTotal = Number.isFinite(totalPiutang) && totalPiutang > 0
    ? totalPiutang
    : (Number.isFinite(fallbackPiutang) && fallbackPiutang > 0 ? fallbackPiutang : totalTagihan);
  const displaySisa = Math.max(0, displayTotal - totalDibayar);

  return {
    total: displayTotal,
    dibayar: totalDibayar,
    sisa: displaySisa,
  };
};
