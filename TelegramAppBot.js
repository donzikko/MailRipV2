import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { promises as fsPromises } from 'fs';
import path from 'path';

class TelegramAppBot {
  constructor(configPath) {
    this.configPath = configPath;
    this.bots = new Map(); // Store multiple bot instances
    this.activeConfigs = new Map(); // Store active configurations
    this.reconnectAttempts = new Map(); // Track reconnection attempts
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    this.isRunning = false;
    
    // Dedicated logging bot
    this.logBot = null;
    this.logConfig = null;
    
    // Smart trigger detection system
    this.triggerSettings = {
      // Strong triggers - always respond
      strongTriggers: [
        'app request', 'need app', 'looking for', 'find app', 'download app',
        'request app', 'want app', 'get app', 'search app', 'app needed'
      ],
      
      // App-related keywords that boost confidence
      appKeywords: [
        'apk', 'app', 'application', 'mod', 'premium', 'cracked', 'pro version',
        'latest version', 'update', 'install', 'download'
      ],
      
      // Question patterns that suggest app requests
      questionPatterns: [
        /where can i (find|get|download)/i,
        /how to (get|download|install)/i,
        /anyone have/i,
        /does anyone know/i,
        /can someone share/i,
        /link for/i
      ],
      
      // Common words that reduce confidence (not app names)
      commonWords: [
        'the', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at',
        'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through',
        'during', 'before', 'after', 'above', 'below', 'between', 'among', 'this',
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its',
        'our', 'their', 'hello', 'hi', 'hey', 'thanks', 'please', 'yes', 'no'
      ]
    };
  }

  async init() {
    try {
      await this.loadConfig();
      await this.initLoggingBot();
      await this.startActiveBots();
      this.isRunning = true;
      await this.log('Telegram Bot Manager initialized successfully');
      return { success: true, message: 'Bot manager started' };
    } catch (error) {
      await this.log(`Failed to initialize bot manager: ${error.message}`, 'error');
      throw error;
    }
  }

