import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1', withCredentials: true, headers: { 'Content-Type': 'application/json' } });
export const errorMessage = (error) => error.response?.data?.error || error.message || 'The service is temporarily unavailable.';
export default api;
