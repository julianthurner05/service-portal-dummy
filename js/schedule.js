/* ================================================================
   SCHEDULER – Formular, Datepicker, Kategorien, History, Editmodus
   ================================================================ */

const schedEditor      = document.getElementById('sched-editor');
const schedEditorHead  = document.getElementById('sched-editor-head');
const schedEditorClose = document.getElementById('sched-editor-close');
const schedTitle   = document.getElementById('sched-title');
const schedForm    = document.getElementById('sched-form');
const startBtn     = document.getElementById('start-btn');
const startValue   = document.getElementById('start-value');
const startField   = document.getElementById('start-field');
const endBtn       = document.getElementById('end-btn');
const endValue     = document.getElementById('end-value');
const endField     = document.getElementById('end-field');
const endAux       = document.getElementById('end-aux');
const endAuxIcon   = document.getElementById('end-aux-icon');
const weekdaysReveal = document.getElementById('weekdays-reveal');
const typeSegment  = document.getElementById('type-segment');
const timeSegment  = document.getElementById('time-segment');
const dayChips     = document.getElementById('day-chips');
const scheduleBtn  = document.getElementById('schedule-btn');
const scheduleBtnLabel = document.getElementById('schedule-btn-label');
const cancelEditBtn = document.getElementById('cancel-edit');
const previewEmpty  = document.getElementById('preview-empty');
const previewPlayer = document.getElementById('preview-player');
const schedSummary  = document.getElementById('sched-summary');
const conflictWrap = document.getElementById('conflict-wrap');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Kategorien = Farben der Karten */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const CATEGORIES = [
  { value: 'food',      label: 'Food',      color: 'var(--cat-food)' },
  { value: 'marketing', label: 'Marketing', color: 'var(--cat-marketing)' },
  { value: 'special',   label: 'Special',   color: 'var(--cat-special)' },
  { value: 'closing',   label: 'Closing',   color: 'var(--cat-closing)' },
];
const catOf    = id => CATEGORIES.find(c => c.value === id) || {};
const catColor = id => catOf(id).color || 'transparent';
const catLabel = id => catOf(id).label || '';

/* Kategorie-Variablen (Food bekommt mehr Farbanteil) – als Style-String
   für Templates oder direkt auf ein Element geschrieben */
const CAT_VARS = ['--cat', '--cat-tint', '--cat-tint-strong'];
function catVars(id) {
  const v = { '--cat': catColor(id), '--cat-tint': '', '--cat-tint-strong': '' };
  if (id === 'food') { v['--cat-tint'] = 'var(--cat-tint-food)'; v['--cat-tint-strong'] = 'var(--cat-tint-food-strong)'; }
  return v;
}
const catStyle = id => Object.entries(catVars(id)).filter(([, v]) => v).map(([k, v]) => `${k}:${v};`).join('');
function applyCat(el, id) {
  const v = catVars(id);
  CAT_VARS.forEach(k => el.style.setProperty(k, v[k]));
}

/* ---------------------------------------------------------------
   Datepicker – Popover im Tool-Design
   --------------------------------------------------------------- */
function openDatepicker(field, { value, onSelect, allowInfinite = false, onInfinite = null }) {
  closeAllMenus();
  const selected = parseDate(value);
  let viewYear = selected.getFullYear();
  let viewMonth = selected.getMonth();
  const today = fmtDate(new Date());

  const pop = document.createElement('div');
  pop.className = 'datepicker';
  field.appendChild(pop);

  const render = () => {
    const offset = dayIdx(new Date(viewYear, viewMonth, 1));       /* Montag zuerst */
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const date = new Date(viewYear, viewMonth, i - offset + 1);   /* Date rollt Monatsgrenzen selbst über */
      const label = fmtDate(date);
      const muted = date.getMonth() !== viewMonth;
      cells += `<button class="datepicker__day${muted ? ' is-muted' : ''}${label === value ? ' is-selected' : ''}${label === today ? ' is-today' : ''}" data-date="${label}" type="button">${date.getDate()}</button>`;
    }

    pop.innerHTML = `
      <div class="datepicker__head">
        <button class="datepicker__nav" data-nav="-1" type="button">${icon('chevron-left')}</button>
        <span class="datepicker__month">${MONTHS[viewMonth]} ${viewYear}</span>
        <button class="datepicker__nav" data-nav="1" type="button">${icon('chevron-right')}</button>
      </div>
      <div class="datepicker__grid">
        ${DAYS.map(d => `<span class="datepicker__dow">${d}</span>`).join('')}
        ${cells}
      </div>
      ${allowInfinite ? `<div class="datepicker__foot"><button class="datepicker__infinite" type="button">${icon('infinity')}Set to infinite</button></div>` : ''}
    `;
  };

  pop.addEventListener('click', e => {
    e.stopPropagation();
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      viewMonth += parseInt(nav.dataset.nav, 10);
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
      return;
    }
    const day = e.target.closest('[data-date]');
    if (day) { onSelect(day.dataset.date); pop.remove(); return; }
    if (e.target.closest('.datepicker__infinite')) { onInfinite && onInfinite(); pop.remove(); }
  });

  render();
}

/* ---------------------------------------------------------------
   Start / End
   --------------------------------------------------------------- */
let startDate = todayLabel();
let endDate = null;                     /* null = infinite · '' = nicht gesetzt · 'dd.mm.yyyy' */

function renderDates() {
  startValue.textContent = startDate;
  const infinite = endDate === null;
  endValue.textContent = infinite ? 'infinite' : (endDate || 'Select end date');
  endValue.classList.toggle('is-placeholder', endDate === '');
  endAuxIcon.innerHTML = infinite ? ICON_X : ICON_INFINITY;
  endAux.setAttribute('aria-label', infinite ? 'Remove infinite' : 'Set to infinite');
  endAux.dataset.tip = infinite ? 'Remove' : 'Infinite';
}

startBtn.addEventListener('click', e => {
  e.stopPropagation();
  openDatepicker(startField, { value: startDate, onSelect: d => { startDate = d; renderDates(); scheduleChanged(); } });
});

endBtn.addEventListener('click', e => {
  e.stopPropagation();
  openDatepicker(endField, {
    value: endDate || startDate,
    allowInfinite: true,
    onSelect: d => { endDate = d; renderDates(); scheduleChanged(); },
    onInfinite: () => { endDate = null; renderDates(); scheduleChanged(); },
  });
});

/* X entfernt infinite (Feld wird leer), ∞ setzt es wieder */
endAux.addEventListener('click', e => {
  e.stopPropagation();
  closeAllMenus();
  endDate = endDate === null ? '' : null;
  renderDates();
  scheduleChanged();
});

renderDates();

/* ---------------------------------------------------------------
   Dropdowns: Zeit, Kategorie, Filter
   --------------------------------------------------------------- */
