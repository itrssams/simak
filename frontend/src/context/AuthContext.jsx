import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axiosConfig';

const AuthContext = createContext();

const resolveMediaUrl = (url) => {
    if (!url) return null;
    if (typeof url === 'string' && url.includes('backend:8000')) {
        return url.replace(/^https?:\/\/backend:8000/, '');
    }
    return url;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchUserData = async () => {
        try {
            const res = await api.get('/auth/me/');
            const data = res.data;
            if (data && data.foto) {
                data.foto = resolveMediaUrl(data.foto);
            }
            setUser(data);
        } catch {
            setUser(null);
            localStorage.clear();
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchUserData().finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (username, password) => {
        const res = await api.post('/auth/login/', { username, password });
        localStorage.setItem('access_token', res.data.access);
        localStorage.setItem('refresh_token', res.data.refresh);
        await fetchUserData();
        return res.data;
    };

    const logout = () => {
        localStorage.clear();
        setUser(null);
    };

    const updateUser = (patch) => {
        setUser(prev => {
            if (!prev) return prev;
            const updated = { ...prev, ...patch };
            if (updated.foto) {
                updated.foto = resolveMediaUrl(updated.foto);
            }
            return updated;
        });
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, refetchUser: fetchUserData, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
