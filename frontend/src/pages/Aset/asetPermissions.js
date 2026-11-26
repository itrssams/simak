export function getUserUnitId(user) {
    if (!user) return null;
    if (user.unit && typeof user.unit === 'object') {
        return user.unit.id ?? null;
    }
    return user.unit ?? null;
}

export function getUserUnitName(user) {
    if (!user) return '';
    return user.unit_nama || (user.unit && typeof user.unit === 'object' ? user.unit.nama : '') || '';
}

export function isAsetManagerUser(user) {
    if (!user) return false;
    if (user.is_superuser || user.is_aset_admin) return true;
    if (['manajer', 'wakil_direktur', 'direktur'].includes(user.role)) return true;
    const unitName = getUserUnitName(user).toLowerCase();
    return user.role === 'kepala_seksi' && unitName.includes('umum');
}

export function isFinancialViewerUser(user) {
    return Boolean(isAsetManagerUser(user) || user?.is_akuntansi || user?.is_staff);
}
