const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const ROOT = __dirname;
const DATA_DIR = process.env.OVERLAY_DATA_DIR || ROOT;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const TOKEN_FILE = path.join(DATA_DIR, '.token');
const ROLE_TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const BOOT_LOG = path.join(DATA_DIR, 'boot.log');
const TTS_KEYS_FILE = path.join(DATA_DIR, 'tts-keys.json');
fs.appendFileSync(BOOT_LOG, new Date().toISOString() + ' BOOT pid=' + process.pid + ' argv=' + process.argv.slice(1).join(' ') + '\n');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

(function loadTTSKeys() {
  try {
    const stored = JSON.parse(fs.readFileSync(TTS_KEYS_FILE, 'utf8'));
    if (stored.streamelements) process.env.STREAMELEMENTS_TOKEN = String(stored.streamelements);
    if (stored.elevenlabs) process.env.ELEVENLABS_API_KEY = String(stored.elevenlabs);
  } catch {}
})();

const SOURCE_TYPES = ['image', 'video', 'embed', 'text'];

let config = { port: 3000, ...readJson(CONFIG_FILE, {}) };
config.sources = Array.isArray(config.sources) ? config.sources : [];
config.tts = { provider: 'google', voice: 'ru', volume: 100, showText: false, ...(config.tts || {}) };
config.ui = { ttsOnboarded: !!(config.ui && config.ui.ttsOnboarded), ...(config.ui || {}) };

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {}
}

function publicConfig() {
  return {
    sources: config.sources.map((s) => ({ ...s })),
    tts: { ...config.tts },
    ttsProviders: publicProviders(),
    ttsQueue: ttsQueue.length + (ttsPlaying ? 1 : 0),
    ui: { ttsOnboarded: config.ui.ttsOnboarded },
  };
}

/* ================= Озвучка (TTS) ================= */

