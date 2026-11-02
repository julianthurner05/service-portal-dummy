/* ================================================================
   CALENDAR – die Schedule-Oberfläche
   - Woche Mo–Sa im 15-Minuten-Raster, Daten aus plan.js
   - jeder Slot lebt für sich: per Drag & Drop verschieben, über das ✕
     oder durch Ablegen in der Palette entfernen
   - rechts die Liste „Ready for Schedule“: jeder Spot einmal, beliebig oft
     einplanbar (Plan-Spots + im SpotTool freigegebene Spots), mit Suche;
     nach Kategorien gruppiert – Ziehen in eine andere Gruppe ändert die
     Kategorie. Frische Spots stehen unten unter „New“ und müssen erst in
     eine Kategorie gezogen werden, bevor sie einplanbar sind
   - nach dem Ablegen aus der Liste färbt sich das Ready-Feld ein und zeigt
     die Einstellungen: Tage (dieser Tag / wöchentlich mit Laufzeit bis zu
     Monaten oder ohne Ende) und pro Tag einmal oder Repeat (alle N Minuten)
   - ⌘Z / ⇧⌘Z: letzte Änderung im Calendar rückgängig / wiederherstellen
   - Hover: alle Slots desselben Spots leuchten auf
   - Option (Alt) beim Ziehen eines Slots: kopieren statt verschieben
   - Kopfzeile, Tageszeile und Liste bleiben beim Scrollen stehen
   - fixe Slots (Opening/Closing) vergibt sounddna: gesperrt, mit Schloss
   ================================================================ */

const calGrid      = document.getElementById('cal-grid');
const calRange     = document.getElementById('cal-range');
const calTray      = document.getElementById('cal-tray');
const calTrayList  = document.getElementById('cal-tray-list');
const calTraySearch = document.getElementById('cal-tray-search');
const calTrayEmpty = document.getElementById('cal-tray-empty');
const calTraySettings = document.getElementById('cal-tray-settings');

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

