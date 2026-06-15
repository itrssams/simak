# SIMAK Invoice Management System - Implementation Summary

## Date: June 4, 2026
## Status: ✅ COMPLETED - Serializers & ViewSets Created

---

## 📊 What Was Accomplished

### 1. Data Migration ✅
- **7,719 invoices** successfully migrated from `rssams.invoice` to `simak_dev.keuangan_faktur`
- **1,119 payments** created for partially paid invoices
- Status breakdown:
  - Belum Bayar: 6,600 invoices
  - Bayar Sebagian: 1,119 invoices
  - Lunas: 0 invoices (auto-updated on payment)
  - Batal: 0 invoices

### 2. Database Schema ✅
Applied migration `0028_alter_pembayaranfaktur_options_faktur_adm_and_more` with:
- **Faktur model**: Added 20 new fields (12 cost breakdown + 5 metadata + 3 auto-calc)
- **PembayaranFaktur model**: Added `alokasi_dana` FK for cash allocation tracking
- **AlokasiDana model**: New model for tracking temporary cash pools by pembiayaan

### 3. API Serializers ✅
Updated & created serializers:

**FakturSerializer**
- All cost breakdown fields (adm, jasa, farmasi, tindakan, fisio, lab, rad, kamar, bhp, lainnya, ambulan, alat, ppn_farmasi)
- Metadata (id_pembiayaan, nama_pembiayaan, jenis, periode, beban)
- Auto-calc fields (total_tagihan, total_dibayar, sisa_tagihan, status_label)
- Readonly: created_by_name, pelanggan_detail, items, pembayaran

**PembayaranFakturSerializer**
- Added alokasi_dana field with nested serializer for details
- Added created_by_name for audit
- Includes akun_detail for display

**AlokasiDanaSerializer** (NEW)
- id_pembiayaan, nama_pembiayaan, tanggal_penerimaan, jumlah_penerimaan, bank
- total_alokasi (immutable after creation = jumlah_penerimaan)
- sisa_alokasi (auto-calculated: total - used amount)
- digunakan (read-only property: sum of all pembayaran using this alokasi)

### 4. API ViewSets & Endpoints ✅

**FakturViewSet** - Enhanced
- Endpoint: `GET/POST /api/keuangan/faktur/`
- Filters: pelanggan, status, dari (date), sampai (date)
- Actions:
  - `POST /api/keuangan/faktur/{id}/bayar/` - Record payment (auto-updates status)
  - `POST /api/keuangan/faktur/{id}/batal/` - Cancel invoice
- Auto-updates status on payment via `PembayaranFaktur.save()` trigger

**AlokasiDanaViewSet** (NEW)
- Endpoint: `GET/POST /api/keuangan/alokasi-dana/`
- Filters: id_pembiayaan, dari, sampai, bank
- Full CRUD for cash allocation tracking
- Auto-calculates sisa_alokasi when payments made

**PembiayaanListView** (NEW)
- Endpoint: `GET /api/keuangan/pembiayaan-options/`
- Queries rssams.pbiaya for insurance provider dropdown
- Returns: { count, results: [{ id_pembiayaan, nama }] }

### 5. User Permission Feature Flag ✅

Added `is_keuangan` boolean field to User model:
```python
is_keuangan = models.BooleanField(default=False)
```

**Migration**: `0007_user_is_keuangan.py` applied

**How to Use**:
1. Go to User Management (Django Admin or custom interface)
2. Select user who should have access to invoice management
3. Check the `is_keuangan` checkbox (similar to driver/IT flags)
4. Save

This field can later be used in permission checks:
```python
def is_keuangan_user(user):
    return user.is_authenticated and (
        getattr(user, 'is_keuangan', False) or 
        user.role in ('manajer', 'wakil_direktur', 'direktur') or 
        user.is_superuser
    )
```

---

## 🏗️ Architecture

### Three-Status Invoice System
```
belum_bayar ─────→ bayar_sebagian ─────→ lunas
                        ↑
                   (payment received)
                   
Any status can → batal (cancelled)
```

### Auto-Calculation Logic
- **On PembayaranFaktur.save()**:
  1. Recalculate total_dibayar = SUM(pembayaran.jumlah)
  2. Update faktur status based on new total_dibayar
  3. If linked to alokasi_dana, update sisa_alokasi

- **On AlokasiDana.save()**:
  1. Recalculate sisa_alokasi = total_alokasi - SUM(pembayaran.jumlah using this alokasi)

### Cross-Database Access
- **rssams** (read-only): pbiaya table via raw SQL
- **simak_dev** (read-write): Faktur, PembayaranFaktur, AlokasiDana

---

## 📋 Database Fields Reference

