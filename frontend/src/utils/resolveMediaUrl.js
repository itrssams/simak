/**
 * Resolves media URLs by stripping Docker internal hosts (e.g. backend:8000)
 * and converting them to relative paths so they work via Vite proxy or direct web paths.
 */
export function resolveMediaUrl(url) {
    if (!url) return '';
    if (typeof url !== 'string') return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    return url.replace(/^https?:\/\/[^/]+(\/media\/.*)/, '$1');
}

export default resolveMediaUrl;

