/* ================================================================
   CALENDAR – Wochenansicht aller aktiven Schedules
   - Kategorie färbt die Slots, Hover leuchtet alle Slots eines Spots
   - Schlussdurchsagen (Closing) haben feste Slots: die Zeile wird
     gestreckt, damit jede Zeit ihre eigene Reihe bekommt
   - Öffnungszeiten & Quiet Hours werden als gesperrt gezeichnet
   - Freie Slots lassen sich anklicken → Spot hier einplanen
   - Ein Entwurf aus dem Scheduler erscheint gestrichelt als Vorschau
   ================================================================ */

const calGrid   = document.getElementById('cal-grid');
const calRange  = document.getElementById('cal-range');
const calLegend = document.getElementById('cal-legend');
const calDays   = document.getElementById('cal-days');
const calEmpty  = document.getElementById('cal-empty');

const isMobile = () => window.matchMedia('(max-width: 980px)').matches;
let mobileDay = dayIdx(new Date());     /* Tagesansicht am Handy */

const CAL_HOUR_START = 8;
const CAL_HOUR_END   = 22;                         /* exklusiv */
const CAL_SLOTS      = (CAL_HOUR_END - CAL_HOUR_START) * 60 / SLOT_MIN;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
document.documentElement.style.setProperty('--cal-slots', CAL_SLOTS);
const DAY_NAMES      = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_SHORT    = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Store-Regeln (Beispiel IKEA Vösendorf) – Index 0 = Montag.
   Einzige Quelle für Kalender, Konfliktprüfung, Home-Karte und Demo-Plan. */
const STORE_HOURS = [['09:00', '20:00'], ['09:00', '20:00'], ['09:00', '20:00'], ['09:00', '20:00'], ['09:00', '21:00'], ['09:00', '18:00'], null];
const QUIET_HOURS = [{ day: 2, from: '16:00', to: '18:00' }];

/* "Wednesday 16–18" bzw. "Mo–Th 9–20 · Fr 9–21 · Sa 9–18" – eine Quelle
   für Home-Karte und Hinweise */
const quietHoursLabel = () =>
  QUIET_HOURS.map(q => `${DAY_NAMES[q.day]} ${parseInt(q.from, 10)}–${parseInt(q.to, 10)}`).join(', ');

function storeHoursLabel() {
  const parts = [];
  STORE_HOURS.forEach((h, i) => {
    if (!h) return;
    const last = parts[parts.length - 1];
    if (last && last.h[0] === h[0] && last.h[1] === h[1] && last.to === i - 1) { last.to = i; return; }
    parts.push({ from: i, to: i, h });
  });
  return parts.map(p => `${DAYS[p.from]}${p.to > p.from ? `–${DAYS[p.to]}` : ''} ${parseInt(p.h[0], 10)}–${parseInt(p.h[1], 10)}`).join(' · ');
}

let calWeekStart = mondayOf(new Date());

const slotIndex = t => Math.floor((minutesOf(t) - CAL_HOUR_START * 60) / SLOT_MIN);
const slotTime  = s => hhmm(CAL_HOUR_START * 60 + s * SLOT_MIN);

/* Zeitspalte: volle Stunde kräftig, halbe Stunde nur im ausgeklappten Modus */
function timeColumn() {
  let html = '<div class="cal-col cal-col--time"><div class="cal-col__head"></div><div class="cal-col__body">';
  for (let s = 0; s < CAL_SLOTS; s++) {
    const hour = s % SLOTS_PER_HOUR === 0;
    const half = !hour && s % (SLOTS_PER_HOUR / 2) === 0;
    html += `<div class="cal-time${half ? ' cal-time--half' : ''}">${hour || half ? slotTime(s) : ''}</div>`;
  }
  return html + '</div></div>';
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const weekDates = monday => [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });

function isOpen(dayI, time) {
  const h = STORE_HOURS[dayI];
  return !!h && minutesOf(time) >= minutesOf(h[0]) && minutesOf(time) < minutesOf(h[1]);
}

/* Schlussdurchsagen dürfen bis einschließlich zur Schließzeit laufen –
   alles andere muss innerhalb der Öffnungszeit liegen */
function isAllowedTime(dayI, time, category) {
  const h = STORE_HOURS[dayI];
  if (!h) return false;
  if (category !== 'closing') return isOpen(dayI, time);
  return minutesOf(time) >= minutesOf(h[0]) && minutesOf(time) <= minutesOf(h[1]);
}

function isQuiet(dayI, time) {
  return QUIET_HOURS.some(q => q.day === dayI && minutesOf(time) >= minutesOf(q.from) && minutesOf(time) < minutesOf(q.to));
}

