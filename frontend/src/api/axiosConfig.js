import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Otomatis tambahin token ke setiap request
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Kalau token expired, auto refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true;
            try {
                const refresh = localStorage.getItem('refresh_token');
                const res = await axios.post(`${BASE_URL}/auth/refresh/`, {
                    refresh,
                });
                localStorage.setItem('access_token', res.data.access);
                original.headers.Authorization = `Bearer ${res.data.access}`;
                return api(original);
            } catch {
                localStorage.clear();
                // Hanya redirect ke login jika bukan dari endpoint login
                if (!original.url?.includes('/auth/login/')) {
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
