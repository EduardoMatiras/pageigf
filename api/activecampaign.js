// Vercel Serverless Function — proxy de integração com o ActiveCampaign
// Credenciais ficam em variáveis de ambiente (AC_API_URL, AC_API_TOKEN) — nunca expostas ao cliente.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const apiUrl   = process.env.AC_API_URL;
  const apiToken = process.env.AC_API_TOKEN;
  const tagName  = process.env.AC_TAG_NAME || 'IGF-D1-2026';

  if (!apiUrl || !apiToken) {
    return res.status(500).json({ error: 'AC_API_URL / AC_API_TOKEN not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const email = (body.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email is required' });

  // Lista pode ser definida por página (body.listId); cai no padrão se não vier ou for inválida.
  const listId = /^\d+$/.test(String(body.listId || '')) ? String(body.listId) : (process.env.AC_LIST_ID || '1312');

  const firstName = (body.firstName || body.nome || '').trim();
  const phone     = (body.phone || body.whatsapp || '').trim();

  const acHeaders = {
    'Api-Token':   apiToken,
    'Content-Type': 'application/json',
  };

  try {
    // 1) Cria ou atualiza o contato
    const syncRes = await fetch(`${apiUrl}/api/3/contact/sync`, {
      method:  'POST',
      headers: acHeaders,
      body: JSON.stringify({
        contact: {
          email,
          firstName,
          phone,
          // IDs numéricos reais dos campos customizados na conta AC (não são o nome do campo —
          // a API só aceita o ID; ver GET /api/3/fields para conferir/atualizar).
          fieldValues: [
            { field: '12', value: (body.utm_source   || '').toUpperCase() }, // UTM_SOURCE (%UTM_SOURCE_2%)
            { field: '8',  value: (body.utm_medium   || '').toUpperCase() }, // UTM_MEDIUM (%UTM_MEDIUM_2%)
            { field: '11', value: (body.utm_campaign || '').toUpperCase() }, // UTM_CAMPAIGN (%UTM_CAMPAIGN_2%)
            { field: '10', value: (body.utm_term     || '').toUpperCase() }, // UTM_TERM (%UTM_TERM_2%)
            { field: '5',  value: (body.utm_content  || '').toUpperCase() }, // UTM_CONTENT (%UTM_CONTENT_2%)
            { field: '60', value: body.dispositivo   || '' },                // Dispositivo
          ].filter(f => f.value),
        },
      }),
    });
    const syncData = await syncRes.json();
    if (!syncRes.ok) return res.status(syncRes.status).json(syncData);
    const contactId = syncData?.contact?.id;

    // 2) Inscreve o contato na lista
    if (contactId && listId) {
      await fetch(`${apiUrl}/api/3/contactLists`, {
        method:  'POST',
        headers: acHeaders,
        body: JSON.stringify({
          contactList: { list: listId, contact: contactId, status: 1 },
        }),
      });
    }

    // 3) Garante a tag (busca por nome; cria se não existir) e vincula ao contato
    if (contactId && tagName) {
      let tagId = null;
      const searchRes = await fetch(`${apiUrl}/api/3/tags?search=${encodeURIComponent(tagName)}`, {
        headers: acHeaders,
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const found = (searchData.tags || []).find(t => t.tag === tagName);
        if (found) tagId = found.id;
      }
      if (!tagId) {
        const createRes = await fetch(`${apiUrl}/api/3/tags`, {
          method:  'POST',
          headers: acHeaders,
          body: JSON.stringify({ tag: { tag: tagName, tagType: 'contact' } }),
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          tagId = createData?.tag?.id;
        }
      }
      if (tagId) {
        await fetch(`${apiUrl}/api/3/contactTags`, {
          method:  'POST',
          headers: acHeaders,
          body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
        });
      }
    }

    return res.status(200).json({ ok: true, contactId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
