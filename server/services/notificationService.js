const mongoose = require('mongoose');
const Notification = require('../models/notificationModel');

const notificationService = {
  /**
   * Generic notification creator — for system alerts and custom messages.
   * For budget/goal notifications use the dedicated methods below.
   */
  async createNotification(userId, type, title, message, data = {}, priority = 'Medium') {
    try {
      return await Notification.create({ userId, type, title, message, data, priority });
    } catch (error) {
      console.error('[notificationService] createNotification failed:', error.message);
      return null; // Non-fatal — never crash the caller
    }
  },

  /**
   * Budget alert — delegates to model's static method.
   * Called by budgetService when spend % crosses threshold.
   */
  async createBudgetAlert(userId, budget, percentage) {
    try {
      return await Notification.createBudgetAlert(userId, budget, percentage);
    } catch (error) {
      console.error('[notificationService] createBudgetAlert failed:', error.message);
      return null;
    }
  },

  /**
   * Goal milestone — delegates to model's static method.
   * Called by goalService on contribution at 25/50/75/100%.
   */
  async createGoalMilestone(userId, goal) {
    try {
      return await Notification.createGoalMilestone(userId, goal);
    } catch (error) {
      console.error('[notificationService] createGoalMilestone failed:', error.message);
      return null;
    }
  },

  /**
   * Goal deadline alert — delegates to model's static method.
   * Called by a cron job checking upcoming goal deadlines.
   */
  async createGoalDeadlineAlert(userId, goal, daysRemaining) {
    try {
      return await Notification.createGoalDeadlineAlert(userId, goal, daysRemaining);
    } catch (error) {
      console.error('[notificationService] createGoalDeadlineAlert failed:', error.message);
      return null;
    }
  },

  /**
   * Reminder notification — called by reminderService when reminder fires.
   */
  async createReminderNotification(userId, reminder) {
    try {
      return await Notification.create({
        userId,
        type: 'savings_reminder',
        priority: 'Medium',
        title: `Reminder: ${reminder.title}`,
        message: reminder.description || `Your reminder "${reminder.title}" is due now.`,
        data: { amount: reminder.amount },
        actionUrl: '/reminders',
        actionText: 'View Reminders',
      });
    } catch (error) {
      console.error('[notificationService] createReminderNotification failed:', error.message);
      return null;
    }
  },

  /**
   * Get all notifications for a user (read + unread), newest first.
   */
  async getAll(userId, limit = 50) {
    return Notification.getRecent(userId, limit);
  },

  /**
   * Get only unread notifications — used by chat server poller.
   */
  async getUnread(userId) {
    return Notification.getUnread(userId);
  },

  /**
   * Unread count — for bell badge.
   */
  async getUnreadCount(userId) {
    return Notification.getUnreadCount(userId);
  },

  /**
   * Mark all unread as read — called when user opens notification panel.
   */
  async markAllRead(userId) {
    const result = await Notification.markAllAsRead(userId);
    return result.modifiedCount;
  },

  /**
   * Mark single notification as read.
   * userId guard prevents accessing other users' notifications.
   */
  async markOneRead(notificationId, userId) {
    const notification = await Notification.findOne({ _id: notificationId, userId });
    if (!notification) return null;
    return notification.markAsRead();
  },

  /**
   * Delete single notification with userId ownership guard.
   */
  async deleteOne(notificationId, userId) {
    const result = await Notification.findOneAndDelete({
      _id: notificationId,
      userId: userId,
    });
    return !!result;
  },
};

module.exports = notificationService;