#!/bin/bash
file="/app/frontend/src/pages/Keuangan/CatatanUtangObatBhp.jsx"

# Replace openPayment function
sed -i '/const openPayment = async (row) => {/,/};/{
  s|const res = await api.get(`/keuangan/utang-supplier/${row.id}/pembayaran/`);|const res = await api.get(`/keuangan/pembayaran-utang/`, { params: { utang__id: row.id, pagination: `false`, limit: 100 } });|
  s|setPaymentHistory(getResults(res.data));|const hist = Array.isArray(res.data) ? res.data : getResults(res.data) \|\| [];\n            setPaymentHistory(hist);|
}' "$file"

echo "Fix applied"
