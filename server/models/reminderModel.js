const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  date: {
    type: Date,
    required: true
  },
  calendarEventId: {
    type: String,
    default: null // Will be used when syncing to Google Calendar
  },
  description: {
    type: String,
    trim: true,
    default: null
  },
  timeZone: {
    type: String,
    default: 'UTC'
  },
  amount: {
    type: Number,
    default: null
  },
  isSent: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

reminderSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
