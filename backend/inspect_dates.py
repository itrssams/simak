import openpyxl

wb = openpyxl.load_workbook('/app/tmp_ots.xlsx', data_only=True)
sheet = wb['LIST FAKTUR']
rows = list(sheet.iter_rows(values_only=True))

header = [str(c) if c is not None else '' for c in rows[1][:20]]
print("=== HEADER ROW ===")
for idx, h in enumerate(header):
    print(f"Col {idx+1} ({chr(65+idx)}): {h}")

sample_dates = []
for r_idx in range(5, 20):
    r = rows[r_idx]
    if not r: continue
    tgl_faktur = r[9]  # Col J (10)
    tgl_titip = r[10]  # Col K (11)
    tgl_renc = r[15] if len(r) > 15 else None # Col P (16)
    tgl_proses = r[16] if len(r) > 16 else None # Col Q (17)
    tgl_app = r[17] if len(r) > 17 else None # Col R (18)
    
    print(f"Row {r_idx+1}: SPB={r[7]} | Vendor='{r[8]}' | TglFaktur={tgl_faktur} | TglTitip={tgl_titip} | TglRencByr={tgl_renc} | TglProses={tgl_proses} | TglApp={tgl_app}")
