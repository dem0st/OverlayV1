const $ = (sel) => document.querySelector(sel);

const TOKEN_KEY = 'ov_token';
const urlToken = new URLSearchParams(location.search).get('t');
if (urlToken) {
  localStorage.setItem(TOKEN_KEY, urlToken);
  history.replaceState(null, '', location.pathname);
}

let token = localStorage.getItem(TOKEN_KEY) || '';
let socket = null;

/* ---------- Тема панели ---------- */

const THEME_KEY = 'ov_theme';
const THEMES = {
  classic: { bg: '#0e0e13', card: '#17171f', accent: '#9146ff' },
  ocean:   { bg: '#0b0e14', card: '#121826', accent: '#2f86e0' },
  forest:  { bg: '#0b1210', card: '#101916', accent: '#3ecf7a' },
  light:   { bg: '#f2f2f6', card: '#ffffff', accent: '#7c3aed' },
};

function applyTheme(name) {
  const key = THEMES[name] ? name : 'classic';
  document.documentElement.setAttribute('data-theme', key);
  localStorage.setItem(THEME_KEY, key);
  return key;
}

applyTheme(localStorage.getItem(THEME_KEY) || 'classic');

function renderThemeUI() {
  const sel = $('#theme-select');
  if (sel) sel.value = document.documentElement.getAttribute('data-theme') || 'classic';

  const box = $('#theme-dots');
  if (!box) return;
  box.innerHTML = '';
  for (const [name, t] of Object.entries(THEMES)) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'theme-dot' + (document.documentElement.getAttribute('data-theme') === name ? ' active' : '');
    dot.title = name;
    dot.setAttribute('aria-label', 'Тема ' + name);
    dot.style.background = `linear-gradient(135deg, ${t.accent} 0 50%, ${t.bg} 50% 100%)`;
    dot.addEventListener('click', () => {
      applyTheme(name);
      renderThemeUI();
    });
    box.appendChild(dot);
  }
}

const themeSelect = $('#theme-select');
if (themeSelect) {
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
    renderThemeUI();
  });
}

renderThemeUI();

/* ---------- Отображение токена в шапке ---------- */

const MASK = '••••••';
let tokenVisible = false;

function renderTokenView() {
  const el = $('#token-view');
  const btn = $('#token-toggle');
  if (!el || !btn) return;
  if (!token) {
    el.textContent = '—';
    btn.textContent = 'Показать';
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  el.textContent = tokenVisible ? token : MASK;
  btn.textContent = tokenVisible ? 'Скрыть' : 'Показать';
  el.title = tokenVisible ? 'Токен панели · клик — скопировать' : 'Токен скрыт · нажми «Показать»';
}

$('#token-toggle').addEventListener('click', () => {
  tokenVisible = !tokenVisible;
  renderTokenView();
});

$('#token-view').addEventListener('click', () => {
  if (!token || !tokenVisible) return;
  const el = $('#token-view');
  let settled = false;
  const showOk = () => {
    if (settled) return;
    settled = true;
    el.textContent = '✓ скопировано';
    el.dataset.copied = '1';
    setTimeout(() => {
      delete el.dataset.copied;
      renderTokenView();
    }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(token).then(showOk).catch(() => fallbackCopy(showOk));
    setTimeout(() => { if (!settled) fallbackCopy(showOk); }, 400);
  } else {
    fallbackCopy(showOk);
  }
});

function fallbackCopy(onOk) {
  const ta = document.createElement('textarea');
  ta.value = token;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); onOk(); } catch {}
  ta.remove();
}

renderTokenView();

/* ---------- Сворачивание карточек ---------- */

const CARD_STATE_KEY = 'ov_cards';

function syncCardState() {
  const state = {};
  for (const card of document.querySelectorAll('.card')) {
    state[card.id || card.querySelector('h2')?.textContent.trim()] = card.classList.contains('collapsed');
  }
  localStorage.setItem(CARD_STATE_KEY, JSON.stringify(state));
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.collapse');
  if (!btn) return;
  const card = btn.closest('.card');
  if (!card) return;
  card.classList.toggle('collapsed');
  syncCardState();
});

(function restoreCards() {
  let state = {};
  try { state = JSON.parse(localStorage.getItem(CARD_STATE_KEY) || '{}'); } catch {}
  for (const card of document.querySelectorAll('.card')) {
    const key = card.id || card.querySelector('h2')?.textContent.trim();
    if (state[key]) card.classList.add('collapsed');
  }
})();

/* ---------- Гейт ---------- */

const gate = $('#gate');

function showGate(msg = '') {
  gate.classList.remove('hidden');
  $('#gate-error').textContent = msg;
  $('#gate-token').focus();
}

function hideGate() {
  gate.classList.add('hidden');
  $('#gate-error').textContent = '';
}

$('#gate-enter').addEventListener('click', tryEnter);
$('#gate-token').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryEnter();
});

function tryEnter() {
  const t = $('#gate-token').value.trim();
  if (!t) return;
  token = t;
  localStorage.setItem(TOKEN_KEY, t);
  renderTokenView();
connect();

document.addEventListener('dragstart', (e) => {
  if (e.target && e.target.closest && e.target.closest('#stage')) e.preventDefault();
});
}

$('#logout').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

$('#btn-help').addEventListener('click', () => {
  window.open('/help');
});

/* ---------- Скрытие панели инструментов ---------- */

const TOOLS_KEY = 'ov_tools_hidden';

function renderToolsToggle() {
  const btn = $('#tools-toggle');
  if (!btn) return;
  const hidden = document.body.classList.contains('tools-hidden');
  btn.textContent = hidden ? 'Показать инструменты' : 'Скрыть инструменты';
  btn.title = hidden ? 'Показать панель инструментов' : 'Скрыть панель инструментов';
}

function applyToolsHidden(hidden) {
  document.body.classList.toggle('tools-hidden', hidden);
  localStorage.setItem(TOOLS_KEY, hidden ? '1' : '0');
  renderToolsToggle();
}

if (localStorage.getItem(TOOLS_KEY) === '1') {
  document.body.classList.add('tools-hidden');
}

$('#tools-toggle').addEventListener('click', () => {
  const hidden = !document.body.classList.contains('tools-hidden');
  applyToolsHidden(hidden);
});

renderToolsToggle();

/* ---------- Онбординг (первый запуск) ---------- */

const ONBOARD_KEY = 'ov_tts_onboarded';

function handleOnboard(serverDone) {
  if (localStorage.getItem(ONBOARD_KEY)) return;
  const ob = $('#onboard');
  if (serverDone) {
    ob.classList.add('hidden');
    return;
  }
  ob.classList.remove('hidden');
}