  async loadConfig() {
    try {
      const configData = await fsPromises.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Validate structure
      if (!config.bots || !Array.isArray(config.bots)) {
        throw new Error('Config must have a "bots" array');
      }

      // Store logging configuration
      this.logConfig = config.logging || null;

      // Validate and store active bot configs
      this.activeConfigs.clear();
      for (const botConfig of config.bots) {
        if (!this.validateConfig(botConfig)) {
          await this.log(`Invalid config for bot ${botConfig.id || 'unknown'}: Missing required fields`, 'warn');
          continue;
        }
        
        if (botConfig.active) {
          this.activeConfigs.set(botConfig.id, botConfig);
        }
      }

      await this.log(`Loaded ${this.activeConfigs.size} active bot configurations`);
      return this.activeConfigs;
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.log('Bot config file not found, creating empty config');
        const emptyConfig = {
          logging: { enabled: false },
          bots: []
        };
        await this.saveConfig(emptyConfig);
        return new Map();
      }
      throw error;
    }
  }

  validateConfig(config) {
    const required = ['id', 'name', 'url', 'bot_key', 'group_id'];
    return required.every(field => config[field] && config[field].toString().trim());
  }

  async saveConfig(config) {
    const configDir = path.dirname(this.configPath);
    await fsPromises.mkdir(configDir, { recursive: true });
    await fsPromises.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async initLoggingBot() {
    try {
      // Stop existing logging bot if running
      if (this.logBot) {
        await this.logBot.stopPolling();
        this.logBot = null;
      }

      // Check if logging is enabled
      if (!this.logConfig || !this.logConfig.enabled || !this.logConfig.bot_token || !this.logConfig.channel_id) {
        console.log('Logging bot not configured or disabled');
        return;
      }

      // Initialize logging bot
      this.logBot = new TelegramBot(this.logConfig.bot_token, { 
        polling: false // Logging bot doesn't need to receive messages
      });

      // Test the logging bot
      await this.logBot.sendMessage(this.logConfig.channel_id, 
        `🚀 **Bot Manager Started**\n\`${new Date().toISOString()}\``,
        { parse_mode: 'Markdown' }
      );

      console.log('Logging bot initialized successfully');
    } catch (error) {
      console.error('Failed to initialize logging bot:', error.message);
      this.logBot = null;
    }
  }

  async startActiveBots() {
    const startPromises = [];
    
    for (const [botId, config] of this.activeConfigs) {
      if (!this.bots.has(botId)) {
        startPromises.push(this.startBot(config));
      }
    }

    await Promise.allSettled(startPromises);
  }

  async startBot(config) {
    const botId = config.id;
    
    try {
      // Stop existing bot if running
      if (this.bots.has(botId)) {
        await this.stopBot(botId);
      }

      const bot = new TelegramBot(config.bot_key, { 
        polling: {
          interval: 1000,
          autoStart: false,
          params: {
            timeout: 10
          }
        }
      });

      // Set up error handling
      bot.on('error', async (error) => {
        await this.log(`Bot ${botId} error: ${error.message}`, 'error');
        await this.handleBotError(botId, error);
      });

      bot.on('polling_error', async (error) => {
        await this.log(`Bot ${botId} polling error: ${error.message}`, 'error');
        await this.handleBotError(botId, error);
      });

      // Set up message handling
      bot.on('message', async (msg) => {
        await this.handleMessage(bot, config, msg);
      });

      // Start polling
      await bot.startPolling();
      this.bots.set(botId, bot);
      this.reconnectAttempts.set(botId, 0);
      
      await this.log(`Bot ${config.name} (${botId}) started successfully`);
      
      // Send startup message to group
      try {
        await bot.sendMessage(config.group_id, `🤖 Bot "${config.name}" is now active and monitoring for app requests!`);
      } catch (sendError) {
        await this.log(`Failed to send startup message for bot ${botId}: ${sendError.message}`, 'warn');
      }

    } catch (error) {
      await this.log(`Failed to start bot ${botId}: ${error.message}`, 'error');
      throw error;
    }
  }

  async stopBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      try {
        await bot.stopPolling();
        this.bots.delete(botId);
        this.reconnectAttempts.delete(botId);
        await this.log(`Bot ${botId} stopped`);
      } catch (error) {
        await this.log(`Error stopping bot ${botId}: ${error.message}`, 'error');
      }
    }
  }

  async handleBotError(botId, error) {
    const attempts = this.reconnectAttempts.get(botId) || 0;
    
    if (attempts < this.maxReconnectAttempts) {
      this.reconnectAttempts.set(botId, attempts + 1);
      await this.log(`Bot ${botId} reconnection attempt ${attempts + 1}/${this.maxReconnectAttempts}`);
      
      setTimeout(async () => {
        const config = this.activeConfigs.get(botId);
        if (config) {
          await this.startBot(config);
        }
      }, this.reconnectDelay * (attempts + 1)); // Exponential backoff
    } else {
      await this.log(`Bot ${botId} failed after ${this.maxReconnectAttempts} reconnection attempts`, 'error');
    }
  }

  async handleMessage(bot, config, msg) {
    try {
      // Only process messages from the configured group
      if (msg.chat.id.toString() !== config.group_id.toString()) {
        return;
      }

      // Skip bot messages (but allow admin mentions)
      if (msg.from.is_bot && !msg.reply_to_message) {
        return;
      }

      const messageText = msg.text || '';
      
      // Check for admin manual trigger (bot mention with quoted message)
      const adminTrigger = await this.checkAdminTrigger(bot, msg, config);
      if (adminTrigger.isAdminTrigger) {
        await this.handleAdminTrigger(bot, msg, config, adminTrigger);
        return;
      }
      
      // Skip bot's own messages for regular detection
      if (msg.from.is_bot) {
        return;
      }

      // Use smart detection for regular messages
      const detection = this.detectAppRequest(messageText);
      
      if (!detection.isRequest) {
        return;
      }

      await this.log(`App request detected in ${config.name} (confidence: ${detection.confidence}, reason: ${detection.reason}): "${messageText}"`);

      // Search for the app using the extracted query
      const searchResults = await this.searchApp(config.url, detection.query);
      
      // Send response
      await this.sendResponse(bot, msg, config, searchResults, detection);

    } catch (error) {
      await this.log(`Error handling message for bot ${config.id}: ${error.message}`, 'error');
      
      // Send generic error response
      try {
        await bot.sendMessage(msg.chat.id, 
          `❌ Sorry, there was an error processing your request. Please try again later.`,
          { reply_to_message_id: msg.message_id }
        );
      } catch (sendError) {
        await this.log(`Failed to send error response: ${sendError.message}`, 'error');
      }
    }
  }

  // Check if message is an admin manual trigger
  async checkAdminTrigger(bot, msg, config) {
    try {
      // Must be a reply to another message
      if (!msg.reply_to_message) {
        return { isAdminTrigger: false };
      }

      // Must mention the bot
      const botInfo = await bot.getMe();
      const botMention = `@${botInfo.username}`;
      const messageText = msg.text || '';
      
      if (!messageText.includes(botMention)) {
        return { isAdminTrigger: false };
      }

      // Check if user is admin (you can customize this logic)
      const isAdmin = await this.checkIfAdmin(bot, msg, config);
      if (!isAdmin) {
        return { isAdminTrigger: false };
      }

      // Extract the app name from admin's message (remove bot mention)
      const appQuery = messageText.replace(botMention, '').trim();
      
      if (!appQuery) {
        return { isAdminTrigger: false };
      }

      return {
        isAdminTrigger: true,
        appQuery: appQuery,
        originalMessage: msg.reply_to_message,
        admin: msg.from
      };

    } catch (error) {
      await this.log(`Error checking admin trigger: ${error.message}`, 'error');
      return { isAdminTrigger: false };
    }
  }

  // Check if user is admin (customize this based on your needs)
  async checkIfAdmin(bot, msg, config) {
    try {
      // Method 1: Check if user is group admin
      const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
      const isGroupAdmin = ['creator', 'administrator'].includes(chatMember.status);
      
      if (isGroupAdmin) {
        return true;
      }

      // Method 2: Check against predefined admin list (add to config if needed)
      const adminIds = config.admin_ids || [];
      if (adminIds.includes(msg.from.id)) {
        return true;
      }

      // Method 3: Check against admin usernames (add to config if needed)
      const adminUsernames = config.admin_usernames || [];
      if (msg.from.username && adminUsernames.includes(msg.from.username.toLowerCase())) {
        return true;
      }

      return false;
    } catch (error) {
      await this.log(`Error checking admin status: ${error.message}`, 'warn');
      return false;
    }
  }

  // Handle admin manual trigger
  async handleAdminTrigger(bot, msg, config, adminTrigger) {
    try {
      await this.log(`Admin manual trigger by ${adminTrigger.admin.first_name} (@${adminTrigger.admin.username || 'no_username'}) for query: "${adminTrigger.appQuery}"`);

      // Search for the app using admin's query
      const searchResults = await this.searchApp(config.url, adminTrigger.appQuery);
      
      // Create detection object for admin trigger
      const detection = {
        confidence: 1.0, // Admin triggers have max confidence
        reason: 'admin_manual',
        query: adminTrigger.appQuery
      };

      // Send response to the original message that admin replied to
      await this.sendAdminTriggeredResponse(bot, adminTrigger.originalMessage, msg, config, searchResults, detection, adminTrigger.admin);

    } catch (error) {
      await this.log(`Error handling admin trigger: ${error.message}`, 'error');
      
      try {
        await bot.sendMessage(msg.chat.id, 
          `❌ Failed to process admin trigger. Please try again.`,
          { reply_to_message_id: msg.message_id }
        );
      } catch (sendError) {
        await this.log(`Failed to send admin trigger error response: ${sendError.message}`, 'error');
      }
    }
  }

  // Send response for admin-triggered search
  async sendAdminTriggeredResponse(bot, originalMsg, adminMsg, config, searchResults, detection, admin) {
    try {
      let responseText = '';
      
      if (searchResults.success && searchResults.results.length > 0) {
        const topResult = searchResults.results[0];
        
        responseText = `👑 **Admin Search Result**\n\n` +
          `Found: **${topResult.title.rendered || topResult.title}**\n` +
          `Link: ${topResult.link}\n\n` +
          `🔍 *Searched by admin: ${admin.first_name}*\n` +
          `📝 *Query: "${searchResults.query}"*\n\n` +
          `💬 *This was a manual search triggered by an admin.*`;
      } else {
        responseText = `👑 **Admin Search Result**\n\n` +
          `❌ No match found for "${searchResults.query}"\n\n` +
          `🔍 *Searched by admin: ${admin.first_name}*\n` +
          `📝 *An admin will investigate further and provide alternatives.*\n\n` +
          `💬 *This was a manual search triggered by an admin.*`;
      }

      // Reply to the original user's message
      await bot.sendMessage(originalMsg.chat.id, responseText, {
        reply_to_message_id: originalMsg.message_id,
        parse_mode: 'Markdown'
      });

      // Send confirmation to admin
      await bot.sendMessage(adminMsg.chat.id, 
        `✅ Search completed for "${searchResults.query}"`, 
        { reply_to_message_id: adminMsg.message_id }
      );

      // Log the admin interaction
      await this.log(`Admin-triggered response sent for query "${searchResults.query}" by ${admin.first_name} in ${config.name}`);

    } catch (error) {
      await this.log(`Failed to send admin-triggered response: ${error.message}`, 'error');
      
      // Send fallback message
      try {
        await bot.sendMessage(originalMsg.chat.id,
          `👑 Admin search completed! Results will be provided shortly.`,
          { reply_to_message_id: originalMsg.message_id }
        );
      } catch (fallbackError) {
        await this.log(`Failed to send admin trigger fallback response: ${fallbackError.message}`, 'error');
      }
    }
  }

  // Smart detection method
  detectAppRequest(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Ignore messages that contain links
    if (/https?:\/\/\S+|www\.\S+/.test(lowerText)) {
      return { isRequest: false, confidence: 0, reason: 'contains_link' };
    }
    
    if (/^\d+$/.test(lowerText)) {
      return { isRequest: false, confidence: 0, reason: 'numbers_only' };
    }
    
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic} ]+$/u.test(text)) {
      return { isRequest: false, confidence: 0, reason: 'emoji_only' };
    }
    
    if (lowerText.startsWith('/')) {
      return { isRequest: false, confidence: 0, reason: 'bot_command' };
    }

    // Skip very short messages (less than 2 characters)
    if (lowerText.length < 4) {
      return { isRequest: false, confidence: 0, reason: 'too_short' };
    }
    
    // Check for strong triggers (high confidence)
    const hasStrongTrigger = this.triggerSettings.strongTriggers.some(trigger => 
      lowerText.includes(trigger.toLowerCase())
    );
    
    if (hasStrongTrigger) {
      return { 
        isRequest: true, 
        confidence: 0.9, 
        reason: 'strong_trigger',
        query: this.extractAppName(text)
      };
    }
    
    // Check for question patterns
    const hasQuestionPattern = this.triggerSettings.questionPatterns.some(pattern => 
      pattern.test(lowerText)
    );
    
    if (hasQuestionPattern) {
      return { 
        isRequest: true, 
        confidence: 0.8, 
        reason: 'question_pattern',
        query: this.extractAppName(text)
      };
    }
    
    // Analyze message structure for implicit app requests
    const words = lowerText.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    // Check for app-related keywords
    const hasAppKeyword = this.triggerSettings.appKeywords.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
    
    // Check if message contains mostly non-common words (potential app names)
    const nonCommonWords = words.filter(word => 
      !this.triggerSettings.commonWords.includes(word) && 
      word.length > 2
    );
    
    const nonCommonRatio = nonCommonWords.length / Math.max(wordCount, 1);
    
    // Decision logic for implicit requests
    if (wordCount >= 1 && wordCount <= 4) {
      // Short messages (1-4 words)
      if (hasAppKeyword) {
        return { 
          isRequest: true, 
          confidence: 0.7, 
          reason: 'short_with_app_keyword',
          query: this.extractAppName(text)
        };
      }
      
      if (nonCommonRatio >= 0.5 && nonCommonWords.length >= 1) {
        // Mostly non-common words, likely app names
        return { 
          isRequest: true, 
          confidence: 0.6, 
          reason: 'potential_app_name',
          query: this.extractAppName(text)
        };
      }
    }
    
    // Medium length messages with app keywords
    if (wordCount >= 5 && wordCount <= 10 && hasAppKeyword && nonCommonRatio >= 0.3) {
      return { 
        isRequest: true, 
        confidence: 0.5, 
        reason: 'medium_with_app_context',
        query: this.extractAppName(text)
      };
    }
    
    return { isRequest: false, confidence: 0, reason: 'no_match' };
  }

  async searchApp(searchUrl, query) {
    try {
      // Extract potential app name from the message
      const cleanQuery = this.extractAppName(query);
      
      // Make search request to WordPress API
      const response = await axios.get(searchUrl, {
        params: {
          search: cleanQuery,
          per_page: 5,
          _fields: 'id,title,link,excerpt,date'
        },
        timeout: 10000
      });

      return {
        success: true,
        results: response.data || [],
        query: cleanQuery
      };
    } catch (error) {
      await this.log(`Search API error: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message,
        query: query
      };
    }
  }

  extractAppName(text) {
    // Remove trigger keywords and common words to extract app name
    let cleanText = text.toLowerCase()
      .replace(/app request|need app|looking for|download|app needed|request app|find app/g, '')
      .replace(/please|can|you|help|me|find|get|need|want|for|the|an|is|are/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Take the first meaningful word(s) as the app name
    const words = cleanText.split(' ').filter(word => word.length > 1 || ['hq', 'tv', 'hd'].includes(word));
    return words.slice(0, 3).join(' ') || text;
  }

  async sendResponse(bot, msg, config, searchResults, detection) {
    try {
      let responseText = '';
      
      if (searchResults.success && searchResults.results.length > 0) {
        const topResult = searchResults.results[0];
        
        // Different responses based on confidence level
        const confidenceEmoji = detection.confidence >= 0.8 ? '🎯' : detection.confidence >= 0.6 ? '🤖' : '🔍';
        
        responseText = `${confidenceEmoji} **App Request Response**\n\n` +
          `Found: **${topResult.title.rendered || topResult.title}**\n` +
          `Link: ${topResult.link}\n\n` +
          `📝 *An admin will review your request and provide more details soon.*\n\n` +
          `*Searched for: "${searchResults.query}"*`;
      } else {
        const confidenceEmoji = detection.confidence >= 0.8 ? '🎯' : detection.confidence >= 0.6 ? '🤖' : '🔍';
        
        responseText = `${confidenceEmoji} **App Request Response**\n\n` +
          `❌ No direct match found for "${searchResults.query}"\n\n` +
          `📝 *Don't worry! An admin will review your request and help you find what you're looking for.*\n\n` +
          `💡 *Tip: Try being more specific with the app name*`;
      }

      await bot.sendMessage(msg.chat.id, responseText, {
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown'
      });

      // Log the interaction with confidence info
      await this.log(`Response sent for query "${searchResults.query}" in ${config.name} (confidence: ${detection.confidence})`);

    } catch (error) {
      await this.log(`Failed to send response: ${error.message}`, 'error');
      
      // Send fallback message
      try {
        await bot.sendMessage(msg.chat.id,
          `🤖 App request received! An admin will respond soon.`,
          { reply_to_message_id: msg.message_id }
        );
      } catch (fallbackError) {
        await this.log(`Failed to send fallback response: ${fallbackError.message}`, 'error');
      }
    }
  }

  async log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    
    // Send to Telegram log channel if configured and enabled
    if (this.logBot && this.logConfig && this.logConfig.enabled) {
      try {
        // Check if this log level should be sent
        const allowedLevels = this.logConfig.log_levels || ['error'];
        if (!allowedLevels.includes(level)) {
          return;
        }

        const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
        const formattedMessage = `${emoji} **Bot Log**\n\`${logMessage}\``;
        
        await this.logBot.sendMessage(this.logConfig.channel_id, formattedMessage, {
          parse_mode: 'Markdown'
        });
      } catch (error) {
        console.error('Failed to send log to Telegram:', error.message);
      }
    }
  }

  // Management methods
  async reloadConfig() {
    try {
      await this.log('Reloading bot configuration...');
      
      const oldConfigs = new Set(this.activeConfigs.keys());
      await this.loadConfig();
      
      // Reinitialize logging bot
      await this.initLoggingBot();
      
      const newConfigs = new Set(this.activeConfigs.keys());
      
      // Stop removed bots
      for (const botId of oldConfigs) {
        if (!newConfigs.has(botId)) {
          await this.stopBot(botId);
          await this.log(`Stopped removed bot: ${botId}`);
        }
      }
      
      // Start new bots
      for (const botId of newConfigs) {
        if (!oldConfigs.has(botId)) {
          const config = this.activeConfigs.get(botId);
          await this.startBot(config);
          await this.log(`Started new bot: ${botId}`);
        }
      }
      
      await this.log('Configuration reloaded successfully');
      return { success: true, active_bots: this.bots.size };
    } catch (error) {
      await this.log(`Failed to reload configuration: ${error.message}`, 'error');
      throw error;
    }
  }

  async getStatus() {
    const status = {
      running: this.isRunning,
      total_configs: this.activeConfigs.size,
      active_bots: this.bots.size,
      logging: {
        enabled: this.logConfig ? this.logConfig.enabled : false,
        connected: !!this.logBot,
        levels: this.logConfig ? this.logConfig.log_levels : []
      },
      bots: []
    };

    for (const [botId, config] of this.activeConfigs) {
      const isRunning = this.bots.has(botId);
      const reconnectAttempts = this.reconnectAttempts.get(botId) || 0;
      
      status.bots.push({
        id: botId,
        name: config.name,
        running: isRunning,
        group_id: config.group_id,
        reconnect_attempts: reconnectAttempts
      });
    }

    return status;
  }

  async stopAll() {
    await this.log('Stopping all bots...');
    
    const stopPromises = [];
    for (const botId of this.bots.keys()) {
      stopPromises.push(this.stopBot(botId));
    }
    
    await Promise.allSettled(stopPromises);
    
    // Stop logging bot
    if (this.logBot) {
      try {
        await this.logBot.stopPolling();
        this.logBot = null;
      } catch (error) {
        console.error('Error stopping logging bot:', error.message);
      }
    }
    
    this.isRunning = false;
    
    await this.log('All bots stopped');
    return { success: true, message: 'All bots stopped' };
  }

  async restartAll() {
    await this.stopAll();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    return await this.init();
  }

  // Individual bot management methods
  async startBotById(botId) {
    try {
      const config = this.activeConfigs.get(botId);
      if (!config) {
        throw new Error(`Bot configuration not found for ID: ${botId}`);
      }

      if (this.bots.has(botId)) {
        await this.log(`Bot ${botId} is already running`, 'warn');
        return { success: false, message: `Bot ${botId} is already running` };
      }

      await this.startBot(config);
      await this.log(`Individual start completed for bot: ${botId}`);
      
      return { 
        success: true, 
        message: `Bot ${config.name} (${botId}) started successfully`,
        bot: {
          id: botId,
          name: config.name,
          group_id: config.group_id,
          running: true
        }
      };
    } catch (error) {
      await this.log(`Failed to start individual bot ${botId}: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }

  async stopBotById(botId) {
    try {
      if (!this.bots.has(botId)) {
        await this.log(`Bot ${botId} is not running`, 'warn');
        return { success: false, message: `Bot ${botId} is not running` };
      }

      const config = this.activeConfigs.get(botId);
      const botName = config ? config.name : botId;

      await this.stopBot(botId);
      await this.log(`Individual stop completed for bot: ${botId}`);
      
      return { 
        success: true, 
        message: `Bot ${botName} (${botId}) stopped successfully`,
        bot: {
          id: botId,
          name: botName,
          running: false
        }
      };
    } catch (error) {
      await this.log(`Failed to stop individual bot ${botId}: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }

  async restartBotById(botId) {
    try {
      await this.log(`Restarting individual bot: ${botId}`);
      
      const config = this.activeConfigs.get(botId);
      if (!config) {
        throw new Error(`Bot configuration not found for ID: ${botId}`);
      }

      // Stop the bot if it's running
      if (this.bots.has(botId)) {
        await this.stopBot(botId);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }

      // Start the bot
      await this.startBot(config);
      
      await this.log(`Individual restart completed for bot: ${botId}`);
      
      return { 
        success: true, 
        message: `Bot ${config.name} (${botId}) restarted successfully`,
        bot: {
          id: botId,
          name: config.name,
          group_id: config.group_id,
          running: true,
          reconnect_attempts: this.reconnectAttempts.get(botId) || 0
        }
      };
    } catch (error) {
      await this.log(`Failed to restart individual bot ${botId}: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }

  async getBotStatus(botId) {
    try {
      const config = this.activeConfigs.get(botId);
      if (!config) {
        return { 
          success: false, 
          message: `Bot configuration not found for ID: ${botId}` 
        };
      }

      const isRunning = this.bots.has(botId);
      const reconnectAttempts = this.reconnectAttempts.get(botId) || 0;
      
      return {
        success: true,
        bot: {
          id: botId,
          name: config.name,
          running: isRunning,
          group_id: config.group_id,
          reconnect_attempts: reconnectAttempts,
          max_reconnect_attempts: this.maxReconnectAttempts,
          config_active: config.active
        }
      };
    } catch (error) {
      await this.log(`Failed to get status for bot ${botId}: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }

  async listAvailableBots() {
    try {
      const bots = [];
      
      for (const [botId, config] of this.activeConfigs) {
        const isRunning = this.bots.has(botId);
        const reconnectAttempts = this.reconnectAttempts.get(botId) || 0;
        
        bots.push({
          id: botId,
          name: config.name,
          running: isRunning,
          group_id: config.group_id,
          reconnect_attempts: reconnectAttempts,
          active: config.active
        });
      }

      return {
        success: true,
        total_bots: bots.length,
        running_bots: bots.filter(bot => bot.running).length,
        bots: bots
      };
    } catch (error) {
      await this.log(`Failed to list available bots: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }

  async enableBot(botId) {
    try {
      // Load current config
      const configData = await fsPromises.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Find and enable the bot
      const botConfig = config.bots.find(bot => bot.id === botId);
      if (!botConfig) {
        throw new Error(`Bot with ID ${botId} not found in configuration`);
      }

      if (botConfig.active) {
        return { success: false, message: `Bot ${botId} is already enabled` };
      }

      // Enable the bot
      botConfig.active = true;
      
      // Save updated config
      await this.saveConfig(config);
      
      // Reload config to update activeConfigs
      await this.loadConfig();
      
      // Start the bot
      const startResult = await this.startBotById(botId);
      
      await this.log(`Bot ${botId} enabled and started`);
      
      return {
        success: true,
        message: `Bot ${botConfig.name} (${botId}) enabled and started successfully`
      };
    } catch (error) {
      await this.log(`Failed to enable bot ${botId}: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }

  async disableBot(botId) {
    try {
      // Stop the bot first if it's running
      if (this.bots.has(botId)) {
        await this.stopBot(botId);
      }

      // Load current config
      const configData = await fsPromises.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Find and disable the bot
      const botConfig = config.bots.find(bot => bot.id === botId);
      if (!botConfig) {
        throw new Error(`Bot with ID ${botId} not found in configuration`);
      }

      if (!botConfig.active) {
        return { success: false, message: `Bot ${botId} is already disabled` };
      }

      // Disable the bot
      botConfig.active = false;
      
      // Save updated config
      await this.saveConfig(config);
      
      // Reload config to update activeConfigs
      await this.loadConfig();
      
      await this.log(`Bot ${botId} disabled and stopped`);
      
      return {
        success: true,
        message: `Bot ${botConfig.name} (${botId}) disabled and stopped successfully`
      };
    } catch (error) {
      await this.log(`Failed to disable bot ${botId}: ${error.message}`, 'error');
      return { success: false, message: error.message };
    }
  }
}

export default TelegramAppBot;