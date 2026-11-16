// Vercel serverless function: forwards events to Meta Conversions API
const ALLOWED = ['PageView', 'TelegramClick'];

function getCookie(header, name) {
  const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.META_ACCESS_TOKEN;
  const pixelId = process.env.PIXEL_ID;
  if (!token || !pixelId) return res.status(500).json({ error: 'Missing env vars' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  if (!ALLOWED.includes(b.event_name) || !b.event_id) {
    return res.status(400).json({ error: 'Invalid event' });
  }

  const cookies = req.headers.cookie;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  const user_data = {
    client_ip_address: ip,
    client_user_agent: req.headers['user-agent'],
  };
  const fbp = getCookie(cookies, '_fbp');
  const fbc = getCookie(cookies, '_fbc');
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;

  const payload = {
    data: [{
      event_name: b.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(b.event_id),               // same ID as the browser Pixel -> Meta de-duplicates
      action_source: 'website',
      event_source_url: b.event_source_url,
      user_data,
    }],
  };
  if (process.env.TEST_EVENT_CODE) payload.test_event_code = process.env.TEST_EVENT_CODE;

  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const out = await r.json();
    return res.status(r.ok ? 200 : 502).json(out);
  } catch (e) {
    return res.status(502).json({ error: 'Meta request failed' });
  }
};
