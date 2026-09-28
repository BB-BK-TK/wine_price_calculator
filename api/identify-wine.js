export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const image = req.body?.image;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A base64 image data URL is required.' });
    }
    if (image.length > 4_000_000) {
      return res.status(413).json({ error: 'Image is too large.' });
    }

    // In Vercel Functions the fresh OIDC token is injected per request as a
    // header. The environment variable is primarily available during builds
    // and local development, so checking only process.env breaks production.
    const requestOidcHeader = req.headers?.['x-vercel-oidc-token'];
    const requestOidcToken = Array.isArray(requestOidcHeader) ? requestOidcHeader[0] : requestOidcHeader;
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || requestOidcToken;
    if (!token) {
      return res.status(503).json({ error: 'Vision service is not configured.', code: 'VISION_NOT_CONFIGURED' });
    }

    const prompt = [
      'Identify the wine bottle in this photo from the visible label and bottle.',
      'Return ONLY valid JSON, no markdown, using exactly these keys:',
      '{"producer":string|null,"wine":string|null,"vintage":number|null,"grape":string|null,"location":string|null,"country":string|null,"confidence":number,"reason":string}',
      'Rules:',
      '- Carefully read both large stylized lettering and smaller label text. Product photos with whitespace around the bottle are valid inputs.',
      '- Return a clearly visible producer or product-line name even when vintage, grape, or region cannot be read.',
      '- Do not guess a vintage that is not visible.',
      '- Do not invent producer, wine, grape, or region. If uncertain, use null.',
      '- Normalize common grape names in English (e.g. Cabernet Sauvignon, Pinot Noir, Chardonnay, Riesling, Syrah, Malbec).',
      '- location should be the most useful wine region visible or strongly identifiable from the label, not a retailer/location.',
      '- confidence is 0 to 1 for the bottle identity, not for the number of fields completed.',
      '- reason is a very short explanation of the visible evidence, maximum 20 words.',
      '- If the label is too blurry or obstructed, return null fields and low confidence.'
    ].join('\n');

    const gatewayResponse = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-sol',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image, detail: 'high' }
          ]
        }],
        max_output_tokens: 700
      })
    });

    if (!gatewayResponse.ok) {
      const detail = await gatewayResponse.text();
      console.error('AI Gateway error', gatewayResponse.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'Wine identification failed.', code: 'VISION_UPSTREAM_ERROR' });
    }

    const result = await gatewayResponse.json();
    const outputText =
      result.output_text ||
      result.output?.flatMap(item => item.content || [])
        .map(item => item.text || item.output_text || '')
        .join('\n') ||
      '';

    const jsonText = outputText.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) {
      console.error('No JSON in model response', outputText.slice(0, 500));
      return res.status(502).json({ error: 'Wine identification returned an invalid result.', code: 'VISION_INVALID_RESULT' });
    }

    const parsed = JSON.parse(jsonText);
    const clean = {
      producer: typeof parsed.producer === 'string' ? parsed.producer.trim().slice(0, 120) : null,
      wine: typeof parsed.wine === 'string' ? parsed.wine.trim().slice(0, 120) : null,
      vintage: Number.isInteger(parsed.vintage) && parsed.vintage >= 1900 && parsed.vintage <= new Date().getFullYear() ? parsed.vintage : null,
      grape: typeof parsed.grape === 'string' ? parsed.grape.trim().slice(0, 80) : null,
      location: typeof parsed.location === 'string' ? parsed.location.trim().slice(0, 120) : null,
      country: typeof parsed.country === 'string' ? parsed.country.trim().slice(0, 80) : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 180) : ''
    };

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(clean);
  } catch (error) {
    console.error('identify-wine error', error);
    return res.status(500).json({ error: 'Unexpected wine identification error.', code: 'VISION_UNEXPECTED_ERROR' });
  }
}
