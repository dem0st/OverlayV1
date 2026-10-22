/* ============ Оверлей: рендер источников ============ */

if (new URLSearchParams(location.search).get('edit') === '1') {
  document.body.classList.add('edit');
}

const socket = io({ auth: { role: 'overlay' }, reconnectionDelayMax: 1000 });

const root = document.getElementById('sources');
const rendered = new Map(); // id -> { sig, el }

socket.on('config', (cfg) => {
  renderSources(Array.isArray(cfg.sources) ? cfg.sources : []);
});

socket.on('sources:reload', ({ id }) => {
  const entry = id && rendered.get(id);
  if (!entry || !entry.lastSource) return;
  entry.el.innerHTML = '';
  entry.el.appendChild(buildInner(entry.lastSource));
});

/* ============ Текстовая плашка для озвучки (по центру сверху) ============ */

const msgArea = document.createElement('div');
msgArea.id = 'message-area';
document.body.appendChild(msgArea);

let msgTimer = null;

/* ============ Озвучка (TTS) ============ */

let ttsAudio = null;
let ttsUrl = null;

function revokeTTS() {
  if (ttsUrl) {
    URL.revokeObjectURL(ttsUrl);
    ttsUrl = null;
  }
}

socket.on('tts:play', (payload = {}) => {
  const buf = payload.audio;
  if (!buf) return;

  revokeTTS();
  if (!ttsAudio) {
    ttsAudio = document.createElement('audio');
    ttsAudio.style.display = 'none';
    document.body.appendChild(ttsAudio);
  }
  ttsUrl = URL.createObjectURL(new Blob([buf]));
  ttsAudio.src = ttsUrl;
  ttsAudio.volume = Math.min(1, Math.max(0, Number(payload.volume ?? 100) / 100));
  ttsAudio.play().catch(() => {});

  if (payload.showText && payload.text) {
    showMessage({
      text: payload.text,
      style: 'announce',
      duration: payload.duration ?? 8,
    });
  }
});

socket.on('tts:stop', () => {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.removeAttribute('src');
    revokeTTS();
  }
});

function showMessage(msg) {
  if (msgTimer) clearTimeout(msgTimer);
  msgArea.textContent = msg.text || '';
  msgArea.className = 'show ' + (msg.style === 'alert' ? 'alert' : 'announce');
  msgTimer = setTimeout(() => {
    msgArea.classList.remove('show');
  }, (Number(msg.duration) || 8) * 1000);
}

function sourceSig(s) {
  return JSON.stringify([s.type, s.url, s.text, s.size, s.color, s.fit, s.volume, s.loop, s.x, s.y, s.w, s.h, s.chroma?.on, s.chroma?.threshold, s.chroma?.smooth]);
}

/* только то, из-за чего содержимое окна надо пересоздать заново;
   перемещение/размер/прозрачность сюда не входят — иначе картинка и видео
   перезагружались бы на каждом движении мыши (мигание, сброс chroma) */
function metaSig(s) {
  return JSON.stringify([s.type, s.url, s.text, s.size, s.color, s.fit, s.volume, s.loop, s.chroma?.on, s.chroma?.threshold, s.chroma?.smooth]);
}

function buildInner(s) {
  if (s.type === 'text') {
    const d = document.createElement('div');
    d.className = 'src-text';
    d.textContent = s.text || '';
    d.style.setProperty('--ts', String(Number(s.size ?? 48)));
    d.style.color = s.color || '#ffffff';
    return d;
  }

  if (s.type === 'video') {
    const v = document.createElement('video');
    v.src = s.url;
    v.autoplay = true;
    v.playsInline = true;
    v.volume = Math.min(Math.max(Number(s.volume ?? 50), 0), 100) / 100;
    v.muted = !!s.muted;
    v.playbackRate = Number(s.speed ?? 1);
    if (s.loop) v.loop = true;

    const attempt = v.play();
    if (attempt && attempt.catch) {
      attempt.catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
    }
    return v;
  }

  if (s.type === 'embed') {
    const f = document.createElement('iframe');
    f.src = s.url;
    f.allow = 'autoplay; fullscreen';
    f.allowFullscreen = true;
    f.draggable = false;
    return f;
  }

  return makeImage(s);
}