function closeOnboard(openKeys) {
  localStorage.setItem(ONBOARD_KEY, '1');
  const ob = $('#onboard');
  ob.classList.add('hidden');
  if (socket && socket.connected) socket.emit('onboarding:done');
  if (openKeys) {
    const keys = $('#tts-keys');
    if (keys.hidden) keys.hidden = false;
    $('#tts-key-se').focus();
    $('#tts-key-se').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

$('#onboard-yes').addEventListener('click', () => closeOnboard(true));
$('#onboard-no').addEventListener('click', () => closeOnboard(false));

/* ---------- Подключение ---------- */

function connect() {
  if (!token) {
    showGate();
    return;
  }
  socket = io({ auth: { role: 'control', token }, reconnectionDelayMax: 1000 });

  socket.on('connect', () => {
    setStatus(true);
    hideGate();
    socket.emit('presets:list', (res) => {
      if (res && res.ok) renderPresets(res.presets);
    });
  });

  socket.on('disconnect', () => { setStatus(false); flushProp(); });

  socket.on('connect_error', (err) => {
    if (err && err.message === 'unauthorized') {
      localStorage.removeItem(TOKEN_KEY);
      showGate('Неверный токен. Проверь консоль сервера или файл .token');
    }
    setStatus(false);
  });

  socket.on('config', (cfg) => {
    const sources = Array.isArray(cfg.sources) ? cfg.sources : [];
    noteSources(sources);
    if (cfg.ui && cfg.ui.role) setPanelRole(cfg.ui.role);
    renderEditor(sources);
    renderTTS(cfg);
    handleOnboard(!!cfg.ui && cfg.ui.ttsOnboarded);
  });

  socket.on('tts:error', ({ message }) => {
    ttsStatus(message || 'Ошибка озвучки', true);
  });

  socket.on('token:rotated', ({ token: newToken }) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    location.reload();
  });

  socket.on('logout', () => {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });

  socket.on('obs:state', (st = {}) => {
    Object.assign(obsState, st);
    setObsStatus(!!obsState.connected);
    if (!obsState.connected) return;

    renderObsScenes();
    renderObsBoxes();
    renderObsSources();
  });
}

function setStatus(online) {
  const dot = $('#status-dot');
  dot.classList.toggle('on', online);
  dot.classList.toggle('off', !online);
}

connect();

/* ---------- Озвучка (TTS) ---------- */

let ttsProviders = [];
let ttsSettings = { provider: 'google', voice: 'ru', volume: 100, showText: false };

function ttsHasUI() {
  return !!document.getElementById('tts-provider');
}

function renderTTS(cfg) {
  if (!ttsHasUI()) return;
  if (Array.isArray(cfg.ttsProviders)) {
    ttsProviders = cfg.ttsProviders;
  } else if (!ttsProviders.length) {
    return;
  }
  if (cfg.tts) ttsSettings = { ...ttsSettings, ...cfg.tts };

  const provSel = $('#tts-provider');
  const prevProv = provSel.value || ttsSettings.provider;
  provSel.innerHTML = '';
  for (const p of ttsProviders) {
    const opt = document.createElement('option');
    opt.value = p.id;
    let label = p.label;
    if (p.needsKey) label += p.hasKey ? '' : ' (нужен ключ)';
    opt.textContent = label;
    provSel.appendChild(opt);
  }
  const provOk = ttsProviders.some((p) => p.id === prevProv);
  provSel.value = provOk ? prevProv : (ttsProviders[0]?.id || '');
  fillVoices();

  const seEl = $('#tts-key-se-status');
  const elEl = $('#tts-key-el-status');
  if (seEl && elEl) {
    const paint = (target, keyed) => {
      target.classList.toggle('error', !keyed);
      target.textContent = keyed ? 'ключ сохранён' : 'нет ключа';
    };
    const se = ttsProviders.find((p) => p.id === 'streamelements');
    const el = ttsProviders.find((p) => p.id === 'elevenlabs');
    if (se) paint(seEl, se.hasKey);
    if (el) paint(elEl, el.hasKey);
  }
}

const VOICE_KEY = 'ov_tts_voice';

function fillVoices() {
  if (!ttsHasUI()) return;
  const prov = ttsProviders.find((p) => p.id === $('#tts-provider').value);
  const vSel = $('#tts-voice');
  vSel.innerHTML = '';
  if (!prov || !prov.voices.length) return;

  const saved = localStorage.getItem(VOICE_KEY + ':' + prov.id) || ttsSettings.voice;
  for (const v of prov.voices) {
    const opt = document.createElement('option');
    opt.value = v.voice;
    opt.textContent = v.name;
    vSel.appendChild(opt);
  }
  if (prov.voices.some((v) => v.voice === saved)) vSel.value = saved;
  else vSel.value = prov.voices[0].voice;
}

function ttsStatus(msg, isError) {
  if (!ttsHasUI()) return;
  const el = $('#tts-status');
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function setTTSVolumeLabel() {
  if (!ttsHasUI()) return;
  $('#tts-volume-val').textContent = $('#tts-volume').value + '%';
}

function bindTTSControls() {
  if (!ttsHasUI()) return;

  $('#tts-provider').addEventListener('change', () => {
    fillVoices();
    $('#tts-voice').dispatchEvent(new Event('change'));
  });

  $('#tts-voice').addEventListener('change', () => {
    const prov = $('#tts-provider').value;
    localStorage.setItem(VOICE_KEY + ':' + prov, $('#tts-voice').value);
  });

  $('#tts-volume').addEventListener('input', setTTSVolumeLabel);

  $('#tts-speak').addEventListener('click', flashOn(sendTTS));
  $('#tts-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTTS();
  });

  $('#tts-stop').addEventListener('click', flashOn(() => {
    if (!socket || !socket.connected) return false;
    socket.emit('tts:stop');
    ttsStatus('Озвучка остановлена.');
    return true;
  }));

  $('#tts-key-toggle').addEventListener('click', () => {
    const b = $('#tts-keys');
    b.hidden = !b.hidden;
  });

  $('#tts-key-se-save').addEventListener('click', flashOn(() => saveTTSKey('streamelements', '#tts-key-se', '#tts-key-se-status')));
  $('#tts-key-el-save').addEventListener('click', flashOn(() => saveTTSKey('elevenlabs', '#tts-key-el', '#tts-key-el-status')));

  $('#tts-key-se').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#tts-key-se-save').click();
  });
  $('#tts-key-el').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#tts-key-el-save').click();
  });
}

function saveTTSKey(pid, inputSel, statusSel) {
  if (!socket || !socket.connected) return false;
  const key = $(inputSel).value.trim();
  socket.emit('tts:setkey', { provider: pid, key }, (res) => {
    const status = $(statusSel);
    if (res && res.ok) {
      status.classList.remove('error');
      status.textContent = key ? 'ключ сохранён' : 'ключ удалён';
      $(inputSel).value = '';
    } else {
      status.classList.add('error');
      status.textContent = (res && res.message) || 'Ошибка сохранения';
    }
  });
  return true;
}

