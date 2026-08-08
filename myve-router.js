const express = require('express');
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const ROUTER_PORT = 3007;
app.use(express.json());

// Partner config
const PARTNERS = {
  festora: {
    mcp_url: 'https://scrawny-guidable-flagstone.ngrok-free.dev/mcp',
    api_key: 'festora-secret-key-change-this',
    tools: { search: 'booking_search', reserve: 'booking_reserve' }
  },
  audioai: {
    mcp_url: 'https://audioai.ddns.net:8090/mcp',
    api_key: 'audioai-secret-key',
    tools: { remix: 'audio_remix', trim: 'audio_trim' }
  }
};

// DynamoDB
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-south-1' }));

async function logReferral(data) {
  try {
    await ddb.send(new PutCommand({
      TableName: 'myve-referral-logs',
      Item: { event_id: `ref_${Date.now()}`, timestamp: new Date().toISOString(), ...data }
    }));
    console.log('📋 Referral logged:', data.event_type);
  } catch (e) {
    console.error('DynamoDB referral log error:', e.message);
  }
}

// MCP call helper
async function callPartnerMCP(partner, toolName, args, referrer = "musicfy") {
  const p = PARTNERS[partner];
  const resp = await fetch(p.mcp_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.api_key,
      'ngrok-skip-browser-warning': 'true',
      'x-myve-referrer': referrer,
      'x-myve-referral-id': `myve_${Date.now()}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: '1', method: 'tools/call',
      params: { name: toolName, arguments: args }
    })
  });
  return resp.json();
}

// ============ ALL 41 SONGS — CORRECTED ARTIST MAP ============
const ARTIST_MAP = {

  // ===== YUVAN SHANKAR RAJA SONGS (30 songs) =====
  'dope track': 'Yuvan Shankar Raja',
  'en fuse pochu': 'Yuvan Shankar Raja',
  'high on love': 'Yuvan Shankar Raja',
  'idhayam': 'Yuvan Shankar Raja',
  'iragai poley': 'Yuvan Shankar Raja',
  'iragai': 'Yuvan Shankar Raja',
  'kadhal aasai': 'Yuvan Shankar Raja',
  'kanaa kaanum': 'Yuvan Shankar Raja',
  'kannai vittu': 'Yuvan Shankar Raja',
  'konjalam konjalaai': 'Yuvan Shankar Raja',
  'konjalam': 'Yuvan Shankar Raja',
  'kovakkara kiliye': 'Yuvan Shankar Raja',
  'machaan machaan': 'Yuvan Shankar Raja',
  'manmadhane nee': 'Yuvan Shankar Raja',
  'manmadhane': 'Yuvan Shankar Raja',
  'naan ini kaatril': 'Yuvan Shankar Raja',
  'naan ini': 'Yuvan Shankar Raja',
  'needhane': 'Yuvan Shankar Raja',
  'oru devathai': 'Yuvan Shankar Raja',
  'ottraikkannale': 'Yuvan Shankar Raja',
  'overa feel pannuren': 'Yuvan Shankar Raja',
  'overa feel': 'Yuvan Shankar Raja',
  'pattu pattu': 'Yuvan Shankar Raja',
  'pesa vanthen': 'Yuvan Shankar Raja',
  'siragugal': 'Yuvan Shankar Raja',
  'sudasuda thooral': 'Yuvan Shankar Raja',
  'thaakkuthe kan thaakkuthe': 'Yuvan Shankar Raja',
  'thaakkuthe': 'Yuvan Shankar Raja',
  'thuli thuli': 'Yuvan Shankar Raja',
  'vennira iravugal': 'Yuvan Shankar Raja',
  'vennira': 'Yuvan Shankar Raja',
  'yedhedo ennangal': 'Yuvan Shankar Raja',
  'yedhedo': 'Yuvan Shankar Raja',
  'vinnai thandi': 'Yuvan Shankar Raja',
  'mundhinam': 'Yuvan Shankar Raja',
  'yuvan': 'Yuvan Shankar Raja',
  'devathaiya kandein': 'Yuvan Shankar Raja',
  'devathaiya': 'Yuvan Shankar Raja',
  'pathu thala': 'Yuvan Shankar Raja',
  'unnai kaanadhu': 'Yuvan Shankar Raja',
  'veyil': 'Yuvan Shankar Raja',
  'kannamoochi': 'Yuvan Shankar Raja',
  'kadhal': 'Yuvan Shankar Raja',

  // ✅ FIXED — Thaaliyae is YUVAN not Hariharan!
  'thaaliyae thevaiyillai': 'Yuvan Shankar Raja',
  'thaaliyae': 'Yuvan Shankar Raja',

  // ===== HARICHARAN SONGS =====
  'arabu naadu': 'Haricharan',
  'yaar intha': 'Haricharan',

  // ===== ILAIYARAAJA SONGS =====
  'maari aanandhi': 'Ilaiyaraaja',
  'maari': 'Ilaiyaraaja',

  // ===== VIJAY YESUDAS SONGS =====
  'kaadhal vaithu': 'Vijay Yesudas',
  'thavani pootta': 'Vijay Yesudas',
  'thavani': 'Vijay Yesudas',

  // ===== HARIHARAN SONGS =====
  'irava pagala': 'Hariharan',

  // ===== S.P. BALASUBRAHMANYAM SONGS =====
  'yaaro duet': 'S.P. Balasubrahmanyam',
  'yaaro': 'S.P. Balasubrahmanyam',

  // ===== KARTHIK SONGS =====
  'naan aval illai': 'Karthik',

  // ===== AL RUFIAN SONGS =====
  'secret window': 'Al Rufian',

  // ===== DHANUSH SONGS =====
  'solli tholaiyen ma': 'Dhanush',
  'solli': 'Dhanush',

  // ===== SENTHIL DASS SONGS =====
  'aandipatti': 'Senthil Dass',
};

function getArtistFromSong(songName) {
  const lower = (songName || '').toLowerCase();
  const matched = Object.keys(ARTIST_MAP).find(k => lower.includes(k));
  const artist = matched ? ARTIST_MAP[matched] : songName;
  console.log(`🎵 Song: "${songName}" → Artist: "${artist}"`);
  return artist;
}

// Route: search concerts
app.post('/route/concert-search', async (req, res) => {
  const { artist, referrer = "musicfy" } = req.body;
  const searchArtist = getArtistFromSong(artist);
  console.log(`🎫 Concert search: "${artist}" → "${searchArtist}"`);
  try {
    const result = await callPartnerMCP('festora', 'booking_search', { query: searchArtist }, referrer);
    const text = result.result?.content?.[0]?.text || "";
    await logReferral({ event_type: 'concert_search', referrer, partner: 'festora', artist: searchArtist, original_song: artist, raw_response: text.substring(0, 500) });
    res.json({ success: true, data: text, referrer, artist: searchArtist });
  } catch (e) {
    console.error('Concert search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Route: book concert
app.post('/route/concert-book', async (req, res) => {
  const { event_id, quantity, user_email, referrer = "musicfy" } = req.body;
  try {
    console.log(`🎟️ Booking concert: ${event_id} for ${user_email}`);
    const result = await callPartnerMCP('festora', 'booking_reserve', { event_id, quantity, user_email }, referrer);
    const text = result.result?.content?.[0]?.text || "";
    await logReferral({ event_type: 'concert_booked', referrer, partner: 'festora', event_id, quantity, user_email, booking_confirmation: text.substring(0, 500) });
    res.json({ success: true, data: text });
  } catch (e) {
    console.error('Concert booking error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Route: audio remix
app.post('/route/audio-remix', async (req, res) => {
  const { song, referrer = "musicfy" } = req.body;
  try {
    const result = await callPartnerMCP("audioai", "audio_remix", { song }, referrer);
    await logReferral({ event_type: "audio_remix_requested", referrer, partner: 'audioai', song });
    res.json({ success: true, data: result.result?.content?.[0]?.text || "" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analytics
const ANALYTICS_KEY = process.env.MYVE_ANALYTICS_KEY || 'myve-analytics-2026';
function requireAnalyticsAuth(req, res, next) {
  const key = req.headers['x-analytics-key'];
  if (key !== ANALYTICS_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/analytics/network', requireAnalyticsAuth, async (req, res) => {
  try {
    const [musicLogs, festLogs, referLogs] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: 'musicfy-intent-logs' })),
      ddb.send(new ScanCommand({ TableName: 'festora-intent-logs' })),
      ddb.send(new ScanCommand({ TableName: 'myve-referral-logs' }))
    ]);
    const today = new Date().toISOString().split('T')[0];
    const todayFilter = items => (items || []).filter(i => i.timestamp?.startsWith(today));
    const mToday = todayFilter(musicLogs.Items);
    const fToday = todayFilter(festLogs.Items);
    const rToday = todayFilter(referLogs.Items);
    const intentCount = (items, field = "intent_action") =>
      items.reduce((acc, i) => { acc[i[field] || 'unknown'] = (acc[i[field] || 'unknown'] || 0) + 1; return acc; }, {});
    const searches = rToday.filter(e => e.event_type === 'concert_search').length;
    const bookings = rToday.filter(e => e.event_type === 'concert_booked').length;
    const convRate = searches > 0 ? ((bookings / searches) * 100).toFixed(1) : 0;
    res.json({
      generated_at: new Date().toISOString(),
      today: {
        musicfy: { total: mToday.length, intents: intentCount(mToday) },
        festora: { total: fToday.length, intents: intentCount(fToday, "event_type") },
        network: { referrals: rToday.length, concert_searches: searches, concert_bookings: bookings, conversion_rate: `${convRate}%` }
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/analytics/musicfy', requireAnalyticsAuth, async (req, res) => {
  const result = await ddb.send(new ScanCommand({ TableName: 'musicfy-intent-logs' }));
  res.json({ items: result.Items || [] });
});

app.get('/analytics/festora', requireAnalyticsAuth, async (req, res) => {
  const result = await ddb.send(new ScanCommand({ TableName: 'festora-intent-logs' }));
  res.json({ items: result.Items || [] });
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'myve-router', version: '2.1-FIXED-ARTISTS', port: ROUTER_PORT }));

app.listen(ROUTER_PORT, "0.0.0.0", () => {
  console.log(`🧭 Myve Intent Router v2.1 (FIXED-ARTISTS) online on port ${ROUTER_PORT}`);
});