const TTS_PROVIDERS = {
  streamelements: {
    label: 'StreamElements · есть русские голоса',
    envKey: 'STREAMELEMENTS_TOKEN',
    maxChars: 300,
    voices: [
      ['Tatyana', 'Tatyana · жен. · русский'],
      ['Maxim', 'Maxim · муж. · русский'],
      ['ru-RU-Wavenet-A', 'ru-RU-Wavenet-A · нейро-русский'],
      ['ru-RU-Wavenet-B', 'ru-RU-Wavenet-B · нейро-русский'],
      ['ru-RU-Wavenet-C', 'ru-RU-Wavenet-C · нейро-русский'],
      ['ru-RU-Wavenet-D', 'ru-RU-Wavenet-D · нейро-русский'],
      ['Brian', 'Brian · муж. · английский'],
      ['Matthew', 'Matthew · муж.'],
      ['Joey', 'Joey · муж.'],
      ['Justin', 'Justin · муж.'],
      ['Russell', 'Russell · муж.'],
      ['Geraint', 'Geraint · муж. (брит.)'],
      ['Amy', 'Amy · жен.'],
      ['Emma', 'Emma · жен. (брит.)'],
      ['Ivy', 'Ivy · жен. (брит.)'],
      ['Joanna', 'Joanna · жен.'],
      ['Kendra', 'Kendra · жен.'],
      ['Kimberly', 'Kimberly · жен.'],
      ['Salli', 'Salli · жен.'],
      ['Nicole', 'Nicole · жен. (австрал.)'],
    ],
    async speak(voice, text) {
      const token = process.env[this.envKey];
      const url = 'https://api.streamelements.com/kappa/v2/speech'
        + `?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`
        + (token ? '&key=' + encodeURIComponent(token) : '');
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'OverlayV2/1.0' } });
      if (res.status === 401) {
        throw new Error('StreamElements: проверь STREAMELEMENTS_TOKEN (overlay-токен из JWT)');
      }
      if (!res.ok) throw new Error(`StreamElements вернул ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('StreamElements вернул пустой аудио');
      return buf;
    },
  },
  google: {
    label: 'Google Translate (рус., без ключа)',
    envKey: null,
    maxChars: 180,
    voices: [
      ['ru', 'Русский · донат-классика'],
    ],
    async speak(voice, text) {
      const url = 'https://translate.google.com/translate_tts'
        + `?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(voice)}&q=${encodeURIComponent(text)}`;
      const res = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: 'https://translate.google.com/',
        },
      });
      if (!res.ok) throw new Error(`Google TTS вернул ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('Google TTS вернул пустой аудио');
      return buf;
    },
  },
  elevenlabs: {
    label: 'ElevenLabs · нейро-голоса',
    envKey: 'ELEVENLABS_API_KEY',
    maxChars: 300,
    voices: [
      ['21m00Tcm4TlvDq8ikWAM', 'Rachel · жен. (самый популярный)'],
      ['pNInz6obpgDQGcFmaJgB', 'Adam · муж.'],
      ['EXAVITQu4vr4xnSDxMaL', 'Bella · жен.'],
      ['VR6AewLTigWG4xSOukaG', 'Arnold · муж.'],
      ['onwK4e9ZLuTAKqWW03F9', 'Domi · жен.'],
      ['jBpfuIE2acCO8z3wKNLl', 'Gigi · жен.'],
      ['2EiwWnXFnvU5JabPnv8n', 'Clyde · муж.'],
      ['yoZ06aMxZJJ28mfd3POQ', 'Thomas · муж.'],
    ],
    async speak(voice, text) {
      const key = process.env[this.envKey];
      const res = await fetchWithTimeout(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        }
      );
      if (res.status === 401) throw new Error('Нет/неверный ELEVENLABS_API_KEY');
      if (!res.ok) throw new Error(`ElevenLabs вернул ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('ElevenLabs вернул пустой аудио');
      return buf;
    },
  },
};

function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function publicProviders() {
  return Object.entries(TTS_PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    needsKey: !!p.envKey,
    hasKey: !!process.env[p.envKey],
    voices: p.voices.map(([voice, name]) => ({ voice, name })),
  }));
}

const ttsQueue = [];
let ttsPlaying = false;

function enqueueTTS(item) {
  ttsQueue.push(item);
  pumpTTS();
}

function ttsError(msg) {
  io.to('control').emit('tts:error', { message: msg });
}

async function pumpTTS() {
  if (ttsPlaying || !ttsQueue.length) return;
  ttsPlaying = true;
  const item = ttsQueue.shift();
  const provider = TTS_PROVIDERS[item.provider];
  try {
    if (!provider) throw new Error('Неизвестный провайдер озвучки');
    if (provider.envKey && !process.env[provider.envKey]) {
      throw new Error(`${provider.label}: задай переменную окружения ${provider.envKey}`);
    }
    const audio = await provider.speak(item.voice, item.text);
    io.emit('tts:play', {
      audio,
      volume: item.volume,
      showText: item.showText,
      text: item.showText ? item.text : null,
      duration: item.duration,
    });
  } catch (err) {
    ttsError(err.message || 'Не удалось получить озвучку');
  } finally {
    ttsPlaying = false;
    setTimeout(pumpTTS, 150);
  }
}

function stopTTS() {
  ttsQueue.length = 0;
  io.emit('tts:stop');
}

let controlToken = process.env.CONTROL_TOKEN || readJson(TOKEN_FILE, null);
if (!controlToken) {
  controlToken = crypto.randomBytes(8).toString('hex');
  try {
    fs.writeFileSync(TOKEN_FILE, controlToken);
  } catch {}
}

/* ================= Роли панели =================
   head      — основной токен (.token / CONTROL_TOKEN): полный доступ;
   moderator — источники, пресеты, сообщения, TTS, управление OBS;
   streamer  — только сообщения, озвучка и переключение сцен OBS. */

let roleTokens = readJson(ROLE_TOKENS_FILE, null);
if (!roleTokens || typeof roleTokens.moderator !== 'string' || !roleTokens.moderator
  || typeof roleTokens.streamer !== 'string' || !roleTokens.streamer) {
  roleTokens = {
    moderator: crypto.randomBytes(8).toString('hex'),
    streamer: crypto.randomBytes(8).toString('hex'),
  };
  try {
    fs.writeFileSync(ROLE_TOKENS_FILE, JSON.stringify(roleTokens, null, 2));
  } catch {}
}

function rankOf(tok) {
  if (typeof tok !== 'string' || !tok) return null;
  if (tok === controlToken) return 'head';
  if (tok === roleTokens.moderator) return 'moderator';
  if (tok === roleTokens.streamer) return 'streamer';
  return null;
}

const ROLE_PERMS = {
  head: ['sources', 'presets', 'tts', 'obs', 'obs:scene', 'config'],
  moderator: ['sources', 'presets', 'tts', 'obs', 'obs:scene'],
  streamer: ['tts', 'obs:scene'],
};

function can(socket, perm) {
  const rank = socket.data && socket.data.rank;
  if (rank === 'head') return true;
  const perms = ROLE_PERMS[rank];
  return Array.isArray(perms) && perms.includes(perm);
}

function denySocket(socket) {
  console.log(`[panel] запрет роли ${socket.data?.rank || '?'}: недостаточно прав`);
  return false;
}

/* Пресеты сцены: именованные раскладки источников, живут рядом с config.json. */

let presets = readJson(PRESETS_FILE, null);
if (!presets || typeof presets !== 'object' || Array.isArray(presets)) presets = {};

function savePresets() {
  try {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
  } catch {}
}

function presetList() {
  return Object.entries(presets)
    .map(([name, p]) => ({
      name,
      savedAt: p && typeof p.savedAt === 'string' ? p.savedAt : null,
      count: p && Array.isArray(p.sources) ? p.sources.length : 0,
    }))
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

const app = express();
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(ROOT, 'public')));
let rebooting = false;
app.get('/healthz', (_req, res) => {
  if (rebooting) return res.status(503).json({ ok: false, rebooting: true });
  res.json({ ok: true });
});
app.get('/overlay', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'overlay.html')));
app.get('/control', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'control.html')));
  app.get('/help', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'help.html')));
app.get('/proxy', async (req, res) => {
  let url = String(req.query.url || '');
  if (!/^https?:\/\//i.test(url)) return res.status(400).end('bad url');
  try {
    const up = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!up.ok || !up.body) return res.status(502).end('fetch failed');
    const ctype = up.headers.get('content-type') || 'application/octet-stream';
    res.set('Content-Type', ctype);
    const contentLen = up.headers.get('content-length');
    if (contentLen) res.set('Content-Length', contentLen);
    res.set('Access-Control-Allow-Origin', '*');
    const reader = up.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    } finally {
      res.end();
    }
  } catch {
    if (!res.headersSent) return res.status(502).end('fetch failed');
    res.end();
  }
});

let server = http.createServer(app);
let io = new Server(server, { maxHttpBufferSize: 1e7 });

/* ================= OBS WebSocket (obs-websocket v5) ================= */

const { OBSWebSocket } = require('obs-websocket-js');

const obsCfg = {
  enabled: config.obs?.enabled === true,
  host: config.obs?.host || 'localhost',
  port: Number(config.obs?.port) || 4455,
  password: config.obs?.password || '',
};

let obs = null;
let obsConnected = false;
let obsRetryTimer = null;
let obsRefreshTimer = null;
let obsState = {
  connected: false,
  baseW: 1920,
  baseH: 1080,
  currentScene: null,
  scenes: [],
  items: [],
};

function obsPublic() {
  return { ...obsState };
}

function obsScheduleRefresh(ms = 300) {
  clearTimeout(obsRefreshTimer);
  obsRefreshTimer = setTimeout(refreshObs, ms);
}

async function refreshObs() {
  if (!obs) return;
  try {
    const vs = await obs.call('GetVideoSettings');
    const baseW = Number(vs.baseWidth) || 1920;
    const baseH = Number(vs.baseHeight) || 1080;
    const sl = await obs.call('GetSceneList');
    const current = sl.currentProgramSceneName || null;
    const scenes = (sl.scenes || []).map((s) => s.sceneName);

    let items = [];
    if (current) {
      const il = await obs.call('GetSceneItemList', { sceneName: current });
      for (const it of (il.sceneItems || [])) {
        if (it.isGroup) continue;
        try {
          const tr = await obs.call('GetSceneItemTransform', { sceneName: current, sceneItemId: it.sceneItemId });
          const t = tr.sceneItemTransform || {};
          const sw = Number(t.sourceWidth) || 1;
          const sh = Number(t.sourceHeight) || 1;
          const w = Number(t.width) || sw * (Number(t.scaleX) || 1);
          const h = Number(t.height) || sh * (Number(t.scaleY) || 1);
          items.push({
            id: it.sceneItemId,
            name: it.sourceName,
            kind: it.inputKind || '',
            visible: it.sceneItemEnabled !== false,
            locked: !!it.sceneItemLocked,
            x: (Number(t.positionX) || 0) / baseW * 100,
            y: (Number(t.positionY) || 0) / baseH * 100,
            w: w / baseW * 100,
            h: h / baseH * 100,
            rotation: Number(t.rotation) || 0,
            sourceW: sw,
            sourceH: sh,
          });
        } catch {}
      }
    }

    obsState = { connected: true, baseW, baseH, currentScene: current, scenes, items };
  } catch {
    obsState = { connected: false, baseW: 1920, baseH: 1080, currentScene: null, scenes: [], items: [] };
  }
  io.emit('obs:state', obsPublic());
}

async function connectObs() {
  if (obsConnected) return;
  if (!obs) obs = new OBSWebSocket();
  try {
    const url = `ws://${obsCfg.host}:${obsCfg.port}`;
    await obs.connect(url, obsCfg.password || undefined);
    obsConnected = true;
    console.log(`[obs] подключён к ${obsCfg.host}:${obsCfg.port}`);
    obs.on('ConnectionClosed', () => {
      obsConnected = false;
      obs = null;
      obsState.connected = false;
      io.emit('obs:state', obsPublic());
    });
    obs.on('CurrentProgramSceneChanged', () => obsScheduleRefresh());
    obs.on('SceneItemCreated', () => obsScheduleRefresh());
    obs.on('SceneItemRemoved', () => obsScheduleRefresh());
    obs.on('SceneItemEnableStateChanged', () => obsScheduleRefresh());
    obs.on('SceneItemTransformChanged', () => obsScheduleRefresh());
    await refreshObs();
  } catch {
    obsConnected = false;
    try { await obs.disconnect(); } catch {}
    obs = null;
  }
}