const timeOptions = [];
for (let m = 6 * 60; m <= 22 * 60; m += SLOT_MIN) {
  const label = hhmm(m);
  timeOptions.push({ value: label, label });
}

/* Intervall im Slot-Raster: Schritte in Slot-Länge als Dropdown */
const everyOptions = [];
for (let m = SLOT_MIN; m <= 240; m += SLOT_MIN) everyOptions.push({ value: String(m), label: `${m} min` });

const timeFrom = buildDropdown(document.getElementById('time-from'), { options: timeOptions, value: '11:00', onChange: () => scheduleChanged() });
const everyDrop = buildDropdown(document.getElementById('every-dropdown'), { options: everyOptions, value: '30', onChange: () => scheduleChanged() });
const timeTo   = buildDropdown(document.getElementById('time-to'),   { options: timeOptions, value: '19:00', onChange: () => scheduleChanged() });

/* Closing-Slots sind vom Betreiber vordefiniert – Kunden können sie nicht anlegen */
const categoryDropdown = buildDropdown(document.getElementById('category-dropdown'), {
  options: CATEGORIES.filter(c => c.value !== 'closing'),
  value: null,
  placeholder: 'Select category',
  tall: true,
  onChange: v => {
    if (editingCard) applyCat(schedEditor, v);
    scheduleChanged();
  },
});

const categoryFilter = buildDropdown(categoryFilterEl, {
  options: [{ value: 'all', label: 'Show All' }, ...CATEGORIES],
  value: 'all',
  tall: true,
  onChange: () => applySearch(),
});

/* Status: aktiv / bevorstehend / abgelaufen */
function scheduleStatus(o) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (parseDate(o.start) > today) return 'upcoming';
  if (o.end && parseDate(o.end) < today) return 'expired';
  return 'active';
}

const statusFilter = buildDropdown(statusFilterEl, {
  options: [{ value: 'all', label: 'All states' }, { value: 'active', label: 'Active' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'expired', label: 'Expired' }],
  value: 'all',
  tall: true,
  onChange: () => applySearch(),
});

/* ---------------------------------------------------------------
   Segment-Schalter, Wochentage, Stepper
   --------------------------------------------------------------- */
function setSegment(segment, value) {
  const options = [...segment.querySelectorAll('.segmented__option')];
  options.forEach(o => o.classList.toggle('is-active', o.dataset.value === value));
  segment.classList.toggle('at-2', options.findIndex(o => o.classList.contains('is-active')) === 1);
}

function wireSegment(segment, onChange) {
  segment.addEventListener('click', e => {
    const opt = e.target.closest('.segmented__option');
    if (!opt || opt.classList.contains('is-active')) return;
    setSegment(segment, opt.dataset.value);
    onChange(opt.dataset.value);
  });
}

let schedType = 'weekly';
function applyType(value) {
  schedType = value;
  const weekly = value === 'weekly';
  schedForm.classList.toggle('is-single', !weekly);
  reveal(weekdaysReveal, weekly);
}
wireSegment(typeSegment, v => { applyType(v); scheduleChanged(true); });

let timeMode = 'repeat';
function applyTimeMode(value) {
  timeMode = value;
  schedForm.classList.toggle('is-once', value === 'once');
}
wireSegment(timeSegment, v => { applyTimeMode(v); scheduleChanged(true); });

dayChips.addEventListener('click', e => {
  const chip = e.target.closest('.day-chip');
  if (chip) { chip.classList.toggle('is-active'); scheduleChanged(true); }
});

schedTitle.addEventListener('input', () => scheduleChanged());
schedTitle.addEventListener('keydown', e => { if (e.key === 'Enter') scheduleBtn.click(); });

/* ---------------------------------------------------------------
   Audio-Vorschau
   --------------------------------------------------------------- */
const preview = createPlayer({
  playBtn: document.getElementById('preview-play'),
  slider: document.getElementById('preview-slider'),
  timeEl: document.getElementById('preview-time'),
});
let linkedSpot = null;                   /* { title, duration } aus der Creation History */

/* Ohne Audio gibt es nur den Auswahl-Zustand; Titel & Einstellungen
   klappen erst auf, sobald ein Spot gewählt ist. */
const previewBar = document.getElementById('preview');
/* Dauern aus tokens.css lesen – eine Quelle für CSS und JS */
const tokenMs = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const T = { glide: tokenMs('--t-glide'), box: tokenMs('--t-box'), leave: tokenMs('--t-leave'), boxClose: tokenMs('--t-box-close') };
let stageTimer = null;

/* Audio-Leiste weich an ihre neue Position fahren (FLIP): Layout springt
   sofort, die Leiste startet per Transform an der alten Stelle und gleitet. */
function glide(el, before) {
  const dy = before - el.getBoundingClientRect().top;
  if (!dy) return;
  el.style.transition = 'none';
  el.style.transform = `translateY(${dy}px)`;
  void el.offsetHeight;
  el.style.transition = 'transform var(--t-glide) var(--ease)';
  el.style.transform = '';
  el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
}

/* Einheitliches Erscheinen/Verschwinden eines Blocks (.reveal > inner):
   Höhe und oberer Abstand des INHALTS gleiten zwischen gemessenen Werten
   (damit sein Hintergrund mitwächst – nichts liegt vorher schon in voller
   Größe da), alles darunter rückt weich mit. Sichtbarkeit: beim Öffnen
   blendet der Inhalt ab 80 % der Höhenanimation ein, beim Schließen zuerst,
   die Höhe folgt bei 60 % des Ausblendens. Kein overflow: hidden.
   Inhalt mit .is-staggered: Hintergrund blendet sofort mit, die Kinder
   nacheinander (--c-start / is-in / is-leaving). */
const R = { open: tokenMs('--t-reveal'), close: tokenMs('--t-reveal-close'), fade: 300, fadeOut: tokenMs('--t-fade-out') };

