const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const TARGET_USER_ID = process.env.TARGET_USER_ID || '';
const KEYWORDS = (process.env.KEYWORDS || '關鍵字').split(',').map(s => s.trim()).filter(Boolean);
const CASE_INSENSITIVE = (process.env.CASE_INSENSITIVE || '1') === '1';

const app = express();
const client = new line.Client(config);

app.get('/', (_, res) => res.send('LINE keyword bot is running.'));
app.get('/privacy', (_, res) => res.type('text').send('Privacy: scans in-memory; no data stored.'));
app.get('/terms',   (_, res) => res.type('text').send('Terms: use at your own discretion.'));

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(200).end(); // avoid retries
  }
});

function textMatches(text) {
  if (!text) return false;
  const src = CASE_INSENSITIVE ? text.toLowerCase() : text;
  return KEYWORDS.some(k => {
    if (k.startsWith('/') && k.endsWith('/')) {
      try {
        const body = k.slice(1, -1);
        const flags = CASE_INSENSITIVE ? 'i' : undefined;
        return new RegExp(body, flags).test(text);
      } catch { return false; }
    }
    return src.includes(CASE_INSENSITIVE ? k.toLowerCase() : k);
  });
}

async function handleEvent(event) {
  if ((event.type === 'follow') ||
      (event.type === 'message' && event.source?.type === 'user')) {
    console.log('[Your userId may be this] =>', event.source?.userId);
  }
  if (event.type !== 'message' || event.message?.type !== 'text') return;
  const srcType = event.source?.type;
  if (srcType !== 'group' && srcType !== 'room') return;

  if (!TARGET_USER_ID) { console.warn('TARGET_USER_ID empty; cannot push.'); return; }

  const text = event.message.text || '';
  if (textMatches(text)) {
    const snippet = text.length > 200 ? (text.slice(0, 197) + '...') : text;
    const when = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    try {
      await client.pushMessage(TARGET_USER_ID, {
        type: 'text',
        text: `🔔 偵測到關鍵字\n來源：${srcType}\n時間：${when}\n內容：${snippet}`
      });
    } catch (e) { console.error('Push failed:', e); }
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server started on port', port));
