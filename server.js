const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { createMcpServer } = require("./mcp-server");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const app = express();
const PORT = 3005;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));

async function logIntent(intent, message, suggestions) {
  try {
    await ddb.send(new PutCommand({
      TableName: "musicfy-intent-logs",
      Item: {
        site_id: "musicfy",
        timestamp: new Date().toISOString(),
        user_message: message,
        intent_action: intent || "none",
        suggestions_shown: suggestions.length,
        suggestions_data: suggestions,
        source: "chatbot"
      }
    }));
    console.log(`📊 Logged to DynamoDB: ${intent}`);
  } catch (e) {
    console.error("DynamoDB error:", e.message);
  }
}

app.use(cors({origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-api-key', 'ngrok-skip-browser-warning']}));

const activeTransports = new Map();
const activeSessions = new Map();
let currentMcpCommand = null;

const REGISTRY_URL = 'http://localhost:3006';
const MYVE_ROUTER_URL = 'http://localhost:3007';

async function getSuggestions(intentAction, params) {
  try {
    const queryParams = new URLSearchParams({ intent: intentAction, ...params });
    const resp = await fetch(`${REGISTRY_URL}/suggestions?${queryParams}`);
    const data = await resp.json();
    return data.suggestions || [];
  } catch (e) {
    return [];
  }
}

async function getLiveConcertSuggestions(artist) {
  try {
    const resp = await fetch(`${MYVE_ROUTER_URL}/route/concert-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, referrer: 'musicfy' })
    });
    const data = await resp.json();
    if (data.success) {
      return [{
        site: 'concert_booking',
        display_text: `🎫 Live concerts found for ${artist} — Book on Festora!`,
        details: data.data,
        url: 'https://main.d39qu7n6qbh7g3.amplifyapp.com',
        action: 'book_concert',
        artist: artist,
        relevance: 0.95
      }];
    }
    return [];
  } catch (e) {
    return [];
  }
}

// ============ SSE (Claude Desktop) ============
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  activeTransports.set(sessionId, transport);
  const mcpserver = createMcpServer();
  activeSessions.set(sessionId, mcpserver);
  await mcpserver.connect(transport);
  transport.onclose = () => {
    activeTransports.delete(sessionId);
    activeSessions.delete(sessionId);
  };
});

app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  let transport = activeTransports.get(sessionId);
  if (!transport && activeTransports.size > 0) {
    const latestId = Array.from(activeTransports.keys()).pop();
    transport = activeTransports.get(latestId);
  }
  if (transport) {
    try {
      await transport.handleMessage(req, res, req.body);
    } catch (e) {
      res.status(500).send(e.message);
    }
  } else {
    res.status(404).send("No session");
  }
});

// ============ WEB MCP (claude.ai) ============
app.post("/mcp", express.json(), async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;
  if (method === 'initialize') {
    return res.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", serverInfo: { name: "musicfy", version: "1.0.0" }, capabilities: { tools: {} } } });
  }
  if (method === 'tools/list') {
    return res.json({ jsonrpc: "2.0", id, result: { tools: [
      { name: "play_song", description: "Play a song on Musicfy. If user wants any/random song use song='random'", inputSchema: { type: "object", properties: { song: { type: "string", description: "Song name. Use 'random' if user wants any/random song" } }, required: ["song"] } },
      { name: "control_playback", description: "Control playback", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["pause", "resume", "stop"] } }, required: ["action"] } },
      { name: "search_song", description: "Search for a song", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }
    ]}});
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    if (name === 'play_song') { currentMcpCommand = { action: 'play', song: args.song }; return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `🎵 Playing "${args.song}"!` }] } }); }
    if (name === 'control_playback') { currentMcpCommand = { action: args.action }; return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `✅ ${args.action}!` }] } }); }
    if (name === 'search_song') { currentMcpCommand = { action: 'search', query: args.query }; return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `🔍 Searching "${args.query}"!` }] } }); }
  }
  res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

// ============ MCP COMMAND POLLING ============
app.get('/mcp-command', (req, res) => {
  if (currentMcpCommand) { const cmd = currentMcpCommand; currentMcpCommand = null; return res.json({ command: cmd }); }
  res.json({ command: null });
});

// ============ DISCOVERY FILES ============
app.get('/llms.txt', (req, res) => { res.type('text/plain').send(fs.readFileSync(path.join(__dirname, 'llms.txt'), 'utf8')); });
app.get('/.well-known/mcp.json', (req, res) => {
  res.json({ name: "Musicfy", mcp_url: "https://unmischievously-rheotropic-luca.ngrok-free.dev/mcp", version: "1.0.0" });
});

// ============ CHATGPT SUPPORT ============
app.get('/.well-known/ai-plugin.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    schema_version: "v1", name_for_human: "Musicfy", name_for_model: "musicfy",
    description_for_human: "Play, pause and search songs on Musicfy using AI",
    description_for_model: "Control Musicfy music player using natural language.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://unmischievously-rheotropic-luca.ngrok-free.dev/openapi.json" },
    logo_url: "https://main.d10qhhlua8zs8h.amplifyapp.com/favicon.ico",
    contact_email: "spinacle@gmail.com",
    legal_info_url: "https://main.d10qhhlua8zs8h.amplifyapp.com"
  });
});

app.get('/openapi.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    openapi: "3.0.1",
    info: { title: "Musicfy", description: "AI music player", version: "1.0.0" },
    servers: [{ url: "https://unmischievously-rheotropic-luca.ngrok-free.dev" }],
    paths: {
      "/chat": { post: { operationId: "chatWithMusicfy", summary: "Control Musicfy", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } } } }, responses: { "200": { description: "OK" } } } },
      "/health": { get: { operationId: "healthCheck", summary: "Health check", responses: { "200": { description: "OK" } } } }
    }
  });
});

// ============ GEMINI FUNCTION SPEC ============
app.get('/gemini-functions.json', (req, res) => {
  res.setProperty('Access-Control-Allow-Origin', '*');
  res.json({
    functions: [
      { name: "play_song", description: "Play a specific song on Musicfy.", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
      { name: "control_playback", description: "Pause, resume or stop music", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
      { name: "search_song", description: "Search for songs or artists", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } }
    ]
  });
});

// ============ ANALYTICS ============
app.get('/analytics', async (req, res) => {
  try {
    const result = await ddb.send(new ScanCommand({ TableName: "musicfy-intent-logs" }));
    const items = result.Items || [];
    const today = new Date().toISOString().split('T')[0];
    const todayItems = items.filter(i => i.timestamp.startsWith(today));
    const intents = {};
    todayItems.forEach(i => { intents[i.intent_action] = (intents[i.intent_action] || 0) + 1; });
    res.json({ total: todayItems.length, intents, recent: todayItems.slice(-10).reverse() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ HEALTH ============
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '12.4-FINAL' });
});

const SYSTEM_PROMPT = `You are Musicfy AI, a friendly music player assistant. Answer general music questions helpfully and briefly.`;

// ============ CHAT ============
app.post('/chat', express.json(), async (req, res) => {
  const { message } = req.body;
  const userMsg = (message || "").toLowerCase().trim();

  // PAUSE/STOP
  if (userMsg.includes("pause") || userMsg.includes("stop")) {
    currentMcpCommand = { action: 'pause' };
    await logIntent("paused", message, []);
    return res.json({ reply: "⏸ Paused.", intent: "paused", status: "paused", song: "", action: "paused", suggestions: [] });
  }

  // RESUME
  if (userMsg.includes("resume")) {
    currentMcpCommand = { action: 'resume' };
    await logIntent("resumed", message, []);
    return res.json({ reply: "▶ Resumed.", intent: "resumed", status: "resumed", song: "", action: "resumed", suggestions: [] });
  }

  // DOWNLOAD
  if (userMsg.includes("download")) {
    await logIntent("downloading", message, []);
    return res.json({ reply: "⬇ Downloading.", intent: "downloading", status: "downloading", song: "", action: "downloading", suggestions: [] });
  }

  // ============ PLAY — FIXED REGEX ============
  if (userMsg.includes('play')) {
    const song = message
      .replace(/\bplay\b/gi, '')      // remove ONLY the word "play"
      .replace(/\bsong\b/gi, '')      // remove word "song" anywhere
      .replace(/\bplease\b/gi, '')
      .replace(/\bbro\b/gi, '')
      .replace(/\bcan you\b/gi, '')
      .replace(/\bcould you\b/gi, '')
      .trim();

    const genericWords = [
      'any', 'something', 'random', 'anything', 'some',
      'music', 'one', '', 'any song', 'random song',
      'some song', 'any music', 'something good',
      'good song', 'nice song', 'good music', 'a', 'an'
    ];

    const isGeneric = !song || song.length < 2 ||
      genericWords.some(w => song.toLowerCase().trim() === w);

    if (isGeneric) {
      currentMcpCommand = { action: 'play', song: 'random' };
      await logIntent("playing", message, []);
      return res.json({
        reply: `🎵 Playing a random song for you! Enjoy the music! 🎶`,
        intent: "playing", status: "playing",
        song: "random", action: "playing", suggestions: []
      });
    }

    // ✅ FIX: ALL songs get concert suggestions (removed wordCount >= 2 condition)
    currentMcpCommand = { action: 'play', song: song };
    const suggestions = await getLiveConcertSuggestions(song);
    await logIntent("playing", message, suggestions);
    return res.json({
      reply: `🎵 Playing "${song}" now! Enjoy the music! 🎶`,
      intent: "playing", status: "playing",
      song, action: "playing", suggestions
    });
  }

  // SEARCH
  if (userMsg.includes('search') || userMsg.includes('find')) {
    const query = message.replace(/\bsearch\b|\bfind\b|\bfor\b/gi, "").trim();
    currentMcpCommand = { action: 'search', query: query };
    const suggestions = await getSuggestions('music.search', { query });
    await logIntent("searching", message, suggestions);
    return res.json({ reply: `🔍 Searching for "${query}"...`, intent: "searching", status: "searching", song: query, action: "searching", suggestions });
  }

  // QWEN GENERAL
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'qwen2.5:3b', messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: message }], stream: false })
    });
    const data = await response.json();
    const fullReply = data.message?.content || "How can I help you with music today?";
    await logIntent("general", message, []);
    res.json({ reply: fullReply.trim(), intent: "unknown", status: "unknown", song: "", action: "unknown", suggestions: [] });
  } catch (error) {
    res.status(500).json({ error: 'Busy', suggestions: [] });
  }
});

// ============ CONCERT BOOK ============
app.post('/concert-book', express.json(), async (req, res) => {
  const { event_id, user_email, quantity = 1 } = req.body;
  console.log(`🎟️ Concert book: event_id=${event_id} email=${user_email}`);
  try {
    const resp = await fetch(`${MYVE_ROUTER_URL}/route/concert-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id, user_email, quantity, referrer: 'musicfy' })
    });
    const data = await resp.json();
    console.log(`✅ Booking result:`, JSON.stringify(data));
    res.json(data);
  } catch(e) {
    console.error('Concert book error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ ROUTE BOOKING (compatibility) ============
app.post('/route-booking', express.json(), async (req, res) => {
  const { artist, user_email, quantity = 1 } = req.body;
  try {
    const searchResp = await fetch(`${MYVE_ROUTER_URL}/route/concert-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, referrer: 'musicfy' })
    });
    const searchData = await searchResp.json();
    const eventIdMatch = searchData.data?.match(/EVT\d+/i);
    if (!eventIdMatch) return res.json({ success: false, error: "No events found for " + artist });
    const event_id = eventIdMatch[0];
    const bookResp = await fetch(`${MYVE_ROUTER_URL}/route/concert-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id, quantity, user_email, referrer: 'musicfy' })
    });
    const bookData = await bookResp.json();
    res.json(bookData);
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MASTER V12.4 (FINAL) ONLINE ON PORT ${PORT}`);
});
