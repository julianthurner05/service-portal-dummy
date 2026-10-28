/* ================================================================
   CALENDAR – die Schedule-Oberfläche
   - Woche Mo–Sa im 15-Minuten-Raster, Daten aus plan.js
   - jeder Slot lebt für sich: per Drag & Drop verschieben, über das ✕
     oder durch Ablegen in der Palette entfernen
   - rechts die Liste „Ready for Schedule“: jeder Spot einmal, beliebig oft
     einplanbar (Plan-Spots + im SpotTool freigegebene Spots), mit Suche
   - nach dem Ablegen aus der Liste: kleines Fenster für Wiederholungen
     (Wochentage, Laufzeit bis zu Monaten oder ohne Ende)
   - Hover: alle Slots desselben Spots leuchten auf
   - fixe Slots (Opening/Closing) vergibt sounddna: gesperrt, mit Schloss
   - Collapsed (Farblinien) ↔ Expanded (Slots mit Titel), gleitend
   ================================================================ */

const calGrid      = document.getElementById('cal-grid');
const calRange     = document.getElementById('cal-range');
const calLegend    = document.getElementById('cal-legend');
const calTray      = document.getElementById('cal-tray');
const calTrayList  = document.getElementById('cal-tray-list');
const calTraySearch = document.getElementById('cal-tray-search');
const calTrayEmpty = document.getElementById('cal-tray-empty');

let calWeekStart = mondayOf(new Date());

/* Zeitspalte: volle Stunde kräftig, halbe Stunde nur im Expanded-Modus */
function timeColumn() {
  let html = '<div class="cal-col cal-col--time"><div class="cal-col__head"></div><div class="cal-col__body">';
  for (let s = 0; s < CAL_SLOTS; s++) {
    const hour = s % SLOTS_PER_HOUR === 0;
    const half = !hour && s % (SLOTS_PER_HOUR / 2) === 0;
    html += `<div class="cal-time${half ? ' cal-time--half' : ''}">${hour || half ? slotTime(s) : ''}</div>`;
  }
  return html + '</div></div>';
}

function renderLegend() {
  calLegend.innerHTML = CATEGORIES.map(c =>
    `<span class="cal-legend__item"><span class="cal-legend__dot" style="background:${c.color}"></span>${c.label}</span>`
  ).join('');
}