function reveal(el, open) {
  const inner = el.firstElementChild;
  const staggered = inner.classList.contains('is-staggered');
  /* harter Umschnitt: Zielzustand sofort, keine Timer */
  if (inHardCut()) {
    clearTimeout(el._revealTimer); el._revealTimer = null;
    inner.style.transition = 'none';
    el.classList.toggle('is-hidden', !open);
    inner.style.cssText = '';
    if (staggered) inner.classList.toggle('is-in', open);
    return;
  }
  const hidden = el.classList.contains('is-hidden');
  const running = !!el._revealTimer;
  if (open && !hidden && !running) return;        /* ist schon offen */
  if (!open && hidden) return;                    /* ist schon zu */
  clearTimeout(el._revealTimer);

  const from = hidden ? 0 : inner.getBoundingClientRect().height;
  const fromMargin = hidden ? 0 : parseFloat(getComputedStyle(inner).marginTop) || 0;
  el.classList.remove('is-hidden');
  inner.style.transition = 'none';
  inner.style.height = '';                        /* natürliche Höhe laut Stylesheet messen */
  inner.style.marginTop = '';
  const full = inner.offsetHeight;
  const margin = getComputedStyle(inner).marginTop;
  inner.style.height = `${from}px`;
  inner.style.marginTop = `${fromMargin}px`;
  if (open && hidden) inner.style.opacity = '0';
  void inner.offsetHeight;

  const dur = open ? R.open : R.close;
  const heightDelay = open ? 0 : Math.round(R.fadeOut * 0.6);
  const fadeDelay = open ? Math.round(dur * 0.8) : 0;
  const t = [`height ${dur}ms var(--ease) ${heightDelay}ms`, `margin-top ${dur}ms var(--ease) ${heightDelay}ms`];
  if (staggered) {
    /* Hintergrund kommt mit dem Wachsen, geht mit dem Ende des Schrumpfens */
    t.push(open ? 'opacity 160ms var(--ease) 0ms' : `opacity 160ms var(--ease) ${heightDelay + dur - 160}ms`);
    inner.style.setProperty('--c-start', `${fadeDelay}ms`);
    inner.classList.toggle('is-leaving', !open);
    if (open) requestAnimationFrame(() => requestAnimationFrame(() => inner.classList.add('is-in')));
    else inner.classList.remove('is-in');
  } else {
    t.push(open ? `opacity ${R.fade}ms var(--ease) ${fadeDelay}ms` : `opacity ${R.fadeOut}ms var(--ease) 0ms`);
  }
  inner.style.transition = t.join(', ');
  inner.style.height = `${open ? full : 0}px`;
  inner.style.marginTop = open ? margin : '0px';
  inner.style.opacity = open ? '1' : '0';

  el._revealTimer = setTimeout(() => {
    el._revealTimer = null;
    inner.style.cssText = '';                     /* zurück auf auto / Stylesheet */
    if (!open) { el.classList.add('is-hidden'); inner.classList.remove('is-in', 'is-leaving'); }
  }, open ? Math.max(dur, fadeDelay + R.fade) : heightDelay + dur);
}

/* Rahmen des Formulars: nur Ein-/Ausblenden, gleiches Timing wie vorher
   (Zeilen starten bei 80 % davon) */
function fadeBox(open, delay) {
  schedForm.style.transition = 'none';
  schedForm.style.opacity = open ? '0' : '1';
  void schedForm.offsetHeight;
  schedForm.style.transition = `opacity ${open ? 'var(--t-box)' : 'var(--t-box-close)'} var(--ease) ${delay}ms`;
  schedForm.style.opacity = open ? '1' : '0';
}

function setLinkedSpot(spot, onHidden) {
  linkedSpot = spot;
  preview.load(spot ? spot.duration : 9);
  previewEmpty.hidden = !!spot;
  previewPlayer.hidden = !spot;
  previewBar.classList.toggle('preview--empty', !spot);
  clearTimeout(stageTimer);

  /* Rücksprung nach der Zusammenfassung: alles auf einmal, ohne Übergang */
  if (scheduleView.classList.contains('is-resetting')) {
    schedEditor.classList.remove('has-audio', 'is-in', 'is-leaving');
    scheduleView.classList.remove('has-audio');
    schedForm.style.cssText = '';
    return;
  }

  if (spot) {
    if (schedEditor.classList.contains('has-audio') && !schedEditor.classList.contains('is-leaving')) return;
    const before = previewBar.getBoundingClientRect().top;
    schedEditor.classList.remove('is-leaving');
    schedEditor.classList.add('has-audio');
    scheduleView.classList.add('has-audio');
    schedForm.style.cssText = '';
    glide(previewBar, before);                       /* 1. Leiste fährt hoch */
    fadeBox(true, T.glide - 60);                     /* 2. Rahmen blendet ein */
    requestAnimationFrame(() => requestAnimationFrame(() => schedEditor.classList.add('is-in')));   /* 3. Zeilen */
    return;
  }

  if (!schedEditor.classList.contains('has-audio')) return;
  schedEditor.classList.remove('is-in');
  schedEditor.classList.add('is-leaving');           /* 1. Zeilen aus */
  fadeBox(false, Math.round(T.leave * 0.5));         /* 2. Rahmen blendet ab der Hälfte aus */
  stageTimer = setTimeout(() => {                    /* 3. Leiste zurück */
    const before = previewBar.getBoundingClientRect().top;
    schedEditor.classList.remove('has-audio', 'is-leaving');
    scheduleView.classList.remove('has-audio');
    schedForm.style.cssText = '';
    if (onHidden) onHidden();
    glide(previewBar, before);
  }, Math.round(T.leave * 0.5 + T.boxClose * 0.85));  /* 3. Leiste, sobald der Rahmen fast weg ist */
}

/* Aus der Creation History heraus planen */
function openScheduleFor(title, duration) {
  flushSummary();
  exitEditMode();
  resetForm();
  schedTitle.value = title;
  setLinkedSpot({ title, duration });
  showView('schedule');
  scheduleChanged();
}

/* Aus dem Kalender: freier Slot angeklickt */
function scheduleFromSlot(date, time) {
  flushSummary();
  exitEditMode();
  resetForm();
  writeForm({ title: '', type: 'single', start: fmtDate(date), end: null, once: true, from: time, to: '19:00', every: 30, days: [], category: null });
  showView('schedule');
  schedTitle.focus({ preventScroll: true });
  showToast('success', `Slot preselected: ${DAY_NAMES[dayIdx(date)].slice(0, 3)} ${date.getDate()} · ${time}.`);
  scheduleChanged();
}

/* ---------------------------------------------------------------
   Formular-Zustand
   --------------------------------------------------------------- */
/* Feste Uhrzeiten (`times`, z. B. aus dem Excel-Plan) kann das Formular
   nicht abbilden. Damit sie beim Bearbeiten/Duplizieren nicht verloren
   gehen, bleiben sie erhalten, solange Modus und erste Uhrzeit unverändert
   sind – erst eine geänderte Zeit macht daraus eine einzelne Uhrzeit. */
let fixedTimes = null;

function readForm() {
  const from = timeFrom.value;
  const o = {
    title: schedTitle.value.trim(),
    type: schedType,
    start: startDate,
    end: schedType === 'weekly' ? endDate : null,
    once: timeMode === 'once',
    from,
    to: timeTo.value,
    every: parseInt(everyDrop.value, 10) || 30,
    days: [...dayChips.querySelectorAll('.day-chip.is-active')].map(c => c.dataset.day),
    category: categoryDropdown.value,
    spot: linkedSpot ? linkedSpot.title : null,
    duration: linkedSpot ? linkedSpot.duration : 9,
  };
  if (fixedTimes && o.once && from === fixedTimes[0]) o.times = fixedTimes;
  return o;
}

/* Entwurf für die Kalender-Vorschau: sobald etwas eingetragen ist */
function getScheduleDraft() {
  const o = readForm();
  if (!o.title && !editingCard) return null;
  if (o.type === 'weekly' && !o.days.length) return null;
  return o;
}

