import apiClient from '../utils/axiosConfigs';
// ⚠️  Plain axios used ONLY for the refresh endpoint to avoid the
//     apiClient interceptor re-triggering on a 401 refresh failure.
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const authService = {
  sendRegistrationOTP: async (userData) => {
    try {
      const response = await apiClient.post('/auth/register/send-otp', userData);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to send OTP');
    }
  },

  verifyRegistrationOTP: async (otpData) => {
    try {
      const response = await apiClient.post('/auth/register/verify-otp', otpData);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to verify OTP');
    }
  },

  register: async (userData = {}) => {
    try {
      const response = await apiClient.post('/auth/register', userData);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Registration failed');
    }
  },

  login: async (credentials) => {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Login failed');
    }
  },

  // ✅ Uses plain axios — NOT apiClient — so a 401 here does NOT re-enter
  //    the interceptor and cause an infinite refresh loop.
  refreshToken: async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Token refresh failed');
    }
  },

  logout: async () => {
    try {
      const response = await apiClient.post('/auth/logout');
      return response.data;
    } catch (error) {
      console.error('Logout request failed:', error);
      return { success: false, message: 'Logout request failed' };
    }
  },

  getProfile: async (tokenOverride = null) => {
    try {
      const headers = tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : {};
      const response = await apiClient.get('/auth/profile', { headers });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to fetch profile');
    }
  },

  updateProfile: async (profileData) => {
    try {
      const response = await apiClient.put('/auth/profile', profileData);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to update profile');
    }
  },

  updateUserPassword: async (newPassword) => {
    try {
      const response = await apiClient.put('/auth/updatePassword', newPassword);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to update password');
    }
  },

  deleteUserAccount: async (accountData) => {
    try {
      const response = await apiClient.delete('/auth/deleteaccount', { data: accountData });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to delete account');
    }
  },

  verifyToken: async () => {
    try {
      const response = await apiClient.get('/auth/verify');
      return response.data.data;
    } catch (error) {
      throw new Error('Token verification failed');
    }
  },

  startGoogleOAuth: async () => {
    try {
      const response = await apiClient.get('/auth/google/start');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to start Google OAuth');
    }
  },

  verifyMFAOtp: async ({ userId, otp }) => {
    try {
      const response = await apiClient.post('/auth/mfa/verify', { userId, otp });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || 'MFA verification failed');
    }
  },
};