function sendTTS() {
  if (!ttsHasUI()) return false;
  const text = $('#tts-text').value.trim();
  if (!text || !socket || !socket.connected) return false;
  socket.emit('tts:speak', {
    text,
    provider: $('#tts-provider').value,
    voice: $('#tts-voice').value,
    volume: Number($('#tts-volume').value) || 100,
    showText: $('#tts-showtext').checked,
  });
  ttsStatus('Стоит в очереди...');
  $('#tts-text').value = '';
  return true;
}

bindTTSControls();

/* ---------- Добавление источника ---------- */

function flashOn(fn) {
  return function handler(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!fn()) return;

    const btn = event && event.currentTarget ? event.currentTarget : null;
    if (btn && btn.classList.contains('btn')) {
      btn.classList.add('flash-ok');
      setTimeout(() => btn.classList.remove('flash-ok'), 450);
    }
  };
}

function syncAddForm() {
  const type = $('#src-type').value;
  const isText = type === 'text';
  $('#src-url-label').textContent = isText ? 'Текст' : 'URL';
  $('#src-url').placeholder = isText ? 'Текст, который появится на сцене...' : 'https://...';
  $('#src-url').rows = isText ? 3 : 1;
  const isImage = type === 'image';
  const isVideo = type === 'video';
  $('#src-fit-wrap').style.display = isImage ? '' : 'none';
  $('#src-chroma-wrap').style.display = isImage ? '' : 'none';
  $('#src-volume-wrap').style.display = isVideo ? '' : 'none';
  $('#src-loop-wrap').style.display = isVideo ? '' : 'none';
}
$('#src-type').addEventListener('change', syncAddForm);
syncAddForm();

$('#add-source').addEventListener('click', flashOn(() => {
  const value = $('#src-url').value;
  if (!value.trim() || !socket || !socket.connected) return false;

  const type = $('#src-type').value;
  const source = { type };

  if (type === 'text') {
    source.text = value.replace(/\r\n/g, '\n').slice(0, 2000);
  } else {
    source.url = value.trim();
  }

  if (type === 'image') {
    source.fit = $('#src-fit').value;
    if ($('#src-chroma').checked) {
      source.chroma = { on: true, threshold: 0.35, smooth: 0.12 };
    }
  }
  if (type === 'video') {
    source.volume = Number($('#src-volume').value);
    source.loop = $('#src-loop').checked;
  }

  socket.emit('sources:set', { action: 'add', source });
  $('#src-url').value = '';
  return true;
}));

$('#clear-sources').addEventListener('click', flashOn(() => {
  if (!socket || !socket.connected) return false;
  socket.emit('sources:set', { action: 'clear' });
  selectedId = null;
  return true;
}));

const importFile = $('#import-file');

function setImportStatus(msg, isError) {
  const el = $('#import-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

$('#import-config').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
  const f = importFile.files && importFile.files[0];
  importFile.value = '';
  if (!f || !socket || !socket.connected) return;
  const rd = new FileReader();
  rd.onerror = () => setImportStatus('Не удалось прочитать файл', true);
  rd.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(rd.result);
    } catch {
      setImportStatus('Не удалось прочитать файл: это не JSON', true);
      return;
    }
    const body = parsed && typeof parsed.config === 'object' && !Array.isArray(parsed.sources) ? parsed.config : parsed;
    socket.emit('config:import', { config: body }, (res) => {
      setImportStatus(
        res && res.ok ? 'Импортировано. Источников на сцене: ' + res.sources : (res && res.message) || 'Ошибка импорта',
        !(res && res.ok)
      );
    });
  };
  rd.readAsText(f);
});

/* ---------- Редактор сцены (как в OBS) ---------- */

const boxesEl = $('#boxes');

const TYPE_LABELS = {
  image: 'Картинка',
  video: 'Видео',
  embed: 'Окно браузера',
  text: 'Текст',
};

let sourcesCache = [];
let selectedId = null;
let dragging = false;
let saveTimer = null;

/* ---------- Магнетизм источников сцены ---------- */

const SNAP = 1.2; // % порог прилипания
let srcSnapOn = true;
const srcSnapEl = $('#src-snap');
if (srcSnapEl) {
  srcSnapOn = localStorage.getItem('ov_src_snap') !== '0';
  srcSnapEl.checked = srcSnapOn;
  srcSnapEl.addEventListener('change', () => {
    srcSnapOn = srcSnapEl.checked;
    localStorage.setItem('ov_src_snap', srcSnapOn ? '1' : '0');
  });
}

function snapGuidesFor(axis, id) {
  const guides = [0, 50, 100];
  for (const s of sourcesCache) {
    if (s.id === id) continue;
    if (axis === 'x') guides.push(s.x, s.x + s.w, s.x + s.w / 2);
    else guides.push(s.y, s.y + s.h, s.y + s.h / 2);
  }
  return guides;
}

function snapAxisValue(v, axis, addVal, id) {
  if (!srcSnapOn) return null;
  let best = null;
  for (const g of snapGuidesFor(axis, id)) {
    const d = Math.abs(addVal - g);
    if (d <= SNAP && (best === null || d < best.d)) best = { g, d };
  }
  return best;
}

function ensureGuides() {
  let el = boxesEl.querySelector('.snap-guides');
  if (!el) {
    el = document.createElement('div');
    el.className = 'snap-guides';
    el.innerHTML = '<i class="guide-v"></i><i class="guide-h"></i>';
  }
  boxesEl.appendChild(el);
  return el;
}

/* ---------- Зум холста (Ctrl+колесо) ---------- */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
let zoom = 1;
try { zoom = parseFloat(localStorage.getItem('ov_zoom')) || 1; } catch {}
zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

const zoomPctEl = $('#zoom-pct');
const stageWrapEl = $('.stage-wrap');

function applyZoom() {
  document.documentElement.style.setProperty('--zoom', String(zoom));
  if (stageWrapEl) stageWrapEl.classList.toggle('zoomed', zoom > 1.001);
  if (zoomPctEl) zoomPctEl.textContent = Math.round(zoom * 100) + '%';
}

function setZoom(z) {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  if (Math.abs(next - zoom) < 1e-6) return;
  zoom = next;
  try { localStorage.setItem('ov_zoom', String(zoom)); } catch {}
  applyZoom();
}

applyZoom();

if (stageWrapEl) {
  stageWrapEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
}

if (zoomPctEl) zoomPctEl.addEventListener('click', () => setZoom(1));

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 24);
  }
}

function renderEditor(sources) {
  sourcesCache = sources;
  if (dragging) return; // не мешаем активному перетаскиванию

  if (selectedId && !sources.find((s) => s.id === selectedId)) selectedId = null;

  boxesEl.innerHTML = '';

  if (!sources.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'Сцена пуста — добавь источник ниже';
    boxesEl.appendChild(note);
    renderProps(null);
    return;
  }

  for (const s of sources) {
    boxesEl.appendChild(makeBox(s));
  }

  renderProps(sources.find((s) => s.id === selectedId) || null);
}

