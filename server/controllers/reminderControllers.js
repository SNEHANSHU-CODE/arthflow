// controllers/reminderControllers.js (Fixed)
const reminderService = require('../services/reminderService');

class ReminderController {
  async getReminders(req, res) {
    try {
      const userId = req.userId;
      const reminders = await reminderService.getReminders(userId);
      res.status(200).json({ success: true, reminders });
    } catch (error) {
      console.error('Get reminders error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async createReminder(req, res) {
    try {
      const userId = req.userId;
      const reminder = await reminderService.createReminder(userId, req.body);
      res.status(201).json({ success: true, reminder });
    } catch (error) {
      console.error('Create reminder error:', error);
      if (error.code === 'GOOGLE_TOKEN_EXPIRED') {
        // The reminder WAS saved to DB — the throw happened after save().
        // Re-fetch the latest reminder for this user so the frontend can
        // display it even though the Google sync failed.
        const Reminder = require('../models/reminderModel');
        const latest = await Reminder.findOne({ userId: req.userId }).sort({ createdAt: -1 });
        return res.status(201).json({
          success: true,
          reminder: latest,
          googleError: 'GOOGLE_TOKEN_EXPIRED',
          googleMessage: error.message,
        });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateReminder(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const reminder = await reminderService.updateReminder(id, userId, req.body);
      res.status(200).json({ success: true, reminder });
    } catch (error) {
      console.error('Update reminder error:', error);
      if (error.code === 'GOOGLE_TOKEN_EXPIRED') {
        return res.status(200).json({
          success: true,
          reminder: null,
          googleError: 'GOOGLE_TOKEN_EXPIRED',
          googleMessage: error.message,
        });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteReminder(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const reminder = await reminderService.deleteReminder(id, userId, req.body);
      res.status(200).json({ success: true, reminder });
    } catch (error) {
      console.error('Delete reminder error:', error);
      if (error.code === 'GOOGLE_TOKEN_EXPIRED') {
        return res.status(200).json({
          success: true,
          reminder: null,
          googleError: 'GOOGLE_TOKEN_EXPIRED',
          googleMessage: error.message,
        });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new ReminderController();