function writeForm(o) {
  const instant = hardCut;
  hardCut = false;
  if (instant) { scheduleView.classList.add('is-instant'); hardCutUntil = performance.now() + 260; }
  schedTitle.value = o.title || '';
  startDate = o.start || todayLabel();
  endDate = o.end === undefined ? null : o.end;
  renderDates();
  applyType(o.type || 'weekly');
  setSegment(typeSegment, schedType);
  applyTimeMode((o.once || o.times) ? 'once' : 'repeat');
  setSegment(timeSegment, timeMode);
  fixedTimes = o.times && o.times.length > 1 ? o.times : null;
  timeFrom.value = o.times ? o.times[0] : (o.from || '11:00');
  timeTo.value = o.to || '19:00';
  everyDrop.value = String(o.every || 30);
  dayChips.querySelectorAll('.day-chip').forEach(chip =>
    chip.classList.toggle('is-active', (o.days || []).includes(chip.dataset.day)));
  categoryDropdown.value = o.category || null;
  setLinkedSpot(o.spot ? { title: o.spot, duration: o.duration || 9 } : null);
  if (instant) {
    /* zwei Frames halten: auch Wochentage und Konflikt-Feld schalten hart um.
       Die Validierung läuft sofort mit (nicht entprellt), damit das
       Konflikt-Feld im selben Moment umspringt wie die Felder. */
    void schedEditor.offsetHeight;
    queueMicrotask(() => scheduleChanged(true));
    requestAnimationFrame(() => requestAnimationFrame(() => scheduleView.classList.remove('is-instant')));
  }
}

let baseSnapshot = null;

/* Zurücksetzen: ist das Modul offen, klappt es zuerst so zu, wie es gerade
   ist – die Felder werden erst zurückgesetzt, wenn es unsichtbar ist. */
function resetForm() {
  const write = () => {
    writeForm({ title: '', type: 'weekly', start: todayLabel(), end: null, once: false, from: '11:00', to: '19:00', every: 30, days: [], category: null, spot: null });
    baseSnapshot = JSON.stringify(readForm());
    setDraftDot('schedule', false);
  };
  const open = schedEditor.classList.contains('has-audio') && !scheduleView.classList.contains('is-resetting');
  if (!open) { hideConflicts(); write(); return; }
  setLinkedSpot(null, () => { hideConflicts({ instant: true }); write(); });
}

/* Wurde seit dem letzten Reset bzw. Editing-Start etwas geändert?
   Während die Erfolgs-Zusammenfassung steht, ist nichts mehr zu verlieren. */
function isDirty() {
  if (!schedSummary.hidden) return false;
  const now = JSON.stringify(readForm());
  return editingCard ? now !== editSnapshot : now !== baseSnapshot;
}

/* Nach einem bestätigten Discard schaltet der nächste writeForm ohne
   Übergänge um – Segmente, Wochentage und Slider sollen nicht von den
   verworfenen Werten zu den neuen animieren. Das Zeitfenster deckt auch
   die entprellte Validierung ab (Konflikt-Feld). */
let hardCut = false;
let hardCutUntil = 0;
const inHardCut = () => scheduleView.classList.contains('is-instant') || performance.now() < hardCutUntil;

async function confirmDiscardIfDirty() {
  if (!isDirty()) return true;
  const ok = await confirmDialog({
    title: 'Discard changes?',
    text: editingCard ? 'Your edits to this schedule have not been sent yet.' : 'Your current settings will be lost.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
  });
  if (ok) hardCut = true;
  return ok;
}

function validateForm(o) {
  if (!o.title) { showToast('error', 'Please enter a title first.'); schedTitle.focus({ preventScroll: true }); return false; }
  if (o.type === 'weekly' && o.days.length === 0) { showToast('error', 'Select at least one weekday.'); return false; }
  if (o.type === 'weekly' && o.end === '') { showToast('error', 'Choose an end date or set it to infinite.'); return false; }
  if (!o.once && o.to <= o.from) { showToast('error', 'End time must be after start time.'); return false; }
  if (!o.category) { showToast('error', 'Please choose a category.'); return false; }
  if (!o.spot) { showToast('error', 'Choose the audio for this schedule.'); return false; }
  return true;
}

/* ---------------------------------------------------------------
   Scheduling History
   --------------------------------------------------------------- */
function buildMeta(o) {
  const dates = o.type === 'weekly' ? `${o.start} – ${o.end || 'infinite'}` : o.start;
  const parts = [o.type === 'weekly' ? 'Weekly' : 'Single Day'];
  if (o.times) parts.push(o.times.join(' · '));
  else {
    parts.push(o.once ? o.from : `${o.from} – ${o.to}`);
    if (!o.once) parts.push(`every ${o.every} min`);
  }
  parts.push(catLabel(o.category));
  return { dates, config: parts.join(' · ') };
}

const miniDays = active =>
  DAYS.map(d => `<span class="mini-day${active.includes(d) ? ' is-active' : ''}">${d}</span>`).join('');

let schedUid = 0;

function createSchedCard(opts) {
  const card = document.createElement('article');
  card.className = 'sched-card';
  card._uid = ++schedUid;
  if (opts.isNew) card.classList.add('sched-card--new');
  applyCat(card, opts.category);
  card._opts = opts;
  const status = scheduleStatus(opts);
  if (status !== 'active') card.classList.add(`sched-card--${status}`);

  const days = opts.type === 'weekly' ? `<div class="sched-card__days">${miniDays(opts.days || [])}</div>` : '';
  const action = (name, label, ic) =>
    `<button class="sched-card__action" data-action="${name}" aria-label="${label} schedule" data-tip="${label}">${icon(ic)}</button>`;

  card.innerHTML = `
    <div class="sched-card__head">
      <h2 class="sched-card__title"></h2>
      ${days}
    </div>
    <div class="sched-card__meta">
      <span class="sched-card__meta-dates"></span>
      <span class="sched-card__meta-config"></span>
    </div>
    <div class="sched-card__actions">${opts.locked
      ? `<span class="sched-card__lock" title="Fixed by sounddna">${icon('lock')}Fixed</span>`
      : action('duplicate', 'Duplicate', 'copy') + action('edit', 'Edit', 'pencil') + action('delete', 'Delete', 'trash')}
    </div>
  `;
  card.querySelector('.sched-card__title').textContent = opts.title;
  const meta = buildMeta(opts);
  card.querySelector('.sched-card__meta-dates').innerHTML =
    (status !== 'active' ? `<span class="sched-card__status">${status === 'upcoming' ? 'Upcoming' : 'Expired'}</span>` : '') + escapeHtml(meta.dates);
  card.querySelector('.sched-card__meta-config').textContent = meta.config;

  if (!opts.locked) {
    card.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicateSchedule(card));
    card.querySelector('[data-action="edit"]').addEventListener('click', () => requestEdit(card));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSchedule(card));
  }
  return card;
}