function weekRangeLabel(days) {
  const first = days[0], last = days[days.length - 1];
  return first.getMonth() === last.getMonth()
    ? `${MONTH_SHORT[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${MONTH_SHORT[first.getMonth()]} ${first.getDate()} – ${MONTH_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
}

function renderCalendar() {
  litSpot = null;
  const days = calWeekDays(calWeekStart);
  calRange.textContent = weekRangeLabel(days);

  const items = weekItems(calWeekStart);
  const fixed = fixedCells(calWeekStart);
  const today = new Date();

  let html = timeColumn();

  days.forEach((date, di) => {
    /* vergangener Tag: nur noch zum Nachsehen – kein Ziehen, Löschen, Ablegen */
    const past = dayStart(date) < dayStart(today);
    html += `<div class="cal-col${sameDay(date, today) ? ' cal-col--today' : ''}${past ? ' cal-col--past' : ''}" data-day="${di}">
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
        html += `<div class="cal-slot cal-slot--spot cal-item"${past ? '' : ' draggable="true"'} data-id="${it.id}" data-spot="${spot.id}" style="${catStyle(spot.category)}">
            <div class="cal-slot__inner"></div>
            <span class="cal-item__label">${escapeHtml(spot.title)}</span>
            ${past ? '' : `<button class="cal-item__x" data-x="${it.id}" aria-label="Remove slot" type="button">${icon('x')}</button>`}
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
  syncHeadHeight();

  /* Bearbeitungsmodus übersteht den Wochenwechsel; er endet erst, wenn der
     abgelegte Slot weg ist (Remove, Undo …) */
  if (repeat) {
    if (weekItems(repeat.week).some(i => i.id === repeat.item.id)) {
      calGrid.querySelector(`.cal-item[data-id="${repeat.item.id}"]`)?.classList.add('is-target');
      paintPreview();
    } else {
      closeRepeat();
    }
  }
}

/* Tageszeile und Liste docken direkt unter der (sticky) Kopfzeile an. Sticky-
   Abstände zählen ab dem Innenabstand des Scrollbereichs, die Kopfzeile reicht
   aber darüber hinaus bis an die Oberkante – den Teil ziehen wir ab. */
const calHead = calendarView.querySelector('.cal-head');
const mainEl  = document.querySelector('.main');
function syncHeadHeight() {
  const cs = getComputedStyle(mainEl);
  const pad = parseFloat(cs.paddingTop) || 0;
  calendarView.style.setProperty('--main-pad', `${pad}px`);
  calendarView.style.setProperty('--main-pad-b', `${parseFloat(cs.paddingBottom) || 0}px`);
  calendarView.style.setProperty('--head-h', `${calHead.offsetHeight - pad}px`);
}
window.addEventListener('resize', () => { if (!calendarView.hidden) syncHeadHeight(); });

/* ---- Liste „Ready for Schedule“ ----
   Gruppen je Kategorie (Opening/Closing vergibt sounddna – keine Gruppe),
   darunter „New“ für frisch freigegebene Spots ohne Kategorie und ganz
   unten „Expired“ für zeitlich begrenzte Spots, deren Laufzeit vorbei ist */
const TRAY_CATS = CATEGORIES.filter(c => c.value !== 'closing');

const trayItem = (s, expired) => `
  <div class="cal-tray__item${s.category ? '' : ' is-new'}${expired ? ' is-expired' : ''}" draggable="true" data-spot="${s.id}" style="${s.category ? catStyle(s.category) : ''}">
    <span class="cal-item__label">${escapeHtml(s.title)}</span>
  </div>`;

function renderTray() {
  const all = paletteSpots();
  const q = calTraySearch.value.trim().toLowerCase();
  const found = all.filter(s => s.title.toLowerCase().includes(q));
  const expired = found.filter(isSpotExpired);
  const list = found.filter(s => !expired.includes(s));

  /* Gruppen bleiben auch leer stehen – sie sind Ablageziele; nur beim Suchen
     verschwinden leere */
  let html = TRAY_CATS.map(cat => {
    const group = list.filter(s => s.category === cat.value);
    if (q && !group.length) return '';
    return `
      <div class="cal-tray__group" data-cat="${cat.value}">
        <p class="cal-tray__cat"><span class="cal-tray__dot" style="background:${cat.color}"></span>${cat.label}<span class="cal-tray__count">${group.length}</span></p>
        ${group.length ? group.map(s => trayItem(s)).join('') : '<p class="cal-tray__none">Drop a spot here</p>'}
      </div>`;
  }).join('');

  const fresh = list.filter(s => !s.category);
  if (fresh.length) {
    html += `
      <div class="cal-tray__group cal-tray__group--new">
        <p class="cal-tray__cat">New<span class="cal-tray__count">${fresh.length}</span></p>
        <p class="cal-tray__note">Drag into a category to schedule.</p>
        ${fresh.map(s => trayItem(s)).join('')}
      </div>`;
  }

  /* wieder einplanen holt einen abgelaufenen Spot zurück in seine Gruppe */
  if (expired.length) {
    html += `
      <div class="cal-tray__group cal-tray__group--expired">
        <p class="cal-tray__cat">Expired<span class="cal-tray__count">${expired.length}</span></p>
        <p class="cal-tray__note">Time-limited runs that have ended.</p>
        ${expired.map(s => trayItem(s, true)).join('')}
      </div>`;
  }
  calTrayList.innerHTML = html;
  calTrayEmpty.hidden = found.length > 0 || !q;
  calTrayEmpty.textContent = 'No spots match your search.';
}

calTraySearch.addEventListener('input', renderTray);

/* ---- Hover: alle Slots desselben Spots leuchten auf – auch beim Zeigen
   auf einen Eintrag der Liste ---- */
let litSpot = null;

function setLit(spotId) {
  if (spotId === litSpot) return;
  litSpot = spotId;
  calGrid.querySelectorAll('.cal-col:not(.cal-col--past) .cal-item').forEach(el =>
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
let calDrag = null;                    /* { from: 'grid', id, spotId, el } | { from: 'palette', spotId } */

/* Slot aus dem Raster: mit Option (Alt) kopieren, sonst verschieben –
   Option darf auch erst während des Ziehens gedrückt werden */
const isCopy = e => calDrag && calDrag.from === 'grid' && e.altKey;

const dropCell = e => {
  const cell = e.target.closest('.cal-cell');
  return cell && !cell.classList.contains('cal-slot--closed') && !cell.closest('.cal-col--past') ? cell : null;
};

function clearDropMarks() {
  calGrid.querySelectorAll('.is-drop').forEach(c => c.classList.remove('is-drop'));
  calTrayList.querySelectorAll('.is-drop').forEach(g => g.classList.remove('is-drop'));
  calTray.classList.remove('is-drop');
}

/* Spot aus „New“ (noch ohne Kategorie): erst in eine Kategorie ziehen */
const dragIsNew = () => calDrag && calDrag.from === 'palette' && !spotById(calDrag.spotId).category;

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
    const it = weekItems(calWeekStart).find(i => i.id === +el.dataset.id);
    calDrag = { from: 'grid', id: it.id, spotId: it.spotId, el };
    spot = spotById(it.spotId);
  } else {
    calDrag = { from: 'palette', spotId: +el.dataset.spot };
    spot = spotById(calDrag.spotId);
  }
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', spot ? spot.title : '');
  if (spot) setDragImage(e, el, spot);
  /* beim Verschieben verblasst das Original, beim Kopieren bleibt es stehen */
  if (calDrag.from === 'grid' && !e.altKey) requestAnimationFrame(() => el.classList.add('is-dragging'));
});

/* Rahmen um die Kategorie-Gruppen erst, wenn ein Spot aus der Liste über dem
   Ready-Feld gezogen wird – beim Ziehen in den Kalender bleiben sie weg */
calendarView.addEventListener('dragover', e => {
  if (!calDrag || calDrag.from !== 'palette') return;
  const inTray = !!e.target.closest('.cal-tray');
  calTray.classList.toggle('is-sorting', inTray);
  calTray.classList.toggle('is-sorting-new', inTray && dragIsNew());
});

calendarView.addEventListener('dragend', () => {
  calDrag = null;
  calTray.classList.remove('is-sorting', 'is-sorting-new');
  clearDropMarks();
  calGrid.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
});

/* freie Zellen nehmen Slots an */
calGrid.addEventListener('dragover', e => {
  if (calDrag && calDrag.from === 'grid') calDrag.el.classList.toggle('is-dragging', !e.altKey);
  const cell = dropCell(e);
  if (!cell || !calDrag || dragIsNew()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = calDrag.from === 'palette' || isCopy(e) ? 'copy' : 'move';
  clearDropMarks();
  cell.classList.add('is-drop');
});

calGrid.addEventListener('drop', e => {
  const cell = dropCell(e);
  if (!cell || !calDrag || dragIsNew()) return;
  e.preventDefault();
  const day = +cell.dataset.day;
  const slot = +cell.dataset.slot;
  recordUndo();
  let placed = null;
  if (isCopy(e)) {
    placeSpot(calWeekStart, calDrag.spotId, day, slot);
  } else if (calDrag.from === 'grid') {
    moveItem(calWeekStart, calDrag.id, day, slot);
  } else {
    placed = placeSpot(calWeekStart, calDrag.spotId, day, slot);
    if (placed) spotPlaced(spotById(calDrag.spotId));
  }
  calDrag = null;
  renderCalendar();
  if (placed) openRepeat(placed);
});

/* Liste als Ablage:
   - Slot aus dem Raster → wird aus dem Kalender entfernt
   - Spot aus der Liste in eine andere Kategorie-Gruppe → Kategorie (und
     Farbe überall) ändert sich */
const targetGroup = e => {
  const g = e.target.closest('.cal-tray__group[data-cat]');
  return g && g.dataset.cat !== spotById(calDrag.spotId).category ? g : null;
};

calTray.addEventListener('dragover', e => {
  if (!calDrag) return;
  if (calDrag.from === 'grid') {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    calTray.classList.add('is-drop');
    return;
  }
  const g = targetGroup(e);
  calTrayList.querySelectorAll('.cal-tray__group.is-drop').forEach(x => { if (x !== g) x.classList.remove('is-drop'); });
  if (!g) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  g.classList.add('is-drop');
});

calTray.addEventListener('dragleave', e => {
  if (!calTray.contains(e.relatedTarget)) clearDropMarks();
});

calTray.addEventListener('drop', e => {
  if (!calDrag) return;
  e.preventDefault();
  if (calDrag.from === 'grid') {
    recordUndo();
    removeItem(calWeekStart, calDrag.id);
  } else {
    const g = targetGroup(e);
    if (g) { recordUndo(); setSpotCategory(calDrag.spotId, g.dataset.cat); }
  }
  calDrag = null;
  calTray.classList.remove('is-sorting', 'is-sorting-new');
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
  recordUndo();
  removeItem(calWeekStart, +x.dataset.x);
  renderCalendar();
});

/* ---------------------------------------------------------------
   Einstellungen nach dem Ablegen – im Ready-Feld, das sich dafür in der
   Kategoriefarbe einfärbt:
   - Days: dieser Tag oder Weekly (Wochentage + Laufzeit)
   - Times per day: einmal oder Repeat (alle N Minuten bis Uhrzeit)
   Weekly legt eine Serie an (plan.js), die auch für spätere Wochen gilt.
   --------------------------------------------------------------- */
/* Enddatum: null = infinite, '' = noch nicht gewählt, sonst 'dd.mm.yyyy' */
const endOf = r => (r.end ? parseDate(r.end) : null);
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Datepicker wie im alten Scheduler: Monatsansicht, Montag zuerst, optional
   „Set to infinite“; Tage vor min sind gesperrt */
function openDatepicker(field, { value, min = null, onSelect, allowInfinite = false, onInfinite = null }) {
  closeAllMenus();
  const selected = value ? parseDate(value) : (min || new Date());
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
      const off = min && date < min;
      cells += `<button class="datepicker__day${muted ? ' is-muted' : ''}${off ? ' is-disabled' : ''}${label === value ? ' is-selected' : ''}${label === today ? ' is-today' : ''}" data-date="${label}" type="button"${off ? ' disabled' : ''}>${date.getDate()}</button>`;
    }
    pop.innerHTML = `
      <div class="datepicker__head">
        <button class="datepicker__nav" data-nav="-1" type="button">${icon('chevron-left')}</button>
        <span class="datepicker__month">${MONTH_LONG[viewMonth]} ${viewYear}</span>
        <button class="datepicker__nav" data-nav="1" type="button">${icon('chevron-right')}</button>
      </div>
      <div class="datepicker__grid">
        ${DAYS.map(d => `<span class="datepicker__dow">${d}</span>`).join('')}
        ${cells}
      </div>
      ${allowInfinite ? `<div class="datepicker__foot"><button class="datepicker__infinite" type="button">${icon('infinity')}Set to infinite</button></div>` : ''}`;
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
    const day = e.target.closest('[data-date]:not([disabled])');
    if (day) { pop.remove(); onSelect(day.dataset.date); return; }
    if (e.target.closest('.datepicker__infinite')) { pop.remove(); if (onInfinite) onInfinite(); }
  });

  render();
}
const EVERY = [15, 30, 45, 60, 90, 120];
const longDate = d => `${DAY_NAMES[dayIdx(d)].slice(0, 3)} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;

function daysLabel(days) {
  const idx = DAYS.slice(0, CAL_DAYS).map((d, i) => (days.includes(d) ? i : -1)).filter(i => i >= 0);
  const run = idx.length > 2 && idx[idx.length - 1] - idx[0] === idx.length - 1;
  return run ? `${DAYS[idx[0]]}–${DAYS[idx[idx.length - 1]]}` : idx.map(i => DAYS[i]).join(', ');
}

let repeat = null;                    /* { item, week, spot, date, mode: 'day'|'weekly', days: Set, end, perDay: 'once'|'repeat', every, until } */

/* Uhrzeiten eines Tages mit der aktuellen Einstellung (Slot-Indizes) */
function repeatSlots(r) {
  if (r.perDay === 'once') return [r.item.slot];
  const step = r.every / SLOT_MIN;
  const last = slotIndex(r.until);
  const list = [];
  for (let s = r.item.slot; s <= last && s < CAL_SLOTS; s += step) list.push(s);
  return list;
}

function closeRepeat() {
  if (!repeat) return;
  clearPreview();
  repeat = null;
  calTraySettings.hidden = true;
  calTraySettings.innerHTML = '';
  calTray.classList.remove('is-editing');
  calTray.removeAttribute('style');
  calendarView.classList.remove('is-editing');
  calGrid.querySelectorAll('.cal-item.is-target').forEach(el => el.classList.remove('is-target'));
}

function openRepeat(item) {
  closeRepeat();
  const spot = spotById(item.spotId);
  const date = calWeekDays(calWeekStart)[item.day];
  const lastStart = slotTime(CAL_SLOTS - 1);
  const until = minutesOf(slotTime(item.slot)) < minutesOf('18:00') ? '18:00' : lastStart;
  repeat = { item, week: new Date(calWeekStart), spot, date, mode: 'day', days: new Set([DAYS[item.day]]), end: null, perDay: 'once', every: 60, until };
  calTray.classList.add('is-editing');
  calTray.style.cssText = catStyle(spot.category);
  calTraySettings.hidden = false;
  /* Bearbeitungsmodus: bestehende Slots treten zurück, der abgelegte bleibt */
  calendarView.classList.add('is-editing');
  calGrid.querySelector(`.cal-item[data-id="${item.id}"]`)?.classList.add('is-target');
  renderRepeat();
}

function renderRepeat() {
  const r = repeat;
  const weekly = r.mode === 'weekly';
  const repeating = r.perDay === 'repeat';

  calTraySettings.innerHTML = `
    <div class="cal-repeat__head">
      <span class="cal-repeat__dot"></span>
      <p class="cal-repeat__title">${escapeHtml(r.spot.title)}</p>
      <button class="cal-repeat__close" data-act="close" aria-label="Close settings" type="button">${icon('x')}</button>
    </div>

    <p class="cal-repeat__label">Days</p>
    <div class="cal-seg">
      <button class="cal-seg__opt${weekly ? '' : ' is-active'}" data-mode="day" type="button">This day</button>
      <button class="cal-seg__opt${weekly ? ' is-active' : ''}" data-mode="weekly" type="button">Weekly</button>
    </div>
    ${weekly ? `
      <div class="cal-chips cal-chips--days">
        ${DAYS.slice(0, CAL_DAYS).map(d => `<button class="cal-chip cal-chip--day${r.days.has(d) ? ' is-active' : ''}" data-day="${d}" type="button">${d}</button>`).join('')}
      </div>
      <p class="cal-repeat__label">Runs until</p>
      <div class="field field--date">
        <button class="field__btn" data-act="end" type="button"><span class="${r.end === '' ? 'is-placeholder' : ''}">${r.end === null ? 'infinite' : (r.end || 'Select end date')}</span></button>
        <button class="field__aux" data-act="end-aux" type="button" aria-label="${r.end === null ? 'Remove infinite' : 'Set to infinite'}">${icon(r.end === null ? 'x' : 'infinity')}</button>
      </div>` : ''}

    <p class="cal-repeat__label">Times per day</p>
    <div class="cal-seg">
      <button class="cal-seg__opt${repeating ? '' : ' is-active'}" data-per="once" type="button">Once</button>
      <button class="cal-seg__opt${repeating ? ' is-active' : ''}" data-per="repeat" type="button">Repeat</button>
    </div>
    ${repeating ? `
      <div class="cal-repeat__fields">
        <label class="cal-repeat__field"><span>Every</span><div class="dropdown" data-dd="every"></div></label>
        <label class="cal-repeat__field"><span>Until</span><div class="dropdown" data-dd="until"></div></label>
      </div>` : ''}

    <div class="cal-repeat__foot">
      <button class="ghost-btn ghost-btn--sm ghost-btn--danger" data-act="remove" type="button">Remove</button>
      <button class="ghost-btn ghost-btn--sm ghost-btn--invert" data-act="done" type="button"${weekly && (!r.days.size || r.end === '') ? ' disabled' : ''}>Done</button>
    </div>`;

  if (repeating) {
    buildDropdown(calTraySettings.querySelector('[data-dd="every"]'), {
      options: EVERY.map(m => ({ value: String(m), label: `${m} min` })),
      value: String(r.every),
      onChange: v => { r.every = +v; renderRepeat(); },
    });
    const untilOptions = [];
    for (let s = r.item.slot + 1; s < CAL_SLOTS; s++) untilOptions.push({ value: slotTime(s), label: slotTime(s) });
    if (!untilOptions.some(o => o.value === r.until) && untilOptions.length) r.until = untilOptions[untilOptions.length - 1].value;
    buildDropdown(calTraySettings.querySelector('[data-dd="until"]'), {
      options: untilOptions,
      value: r.until,
      tall: true,
      onChange: v => { r.until = v; renderRepeat(); },
    });
  }
  paintPreview();
}

/* Vorschau: in diesen freien Zellen der angezeigten Woche landet der Spot mit
   der aktuellen Einstellung – leicht angedeutet, bevor man „Done“ drückt.
   Auch in anderen Wochen, solange die Bearbeitung offen ist. */
function clearPreview() {
  calGrid.querySelectorAll('.cal-cell.is-preview').forEach(cell => {
    cell.classList.remove('is-preview');
    cell.removeAttribute('style');
    cell.querySelector('.cal-item__label')?.remove();
  });
}

function paintPreview() {
  clearPreview();
  const r = repeat;
  if (r.mode === 'weekly' && (!r.days.size || r.end === '')) return;
  const end = endOf(r);
  const rule = { days: [...r.days], start: dayStart(r.date), end: end ? dayStart(end) : null };
  const slots = repeatSlots(r);
  const own = sameDay(calWeekStart, r.week);
  calWeekDays(calWeekStart).forEach((date, di) => {
    const onDay = r.mode === 'weekly' ? seriesOn(rule, date, di) : own && di === r.item.day;
    if (!onDay) return;
    slots.forEach(slot => {
      if (own && di === r.item.day && slot === r.item.slot) return;
      const cell = calGrid.querySelector(`.cal-cell[data-day="${di}"][data-slot="${slot}"]:not(.cal-slot--closed)`);
      if (!cell) return;                         /* belegt, Quiet Hour oder geschlossen → wird übersprungen */
      cell.classList.add('is-preview');
      cell.setAttribute('style', catStyle(r.spot.category));
      cell.insertAdjacentHTML('beforeend', `<span class="cal-item__label">${escapeHtml(r.spot.title)}</span>`);
    });
  });
}

calTraySettings.addEventListener('click', e => {
  const r = repeat;
  if (!r) return;
  const mode = e.target.closest('[data-mode]');
  const per = e.target.closest('[data-per]');
  const day = e.target.closest('[data-day]');
  const act = e.target.closest('[data-act]');
  if (mode) r.mode = mode.dataset.mode;
  else if (per) r.perDay = per.dataset.per;
  else if (day) r.days.has(day.dataset.day) ? r.days.delete(day.dataset.day) : r.days.add(day.dataset.day);
  else if (act && act.dataset.act === 'end') {
    e.stopPropagation();
    openDatepicker(act.closest('.field--date'), {
      value: r.end || fmtDate(r.date),
      min: dayStart(r.date),
      allowInfinite: true,
      onSelect: d => { r.end = d; renderRepeat(); },
      onInfinite: () => { r.end = null; renderRepeat(); },
    });
    return;
  }
  /* ✕ nimmt „infinite“ weg (Feld wird leer), ∞ setzt es wieder */
  else if (act && act.dataset.act === 'end-aux') r.end = r.end === null ? '' : null;
  else if (act && act.dataset.act === 'close') { closeRepeat(); return; }
  else if (act && act.dataset.act === 'remove') {
    recordUndo();
    removeItem(r.week, r.item.id);
    renderCalendar();
    return;
  } else if (act && act.dataset.act === 'done') {
    applyRepeat();
    return;
  } else return;
  renderRepeat();
});

function applyRepeat() {
  const r = repeat;
  const slots = repeatSlots(r);
  const time = slotTime(r.item.slot);
  const perDay = slots.length > 1 ? `every ${r.every} min from ${time} to ${slotTime(slots[slots.length - 1])}` : `at ${time}`;
  if (r.mode === 'day') {
    if (slots.length === 1) { closeRepeat(); return; }
    recordUndo();
    let skipped = 0;
    slots.slice(1).forEach(slot => { if (!placeSpot(r.week, r.spot.id, r.item.day, slot)) skipped++; });
    showToast('success', `“${r.spot.title}” runs ${perDay} on ${longDate(r.date)}.${skipped ? ` ${skipped} taken slot${skipped === 1 ? '' : 's'} skipped.` : ''}`);
  } else {
    const days = DAYS.filter(d => r.days.has(d));
    const end = endOf(r);
    recordUndo();
    /* der abgelegte Slot geht in der Serie auf */
    removeItem(r.week, r.item.id);
    const { skipped } = addSeries({ spotId: r.spot.id, days, slots, start: r.date, end });
    showToast('success', `“${r.spot.title}” runs every ${daysLabel(days)} ${perDay}${end ? ` until ${longDate(end)}` : ''}.${skipped ? ` ${skipped} taken slot${skipped === 1 ? '' : 's'} skipped.` : ''}`);
  }
  closeRepeat();
  renderCalendar();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRepeat(); });

