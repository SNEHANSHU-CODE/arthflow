// controllers/goalController.js
const goalService = require('../services/goalService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class GoalController {
  // Create a new goal
  async createGoal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const goalData = {
        ...req.body,
        userId: req.user.userId || req.user.id || req.user._id
      };

      const goal = await goalService.createGoal(goalData);

      res.status(201).json({
        success: true,
        message: 'Goal created successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error creating goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create goal',
        error: error.message
      });
    }
  }

  // Get goals with filtering
  async getGoals(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const goals = await goalService.getGoals(req.userId, req.query);

      res.json({
        success: true,
        data: goals
      });
    } catch (error) {
      console.error('Error fetching goals:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch goals',
        error: error.message
      });
    }
  }

  // Get goal by ID
  async getGoalById(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const goal = await goalService.getGoalById(req.params.id, req.userId);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        data: goal
      });
    } catch (error) {
      console.error('Error fetching goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch goal',
        error: error.message
      });
    }
  }

  // Update goal
  async updateGoal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const goal = await goalService.updateGoal(req.params.id, req.userId, req.body);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Goal updated successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error updating goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update goal',
        error: error.message
      });
    }
  }

  // Delete goal
  async deleteGoal(req, res) {
    try {
      const result = await goalService.deleteGoal(req.params.id, req.userId);
      console.log('goalcontro', req.userId)
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Goal deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete goal',
        error: error.message
      });
    }
  }

  // Add contribution to goal
  async addContribution(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const goal = await goalService.addContribution(
        req.params.id,
        req.userId,
        req.body.amount
      );

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Contribution added successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error adding contribution:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add contribution',
        error: error.message
      });
    }
  }

  // Mark goal as complete
  async markGoalComplete(req, res) {
    try {
      const goal = await goalService.markGoalComplete(req.params.id, req.userId);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Goal marked as complete',
        data: goal
      });
    } catch (error) {
      console.error('Error marking goal complete:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark goal as complete',
        error: error.message
      });
    }
  }

  // Pause goal
  async pauseGoal(req, res) {
    try {
      const goal = await goalService.pauseGoal(req.params.id, req.userId);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Goal paused successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error pausing goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pause goal',
        error: error.message
      });
    }
  }

  // Resume goal
  async resumeGoal(req, res) {
    try {
      const goal = await goalService.resumeGoal(req.params.id, req.userId);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Goal resumed successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error resuming goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resume goal',
        error: error.message
      });
    }
  }

  // Get goals by category
  async getGoalsByCategory(req, res) {
    try {
      const goals = await goalService.getGoalsByCategory(
        req.userId,
        req.params.category
      );

      res.json({
        success: true,
        data: goals
      });
    } catch (error) {
      console.error('Error fetching goals by category:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch goals by category',
        error: error.message
      });
    }
  }

  // Get goals by priority
  async getGoalsByPriority(req, res) {
    try {
      const goals = await goalService.getGoalsByPriority(
        req.userId,
        req.params.priority
      );

      res.json({
        success: true,
        data: goals
      });
    } catch (error) {
      console.error('Error fetching goals by priority:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch goals by priority',
        error: error.message
      });
    }
  }

  // Get overdue goals
  async getOverdueGoals(req, res) {
    try {
      const goals = await goalService.getOverdueGoals(req.userId);

      res.json({
        success: true,
        data: goals
      });
    } catch (error) {
      console.error('Error fetching overdue goals:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch overdue goals',
        error: error.message
      });
    }
  }

  // Get dashboard stats
  async getDashboardStats(req, res) {
    try {
      const stats = await goalService.getDashboardStats(req.userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard stats',
        error: error.message
      });
    }
  }

  // Get goals summary
  async getGoalsSummary(req, res) {
    try {
      const summary = await goalService.getGoalsSummary(req.userId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching goals summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch goals summary',
        error: error.message
      });
    }
  }

  // Bulk delete goals
  async bulkDeleteGoals(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const result = await goalService.bulkDeleteGoals(
        req.body.goalIds,
        req.userId
      );

      res.json({
        success: true,
        message: `${result.deletedCount} goals deleted successfully`,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      console.error('Error bulk deleting goals:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete goals',
        error: error.message
      });
    }
  }

  // Migrate guest data to user account (one-time operation)
  async migrateGuestData(req, res) {
    try {
      const userId = req.user.userId || req.user.id || req.user._id;
      const { goals } = req.body;

      if (!goals || !Array.isArray(goals)) {
        return res.status(400).json({
          success: false,
          message: 'Goals array is required'
        });
      }

      // Check if user has already migrated guest data
      const existingMigration = await goalService.checkGuestMigration(userId);
      if (existingMigration) {
        return res.status(400).json({
          success: false,
          message: 'Guest data has already been migrated for this account'
        });
      }

      const result = await goalService.migrateGuestData(userId, goals);
      
      res.status(200).json({
        success: true,
        message: 'Guest data migrated successfully',
        data: result
      });
    } catch (error) {
      console.error('Migrate guest data error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to migrate guest data',
        error: error.message
      });
    }
  }
}

module.exports = new GoalController();