function makeBox(s) {
  const box = document.createElement('div');
  box.className = 'stage-item' + (s.id === selectedId ? ' selected' : '') + (s.visible === false ? ' hidden-src' : '')
    + (s.type === 'text' ? ' is-text' : '');
  box.dataset.id = s.id;

  box.style.left = s.x + '%';
  box.style.top = s.y + '%';
  box.style.width = s.w + '%';
  box.style.height = s.h + '%';
  box.style.zIndex = (Number(s.z) || 0) + 1000;

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = s.type === 'text'
    ? `Текст · ${((s.text || '').split('\n')[0] || '').slice(0, 18)}`
    : `${TYPE_LABELS[s.type] || s.type} · ${hostOf(s.url || '')}`;
  box.appendChild(tag);

  const handle = document.createElement('i');
  handle.className = 'handle';
  box.appendChild(handle);

  const del = document.createElement('b');
  del.className = 'del';
  del.textContent = '×';
  del.title = 'Удалить источник';
  del.addEventListener('pointerdown', (e) => e.stopPropagation());
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('sources:set', { action: 'remove', id: s.id });
  });
  box.appendChild(del);

  box.addEventListener('pointerdown', (down) => startDrag(down, box, s.id));
  return box;
}

function startDrag(down, box, id) {
  if (panelRole === 'streamer') { down.preventDefault(); return; }
  down.preventDefault();
  try { box.setPointerCapture(down.pointerId); } catch {}
  dragging = true;
  document.documentElement.classList.add('editor-dragging');
  box.classList.add('active');

  if (selectedId !== id) {
    selectedId = id;
    // подсветим сразу без перестройки дерева
    for (const el of boxesEl.querySelectorAll('.stage-item')) {
      el.classList.toggle('selected', el.dataset.id === id);
    }
    renderProps(sourcesCache.find((s) => s.id === id) || null);
  }

  const mode = down.target.classList.contains('handle') ? 'resize' : 'drag';
  const areaRect = $('#boxes').getBoundingClientRect();
  const guidesEl = ensureGuides();

  function pct(e) {
    return {
      x: (e.clientX - areaRect.left) / areaRect.width * 100,
      y: (e.clientY - areaRect.top) / areaRect.height * 100,
    };
  }

  function showGuide(axis, pos) {
    const el = guidesEl.querySelector(axis === 'x' ? '.guide-v' : '.guide-h');
    if (!el) return;
    if (pos === null) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    if (axis === 'x') el.style.left = pos + '%';
    else el.style.top = pos + '%';
  }

  function applySnap(r) {
    let gx = null;
    let gy = null;
    if (srcSnapOn) {
      if (mode === 'resize') {
        // растягиваем от лево-верхнего угла: магнитим правую/нижнюю границы
        const bx = snapAxisValue(r.x, 'x', r.x + r.w, id);
        if (bx) { r.w = Math.max(3, bx.g - r.x); gx = bx.g; }
        const by = snapAxisValue(r.y, 'y', r.y + r.h, id);
        if (by) { r.h = Math.max(2, by.g - r.y); gy = by.g; }
      } else {
        const bl = snapAxisValue(r.x, 'x', r.x, id);
        const br = snapAxisValue(r.x, 'x', r.x + r.w, id);
        const dl = bl ? bl.d : Infinity;
        const dr = br ? br.d : Infinity;
        if (dl <= dr && bl) { r.x = bl.g; gx = bl.g; }
        else if (br) { r.x = br.g - r.w; gx = br.g; }

        const bt = snapAxisValue(r.y, 'y', r.y, id);
        const bb = snapAxisValue(r.y, 'y', r.y + r.h, id);
        const dt = bt ? bt.d : Infinity;
        const db = bb ? bb.d : Infinity;
        if (dt <= db && bt) { r.y = bt.g; gy = bt.g; }
        else if (bb) { r.y = bb.g - r.h; gy = bb.g; }
      }
    }
    r.x = clamp(r.x, -50, 150 - r.w);
    r.y = clamp(r.y, -50, 150 - r.h);

    box.classList.toggle('snap-x', gx !== null);
    box.classList.toggle('snap-y', gy !== null);
    showGuide('x', gx);
    showGuide('y', gy);
  }

  const orig = sourcesCache.find((s) => s.id === id);
  if (!orig) { dragging = false; return; }
  const startPct = pct(down);
  let pending = null;
  let raf = null;
  let lastSend = 0;

  function commit(e) {
    const cur = pct(e);
    const dx = cur.x - startPct.x;
    const dy = cur.y - startPct.y;
    let r;

    if (mode === 'drag') {
      r = {
        x: clamp(orig.x + dx, -50, 150 - orig.w),
        y: clamp(orig.y + dy, -50, 150 - orig.h),
        w: orig.w,
        h: orig.h,
      };
    } else {
      r = {
        x: orig.x,
        y: orig.y,
        w: clamp(orig.w + dx, 3, 250 - orig.x),
        h: clamp(orig.h + dy, 2, 250 - orig.y),
      };
    }

    applySnap(r);

    box.style.left = r.x + '%';
    box.style.top = r.y + '%';
    box.style.width = r.w + '%';
    box.style.height = r.h + '%';
    box._rect = r;

    const now = Date.now();
    if (now - lastSend >= 16) {
      lastSend = now;
      if (socket && socket.connected) {
        socket.emit('sources:set', { action: 'update', id, live: true, ...r });
      }
    }
  }

  function onMove(e) {
    pending = e;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = null;
        if (pending) {
          const last = pending;
          pending = null;
          commit(last);
        }
      });
    }
  }

  function onUp() {
    dragging = false;
    document.documentElement.classList.remove('editor-dragging');
    box.classList.remove('active');
    box.classList.remove('snap-x');
    box.classList.remove('snap-y');
    showGuide('x', null);
    showGuide('y', null);
    guidesEl.remove();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (pending) {
      const last = pending;
      pending = null;
      commit(last);
    }
    try { box.releasePointerCapture(down.pointerId); } catch {}
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (box._rect) {
      socket.emit('sources:set', { action: 'update', id, ...box._rect });
      box._rect = null;
    }
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/* ================= OBS Studio ================= */

const obsState = { connected: false, currentScene: null, scenes: [], items: [] };
let obsSelectedId = null;
let obsDragging = false;

const obsDot = $('#obs-dot');
const obsBody = $('#obs-body');
const obsScenesEl = $('#obs-scenes');
const obsStage = $('#obs-stage');
const obsBoxes = $('#obs-boxes');
const obsSceneName = $('#obs-scene-name');
const obsSourcesList = $('#obs-sources-list');
let obsSnapOn = true;
const obsSnapEl = $('#obs-snap');
if (obsSnapEl) obsSnapEl.addEventListener('change', () => { obsSnapOn = obsSnapEl.checked; });

function setObsStatus(online) {
  obsDot.classList.toggle('on', online);
  obsDot.classList.toggle('off', !online);
  obsBody.hidden = !online;
}

$('#obs-connect').addEventListener('click', flashOn(() => {
  if (!socket || !socket.connected) return false;
  socket.emit('obs:connect', {
    host: $('#obs-host').value.trim(),
    port: Number($('#obs-port').value) || 4455,
    password: $('#obs-pass').value,
  });
  return true;
}));

$('#obs-disconnect').addEventListener('click', () => {
  if (!socket || !socket.connected) return;
  socket.emit('obs:disconnect');
});

$('#obs-add-browser').addEventListener('click', flashOn(() => {
  const url = $('#obs-add-url').value.trim();
  if (!url || !socket || !socket.connected || !obsState.connected) return false;
  socket.emit('obs:add-browser', { url });
  $('#obs-add-url').value = '';
  return true;
}));

$('#obs-add-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#obs-add-browser').click();
});

