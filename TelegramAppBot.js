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
      strongTriggers: [
        'app request', 'need app', 'looking for', 'find app', 'download app',
        'request app', 'want app', 'get app', 'search app', 'app needed'
      ],
      appKeywords: [
        'apk', 'app', 'application', 'mod', 'premium', 'cracked', 'pro version',
        'latest version', 'update', 'install', 'download'
      ],
      questionPatterns: [
        /where can i (find|get|download)/i,
        /how to (get|download|install)/i,
        /anyone have/i,
        /does anyone know/i,
        /can someone share/i,
        /link for/i
      ],
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

  // ------------------------- INITIALIZATION ---------------------------
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

  // --------------------------- CONFIG I/O -----------------------------
  async loadConfig() {
    try {
      const configData = await fsPromises.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);

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

  // -------------------------- LOGGING BOT -----------------------------
  async initLoggingBot() {
    try {
      if (this.logBot) {
        await this.logBot.stopPolling();
        this.logBot = null;
      }

      if (!this.logConfig || !this.logConfig.enabled || !this.logConfig.bot_token || !this.logConfig.channel_id) {
        console.log('Logging bot not configured or disabled');
        return;
      }

      this.logBot = new TelegramBot(this.logConfig.bot_token, { polling: false });

      await this.logBot.sendMessage(this.logConfig.channel_id,
        `🚀 **Bot Manager Started**\n\`${new Date().toISOString()}\``,
        { parse_mode: 'Markdown' });

      console.log('Logging bot initialized successfully');
    } catch (error) {
      console.error('Failed to initialize logging bot:', error.message);
      this.logBot = null;
    }
  }

  // --------------------------- BOT LIFECYCLE --------------------------
  async startActiveBots() {
    const promises = [];
    for (const [botId, cfg] of this.activeConfigs) {
      if (!this.bots.has(botId)) promises.push(this.startBot(cfg));
    }
    await Promise.allSettled(promises);
  }

  async startBot(config) {
    const botId = config.id;
    try {
      if (this.bots.has(botId)) await this.stopBot(botId);

      const bot = new TelegramBot(config.bot_key, {
        polling: { interval: 1000, autoStart: false, params: { timeout: 10 } }
      });

      bot.on('error', async err => { await this.log(`Bot ${botId} error: ${err.message}`, 'error'); await this.handleBotError(botId, err); });
      bot.on('polling_error', async err => { await this.log(`Bot ${botId} polling error: ${err.message}`, 'error'); await this.handleBotError(botId, err); });
      bot.on('message', async msg => { await this.handleMessage(bot, config, msg); });

      await bot.startPolling();
      this.bots.set(botId, bot);
      this.reconnectAttempts.set(botId, 0);
      await this.log(`Bot ${config.name} (${botId}) started successfully`);
      try {
        await bot.sendMessage(config.group_id, `🤖 Bot "${config.name}" is now active and monitoring for app requests!`);
      } catch (e) { await this.log(`Failed to send startup message for bot ${botId}: ${e.message}`, 'warn'); }
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
      } catch (e) { await this.log(`Error stopping bot ${botId}: ${e.message}`, 'error'); }
      this.bots.delete(botId);
      this.reconnectAttempts.delete(botId);
      await this.log(`Bot ${botId} stopped`);
    }
  }

  async handleBotError(botId, error) {
    const attempts = this.reconnectAttempts.get(botId) || 0;
    if (attempts < this.maxReconnectAttempts) {
      this.reconnectAttempts.set(botId, attempts + 1);
      await this.log(`Bot ${botId} reconnection attempt ${attempts + 1}/${this.maxReconnectAttempts}`);
      setTimeout(async () => {
        const cfg = this.activeConfigs.get(botId);
        if (cfg) await this.startBot(cfg);
      }, this.reconnectDelay * (attempts + 1));
    } else {
      await this.log(`Bot ${botId} failed after ${this.maxReconnectAttempts} reconnection attempts`, 'error');
    }
  }

  // ----------------------- MESSAGE HANDLING --------------------------
  async handleMessage(bot, config, msg) {
    try {
      if (msg.chat.id.toString() !== config.group_id.toString()) return;
      if (msg.from.is_bot && !msg.reply_to_message) return;

      const messageText = msg.text || '';

      const adminTrigger = await this.checkAdminTrigger(bot, msg, config);
      if (adminTrigger.isAdminTrigger) { await this.handleAdminTrigger(bot, msg, config, adminTrigger); return; }
      if (msg.from.is_bot) return;

      const detection = this.detectAppRequest(messageText);
      if (!detection.isRequest) return;

      await this.log(`App request detected in ${config.name} (confidence: ${detection.confidence}, reason: ${detection.reason}): "${messageText}"`);
      const searchResults = await this.searchApp(config.url, detection.query);
      await this.sendResponse(bot, msg, config, searchResults, detection);
    } catch (error) {
      await this.log(`Error handling message for bot ${config.id}: ${error.message}`, 'error');
      try { await bot.sendMessage(msg.chat.id, '❌ Sorry, there was an error processing your request. Please try again later.', { reply_to_message_id: msg.message_id }); } catch {}
    }
  }

  // ------------------ ADMIN TRIGGER & PERMISSIONS --------------------
  async checkAdminTrigger(bot, msg, config) {
    try {
      if (!msg.reply_to_message) return { isAdminTrigger: false };
      const botInfo = await bot.getMe();
      const botMention = `@${botInfo.username}`;
      const messageText = msg.text || '';
      if (!messageText.includes(botMention)) return { isAdminTrigger: false };
      const isAdmin = await this.checkIfAdmin(bot, msg, config);
      if (!isAdmin) return { isAdminTrigger: false };
      const appQuery = messageText.replace(botMention, '').trim();
      if (!appQuery) return { isAdminTrigger: false };
      return { isAdminTrigger: true, appQuery, originalMessage: msg.reply_to_message, admin: msg.from };
    } catch (error) { await this.log(`Error checking admin trigger: ${error.message}`, 'error'); return { isAdminTrigger: false }; }
  }

  async checkIfAdmin(bot, msg, config) {
    try {
      const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
      if (['creator', 'administrator'].includes(chatMember.status)) return true;
      const adminIds = config.admin_ids || [];
      if (adminIds.includes(msg.from.id)) return true;
      const adminUsernames = config.admin_usernames || [];
      if (msg.from.username && adminUsernames.includes(msg.from.username.toLowerCase())) return true;
      return false;
    } catch (e) { await this.log(`Error checking admin status: ${e.message}`, 'warn'); return false; }
  }

  async handleAdminTrigger(bot, msg, config, adminTrigger) {
    try {
      await this.log(`Admin manual trigger by ${adminTrigger.admin.first_name} (@${adminTrigger.admin.username || 'no_username'}) for query: "${adminTrigger.appQuery}"`);
      const searchResults = await this.searchApp(config.url, adminTrigger.appQuery);
      const detection = { confidence: 1.0, reason: 'admin_manual', query: adminTrigger.appQuery };
      await this.sendAdminTriggeredResponse(bot, adminTrigger.originalMessage, msg, config, searchResults, detection, adminTrigger.admin);
    } catch (error) {
      await this.log(`Error handling admin trigger: ${error.message}`, 'error');
      try { await bot.sendMessage(msg.chat.id, '❌ Failed to process admin trigger. Please try again.', { reply_to_message_id: msg.message_id }); } catch {}
    }
  }

  async sendAdminTriggeredResponse(bot, originalMsg, adminMsg, config, searchResults, detection, admin) {
    try {
      let responseText;
      if (searchResults.success && searchResults.results.length > 0) {
        const topResult = searchResults.results[0];
        responseText = `👑 **Admin Search Result**\n\nFound: **${topResult.title.rendered || topResult.title}**\nLink: ${topResult.link}\n\n🔍 *Searched by admin: ${admin.first_name}*\n📝 *Query: "${searchResults.query}"*\n\n💬 *This was a manual search triggered by an admin.*`;
      } else {
        responseText = `👑 **Admin Search Result**\n\n❌ No match found for "${searchResults.query}"\n\n🔍 *Searched by admin: ${admin.first_name}*\n📝 *An admin will investigate further and provide alternatives.*\n\n💬 *This was a manual search triggered by an admin.*`;
      }
      await bot.sendMessage(originalMsg.chat.id, responseText, { reply_to_message_id: originalMsg.message_id, parse_mode: 'Markdown' });
      await bot.sendMessage(adminMsg.chat.id, `✅ Search completed for "${searchResults.query}"`, { reply_to_message_id: adminMsg.message_id });
      await this.log(`Admin-triggered response sent for query "${searchResults.query}" by ${admin.first_name} in ${config.name}`);
    } catch (error) {
      await this.log(`Failed to send admin-triggered response: ${error.message}`, 'error');
      try { await bot.sendMessage(originalMsg.chat.id, '👑 Admin search completed! Results will be provided shortly.', { reply_to_message_id: originalMsg.message_id }); } catch {}
    }
  }

  // ---------------------- DETECTION & SEARCH -------------------------
  detectAppRequest(text) {
    const lowerText = text.toLowerCase().trim();
    if (/https?:\/\/\S+|www\.\S+/.test(lowerText)) return { isRequest: false, confidence: 0, reason: 'contains_link' };
    if (/^\d+$/.test(lowerText)) return { isRequest: false, confidence: 0, reason: 'numbers_only' };
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic} ]+$/u.test(text)) return { isRequest: false, confidence: 0, reason: 'emoji_only' };
    if (lowerText.startsWith('/')) return { isRequest: false, confidence: 0, reason: 'bot_command' };
    if (lowerText.length < 4) return { isRequest: false, confidence: 0, reason: 'too_short' };

    const hasStrongTrigger = this.triggerSettings.strongTriggers.some(t => lowerText.includes(t));
    if (hasStrongTrigger) return { isRequest: true, confidence: 0.9, reason: 'strong_trigger', query: this.extractAppName(text) };

    const hasQuestionPattern = this.triggerSettings.questionPatterns.some(p => p.test(lowerText));
    if (hasQuestionPattern) return { isRequest: true, confidence: 0.8, reason: 'question_pattern', query: this.extractAppName(text) };

    const words = lowerText.split(/\s+/).filter(w => w.length);
    const wordCount = words.length;

    const hasAppKeyword = this.triggerSettings.appKeywords.some(k => lowerText.includes(k));
    const nonCommonWords = words.filter(w => !this.triggerSettings.commonWords.includes(w) && w.length > 2);
    const nonCommonRatio = nonCommonWords.length / Math.max(wordCount, 1);

    if (wordCount >= 1 && wordCount <= 4) {
      if (hasAppKeyword) return { isRequest: true, confidence: 0.7, reason: 'short_with_app_keyword', query: this.extractAppName(text) };
      if (nonCommonRatio >= 0.5 && nonCommonWords.length >= 1) return { isRequest: true, confidence: 0.6, reason: 'potential_app_name', query: this.extractAppName(text) };
    }

    if (wordCount >= 5 && wordCount <= 10 && hasAppKeyword && nonCommonRatio >= 0.3) return { isRequest: true, confidence: 0.5, reason: 'medium_with_app_context', query: this.extractAppName(text) };
    return { isRequest: false, confidence: 0, reason: 'no_match' };
  }

  async searchApp(url, query) {
    try {
      const cleanQuery = this.extractAppName(query);
      const res = await axios.get(url, { params: { search: cleanQuery, per_page: 5, _fields: 'id,title,link,excerpt,date' }, timeout: 10000 });
      return { success: true, results: res.data || [], query: cleanQuery };
    } catch (error) {
      await this.log(`Search API error: ${error.message}`, 'error');
      return { success: false, error: error.message, query };
    }
  }

  extractAppName(text) {
    let clean = text.toLowerCase()
      .replace(/app request|need app|looking for|download|app needed|request app|find app/g, '')
      .replace(/please|can|you|help|me|find|get|need|want|for|the|an|is|are/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = clean.split(' ').filter(w => w.length > 1 || ['hq', 'tv', 'hd'].includes(w));
    return words.slice(0, 3).join(' ') || text;
  }

  async sendResponse(bot, msg, config, searchResults, detection) {
    try {
      let responseText;
      if (searchResults.success && searchResults.results.length > 0) {
        const top = searchResults.results[0];
        const emoji = detection.confidence >= 0.8 ? '🎯' : detection.confidence >= 0.6 ? '🤖' : '🔍';
        responseText = `${emoji} **App Request Response**\n\nFound: **${top.title.rendered || top.title}**\nLink: ${top.link}\n\n📝 *An admin will review your request and provide more details soon.*\n\n*Searched for: "${searchResults.query}"*`;
      } else {
        const emoji = detection.confidence >= 0.8 ? '🎯' : detection.confidence >= 0.6 ? '🤖' : '🔍';
        responseText = `${emoji} **App Request Response**\n\n❌ No direct match found for "${searchResults.query}"\n\n📝 *Don't worry! An admin will review your request and help you find what you're looking for.*\n\n💡 *Tip: Try being more specific with the app name*`;
      }
      await bot.sendMessage(msg.chat.id, responseText, { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' });
      await this.log(`Response sent for query "${searchResults.query}" in ${config.name} (confidence: ${detection.confidence})`);
    } catch (error) {
      await this.log(`Failed to send response: ${error.message}`, 'error');
      try { await bot.sendMessage(msg.chat.id, '🤖 App request received! An admin will respond soon.', { reply_to_message_id: msg.message_id }); } catch {}
    }
  }

  // ------------------------------ LOG -------------------------------
  async log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
    if (this.logBot && this.logConfig && this.logConfig.enabled) {
      try {
        const allowed = this.logConfig.log_levels || ['error'];
        if (!allowed.includes(level)) return;
        const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
        await this.logBot.sendMessage(this.logConfig.channel_id, `${emoji} **Bot Log**\n\`${logMessage}\``, { parse_mode: 'Markdown' });
      } catch (e) { console.error('Failed to send log to Telegram:', e.message); }
    }
  }

  // ------------------ MANAGER-LEVEL OPERATIONS -----------------------
  async reloadConfig() {
    try {
      await this.log('Reloading bot configuration...');
      const old = new Set(this.activeConfigs.keys());
      await this.loadConfig();
      await this.initLoggingBot();
      const current = new Set(this.activeConfigs.keys());
      for (const id of old) if (!current.has(id)) { await this.stopBot(id); await this.log(`Stopped removed bot: ${id}`); }
      for (const id of current) if (!old.has(id)) { await this.startBot(this.activeConfigs.get(id)); await this.log(`Started new bot: ${id}`); }
      await this.log('Configuration reloaded successfully');
      return { success: true, active_bots: this.bots.size };
    } catch (error) { await this.log(`Failed to reload configuration: ${error.message}`, 'error'); throw error; }
  }

  async getStatus() {
    const status = {
      running: this.isRunning,
      total_configs: this.activeConfigs.size,
      active_bots: this.bots.size,
      logging: { enabled: !!(this.logConfig && this.logConfig.enabled), connected: !!this.logBot, levels: this.logConfig ? this.logConfig.log_levels : [] },
      bots: []
    };
    for (const [id, cfg] of this.activeConfigs) {
      status.bots.push({ id, name: cfg.name, running: this.bots.has(id), group_id: cfg.group_id, reconnect_attempts: this.reconnectAttempts.get(id) || 0 });
    }
    return status;
  }

  // ------------------- NEW PER-BOT HELPERS ---------------------------
  async startBotById(botId) { if (!this.activeConfigs.has(botId)) throw new Error(`No active configuration found for bot ${botId}`); if (this.bots.has(botId)) return { success: false, message: `Bot ${botId} is already running` }; const cfg = this.activeConfigs.get(botId); await this.startBot(cfg); return { success: true, message: `Bot ${botId} started` }; }

  async stopBotById(botId) { if (!this.bots.has(botId)) return { success: false, message: `Bot ${botId} is not running` }; await this.stopBot(botId); return { success: true, message: `Bot ${botId} stopped` }; }

  async restartBotById(botId) { await this.stopBotById(botId); await new Promise(r => setTimeout(r, 1000)); if (!this.activeConfigs.has(botId)) throw new Error(`No active configuration found for bot ${botId}`); const cfg = this.activeConfigs.get(botId); await this.startBot(cfg); return { success: true, message: `Bot ${botId} restarted` }; }

  async stopAll() {
    await this.log('Stopping all bots...');
    await Promise.allSettled([...this.bots.keys()].map(id => this.stopBot(id)));
    if (this.logBot) { try { await this.logBot.stopPolling(); } catch {} this.logBot = null; }
    this.isRunning = false;
    await this.log('All bots stopped');
    return { success: true, message: 'All bots stopped' };
  }

  async restartAll() { await this.stopAll(); await new Promise(r => setTimeout(r, 2000)); return this.init(); }
}

export default TelegramAppBot;