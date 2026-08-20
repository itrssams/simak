import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ArusKas from './pages/Laporan/ArusKas';
import InputTransaksi from './pages/Transaksi/InputTransaksi';
import ListTransaksi from './pages/Transaksi/ListTransaksi';
import BaganAkun from './pages/Akuntansi/BaganAkun';
import EntriJurnal from './pages/Akuntansi/EntriJurnal';
import DataPelanggan from './pages/Pelanggan/DataPelanggan';
import FakturPelanggan from './pages/Pelanggan/FakturPelanggan';
import DataPemasok from './pages/Pemasok/DataPemasok';
import TagihanPemasok from './pages/Pemasok/TagihanPemasok';
import PettyCash from './pages/PettyCash/PettyCash';
import RekeningBank from './pages/RekeningBank/RekeningBank';
import ManajemenUser from './pages/Admin/ManajemenUser';
import LaporanPettyCash from './pages/Laporan/LaporanPettyCash';
import Driver from './pages/Driver/Driver';
import AuditLog from './pages/AuditLog';
import Pengumuman from './pages/Pengumuman';
import AlokasiPembiayaan from './pages/Keuangan/AlokasiPembiayaan';
import InvoiceDashboard from './pages/Keuangan/InvoiceDashboard';
import InvoicePembiayaan from './pages/Keuangan/InvoicePembiayaan';
import DaftarKunjunganInvoice from './pages/Keuangan/DaftarKunjunganInvoice';
import InvoiceVerifikasi from './pages/Keuangan/InvoiceVerifikasi';
import MasterPembiayaan from './pages/Keuangan/MasterPembiayaan';
import CatatanUtangObatBhp from './pages/Keuangan/CatatanUtangObatBhp';
import ImportUtangOts from './pages/Keuangan/ImportUtangOts';
import Logistik from './pages/Logistik/Logistik';
import SystemMaintenance from './pages/System/SystemMaintenance';
import AppLauncher from './pages/AppLauncher/AppLauncher';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import IdleWarningModal from './components/IdleWarningModal';

// ── Helper cek role ────────────────────────────────────────
const isSuperuserOnly = (u) => u?.is_superuser;
const isManajerUp = (u) => u?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(u?.role);
const isKepalaSeksiUp = (u) => u?.is_superuser || ['kepala_seksi', 'manajer', 'wakil_direktur', 'direktur'].includes(u?.role);
const isDirekturUp = (u) => u?.is_superuser || ['wakil_direktur', 'direktur'].includes(u?.role);
const isIT = (u) => u?.is_superuser || u?.is_it;
const isKeuangan = (u) => u?.is_superuser || u?.is_keuangan;
const isLogistik = (u) => u?.is_superuser || u?.is_logistik || isManajerUp(u);
const canCatatanUtang = (u) => u?.is_superuser || u?.akses_catatan_utang;
const isKeuanganNonManajer = (u) => u?.is_keuangan && !isManajerUp(u);
const isDriverAccess = (u) => u?.is_driver || isManajerUp(u);
const isBasicRole = (u) => ['karyawan', 'kepala_seksi'].includes(u?.role) && !u?.is_superuser && !u?.is_it && !u?.is_keuangan;
const FEATURE_INVENTARIS_ENABLED = false;
const FEATURE_IT_ENABLED = false;

// ── Protected route dengan role guard ─────────────────────
const ProtectedRoute = ({ children, allow }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (!user) return <Navigate to="/login" />;
    if (allow && !allow(user)) return <Navigate to="/petty-cash" />;
    return <Layout>{children}</Layout>;
};

// ── Home redirect berdasar role ────────────────────────────
const HomeRedirect = () => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (!user) return <Navigate to="/login" />;
    return <AppLauncher />;
};

// ── Idle timeout wrapper — hanya aktif saat user login ────
function IdleGuard() {
    const { user, logout } = useAuth();
    const [showWarning, setShowWarning] = useState(false);

    const { resetTimer } = useIdleTimeout({
        enabled: Boolean(user),
        idleMs: 30 * 60 * 1000,      // 30 menit
        warningMs: 2 * 60 * 1000,    // warning 2 menit sebelum logout
        onWarning: () => setShowWarning(true),
        onIdle: () => {
            setShowWarning(false);
            logout();
        },
        onActive: () => setShowWarning(false),
    });

    const handleStayLoggedIn = () => {
        setShowWarning(false);
        resetTimer();
    };

    const handleLogoutNow = () => {
        setShowWarning(false);
        logout();
    };

    return (
        <IdleWarningModal
            visible={showWarning}
            onStayLoggedIn={handleStayLoggedIn}
            onLogoutNow={handleLogoutNow}
        />
    );
}