function renderObsScenes() {
  obsSceneName.textContent = obsState.currentScene || '';
  obsScenesEl.innerHTML = '';

  for (const name of obsState.scenes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (name === obsState.currentScene ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      socket.emit('obs:set-scene', { name });
    });
    obsScenesEl.appendChild(btn);
  }
}

const OBS_LOCK_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const OBS_UNLOCK_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7-1.2"/></svg>';

function makeObsBox(item) {
  const box = document.createElement('div');
  box.className = 'stage-item obs-item' + (item.id === obsSelectedId ? ' selected' : '') + (item.visible === false ? ' hidden-src' : '') + (item.locked ? ' locked' : '');
  box.dataset.id = item.id;

  box.style.left = item.x + '%';
  box.style.top = item.y + '%';
  box.style.width = item.w + '%';
  box.style.height = item.h + '%';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = item.name;
  box.appendChild(tag);

  const lockBtn = document.createElement('b');
  lockBtn.className = 'vis obs-lock';
  lockBtn.innerHTML = item.locked ? OBS_LOCK_SVG : OBS_UNLOCK_SVG;
  lockBtn.title = item.locked ? 'Зафиксирован — отменить' : 'Зафиксировать положение';
  lockBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('obs:set-locked', { id: item.id, locked: !item.locked });
  });
  box.appendChild(lockBtn);

  const handle = document.createElement('i');
  handle.className = 'handle';
  box.appendChild(handle);

  const visBtn = document.createElement('b');
  visBtn.className = 'vis';
  visBtn.textContent = item.visible === false ? '◌' : '●';
  visBtn.title = item.visible === false ? 'Скрыт — показать' : 'Виден — скрыть';
  visBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('obs:set-visible', { id: item.id, visible: item.visible === false });
  });
  box.appendChild(visBtn);

  const del = document.createElement('b');
  del.className = 'del obs-del';
  del.textContent = '×';
  del.title = 'Удалить источник из OBS';
  del.addEventListener('pointerdown', (e) => e.stopPropagation());
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('obs:remove', { id: item.id });
  });
  box.appendChild(del);

  box.addEventListener('pointerdown', (down) => startObsDrag(down, box, item.id));
  return box;
}

function renderObsBoxes() {
  if (obsDragging) return;
  if (obsSelectedId && !obsState.items.find((i) => i.id === obsSelectedId)) obsSelectedId = null;
  obsBoxes.innerHTML = '';
  obsStage.classList.toggle('has-selection', !!obsSelectedId);

  if (!obsState.items.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'В сцене нет источников — добавь браузер выше или в OBS';
    obsBoxes.appendChild(note);
    return;
  }

  let selEl = null;
  for (const item of obsState.items) {
    const el = makeObsBox(item);
    if (item.id === obsSelectedId) selEl = el;
    else obsBoxes.appendChild(el);
  }
  if (selEl) obsBoxes.appendChild(selEl);
}

function selectObs(id) {
  obsSelectedId = id;
  const sid = String(id);
  for (const el of obsBoxes.querySelectorAll('.obs-item')) {
    el.classList.toggle('selected', String(el.dataset.id) === sid);
  }
  for (const el of obsSourcesList.querySelectorAll('.obs-src-row')) {
    el.classList.toggle('selected', String(el.dataset.id) === sid);
  }
  obsStage.classList.toggle('has-selection', !!id);
  // поднимаем выбранную рамку наверх в DOM, чтобы она была поверх всех
  if (id != null) {
    const el = obsBoxes.querySelector('.obs-item.selected');
    if (el) obsBoxes.appendChild(el);
  }
}

function makeObsSourceRow(item) {
  const row = document.createElement('div');
  row.className = 'obs-src-row' + (item.id === obsSelectedId ? ' selected' : '') + (item.visible === false ? ' hidden-src' : '') + (item.locked ? ' locked' : '');
  row.dataset.id = item.id;

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'obs-src-btn obs-reorder';
  up.textContent = '▲';
  up.title = 'Поднять выше';
  up.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    socket.emit('obs:reorder', { id: item.id, dir: 'up' });
  });
  row.appendChild(up);

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'obs-src-btn obs-reorder';
  down.textContent = '▼';
  down.title = 'Опустить ниже';
  down.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    socket.emit('obs:reorder', { id: item.id, dir: 'down' });
  });
  row.appendChild(down);

  const name = document.createElement('span');
  name.className = 'obs-src-name';
  name.textContent = item.name;
  row.appendChild(name);

  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'obs-src-btn obs-lock' + (item.locked ? ' locked-on' : '');
  lock.innerHTML = item.locked ? OBS_LOCK_SVG : OBS_UNLOCK_SVG;
  lock.title = item.locked ? 'Зафиксирован — отменить' : 'Зафиксировать положение';
  lock.style.fontSize = '12px';
  lock.style.lineHeight = '1';
  lock.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    socket.emit('obs:set-locked', { id: item.id, locked: !item.locked });
  });
  row.appendChild(lock);

  const vis = document.createElement('button');
  vis.type = 'button';
  vis.className = 'obs-src-btn' + (item.visible === false ? ' vis-off' : '');
  vis.textContent = item.visible === false ? '◌' : '●';
  vis.title = item.visible === false ? 'Показать' : 'Скрыть';
  vis.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    socket.emit('obs:set-visible', { id: item.id, visible: item.visible === false });
  });
  row.appendChild(vis);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'obs-src-btn danger obs-del';
  del.textContent = '×';
  del.title = 'Удалить из OBS';
  del.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    socket.emit('obs:remove', { id: item.id });
  });
  row.appendChild(del);

  row.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    selectObs(item.id);
  });
  return row;
}

function renderObsSources() {
  obsSourcesList.innerHTML = '';
  if (!obsState.items.length) {
    const empty = document.createElement('div');
    empty.className = 'obs-sources-hint';
    empty.textContent = 'Нет источников';
    obsSourcesList.appendChild(empty);
    return;
  }
  // Как в OBS: нижний источник (index 0, дно) — сверху, передний план — снизу.
  for (const item of obsState.items) {
    obsSourcesList.appendChild(makeObsSourceRow(item));
  }
}