/* Slot-Vorkommen eines Schedules an einem Datum.
   all: auch Quiet Hours und Zeiten außerhalb des Kalender-Rasters liefern
   (für die Konfliktprüfung) */
function occurrences(o, date, { all = false } = {}) {
  const start = parseDate(o.start);
  if (date < start) return [];
  if (o.type === 'single') {
    if (!sameDay(start, date)) return [];
  } else {
    if (o.end && date > parseDate(o.end)) return [];
    if (!(o.days || []).includes(DAYS[dayIdx(date)])) return [];
  }

  const times = [];
  if (o.times) times.push(...o.times);
  else if (o.once) times.push(o.from);
  else {
    for (let t = minutesOf(o.from); t <= minutesOf(o.to); t += o.every) times.push(hhmm(t));
  }
  const di = dayIdx(date);
  const list = times.map(t => ({ time: t, slot: slotIndex(t) }));
  return all ? list : list.filter(x => x.slot >= 0 && x.slot < CAL_SLOTS && !isQuiet(di, x.time));
}

function renderLegend() {
  calLegend.innerHTML = CATEGORIES.map(c =>
    `<span class="cal-legend__item"><span class="cal-legend__dot" style="background:${c.color}"></span>${c.label}</span>`
  ).join('');
}

function renderCalendar() {
  const days = weekDates(calWeekStart);
  const last = days[6];
  const sameMonth = days[0].getMonth() === last.getMonth();
  calRange.textContent = sameMonth
    ? `${MONTH_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${MONTH_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${MONTH_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;

  const cards = [...scheduleList.querySelectorAll('.sched-card')];

  const today = new Date();

  /* Belegung je Tag & Slot */
  const grid = days.map((date, di) => {
    const slots = [...Array(CAL_SLOTS)].map((_, s) => ({
      spots: [],
      closed: !isOpen(di, slotTime(s)),
      quiet: isQuiet(di, slotTime(s)),
    }));
    cards.forEach(card => occurrences(card._opts, date).forEach(({ time, slot }) =>
      slots[slot].spots.push({ card, time })));

    return slots;
  });

  let html = timeColumn();

  /* Tagesleiste (Handy) */
  const mobile = isMobile();
  calDays.innerHTML = days.map((date, di) => `
    <button class="cal-days__btn${di === mobileDay ? ' is-active' : ''}" data-day="${di}" type="button">
      <span>${DAYS[di]}</span><span>${date.getDate()}</span>
    </button>`).join('');

  const total = grid.reduce((n, slots) => n + slots.reduce((m, s) => m + s.spots.length, 0), 0);
  calEmpty.hidden = total > 0;
  calEmpty.textContent = 'Nothing scheduled this week – click a free slot to plan a spot.';

  /* Tagesspalten */
  days.forEach((date, di) => {
    if (mobile && di !== mobileDay) return;
    const slots = grid[di];
    const isToday = sameDay(date, today);
    html += `<div class="cal-col${isToday ? ' cal-col--today' : ''}" data-day="${di}">
      <div class="cal-col__head">${DAY_NAMES[di].slice(0, 3)}<span class="cal-col__date">${date.getDate()}</span></div>
      <div class="cal-col__body">`;

    let skip = 0;
    slots.forEach((slot, s) => {
      if (skip > 0) { skip--; return; }

      /* Quiet Hour als Block */
      if (slot.quiet && !slot.spots.length) {
        let n = 1;
        while (slots[s + n] && slots[s + n].quiet && !slots[s + n].spots.length) n++;
        skip = n - 1;
        html += `<div class="cal-quiet" data-rows="${n}" style="height: calc(${n} * var(--slot-h) + ${n - 1} * var(--slot-gap))">Quiet Hour</div>`;
        return;
      }

      const z = CAL_SLOTS - s;               /* oben liegt über unten */
      if (!slot.spots.length) {
        html += `<div class="cal-slot${slot.closed ? ' cal-slot--closed' : ''}" data-slot="${s}" style="z-index:${z}"><div class="cal-slot__inner"></div></div>`;
        return;
      }

      /* ein Spot pro Slot – mehrere (nur Closing) werden zusammengefasst */
      const sorted = [...slot.spots].sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
      const first = sorted[0];
      const o = first.card._opts;
      const title = sorted.length > 1 ? `${o.title} +${sorted.length - 1}` : o.title;
      html += `<div class="cal-slot cal-slot--spot cal-hit" data-uid="${first.card._uid}" style="${catStyle(o.category)}z-index:${z}">
          <div class="cal-slot__inner">
            <div class="cal-slot__title">
              <span class="cal-slot__time">${first.time}</span>
              ${o.locked
                ? icon('lock', 'cal-slot__lock')
                : `<button class="cal-slot__edit" data-edit="${first.card._uid}" aria-label="Edit schedule" data-tip="Edit" data-tip-pos="bottom" tabindex="-1">${icon('pencil')}</button>`}
              <span class="cal-slot__text">${escapeHtml(title)}</span>
            </div>
          </div>
        </div>`;
    });

    html += '</div></div>';
  });

  calGrid.innerHTML = html;
  litUid = null;
  renderLegend();
  renderNowLine();
}

/* ---- Jetzt-Linie in der heutigen Spalte ---- */
function renderNowLine() {
  calGrid.querySelectorAll('.cal-now').forEach(n => n.remove());
  const col = calGrid.querySelector('.cal-col--today');
  if (!col) return;
  const now = new Date();
  const s = (now.getHours() * 60 + now.getMinutes() - CAL_HOUR_START * 60) / SLOT_MIN;
  if (s < 0 || s >= CAL_SLOTS) return;
  const body = col.querySelector('.cal-col__body');
  /* Slot-Elemente decken die Reihen ab (Quiet-Blöcke mehrere) – Position aus dem DOM */
  let row = 0;
  for (const el of body.querySelectorAll('.cal-slot, .cal-quiet')) {
    const span = parseInt(el.dataset.rows, 10) || 1;
    if (Math.floor(s) < row + span) {
      const line = document.createElement('div');
      line.className = 'cal-now';
      line.style.top = `${el.offsetTop + (s - row) / span * el.offsetHeight}px`;
      body.appendChild(line);
      return;
    }
    row += span;
  }
}

setInterval(() => { if (!calendarView.hidden) renderNowLine(); }, 60000);

calDays.addEventListener('click', e => {
  const btn = e.target.closest('.cal-days__btn');
  if (!btn) return;
  mobileDay = parseInt(btn.dataset.day, 10);
  renderCalendar();
});

let calResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(calResizeTimer);
  calResizeTimer = setTimeout(() => { if (!calendarView.hidden) renderCalendar(); }, 150);
});

/* ---- Hover: alle Slots desselben Spots leuchten auf ---- */
let litUid = null;

function setLit(uid) {
  if (uid === litUid) return;
  litUid = uid;
  calGrid.querySelectorAll('.cal-hit').forEach(s =>
    s.classList.toggle('is-lit', uid !== null && s.dataset.uid === uid));
}

calGrid.addEventListener('mousemove', e => {
  const hit = e.target.closest('.cal-hit');
  if (hit) { setLit(hit.dataset.uid); return; }
  if (e.target.closest('.cal-slot, .cal-quiet, .cal-col__head')) setLit(null);
});

calGrid.addEventListener('mouseleave', () => { setLit(null); closeCalPop(); });

/* ---- Klicks: Stift → bearbeiten, freier Slot → hier einplanen ---- */
let calPop = null;

function closeCalPop() {
  if (calPop) {
    calPop.closest('.cal-slot')?.classList.remove('has-pop');
    calPop.remove();
    calPop = null;
  }
}

calGrid.addEventListener('click', e => {
  const btn = e.target.closest('.cal-slot__edit');
  if (btn) {
    e.stopPropagation();
    const card = [...scheduleList.querySelectorAll('.sched-card')].find(c => String(c._uid) === btn.dataset.edit);
    if (card) { showView('schedule'); requestEdit(card); }
    return;
  }

  const free = e.target.closest('.cal-slot[data-slot]');
  if (!free || free.classList.contains('cal-slot--closed')) return;
  e.stopPropagation();
  closeCalPop();

  const s = parseInt(free.dataset.slot, 10);
  const di = parseInt(free.closest('.cal-col').dataset.day, 10);
  const date = new Date(calWeekStart);
  date.setDate(date.getDate() + di);
  const time = slotTime(s);

  free.classList.add('has-pop');
  calPop = document.createElement('div');
  calPop.className = 'cal-pop';
  calPop.innerHTML = `
    <span class="cal-pop__when">${DAY_NAMES[di].slice(0, 3)} ${date.getDate()} · ${time}</span>
    <button class="ghost-btn ghost-btn--sm ghost-btn--invert cal-pop__btn" type="button">Schedule spot here ${icon('arrow-right')}</button>`;
  calPop.querySelector('.cal-pop__btn').addEventListener('click', () => {
    closeCalPop();
    scheduleFromSlot(date, time);
  });
  free.appendChild(calPop);
});

document.addEventListener('click', e => { if (!e.target.closest('.cal-pop')) closeCalPop(); });

/* ---- Dichte: Collapsed (Farblinien) ↔ Expanded (Slots mit Titel) ----
   FLIP: das Layout springt sofort in den Zielzustand, sichtbar gleitet es
   nur per transform – jede Zeile startet an ihrer alten Position und Höhe.
   Keyframes enthalten nur transform (transform-origin steht fest im CSS),
   damit der Browser sie auf dem Compositor abspielt; Höhen-Transitions über
   ~450 Zeilen hätten jeden Frame ein Layout erzwungen (in Safari ruckelig).
   Das Raster selbst – Fläche und Spaltenlinien – wird per clip-path auf-
   bzw. zugedeckt: ohne Layout, mit exakten runden Ecken.
   Gilt für beide Kalender (normal und Dev): view trägt data-density,
   grid ist das Raster. Laufende Animationen hängen am Raster selbst. */
function morphGrid(view, grid, value, onDone = null) {
  const rows = [...grid.querySelectorAll('.cal-col__body > .cal-time, .cal-col__body > .cal-slot, .cal-col__body > .cal-quiet')];
  const top0 = grid.getBoundingClientRect().top;
  const first = rows.map(el => el.getBoundingClientRect());

  (grid._morphAnims || []).forEach(a => a.cancel());
  grid._morphAnims = [];
  grid.style.minHeight = '';
  const gridFirst = grid.getBoundingClientRect().height;
  view.dataset.density = value;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { if (onDone) onDone(); return; }

  const top1 = grid.getBoundingClientRect().top;
  const last = rows.map(el => el.getBoundingClientRect());
  const gridLast = grid.getBoundingClientRect().height;
  const css = getComputedStyle(view);
  const timing = {
    duration: parseFloat(css.getPropertyValue('--density-dur')) || 560,
    easing: css.getPropertyValue('--ease').trim() || 'ease',
  };

  grid.classList.add('is-morphing', 'is-hiding-titles');
  clearTimeout(grid._titleTimer);
  grid._titleTimer = setTimeout(() => grid.classList.remove('is-hiding-titles'), timing.duration * 0.6);
  rows.forEach((el, i) => {
    const a = first[i], b = last[i];
    let from;
    if (el.classList.contains('cal-time') || el.classList.contains('cal-quiet')) {
      /* reine Text-Zeilen (Uhrzeit, „Quiet Hour“) nur verschieben (mittig), nie stauchen */
      const dy = (a.top - top0 + a.height / 2) - (b.top - top1 + b.height / 2);
      if (Math.abs(dy) < 0.5) return;
      from = `translateY(${dy}px)`;
    } else {
      const dy = (a.top - top0) - (b.top - top1);
      const sy = b.height ? a.height / b.height : 1;
      from = `translateY(${dy}px) scaleY(${sy})`;
    }
    grid._morphAnims.push(el.animate([{ transform: from }, { transform: 'none' }], timing));
  });

  /* Raster für die Dauer mindestens so hoch wie das größere der beiden
     Zustände halten (beim Zuklappen) und den Überstand unten wegclippen */
  const gridMax = Math.max(gridFirst, gridLast);
  const radius = getComputedStyle(grid).borderTopLeftRadius;
  const clip = h => `inset(0px 0px ${gridMax - h}px 0px round ${radius})`;
  grid.style.minHeight = `${gridMax}px`;
  const gridAnim = grid.animate([{ clipPath: clip(gridFirst) }, { clipPath: clip(gridLast) }], timing);
  grid._morphAnims.push(gridAnim);

  gridAnim.finished.then(() => {
    grid.style.minHeight = '';
    grid.classList.remove('is-morphing');
    if (onDone) onDone();
  }, () => {});                                   /* abgebrochen: der nächste Wechsel übernimmt */
}

function morphDensity(value) {
  setLit(null);
  closeCalPop();
  calGrid.querySelectorAll('.cal-now').forEach(n => n.remove());
  morphGrid(calendarView, calGrid, value, renderNowLine);
}

/* Pill-Umschalter: aria-checked = Expanded */
function wireDensityToggle(btn, onChange) {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(expanded));
    btn.dataset.tip = expanded ? 'Collapse' : 'Expand';
    onChange(expanded ? 'expanded' : 'collapsed');
  });
}

wireDensityToggle(document.getElementById('cal-density'), morphDensity);

/* ---- Wochennavigation ---- */
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
calPrev.addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() - 7); renderCalendar(); });
calNext.addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() + 7); renderCalendar(); });
document.getElementById('cal-today').addEventListener('click', () => { calWeekStart = mondayOf(new Date()); renderCalendar(); });

document.addEventListener('keydown', e => {
  if (calendarView.hidden || e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') calPrev.click();
  if (e.key === 'ArrowRight') calNext.click();
});

renderLegend(false);
