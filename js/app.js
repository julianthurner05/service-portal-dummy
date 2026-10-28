/* ================================================================
   APP – Routing, Toasts, geteilte Helfer & Komponenten
   ================================================================ */

const navItems       = document.querySelectorAll('.nav-item');
const creationView   = document.querySelector('[data-screen="creation"]');
const calendarView   = document.querySelector('[data-screen="calendar"]');
const homeView       = document.querySelector('[data-screen="home"]');
const accountView    = document.querySelector('[data-screen="account"]');
const historyList    = document.getElementById('history-list');
const historyEmpty   = document.getElementById('history-empty');
const toastsEl       = document.getElementById('toasts');

/* ---- Icons: alle Symbole liegen im Sprite in index.html ---- */
const use = name => `<use href="#i-${name}"/>`;
const icon = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}">${use(name)}</svg>`;

const ICON_PLUS     = use('plus');
const ICON_MINUS    = use('minus');
const ICON_X        = use('x');
const ICON_INFINITY = use('infinity');
const SVG_PLAY      = use('play');
const SVG_PAUSE     = use('pause');

/* ---- Meldungen rechts oben ---- */
function showToast(type, message) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    ${icon(type === 'success' ? 'check' : 'alert')}
    <span class="toast__text"></span>
    <button class="toast__close" aria-label="Dismiss">${icon('x')}</button>`;
  toast.querySelector('.toast__text').textContent = message;
  toastsEl.appendChild(toast);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast__close').addEventListener('click', dismiss);
  setTimeout(dismiss, type === 'error' ? 9500 : 6500);
}

/* ---- Bestätigungsdialog: liefert ein Promise<boolean> ---- */
const modalEl      = document.getElementById('modal');
const modalTitle   = document.getElementById('modal-title');
const modalText    = document.getElementById('modal-text');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

function confirmDialog({ title, text, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  return new Promise(resolve => {
    modalTitle.textContent = title;
    modalText.textContent = text || '';
    modalText.hidden = !text;
    modalConfirm.textContent = confirmLabel;
    modalCancel.textContent = cancelLabel;
    modalEl.hidden = false;

    const finish = result => {
      modalEl.hidden = true;
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      modalEl.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = e => { if (e.target === modalEl) finish(false); };
    const onKey = e => { if (e.key === 'Escape') finish(false); };

    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    modalEl.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    modalConfirm.focus();
  });
}

/* ---- Dropdown-Komponente ----
   options: [{ value, label, color? }]  */
function buildDropdown(root, { options, value = null, placeholder = '', onChange = null, tall = false }) {
  root.innerHTML = `
    <button class="dropdown__toggle" type="button" aria-haspopup="listbox">
      <span class="dropdown__value"></span>
      <span class="dropdown__chevron"></span>
    </button>
    <div class="dropdown__menu${tall ? ' dropdown__menu--tall' : ''}" role="listbox" hidden></div>
  `;
  const toggle  = root.querySelector('.dropdown__toggle');
  const valueEl = root.querySelector('.dropdown__value');
  const menu    = root.querySelector('.dropdown__menu');
  let current = value;

  const dot = o => (o.color ? `<span class="dropdown__dot" style="background:${o.color}"></span>` : '');

  const render = () => {
    const opt = options.find(o => o.value === current);
    const hasRaw = !opt && current !== null && current !== undefined && current !== '';
    valueEl.classList.toggle('is-placeholder', !opt && !hasRaw);
    valueEl.innerHTML = `${opt ? dot(opt) : ''}<span></span>`;
    valueEl.querySelector('span:last-child').textContent = opt ? opt.label : (hasRaw ? String(current) : placeholder);
    menu.querySelectorAll('.dropdown__option').forEach(o =>
      o.classList.toggle('is-selected', o.dataset.value === String(current)));
  };

  options.forEach(o => {
    const el = document.createElement('button');
    el.className = 'dropdown__option';
    el.type = 'button';
    el.setAttribute('role', 'option');
    el.dataset.value = o.value;
    el.innerHTML = `${dot(o)}<span></span>`;
    el.querySelector('span:last-child').textContent = o.label;
    el.addEventListener('click', e => {
      e.stopPropagation();
      const changed = current !== o.value;
      current = o.value;
      render();
      close();
      if (changed && onChange) onChange(current);
    });
    menu.appendChild(el);
  });

  /* Tastatur: Pfeile bewegen, Enter wählt, Escape schließt */
  const setFocus = el => {
    menu.querySelectorAll('.is-focus').forEach(o => o.classList.remove('is-focus'));
    if (el) { el.classList.add('is-focus'); el.scrollIntoView({ block: 'nearest' }); }
  };

  const open = () => {
    closeAllMenus();
    root.classList.add('is-open');
    menu.hidden = false;
    const sel = menu.querySelector('.is-selected');
    if (sel) {
      menu.scrollTop = sel.offsetTop - menu.clientHeight / 2 + sel.clientHeight / 2;
      setFocus(sel);
    }
  };
  const close = () => { root.classList.remove('is-open'); menu.hidden = true; };

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });

  root.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('.dropdown__option')];
    const idx = items.findIndex(o => o.classList.contains('is-focus'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (menu.hidden) { open(); return; }
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
      setFocus(items[next]);
    } else if (e.key === 'Enter' && !menu.hidden) {
      e.preventDefault();
      (items[idx] || items[0])?.click();
      toggle.focus();
    } else if (e.key === 'Escape' && !menu.hidden) {
      e.stopPropagation();
      close();
      toggle.focus();
    }
  });

  render();
  return {
    get value() { return current; },
    set value(v) { current = v; render(); },
    lock(state) { root.classList.toggle('is-locked', state); },
    /* Optionen markieren: fn(value) → null | 'taken' | 'quiet' | 'closed' */
    mark(fn) {
      menu.querySelectorAll('.dropdown__option').forEach(el => {
        const state = fn(el.dataset.value);
        el.classList.toggle('is-taken', !!state);
        el.dataset.state = state || '';
      });
    },
  };
}

/* ---- Player-Komponente ----
   Ein Dummy-Player für Karten, Vorschau, Home und Spot-Auswahl.
   Es läuft immer nur ein Player gleichzeitig – ein Start stoppt den vorigen.
   resetOnStop: Pause springt auf 0 zurück (Spot-Auswahl) statt zu pausieren. */
let activePlayer = null;

function createPlayer({ playBtn, slider, timeEl = null, duration = 9, resetOnStop = false }) {
  const fill  = slider.querySelector('.slider__progress');
  const thumb = slider.querySelector('.slider__thumb');
  const svg   = playBtn.querySelector('svg');
  const st = { duration, progress: 0, playing: false, rafId: null };

  const render = () => {
    const pct = (st.progress * 100).toFixed(2) + '%';
    fill.style.width = pct;
    thumb.style.left = pct;
    if (timeEl) timeEl.textContent = formatTime(st.playing ? st.progress * st.duration : st.duration);
  };

  const stop = () => {
    st.playing = false;
    if (st.rafId) cancelAnimationFrame(st.rafId);
    st.rafId = null;
    if (resetOnStop) st.progress = 0;
    svg.innerHTML = SVG_PLAY;
    playBtn.setAttribute('aria-label', 'Play');
    if (activePlayer === api) activePlayer = null;
    render();
  };

  const start = () => {
    if (activePlayer && activePlayer !== api) activePlayer.stop();
    activePlayer = api;
    st.playing = true;
    svg.innerHTML = SVG_PAUSE;
    playBtn.setAttribute('aria-label', 'Pause');
    if (st.progress >= 1) st.progress = 0;
    let last = performance.now();
    const step = now => {
      st.progress += (now - last) / 1000 / st.duration;
      last = now;
      if (st.progress >= 1) { st.progress = 0; stop(); return; }
      render();
      st.rafId = requestAnimationFrame(step);
    };
    st.rafId = requestAnimationFrame(step);
  };

  const seek = e => {
    const rect = slider.getBoundingClientRect();
    st.progress = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    render();
  };

  playBtn.addEventListener('click', () => (st.playing ? stop() : start()));
  slider.addEventListener('pointerdown', e => { slider.setPointerCapture(e.pointerId); seek(e); });
  slider.addEventListener('pointermove', e => { if (slider.hasPointerCapture(e.pointerId)) seek(e); });

  const api = {
    el: playBtn,
    stop,
    get playing() { return st.playing; },
    /* neue Länge setzen und auf Anfang */
    load(d) { st.duration = d; st.progress = 0; stop(); },
  };
  render();
  return api;
}

/* ---- View-Routing ----
   SpotTool (Spots erstellen) und Calendar (Spots einplanen) – die
   Creation History rechts gehört nur zum SpotTool */
function showView(view) {
  navItems.forEach(n => n.classList.toggle('is-active', n.dataset.view === view));

  const isCreation = view === 'spot-creation';
  const isCalendar = view === 'calendar';
  const isHome     = view === 'home';

  creationView.hidden = !isCreation;
  calendarView.hidden = !isCalendar;
  accountView.hidden = view !== 'account';
  homeView.hidden = !isHome;
  if (isCalendar) renderCalendar();
  if (isHome) renderHome();
  document.body.classList.toggle('no-history', !isCreation);

  historyEmpty.hidden = true;
  applySearch();
}

navItems.forEach(item => {
  item.addEventListener('click', () => showView(item.dataset.view));
});

/* ---- Mobile-Drawer ---- */
const sidebarEl       = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

function setDrawer(open) {
  sidebarEl.classList.toggle('is-open', open);
  sidebarBackdrop.classList.toggle('is-open', open);
}

document.getElementById('mobile-menu').addEventListener('click', () => setDrawer(true));
sidebarBackdrop.addEventListener('click', () => setDrawer(false));
navItems.forEach(item => item.addEventListener('click', () => setDrawer(false)));

/* ---- Impressum / Datenschutz / Lizenzen ---- */
const legalBox = document.getElementById('legal');
const LEGAL_TITLES = { imprint: 'Imprint', privacy: 'Privacy Policy', licenses: 'Open Source Licenses' };

function openLegal(doc) {
  document.getElementById('legal-title').textContent = LEGAL_TITLES[doc];
  legalBox.querySelectorAll('.legal-doc').forEach(d => { d.hidden = d.dataset.doc !== doc; });
  legalBox.querySelector('.legal-body').scrollTop = 0;
  legalBox.hidden = false;
}

document.addEventListener('click', e => {
  const link = e.target.closest('.legal-link');
  if (link) openLegal(link.dataset.legal);
});
document.getElementById('legal-close').addEventListener('click', () => { legalBox.hidden = true; });
legalBox.addEventListener('click', e => { if (e.target === legalBox) legalBox.hidden = true; });

/* ---- Menüs & Dropdowns global schließen ---- */
function closeAllMenus() {
  document.querySelectorAll('.context-menu').forEach(m => (m.hidden = true));
  document.querySelectorAll('.kebab').forEach(k => k.classList.remove('is-open'));
  document.querySelectorAll('.dropdown.is-open').forEach(d => d.classList.remove('is-open'));
  document.querySelectorAll('.dropdown__menu').forEach(m => (m.hidden = true));
  document.querySelectorAll('.datepicker').forEach(p => p.remove());
}

document.addEventListener('click', e => {
  if (!e.target.closest('.card__menu-wrap') && !e.target.closest('.dropdown') && !e.target.closest('.field--date')) closeAllMenus();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAllMenus(); setDrawer(false); }
});

/* ---- Collapse: Overflow erst nach dem Aufklappen freigeben ----
   Die Fallback-Dauer wird aus der tatsächlichen Transition (Dauer + Delay)
   gelesen, damit gestaffelte oder langsamere Collapses (Scheduler: 600 ms
   + Delay) nicht vorzeitig "aufgeschnitten" werden. */
function transitionSpan(el) {
  const cs = getComputedStyle(el);
  const toMs = s => s.split(',').map(v => parseFloat(v) * 1000 || 0);
  const dur = toMs(cs.transitionDuration);
  const del = toMs(cs.transitionDelay);
  return Math.max(...dur.map((d, i) => d + (del[i] ?? del[0])));
}

function setCollapse(el, open) {
  if (!open) {
    el.classList.remove('is-settled');
    el.classList.remove('is-open');
    return;
  }
  if (el.classList.contains('is-open')) { el.classList.add('is-settled'); return; }
  el.classList.add('is-open');
  const settle = e => {
    if (e && e.target !== el) return;
    if (el.classList.contains('is-open')) el.classList.add('is-settled');
    el.removeEventListener('transitionend', settle);
  };
  el.addEventListener('transitionend', settle);
  setTimeout(settle, transitionSpan(el) + 60);   /* Fallback, falls kein transitionend kommt */
}

/* ---- Entwurfspunkt am Menüpunkt ---- */
function setDraftDot(view, on) {
  const item = [...navItems].find(n => n.dataset.view === view);
  if (item) item.classList.toggle('has-draft', on);
}

/* ---- ⌘K / Ctrl+K: Suche in der Creation History ---- */
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
  e.preventDefault();
  const search = document.getElementById('history-search');
  if (search && !document.body.classList.contains('no-history')) { search.focus(); search.select(); }
});

/* ---- Helfer ---- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const pad2 = n => String(n).padStart(2, '0');

/* Sekunden → mm:ss */
function formatTime(sec) {
  return `${pad2(Math.floor(sec / 60))}:${pad2(Math.floor(sec % 60))}`;
}

/* Länge eines Slots im Raster (Kalender, Konfliktprüfung, Zeit-Dropdowns) */
const SLOT_MIN = 15;

/* Minuten seit Mitternacht ↔ "HH:MM" */
const hhmm = mins => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const minutesOf = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/* Uhrzeit eines Date als "HH:MM" */
const clockOf = d => hhmm(d.getHours() * 60 + d.getMinutes());
const nowLabel = () => `Today, ${clockOf(new Date())}`;

/* Datum ↔ "dd.mm.yyyy" */
const fmtDate = d => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const todayLabel = () => fmtDate(new Date());

function parseDate(str) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str || '');
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date();
}

/* Wochentag mit Montag = 0 */
const dayIdx = date => (date.getDay() + 6) % 7;

function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - dayIdx(m));
  return m;
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 84) + 'px';
}