function weekRangeLabel(days) {
  const first = days[0], last = days[days.length - 1];
  return first.getMonth() === last.getMonth()
    ? `${MONTH_SHORT[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${MONTH_SHORT[first.getMonth()]} ${first.getDate()} – ${MONTH_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
}

function renderCalendar() {
  closeRepeat();
  litSpot = null;
  const days = calWeekDays(calWeekStart);
  calRange.textContent = weekRangeLabel(days);

  const items = weekItems(calWeekStart);
  const fixed = fixedCells(calWeekStart);
  const today = new Date();

  let html = timeColumn();

  days.forEach((date, di) => {
    html += `<div class="cal-col${sameDay(date, today) ? ' cal-col--today' : ''}" data-day="${di}">
      <div class="cal-col__head">${DAY_NAMES[di].slice(0, 3)}<span class="cal-col__date">${date.getDate()}</span></div>
      <div class="cal-col__body">`;

    for (let s = 0; s < CAL_SLOTS; s++) {
      /* fix von sounddna – mehrere in einem Slot werden zusammengefasst */
      const f = fixed.get(`${di}:${s}`);
      if (f) {
        const label = f.length > 1 ? `${f[0].spot.title} +${f.length - 1}` : f[0].spot.title;
        const tip = `${f.map(x => `${x.time} ${x.spot.title}`).join(' · ')} – fixed by sounddna`;
        html += `<div class="cal-slot cal-slot--spot cal-item is-fixed" data-spot="${f[0].spot.id}" title="${escapeHtml(tip)}" style="${catStyle('closing')}">
            <div class="cal-slot__inner"></div>
            <span class="cal-item__label">${escapeHtml(label)}</span>
            ${icon('lock', 'cal-item__lock')}
          </div>`;
        continue;
      }

      const it = items.find(i => i.day === di && i.slot === s);
      if (it) {
        const spot = spotById(it.spotId);
        html += `<div class="cal-slot cal-slot--spot cal-item" draggable="true" data-id="${it.id}" data-spot="${spot.id}" style="${catStyle(spot.category)}">
            <div class="cal-slot__inner"></div>
            <span class="cal-item__label">${escapeHtml(spot.title)}</span>
            <button class="cal-item__x" data-x="${it.id}" aria-label="Remove slot" type="button">${icon('x')}</button>
          </div>`;
        continue;
      }

      /* Stille Stunde: gesperrter Block – kein Drop-Ziel */
      if (isQuiet(di, slotTime(s))) {
        let n = 1;
        while (s + n < CAL_SLOTS && isQuiet(di, slotTime(s + n))) n++;
        html += `<div class="cal-quiet" data-rows="${n}" style="height: calc(${n} * var(--slot-h) + ${n - 1} * var(--slot-gap))">Quiet Hour</div>`;
        s += n - 1;
        continue;
      }

      const closed = !isOpen(di, slotTime(s));
      html += `<div class="cal-slot cal-cell${closed ? ' cal-slot--closed' : ''}" data-day="${di}" data-slot="${s}">
          <div class="cal-slot__inner"></div>
        </div>`;
    }

    html += '</div></div>';
  });

  calGrid.innerHTML = html;
  renderTray();
  renderNowLine();
}

/* ---- Liste „Ready for Schedule“ ---- */
function renderTray() {
  const all = paletteSpots();
  const q = calTraySearch.value.trim().toLowerCase();
  const list = all.filter(s => s.title.toLowerCase().includes(q));
  calTrayList.innerHTML = list.map(s => `
    <div class="cal-tray__item" draggable="true" data-spot="${s.id}" style="${catStyle(s.category)}">
      <span class="cal-item__label">${escapeHtml(s.title)}</span>
    </div>`).join('');
  calTrayEmpty.hidden = list.length > 0;
  calTrayEmpty.textContent = all.length
    ? 'No spots match your search.'
    : 'No spots yet – mark a spot in the SpotTool as Ready for Schedule.';
}

calTraySearch.addEventListener('input', renderTray);

/* ---- Hover: alle Slots desselben Spots leuchten auf – auch beim Zeigen
   auf einen Eintrag der Liste ---- */
let litSpot = null;

function setLit(spotId) {
  if (spotId === litSpot) return;
  litSpot = spotId;
  calGrid.querySelectorAll('.cal-item').forEach(el =>
    el.classList.toggle('is-lit', spotId !== null && el.dataset.spot === spotId));
}

calGrid.addEventListener('mousemove', e => {
  if (calDrag) return;
  const item = e.target.closest('.cal-item');
  setLit(item ? item.dataset.spot : null);
});
calGrid.addEventListener('mouseleave', () => setLit(null));
calTrayList.addEventListener('mouseover', e => {
  if (calDrag) return;
  const item = e.target.closest('.cal-tray__item');
  setLit(item ? item.dataset.spot : null);
});
calTrayList.addEventListener('mouseleave', () => setLit(null));

/* ---- Jetzt-Linie in der heutigen Spalte ---- */
function renderNowLine() {
  calGrid.querySelectorAll('.cal-now').forEach(n => n.remove());
  const col = calGrid.querySelector('.cal-col--today');
  if (!col) return;
  const now = new Date();
  const s = (now.getHours() * 60 + now.getMinutes() - CAL_HOUR_START * 60) / SLOT_MIN;
  if (s < 0 || s >= CAL_SLOTS) return;
  const body = col.querySelector('.cal-col__body');
  /* Zeilen-Elemente decken die Reihen ab (Quiet-Blöcke mehrere) – Position aus dem DOM */
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

/* Spot eingeplant → Karte im SpotTool bekommt das Scheduled-Badge */
function spotPlaced(spot) {
  if (spot) setCardScheduled(spot.title);
}

/* ---------------------------------------------------------------
   Drag & Drop – Palette → Raster (Kopie), Raster → Raster (Verschieben),
   Raster → Palette (Entfernen)
   --------------------------------------------------------------- */
let calDrag = null;                    /* { from: 'grid', id } | { from: 'palette', spotId } */

const dropCell = e => {
  const cell = e.target.closest('.cal-cell');
  return cell && !cell.classList.contains('cal-slot--closed') ? cell : null;
};

function clearDropMarks() {
  calGrid.querySelectorAll('.is-drop').forEach(c => c.classList.remove('is-drop'));
  calTray.classList.remove('is-drop');
}

/* Eigenes Drag-Bild: eine saubere Titel-Pille statt des Browser-Schnappschusses
   (der nahm Überstände wie Tooltips mit und war im Collapsed-Modus nur eine Linie) */
function setDragImage(e, el, spot) {
  const r = el.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'cal-ghost';
  ghost.style.cssText = `${catStyle(spot.category)}width:${Math.round(r.width)}px;`;
  ghost.textContent = spot.title;
  document.body.appendChild(ghost);
  const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
  const y = Math.min(Math.max(e.clientY - r.top, 0), ghost.offsetHeight);
  e.dataTransfer.setDragImage(ghost, x, y);
  setTimeout(() => ghost.remove(), 0);
}

calendarView.addEventListener('dragstart', e => {
  const el = e.target.closest('.cal-item[draggable="true"], .cal-tray__item');
  if (!el) return;
  closeRepeat();
  setLit(null);
  let spot;
  if (el.classList.contains('cal-item')) {
    calDrag = { from: 'grid', id: +el.dataset.id };
    const it = weekItems(calWeekStart).find(i => i.id === calDrag.id);
    spot = it && spotById(it.spotId);
  } else {
    calDrag = { from: 'palette', spotId: +el.dataset.spot };
    spot = spotById(calDrag.spotId);
  }
  e.dataTransfer.effectAllowed = calDrag.from === 'palette' ? 'copy' : 'move';
  e.dataTransfer.setData('text/plain', spot ? spot.title : '');
  if (spot) setDragImage(e, el, spot);
  if (calDrag.from === 'grid') requestAnimationFrame(() => el.classList.add('is-dragging'));
});

calendarView.addEventListener('dragend', () => {
  calDrag = null;
  clearDropMarks();
  calGrid.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
});

/* freie Zellen nehmen Slots an */
calGrid.addEventListener('dragover', e => {
  const cell = dropCell(e);
  if (!cell || !calDrag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = calDrag.from === 'palette' ? 'copy' : 'move';
  clearDropMarks();
  cell.classList.add('is-drop');
});

calGrid.addEventListener('drop', e => {
  const cell = dropCell(e);
  if (!cell || !calDrag) return;
  e.preventDefault();
  const day = +cell.dataset.day;
  const slot = +cell.dataset.slot;
  let placed = null;
  if (calDrag.from === 'grid') {
    moveItem(calWeekStart, calDrag.id, day, slot);
  } else {
    placed = placeSpot(calWeekStart, calDrag.spotId, day, slot);
    if (placed) spotPlaced(spotById(calDrag.spotId));
  }
  calDrag = null;
  renderCalendar();
  if (placed) openRepeat(placed);
});

/* die Palette nimmt Slots aus dem Raster an – der Slot wird entfernt,
   die Palette selbst bleibt unverändert */
calTray.addEventListener('dragover', e => {
  if (!calDrag || calDrag.from !== 'grid') return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  calTray.classList.add('is-drop');
});

calTray.addEventListener('dragleave', e => {
  if (!calTray.contains(e.relatedTarget)) calTray.classList.remove('is-drop');
});

calTray.addEventListener('drop', e => {
  if (!calDrag || calDrag.from !== 'grid') return;
  e.preventDefault();
  removeItem(calWeekStart, calDrag.id);
  calDrag = null;
  clearDropMarks();
  renderCalendar();
});

/* ---------------------------------------------------------------
   ✕ entfernt einen einzelnen Slot
   --------------------------------------------------------------- */
calGrid.addEventListener('click', e => {
  const x = e.target.closest('.cal-item__x');
  if (!x) return;
  e.stopPropagation();
  removeItem(calWeekStart, +x.dataset.x);
  renderCalendar();
});

/* ---------------------------------------------------------------
   Wiederholen – kleines Fenster direkt nach dem Ablegen aus der Liste:
   Once (nur dieser Slot) oder Weekly (Wochentage + Laufzeit). Weekly legt
   eine Serie an (plan.js), die auch für spätere Wochen gilt.
   --------------------------------------------------------------- */
const addDays   = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const RUNS = [
  { value: '1w',   label: '1 week',   end: d => addDays(d, 6) },
  { value: '1m',   label: '1 month',  end: d => addDays(addMonths(d, 1), -1) },
  { value: '3m',   label: '3 months', end: d => addDays(addMonths(d, 3), -1) },
  { value: '6m',   label: '6 months', end: d => addDays(addMonths(d, 6), -1) },
  { value: 'none', label: 'No end',   end: () => null },
];
const longDate = d => `${DAY_NAMES[dayIdx(d)].slice(0, 3)} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;

function daysLabel(days) {
  const idx = DAYS.slice(0, CAL_DAYS).map((d, i) => (days.includes(d) ? i : -1)).filter(i => i >= 0);
  const run = idx.length > 2 && idx[idx.length - 1] - idx[0] === idx.length - 1;
  return run ? `${DAYS[idx[0]]}–${DAYS[idx[idx.length - 1]]}` : idx.map(i => DAYS[i]).join(', ');
}

let repeatEl = null;
let repeat = null;                    /* { item, spot, date, mode, days: Set, run } */

function closeRepeat() {
  if (!repeatEl) return;
  repeatEl.remove();
  repeatEl = null;
  repeat = null;
}

function openRepeat(item) {
  closeRepeat();
  const spot = spotById(item.spotId);
  const date = calWeekDays(calWeekStart)[item.day];
  repeat = { item, spot, date, mode: 'once', days: new Set([DAYS[item.day]]), run: '1m' };
  repeatEl = document.createElement('div');
  repeatEl.className = 'cal-repeat';
  repeatEl.setAttribute('role', 'dialog');
  repeatEl.style.cssText = catStyle(spot.category);
  repeatEl.addEventListener('click', onRepeatClick);
  calendarView.appendChild(repeatEl);
  renderRepeat();
  placeRepeat();
}

function renderRepeat() {
  const r = repeat;
  const weekly = r.mode === 'weekly';
  const time = slotTime(r.item.slot);
  const run = RUNS.find(x => x.value === r.run);
  const end = run.end(r.date);
  const days = [...r.days];
  let sum;
  if (!weekly) {
    sum = `Only on ${longDate(r.date)} at ${time}.`;
  } else if (!days.length) {
    sum = 'Pick at least one day.';
  } else {
    const n = end ? seriesDates({ days, start: r.date, end }) : null;
    sum = `Every ${daysLabel(days)} at ${time}${end ? ` until ${longDate(end)} · ${n} announcement${n === 1 ? '' : 's'}` : ', with no end date'}.`;
  }

  repeatEl.innerHTML = `
    <div class="cal-repeat__head">
      <span class="cal-repeat__dot"></span>
      <p class="cal-repeat__title">${escapeHtml(r.spot.title)}</p>
    </div>
    <p class="cal-repeat__when">${longDate(r.date)} · ${time}</p>

    <div class="cal-seg">
      <button class="cal-seg__opt${weekly ? '' : ' is-active'}" data-mode="once" type="button">Once</button>
      <button class="cal-seg__opt${weekly ? ' is-active' : ''}" data-mode="weekly" type="button">Weekly</button>
    </div>

    ${weekly ? `
      <p class="cal-repeat__label">On</p>
      <div class="cal-chips">
        ${DAYS.slice(0, CAL_DAYS).map(d => `<button class="cal-chip cal-chip--day${r.days.has(d) ? ' is-active' : ''}" data-day="${d}" type="button">${d}</button>`).join('')}
      </div>
      <p class="cal-repeat__label">Runs for</p>
      <div class="cal-chips">
        ${RUNS.map(x => `<button class="cal-chip${x.value === r.run ? ' is-active' : ''}" data-run="${x.value}" type="button">${x.label}</button>`).join('')}
      </div>` : ''}

    <p class="cal-repeat__sum">${sum}</p>

    <div class="cal-repeat__foot">
      <button class="ghost-btn ghost-btn--sm ghost-btn--danger" data-act="remove" type="button">Remove</button>
      <button class="ghost-btn ghost-btn--sm ghost-btn--invert" data-act="done" type="button"${weekly && !days.length ? ' disabled' : ''}>Done</button>
    </div>`;
}

/* neben den abgelegten Slot setzen – rechts davon, sonst links; im Bild halten */
function placeRepeat() {
  const slotEl = calGrid.querySelector(`.cal-item[data-id="${repeat.item.id}"]`);
  if (!slotEl) return;
  const view = calendarView.getBoundingClientRect();
  const r = slotEl.getBoundingClientRect();
  const w = repeatEl.offsetWidth, h = repeatEl.offsetHeight;
  let left = r.right + 10;
  if (left + w > window.innerWidth - 16) left = r.left - 10 - w;
  let top = r.top - 12;
  top = Math.min(top, window.innerHeight - h - 16);
  top = Math.max(top, 16);
  repeatEl.style.left = `${left - view.left}px`;
  repeatEl.style.top = `${top - view.top}px`;
}

function onRepeatClick(e) {
  e.stopPropagation();
  const r = repeat;
  const mode = e.target.closest('[data-mode]');
  const day = e.target.closest('[data-day]');
  const run = e.target.closest('[data-run]');
  const act = e.target.closest('[data-act]');
  if (mode) r.mode = mode.dataset.mode;
  else if (day) r.days.has(day.dataset.day) ? r.days.delete(day.dataset.day) : r.days.add(day.dataset.day);
  else if (run) r.run = run.dataset.run;
  else if (act && act.dataset.act === 'remove') {
    removeItem(calWeekStart, r.item.id);
    renderCalendar();
    return;
  } else if (act && act.dataset.act === 'done') {
    applyRepeat();
    return;
  } else return;
  renderRepeat();
  placeRepeat();
}

function applyRepeat() {
  const r = repeat;
  if (r.mode === 'once') { closeRepeat(); return; }
  const days = DAYS.filter(d => r.days.has(d));
  const end = RUNS.find(x => x.value === r.run).end(r.date);
  /* der abgelegte Slot geht in der Serie auf */
  removeItem(calWeekStart, r.item.id);
  const { skipped } = addSeries({ spotId: r.spot.id, days, slot: r.item.slot, start: r.date, end });
  const time = slotTime(r.item.slot);
  showToast('success', `“${r.spot.title}” repeats every ${daysLabel(days)} at ${time}${end ? ` until ${longDate(end)}` : ''}.${skipped ? ` ${skipped} taken slot${skipped === 1 ? '' : 's'} skipped.` : ''}`);
  renderCalendar();
}

document.addEventListener('click', e => { if (repeatEl && !e.target.closest('.cal-repeat')) closeRepeat(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRepeat(); });
window.addEventListener('resize', () => { if (repeatEl) placeRepeat(); });

/* neue oder gelöschte Spots aus dem SpotTool sofort in der Palette */
onPlanChange(kind => {
  if (calendarView.hidden) return;
  if (kind === 'spots') renderTray();
  if (kind === 'week' && !calDrag) renderCalendar();
});

/* ---------------------------------------------------------------
   Dichte: Collapsed (Farblinien) ↔ Expanded (Slots mit Titel)
   FLIP: das Layout springt sofort in den Zielzustand, sichtbar gleitet es
   nur per transform – jede Zeile startet an ihrer alten Position und Höhe.
   Keyframes enthalten nur transform (transform-origin steht fest im CSS),
   damit der Browser sie auf dem Compositor abspielt; Höhen-Transitions über
   ~450 Zeilen hätten jeden Frame ein Layout erzwungen (in Safari ruckelig).
   Das Raster selbst – Fläche und Spaltenlinien – wird per clip-path auf-
   bzw. zugedeckt: ohne Layout, mit exakten runden Ecken.
   --------------------------------------------------------------- */
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

/* Pill-Umschalter: aria-checked = Expanded */
const densityToggle = document.getElementById('cal-density');
densityToggle.addEventListener('click', () => {
  const expanded = densityToggle.getAttribute('aria-checked') !== 'true';
  densityToggle.setAttribute('aria-checked', String(expanded));
  densityToggle.dataset.tip = expanded ? 'Collapse' : 'Expand';
  closeRepeat();
  calGrid.querySelectorAll('.cal-now').forEach(n => n.remove());
  morphGrid(calendarView, calGrid, expanded ? 'expanded' : 'collapsed', renderNowLine);
});

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

renderLegend();