### Faktur Table
```
Core Fields:
- nomor_faktur (CharField, 50)
- tanggal (DateField)
- jatuh_tempo (DateField)

Cost Breakdown (DecimalField 15,2):
- adm, jasa, farmasi, tindakan, fisio, lab, rad, kamar
- bhp, lainnya, ambulan, alat, ppn_farmasi

Metadata:
- id_pembiayaan (CharField 20) ← from rssams.pbiaya.id
- nama_pembiayaan (CharField 150) ← from rssams.pbiaya.ket
- jenis, periode, beban (CharField)

Tracking:
- total_tagihan (DecimalField, auto-calc)
- total_dibayar (DecimalField, auto-calc on payment)
- status (3-status: belum_bayar | bayar_sebagian | lunas | batal)
- tgl_kirim (DateField, nullable)
- xround (CharField)

Relations:
- pelanggan (FK, nullable)
- created_by (FK to User)
```

### AlokasiDana Table
```
- id_pembiayaan (CharField 20)
- nama_pembiayaan (CharField 150)
- tanggal_penerimaan (DateField)
- jumlah_penerimaan (DecimalField 15,2)
- bank (CharField: bsi | bri | mandiri | bca)
- total_alokasi (DecimalField, immutable after create = jumlah_penerimaan)
- sisa_alokasi (DecimalField, auto-calc = total - used)
- keterangan (TextField, optional)
- created_by (FK to User)
- created_at (DateTimeField)

Unique Constraint: (id_pembiayaan, tanggal_penerimaan, bank)
```

---

## 🔌 API Endpoints Summary

### Invoice Management
```
GET    /api/keuangan/faktur/                    # List invoices (paginated)
POST   /api/keuangan/faktur/                    # Create invoice
GET    /api/keuangan/faktur/{id}/               # Get invoice detail
PUT    /api/keuangan/faktur/{id}/               # Update invoice
POST   /api/keuangan/faktur/{id}/bayar/         # Record payment (auto status update)
POST   /api/keuangan/faktur/{id}/batal/         # Cancel invoice
```

### Cash Allocation
```
GET    /api/keuangan/alokasi-dana/              # List allocations
POST   /api/keuangan/alokasi-dana/              # Create allocation
GET    /api/keuangan/alokasi-dana/{id}/         # Get allocation detail
PUT    /api/keuangan/alokasi-dana/{id}/         # Update allocation
DELETE /api/keuangan/alokasi-dana/{id}/         # Delete allocation
```

### Reference Data
```
GET    /api/keuangan/pembiayaan-options/        # Get pembiayaan dropdown from rssams
```

---

## 🔐 Permission Requirements

### Required Role for Invoice Access
- **Manajer** and above (wakil_direktur, direktur)
- **OR** `is_keuangan=True` flag checked
- **OR** is_superuser

### Current Implementation
```python
class IsManajerOrAbovePermission(BasePermission):
    def has_permission(self, request, view):
        return is_manajer_or_above(request.user)
```

---

## 📝 Testing Checklist

- [x] Migration successful (7,719 invoices + 1,119 payments)
- [x] Serializers created with all new fields
- [x] ViewSets configured with proper permissions
- [x] Django check passed (no syntax errors)
- [x] User feature flag added (is_keuangan)
- [ ] API endpoints tested with sample requests
- [ ] Auto-status update logic tested
- [ ] Alokasi dana calculation tested
- [ ] Frontend React components created
- [ ] Payment history display working
- [ ] Status badge styling completed

---

## 🚀 Next Steps

1. **Create React Frontend Components**
   - Alokasi Dana page (form + datagrid)
   - Invoice list with filters
   - Invoice detail with payment tracking
   - Payment history table

2. **Enable Feature in User Management**
   - For each user needing invoice access, check `is_keuangan` box
   - Test permission enforcement

3. **Testing & Validation**
   - Test payment flow (belum_bayar → bayar_sebagian → lunas)
   - Test alokasi dana auto-reduction
   - Test cross-database pembiayaan dropdown
   - Load test with 7,719+ invoices

4. **Deployment Checklist**
   - Backup production database
   - Run migrations on production
   - Enable invoice menu in user management for staff
   - Create user documentation

---

## 📞 Implementation Notes

**Important**: Users will see invoice management in their menu AFTER:
1. Admin checks `is_keuangan` flag in user management (similar to driver/IT)
2. Frontend is updated to show menu conditionally based on this flag
3. User logs out and back in

**Auto-Payment Status Logic** works via Django ORM `.save()` hooks - no additional signals needed yet.

**Cross-DB Performance**: rssams.pbiaya queries cached client-side or via separate endpoint to avoid N+1 queries.
