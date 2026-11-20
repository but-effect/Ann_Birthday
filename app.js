'use strict';

const byId = (id) => document.getElementById(id);
const album = byId('album');
const chapter = byId('chapter');
const rail = byId('rail');
const dots = byId('dots');
const music = byId('music');
const viewer = byId('viewer');
const stage = byId('stage');
const previous = byId('previous');
const next = byId('next');
const mute = byId('mute');
const prevMedia = byId('prev-media');
const nextMedia = byId('next-media');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let active = 0;
let openIndex = -1;
let mediaIndex = 0;
let viewerItems = [];
let muted = false;
let lastThumb;
let poemAudio;
let playingVideo;
let displayedImage;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let gesture;
let lastTap;
const pointers = new Map();

try { muted = localStorage.getItem('album-muted') === 'true'; } catch {}

function tile(src) {
  const frame = document.createElement('span');
  frame.className = 'tile';
  if (!src) return frame;
  const image = new Image();
  image.src = src;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  frame.style.setProperty('--matte', 'url("' + new URL(src, document.baseURI).href.replaceAll('"', '%22') + '")');
  frame.append(image);
  return frame;
}

const cards = story.months.map((month, index) => {
  const card = document.createElement('button');
  card.className = 'card';
  card.type = 'button';
  card.innerHTML = '<span class="collage"></span><span class="card-bottom"><span><span class="card-name"></span><span class="card-year"></span></span><span class="open-mark" aria-hidden="true"></span></span>';
  card.querySelector('.card-name').textContent = month.name;
  card.querySelector('.card-year').textContent = month.year;
  const photos = (month.cover?.length ? month.cover : month.gallery.map((item) => item.type === 'video' ? item.poster : item.thumb ?? item.src).filter(Boolean)).slice(0, 3);
  const collage = card.querySelector('.collage');
  collage.dataset.count = photos.length || 1;
  if (photos.length) {
    collage.append(...photos.map(tile));
  } else {
    collage.classList.add('letter-cover');
    collage.innerHTML = '<span aria-hidden="true">♡</span>';
  }
  card.addEventListener('click', () => {
    if (active === index) {
      location.hash = 'month-' + (index + 1);
      openMonth(index);
    } else {
      center(index);
    }
  });
  rail.append(card);
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'dot';
  dot.setAttribute('aria-label', month.name + ' ' + month.year);
  dot.addEventListener('click', () => center(index));
  dots.append(dot);
  return card;
});

function mark(index) {
  if (index < 0 || index >= cards.length) return;
  active = index;
  for (const [i, card] of cards.entries()) {
    card.setAttribute('aria-current', String(i === index));
    dots.children[i].setAttribute('aria-current', String(i === index));
  }
  byId('position').textContent = String(index + 1).padStart(2, '0') + ' / ' + cards.length;
  previous.disabled = index === 0;
  next.disabled = index === cards.length - 1;
}

function center(index, instant = false) {
  const card = cards[index];
  if (!card || album.hidden) return;
  const left = rail.scrollLeft + card.getBoundingClientRect().left + card.clientWidth / 2 - rail.getBoundingClientRect().left - rail.clientWidth / 2;
  rail.scrollTo({ left, behavior: instant || reducedMotion.matches ? 'instant' : 'smooth' });
  if (instant) mark(index);
}

let scrollFrame;
rail.addEventListener('scroll', () => {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    if (album.hidden) return;
    const middle = rail.getBoundingClientRect().left + rail.clientWidth / 2;
    let nearest = 0;
    let shortest = Infinity;
    for (const [index, card] of cards.entries()) {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - middle);
      if (distance < shortest) {
        shortest = distance;
        nearest = index;
      }
    }
    if (active !== nearest) mark(nearest);
  });
}, { passive: true });

previous.addEventListener('click', () => center(active - 1));
next.addEventListener('click', () => center(active + 1));
rail.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const index = active + (event.key === 'ArrowRight' ? 1 : -1);
  center(index);
  cards[index]?.focus({ preventScroll: true });
});
window.addEventListener('resize', () => center(active, true));

function syncMute() {
  music.muted = muted;
  mute.setAttribute('aria-pressed', String(muted));
  mute.setAttribute('aria-label', muted ? 'Включить музыку' : 'Выключить музыку');
  mute.textContent = muted ? 'UNMUTE' : 'MUTE';
}

