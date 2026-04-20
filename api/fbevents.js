// Vercel Serverless Function — Facebook Conversions API proxy
// O token fica em variável de ambiente (FB_CAPI_TOKEN) — nunca exposto ao cliente.

export default async function handler(req, res) {
  // CORS — aceita apenas chamadas da própria origem
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const token   = process.env.FB_CAPI_TOKEN;
  const pixelId = '2402736016679729';

  if (!token) return res.status(500).json({ error: 'FB_CAPI_TOKEN not configured' });

  // Parsear body (Vercel já faz isso, mas garantimos caso venha como string)
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  // IP real do visitante (Vercel injeta x-forwarded-for)
  const ip = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim() || '';
  const ua = req.headers['user-agent'] || '';

  // user_data — cookies fbp/fbc enviados pelo cliente + dados do servidor
  const userData = { client_ip_address: ip, client_user_agent: ua };
  if (body.fbp) userData.fbp = body.fbp;  // cookie _fbp (gerado pelo Pixel)
  if (body.fbc) userData.fbc = body.fbc;  // cookie _fbc (gerado pelo Pixel)
  if (body.em)  userData.em  = body.em;   // e-mail SHA-256 (opcional)
  if (body.ph)  userData.ph  = body.ph;   // telefone SHA-256 (opcional)

  const payload = {
    data: [{
      event_name:       body.event_name || 'PageView',
      event_time:       Math.floor(Date.now() / 1000),
      event_id:         body.event_id || String(Date.now()),  // deduplicação com Pixel client-side
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