function startObsDrag(down, box, id) {
  if (panelRole === 'streamer') { // стример видит сцену OBS, но не двигает элементы
    selectObs(id);
    return;
  }
  down.preventDefault();
  try { box.setPointerCapture(down.pointerId); } catch {}
  obsDragging = true;
  document.documentElement.classList.add('editor-dragging');
  box.classList.add('active');

  if (obsSelectedId !== id) {
    selectObs(id);
  }

  const orig = obsState.items.find((i) => i.id === id);
  if (!orig) { obsDragging = false; return; }
  if (orig.locked) { obsDragging = false; return; }

  const SNAP = 1.2; // % порог магнетизма

  const mode = down.target.classList.contains('handle') ? 'resize' : 'drag';
  const stageRect = obsStage.getBoundingClientRect();

  function pct(e) {
    return {
      x: (e.clientX - stageRect.left) / stageRect.width * 100,
      y: (e.clientY - stageRect.top) / stageRect.height * 100,
    };
  }

  const startPct = pct(down);
  let lastSend = 0;

  function snapGuides(v, axis, addAxis) {
    if (!obsSnapOn) return v;
    // близко к краям/центру канваса
    const guides = [0, 50, 100];
    for (const it of obsState.items) {
      if (it.id === id) continue;
      if (axis === 'x') {
        guides.push(it.x, it.x + it.w, it.x + it.w / 2);
      } else {
        guides.push(it.y, it.y + it.h, it.y + it.h / 2);
      }
    }
    let best = null;
    for (const g of guides) {
      const d = Math.abs(addAxis - g);
      if (d <= SNAP && (best === null || d < best.d)) best = { g, d };
    }
    return best ? v + (best.g - addAxis) : v;
  }

  function snapRect(r, mode) {
    let xSnapped = null, ySnapped = null;
    if (mode === 'resize') {
      // растягиваем от лево-верхнего угла: магнитим правая/нижняя границы
      const nx = snapGuides(r.x, 'x', r.x + r.w);
      if (nx !== r.x) { r.w = Math.max(3, nx - r.x); xSnapped = nx; }
      const ny = snapGuides(r.y, 'y', r.y + r.h);
      if (ny !== r.y) { r.h = Math.max(2, ny - r.y); ySnapped = ny; }
    } else {
      // двигаем целиком: магнитим левый или правый край, верх или низ
      const nl = snapGuides(r.x, 'x', r.x);
      const nr = snapGuides(r.x, 'x', r.x + r.w);
      const dl = nl !== null ? Math.abs(nl - r.x) : Infinity;
      const dr = nr !== null ? Math.abs((nr - r.w) - r.x) : Infinity;
      if (dl <= dr) { if (nl !== null) { r.x = nl; xSnapped = nl; } }
      else if (nr !== null) { r.x = nr - r.w; xSnapped = nr; }

      const nt = snapGuides(r.y, 'y', r.y);
      const nb = snapGuides(r.y, 'y', r.y + r.h);
      const dt = nt !== null ? Math.abs(nt - r.y) : Infinity;
      const db = nb !== null ? Math.abs((nb - r.h) - r.y) : Infinity;
      if (dt <= db) { if (nt !== null) { r.y = nt; ySnapped = nt; } }
      else if (nb !== null) { r.y = nb - r.h; ySnapped = nb; }
    }
    box.classList.toggle('snap-x', xSnapped !== null);
    box.classList.toggle('snap-y', ySnapped !== null);
  }

  function onMove(e) {
    const cur = pct(e);
    const dx = cur.x - startPct.x;
    const dy = cur.y - startPct.y;
    let r;

    if (mode === 'drag') {
      r = {
        x: clamp(orig.x + dx, -50, 150 - orig.w),
        y: clamp(orig.y + dy, -50, 150 - orig.h),
        w: orig.w,
        h: orig.h,
      };
    } else {
      r = {
        x: orig.x,
        y: orig.y,
        w: clamp(orig.w + dx, 3, 250 - orig.x),
        h: clamp(orig.h + dy, 2, 250 - orig.y),
      };
    }

    snapRect(r, mode);
    r.x = clamp(r.x, -50, 150 - r.w);
    r.y = clamp(r.y, -50, 150 - r.h);

    box.style.left = r.x + '%';
    box.style.top = r.y + '%';
    box.style.width = r.w + '%';
    box.style.height = r.h + '%';
    box._rect = r;

    const now = Date.now();
    if (now - lastSend >= 16) {
      lastSend = now;
      if (socket && socket.connected) {
        socket.emit('obs:move', { id, live: true, ...r });
      }
    }
  }

  function onUp() {
    obsDragging = false;
    document.documentElement.classList.remove('editor-dragging');
    box.classList.remove('active');
    box.classList.remove('snap-x');
    box.classList.remove('snap-y');
    try { box.releasePointerCapture(down.pointerId); } catch {}
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (box._rect) {
      socket.emit('obs:move', { id, ...box._rect });
      box._rect = null;
    }
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/* ---------- Свойства выбранного источника ---------- */

const propsCard = $('#props-card');

function expandColor(v) {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(String(v || ''));
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map((c) => c + c).join('');
  else if (hex.length !== 6) return null;
  return '#' + hex.toLowerCase();
}

function renderProps(src) {
  if (panelRole === 'streamer') {
    propsCard.hidden = true;
    return;
  }
  if (!src) {
    propsCard.hidden = true;
    return;
  }
  propsCard.hidden = false;
  $('#props-type').textContent = TYPE_LABELS[src.type] || src.type;
  $('#p-url').value = src.url;
  $('#p-x').value = Math.round(src.x);
  $('#p-y').value = Math.round(src.y);
  $('#p-w').value = Math.round(src.w);
  $('#p-h').value = Math.round(src.h);
  $('#p-scale').value = src.scale ?? 1;
  $('#p-scale-val').textContent = Math.round((src.scale ?? 1) * 100) + '%';
  $('#p-rotation').value = Math.round(src.rotation || 0);
  $('#p-flipH').checked = !!src.flipH;
  $('#p-flipV').checked = !!src.flipV;
  $('#p-opacity').value = src.opacity ?? 100;
  $('#p-opacity-val').textContent = Math.round(src.opacity ?? 100) + '%';
  $('#p-cropL').value = Math.round(src.cropL || 0);
  $('#p-cropR').value = Math.round(src.cropR || 0);
  $('#p-cropT').value = Math.round(src.cropT || 0);
  $('#p-cropB').value = Math.round(src.cropB || 0);
  $('#p-visible').checked = src.visible !== false;

  const isImage = src.type === 'image';
  const isVideo = src.type === 'video';
  const isText = src.type === 'text';
  document.querySelectorAll('.prop-image').forEach((e) => { e.style.display = isImage ? '' : 'none'; });
  document.querySelectorAll('.prop-video').forEach((e) => { e.style.display = isVideo ? '' : 'none'; });
  document.querySelectorAll('.prop-text').forEach((e) => { e.style.display = isText ? '' : 'none'; });
  document.querySelectorAll('.prop-url').forEach((e) => { e.style.display = isText ? 'none' : ''; });

  if (isText) {
    $('#p-text').value = src.text || '';
    $('#p-size').value = Math.round(src.size ?? 48);
    $('#p-color').value = expandColor(src.color) || '#ffffff';
  }

  if (isImage) {
    $('#p-fit').value = src.fit || 'contain';
    $('#p-chroma').checked = !!src.chroma?.on;
    const thr = src.chroma?.threshold ?? 0.35;
    const sm = src.chroma?.smooth ?? 0.12;
    $('#p-chroma-threshold').value = thr;
    $('#p-chroma-val').textContent = thr.toFixed(2);
    $('#p-chroma-smooth').value = sm;
    $('#p-chroma-smooth-val').textContent = sm.toFixed(2);
  }
  if (isVideo) {
    $('#p-volume').value = src.volume ?? 50;
    $('#p-volume-val').textContent = Math.round(src.volume ?? 50) + '%';
    $('#p-loop').checked = !!src.loop;
    $('#p-muted').checked = !!src.muted;
    $('#p-speed').value = src.speed ?? 1;
  }
}

function propSave(patch) {
  if (!selectedId || !socket || !socket.connected) return;
  socket.emit('sources:set', { action: 'update', id: selectedId, ...patch });
}

let propDebounce = null;
let pendingProp = null;
function propDebounced(patch) {
  pendingProp = { ...pendingProp, ...patch };
  clearTimeout(propDebounce);
  propDebounce = setTimeout(flushProp, 250);
}
function flushProp() {
  clearTimeout(propDebounce);
  if (pendingProp) {
    const patch = pendingProp;
    pendingProp = null;
    propSave(patch);
  }
}

window.addEventListener('beforeunload', flushProp);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushProp();
});

