// Vercel Serverless Function — Facebook Conversions API proxy (pixel da campanha IGF/IA)
// Token fica em variável de ambiente (META_ACCESS_TOKEN_IGF) — nunca exposto ao cliente.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const token   = process.env.META_ACCESS_TOKEN_IGF;
  const pixelId = process.env.META_PIXEL_ID_IGF || '1051414871222186';

  if (!token) return res.status(500).json({ error: 'META_ACCESS_TOKEN_IGF not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  const ip = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim() || '';
  const ua = req.headers['user-agent'] || '';

  const userData = { client_ip_address: ip, client_user_agent: ua };
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;
  if (body.em)  userData.em  = body.em;
  if (body.ph)  userData.ph  = body.ph;

  const payload = {
    data: [{
      event_name:       body.event_name || 'PageView',
      event_time:       Math.floor(Date.now() / 1000),
      event_id:         body.event_id || String(Date.now()),
      event_source_url: body.event_source_url || '',
      action_source:    'website',
      user_data:        userData,
    }]
  };

  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );
    const data = await fbRes.json();
    return res.status(fbRes.ok ? 200 : fbRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