function obsTryConnect() {
  if (obsConnected) return;
  connectObs().finally(() => {
    if (!obsConnected) {
      clearTimeout(obsRetryTimer);
      obsRetryTimer = setTimeout(obsTryConnect, 5000);
    }
  });
}

async function disconnectObs() {
  try { if (obs) await obs.disconnect(); } catch {}
  obs = null;
  obsConnected = false;
  obsState = { connected: false, baseW: 1920, baseH: 1080, currentScene: null, scenes: [], items: [] };
  io.emit('obs:state', obsPublic());
}

/* ==================================================================== */

io.use((socket, next) => {
  const { role = 'overlay', token } = socket.handshake.auth || {};
  if (role === 'control') {
    const rank = rankOf(token);
    if (!rank) return next(new Error('unauthorized'));
    socket.data = socket.data || {};
    socket.data.rank = rank;
  }
  next();
});

function attachSocketHandlers(io) {
io.on('connection', (socket) => {
  const isControl = socket.handshake.auth?.role === 'control';
  const rank = isControl ? (socket.data && socket.data.rank) : null;
  socket.join(isControl ? 'control' : 'overlay');
  // Панель получает роль сразу с первым конфигом — до отрисовки карточек
  socket.emit('config', isControl
    ? { ...publicConfig(), ui: { ...publicConfig().ui, role: rank } }
    : publicConfig());
  socket.emit('obs:state', obsPublic());

  if (isControl) console.log(`[panel] панель подключилась (${socket.id}) · роль ${rank}`);

  socket.on('sources:set', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'sources')) return denySocket(socket);

    if (payload.action === 'add') {
      const s = payload.source || {};
      const type = SOURCE_TYPES.includes(s.type) ? s.type : null;
      let url = null;
      try {
        url = new URL(String(s.url)).href;
      } catch {}
      if (!type || (type !== 'text' && !url)) return;

      const rect = sanitizeRect(s) || { x: 15, y: 12, w: 70, h: 76 };
      const source = {
        id: crypto.randomBytes(6).toString('hex'),
        type,
        url: type === 'text' ? '' : url,
        ...rect,
      };
      if (type === 'text') {
        source.text = String(s.text ?? '').slice(0, 2000);
        source.size = clampNum(s.size ?? 48, 8, 400, 48);
        source.color = sanitizeColor(s.color, '#ffffff');
      }
      if (type === 'video') {
        source.volume = clampNum(s.volume ?? 50, 0, 100, 50);
        source.loop = !!s.loop;
      }
      if (type === 'image') {
        source.fit = s.fit === 'cover' ? 'cover' : 'contain';
        source.chroma = {
          on: !!s.chroma?.on,
          threshold: clampNum(s.chroma?.threshold, 0.05, 1, 0.35),
          smooth: clampNum(s.chroma?.smooth, 0, 0.5, 0.12),
        };
      }
      source.scale = clampNum(s.scale ?? 1, 0.5, 3, 1);
      source.visible = true;
      source.rotation = 0;
      source.flipH = false;
      source.flipV = false;
      source.opacity = 100;
      source.cropL = 0;
      source.cropR = 0;
      source.cropT = 0;
      source.cropB = 0;
      const maxZ = config.sources.reduce((m, x) => Math.max(m, Number(x.z) || 0), 0);
      source.z = maxZ + 10;
      if (type === 'video') {
        source.muted = false;
        source.speed = 1;
      }
      config.sources.push(source);
    } else if (payload.action === 'update') {
      const src = config.sources.find((x) => x.id === payload.id);
      if (!src) return;
      const rect = sanitizeRect(payload);
      if (rect) Object.assign(src, rect);
      if (payload.scale !== undefined) {
        const sc = clampNum(payload.scale, 0.5, 3);
        if (sc !== null) src.scale = sc;
      }
      if (payload.visible !== undefined) src.visible = !!payload.visible;
      if (typeof payload.url === 'string' && payload.url) {
        try { src.url = new URL(payload.url).href; } catch {}
      }
      if (src.type === 'text') {
        if (payload.text !== undefined) src.text = String(payload.text).slice(0, 2000);
        if (payload.size !== undefined) {
          const sz = clampNum(payload.size, 8, 400);
          if (sz !== null) src.size = sz;
        }
        if (payload.color !== undefined) src.color = sanitizeColor(payload.color, src.color || '#ffffff');
      }
      if (src.type === 'image' && payload.fit) src.fit = payload.fit === 'cover' ? 'cover' : 'contain';
      if (src.type === 'image' && payload.chroma) {
        src.chroma = {
          on: payload.chroma.on === undefined ? (src.chroma?.on ?? false) : !!payload.chroma.on,
          threshold: clampNum(payload.chroma.threshold, 0.05, 1, src.chroma?.threshold ?? 0.35),
          smooth: clampNum(payload.chroma.smooth, 0, 0.5, src.chroma?.smooth ?? 0.12),
        };
      }
      if (src.type === 'video') {
        if (payload.volume !== undefined) src.volume = clampNum(payload.volume, 0, 100, src.volume);
        if (payload.loop !== undefined) src.loop = !!payload.loop;
        if (payload.muted !== undefined) src.muted = !!payload.muted;
        if (payload.speed !== undefined) {
          const sp = clampNum(payload.speed, 0.1, 4);
          if (sp !== null) src.speed = sp;
        }
      }
      if (payload.rotation !== undefined) {
        const r = clampNum(payload.rotation, -180, 180);
        if (r !== null) src.rotation = r;
      }
      if (payload.flipH !== undefined) src.flipH = !!payload.flipH;
      if (payload.flipV !== undefined) src.flipV = !!payload.flipV;
      if (payload.opacity !== undefined) {
        const o = clampNum(payload.opacity, 0, 100);
        if (o !== null) src.opacity = o;
      }
      ['cropL', 'cropR', 'cropT', 'cropB'].forEach((k) => {
        if (payload[k] !== undefined) {
          const c = clampNum(payload[k], 0, 100);
          if (c !== null) src[k] = c;
        }
      });
      if (payload.z !== undefined) {
        const z = clampNum(payload.z, 0, 100000);
        if (z !== null) src.z = z;
      }
    } else if (payload.action === 'layer') {
      if (!payload.id) return;
      const sorted = [...config.sources].sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));
      const idx = sorted.findIndex((x) => x.id === payload.id);
      if (idx < 0) return;
      const dir = payload.dir;
      if (dir === 'up' && idx < sorted.length - 1) {
        [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
      } else if (dir === 'down' && idx > 0) {
        [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
      } else if (dir === 'top') {
        const [it] = sorted.splice(idx, 1);
        sorted.push(it);
      } else if (dir === 'bottom') {
        const [it] = sorted.splice(idx, 1);
        sorted.unshift(it);
      } else {
        return;
      }
      sorted.forEach((s, i) => { s.z = i * 10; });
      config.sources = sorted;
    } else if (payload.action === 'remove') {
      config.sources = config.sources.filter((s) => s.id !== payload.id);
    } else if (payload.action === 'clear') {
      config.sources = [];
    } else if (payload.action === 'replace') {
      // undo/redo: полная замена списка источников тем, что было сохранено в панели
      if (!Array.isArray(payload.sources)) return;
      config.sources = sanitizeSources(payload.sources);
    } else {
      return;
    }

    if (!payload.live) saveConfig();
    io.emit('config', publicConfig());
  });

  socket.on('sources:reload', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'sources')) return denySocket(socket);
    const id = String(payload.id || '');
    if (!id || !config.sources.some((s) => s.id === id)) return;
    io.emit('sources:reload', { id });
  });

  socket.on('config:import', (payload = {}, cb) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'config')) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Эта роль не может импортировать настройки' });
      return denySocket(socket);
    }
    const c = payload && typeof payload.config === 'object' ? payload.config : null;
    if (!c) {
      if (typeof cb === 'function') cb({ ok: false, message: 'В файле нет config' });
      return;
    }

    let applied = false;
    for (const key of ['channel', 'obs', 'chat', 'layout']) {
      if (c[key] !== undefined) { config[key] = c[key]; applied = true; }
    }

    if (Array.isArray(c.sources)) {
      applied = true;
      config.sources = sanitizeSources(c.sources);
    }

    if (c.tts && typeof c.tts === 'object') {
      applied = true;
      config.tts = { provider: 'google', voice: 'ru', volume: 100, showText: false, ...c.tts };
      if (!TTS_PROVIDERS[config.tts.provider]) config.tts.provider = 'google';
    }

    if (!applied) {
      if (typeof cb === 'function') cb({ ok: false, message: 'В файле нет знакомых настроек' });
      return;
    }

    saveConfig();
    io.emit('config', publicConfig());
    if (typeof cb === 'function') cb({ ok: true, sources: config.sources.length });
  });

  socket.on('tts:speak', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'tts')) return denySocket(socket);

    const providerId = TTS_PROVIDERS[payload.provider] ? payload.provider : config.tts.provider;
    const provider = TTS_PROVIDERS[providerId];
    const text = String(payload.text ?? '')
      .replace(/[\r\n\t]+/g, ' ').trim().slice(0, provider.maxChars || 300);
    if (!text) return;
    const providerHasVoice = provider.voices.some(([v]) => v === payload.voice);
    const voice = providerHasVoice ? payload.voice : provider.voices[0][0];

    const volume = clampNum(payload.volume ?? config.tts.volume, 0, 100, config.tts.volume);
    config.tts = {
      provider: providerId,
      voice,
      volume,
      showText: !!payload.showText,
    };
    saveConfig();

    enqueueTTS({
      provider: providerId,
      voice,
      text,
      volume,
      showText: !!payload.showText,
      duration: clampNum(payload.duration ?? 8, 2, 60, 8),
    });
    io.emit('config', publicConfig());
  });

  socket.on('tts:stop', () => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'tts')) return denySocket(socket);
    stopTTS();
    io.emit('config', publicConfig());
  });

  socket.on('tts:setkey', (payload = {}, cb) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'config')) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Эта роль не может менять ключи' });
      return denySocket(socket);
    }
    const pid = payload && payload.provider;
    if (pid !== 'streamelements' && pid !== 'elevenlabs') {
      if (typeof cb === 'function') cb({ ok: false, message: 'Неизвестный провайдер' });
      return;
    }
    const envKey = TTS_PROVIDERS[pid].envKey;
    const key = String((payload && payload.key) || '').trim();
    if (key) {
      process.env[envKey] = key;
    } else {
      delete process.env[envKey];
    }
    try {
      const stored = readJson(TTS_KEYS_FILE, {});
      if (key) stored[pid] = key;
      else delete stored[pid];
      fs.writeFileSync(TTS_KEYS_FILE, JSON.stringify(stored));
    } catch {}
    io.emit('config', publicConfig());
    if (typeof cb === 'function') cb({ ok: true, hasKey: !!key });
  });

  socket.on('onboarding:done', () => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'tts')) return denySocket(socket);
    config.ui = { ttsOnboarded: true };
    saveConfig();
    socket.emit('config', publicConfig());
  });

  socket.on('token:rotate', () => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'config')) return denySocket(socket);
    const newToken = crypto.randomBytes(8).toString('hex');
    controlToken = newToken;
    try {
      fs.writeFileSync(TOKEN_FILE, newToken);
    } catch {}
    console.log(`[panel] смена токена: ${newToken} (файл .token)`);
    socket.emit('token:rotated', { token: newToken });
    for (const s of io.sockets.sockets.values()) {
      if (s !== socket && s.rooms.has('control')) s.emit('logout');
    }
  });

  /* ---------- Пресеты сцены ---------- */

  socket.on('presets:list', (cb) => {
    if (!socket.rooms.has('control')) return;
    if (typeof cb === 'function') cb({ ok: true, presets: presetList() });
  });

  socket.on('presets:save', (payload = {}, cb) => {
    if (!socket.rooms.has('control')) return;
    const done = typeof cb === 'function' ? cb : () => {};
    if (!can(socket, 'presets')) { done({ ok: false, message: 'Нет прав на пресеты' }); return denySocket(socket); }
    const name = String(payload.name || '').trim().slice(0, 60);
    if (!name) { done({ ok: false, message: 'Нужно имя пресета' }); return; }
    presets[name] = {
      savedAt: new Date().toISOString(),
      sources: JSON.parse(JSON.stringify(config.sources || [])),
    };
    savePresets();
    console.log(`[presets] сохранён «${name}» · ${presets[name].sources.length} источников`);
    done({ ok: true, presets: presetList() });
  });

  socket.on('presets:load', (payload = {}, cb) => {
    if (!socket.rooms.has('control')) return;
    const done = typeof cb === 'function' ? cb : () => {};
    if (!can(socket, 'presets')) { done({ ok: false, message: 'Нет прав на пресеты' }); return denySocket(socket); }
    const name = String(payload.name || '');
    const p = presets[name];
    if (!p || !Array.isArray(p.sources)) { done({ ok: false, message: 'Пресет не найден' }); return; }
    config.sources = sanitizeSources(p.sources);
    saveConfig();
    io.emit('config', publicConfig());
    console.log(`[presets] применён «${name}» → ${config.sources.length} источников`);
    done({ ok: true, count: config.sources.length });
  });

  socket.on('presets:delete', (payload = {}, cb) => {
    if (!socket.rooms.has('control')) return;
    const done = typeof cb === 'function' ? cb : () => {};
    if (!can(socket, 'presets')) { done({ ok: false, message: 'Нет прав на пресеты' }); return denySocket(socket); }
    const name = String(payload.name || '');
    if (!presets[name]) { done({ ok: false, message: 'Пресет не найден' }); return; }
    delete presets[name];
    savePresets();
    console.log(`[presets] удалён «${name}»`);
    done({ ok: true, presets: presetList() });
  });

  socket.on('roles:tokens', (cb) => {
    if (!socket.rooms.has('control')) return;
    const done = typeof cb === 'function' ? cb : () => {};
    if (!can(socket, 'config')) { done({ ok: false, message: 'Только главный модератор видит токены' }); return denySocket(socket); }
    done({ ok: true, tokens: { ...roleTokens }, head: controlToken });
  });

  /* ---------- OBS управление ---------- */

  socket.on('obs:connect', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'config')) return denySocket(socket);
    const host = String(payload.host || '').trim();
    const port = Number(payload.port);
    const password = String(payload.password ?? '');

    obsCfg.host = host || obsCfg.host;
    obsCfg.port = Number.isFinite(port) && port > 0 ? port : obsCfg.port;
    if (password) obsCfg.password = password;
    obsCfg.enabled = true;

    config.obs = { enabled: true, host: obsCfg.host, port: obsCfg.port, password: obsCfg.password };
    saveConfig();
    obsTryConnect();
  });

  socket.on('obs:set-scene', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs:scene')) return denySocket(socket);
    if (!obs || !payload.name) return;
    obs.call('SetCurrentProgramScene', { sceneName: String(payload.name) })
      .then(() => obsScheduleRefresh())
      .catch(() => {});
  });

  socket.on('obs:set-visible', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs:scene')) return denySocket(socket);
    if (!obs || !obsState.currentScene) return;
    obs.call('SetSceneItemEnabled', {
      sceneName: obsState.currentScene,
      sceneItemId: payload.id,
      sceneItemEnabled: !!payload.visible,
    }).then(() => obsScheduleRefresh()).catch(() => {});
  });

  socket.on('obs:move', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs')) return denySocket(socket);
    if (!obs || !obsState.currentScene) return;
    const item = obsState.items.find((i) => i.id === payload.id);
    if (!item || item.locked) return;

    const t = {};
    const px = Number(payload.x);
    const py = Number(payload.y);
    if (Number.isFinite(px)) t.positionX = px / 100 * obsState.baseW;
    if (Number.isFinite(py)) t.positionY = py / 100 * obsState.baseH;

    const pw = Number(payload.w);
    const ph = Number(payload.h);
    if (Number.isFinite(pw) && item.sourceW) t.scaleX = (pw / 100 * obsState.baseW) / item.sourceW;
    if (Number.isFinite(ph) && item.sourceH) t.scaleY = (ph / 100 * obsState.baseH) / item.sourceH;

    const pr = Number(payload.rotation);
    if (Number.isFinite(pr)) t.rotation = pr;

    obs.call('SetSceneItemTransform', {
      sceneName: obsState.currentScene,
      sceneItemId: payload.id,
      sceneItemTransform: t,
    })
      .then(() => { if (!payload.live) obsScheduleRefresh(); })
      .catch(() => {});
  });

  socket.on('obs:add-browser', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs')) return denySocket(socket);
    if (!obs || !obsState.currentScene) return;
    let url = null;
    try {
      url = new URL(String(payload.url)).href;
    } catch {}
    if (!url) return;

    const name = String(payload.name || 'Browser').trim().slice(0, 80) || 'Browser';
    const defW = Math.round(obsState.baseW * 0.3);
    const defH = Math.round(obsState.baseH * 0.3);

    obs.call('CreateInput', {
      sceneName: obsState.currentScene,
      inputName: name,
      inputKind: 'browser_source',
      inputSettings: { url, width: defW, height: defH },
      sceneItemEnabled: true,
    }).then(() => obsScheduleRefresh()).catch(() => {});
  });

  socket.on('obs:remove', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs')) return denySocket(socket);
    const item = obsState.items.find((i) => i.id === payload.id);
    if (!obs || !item) return;
    obs.call('RemoveInput', { inputName: item.name })
      .then(() => obsScheduleRefresh())
      .catch(() => {});
  });

  socket.on('obs:set-locked', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs')) return denySocket(socket);
    if (!obs || !obsState.currentScene) return;
    const item = obsState.items.find((i) => i.id === payload.id);
    if (!item) return;
    obs.call('SetSceneItemLocked', {
      sceneName: obsState.currentScene,
      sceneItemId: payload.id,
      sceneItemLocked: !!payload.locked,
    }).then(() => obsScheduleRefresh()).catch(() => {});
  });

  socket.on('obs:reorder', (payload = {}) => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'obs')) return denySocket(socket);
    if (!obs || !obsState.currentScene) return;
    const items = obsState.items;
    const idx = items.findIndex((i) => i.id === payload.id);
    if (idx < 0) return;
    // Список отображается как в OBS: index 0 (дно) сверху, передний план снизу.
    // 'up' в панели = вверх списка = к дну = меньший индекс.
    let target = null;
    if (payload.dir === 'up' && idx > 0) target = idx - 1;
    else if (payload.dir === 'down' && idx < items.length - 1) target = idx + 1;
    if (target !== null) {
      obs.call('SetSceneItemIndex', { sceneName: obsState.currentScene, sceneItemId: payload.id, sceneItemIndex: target })
        .then(() => obsScheduleRefresh()).catch(() => {});
    }
  });

  socket.on('obs:disconnect', () => {
    if (!socket.rooms.has('control')) return;
    if (!can(socket, 'config')) return denySocket(socket);
    disconnectObs();
  });
});
}

