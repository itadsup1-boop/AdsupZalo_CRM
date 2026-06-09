import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Use Vue Router dynamically to avoid circular dependencies
      import('@/router/index').then(({ router }) => {
        const currentPath = router.currentRoute.value.path;
        if (currentPath !== '/login' && currentPath !== '/setup' && currentPath !== '/') {
          router.replace('/login');
        }
      }).catch((err) => {
        console.error('Failed to import router in API interceptor:', err);
      });
    }
    return Promise.reject(error);
  },
);

export { api };