$('#p-url').addEventListener('input', () => propDebounced({ url: $('#p-url').value.trim() }));
$('#p-text').addEventListener('input', () => propDebounced({ text: $('#p-text').value }));
$('#p-size').addEventListener('input', () => {
  const v = Number($('#p-size').value);
  if (Number.isFinite(v)) propDebounced({ size: v });
});
$('#p-color').addEventListener('input', () => propDebounced({ color: $('#p-color').value }));
$('#p-fit').addEventListener('change', () => propSave({ fit: $('#p-fit').value }));
$('#p-chroma').addEventListener('change', () => {
  propSave({
    chroma: {
      on: $('#p-chroma').checked,
      threshold: Number($('#p-chroma-threshold').value),
      smooth: Number($('#p-chroma-smooth').value),
    },
  });
});
$('#p-chroma-threshold').addEventListener('input', () => {
  const v = Number($('#p-chroma-threshold').value);
  $('#p-chroma-val').textContent = v.toFixed(2);
  propDebounced({ chroma: { on: $('#p-chroma').checked, threshold: v, smooth: Number($('#p-chroma-smooth').value) } });
});
$('#p-chroma-smooth').addEventListener('input', () => {
  const v = Number($('#p-chroma-smooth').value);
  $('#p-chroma-smooth-val').textContent = v.toFixed(2);
  propDebounced({ chroma: { on: $('#p-chroma').checked, threshold: Number($('#p-chroma-threshold').value), smooth: v } });
});
$('#p-volume').addEventListener('input', () => {
  const v = Number($('#p-volume').value);
  $('#p-volume-val').textContent = v + '%';
  propDebounced({ volume: v });
});
$('#p-loop').addEventListener('change', () => propSave({ loop: $('#p-loop').checked }));
$('#p-muted').addEventListener('change', () => propSave({ muted: $('#p-muted').checked }));
$('#p-speed').addEventListener('input', () => propDebounced({ speed: Number($('#p-speed').value) }));
$('#p-w').addEventListener('input', () => propDebounced({ w: Number($('#p-w').value) }));
$('#p-h').addEventListener('input', () => propDebounced({ h: Number($('#p-h').value) }));
$('#p-x').addEventListener('input', () => propDebounced({ x: Number($('#p-x').value) }));
$('#p-y').addEventListener('input', () => propDebounced({ y: Number($('#p-y').value) }));
$('#p-rotation').addEventListener('input', () => propDebounced({ rotation: Number($('#p-rotation').value) }));
$('#p-flipH').addEventListener('change', () => propSave({ flipH: $('#p-flipH').checked }));
$('#p-flipV').addEventListener('change', () => propSave({ flipV: $('#p-flipV').checked }));
$('#p-opacity').addEventListener('input', () => {
  const v = Number($('#p-opacity').value);
  $('#p-opacity-val').textContent = v + '%';
  propDebounced({ opacity: v });
});
['cropL', 'cropR', 'cropT', 'cropB'].forEach((k) => {
  $('#p-' + k).addEventListener('input', () => propDebounced({ [k]: Number($('#p-' + k).value) }));
});
$('#p-scale').addEventListener('input', () => {
  const v = Number($('#p-scale').value);
  $('#p-scale-val').textContent = Math.round(v * 100) + '%';
  propDebounced({ scale: v });
});

$('#p-visible').addEventListener('change', () => propSave({ visible: $('#p-visible').checked }));
$('#p-layer-up').addEventListener('click', () => propSave({ action: 'layer', dir: 'up' }));
$('#p-layer-down').addEventListener('click', () => propSave({ action: 'layer', dir: 'down' }));
$('#p-layer-top').addEventListener('click', () => propSave({ action: 'layer', dir: 'top' }));
$('#p-layer-bottom').addEventListener('click', () => propSave({ action: 'layer', dir: 'bottom' }));

$('#p-reload').addEventListener('click', flashOn(() => {
  if (!selectedId || !socket || !socket.connected) return false;
  socket.emit('sources:reload', { id: selectedId });
  return true;
}));

$('#p-delete').addEventListener('click', () => {
  if (!selectedId) return;
  socket.emit('sources:set', { action: 'remove', id: selectedId });
  selectedId = null;
});

$('#p-duplicate').addEventListener('click', () => {
  const src = sourcesCache.find((s) => s.id === selectedId);
  if (!src) return;
  const copy = { ...src };
  delete copy.id;
  copy.x = clamp(src.x + 4, -50, 150);
  copy.y = clamp(src.y + 4, -50, 150);
  socket.emit('sources:set', { action: 'add', source: copy });
});

/* ---------- История сцены: Ctrl+Z / Ctrl+Shift+Z ---------- */

const sceneHistory = { past: [], future: [] };
const HISTORY_LIMIT = 60;
const HISTORY_GAP = 600; // мс тишины между разными операциями
let historyBase = null; // JSON последнего известного состояния
let historyBurst = 0;   // время последнего изменения текущей серии
let historySkip = 0;    // сколько ближайших config-событий не пишем в историю (undo/redo)

