const Goal = require('../models/goalModel');
const mongoose = require('mongoose');
const notificationService = require('./notificationService');

class GoalService {
  // Create a new goal
  async createGoal(goalData) {
    try {
      const goal = new Goal(goalData);
      await goal.save();
      return goal;
    } catch (error) {
      throw new Error(`Failed to create goal: ${error.message}`);
    }
  }

  // Get goals with filtering and sorting
  async getGoals(userId, filters = {}) {
    try {
      const {
        status,
        category,
        priority,
        sortBy = 'targetDate',
        sortOrder = 'asc',
        limit,
        skip
      } = filters;

      const query = { userId };

      // Apply filters
      if (status) query.status = status;
      if (category) query.category = category;
      if (priority) query.priority = priority;

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      let goalQuery = Goal.find(query).sort(sort);

      // Apply pagination
      if (skip) goalQuery = goalQuery.skip(parseInt(skip));
      if (limit) goalQuery = goalQuery.limit(parseInt(limit));

      const goals = await goalQuery.exec();
      return goals;
    } catch (error) {
      throw new Error(`Failed to fetch goals: ${error.message}`);
    }
  }

  // Get goal by ID
  async getGoalById(goalId, userId) {
    try {
      const goal = await Goal.findOne({ _id: goalId, userId });
      return goal;
    } catch (error) {
      throw new Error(`Failed to fetch goal: ${error.message}`);
    }
  }

  // Update goal
  async updateGoal(goalId, userId, updateData) {
    try {
      // Whitelist only the fields a user is allowed to change via the edit form.
      // This prevents mass assignment of internal fields (savedAmount, status,
      // userId, isGuestMigrated, migratedAt) even if a client sends them.
      // Status transitions are handled by dedicated methods (pauseGoal, resumeGoal, markGoalComplete).
      const ALLOWED_FIELDS = ['name', 'category', 'priority', 'targetAmount', 'targetDate', 'description'];
      const safeUpdate = {};
      for (const key of ALLOWED_FIELDS) {
        if (updateData[key] !== undefined) {
          safeUpdate[key] = updateData[key];
        }
      }

      const goal = await Goal.findOneAndUpdate(
        { _id: goalId, userId },
        safeUpdate,
        { new: true, runValidators: true }
      );
      return goal;
    } catch (error) {
      throw new Error(`Failed to update goal: ${error.message}`);
    }
  }

  // Delete goal
  async deleteGoal(goalId, userId) {
    try {
      const result = await Goal.findOneAndDelete({ _id: goalId, userId });
      return result;
    } catch (error) {
      throw new Error(`Failed to delete goal: ${error.message}`);
    }
  }

  // Add contribution to goal
  async addContribution(goalId, userId, amount) {
    try {
      const goal = await Goal.findOne({ _id: goalId, userId });
      
      if (!goal) {
        return null;
      }

      const prevPercentage = Math.round((goal.savedAmount / goal.targetAmount) * 100);
      await goal.updateSavedAmount(amount);
      const newPercentage = Math.round((goal.savedAmount / goal.targetAmount) * 100);

      // Fire milestone notification at 25, 50, 75, 100%
      const milestones = [25, 50, 75, 100];
      const crossedMilestone = milestones.find(
        m => prevPercentage < m && newPercentage >= m
      );

      if (crossedMilestone) {
        notificationService.createGoalMilestone(userId, goal).catch(err =>
          console.error('[goalService] notification error:', err.message)
        );
      }

      return goal;
    } catch (error) {
      throw new Error(`Failed to add contribution: ${error.message}`);
    }
  }

  // Mark goal as complete
  async markGoalComplete(goalId, userId) {
    try {
      const goal = await Goal.findOneAndUpdate(
        { _id: goalId, userId },
        { 
          status: 'Completed',
          completedDate: new Date()
        },
        { new: true }
      );

      if (goal) {
        notificationService.createGoalMilestone(userId, goal).catch(err =>
          console.error('[goalService] notification error:', err.message)
        );
      }

      return goal;
    } catch (error) {
      throw new Error(`Failed to mark goal complete: ${error.message}`);
    }
  }

