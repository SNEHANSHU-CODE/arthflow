const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Profile ID is required'],
    index: true
  },
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: [
      'budget_alert',
      'budget_exceeded',
      'goal_milestone',
      'goal_deadline',
      'goal_completed',
      'monthly_report',
      'weekly_report',
      'large_expense',
      'recurring_payment',
      'low_balance',
      'savings_reminder',
      'system_update',
      'security_alert',
      'session_terminated'
    ]
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  data: {
    // Additional data related to the notification
    budgetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Budget'
    },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal'
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    amount: Number,
    category: String,
    threshold: Number,
    percentage: Number
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  isEmailSent: {
    type: Boolean,
    default: false
  },
  isPushSent: {
    type: Boolean,
    default: false
  },
  scheduledFor: {
    type: Date,
    default: Date.now
  },
  actionUrl: {
    type: String // URL to redirect when notification is clicked
  },
  actionText: {
    type: String // Text for action button
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, type: 1 });

// Virtual for time elapsed since creation
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return this.createdAt.toLocaleDateString();
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Method to mark as unread
notificationSchema.methods.markAsUnread = function() {
  this.isRead = false;
  this.readAt = null;
  return this.save();
};

// Static method to get unread notifications
notificationSchema.statics.getUnread = function(userId, limit = 10) {
  return this.find({ userId, isRead: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('data.budgetId', 'category budgetAmount')
    .populate('data.goalId', 'name targetAmount')
    .populate('data.transactionId', 'description amount');
};

// Static method to get recent notifications
notificationSchema.statics.getRecent = function(userId, limit = 20) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('data.budgetId', 'category budgetAmount')
    .populate('data.goalId', 'name targetAmount')
    .populate('data.transactionId', 'description amount');
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

// Static method to create budget alert notification
notificationSchema.statics.createBudgetAlert = async function(userId, budget, percentage) {
  const notification = new this({
    userId,
    type: percentage >= 100 ? 'budget_exceeded' : 'budget_alert',
    priority: percentage >= 100 ? 'High' : 'Medium',
    title: percentage >= 100 ? 'Budget Exceeded!' : 'Budget Alert',
    message: percentage >= 100 
      ? `You've exceeded your ${budget.category} budget by ${percentage - 100}%`
      : `You've used ${percentage}% of your ${budget.category} budget`,
    data: {
      budgetId: budget._id,
      category: budget.category,
      threshold: budget.alertThreshold,
      percentage,
      amount: budget.spentAmount
    },
    actionUrl: '/budgets',
    actionText: 'View Budget'
  });
  
  return notification.save();
};

// Static method to create goal milestone notification
notificationSchema.statics.createGoalMilestone = async function(userId, goal) {
  const percentage = Math.round((goal.savedAmount / goal.targetAmount) * 100);
  
  const notification = new this({
    userId,
    type: goal.savedAmount >= goal.targetAmount ? 'goal_completed' : 'goal_milestone',
    priority: goal.savedAmount >= goal.targetAmount ? 'High' : 'Medium',
    title: goal.savedAmount >= goal.targetAmount ? 'Goal Achieved!' : 'Goal Milestone',
    message: goal.savedAmount >= goal.targetAmount 
      ? `Congratulations! You've completed your "${goal.name}" goal`
      : `Great progress! You've reached ${percentage}% of your "${goal.name}" goal`,
    data: {
      goalId: goal._id,
      amount: goal.savedAmount,
      percentage
    },
    actionUrl: '/goals',
    actionText: 'View Goal'
  });
  
  return notification.save();
};

// Static method to create goal deadline notification
notificationSchema.statics.createGoalDeadlineAlert = async function(userId, goal, daysRemaining) {
  const notification = new this({
    userId,
    type: 'goal_deadline',
    priority: daysRemaining <= 7 ? 'High' : 'Medium',
    title: 'Goal Deadline Approaching',
    message: daysRemaining <= 0 
      ? `Your "${goal.name}" goal deadline has passed`
      : `Only ${daysRemaining} days left for your "${goal.name}" goal`,
    data: {
      goalId: goal._id,
      amount: goal.remainingAmount
    },
    actionUrl: '/goals',
    actionText: 'View Goal'
  });
  
  return notification.save();
};

// Static method to cleanup old notifications
notificationSchema.statics.cleanupOld = function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: cutoffDate } });
};

module.exports = mongoose.model('Notification', notificationSchema);