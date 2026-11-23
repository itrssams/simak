export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
export const MINUTES_STEP_5 = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
export const MINUTES_STEP_1 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export const QUICK_DURATION_OPTIONS = [
    { label: '+30m', minutes: 30 },
    { label: '+1j', minutes: 60 },
    { label: '+2j', minutes: 120 },
    { label: '+4j', minutes: 240 },
];

export function toTimeHHMM(val) {
    if (!val || typeof val !== 'string') return '';
    const trimmed = val.trim();
    const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function isValidTimeHHMM(val) {
    return typeof val === 'string' && TIME_REGEX.test(val.trim());
}

export function getCurrentTimeHHMM() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

export function addMinutesToTime(hhmm, deltaMinutes) {
    const base = toTimeHHMM(hhmm) || getCurrentTimeHHMM();
    const [h, m] = base.split(':').map(Number);
    const total = (((h * 60 + m + deltaMinutes) % 1440) + 1440) % 1440;
    const nextH = String(Math.floor(total / 60)).padStart(2, '0');
    const nextM = String(total % 60).padStart(2, '0');
    return `${nextH}:${nextM}`;
}

export function calculateDurationInfo(startHHMM, endHHMM) {
    const s = toTimeHHMM(startHHMM);
    const e = toTimeHHMM(endHHMM);
    if (!s || !e) return null;
    const [h1, m1] = s.split(':').map(Number);
    const [h2, m2] = e.split(':').map(Number);
    let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    const jam = Math.floor(diffMinutes / 60);
    const menit = diffMinutes % 60;
    let label = `${menit} mnt`;
    if (jam > 0 && menit > 0) {
        label = `${jam} jam ${menit} mnt`;
    } else if (jam > 0) {
        label = `${jam} jam`;
    }
    return { minutes: diffMinutes, label };
}

export function normalizeManualTimeInput(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';

    const colonMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (colonMatch) {
        return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
    }

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 4) {
        const hh = Number(digits.slice(0, 2));
        const mm = Number(digits.slice(2, 4));
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
            return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        }
    } else if (digits.length === 3) {
        const hh = Number(digits.slice(0, 1));
        const mm = Number(digits.slice(1, 3));
        if (hh >= 0 && hh <= 9 && mm >= 0 && mm <= 59) {
            return `0${hh}:${String(mm).padStart(2, '0')}`;
        }
    } else if (digits.length === 1 || digits.length === 2) {
        const hh = Number(digits);
        if (hh >= 0 && hh <= 23) {
            return `${String(hh).padStart(2, '0')}:00`;
        }
    }
    return null;
}