// ── Routes ────────────────────────────────────────────────
const AppRoutes = () => {
    const { user } = useAuth();

    return (
        <Routes>
            {/* Login */}
            <Route
                path="/login"
                element={!user ? <Login /> : (FEATURE_IT_ENABLED && user.is_it && !user.is_superuser ? <Navigate to="/it" /> : (canCatatanUtang(user) && !user.is_keuangan && !isManajerUp(user) ? <Navigate to="/keuangan/catatan-utang/obat-bhp" /> : (user.is_logistik && !isManajerUp(user) ? <Navigate to="/logistik" /> : (isKeuanganNonManajer(user) ? <Navigate to="/keuangan/kunjungan-invoice" /> : (isBasicRole(user) ? <Navigate to="/petty-cash" /> : <Navigate to="/" />)))))}
            />

            {/* Home & Apps */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/apps" element={<ProtectedRoute><AppLauncher /></ProtectedRoute>} />
            <Route path="/dashboard-analytics" element={<ProtectedRoute allow={isManajerUp}><Dashboard /></ProtectedRoute>} />

            {/* Semua role */}
            <Route path="/petty-cash" element={<ProtectedRoute><PettyCash /></ProtectedRoute>} />

            {/* Manajer ke atas */}
            <Route path="/pelanggan" element={<ProtectedRoute allow={isManajerUp}><DataPelanggan /></ProtectedRoute>} />
            <Route path="/pelanggan/faktur" element={<ProtectedRoute allow={isManajerUp}><FakturPelanggan /></ProtectedRoute>} />
            <Route path="/pemasok" element={<ProtectedRoute allow={isManajerUp}><DataPemasok /></ProtectedRoute>} />
            <Route path="/pemasok/tagihan" element={<ProtectedRoute allow={isManajerUp}><TagihanPemasok /></ProtectedRoute>} />
            <Route path="/akuntansi/bagan-akun" element={<ProtectedRoute allow={isManajerUp}><BaganAkun /></ProtectedRoute>} />
            <Route path="/akuntansi/entri-jurnal" element={<ProtectedRoute allow={isManajerUp}><EntriJurnal /></ProtectedRoute>} />
            <Route path="/transaksi/input" element={<ProtectedRoute allow={isManajerUp}><InputTransaksi /></ProtectedRoute>} />
            <Route path="/transaksi/list" element={<ProtectedRoute allow={isManajerUp}><ListTransaksi /></ProtectedRoute>} />
            <Route path="/laporan/arus-kas" element={<ProtectedRoute allow={isManajerUp}><ArusKas /></ProtectedRoute>} />
            <Route path="/rekening-bank" element={<ProtectedRoute allow={isManajerUp}><RekeningBank /></ProtectedRoute>} />

            {/* Keuangan */}
            <Route path="/keuangan/alokasi-pembiayaan" element={<ProtectedRoute allow={isKeuangan}><AlokasiPembiayaan /></ProtectedRoute>} />
            <Route path="/keuangan/invoices/dashboard" element={<ProtectedRoute allow={isKeuangan}><InvoiceDashboard /></ProtectedRoute>} />
            <Route path="/keuangan/kunjungan-invoice" element={<ProtectedRoute allow={isKeuangan}><DaftarKunjunganInvoice /></ProtectedRoute>} />
            <Route path="/keuangan/invoices" element={<ProtectedRoute allow={isKeuangan}><InvoicePembiayaan /></ProtectedRoute>} />
            <Route path="/keuangan/invoices/verifikasi" element={<ProtectedRoute allow={isKeuangan}><InvoiceVerifikasi /></ProtectedRoute>} />
            <Route path="/keuangan/master-pembiayaan" element={<ProtectedRoute allow={isKeuangan}><MasterPembiayaan /></ProtectedRoute>} />
            <Route path="/keuangan/invoices/:id" element={<ProtectedRoute allow={isKeuangan}><InvoicePembiayaan /></ProtectedRoute>} />
            <Route path="/keuangan/catatan-utang/obat-bhp" element={<ProtectedRoute allow={canCatatanUtang}><CatatanUtangObatBhp /></ProtectedRoute>} />
            <Route path="/keuangan/catatan-utang/import-ots" element={<ProtectedRoute allow={canCatatanUtang}><ImportUtangOts /></ProtectedRoute>} />
            <Route path="/logistik" element={<ProtectedRoute allow={isLogistik}><Navigate to="/logistik/barang" /></ProtectedRoute>} />
            <Route path="/logistik/:section" element={<ProtectedRoute allow={(u) => isLogistik(u) || canCatatanUtang(u)}><Logistik /></ProtectedRoute>} />

            {/* Lainnya */}
            <Route path="/audit-log" element={<ProtectedRoute allow={(u) => isManajerUp(u) || isIT(u)}><AuditLog /></ProtectedRoute>} />
            <Route path="/pengumuman" element={<ProtectedRoute allow={isManajerUp}><Pengumuman /></ProtectedRoute>} />
            <Route path="/inventaris" element={FEATURE_INVENTARIS_ENABLED ? <ProtectedRoute allow={isKepalaSeksiUp}><Navigate to="/petty-cash" /></ProtectedRoute> : <Navigate to="/petty-cash" />} />
            <Route path="/it" element={FEATURE_IT_ENABLED ? <ProtectedRoute allow={isIT}><Navigate to="/petty-cash" /></ProtectedRoute> : <Navigate to="/petty-cash" />} />
            <Route path="/admin/users" element={<ProtectedRoute allow={isDirekturUp}><ManajemenUser /></ProtectedRoute>} />
            <Route path="/admin/system-maintenance" element={<ProtectedRoute allow={isSuperuserOnly}><SystemMaintenance /></ProtectedRoute>} />
            <Route path="/laporan/petty-cash" element={<ProtectedRoute allow={isManajerUp}><LaporanPettyCash /></ProtectedRoute>} />
            <Route path="/laporan/it" element={FEATURE_IT_ENABLED ? <ProtectedRoute allow={isIT}><Navigate to="/petty-cash" /></ProtectedRoute> : <Navigate to="/petty-cash" />} />
            <Route path="/driver" element={<ProtectedRoute allow={isDriverAccess}><Driver /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
};

function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <IdleGuard />
                    <AppRoutes />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