async function deleteSchedule(card) {
  if (editingCard && editingCard !== card) { showToast('error', 'Finish or cancel the current edit first.'); return; }
  const ok = await confirmDialog({
    title: 'Delete schedule?',
    text: `“${card._opts.title}” will be removed from the schedule.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  if (editingCard === card) { exitEditMode(); resetForm(); }
  card.classList.add('is-leaving');
  setTimeout(() => { card.remove(); applySearch(); }, 220);
  showToast('success', 'Schedule deleted.');
}

/* ---------------------------------------------------------------
   Bearbeitungsmodus
   --------------------------------------------------------------- */
let editingCard = null;
let editSnapshot = null;

async function duplicateSchedule(card) {
  if (editingCard) { showToast('error', 'Finish or cancel the current edit first.'); return; }
  if (!(await confirmDiscardIfDirty())) return;
  flushSummary();
  resetForm();
  const o = card._opts;
  writeForm({ ...o, title: `${o.title} (Copy)`, locked: false });
  schedTitle.focus({ preventScroll: true });
  schedTitle.select();
  showToast('success', 'Duplicated – adjust days or times and send.');
  scheduleChanged();
}

async function requestEdit(card) {
  if (editingCard === card) return;
  if (editingCard) {
    showToast('error', 'Finish or cancel the current edit first.');
    return;
  }
  if (!(await confirmDiscardIfDirty())) return;
  flushSummary();
  enterEditMode(card);
}

function enterEditMode(card) {
  editingCard = card;
  card.classList.add('is-editing');
  scheduleList.classList.add('has-editing');

  writeForm(card._opts);
  editSnapshot = JSON.stringify(readForm());
  scheduleChanged();

  schedEditor.classList.add('is-editing');
  applyCat(schedEditor, card._opts.category);
  schedEditorHead.hidden = false;
  scheduleBtnLabel.textContent = 'Update Schedule';
  cancelEditBtn.hidden = false;
  schedTitle.focus({ preventScroll: true });
}

function exitEditMode() {
  if (editingCard) editingCard.classList.remove('is-editing');
  editingCard = null;
  editSnapshot = null;
  scheduleList.classList.remove('has-editing');
  schedEditor.classList.remove('is-editing');
  schedEditorHead.hidden = true;
  hideConflicts();
  scheduleBtnLabel.textContent = 'Send to Schedule';
  cancelEditBtn.hidden = true;
}

async function cancelEditing() {
  if (!(await confirmDiscardIfDirty())) return;
  exitEditMode();
  resetForm();
}

cancelEditBtn.addEventListener('click', cancelEditing);
schedEditorClose.addEventListener('click', cancelEditing);

/* ---------------------------------------------------------------
   Slot-Konflikte: pro Slot (SLOT_MIN Minuten) und Tag nur ein Spot
   Regeln:
   - pro Slot und Tag nur ein Spot (Closing-Slots sind reserviert:
     nur Closing darf sich einen Slot mit Closing teilen)
   - keine Durchsagen in Quiet Hours
   - keine Durchsagen außerhalb der Öffnungszeiten (auch außerhalb des
     Kalender-Rasters, z. B. 06:00)
   --------------------------------------------------------------- */
function findConflicts(o, excludeCard) {
  const others = [...scheduleList.querySelectorAll('.sched-card')].filter(c => c !== excludeCard);
  const conflicts = [];
  const first = parseDate(o.start);
  const span = o.type === 'single' ? 1 : 7;
  for (let i = 0; i < span; i++) {
    const date = new Date(first);
    date.setDate(date.getDate() + i);
    const di = dayIdx(date);
    const mine = occurrences(o, date, { all: true });
    if (!mine.length) continue;
    const seen = new Set();
    mine.forEach(m => {
      if (seen.has(m.slot)) return;
      seen.add(m.slot);
      const base = { day: DAYS[di], time: m.time, slot: m.slot, di };
      if (!isAllowedTime(di, m.time, o.category)) { conflicts.push({ ...base, reason: 'closed' }); return; }
      if (isQuiet(di, m.time)) { conflicts.push({ ...base, reason: 'quiet' }); return; }
      others.forEach(card => {
        const theirs = occurrences(card._opts, date);
        if (!theirs.some(t => t.slot === m.slot)) return;
        const bothClosing = o.category === 'closing' && card._opts.category === 'closing';
        if (!bothClosing) conflicts.push({ ...base, reason: 'taken', card });
      });
    });
  }
  return conflicts;
}

/* Alle Zeiten um n Minuten verschieben */
function shiftTimes(o, minutes) {
  const sh = t => hhmm(minutesOf(t) + minutes);
  const c = { ...o };
  if (o.times) c.times = o.times.map(sh);
  else { c.from = sh(o.from); if (!o.once) c.to = sh(o.to); }
  return c;
}

const firstTimeOf = c => c.times ? c.times[0] : c.from;
const lastTimeOf  = c => c.times ? c.times[c.times.length - 1] : (c.once ? c.from : c.to);
const inRange = c => minutesOf(firstTimeOf(c)) >= CAL_HOUR_START * 60 && minutesOf(lastTimeOf(c)) < CAL_HOUR_END * 60;
const fits = c => inRange(c) && !findConflicts(c, editingCard).length;

/* Liefert { cand, label } oder null.
   1) Startzeit slotweise verschieben – später, dann früher
   2) bei Repeat: Intervall vergrößern (ggf. mit kleiner Verschiebung) */
function suggestFreeSlot(o) {
  for (let n = 1; n <= CAL_SLOTS; n++) {
    for (const dir of [1, -1]) {
      const cand = shiftTimes(o, dir * n * SLOT_MIN);
      if (fits(cand)) return { cand, label: `Move to next free slot · ${firstTimeOf(cand)}` };
    }
  }
  if (!o.once && !o.times) {
    for (let every = o.every + SLOT_MIN; every <= 240; every += SLOT_MIN) {
      for (let n = 0; n <= 12; n++) {
        const cand = { ...shiftTimes(o, n * SLOT_MIN), every };
        if (!inRange(cand)) break;
        if (fits(cand)) return { cand, label: `Move to free slots · every ${every} min from ${cand.from}` };
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------
   Konflikt-Hinweis – Streifen unter der Zeitzeile (#conflict-strip in
   #conflict-wrap, einem .reveal). Feste Höhe: Erscheinen/Verschwinden
   läuft über reveal(), Inhaltswechsel bei offenem Streifen als kurzer
   Crossfade ohne jede Höhenänderung.
   --------------------------------------------------------------- */
const conflictStrip = document.getElementById('conflict-strip');
const CONFLICT_MAX_CHIPS = 3;
let conflictKey = null;

function conflictLabel(c) {
  return c.reason === 'closed' ? 'Outside opening hours'
       : c.reason === 'quiet' ? 'Quiet hour'
       : c.card._opts.title;
}

function conflictParts(list, blocking) {
  const chips = list.slice(0, CONFLICT_MAX_CHIPS).map(c => `
    <span class="conflict-strip__chip" title="${escapeHtml(conflictLabel(c))}">
      <span class="conflict-strip__dot" style="background:${c.card ? catColor(c.card._opts.category) : 'var(--white-25)'}"></span>${c.day} ${c.time}
    </span>`);
  const more = list.length > CONFLICT_MAX_CHIPS ? `<span class="conflict-strip__more">+${list.length - CONFLICT_MAX_CHIPS}</span>` : '';
  const current = readForm();
  const suggestion = suggestFreeSlot(current);
  return {
    suggestion,
    title: `<span class="conflict-strip__title">${list.length === 1 ? '1 slot taken' : `${list.length} slots taken`}</span>`,
    times: `<span class="conflict-strip__times">${chips.join('')}${more}</span>`,
    foot: suggestion
      ? `<button class="ghost-btn ghost-btn--sm ghost-btn--fill conflict-strip__suggest" type="button">${icon('arrow-right')}${escapeHtml(suggestion.label)}</button>`
      : `<span class="conflict-strip__note">${current.once ? 'No free slot – try other days or times' : 'No fit – try a larger interval or once per day'}</span>`,
  };
}

/* Streifen rendern. swap = bei offenem Streifen nur die geänderten Teile
   austauschen, die neuen rollen dezent nach. */
function renderConflictStrip(list, blocking, swap = false) {
  conflictWrap.classList.toggle('is-blocking', blocking);
  conflictWrap.classList.remove('is-ok');
  const parts = conflictParts(list, blocking);
  const slots = ['title', 'times', 'foot'];
  const old = [...conflictStrip.children];
  const shown = conflictStrip._parts || {};          /* zuletzt gerenderte Teile (roher HTML-String) */
  const frag = document.createDocumentFragment();
  slots.forEach((slot, i) => {
    let el;
    if (swap && old[i] && shown[slot] === parts[slot]) el = old[i];   /* unverändert: stehen lassen */
    else {
      el = document.createRange().createContextualFragment(parts[slot]).firstElementChild;
      if (swap) {
        el.classList.add('is-rolling');
        el.addEventListener('animationend', () => el.classList.remove('is-rolling'), { once: true });
      }
    }
    el.style.setProperty('--i', swap ? 0 : i);
    frag.appendChild(el);
  });
  conflictStrip.replaceChildren(frag);
  conflictStrip._parts = { title: parts.title, times: parts.times, foot: parts.foot };
  conflictStrip.classList.toggle('has-button', !!parts.suggestion);

  const btn = conflictStrip.querySelector('.conflict-strip__suggest');
  if (btn) btn.addEventListener('click', () => {
    writeForm({ ...readForm(), ...parts.suggestion.cand });
    showConflictSuccess(`Moved to free slots · ${firstTimeOf(parts.suggestion.cand)}`);
    scheduleChanged(true);
  });
}

/* Streifen wird kurz grün mit der Meldung, dann verschwindet er */
let conflictHold = null;
function showConflictSuccess(text) {
  clearTimeout(conflictHold);
  conflictWrap.classList.remove('is-blocking');
  conflictWrap.classList.add('is-ok');
  conflictStrip.classList.remove('has-button');
  const el = document.createElement('span');
  el.className = 'conflict-strip__title is-rolling';
  el.textContent = text;
  el.style.setProperty('--i', 0);
  conflictStrip.replaceChildren(el);
  conflictStrip._parts = {};
  conflictHold = setTimeout(() => { conflictHold = null; hideConflicts(); }, 1400);
}

/* Auf/Zu: nur Klassen – Wrapper und Inhalt animieren per CSS.
   Läuft gerade das Wochentage-Reveal (gleicher Klick), wartet der Streifen. */
function setConflictOpen(open) {
  clearTimeout(conflictWrap._after);
  if (inHardCut()) {
    conflictWrap.style.transition = 'none';
    conflictWrap.classList.toggle('is-open', open);
    conflictStrip.classList.toggle('is-in', open);
    void conflictWrap.offsetHeight;
    conflictWrap.style.transition = '';
    return;
  }
  const go = () => {
    if (open) {
      conflictWrap.classList.add('is-open');
      requestAnimationFrame(() => requestAnimationFrame(() => conflictStrip.classList.add('is-in')));
    } else {
      conflictStrip.classList.remove('is-in');
      conflictWrap.classList.remove('is-open');
    }
  };
  const wait = weekdaysReveal._revealTimer ? R.open + 40 : 0;
  if (wait) conflictWrap._after = setTimeout(go, wait); else go();
}

function showConflicts(list, { blocking = false } = {}) {
  const key = JSON.stringify([blocking, list.map(c => [c.day, c.time, c.reason, c.card ? c.card._uid : 0])]);
  if (key === conflictKey && !conflictHold) return;
  const wasOpen = conflictKey !== null;
  conflictKey = key;
  clearTimeout(conflictHold); conflictHold = null;
  if (!wasOpen) { renderConflictStrip(list, blocking, false); setConflictOpen(true); return; }
  /* Inhaltswechsel: läuft gerade das Wochentage-Reveal (gleicher Klick), erst
     danach tauschen – sonst geht das Nachrollen in der Bewegung unter */
  clearTimeout(conflictWrap._after);
  const wait = weekdaysReveal._revealTimer ? R.open + 40 : 0;
  if (wait) conflictWrap._after = setTimeout(() => renderConflictStrip(list, blocking, true), wait);
  else renderConflictStrip(list, blocking, true);
}

function hideConflicts({ instant = false } = {}) {
  if (conflictKey === null) return;
  if (conflictHold && !instant) return;        /* grüne Meldung steht noch */
  conflictKey = null;
  clearTimeout(conflictHold); conflictHold = null;
  clearTimeout(conflictWrap._after);
  if (instant) {
    conflictWrap.style.transition = 'none';
    conflictStrip.classList.remove('is-in');
    conflictWrap.classList.remove('is-open', 'is-ok', 'is-blocking');
    void conflictWrap.offsetHeight;
    conflictWrap.style.transition = '';
    return;
  }
  setConflictOpen(false);
}

/* Live-Validierung: strukturelle Änderungen sofort (damit Auf-/Zuklappen
   und Konflikt-Box gleichzeitig animieren), Tippen leicht entprellt */
let validateTimer = null;
function scheduleChanged(immediate = false) {
  clearTimeout(validateTimer);
  setDraftDot('schedule', isDirty());
  validateTimer = setTimeout(() => {
    const o = readForm();
    const ready = o.type === 'single' || o.days.length > 0;
    if (!ready) { hideConflicts(); timeFrom.mark(() => null); timeTo.mark(() => null); return; }

    const list = findConflicts(o, editingCard);
    if (list.length) showConflicts(list); else hideConflicts();

    /* Startzeit-Dropdown: welche Zeiten wären an den gewählten Tagen frei? */
    timeFrom.mark(value => {
      const probe = { ...o, once: true, from: value, times: null };
      const c = findConflicts(probe, editingCard);
      return c.length ? c[0].reason : null;
    });
    timeTo.mark(() => null);
  }, immediate ? 0 : 120);
}

/* ---------------------------------------------------------------
   Senden / Aktualisieren
   --------------------------------------------------------------- */
scheduleBtn.addEventListener('click', () => {
  const o = readForm();
  if (!validateForm(o)) return;

  const conflicts = findConflicts(o, editingCard);
  if (conflicts.length) {
    showConflicts(conflicts, { blocking: true });
    showToast('error', 'Some slots are not available – see the list in the form.');
    return;
  }
  hideConflicts();

  const target = editingCard;
  const commit = () => {
    const card = createSchedCard({ ...o, isNew: true });
    if (target && target.isConnected) target.replaceWith(card); else scheduleList.prepend(card);
    applySearch();
  };
  exitEditMode();
  showSummary(o, target ? 'Schedule updated' : 'Sent to schedule', commit);
});

/* ---------------------------------------------------------------
   Erfolgs-Zusammenfassung: 10 Sekunden im Editor, dann als Karte
   --------------------------------------------------------------- */
let summaryTimer = null;
let summaryCommit = null;
let summaryRemaining = 10000;
let summaryStartedAt = 0;

function startSummaryTimer(ms) {
  clearTimeout(summaryTimer);
  summaryRemaining = ms;
  summaryStartedAt = performance.now();
  summaryTimer = setTimeout(() => finishSummary({ instant: false }), ms);
}

schedSummary.addEventListener('mouseenter', () => {
  if (schedSummary.hidden) return;
  clearTimeout(summaryTimer);
  summaryRemaining = Math.max(0, summaryRemaining - (performance.now() - summaryStartedAt));
});
schedSummary.addEventListener('mouseleave', () => {
  if (schedSummary.hidden) return;
  startSummaryTimer(summaryRemaining);
});

function showSummary(o, heading, commit) {
  clearTimeout(summaryTimer);
  summaryCommit = commit;
  const meta = buildMeta(o);
  const days = o.type === 'weekly' ? `<div class="sched-summary__days">${miniDays(o.days)}</div>` : '';
  schedSummary.innerHTML = `
    <div class="sched-summary__head">${heading}</div>
    <p class="sched-summary__title"></p>
    <p class="sched-summary__meta">${meta.dates}</p>
    <p class="sched-summary__meta sched-summary__meta--config">${meta.config}</p>
    ${days}
    <div class="sched-summary__actions">
      <button class="ghost-btn ghost-btn--sm" type="button" data-summary="calendar">
        ${icon('calendar')}
        See in calendar
      </button>
      <span class="sched-summary__hint">Appears in the history in a moment</span>
    </div>
    <div class="sched-summary__bar"><div class="sched-summary__fill"></div></div>`;
  schedSummary.querySelector('.sched-summary__title').textContent = o.title;
  applyCat(schedSummary, o.category);
  schedSummary.hidden = false;
  schedEditor.classList.add('is-summary');
  scheduleView.classList.add('is-summary');          /* Zusammenfassung sitzt mittig */

  schedSummary.querySelector('[data-summary="calendar"]').addEventListener('click', () => {
    finishSummary();
    calWeekStart = mondayOf(parseDate(o.start));
    showView('calendar');
  });

  startSummaryTimer(10000);
}

/* Zusammenfassung schließen: Karte in die History, Editor zurück in den
   leeren Zustand. Läuft der Timer ab, blendet die Zusammenfassung erst aus;
   wird das Formular sofort gebraucht (flushSummary), passiert alles auf
   einmal. Das Formular war während der Zusammenfassung ausgeblendet –
   der Rücksprung in den leeren Zustand passiert daher ohne Übergang. */
function finishSummary({ instant = true } = {}) {
  clearTimeout(summaryTimer);
  if (summaryCommit) { summaryCommit(); summaryCommit = null; }
  const reset = () => {
    schedSummary.hidden = true;
    schedSummary.classList.remove('is-leaving');
    schedEditor.classList.remove('is-summary');
    scheduleView.classList.remove('is-summary');
    scheduleView.classList.add('is-resetting');
    resetForm();
    void scheduleView.offsetHeight;
    scheduleView.classList.remove('is-resetting');
  };
  if (instant) { reset(); return; }
  schedSummary.classList.add('is-leaving');
  setTimeout(() => { if (!schedSummary.hidden) reset(); }, 260);
}

/* Läuft die Zusammenfassung noch, wird sie sofort abgeschlossen (Karte
   landet in der History), bevor das Formular anderweitig benutzt wird */
function flushSummary() {
  if (!schedSummary.hidden) finishSummary();
}

/* ---------------------------------------------------------------
   Audio wählen: Lightbox mit reduzierter Creation History
   --------------------------------------------------------------- */
const spotPicker       = document.getElementById('spot-picker');
const spotPickerList   = document.getElementById('spot-picker-list');
const spotPickerSearch = document.getElementById('spot-picker-search');

function openSpotPicker() {
  spotPickerSearch.value = '';
  renderSpotPicker();
  spotPicker.hidden = false;
  setTimeout(() => spotPickerSearch.focus(), 50);
}

function closeSpotPicker() {
  if (activePlayer && spotPicker.contains(activePlayer.el)) activePlayer.stop();
  spotPicker.hidden = true;
}

function renderSpotPicker() {
  const q = spotPickerSearch.value.trim().toLowerCase();
  const cards = [...historyList.querySelectorAll('.card')]
    .filter(c => !['deleted', 'error', 'pending'].includes(c._state.status))
    .filter(c => c._state.title.toLowerCase().includes(q));

  spotPickerList.innerHTML = cards.length ? '' : '<p class="lightbox__empty">No spots found.</p>';
  cards.forEach(c => {
    const row = document.createElement('div');
    row.className = 'picker-row';
    const current = !!linkedSpot && linkedSpot.title === c._state.title;
    row.classList.toggle('is-current', current);
    row.innerHTML = `
      <div class="picker-row__info">
        <p class="picker-row__title"></p>
        <p class="picker-row__meta"></p>
      </div>
      <div class="picker-row__player">
        <button class="play-btn" aria-label="Play">${icon('play', 'icon--filled')}</button>
        <div class="slider"><div class="slider__track"></div><div class="slider__progress"></div><div class="slider__thumb"></div></div>
        <span class="card__time"></span>
      </div>
      <button class="picker-row__choose" type="button">${current ? 'Selected' : 'Choose'}</button>`;
    row.querySelector('.picker-row__title').textContent = c._state.title;
    row.querySelector('.picker-row__meta').textContent = c.querySelector('.card__date').textContent;

    createPlayer({
      playBtn: row.querySelector('.play-btn'),
      slider: row.querySelector('.slider'),
      timeEl: row.querySelector('.card__time'),
      duration: c._state.duration,
      resetOnStop: true,
    });

    row.querySelector('.picker-row__choose').addEventListener('click', () => {
      setLinkedSpot({ title: c._state.title, duration: c._state.duration });
      schedTitle.value = c._state.title;      /* Titel springt automatisch mit */
      closeSpotPicker();
      scheduleChanged();
      showToast('success', 'Audio selected.');
    });
    spotPickerList.appendChild(row);
  });
}

document.getElementById('preview-replace').addEventListener('click', openSpotPicker);
document.getElementById('preview-choose').addEventListener('click', openSpotPicker);

/* Clear all: alles zurücksetzen (im Editing entspricht das Abbrechen) */
document.getElementById('preview-clear').addEventListener('click', async () => {
  if (!(await confirmDiscardIfDirty())) return;
  flushSummary();
  exitEditMode();
  resetForm();
});
document.getElementById('spot-picker-close').addEventListener('click', closeSpotPicker);
spotPicker.addEventListener('click', e => { if (e.target === spotPicker) closeSpotPicker(); });
spotPickerSearch.addEventListener('input', renderSpotPicker);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !spotPicker.hidden) closeSpotPicker(); });

/* ---------------------------------------------------------------
   Beispieldaten – IKEA Vösendorf, Durchsagenplan
   (aus der Excel-Vorlage, Woche 21.–26.09.2026). Läuft ab 31.08.2026
   unbegrenzt weiter, damit jede Woche denselben Plan zeigt.
   `times` = feste Uhrzeiten pro Tag, so wie der echte Plan aufgebaut ist.
   --------------------------------------------------------------- */
const MO_FR = ['Mo', 'Tu', 'We', 'Th', 'Fr'];
const MO_TH = ['Mo', 'Tu', 'We', 'Th'];
const MO_SA = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const NO_WE = ['Mo', 'Tu', 'Th', 'Fr'];              /* Mittwoch hat die Stille Stunde 16–18 → eigene Variante */
const PLAN = { type: 'weekly', start: '31.08.2026', end: null, once: false, every: 30, duration: 9 };
const FIXED = { ...PLAN, category: 'closing', locked: true };

/* Ein Spot pro Slot, nichts in der Stillen Stunde, nichts außerhalb
   der Öffnungszeit (Schlussdurchsagen dürfen bis zur Schließzeit) – die Daten
   halten sich an dieselben Regeln, die der Scheduler prüft. */
const demoSchedules = [
  { ...PLAN, title: 'IKEA FOOD Frühstücksangebot',        category: 'food',      days: MO_SA, times: ['09:00', '09:45'] },
  { ...PLAN, title: 'IKEA FAMILY Durchsage',              category: 'marketing', days: NO_WE, times: ['10:00', '13:00', '16:00', '19:00'] },
  { ...PLAN, title: 'IKEA FAMILY Durchsage (Mittwoch)',   category: 'marketing', days: ['We'], times: ['10:00', '13:00', '19:00'] },
  { ...PLAN, title: 'IKEA FAMILY Durchsage (Samstag)',    category: 'marketing', days: ['Sa'], times: ['10:00', '13:00', '16:00'] },
  { ...PLAN, title: 'SCAN & PAY Durchsage',               category: 'marketing', days: NO_WE, times: ['10:30', '12:30', '15:30', '17:30'] },
  { ...PLAN, title: 'SCAN & PAY Durchsage (Mittwoch)',    category: 'marketing', days: ['We'], times: ['10:30', '12:30'] },
  { ...PLAN, title: 'SCAN & PAY Durchsage (Samstag)',     category: 'marketing', days: ['Sa'], times: ['11:30', '13:30', '15:30'] },
  { ...PLAN, title: 'IKEA Geschenkkarte Durchsage',       category: 'marketing', days: MO_SA, times: ['11:00', '14:00'] },
  { ...PLAN, title: 'Neuer Gesenkter Preis Durchsage',    category: 'marketing', days: NO_WE, times: ['11:30', '14:30', '16:30', '18:30'] },
  { ...PLAN, title: 'Neuer Gesenkter Preis (Mittwoch)',   category: 'marketing', days: ['We'], times: ['11:30', '14:30', '18:30'] },
  { ...PLAN, title: 'Neuer Gesenkter Preis (Samstag)',    category: 'marketing', days: ['Sa'], times: ['12:30', '14:30', '16:30'] },
  { ...PLAN, title: 'ZLS Durchsage',                      category: 'marketing', days: MO_FR, times: ['12:00', '15:00', '18:00'] },
  { ...PLAN, title: 'ZLS Durchsage (Samstag)',            category: 'marketing', days: ['Sa'], times: ['12:00', '15:00'] },
  { ...PLAN, title: 'SMÅLAND Kipa Durchsage',             category: 'special',   days: ['Fr'], times: ['13:30'] },
  { ...PLAN, title: 'SMÅLAND Kipa Durchsage (Samstag)',   category: 'special',   days: ['Sa'], times: ['10:30'] },
  { ...PLAN, title: 'Stille Stunde Durchsage',            category: 'special',   days: ['We'], times: ['15:45'] },
  { ...PLAN, title: 'Café Bar Schlussdurchsage',          category: 'food',      days: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], times: ['17:10'] },
  { ...FIXED, title: '1. Schlussdurchsage',                days: MO_TH, times: ['19:30'] },
  { ...FIXED, title: '2. Schlussdurchsage',                days: MO_TH, times: ['19:45'] },
  { ...FIXED, title: '3. Schlussdurchsage',                days: MO_TH, times: ['19:55'] },
  { ...FIXED, title: '4. Schlussdurchsage',                days: MO_TH, times: ['20:00'] },
  { ...FIXED, title: 'Schlussdurchsagen 1–4 (Freitag)',    days: ['Fr'], times: ['20:30', '20:45', '20:55', '21:00'] },
  { ...FIXED, title: 'Schlussdurchsagen 1–4 (Samstag)',    days: ['Sa'], times: ['17:30', '17:45', '17:55', '18:00'] },
  { ...PLAN, title: 'IKEA Family Punkte Aktion Juli',     category: 'marketing', start: '01.07.2026', end: '31.07.2026', days: MO_SA, times: ['10:00', '15:00'] },
  { ...PLAN, title: 'Weihnachtsöffnungszeiten Hinweis',   category: 'special',   start: '01.12.2026', end: '23.12.2026', days: MO_SA, times: ['11:00', '17:00'] },
];

demoSchedules.forEach(s => scheduleList.appendChild(createSchedCard({ ...s, spot: s.spot || s.title })));
resetForm();
