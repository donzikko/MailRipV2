import express from 'express';
import TelegramAppBot from './TelegramAppBot.js';

// Path to your JSON configuration file
const CONFIG_PATH = process.env.BOT_CONFIG_PATH || './bot-config.json';

const botManager = new TelegramAppBot(CONFIG_PATH);
// Start manager on boot
botManager.init().catch(err => console.error('Bot manager init error:', err));

const app = express();
app.use(express.json());

// -------------------- STATUS ------------------------
app.get('/status', async (req, res) => {
  try {
    const status = await botManager.getStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// -------------------- PER-BOT CONTROL ---------------
app.post('/bots/:id/start', async (req, res) => {
  try {
    const result = await botManager.startBotById(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/bots/:id/stop', async (req, res) => {
  try {
    const result = await botManager.stopBotById(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/bots/:id/restart', async (req, res) => {
  try {
    const result = await botManager.restartBotById(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/bots/:id/disable', async (req, res) => {
  try {
    const result = await botManager.disableBotById(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/bots/:id/enable', async (req, res) => {
  try {
    const result = await botManager.enableBotById(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// --------------- GLOBAL CONTROL --------------------
app.post('/reload', async (req, res) => {
  try {
    const result = await botManager.reloadConfig();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/restart-all', async (req, res) => {
  try {
    const result = await botManager.restartAll();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// -------------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Management API listening on port ${PORT}`));