function playMusic() {
  if (muted || playingVideo || poemAudio && !poemAudio.paused || !story.months[openIndex]?.track) return;
  const track = music.src;
  music.play().catch((error) => {
    if (error.name !== 'NotAllowedError' || track !== music.src || openIndex < 0 || muted) return;
    mute.textContent = 'PLAY';
    mute.setAttribute('aria-label', 'Включить музыку');
  });
}

music.addEventListener('playing', syncMute);

mute.addEventListener('click', () => {
  muted = mute.textContent === 'PLAY' ? false : !muted;
  try { localStorage.setItem('album-muted', String(muted)); } catch {}
  syncMute();
  playMusic();
});

function openMonth(index) {
  if (!story.months[index] || openIndex === index) return;
  if (viewer.open) viewer.close();
  stopPoem();
  if (openIndex < 0) mark(index);
  const month = story.months[index];
  openIndex = index;
  album.hidden = true;
  chapter.hidden = false;
  byId('month-title').textContent = month.name;
  byId('chapter-date').textContent = month.year;
  byId('chapter-motif').textContent = month.motif;
  chapter.dataset.palette = month.palette;
  const keepsake = byId('chapter-keepsake');
  keepsake.replaceChildren();
  keepsake.classList.toggle('sealed-letter', !month.chapterImage);
  if (month.chapterImage) {
    keepsake.append(tile(month.chapterImage));
  } else {
    const seal = document.createElement('span');
    seal.textContent = 'А';
    keepsake.append(seal);
  }
  const letter = byId('letter');
  letter.replaceChildren(...(month.text || '').split(/\n{2,}/).filter(Boolean).map((paragraph) => {
    const text = document.createElement('p');
    text.textContent = paragraph;
    return text;
  }));
  letter.hidden = !month.text;
  renderEggs(month.eggs);
  mute.hidden = !month.track;
  music.pause();
  if (month.track) {
    music.src = month.track;
  } else {
    music.removeAttribute('src');
    music.load();
  }
  syncMute();
  playMusic();
  renderGallery(byId('gallery'), month.gallery);
  byId('bonus-panel').open = false;
  renderGallery(byId('bonus-gallery'), month.bonus ?? []);
  window.scrollTo(0, 0);
  byId('month-title').focus({ preventScroll: true });
}

function openViewer(items, index, button) {
  lastThumb = button;
  viewerItems = items;
  viewer.showModal();
  showMedia(index, true);
  byId('close-viewer').focus();
}

function renderGallery(gallery, items) {
  gallery.replaceChildren();
  gallery.parentElement.hidden = !items.length;
  for (const [index, item] of items.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    const rowPosition = index % 5;
    const lastUnpaired = index === items.length - 1 && (rowPosition === 1 || rowPosition === 3);
    button.classList.toggle('feature', rowPosition === 0 || lastUnpaired);
    const video = item.type === 'video';
    button.setAttribute('aria-label', (video ? 'Видео ' : 'Фото ') + (index + 1) + (item.caption ? '. ' + item.caption : ''));
    button.append(tile(video ? item.poster : item.thumb ?? item.src));
    if (video) {
      const label = document.createElement('span');
      label.className = 'video-tag';
      label.textContent = '▶ Видео';
      button.append(label);
    }
    button.addEventListener('click', () => openViewer(items, index, button));
    gallery.append(button);
  }
}

function renderEggs(eggs) {
  const section = byId('easter-eggs');
  section.replaceChildren();
  section.hidden = !eggs.length;
  for (const egg of eggs) {
    const details = document.createElement('details');
    details.className = 'easter-egg ' + egg.kind;
    const summary = document.createElement('summary');
    const mark = document.createElement('span');
    mark.className = 'egg-mark';
    mark.setAttribute('aria-hidden', 'true');
    const symbols = { poem: '♪', paper: '✧', winter: '❄', rose: '❀', palette: '◒', lake: '≈', lagoon: '≈', mango: '◉', night: '★', number: '22' };
    mark.textContent = symbols[egg.kind];
    const title = document.createElement('span');
    title.textContent = egg.title;
    const action = document.createElement('span');
    action.className = 'open-label';
    action.textContent = 'Открыть';
    summary.append(mark, title, action);
    details.addEventListener('toggle', () => { action.textContent = details.open ? 'Свернуть' : 'Открыть'; });
    const body = document.createElement('div');
    body.className = 'egg-body';
    if (egg.text) {
      const text = document.createElement('p');
      text.textContent = egg.text;
      body.append(text);
    }
    if (egg.audio) {
      const { card, audio } = createPoemPlayer(egg.audio, egg.title);
      body.append(card);
      details.addEventListener('toggle', () => {
        if (!details.open) audio.pause();
      });
    }
    if (egg.swatches) {
      const swatches = document.createElement('div');
      swatches.className = 'egg-swatches';
      swatches.setAttribute('aria-hidden', 'true');
      for (const color of egg.swatches) {
        const sample = document.createElement('span');
        sample.style.backgroundColor = color;
        swatches.append(sample);
      }
      body.prepend(swatches);
    }
    if (egg.item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'egg-photo';
      button.setAttribute('aria-label', 'Увеличить: ' + egg.item.caption);
      button.append(tile(egg.item.thumb ?? egg.item.src));
      button.addEventListener('click', () => openViewer([egg.item], 0, button));
      body.prepend(button);
    }
    details.append(summary, body);
    section.append(details);
  }
}