/* ---------------------------------------------------------------
   ⌘Z / Ctrl+Z: letzte Änderung im Calendar rückgängig, mit ⇧ wiederherstellen
   (in Eingabefeldern bleibt es beim normalen Text-Rückgängig)
   --------------------------------------------------------------- */
document.addEventListener('keydown', e => {
  if (calendarView.hidden || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
  if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  closeRepeat();
  if (e.shiftKey ? redoPlan() : undoPlan()) {
    syncReadyBadges();
    renderCalendar();
  }
});

/* neue oder gelöschte Spots aus dem SpotTool sofort in der Palette */
onPlanChange(kind => {
  if (calendarView.hidden) return;
  if (kind === 'spots') renderTray();
  if (kind === 'week' && !calDrag) renderCalendar();
});

/* ---- Wochennavigation ---- */
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
calPrev.addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() - 7); renderCalendar(); });
calNext.addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() + 7); renderCalendar(); });
document.getElementById('cal-today').addEventListener('click', () => { calWeekStart = mondayOf(new Date()); renderCalendar(); });

document.addEventListener('keydown', e => {
  if (calendarView.hidden || (e.target instanceof Element && e.target.closest('input, textarea'))) return;
  if (e.key === 'ArrowLeft') calPrev.click();
  if (e.key === 'ArrowRight') calNext.click();
});

