// Individual Bot Management Endpoints for server.js
// Add these to your existing Express server

// =============================================================================
// INDIVIDUAL BOT MANAGEMENT ENDPOINTS
// =============================================================================

// 1. Start a specific bot
app.post('/api/bots/:botId/start', async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'Bot ID is required'
      });
    }

    const result = await botManager.startBotById(botId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        bot: result.bot
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to start bot: ${error.message}`
    });
  }
});

// 2. Stop a specific bot
app.post('/api/bots/:botId/stop', async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'Bot ID is required'
      });
    }

    const result = await botManager.stopBotById(botId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        bot: result.bot
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to stop bot: ${error.message}`
    });
  }
});

// 3. Restart a specific bot
app.post('/api/bots/:botId/restart', async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'Bot ID is required'
      });
    }

    const result = await botManager.restartBotById(botId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        bot: result.bot
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to restart bot: ${error.message}`
    });
  }
});

// 4. Get status of a specific bot
app.get('/api/bots/:botId/status', async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'Bot ID is required'
      });
    }

    const result = await botManager.getBotStatus(botId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        bot: result.bot
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get bot status: ${error.message}`
    });
  }
});

// 5. List all available bots
app.get('/api/bots', async (req, res) => {
  try {
    const result = await botManager.listAvailableBots();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        total_bots: result.total_bots,
        running_bots: result.running_bots,
        bots: result.bots
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to list bots: ${error.message}`
    });
  }
});

// 6. Enable a bot (in config and start it)
app.post('/api/bots/:botId/enable', async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'Bot ID is required'
      });
    }

    const result = await botManager.enableBot(botId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to enable bot: ${error.message}`
    });
  }
});

// 7. Disable a bot (in config and stop it)
app.post('/api/bots/:botId/disable', async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'Bot ID is required'
      });
    }

    const result = await botManager.disableBot(botId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to disable bot: ${error.message}`
    });
  }
});

// =============================================================================
// BULK OPERATIONS (Enhanced existing endpoints)
// =============================================================================

// 8. Get overall system status (enhanced)
app.get('/api/status', async (req, res) => {
  try {
    const status = await botManager.getStatus();
    res.status(200).json({
      success: true,
      system: {
        running: status.running,
        total_configs: status.total_configs,
        active_bots: status.active_bots,
        logging: status.logging
      },
      bots: status.bots
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get status: ${error.message}`
    });
  }
});

// 9. Bulk operations endpoint
app.post('/api/bots/bulk', async (req, res) => {
  try {
    const { action, botIds } = req.body;
    
    if (!action || !Array.isArray(botIds)) {
      return res.status(400).json({
        success: false,
        error: 'Action and botIds array are required'
      });
    }

    const results = [];
    
    for (const botId of botIds) {
      try {
        let result;
        switch (action) {
          case 'start':
            result = await botManager.startBotById(botId);
            break;
          case 'stop':
            result = await botManager.stopBotById(botId);
            break;
          case 'restart':
            result = await botManager.restartBotById(botId);
            break;
          case 'enable':
            result = await botManager.enableBot(botId);
            break;
          case 'disable':
            result = await botManager.disableBot(botId);
            break;
          default:
            result = { success: false, message: `Unknown action: ${action}` };
        }
        
        results.push({
          botId,
          success: result.success,
          message: result.message
        });
      } catch (error) {
        results.push({
          botId,
          success: false,
          message: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    res.status(200).json({
      success: true,
      message: `Bulk ${action} completed: ${successCount}/${botIds.length} successful`,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to perform bulk operation: ${error.message}`
    });
  }
});

// =============================================================================
// HEALTH CHECK AND MONITORING
// =============================================================================

// 10. Health check for specific bot
app.get('/api/bots/:botId/health', async (req, res) => {
  try {
    const { botId } = req.params;
    const status = await botManager.getBotStatus(botId);
    
    if (!status.success) {
      return res.status(404).json({
        success: false,
        error: status.message
      });
    }

    const bot = status.bot;
    const isHealthy = bot.running && bot.reconnect_attempts < bot.max_reconnect_attempts;
    
    res.status(isHealthy ? 200 : 503).json({
      success: true,
      healthy: isHealthy,
      bot: {
        id: bot.id,
        name: bot.name,
        running: bot.running,
        reconnect_attempts: bot.reconnect_attempts,
        max_reconnect_attempts: bot.max_reconnect_attempts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Health check failed: ${error.message}`
    });
  }
});

// 11. Get bot logs/metrics (if you want to add this later)
app.get('/api/bots/:botId/metrics', async (req, res) => {
  try {
    const { botId } = req.params;
    
    // This is a placeholder for future metrics implementation
    // You could track message counts, response times, etc.
    
    res.status(200).json({
      success: true,
      message: 'Metrics endpoint - to be implemented',
      botId: botId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get metrics: ${error.message}`
    });
  }
});

// =============================================================================
// MIDDLEWARE FOR AUTHENTICATION (Optional but recommended)
// =============================================================================

// Add this before your bot management endpoints if you want authentication
/*
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing API key'
    });
  }
  
  next();
};

// Apply to all bot management endpoints
app.use('/api/bots', authenticateAPI);
*/