function stopPoem() {
  const previous = poemAudio;
  poemAudio = null;
  previous?.pause();
}

function createPoemPlayer(file, title) {
  const card = document.createElement('div');
  card.className = 'poem-player';
  card.innerHTML = `
    <div class="poem-controls">
      <button type="button" class="poem-play" aria-label="Воспроизвести">▶</button>
      <div class="poem-timeline">
        <input type="range" min="0" max="0" value="0" step="0.1" aria-label="Позиция записи" disabled>
        <span class="poem-time">0:00</span>
      </div>
      <button type="button" class="poem-mute" aria-label="Выключить звук записи" aria-pressed="false">MUTE</button>
    </div>
    <div class="poem-download"></div>
    <p class="poem-error" role="status" hidden></p>`;
  card.setAttribute('aria-label', title);
  const audio = new Audio();
  audio.preload = 'none';
  audio.src = file.src;
  card.append(audio);
  const play = card.querySelector('.poem-play');
  const seek = card.querySelector('input');
  const time = card.querySelector('.poem-time');
  const toggleMute = card.querySelector('.poem-mute');
  const error = card.querySelector('.poem-error');
  renderDownload(card.querySelector('.poem-download'), file);
  const clock = (seconds) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  function updateTime() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.max = duration;
    seek.disabled = !duration;
    seek.value = audio.currentTime;
    time.textContent = clock(audio.currentTime) + (duration ? ' / ' + clock(duration) : '');
  }
  function updatePlay() {
    play.textContent = audio.paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', audio.paused ? 'Воспроизвести' : 'Пауза');
  }
  play.addEventListener('click', () => {
    if (!audio.paused) {
      audio.pause();
      playMusic();
      return;
    }
    if (poemAudio !== audio) {
      stopPoem();
      poemAudio = audio;
    }
    error.hidden = true;
    music.pause();
    audio.play().catch((failure) => {
      if (failure.name === 'AbortError' || poemAudio !== audio) return;
      error.textContent = 'Не удалось включить запись. Попробуй ещё раз.';
      error.hidden = false;
      playMusic();
    });
  });
  audio.addEventListener('play', () => {
    if (poemAudio === audio) music.pause();
    else audio.pause();
    updatePlay();
  });
  for (const event of ['pause', 'ended']) {
    audio.addEventListener(event, () => {
      updatePlay();
      if (poemAudio === audio) playMusic();
    });
  }
  for (const event of ['loadedmetadata', 'timeupdate']) audio.addEventListener(event, updateTime);
  seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); });
  toggleMute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    toggleMute.textContent = audio.muted ? 'UNMUTE' : 'MUTE';
    toggleMute.setAttribute('aria-pressed', String(audio.muted));
    toggleMute.setAttribute('aria-label', audio.muted ? 'Включить звук записи' : 'Выключить звук записи');
  });
  return { card, audio };
}