function historyKey(sources) {
  return JSON.stringify(sources || []);
}

function renderHistory() {
  const undoBtn = $('#undo-btn');
  const redoBtn = $('#redo-btn');
  if (undoBtn) undoBtn.disabled = !sceneHistory.past.length;
  if (redoBtn) redoBtn.disabled = !sceneHistory.future.length;
}

function noteSources(sources) {
  const key = historyKey(sources);
  if (historySkip > 0) {
    historySkip--;
    historyBase = key;
    return;
  }
  if (historyBase === null) {
    historyBase = key;
    return;
  }
  if (key === historyBase) return;

  const prev = historyBase;
  historyBase = key;

  // первое изменение серии (например, начало перетаскивания) — запоминаем
  // состояние до него; в серии одно действие пишется одна запись
  if (Date.now() - historyBurst > HISTORY_GAP) {
    try {
      sceneHistory.past.push(JSON.parse(prev));
      if (sceneHistory.past.length > HISTORY_LIMIT) sceneHistory.past.shift();
      sceneHistory.future.length = 0;
    } catch {}
    renderHistory();
  }
  historyBurst = Date.now();
}

function applyHistoryState(state) {
  historyBase = JSON.stringify(state || []);
  historySkip++;
  renderHistory();
  socket.emit('sources:set', { action: 'replace', sources: state });
}

function undo() {
  if (!sceneHistory.past.length || !socket || !socket.connected) return;
  flushProp();
  const current = historyBase ? JSON.parse(historyBase) : sourcesCache;
  sceneHistory.future.push(current);
  applyHistoryState(sceneHistory.past.pop());
}

function redo() {
  if (!sceneHistory.future.length || !socket || !socket.connected) return;
  flushProp();
  const current = historyBase ? JSON.parse(historyBase) : sourcesCache;
  sceneHistory.past.push(current);
  applyHistoryState(sceneHistory.future.pop());
}

const undoBtn = $('#undo-btn');
const redoBtn = $('#redo-btn');
if (undoBtn) undoBtn.addEventListener('click', flashOn(() => {
  const can = sceneHistory.past.length > 0 && !!socket && socket.connected;
  if (can) undo();
  return can;
}));
if (redoBtn) redoBtn.addEventListener('click', flashOn(() => {
  const can = sceneHistory.future.length > 0 && !!socket && socket.connected;
  if (can) redo();
  return can;
}));

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const key = (e.key || '').toLowerCase();
  if (key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
  else if (key === 'z') { e.preventDefault(); undo(); }
  else if (key === 'y') { e.preventDefault(); redo(); }
  else if (key === '0') { e.preventDefault(); setZoom(1); }
});

/* ---------- Роли панели ---------- */

const ROLE_NAMES = {
  head: 'Главный модератор',
  moderator: 'Модератор',
  streamer: 'Стример',
};
let panelRole = 'head';

function setPanelRole(role) {
  panelRole = ROLE_NAMES[role] ? role : 'head';
  document.body.dataset.role = panelRole;

  const badge = $('#role-badge');
  if (badge) badge.textContent = ROLE_NAMES[panelRole];

  // подключение к OBS меняет только главный модератор
  ['obs-host', 'obs-port', 'obs-pass', 'obs-connect'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = panelRole !== 'head';
    el.title = panelRole === 'head' ? '' : 'Только главный модератор';
  });
}

const ROLE_MASK = '••••••••••••';
let roleTokensVisible = false;

const roleShowBtn = $('#role-show');
if (roleShowBtn) {
  const status = $('#role-status');

  const setRoleTokens = (head, moderator, streamer) => {
    $('#role-token-head').textContent = head;
    $('#role-token-moderator').textContent = moderator;
    $('#role-token-streamer').textContent = streamer;
  };

  roleShowBtn.addEventListener('click', flashOn(() => {
    if (roleTokensVisible) {
      roleTokensVisible = false;
      setRoleTokens(ROLE_MASK, ROLE_MASK, ROLE_MASK);
      roleShowBtn.textContent = 'Показать токены';
      if (status) status.textContent = 'Токены скрыты';
      return true;
    }

    if (!socket || !socket.connected) return false;
    socket.emit('roles:tokens', (res) => {
      if (!(res && res.ok)) {
        if (status) status.textContent = (res && res.message) || 'Нет доступа';
        return;
      }
      roleTokensVisible = true;
      setRoleTokens(res.head, res.tokens.moderator, res.tokens.streamer);
      roleShowBtn.textContent = 'Скрыть токены';
      if (status) status.textContent = 'Токены показаны';
    });
    return true;
  }));
}

/* ---------- Пресеты сцены ---------- */

function presetDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function presetStatus(msg, isError) {
  const el = $('#preset-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function renderPresets(list) {
  const box = $('#preset-list');
  if (!box) return;
  box.innerHTML = '';
  if (!Array.isArray(list) || !list.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Сохранённых пресетов пока нет.';
    box.appendChild(empty);
    return;
  }

  for (const p of list) {
    const row = document.createElement('div');
    row.className = 'preset-row';

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = p.name;

    const meta = document.createElement('span');
    meta.className = 'preset-meta';
    meta.textContent = `${p.count} ист.${p.savedAt ? ' · ' + presetDate(p.savedAt) : ''}`;

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn primary small';
    apply.textContent = 'Применить';
    apply.addEventListener('click', flashOn(() => {
      if (!socket || !socket.connected) return false;
      socket.emit('presets:load', { name: p.name }, (res) => {
        if (res && res.ok) presetStatus(`Применён «${p.name}» · источников: ${res.count}`);
        else presetStatus((res && res.message) || 'Не удалось применить пресет', true);
      });
      return true;
    }));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger small';
    del.textContent = 'Удалить';
    del.addEventListener('click', flashOn(() => {
      if (!socket || !socket.connected) return false;
      socket.emit('presets:delete', { name: p.name }, (res) => {
        if (res && res.ok) {
          renderPresets(res.presets);
          presetStatus(`Пресет «${p.name}» удалён`);
        } else {
          presetStatus((res && res.message) || 'Не удалось удалить пресет', true);
        }
      });
      return true;
    }));

    row.append(name, meta, apply, del);
    box.appendChild(row);
  }
}

const presetSaveBtn = $('#preset-save');
if (presetSaveBtn) {
  presetSaveBtn.addEventListener('click', flashOn(() => {
    const name = ($('#preset-name').value || '').trim();
    if (!name || !socket || !socket.connected) return false;
    socket.emit('presets:save', { name }, (res) => {
      if (res && res.ok) {
        $('#preset-name').value = '';
        renderPresets(res.presets);
        presetStatus(`Пресет «${name}» сохранён`);
      } else {
        presetStatus((res && res.message) || 'Не удалось сохранить пресет', true);
      }
    });
    return true;
  }));
}