attachSocketHandlers(io);

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

function sanitizeColor(v, fallback) {
  const s = String(v || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s.toLowerCase() : fallback;
}

function sanitizeRect(r) {
  if (!r || typeof r !== 'object') return null;
  const out = {};
  if (r.x !== undefined) out.x = clampNum(r.x, -50, 150);
  if (r.y !== undefined) out.y = clampNum(r.y, -50, 150);
  if (r.w !== undefined) out.w = clampNum(r.w, 3, 250);
  if (r.h !== undefined) out.h = clampNum(r.h, 2, 250);
  if (Object.keys(out).length === 0) return null;
  return out;
}

/* Единая проверка списка источников: импорт config.json, undo/redo и пресеты
   проходят через одни и те же правила. */
function sanitizeSources(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = [];
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const type = SOURCE_TYPES.includes(s.type) ? s.type : null;
    let url = null;
    try { url = new URL(String(s.url)).href; } catch {}
    if (!type || (type !== 'text' && !url)) continue;
    const rect = sanitizeRect(s) || { x: 15, y: 12, w: 70, h: 76 };
    cleaned.push({
      id: String(s.id || crypto.randomBytes(6).toString('hex')),
      type,
      url: type === 'text' ? '' : url,
      ...(type === 'text' ? {
        text: String(s.text ?? '').slice(0, 2000),
        size: clampNum(s.size ?? 48, 8, 400, 48),
        color: sanitizeColor(s.color, '#ffffff'),
      } : {}),
      ...rect,
      scale: clampNum(s.scale ?? 1, 0.5, 3, 1),
      rotation: clampNum(s.rotation ?? 0, -180, 180, 0) || 0,
      flipH: !!s.flipH,
      flipV: !!s.flipV,
      opacity: clampNum(s.opacity ?? 100, 0, 100, 100),
      visible: s.visible !== false,
      cropL: clampNum(s.cropL ?? 0, 0, 100, 0),
      cropR: clampNum(s.cropR ?? 0, 0, 100, 0),
      cropT: clampNum(s.cropT ?? 0, 0, 100, 0),
      cropB: clampNum(s.cropB ?? 0, 0, 100, 0),
      z: clampNum(s.z ?? 0, 0, 100000, 0),
      ...(type === 'video' ? { volume: clampNum(s.volume ?? 50, 0, 100, 50), loop: !!s.loop, muted: !!s.muted, speed: clampNum(s.speed ?? 1, 0.1, 4, 1) } : {}),
      ...(type === 'image' ? { fit: s.fit === 'cover' ? 'cover' : 'contain', chroma: { on: !!s.chroma?.on, threshold: clampNum(s.chroma?.threshold, 0.05, 1, 0.35), smooth: clampNum(s.chroma?.smooth, 0, 0.5, 0.12) } } : {}),
    });
  }
  return cleaned;
}

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) result.push(ni.address);
    }
  }
  return result;
}

