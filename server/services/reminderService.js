const Reminder = require('../models/reminderModel');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const { google } = require('googleapis');
const { getGoogleTokens, saveGoogleTokens } = require('../utils/googleTokenCache');
const User = require('../models/userModel');

class ReminderService {
  async getReminders(userId) {
    return await Reminder.find({ userId }).sort({ date: 1 });
  }

  async ensureGoogleAccess(userId) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        process.env.GOOGLE_CALENDAR_REDIRECT_URI
      );

      // Try to get tokens from Redis first
      let tokens = await getGoogleTokens(userId);

      // If missing or expired tokens, fallback to DB
      if (!tokens || !tokens.access_token) {
        console.log('No valid tokens in Redis, checking DB for refresh token...');
        
        const user = await User.findById(userId);
        if (!user || !user.googleRefreshToken) {
          throw new Error('Google account not connected. Please connect your Google account first.');
        }

        // Use refresh token to get new access token
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          tokens = credentials;
          
          // Save the refreshed tokens to Redis
          await saveGoogleTokens(userId, tokens);
          console.log('Access token refreshed successfully');
        } catch (refreshError) {
          console.error('Failed to refresh access token:', refreshError);
          throw new Error('Failed to refresh Google access token. Please reconnect your Google account.');
        }
      }

      // Set credentials
      oauth2Client.setCredentials(tokens);
      
      // Verify token validity with a test call
      try {
        await oauth2Client.getAccessToken();
      } catch (validationError) {
        console.error('Token validation failed:', validationError);
        throw new Error('Google access token is invalid. Please reconnect your Google account.');
      }

      return google.calendar({ version: 'v3', auth: oauth2Client });
      
    } catch (error) {
      console.error('Error in ensureGoogleAccess:', error);
      throw error;
    }
  }

  async addToGoogleCalendar(userId, reminder) {
    try {
      const calendar = await this.ensureGoogleAccess(userId);

      const event = {
        summary: reminder.title,
        description: reminder.description || '',
        start: {
          dateTime: new Date(reminder.date).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        end: {
          dateTime: new Date(new Date(reminder.date).getTime() + 60 * 60 * 1000).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      reminder.calendarEventId = response.data.id;
      await reminder.save();
      
      console.log(`Added reminder "${reminder.title}" to Google Calendar`);
    } catch (error) {
      console.error('Error adding to Google Calendar:', error);
      throw error;
    }
  }

  async updateGoogleCalendarEvent(userId, reminder) {
    if (!reminder.calendarEventId) return;
    
    try {
      const calendar = await this.ensureGoogleAccess(userId);

      const updatedEvent = {
        summary: reminder.title,
        description: reminder.description || '',
        start: {
          dateTime: new Date(reminder.date).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        end: {
          dateTime: new Date(new Date(reminder.date).getTime() + 60 * 60 * 1000).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
      };

      await calendar.events.update({
        calendarId: 'primary',
        eventId: reminder.calendarEventId,
        requestBody: updatedEvent,
      });
      
      console.log(`Updated reminder "${reminder.title}" in Google Calendar`);
    } catch (error) {
      console.error('Error updating Google Calendar event:', error);
      throw error;
    }
  }

  async deleteGoogleCalendarEvent(userId, eventId) {
    if (!eventId) return;
    
    try {
      const calendar = await this.ensureGoogleAccess(userId);
      await calendar.events.delete({ calendarId: 'primary', eventId });
      console.log(`Deleted event ${eventId} from Google Calendar`);
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error);
      throw error;
    }
  }

  async createReminder(userId, data) {
    const { title, date, description } = data;
    if (!title || !date) throw new Error('Title and date are required');

    const reminder = new Reminder({
      userId,
      title: title.trim(),
      date: new Date(date),
      description: description?.trim() || '',
    });

    const saved = await reminder.save();

    // Try to sync to Google Calendar
    try {
      await this.addToGoogleCalendar(userId, saved);
    } catch (err) {
      console.warn(`Reminder saved but not synced to Google: ${err.message}`);
    }

    return saved;
  }

  async updateReminder(reminderId, userId, data) {
    const reminder = await Reminder.findOne({ _id: reminderId, userId });
    if (!reminder) throw new Error('Reminder not found');

    if (data.title !== undefined) reminder.title = data.title.trim();
    if (data.date !== undefined) reminder.date = new Date(data.date);
    if (data.description !== undefined) reminder.description = data.description.trim();

    const updated = await reminder.save();

    // Try to update in Google Calendar
    try {
      await this.updateGoogleCalendarEvent(userId, updated);
    } catch (err) {
      console.warn(`Reminder updated but not synced to Google: ${err.message}`);
    }
    
    return updated;
  }

  async deleteReminder(reminderId, userId) {
    const reminder = await Reminder.findOneAndDelete({ _id: reminderId, userId });
    if (!reminder) throw new Error('Reminder not found');

    // Try to delete from Google Calendar
    try {
      await this.deleteGoogleCalendarEvent(userId, reminder.calendarEventId);
    } catch (err) {
      console.warn(`Reminder deleted but not removed from Google: ${err.message}`);
    }
    
    return reminder;
  }

  async syncAllRemindersToGoogle(userId) {
    const reminders = await Reminder.find({ userId });
    let syncedCount = 0;
    
    for (const reminder of reminders) {
      if (!reminder.calendarEventId) {
        try {
          await this.addToGoogleCalendar(userId, reminder);
          syncedCount++;
        } catch (e) {
          console.warn(`Failed to sync reminder "${reminder.title}" for user ${userId}:`, e.message);
        }
      }
    }
    
    console.log(`Synced ${syncedCount} reminders to Google Calendar for user ${userId}`);
    return syncedCount;
  }

  async getUpcomingReminders() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // look back 24 hours
    return await Reminder.find({
      date: { $gte: windowStart, $lte: windowEnd },
      isSent: false
    }).populate('userId', 'email');
  }

  shouldSendNow(reminderDate) {
    const now = new Date();
    const diff = Math.floor((reminderDate - now) / (60 * 1000));
    return diff <= 5;
  }

  async checkAndSendReminders() {
    const reminders = await this.getUpcomingReminders();

    for (const reminder of reminders) {
      const { userId, title, date, description } = reminder;
      if (!userId?.email || !this.shouldSendNow(date)) continue;
      
      try {
        await emailService.sendReminderEmail(userId.email, { title, date, description });

        // Mark as sent so the next cron tick doesn't re-send it
        await Reminder.findByIdAndUpdate(reminder._id, { isSent: true });

        // Fire in-app notification after successful email send
        notificationService.createReminderNotification(userId._id, reminder).catch(err =>
          console.error(`[reminderService] notification error for "${title}":`, err.message)
        );
      } catch (error) {
        console.error(`Failed to send reminder email for "${title}":`, error);
      }
    }
  }
}

module.exports = new ReminderService();