  // Pause goal
  async pauseGoal(goalId, userId) {
    try {
      const goal = await Goal.findOneAndUpdate(
        { _id: goalId, userId },
        { status: 'Paused' },
        { new: true }
      );
      return goal;
    } catch (error) {
      throw new Error(`Failed to pause goal: ${error.message}`);
    }
  }

  // Resume goal
  async resumeGoal(goalId, userId) {
    try {
      const goal = await Goal.findOneAndUpdate(
        { _id: goalId, userId },
        { status: 'Active' },
        { new: true }
      );
      return goal;
    } catch (error) {
      throw new Error(`Failed to resume goal: ${error.message}`);
    }
  }

  // Get goals by category
  async getGoalsByCategory(userId, category) {
    try {
      const goals = await Goal.find({ userId, category })
        .sort({ targetDate: 1 });
      return goals;
    } catch (error) {
      throw new Error(`Failed to fetch goals by category: ${error.message}`);
    }
  }

  // Get goals by priority
  async getGoalsByPriority(userId, priority) {
    try {
      const goals = await Goal.find({ userId, priority })
        .sort({ targetDate: 1 });
      return goals;
    } catch (error) {
      throw new Error(`Failed to fetch goals by priority: ${error.message}`);
    }
  }

  // Get overdue goals
  async getOverdueGoals(userId) {
    try {
      const today = new Date();
      const goals = await Goal.find({
        userId,
        targetDate: { $lt: today },
        status: { $ne: 'Completed' }
      }).sort({ targetDate: 1 });
      return goals;
    } catch (error) {
      throw new Error(`Failed to fetch overdue goals: ${error.message}`);
    }
  }