/* на Windows подписываем адреса именем адаптера и отделяем реальные (Wi-Fi/Ethernet)
   от виртуальных (VirtualBox, Hyper-V, VPN) — реальные печатаем первыми */
function lanEntries() {
  if (process.platform !== 'win32') {
    // Linux/macOS: ключ os.networkInterfaces() — это имя интерфейса (eth0, wlan0, docker0...)
    const entries = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family !== 'IPv4' || ni.internal) continue;
        entries.push({
          address: ni.address,
          name,
          desc: '',
          wifi: /^(wl|wlan|wlp)/i.test(name),
          virtual: /^(lo|docker|veth|br-|virbr|vmnet|vboxnet|vnic|tun|tap|zt|wg|ham|cni|flannel|kube|utun|ppp|sl)/i.test(name),
          linkLocal: ni.address.startsWith('169.254.'),
        });
      }
    }
    const rank = (e) => (e.linkLocal ? 2 : e.virtual ? 1 : 0);
    return entries.sort((a, b) => rank(a) - rank(b));
  }

  const ips = lanAddresses();
  let rows = [];
  try {
    const script = [
      "Get-NetIPAddress -AddressFamily IPv4 |",
      "Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |",
      'ForEach-Object {',
      '  $a = Get-NetAdapter -Name $_.InterfaceAlias -ErrorAction SilentlyContinue;',
      '  [PSCustomObject]@{ ip = $_.IPAddress; name = $_.InterfaceAlias; desc = $a.InterfaceDescription; virt = [bool]$a.Virtual; type = [string]$a.InterfaceType }',
      '} | ConvertTo-Json -Compress',
    ].join(' ');
    const raw = require('child_process').execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 6000, windowsHide: true });
    const parsed = JSON.parse(raw || '[]');
    rows = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
  } catch {
    rows = [];
  }

  const entries = [];
  for (const row of rows) {
    if (!row.ip || !ips.includes(row.ip)) continue;
    const desc = String(row.desc || '');
    const virtual = !!row.virt
      || /virtual|hyper-v|vpn|tap|loopback|vmware|virtualbox|virbrut|виртуал/i.test(`${row.name || ''} ${desc}`);
    entries.push({
      address: row.ip,
      name: row.name || '',
      desc,
      wifi: String(row.type || '') === '71',
      virtual,
      linkLocal: String(row.ip).startsWith('169.254.'),
    });
  }

  // если PowerShell не ответил — печатаем просто адреса
  for (const ip of ips) {
    if (!entries.some((e) => e.address === ip)) {
      entries.push({ address: ip, name: '', desc: '', wifi: false, virtual: false, linkLocal: ip.startsWith('169.254.') });
    }
  }

  const rank = (e) => (e.linkLocal ? 2 : e.virtual ? 1 : 0);
  return entries.sort((a, b) => rank(a) - rank(b));
}

