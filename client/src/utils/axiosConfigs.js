import axios from 'axios';

// Cache for store to avoid multiple dynamic imports
let storeCache = null;

// BUG 1 FIX: storeCache was never invalidated, but more importantly the dynamic
// import path must match wherever store.js actually lives in your project.
// If your store is at src/store/store.js this should be '../store/store'
// If it's at src/app/store.js this should be '../app/store'  ← keep as-is if correct
const getStore = async () => {
    if (!storeCache) {
        const module = await import('../app/store');
        storeCache = module.store;
    }
    return storeCache;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    async (config) => {
        try {
            const currentStore = await getStore();
            const state = currentStore.getState();
            const token = state.auth.accessToken;

            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.warn('Could not get store in request interceptor:', error);
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// BUG 2 FIX: isRefreshing flag + queue prevent multiple simultaneous 401s
// each firing their own refresh, causing race conditions and the second one
// always failing (refresh token already used / rotated).
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

export const refreshTokenShared = async () => {
    if (isRefreshing) {
        return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;
    try {
        const refreshResponse = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true }
        );

        const newAccessToken =
            refreshResponse.data?.data?.accessToken ||
            refreshResponse.data?.accessToken;
        const newUser =
            refreshResponse.data?.data?.user ||
            refreshResponse.data?.user;

        if (!newAccessToken) throw new Error('No access token in refresh response');

        const { setCredentials } = await import('../app/authSlice');
        const currentStore = await getStore();
        currentStore.dispatch(setCredentials({ accessToken: newAccessToken, user: newUser }));

        const { default: sessionManager } = await import('../utils/sessionManager');
        if (!sessionManager.getSession()) {
            sessionManager.createSession(newUser, newAccessToken);
        } else {
            sessionManager.extendSession();
        }

        processQueue(null, newAccessToken);
        return newAccessToken;
    } catch (refreshError) {
        processQueue(refreshError, null);
        const { clearCredentials } = await import('../app/authSlice');
        const currentStore = await getStore();
        currentStore.dispatch(clearCredentials());
        return Promise.reject(refreshError);
    } finally {
        isRefreshing = false;
    }
};

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Only attempt refresh on 401, and never on the refresh endpoint itself
        // BUG 3 FIX: Without the /auth/refresh guard, a failed refresh (which also
        // returns 401) re-enters this interceptor and causes an infinite loop.
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/auth/refresh')
        ) {
            originalRequest._retry = true;

            // BUG 2 FIX: If a refresh is already in progress, queue this request
            // instead of firing another refresh in parallel.
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return apiClient(originalRequest);
                }).catch(err => Promise.reject(err));
            }

            try {
                const newAccessToken = await refreshTokenShared();
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;