function applyChroma(img, s) {
  const ch = s.chroma;
  if (!ch || !ch.on) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  function process() {
    if (!img.complete) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    try {
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      const threshold = Number(ch.threshold ?? 0.35);
      const smooth = Number(ch.smooth ?? 0.12);

      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        // зелёный доминирует над красным и синим
        const greenness = g - Math.max(r, b);
        if (greenness > threshold * 255) {
          // плавная прозрачность вокруг порога
          const a = Math.max(0, Math.min(1, (greenness - threshold * 255) / (smooth * 255)));
          px[i + 3] = Math.round(px[i + 3] * (1 - a));
          // убрать зелёное свечение на краях
          if (a > 0 && a < 1) {
            px[i + 1] = Math.round((g * (1 - a) + Math.max(r, b) * a));
          }
        }
      }
      ctx.putImageData(data, 0, 0);
      img.src = canvas.toDataURL('image/png');
    } catch {
      // CORS или tainted canvas: показываем оригинал без chroma
    }
  }

  if (img.complete && img.naturalWidth) {
    process();
    return;
  }
  const onLoad = () => { process(); };
  const onError = () => {};
  img.addEventListener('load', onLoad, { once: true });
  img.addEventListener('error', onError, { once: true });
}

function proxyUrl(url) {
  try {
    const u = new URL(url, location.href);
    // data:/blob: отдаём как есть — прокси такие адреса не понимает
    if (u.protocol === 'data:' || u.protocol === 'blob:') return url;
    if (u.origin === location.origin) return url;
    return '/proxy?url=' + encodeURIComponent(u.href);
  } catch {
    return url;
  }
}

function makeImage(s) {
  const img = document.createElement('img');
  img.alt = '';
  if (s.fit === 'cover') img.style.objectFit = 'cover';

  const useChroma = !!(s.chroma && s.chroma.on);
  img.src = useChroma ? proxyUrl(s.url) : s.url;
  if (useChroma) applyChroma(img, s);
  return img;
}

function place(el, s) {
  el.style.left = s.x + '%';
  el.style.top = s.y + '%';
  el.style.width = s.w + '%';
  el.style.height = s.h + '%';
}

function applyTransform(s, el, inner) {
  el.style.zIndex = (Number(s.z) || 0) + 1;
  el.style.display = s.visible === false ? 'none' : '';
  el.style.opacity = String(Math.min(1, Math.max(0, Number(s.opacity ?? 100) / 100)));

  if (!inner) return;
  inner.style.transform =
    `scale(${Number(s.scale ?? 1)}) rotate(${Number(s.rotation || 0)}deg)` +
    ` scaleX(${s.flipH ? -1 : 1}) scaleY(${s.flipV ? -1 : 1})`;
  const t = Number(s.cropT || 0);
  const r = Number(s.cropR || 0);
  const b = Number(s.cropB || 0);
  const l = Number(s.cropL || 0);
  inner.style.clipPath = `inset(${t}% ${r}% ${b}% ${l}%)`;

  if (s.type === 'video' && inner.tagName === 'VIDEO') {
    inner.volume = Math.min(1, Math.max(0, Number(s.volume ?? 50) / 100));
    inner.loop = !!s.loop;
    inner.muted = !!s.muted;
    inner.playbackRate = Number(s.speed ?? 1);
    if (inner.paused) inner.play().catch(() => {});
  }
  if (s.type === 'image' && inner.tagName === 'IMG') {
    inner.style.objectFit = s.fit === 'cover' ? 'cover' : 'contain';
  }
}

function renderSources(list) {
  const seen = new Set();
  const ordered = [...list].sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));

  ordered.forEach((s) => {
    seen.add(s.id);
    const sig = sourceSig(s);
    const meta = metaSig(s);
    let entry = rendered.get(s.id);

    if (!entry) {
      const el = document.createElement('div');
      el.className = 'source-item';
      el.appendChild(buildInner(s));
      root.appendChild(el);
      entry = { sig, meta, el };
      rendered.set(s.id, entry);
      entry.el.setAttribute('data-source', s.id);
    } else if (entry.meta !== meta) {
      entry.el.innerHTML = '';
      entry.el.appendChild(buildInner(s));
      entry.sig = sig;
      entry.meta = meta;
    } else {
      // изменилась только геометрия или оформление — двигаем и красим на месте
      entry.sig = sig;
    }

    place(entry.el, s);
    applyTransform(s, entry.el, entry.el.firstElementChild);
  });

  for (const [id, entry] of rendered) {
    if (!seen.has(id)) {
      entry.el.remove();
      rendered.delete(id);
    }
  }
}