function renderDownload(root, item) {
  const name = item.name ?? item.src.split('/').at(-1);
  const anchor = document.createElement('a');
  anchor.className = 'save-file';
  anchor.href = location.protocol === 'file:' ? item.src : item.src + '?download=1';
  anchor.download = name;
  anchor.textContent = 'Скачать';
  const status = document.createElement('span');
  status.className = 'download-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  const report = (message) => {
    status.textContent = message;
    status.hidden = false;
  };
  anchor.addEventListener('click', () => {
    report('Проверь папку «Загрузки».');
  });
  root.replaceChildren(anchor, status);
  if (!navigator.share || !navigator.canShare) return;
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'share-file';
  share.textContent = 'В Файлы…';
  root.insertBefore(share, status);
  let file;
  share.addEventListener('click', async () => {
    if (file) {
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        if (error.name !== 'AbortError') report('Воспользуйся кнопкой «Скачать».');
      }
      return;
    }
    share.disabled = true;
    report('Готовлю файл…');
    try {
      const response = await fetch(item.src);
      if (!response.ok) throw new Error('download');
      const blob = await response.blob();
      const candidate = new File([blob], name, { type: blob.type });
      if (!navigator.canShare({ files: [candidate] })) throw new Error('share');
      file = candidate;
      share.textContent = 'Поделиться…';
      report('Нажми «Поделиться…» и выбери «Сохранить в Файлы».');
    } catch {
      report('Воспользуйся кнопкой «Скачать».');
    } finally {
      share.disabled = false;
    }
  });
}

function showAlbum() {
  if (openIndex < 0) return;
  if (viewer.open) viewer.close();
  const index = openIndex;
  openIndex = -1;
  stopPoem();
  music.pause();
  music.removeAttribute('src');
  music.load();
  chapter.hidden = true;
  album.hidden = false;
  center(index, true);
  byId('chapter-heading').scrollIntoView({ block: 'start' });
  cards[index].focus({ preventScroll: true });
}

function route() {
  const match = /^#month-(\d+)$/.exec(location.hash);
  if (match && story.months[Number(match[1]) - 1]) {
    openMonth(Number(match[1]) - 1);
  } else {
    showAlbum();
  }
}

function returnToMonths() {
  history.replaceState(null, '', location.pathname + location.search);
  showAlbum();
}
byId('back').addEventListener('click', returnToMonths);
byId('back-end').addEventListener('click', returnToMonths);
byId('bonus-panel').addEventListener('toggle', (event) => {
  const panel = event.currentTarget;
  panel.querySelector('.open-label').textContent = panel.open ? 'Свернуть' : 'Открыть';
});
window.addEventListener('hashchange', route);

function fullscreen(video) {
  if (typeof video.webkitEnterFullscreen === 'function') {
    if (video.webkitDisplayingFullscreen) return;
    try { video.webkitEnterFullscreen(); return; } catch {}
  }
  video.requestFullscreen?.().catch(() => {});
}

function showMedia(index, direct = false) {
  const item = viewerItems[index];
  if (!item) return;
  mediaIndex = index;
  playingVideo?.pause();
  playingVideo = null;
  stage.replaceChildren();
  stage.classList.toggle('video-stage', item.type === 'video');
  byId('media-count').textContent = (index + 1) + ' / ' + viewerItems.length;
  const caption = byId('caption');
  caption.textContent = item.caption || '';
  caption.hidden = !item.caption;
  renderDownload(byId('viewer-download'), item);
  displayedImage = null;
  pointers.clear();
  gesture = null;
  lastTap = null;
  setZoom(1);
  byId('zoom-controls').hidden = item.type === 'video';
  prevMedia.disabled = index === 0;
  nextMedia.disabled = index === viewerItems.length - 1;
  if (item.type === 'video') {
    const video = document.createElement('video');
    playingVideo = video;
    poemAudio?.pause();
    music.pause();
    video.controls = true;
    video.playsInline = true;
    video.src = item.src;
    if (item.poster) video.poster = item.poster;
    const tools = document.createElement('div');
    tools.className = 'stage-tools';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'На весь экран';
    button.addEventListener('click', () => fullscreen(video));
    tools.append(button);
    stage.append(video, tools);
    if (direct) {
      if (typeof video.webkitEnterFullscreen === 'function') video.playsInline = false;
      video.play().catch(() => {});
      fullscreen(video);
    }
  } else {
    showPhoto(item, index);
    playMusic();
  }
}