  // Get dashboard stats
  async getDashboardStats(userId) {
    try {
      const goals = await Goal.find({ userId });
      const today = new Date();

      const stats = {
        totalGoals: goals.length,
        activeGoals: goals.filter(g => g.status === 'Active').length,
        completedGoals: goals.filter(g => g.status === 'Completed').length,
        pausedGoals: goals.filter(g => g.status === 'Paused').length,
        overdueGoals: goals.filter(g => 
          g.targetDate < today && g.status !== 'Completed'
        ).length,
        totalTargetAmount: goals.reduce((sum, g) => sum + g.targetAmount, 0),
        totalSavedAmount: goals.reduce((sum, g) => sum + g.savedAmount, 0),
        averageProgress: goals.length > 0 ? 
          Math.round(goals.reduce((sum, g) => sum + g.progressPercentage, 0) / goals.length) : 0,
        goalsByCategory: this._getGoalsByCategory(goals),
        goalsByPriority: this._getGoalsByPriority(goals),
        recentlyCompleted: goals
          .filter(g => g.status === 'Completed' && g.completedDate)
          .sort((a, b) => b.completedDate - a.completedDate)
          .slice(0, 5),
        upcomingDeadlines: goals
          .filter(g => g.status === 'Active' && g.targetDate > today)
          .sort((a, b) => a.targetDate - b.targetDate)
          .slice(0, 5)
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }
  }

  // Get goals summary
  async getGoalsSummary(userId) {
    try {
      return await Goal.getSummaryByProfile(userId);
    } catch (error) {
      throw new Error(`Failed to fetch goals summary: ${error.message}`);
    }
  }

  // Bulk delete goals
  async bulkDeleteGoals(goalIds, userId) {
    try {
      // Validate all goal IDs
      const validIds = goalIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      
      if (validIds.length !== goalIds.length) {
        throw new Error('Some goal IDs are invalid');
      }

      const result = await Goal.deleteMany({
        _id: { $in: validIds },
        userId
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to bulk delete goals: ${error.message}`);
    }
  }

  // Helper method to categorize goals by category
  _getGoalsByCategory(goals) {
    const categories = {};
    goals.forEach(goal => {
      if (!categories[goal.category]) {
        categories[goal.category] = {
          count: 0,
          totalTarget: 0,
          totalSaved: 0
        };
      }
      categories[goal.category].count++;
      categories[goal.category].totalTarget += goal.targetAmount;
      categories[goal.category].totalSaved += goal.savedAmount;
    });
    return categories;
  }

  // Helper method to categorize goals by priority
  _getGoalsByPriority(goals) {
    const priorities = {};
    goals.forEach(goal => {
      if (!priorities[goal.priority]) {
        priorities[goal.priority] = {
          count: 0,
          totalTarget: 0,
          totalSaved: 0
        };
      }
      priorities[goal.priority].count++;
      priorities[goal.priority].totalTarget += goal.targetAmount;
      priorities[goal.priority].totalSaved += goal.savedAmount;
    });
    return priorities;
  }

  // Get goals nearing deadline (within specified days)
  async getGoalsNearingDeadline(userId, days = 30) {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const goals = await Goal.find({
        userId,
        status: 'Active',
        targetDate: {
          $gte: new Date(),
          $lte: futureDate
        }
      }).sort({ targetDate: 1 });

      return goals;
    } catch (error) {
      throw new Error(`Failed to fetch goals nearing deadline: ${error.message}`);
    }
  }

  // Calculate monthly savings needed for goals
  async calculateMonthlySavingsNeeded(userId) {
    try {
      const activeGoals = await Goal.find({
        userId,
        status: 'Active'
      });

      const today = new Date();
      const goalsWithMonthlySavings = activeGoals.map(goal => {
        const remainingAmount = goal.remainingAmount;
        const monthsRemaining = Math.max(1, Math.ceil(goal.daysRemaining / 30));
        const monthlySavingsNeeded = remainingAmount / monthsRemaining;

        return {
          ...goal.toObject(),
          monthlySavingsNeeded: Math.round(monthlySavingsNeeded * 100) / 100,
          monthsRemaining
        };
      });

      const totalMonthlySavingsNeeded = goalsWithMonthlySavings.reduce(
        (sum, goal) => sum + goal.monthlySavingsNeeded, 0
      );

      return {
        goals: goalsWithMonthlySavings,
        totalMonthlySavingsNeeded: Math.round(totalMonthlySavingsNeeded * 100) / 100
      };
    } catch (error) {
      throw new Error(`Failed to calculate monthly savings needed: ${error.message}`);
    }
  }

  // Check if user has already migrated guest data
  async checkGuestMigration(userId) {
    try {
      const existingGoal = await Goal.findOne({
        userId,
        isGuestMigrated: true
      });
      return !!existingGoal;
    } catch (error) {
      console.error('Error checking guest migration:', error);
      return false;
    }
  }

  // Migrate guest data to user account
  async migrateGuestData(userId, goals) {
    try {
      const migratedGoals = [];

      for (const guestGoal of goals) {
        const goal = new Goal({
          userId,
          name: guestGoal.name,
          description: guestGoal.description,
          targetAmount: guestGoal.targetAmount,
          currentAmount: guestGoal.currentAmount || 0,
          category: guestGoal.category,
          priority: guestGoal.priority || 'medium',
          targetDate: guestGoal.targetDate,
          status: guestGoal.status || 'active',
          isGuestMigrated: true,
          migratedAt: new Date()
        });

        await goal.save();
        migratedGoals.push(goal);
      }

      return {
        success: true,
        message: `${migratedGoals.length} goals migrated successfully`,
        data: {
          migratedCount: migratedGoals.length,
          goals: migratedGoals
        }
      };
    } catch (error) {
      console.error('Error migrating guest data:', error);
      throw error;
    }
  }
}

module.exports = new GoalService();