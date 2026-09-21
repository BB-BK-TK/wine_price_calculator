(() => {
  const SUPABASE_URL = 'https://kacvynoegfpvgdpqtjdi.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SeG92zfrAeh5zECaVbztkw_qb0C91D6';
  const ENDPOINT = `${SUPABASE_URL}/rest/v1/wine_events`;

  const allowedPaths = new Set(['/', '/index.html', '/match.html', '/match']);

  function currentPath() {
    const path = location.pathname || '/';
    if (allowedPaths.has(path)) return path;
    if (path.endsWith('/index.html')) return '/index.html';
    if (path.endsWith('/match.html')) return '/match.html';
    return '/';
  }

  function randomUuid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function visitorId() {
    const key = 'wine_visitor_id';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = randomUuid();
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      if (!window.__wineVisitorId) window.__wineVisitorId = randomUuid();
      return window.__wineVisitorId;
    }
  }

  function source() {
    const params = new URLSearchParams(location.search);
    const utm = (params.get('utm_source') || '').toLowerCase();
    if (utm.includes('instagram') || utm === 'ig') return 'instagram';
    if (utm.includes('linkedin')) return 'linkedin';
    if (utm) return 'other';

    if (!document.referrer) return 'direct';
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (host === location.hostname.toLowerCase()) return 'internal';
      if (host.includes('instagram.com') || host.includes('l.instagram.com')) return 'instagram';
      if (host.includes('linkedin.com') || host.includes('lnkd.in')) return 'linkedin';
      return 'other';
    } catch (_) {
      return 'other';
    }
  }

  function cleanProps(props = {}) {
    const clean = {};
    Object.entries(props).slice(0, 8).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'string') clean[key] = value.slice(0, 80);
      else if (typeof value === 'number' || typeof value === 'boolean') clean[key] = value;
    });
    return clean;
  }

  function track(eventName, props = {}) {
    const payload = {
      event_name: eventName,
      page_path: currentPath(),
      source: source(),
      visitor_id: visitorId(),
      props: cleanProps(props)
    };

    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }

  function selectedValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function activeModel() {
    return document.getElementById('ourTab')?.classList.contains('active') ? 'our' : 'ash';
  }

  function parseScore() {
    const text = document.getElementById('score')?.textContent || '';
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) ? n : undefined;
  }

  function setupPricePage() {
    document.getElementById('matchLaunch')?.addEventListener('click', () => {
      track('wine_match_open');
    });

    document.getElementById('originOpen')?.addEventListener('click', () => {
      track('origin_open');
    });

    document.getElementById('ashTab')?.addEventListener('click', () => {
      track('model_switch', { model: 'ash' });
    });

    document.getElementById('ourTab')?.addEventListener('click', () => {
      track('model_switch', { model: 'our' });
    });

    const captureCalculation = () => {
      setTimeout(() => {
        if (!document.getElementById('result')?.classList.contains('show')) return;
        track('price_calculation', {
          model: activeModel(),
          grape: selectedValue('grape'),
          bottle: selectedValue('bottle') || '750'
        });
      }, 80);
    };

    document.getElementById('calculate')?.addEventListener('click', captureCalculation);
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') captureCalculation();
    });
  }

  function setupMatchPage() {
    const params = new URLSearchParams(location.search);
    const shared = params.get('result') === '1';

    if (shared) {
      const sharedProps = {
        grape: params.get('grape') || '',
        food: params.get('food') || ''
      };
      track('shared_result_open', sharedProps);
      track('match_result', { ...sharedProps, score: parseScore(), shared: true });
    }

    document.getElementById('runBtn')?.addEventListener('click', () => {
      track('match_run', {
        grape: selectedValue('grape'),
        food: selectedValue('food')
      });
    });

    document.getElementById('destinyTab')?.addEventListener('click', () => {
      track('destiny_open', { grape: selectedValue('destinyGrape') });
    });

    document.getElementById('rank')?.addEventListener('click', event => {
      const button = event.target.closest('button[data-food]');
      if (!button) return;
      track('destiny_pick', {
        grape: selectedValue('destinyGrape'),
        food: button.dataset.food || ''
      });
    });

    document.getElementById('shareResult')?.addEventListener('click', () => {
      track('share_click', { placement: 'result' });
    });

    document.getElementById('shareTop')?.addEventListener('click', () => {
      track('share_click', { placement: 'top' });
    });

    document.getElementById('backBtn')?.addEventListener('click', () => {
      track('back_to_price');
    });

    const result = document.getElementById('result');
    if (result && !shared) {
      let wasShown = result.classList.contains('show');
      const observer = new MutationObserver(() => {
        const isShown = result.classList.contains('show');
        if (isShown && !wasShown) {
          track('match_result', {
            grape: selectedValue('grape'),
            food: selectedValue('food'),
            score: parseScore(),
            shared: false
          });
        }
        wasShown = isShown;
      });
      observer.observe(result, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function init() {
    track('page_view', {
      language: (navigator.language || 'unknown').slice(0, 20)
    });

    if (document.getElementById('calculate')) setupPricePage();
    if (document.getElementById('runBtn')) setupMatchPage();
  }

  window.wineAnalytics = { track };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