const PORT = Number(process.env.PORT) || config.port;

function bootBanner() {
  const entries = lanEntries();
  const main = entries.filter((e) => !e.virtual && !e.linkLocal);
  const others = entries.filter((e) => e.virtual || e.linkLocal);

  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║          OVERLAY SERVER ЗАПУЩЕН              ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Оверлей (добавить в OBS):   http://localhost:${PORT}/overlay`);
  console.log(`  Панель модератора:          http://localhost:${PORT}/control?t=${controlToken}`);

  for (const e of main) {
    const label = e.wifi ? 'Wi-Fi' : (e.name || 'сеть');
    console.log(`  В локальной сети:          http://${e.address}:${PORT}/control?t=${controlToken}   (${label})`);
  }
  for (const e of others) {
    if (e.linkLocal) continue;
    const label = e.name || 'адаптер';
    console.log(`  [${e.virtual ? 'виртуальный/VPN' : 'доп. адаптер'}]  ${e.address} (${label})`);
  }

  console.log('');
  console.log(`  Токен главного:    ${controlToken} (хранится в .token)`);
  console.log(`  Токен модератора:  ${roleTokens.moderator} (tokens.json)`);
  console.log(`  Токен стримера:    ${roleTokens.streamer} (tokens.json)`);
  console.log(`  Источников на сцене: ${config.sources.length}`);
  console.log('');
}

