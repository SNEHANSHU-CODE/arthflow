import apiClient from '../utils/axiosConfigs';

const reminderService = {
  async getReminders() {
    const response = await apiClient.get('/reminders');
    return response.data;
  },
  
  async createReminder(data) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await apiClient.post('/reminders', { ...data, timeZone });
    return response.data;
  },
  
  async deleteReminder(id) {
    const response = await apiClient.delete(`/reminders/${id}`);
    return response.data;
  },
  
  async updateReminder(id, data) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await apiClient.put(`/reminders/${id}`, { ...data, timeZone });
    return response.data;
  },
  
  async googleConnect() {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await apiClient.post('/google', { timeZone });
    return response.data;
  }
};

export default reminderService;