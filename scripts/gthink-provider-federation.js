(() => {
  'use strict';

  const SCHEMA = 'GTHINK_PROVIDER_FEDERATION_V1';
  const SCRIPT_BASE = new URL('.', document.currentScript?.src || location.href);
  const HF_CLIENT_ID = new URL('../.well-known/oauth-cimd', SCRIPT_BASE).href;
  const HF_CALLBACK = new URL('../oauth/huggingface-callback.html', SCRIPT_BASE).href;
  const OR_CALLBACK = new URL('../oauth/openrouter-callback.html', SCRIPT_BASE).href;
  const HF_CHAT = 'https://router.huggingface.co/v1/chat/completions';
  const OR_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
  const LEGACY_URL = new URL('gthink-provider-blob.js?v=2', SCRIPT_BASE).href;
  const STORE = Object.freeze({
    hfToken: 'gvault.provider.hf.access.v1',
    hfExpiry: 'gvault.provider.hf.expiry.v1',
    hfVerifier: 'gvault.provider.hf.pkce.verifier.v1',
    hfState: 'gvault.provider.hf.oauth.state.v1',
    orKey: 'gvault.provider.openrouter.key.v1',
    orVerifier: 'gvault.provider.openrouter.pkce.verifier.v1',
    orState: 'gvault.provider.openrouter.oauth.state.v1',
    returnUrl: 'gvault.provider.oauth.return.v1'
  });
  const SYSTEM = `Tu es le renfort public externe de GThink pour les demandes générales. Réponds en français naturel et directement. N'affirme jamais avoir effectué une action externe si ce n'est pas vrai. Tu ne reçois que le message visible de l'utilisateur et un court historique public nettoyé. Tu n'as aucun accès au GVAULT privé, aux secrets, aux dépôts privés ni au raisonnement caché. Si une information doit être actuelle et qu'aucune recherche web n'est disponible, dis-le clairement. Les réponses servent à informer et interpréter, jamais à autoriser une action privée.`;
  const GVAULT_RX = /\b(gvault|gthink|vault agent|sas|blob|route|routage|method router|best functional|first[_ -]?capture|ledger|verbatim|checkpoint|build|version|projet|project|aquarium|multiworld|control tower|gadmin|ladybug|coccinelle)\b/i;
  const LIVE_RX = /\b(aujourd['’]?hui|maintenant|actuel(?:le|les|s)?|actualité|actualite|news|derni[eè]re?s?|latest|current|live|en ce moment|ce matin|ce soir|prix|cours|bourse|score|m[eé]t[eé]o|sorti|sortie|vient de|internet|sur le web|en ligne|cherche(?:r)? sur internet|v[eé]rifie(?:r)? sur internet)\b/i;
  const SIMPLE_RX = /^(salut|bonjour|bonsoir|yo|hey|coucou|hello|merci|ok|okay|d['’]?accord|ça va|ca va|tu vas bien|tout va bien)[ !?.]*$/i;
  let legacyLoad = null;

  function clean(v) { return String(v ?? '').trim(); }
  function sget(k) { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }
  function sset(k, v) { try { sessionStorage.setItem(k, String(v)); return true; } catch { return false; } }
  function sdel(k) { try { sessionStorage.removeItem(k); } catch {} }

  function b64url(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomVerifier() {
    return b64url(crypto.getRandomValues(new Uint8Array(48)));
  }

  async function challenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(digest));
  }

  function safeReturn() {
    const raw = clean(sget(STORE.returnUrl));
    if (raw) {
      try {
        const candidate = new URL(raw, location.href);
        if (candidate.origin === location.origin) return candidate.href;
      } catch {}
    }
    return new URL('../', SCRIPT_BASE).href;
  }

  function hfToken() {
    const token = clean(sget(STORE.hfToken));
    const expiry = Number(sget(STORE.hfExpiry) || 0);
    if (!token) return '';
    if (expiry && Date.now() > expiry - 30000) {
      sdel(STORE.hfToken);
      sdel(STORE.hfExpiry);
      return '';
    }
    return token;
  }

  function orKey() { return clean(sget(STORE.orKey)); }
  function needsLiveWeb(text) { return LIVE_RX.test(clean(text)); }
  function shouldFederate(text) {
    const t = clean(text);
    return !!t && !SIMPLE_RX.test(t) && !GVAULT_RX.test(t);
  }

  function emit(kind, payload = {}) {
    try {
      window.GVAULT_AGENT_LIVE_BLOB?.speak?.({
        schema: 'GVAULT_UNIVERSAL_BLOB_V1',
        blobId: `federation-${crypto.randomUUID?.() || Date.now()}`,
        parentBlobId: null,
        conversationId: 'gthink-provider-federation',
        kind,
        role: 'provider',
        from: 'GThinkProviderFederation',
        to: 'public.bus',
        intent: 'public_provider_federation',
        language: 'fr',
        at: new Date().toISOString(),
        surface: 'Gvault-Pages',
        streamUrl: window.GVAULT_AGENT_LIVE_BLOB?.streamUrl || 'gvault://blobs/public/gthink/stream',
        payload: { schema: SCHEMA, ...payload, containsSecret: false },
        understoodBy: ['GThink', 'public-kernel', 'provider-router'],
        silent: true,
        muted: false
      });
    } catch {}
  }

  function historyMessages(history) {
    return (Array.isArray(history) ? history : [])
      .slice(-10)
      .map(x => ({
        role: x?.role === 'assistant' ? 'assistant' : 'user',
        content: clean(x?.content).slice(0, 3000)
      }))
      .filter(x => x.content);
  }

  function contentText(content) {
    if (typeof content === 'string') return clean(content);
    if (Array.isArray(content)) {
      return clean(content.map(x => typeof x === 'string' ? x : x?.text || x?.content || '').filter(Boolean).join('\n'));
    }
    return clean(content?.text || content?.content);
  }

  async function fetchJson(url, options, timeout = 30000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (!response.ok) {
        throw new Error(clean(data?.error?.message || data?.error || data?.message) || `http_${response.status}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function hfModels(text) {
    const n = clean(text).toLocaleLowerCase('fr-FR');
    if (/\b(code|coder|javascript|python|html|css|sql|bug|debug|programme|programmer|fonction|script)\b/.test(n)) {
      return ['Qwen/Qwen3-Coder-480B-A35B-Instruct:cheapest', 'openai/gpt-oss-120b:cheapest'];
    }
    if (/\b(raisonne|raisonnement|preuve|math|physique|science|analyse profonde|démontr|demonstr)\b/.test(n)) {
      return ['deepseek-ai/DeepSeek-R1:cheapest', 'openai/gpt-oss-120b:cheapest'];
    }
    return ['openai/gpt-oss-120b:cheapest', 'deepseek-ai/DeepSeek-R1:cheapest'];
  }

  async function askHF(text, history) {
    const token = hfToken();
    if (!token) return { ok: false, error: 'hf_not_connected' };
    if (needsLiveWeb(text)) return { ok: false, error: 'hf_no_live_web' };

    let lastError = 'hf_no_model';
    for (const model of hfModels(text)) {
      try {
        const data = await fetchJson(HF_CHAT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM },
              ...historyMessages(history),
              { role: 'user', content: text }
            ],
            stream: false,
            temperature: 0.35,
            max_tokens: 1200
          })
        }, 35000);
        const out = contentText(data?.choices?.[0]?.message?.content);
        if (!out) throw new Error('hf_empty_output');
        emit('gthink.provider.federation.response', { provider: 'huggingface', model, webGrounded: false });
        return { ok: true, text: out, provider: 'huggingface', model, webGrounded: false };
      } catch (error) {
        lastError = clean(error?.message || error);
        if (/401|token|unauthor/i.test(lastError)) {
          sdel(STORE.hfToken);
          sdel(STORE.hfExpiry);
          break;
        }
      }
    }
    emit('gthink.provider.federation.error', { provider: 'huggingface', error: lastError });
    return { ok: false, error: lastError || 'hf_failed' };
  }

  function annotationSources(message) {
    const annotations = Array.isArray(message?.annotations) ? message.annotations : [];
    const seen = new Set();
    const out = [];
    for (const item of annotations) {
      const citation = item?.url_citation || item?.citation || item;
      const url = clean(citation?.url);
      const title = clean(citation?.title) || url;
      if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      out.push({ title, url });
      if (out.length >= 4) break;
    }
    return out;
  }

  function appendSources(text, sources) {
    if (!sources?.length) return text;
    return `${text}\n\nSources web :\n${sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join('\n')}`;
  }

  async function askOpenRouter(text, history) {
    const key = orKey();
    if (!key) return { ok: false, error: 'openrouter_not_connected' };
    const live = needsLiveWeb(text);
    try {
      const body = {
        model: 'openrouter/auto',
        messages: [
          { role: 'system', content: SYSTEM },
          ...historyMessages(history),
          { role: 'user', content: text }
        ],
        temperature: 0.35,
        max_tokens: 1400,
        stream: false
      };
      if (live) body.tools = [{ type: 'openrouter:web_search' }];
      const data = await fetchJson(OR_CHAT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'HTTP-Referer': location.origin + location.pathname.replace(/[^/]*$/, ''),
          'X-Title': 'GVAULT · GThink Public'
        },
        body: JSON.stringify(body)
      }, 40000);
      const message = data?.choices?.[0]?.message || {};
      const raw = contentText(message.content);
      if (!raw) throw new Error('openrouter_empty_output');
      const sources = live ? annotationSources(message) : [];
      const out = appendSources(raw, sources);
      emit('gthink.provider.federation.response', {
        provider: 'openrouter',
        model: clean(data?.model) || body.model,
        webGrounded: live,
        sources: sources.length
      });
      return {
        ok: true,
        text: out,
        provider: 'openrouter',
        model: clean(data?.model) || body.model,
        webGrounded: live,
        sources
      };
    } catch (error) {
      const err = clean(error?.message || error);
      if (/401|key|unauthor/i.test(err)) sdel(STORE.orKey);
      emit('gthink.provider.federation.error', { provider: 'openrouter', error: err });
      return { ok: false, error: err || 'openrouter_failed' };
    }
  }

  async function loadLegacy() {
    if (window.GTHINK_PROVIDER_BLOB?.ask) return window.GTHINK_PROVIDER_BLOB;
    if (legacyLoad) return legacyLoad;
    legacyLoad = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = LEGACY_URL;
      script.async = false;
      script.onload = () => resolve(window.GTHINK_PROVIDER_BLOB || null);
      script.onerror = () => resolve(null);
      (document.head || document.documentElement).appendChild(script);
    }).finally(() => { legacyLoad = null; });
    return legacyLoad;
  }

  async function askLocal(text, history, meta = {}) {
    try {
      const provider = await loadLegacy();
      if (!provider?.ask) return { ok: false, error: 'local_provider_unavailable' };
      const result = await provider.ask(text, history, {
        conversationId: 'gthink-provider-federation',
        parentBlobId: meta?.parentBlobId || null
      });
      return result?.ok
        ? { ...result, provider: 'local-webllm', webGrounded: false }
        : { ok: false, error: result?.error || 'local_provider_failed' };
    } catch (error) {
      return { ok: false, error: clean(error?.message || error) };
    }
  }

  async function ask(message, history = [], meta = {}) {
    const text = clean(message);
    if (!text) return { ok: false, error: 'empty_message' };
    const live = needsLiveWeb(text);
    emit('gthink.provider.federation.request', {
      liveWeb: live,
      hfConnected: !!hfToken(),
      openRouterConnected: !!orKey(),
      historyItems: Array.isArray(history) ? history.length : 0
    });

    if (live) {
      const openRouter = await askOpenRouter(text, history, meta);
      if (openRouter.ok) return openRouter;
      return {
        ok: false,
        error: orKey() ? openRouter.error : 'live_web_requires_openrouter',
        needsConnection: 'openrouter',
        webGrounded: false
      };
    }

    const hf = await askHF(text, history, meta);
    if (hf.ok) return hf;
    const openRouter = await askOpenRouter(text, history, meta);
    if (openRouter.ok) return openRouter;
    const local = await askLocal(text, history, meta);
    if (local.ok) return local;
    return {
      ok: false,
      error: [hf.error, openRouter.error, local.error].filter(Boolean).join('|') || 'no_provider_available',
      needsConnection: !hfToken() && !orKey() ? 'huggingface_or_openrouter' : null
    };
  }

  async function connectHuggingFace() {
    const verifier = randomVerifier();
    const state = randomVerifier().slice(0, 32);
    const codeChallenge = await challenge(verifier);
    sset(STORE.hfVerifier, verifier);
    sset(STORE.hfState, state);
    sset(STORE.returnUrl, location.href);
    const url = new URL('https://huggingface.co/oauth/authorize');
    url.searchParams.set('client_id', HF_CLIENT_ID);
    url.searchParams.set('redirect_uri', HF_CALLBACK);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile inference-api');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    location.assign(url.href);
  }

  async function connectOpenRouter() {
    const verifier = randomVerifier();
    const state = randomVerifier().slice(0, 32);
    const codeChallenge = await challenge(verifier);
    sset(STORE.orVerifier, verifier);
    sset(STORE.orState, state);
    sset(STORE.returnUrl, location.href);
    const callback = new URL(OR_CALLBACK);
    callback.searchParams.set('state', state);
    const url = new URL('https://openrouter.ai/auth');
    url.searchParams.set('callback_url', callback.href);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    location.assign(url.href);
  }

  async function connect(provider) {
    return provider === 'openrouter' ? connectOpenRouter() : connectHuggingFace();
  }

  function disconnect(provider) {
    if (!provider || provider === 'huggingface') {
      sdel(STORE.hfToken);
      sdel(STORE.hfExpiry);
    }
    if (!provider || provider === 'openrouter') sdel(STORE.orKey);
    emit('gthink.provider.federation.state', { state: 'disconnected', provider: provider || 'all' });
    return status();
  }

  async function status() {
    let local = null;
    try { local = await window.GTHINK_PROVIDER_BLOB?.status?.(); } catch {}
    return {
      schema: SCHEMA,
      huggingFace: {
        connected: !!hfToken(),
        oauth: 'PKCE_PUBLIC',
        federates: ['groq', 'together', 'fireworks-ai', 'deepinfra', 'cerebras', 'cohere', 'replicate', 'zai-org']
      },
      openRouter: {
        connected: !!orKey(),
        oauth: 'PKCE_USER_CONTROLLED_KEY',
        webSearchReady: !!orKey()
      },
      local: {
        eligible: !!navigator.gpu,
        ready: local?.localReady === true,
        model: local?.model || 'SmolLM2-360M-Instruct-q4f32_1-MLC'
      },
      routing: {
        gvaultLocalFirst: true,
        externalOnlyForGeneral: true,
        liveWebRequiresOpenRouter: true
      },
      containsSecret: false
    };
  }

  window.GTHINK_PROVIDER_FEDERATION = Object.freeze({
    schema: SCHEMA,
    ask,
    status,
    connect,
    disconnect,
    needsLiveWeb,
    shouldFederate,
    hasCloud: () => !!hfToken() || !!orKey(),
    safeReturn
  });

  emit('gthink.provider.federation.ready', {
    state: 'ready',
    hfConnected: !!hfToken(),
    openRouterConnected: !!orKey(),
    localEligible: !!navigator.gpu
  });
})();