function startListen(attempt) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 100) {
      fs.appendFileSync(BOOT_LOG, new Date().toISOString() + ' RETRY pid=' + process.pid + ' attempt=' + attempt + '\n');
      console.log(`  Порт ${PORT} ещё занят (уступаем порт при перезапуске) — пробуем снова (${attempt + 1})...`);
      setTimeout(() => startListen(attempt + 1), 300);
    } else {
      console.error('  Не удалось запустить сервер:', err && err.message);
      process.exit(1);
    }
  });
  server.listen(PORT, () => {
    fs.appendFileSync(BOOT_LOG, new Date().toISOString() + ' LISTEN_OK pid=' + process.pid + ' at=' + Date.now() + '\n');
    bootBanner();
    if (obsCfg.enabled) {
      setTimeout(obsTryConnect, 800);
    }
  });
}

function performRestart() {
  rebooting = true;
  console.log('  Перезапуск сервера...');
  try { io.close(); } catch {}
  try { server.closeAllConnections(); } catch {}
  try { server.close(); } catch {}
  const fresh = readJson(CONFIG_FILE, {}) || {};
  const src = Array.isArray(fresh.sources) ? fresh.sources : [];
  Object.assign(config, fresh);
  config.sources = src;
  config.tts = { provider: 'google', voice: 'ru', volume: 100, showText: false, ...((fresh && fresh.tts) || {}) };
  obsCfg.enabled = config.obs?.enabled === true;
  if (config.obs) {
    if (typeof config.obs.host === 'string') obsCfg.host = config.obs.host;
    if (Number.isFinite(config.obs.port)) obsCfg.port = config.obs.port;
    if (typeof config.obs.password === 'string') obsCfg.password = config.obs.password;
  }
  server = http.createServer(app);
  io = new Server(server, { maxHttpBufferSize: 2e6 });
  attachSocketHandlers(io);
  rebooting = false;
  setTimeout(startListen, 250, 0);
  console.log('  Состояние перезагружено, поднимаю новый сервер...');
}

