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
import LaporanIT from './pages/Laporan/LaporanIT';
import Driver from './pages/Driver/Driver';
import AuditLog from './pages/AuditLog';
import ITCenter from './pages/IT/ITCenter';
import Pengumuman from './pages/Pengumuman';

// ── Helper cek role ────────────────────────────────────────
const isManajerUp = (u) => u?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(u?.role);
const isDirekturUp = (u) => u?.is_superuser || ['wakil_direktur', 'direktur'].includes(u?.role);
const isIT = (u) => u?.is_superuser || u?.is_it;
const isDriverAccess = (u) => u?.is_driver || isManajerUp(u);
const isBasicRole = (u) => ['karyawan', 'kepala_seksi'].includes(u?.role) && !u?.is_superuser && !u?.is_it;

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
    if (user.is_it && !user.is_superuser) return <Navigate to="/it" />;
    if (isBasicRole(user)) return <Navigate to="/petty-cash" />;
    return (
        <Layout>
            <Dashboard />
        </Layout>
    );
};

// ── Routes ────────────────────────────────────────────────
const AppRoutes = () => {
    const { user } = useAuth();

    return (
        <Routes>
            {/* Login */}
            <Route
                path="/login"
                element={!user ? <Login /> : (user.is_it && !user.is_superuser ? <Navigate to="/it" /> : (isBasicRole(user) ? <Navigate to="/petty-cash" /> : <Navigate to="/" />))}
            />

            {/* Home — redirect sesuai role */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Semua role bisa akses */}
            <Route path="/petty-cash" element={
                <ProtectedRoute>
                    <PettyCash />
                </ProtectedRoute>
            } />

            {/* Manajer ke atas */}
            <Route path="/pelanggan" element={
                <ProtectedRoute allow={isManajerUp}>
                    <DataPelanggan />
                </ProtectedRoute>
            } />
            <Route path="/pelanggan/faktur" element={
                <ProtectedRoute allow={isManajerUp}>
                    <FakturPelanggan />
                </ProtectedRoute>
            } />
            <Route path="/pemasok" element={
                <ProtectedRoute allow={isManajerUp}>
                    <DataPemasok />
                </ProtectedRoute>
            } />
            <Route path="/pemasok/tagihan" element={
                <ProtectedRoute allow={isManajerUp}>
                    <TagihanPemasok />
                </ProtectedRoute>
            } />
            <Route path="/akuntansi/bagan-akun" element={
                <ProtectedRoute allow={isManajerUp}>
                    <BaganAkun />
                </ProtectedRoute>
            } />
            <Route path="/akuntansi/entri-jurnal" element={
                <ProtectedRoute allow={isManajerUp}>
                    <EntriJurnal />
                </ProtectedRoute>
            } />
            <Route path="/transaksi/input" element={
                <ProtectedRoute allow={isManajerUp}>
                    <InputTransaksi />
                </ProtectedRoute>
            } />
            <Route path="/transaksi/list" element={
                <ProtectedRoute allow={isManajerUp}>
                    <ListTransaksi />
                </ProtectedRoute>
            } />
            <Route path="/laporan/arus-kas" element={
                <ProtectedRoute allow={isManajerUp}>
                    <ArusKas />
                </ProtectedRoute>
            } />
            <Route path="/rekening-bank" element={
                <ProtectedRoute allow={isManajerUp}>
                    <RekeningBank />
                </ProtectedRoute>
            } />
            <Route path="/audit-log" element={
                <ProtectedRoute allow={(u) => isManajerUp(u) || isIT(u)}>
                    <AuditLog />
                </ProtectedRoute>
            } />

            <Route path="/pengumuman" element={
                <ProtectedRoute allow={isManajerUp}>
                    <Pengumuman />
                </ProtectedRoute>
            } />

            <Route path="/it" element={
                <ProtectedRoute allow={isIT}>
                    <ITCenter />
                </ProtectedRoute>
            } />

            {/* Direktur only */}
            <Route path="/admin/users" element={
                <ProtectedRoute allow={isDirekturUp}>
                    <ManajemenUser />
                </ProtectedRoute>
            } />

            <Route path="/laporan/petty-cash" element={
                <ProtectedRoute allow={isManajerUp}>
                    <LaporanPettyCash />
                </ProtectedRoute>
            } />

            <Route path="/laporan/it" element={
                <ProtectedRoute allow={isIT}>
                    <LaporanIT />
                </ProtectedRoute>
            } />

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
                    <AppRoutes />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
