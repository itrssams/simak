import openpyxl

wb = openpyxl.load_workbook('/app/tmp_ots.xlsx', data_only=True)
sheet = wb['LIST FAKTUR']
rows = list(sheet.iter_rows(values_only=True))

print("=== ALL ROWS WITH SPB 260437 ===")
for r_idx in range(2, len(rows)):
    r = rows[r_idx]
    if not r: continue
    spb = str(r[7] or '').strip()
    if '260437' in spb:
        st_code = str(r[3] or '').strip()
        vendor = str(r[8] or '').strip()
        tgl = str(r[9])[:10] if r[9] else '-'
        nom = r[11] if isinstance(r[11], (int, float)) else 0
        byr = r[18] if len(r) > 18 and isinstance(r[18], (int, float)) else 0
        sisa = nom - byr
        ket = str(r[12] or '').strip()
        print(f"Row #{r_idx+1} | Status:'{st_code}' | Vendor:'{vendor}' | SPB:'{spb}' | Tgl:{tgl} | Nom:Rp {nom:,.2f} | Byr:Rp {byr:,.2f} | Sisa:Rp {sisa:,.2f} | Ket:'{ket}'")