startListen(0);

/* ================= Интерактивная консоль ================= */

function formatUptime() {
  const s = Math.floor(process.uptime());
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м ${s % 60}с`;
}

function printHelp() {
  console.log('');
  console.log('  Доступные команды:');
  console.log('    help            — этот список');
  console.log('    links           — ссылки на оверлей и панель');
  console.log('    token           — токен панели');
  console.log('    status          — состояние сервера, источников и OBS');
  console.log('    sources         — список источников на сцене');
  console.log('    netcheck        — проверить, отвечает ли сервер по адресам локальной сети');
  console.log('    clear           — очистить консоль');
  console.log('    reboot          — перезапустить сервер');
  console.log('    exit            — остановить сервер');
  console.log('');
}

function execCommand(line) {
  const cmd = String(line || '').trim();
  if (!cmd) return true;
  const [rawName, ...args] = cmd.split(/\s+/);
  const arg = args.join(' ').trim();
  const name = rawName.toLowerCase();

  switch (name) {
    case 'help':
    case '?':
      printHelp();
      break;
case 'links':
      console.log(`  Оверлей (в OBS):        http://localhost:${PORT}/overlay`);
      console.log(`  Панель (этот комп):     http://localhost:${PORT}/control?t=${controlToken}`);
      for (const e of lanEntries()) {
        if (e.linkLocal) continue;
        const mark = e.virtual ? ' — виртуальный' : '';
        console.log(`  Панель: http://${e.address}:${PORT}/control?t=${controlToken}${mark}`);
      }
      break;
    case 'netcheck': {
      const entries = lanEntries().filter((e) => !e.virtual && !e.linkLocal);
      const http = require('http');
      const probe = (ip) => new Promise((resolve) => {
        const req = http.get({ host: ip, port: PORT, path: '/control', timeout: 3000 }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      });
      console.log('  Проверяю ссылки из локальной сети...');
      Promise.all(entries.map(async (e) => {
        const code = await probe(e.address);
        console.log(`  ${e.address.padEnd(15)} ${e.wifi ? 'Wi-Fi ' : 'сеть '} → ${code ? 'HTTP ' + code + ' (ок)' : 'НЕТ ОТВЕТА'}`);
      })).then(() => {
        if (entries.length) {
          console.log('  Адреса с пометкой [виртуальный/VPN] в локальной сети обычно недоступны.');
        }
      });
      break;
    }
    case 'token':
      console.log(`  Токен главного:    ${controlToken} (файл .token)`);
      console.log(`  Токен модератора:  ${roleTokens.moderator} (tokens.json)`);
      console.log(`  Токен стримера:    ${roleTokens.streamer} (tokens.json)`);
      break;
    case 'status':
      console.log(`  Аптайм:        ${formatUptime()}`);
      console.log(`  Источников:    ${config.sources.length}`);
      console.log(`  OBS:           ${obsState.connected ? 'подключён' : 'не подключён'}${obsState.connected && obsState.currentScene ? `, сцена "${obsState.currentScene}", элементов: ${obsState.items.length}` : ''}`);
      if (obsCfg.enabled) console.log(`  OBS-адрес:     ws://${obsCfg.host}:${obsCfg.port}`);
      break;
    case 'sources':
      if (!config.sources.length) {
        console.log('  Сцена пуста.');
      } else {
        for (const s of config.sources) {
          console.log(`  [${s.id}] ${s.type} · ${s.type === 'text' ? JSON.stringify((s.text || '').slice(0, 40)) : s.url} · x:${s.x} y:${s.y} w:${s.w} h:${s.h} · z:${s.z} · видно:${s.visible === false ? 'нет' : 'да'}`);
        }
      }
      break;
    case 'clear':
    case 'cls':
      process.stdout.write('\x1b[2J\x1b[0f');
      break;
    case 'reboot':
      performRestart();
      return true;
    case 'exit':
    case 'quit':
    case 'stop':
      console.log('  Сервер остановлен. Пока!');
      io.close();
      try { server.closeAllConnections(); } catch {}
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500);
      return false;
    default:
      console.log(`  Неизвестная команда: "${cmd}". Введи "help" для списка.`);
  }
  return true;
}

if (process.stdin && (process.stdin.isTTY || process.env.OVERLAY_CONSOLE === '1')) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('');
  console.log('  Это живая консоль. Введи "help" для списка команд.');
  rl.setPrompt('  [overlay] > ');
  rl.prompt();
  rl.on('line', (line) => {
    if (execCommand(line) !== false) rl.prompt();
  });
  rl.on('SIGINT', () => {
    console.log('\n  Для выхода набери "exit" (или ещё раз Ctrl+C).');
    rl.prompt();
  });
  rl.on('close', () => {
    console.log('\n  Ввод закрыт.');
    setTimeout(() => process.exit(0), 50);
  });
} else {
  console.log('');
  console.log('  (сервер запущен без терминала — интерактивные команды недоступны)');
}