byId('close-viewer').addEventListener('click', () => viewer.close());
prevMedia.addEventListener('click', () => showMedia(mediaIndex - 1, true));
nextMedia.addEventListener('click', () => showMedia(mediaIndex + 1, true));
viewer.addEventListener('close', () => {
  playingVideo?.pause();
  playingVideo = null;
  stage.replaceChildren();
  displayedImage = null;
  pointers.clear();
  gesture = null;
  viewerItems = [];
  playMusic();
  if (!chapter.hidden) lastThumb?.focus({ preventScroll: true });
});
viewer.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'VIDEO') return;
  if (event.key === 'ArrowRight') showMedia(mediaIndex + 1);
  if (event.key === 'ArrowLeft') showMedia(mediaIndex - 1);
});
function showPhoto(item, index) {
  const image = new Image();
  image.alt = item.caption || 'Фотография';
  image.draggable = false;
  image.src = item.thumb ?? item.src;
  stage.append(image);
  displayedImage = image;
  if (!item.thumb || item.thumb === item.src) return;
  const original = new Image();
  original.src = item.src;
  original.decode().then(() => {
    if (displayedImage !== image || !viewer.open) return;
    original.alt = image.alt;
    original.draggable = false;
    image.replaceWith(original);
    displayedImage = original;
    updateZoom();
    for (const neighbor of [viewerItems[index - 1], viewerItems[index + 1]]) {
      if (neighbor?.type !== 'photo') continue;
      const preload = new Image();
      preload.fetchPriority = 'low';
      preload.src = neighbor.src;
    }
  }).catch(() => {});
}

function updateZoom() {
  if (displayedImage) {
    const { clientWidth: w, clientHeight: h } = stage;
    const aspect = displayedImage.naturalWidth / displayedImage.naturalHeight || w / h || 1;
    const width = Math.min(w, h * aspect);
    const height = Math.min(h, w / aspect);
    const maxX = Math.max(0, (width * scale - w) / 2);
    const maxY = Math.max(0, (height * scale - h) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
    offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    displayedImage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  byId('zoom-out').disabled = scale <= 1;
  byId('zoom-in').disabled = scale >= 5;
  stage.classList.toggle('zoomed', scale > 1);
}

function setZoom(value, x = 0, y = 0) {
  const nextScale = Math.max(1, Math.min(5, value));
  const ratio = nextScale / scale;
  offsetX = ratio * offsetX + (1 - ratio) * x;
  offsetY = ratio * offsetY + (1 - ratio) * y;
  scale = nextScale;
  updateZoom();
}

function pointerPoint(event) {
  const box = stage.getBoundingClientRect();
  return { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
}

function pinchGeometry() {
  const [a, b] = pointers.values();
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

byId('zoom-in').addEventListener('click', () => setZoom(scale * 1.5));
byId('zoom-out').addEventListener('click', () => setZoom(scale / 1.5));
window.addEventListener('resize', updateZoom);

stage.addEventListener('pointerdown', (event) => {
  if (!displayedImage || event.button !== 0 || pointers.size === 2) return;
  const point = pointerPoint(event);
  stage.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, point);
  if (pointers.size === 1) {
    gesture = { start: point, interrupted: false };
  } else {
    if (gesture) gesture.interrupted = true;
    lastTap = null;
  }
});

stage.addEventListener('pointermove', (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const before = pointers.size === 2 ? pinchGeometry() : null;
  const point = pointerPoint(event);
  pointers.set(event.pointerId, point);
  if (before) {
    const after = pinchGeometry();
    setZoom(scale * after.distance / before.distance, before.x, before.y);
    offsetX += after.x - before.x;
    offsetY += after.y - before.y;
    updateZoom();
  } else if (scale > 1) {
    offsetX += point.x - previous.x;
    offsetY += point.y - previous.y;
    updateZoom();
  }
});

stage.addEventListener('pointercancel', (event) => {
  pointers.delete(event.pointerId);
  gesture = null;
  lastTap = null;
});

stage.addEventListener('pointerup', (event) => {
  if (!pointers.delete(event.pointerId) || pointers.size || !gesture) return;
  const { start, interrupted } = gesture;
  gesture = null;
  if (interrupted) return;
  const point = pointerPoint(event);
  const deltaX = point.x - start.x;
  const deltaY = point.y - start.y;
  if (scale === 1 && Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    showMedia(mediaIndex + (deltaX < 0 ? 1 : -1));
    return;
  }
  if (Math.hypot(deltaX, deltaY) > 12) {
    lastTap = null;
    return;
  }
  const now = performance.now();
  if (lastTap && now - lastTap.time < 320 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 30) {
    setZoom(scale > 1 ? 1 : 2.5, point.x, point.y);
    lastTap = null;
  } else {
    lastTap = { ...point, time: now };
  }
});

mark(0);
route();
