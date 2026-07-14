const Reminder = require('../models/reminderModel');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const { google } = require('googleapis');
const { getGoogleTokens, saveGoogleTokens, deleteGoogleTokens } = require('../utils/googleTokenCache');
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

      // Try to get tokens from Redis first.
      // Use expiry_date field (Google standard) instead of a round-trip API call
      // to avoid silent 401s when the token has expired but the SDK doesn't throw.
      let tokens = await getGoogleTokens(userId);
      const FIVE_MINUTES_MS = 5 * 60 * 1000;
      const tokenValid = !!(
        tokens &&
        tokens.access_token &&
        tokens.expiry_date &&
        tokens.expiry_date > Date.now() + FIVE_MINUTES_MS
      );

      if (tokenValid) {
        oauth2Client.setCredentials(tokens);
      }

      // If missing or expired tokens, fallback to DB
      if (!tokenValid) {
        console.log('No valid tokens in Redis, checking DB for refresh token...');
        
        const user = await User.findById(userId).select('+googleRefreshToken');
        if (!user || !user.googleRefreshToken) {
          console.warn(
            `[GoogleCalendar] No refresh token for user ${userId}. User must reconnect.`
          );
          return null;
        }

        // Use refresh token to get new access token
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          tokens = credentials;
          
          // Save the new access token to Redis (always)
          await saveGoogleTokens(userId, tokens);

          // ── CRITICAL: Handle Google refresh token rotation ───────────────────
          // Google can issue a NEW refresh_token alongside the new access_token.
          // If this happens and we don't save the new refresh_token to MongoDB,
          // the NEXT refresh will use the OLD (now revoked) refresh_token from DB
          // and fail with `unauthorized_client` — exactly the production bug.
          // This is why calendar stops working after ~24 hours despite "Connected".
          if (credentials.refresh_token) {
            await User.findByIdAndUpdate(userId, { googleRefreshToken: credentials.refresh_token });
            console.log('🔄 Google issued new refresh token (rotation) — saved to DB');
          }

          console.log('✅ Access token refreshed successfully');
        } catch (refreshError) {
          console.error('Failed to refresh access token:', refreshError);

          // Detect BOTH error types that mean the refresh token is permanently dead:
          //   - invalid_grant: token revoked by user, or rotated by Google
          //   - unauthorized_client: token expired (always happens after 7 days
          //     when the Google OAuth app is in "Testing" mode)
          const errorCode = refreshError.response?.data?.error || refreshError.message;
          const isDeadToken =
            errorCode === 'invalid_grant' ||
            errorCode === 'unauthorized_client';

          if (isDeadToken) {
            // The refresh token is permanently unusable. Clean it up so:
            //   1. /status returns connected=false (not a false "Connected" state)
            //   2. The UI shows the reconnect button
            //   3. We don't retry a dead token on every calendar operation
            console.warn(
              `[GoogleCalendar] Refresh token permanently expired for user ${userId} ` +
              `(error: ${errorCode}). Clearing stored token — user must reconnect.`
            );

            // Clear from MongoDB
            await User.findByIdAndUpdate(userId, { $unset: { googleRefreshToken: 1 } });

            // Clear from Redis
            await deleteGoogleTokens(userId);

            // Throw a distinct error code the frontend can react to
            const err = new Error(
              'Your Google Calendar connection has expired. Please disconnect and reconnect your Google account.'
            );
            err.code = 'GOOGLE_TOKEN_EXPIRED';
            throw err;
          }

          // Any other error (network blip, 5xx from Google) is transient — throw
          // a clear message but do NOT delete the stored refresh token.
          throw new Error('Network error. Failed to refresh Google access token. Will retry next time.');
        }
      }

      // Set credentials
      oauth2Client.setCredentials(tokens);

      return google.calendar({ version: 'v3', auth: oauth2Client });
      
    } catch (error) {
      console.error('Error in ensureGoogleAccess:', error);
      throw error;
    }
  }

  async addToGoogleCalendar(userId, reminder) {
    try {
      const calendar = await this.ensureGoogleAccess(userId);
      if (!calendar) return;

      const event = {
        summary: reminder.title,
        description: reminder.description || '',
        start: {
          dateTime: new Date(reminder.date).toISOString(),
        },
        end: {
          dateTime: new Date(new Date(reminder.date).getTime() + 60 * 60 * 1000).toISOString(),
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
      if (!calendar) return;

      const updatedEvent = {
        summary: reminder.title,
        description: reminder.description || '',
        start: {
          dateTime: new Date(reminder.date).toISOString(),
        },
        end: {
          dateTime: new Date(new Date(reminder.date).getTime() + 60 * 60 * 1000).toISOString(),
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
      if (!calendar) return;
      await calendar.events.delete({ calendarId: 'primary', eventId });
      console.log(`Deleted event ${eventId} from Google Calendar`);
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error);
      throw error;
    }
  }

  async createReminder(userId, data) {
    const { title, date, description, timeZone } = data;
    if (!title || !date) throw new Error('Title and date are required');

    const reminder = new Reminder({
      userId,
      title: title.trim(),
      date: new Date(date),
      description: description?.trim() || '',
      timeZone: timeZone || 'UTC'
    });

    const saved = await reminder.save();

    // Try to sync to Google Calendar — reminder is already saved to DB.
    // If the Google sync fails with GOOGLE_TOKEN_EXPIRED, re-throw so the
    // controller can surface it to the frontend. Any other sync error is
    // non-fatal (reminder stays saved, calendar just doesn't get it).
    try {
      await this.addToGoogleCalendar(userId, saved);
    } catch (err) {
      if (err.code === 'GOOGLE_TOKEN_EXPIRED') throw err;
      console.warn(`Reminder saved but not synced to Google: ${err.message}`);
    }

    return saved;
  }

  async updateReminder(reminderId, userId, data) {
    const reminder = await Reminder.findOne({ _id: reminderId, userId });
    if (!reminder) throw new Error('Reminder not found');

    if (data.title !== undefined) reminder.title = data.title.trim();
    if (data.date !== undefined) {
      reminder.date = new Date(data.date);
      reminder.isSent = false; // Reset sent status if date changes
    }
    if (data.description !== undefined) reminder.description = data.description.trim();
    if (data.timeZone !== undefined) reminder.timeZone = data.timeZone;

    const updated = await reminder.save();

    // Try to update in Google Calendar — reminder is already saved to DB.
    try {
      await this.updateGoogleCalendarEvent(userId, updated);
    } catch (err) {
      if (err.code === 'GOOGLE_TOKEN_EXPIRED') throw err;
      console.warn(`Reminder updated but not synced to Google: ${err.message}`);
    }

    return updated;
  }

  async deleteReminder(reminderId, userId) {
    const reminder = await Reminder.findOneAndDelete({ _id: reminderId, userId });
    if (!reminder) throw new Error('Reminder not found');

    // Try to delete from Google Calendar — reminder is already deleted from DB.
    try {
      await this.deleteGoogleCalendarEvent(userId, reminder.calendarEventId);
    } catch (err) {
      if (err.code === 'GOOGLE_TOKEN_EXPIRED') throw err;
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
      const { userId, title, date, description, calendarEventId } = reminder;
      if (!userId?.email || !this.shouldSendNow(date)) continue;
      
      // If handled by Google Calendar, skip sending email
      if (calendarEventId) {
        await Reminder.findOneAndUpdate({ _id: reminder._id, isSent: false }, { isSent: true });
        continue;
      }
      
      try {
        const lockedReminder = await Reminder.findOneAndUpdate(
          { _id: reminder._id, isSent: false },
          { isSent: true }
        );
        if (!lockedReminder) continue;

        await emailService.sendReminderEmail(userId.email, { title, date, description });

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