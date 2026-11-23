import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axiosConfig';
import { getResults } from '../../utils/pagination.jsx';
import JurnalTab from './JurnalTab';
import BukuBesarTab from './BukuBesarTab';
import LaporanKeuanganTab from './LaporanKeuanganTab';
import CoATab from './CoATab';
import PengaturanAkuntansiTab from './PengaturanAkuntansiTab';
import './Akuntansi.css';

const TABS = [
    { id: 'jurnal', label: 'Jurnal Umum' },
    { id: 'buku_besar', label: 'Buku Besar (General Ledger)' },
    { id: 'laporan', label: 'Laporan Keuangan' },
    { id: 'coa', label: 'Chart of Accounts (CoA)' },
    { id: 'pengaturan', label: 'Pengaturan & Tutup Buku' },
];

export default function AkuntansiIndex({ initialTab = 'jurnal' }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') || initialTab;
    const [activeTab, setActiveTab] = useState(
        TABS.some((t) => t.id === tabParam) ? tabParam : 'jurnal'
    );
    const [ledgerAccountId, setLedgerAccountId] = useState('');

    const [accounts, setAccounts] = useState([]);
    const [units, setUnits] = useState([]);

    useEffect(() => {
        const nextTab = searchParams.get('tab');
        if (nextTab && TABS.some((t) => t.id === nextTab) && nextTab !== activeTab) {
            setActiveTab(nextTab);
        }
    }, [searchParams, activeTab]);

    const handleSwitchTab = (tabId) => {
        setActiveTab(tabId);
        setSearchParams({ tab: tabId });
    };

    const handleOpenLedgerForAccount = (akunIdOrCode) => {
        const found = accounts.find(
            (a) => String(a.id) === String(akunIdOrCode) || a.kode_akun === String(akunIdOrCode)
        );
        setLedgerAccountId(found ? String(found.id) : String(akunIdOrCode));
        handleSwitchTab('buku_besar');
    };

    const fetchMasterData = async () => {
        try {
            const [accRes, unitRes] = await Promise.all([
                api.get('/keuangan/akun/', { params: { include_inactive: true } }),
                api.get('/users/units/').catch(() => ({ data: [] })),
            ]);
            setAccounts(getResults(accRes.data));
            setUnits(getResults(unitRes.data));
        } catch {
            // Silent fallback
        }
    };

    useEffect(() => {
        fetchMasterData();
    }, []);

    const postableAccounts = useMemo(
        () => accounts.filter((a) => a.is_postable && a.is_active !== false),
        [accounts]
    );

    return (
        <div className="akt-page">
            {/* Page Header (DESIGN.md Flat Clean Header) */}
            <div className="akt-header">
                <div className="akt-header-titles">
                    <h1>Akuntansi & Laporan Keuangan</h1>
                    <p>
                        Jurnal Double-Entry Otomatis, Buku Besar, Laporan Laba Rugi, Neraca, Aging, dan Tutup Buku
                        Periode RS Siaga Al Munawwarah
                    </p>
                </div>
            </div>

            {/* Primary Underline Tabs (#635bff) */}
            <div className="akt-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        className={`akt-tab ${activeTab === t.id ? 'active' : ''}`}
                        onClick={() => handleSwitchTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Active Sub-Page Content */}
            {activeTab === 'jurnal' && (
                <JurnalTab
                    postableAccounts={postableAccounts}
                    units={units}
                    onNavigateBook={handleOpenLedgerForAccount}
                />
            )}

            {activeTab === 'buku_besar' && (
                <BukuBesarTab
                    accounts={accounts}
                    units={units}
                    initialAccountId={ledgerAccountId}
                />
            )}

            {activeTab === 'laporan' && (
                <LaporanKeuanganTab
                    units={units}
                    onOpenLedger={handleOpenLedgerForAccount}
                />
            )}

            {activeTab === 'coa' && (
                <CoATab
                    onAccountsChanged={fetchMasterData}
                    onOpenLedger={handleOpenLedgerForAccount}
                />
            )}

            {activeTab === 'pengaturan' && (
                <PengaturanAkuntansiTab postableAccounts={postableAccounts} />
            )}
        </div>
    );
}
