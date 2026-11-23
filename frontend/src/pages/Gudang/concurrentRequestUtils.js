import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axiosConfig';

export function formatQtyNumber(val) {
    return Number(val || 0).toLocaleString('id-ID');
}

export async function checkPermintaanDuplicatesApi({ ruangId, barangIds, excludePermintaanId = null }) {
    const cleanIds = Array.from(new Set((barangIds || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!cleanIds.length) {
        return { ruang_id: ruangId || null, ruang_nama: '', has_duplicates: false, duplicates: [] };
    }
    const payload = {
        barang_ids: cleanIds,
    };
    if (ruangId) payload.ruang = Number(ruangId);
    if (excludePermintaanId) payload.exclude_permintaan_id = Number(excludePermintaanId);
    const res = await api.post('/gudang/permintaan/check-duplicates/', payload);
    return res.data || { has_duplicates: false, duplicates: [] };
}

export function getConcurrentToneClass(itemStatus) {
    if (itemStatus === 'DISETUJUI') return 'is-emerald';
    if (itemStatus === 'SEDANG_DIAJUKAN') return 'is-sky';
    return 'is-amber';
}

export function formatConcurrentEntryText(entry) {
    if (!entry) return '';
    if (entry.item_status === 'DISETUJUI') {
        const sisa = Number(entry.sisa_belum_serah ?? Math.max(0, (entry.qty_disetujui || 0) - (entry.qty_dikeluarkan || 0)));
        return `ACC ${formatQtyNumber(entry.qty_disetujui)} ${entry.satuan} (belum diambil: ${formatQtyNumber(sisa)} ${entry.satuan})`;
    }
    return `Minta ${formatQtyNumber(entry.qty_minta)} ${entry.satuan}`;
}

export function useConcurrentPermintaanCheck({ isOpen, ruangId, formItems }) {
    const [duplicateInfo, setDuplicateInfo] = useState({ ruang_nama: '', duplicates: [] });

    const barangIdsKey = useMemo(() => {
        const ids = Array.from(
            new Set((formItems || []).map((it) => Number(it.barang_id)).filter((id) => id > 0))
        ).sort((a, b) => a - b);
        return ids.join(',');
    }, [formItems]);

    useEffect(() => {
        if (!isOpen || !barangIdsKey) return undefined;
        let cancelled = false;
        const timer = setTimeout(() => {
            const ids = barangIdsKey.split(',').map(Number).filter(Boolean);
            checkPermintaanDuplicatesApi({ ruangId, barangIds: ids })
                .then((res) => {
                    if (!cancelled) {
                        setDuplicateInfo({
                            ruang_nama: res.ruang_nama || '',
                            duplicates: res.duplicates || [],
                        });
                    }
                })
                .catch(() => {
                    if (!cancelled) setDuplicateInfo({ ruang_nama: '', duplicates: [] });
                });
        }, 180);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isOpen, ruangId, barangIdsKey]);

    const selectedIdSet = useMemo(
        () => new Set(barangIdsKey ? barangIdsKey.split(',').map(Number) : []),
        [barangIdsKey]
    );

    const visibleDuplicates = useMemo(() => {
        if (!isOpen || !selectedIdSet.size) return [];
        return (duplicateInfo.duplicates || []).filter((d) => selectedIdSet.has(Number(d.barang_id)));
    }, [isOpen, selectedIdSet, duplicateInfo.duplicates]);

    return {
        ruangNama: duplicateInfo.ruang_nama,
        duplicates: visibleDuplicates,
    };
}
