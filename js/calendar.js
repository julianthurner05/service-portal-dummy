/* ================================================================
   CALENDAR – die Schedule-Oberfläche
   - Woche Mo–Sa im 15-Minuten-Raster, Daten aus plan.js
   - jeder Slot lebt für sich: per Drag & Drop verschieben, über das ✕
     oder durch Ablegen in der Palette entfernen
   - rechts die Spot-Palette: jeder Spot einmal, beliebig oft einplanbar
     (Plan-Spots + fertige Spots aus dem SpotTool)
   - Klick auf eine freie Zelle → Spot auswählen (statt ziehen)
   - fixe Slots (Opening/Closing) vergibt sounddna: gesperrt, mit Schloss
   - Collapsed (Farblinien) ↔ Expanded (Slots mit Titel), gleitend
   ================================================================ */

const calGrid      = document.getElementById('cal-grid');
const calRange     = document.getElementById('cal-range');
const calLegend    = document.getElementById('cal-legend');
const calTray      = document.getElementById('cal-tray');
const calTrayList  = document.getElementById('cal-tray-list');

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
  closeCellPicker();
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
        html += `<div class="cal-slot cal-slot--spot cal-item is-fixed" title="${escapeHtml(tip)}" style="${catStyle('closing')}">
            <div class="cal-slot__inner"></div>
            <span class="cal-item__label">${escapeHtml(label)}</span>
            ${icon('lock', 'cal-item__lock')}
          </div>`;
        continue;
      }

      const it = items.find(i => i.day === di && i.slot === s);
      if (it) {
        const spot = spotById(it.spotId);
        html += `<div class="cal-slot cal-slot--spot cal-item" draggable="true" data-id="${it.id}" style="${catStyle(spot.category)}">
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

/* ---- Palette ---- */
function renderTray() {
  calTrayList.innerHTML = paletteSpots().map(s => `
    <div class="cal-tray__item" draggable="true" data-spot="${s.id}" style="${catStyle(s.category)}">
      <span class="cal-item__label">${escapeHtml(s.title)}</span>
    </div>`).join('');
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
  closeCellPicker();
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
  if (calDrag.from === 'grid') {
    moveItem(calWeekStart, calDrag.id, day, slot);
  } else if (placeSpot(calWeekStart, calDrag.spotId, day, slot)) {
    spotPlaced(spotById(calDrag.spotId));
  }
  calDrag = null;
  renderCalendar();
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
   Klicks im Raster: ✕ entfernt einen Slot, freie Zelle → Spot wählen
   --------------------------------------------------------------- */
let cellPicker = null;

function closeCellPicker() {
  if (!cellPicker) return;
  cellPicker.closest('.cal-slot')?.classList.remove('has-pop');
  cellPicker.remove();
  cellPicker = null;
}

function openCellPicker(cell) {
  closeCellPicker();
  const day = +cell.dataset.day;
  const slot = +cell.dataset.slot;
  const date = calWeekDays(calWeekStart)[day];
  const list = paletteSpots();

  cellPicker = document.createElement('div');
  cellPicker.className = 'cal-pick';
  if (day >= CAL_DAYS - 2) cellPicker.classList.add('cal-pick--left');
  if (cell.getBoundingClientRect().bottom > window.innerHeight - 320) cellPicker.classList.add('cal-pick--up');
  cellPicker.innerHTML = `
    <p class="cal-pick__when">${DAY_NAMES[day].slice(0, 3)} ${date.getDate()} · ${slotTime(slot)}</p>
    <div class="cal-pick__list">
      ${list.map(s => `
        <button class="cal-pick__spot" data-spot="${s.id}" type="button">
          <span class="cal-pick__dot" style="background:${catColor(s.category)}"></span>
          <span class="cal-pick__title">${escapeHtml(s.title)}</span>
        </button>`).join('')}
    </div>`;
  cellPicker.addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.target.closest('.cal-pick__spot');
    if (!btn) return;
    const spot = spotById(+btn.dataset.spot);
    if (placeSpot(calWeekStart, spot.id, day, slot)) spotPlaced(spot);
    renderCalendar();
  });
  cell.classList.add('has-pop');
  cell.appendChild(cellPicker);
}

calGrid.addEventListener('click', e => {
  if (e.target.closest('.cal-pick')) return;
  const x = e.target.closest('.cal-item__x');
  if (x) {
    e.stopPropagation();
    removeItem(calWeekStart, +x.dataset.x);
    renderCalendar();
    return;
  }
  const cell = e.target.closest('.cal-cell');
  if (!cell || cell.classList.contains('cal-slot--closed')) return;
  e.stopPropagation();
  if (cell.classList.contains('has-pop')) { closeCellPicker(); return; }
  openCellPicker(cell);
});

document.addEventListener('click', e => { if (!e.target.closest('.cal-pick')) closeCellPicker(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCellPicker(); });

/* ---------------------------------------------------------------
   Aus dem SpotTool: in den Calendar springen, Spot in der Palette zeigen.
   Bewusst ohne Toast – der läge oben rechts genau über der Palette.
   --------------------------------------------------------------- */
function openInCalendar(title) {
  showView('calendar');
  const spot = findSpot(title);
  const el = spot && calTrayList.querySelector(`[data-spot="${spot.id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' });
  el.classList.remove('is-flash');
  void el.offsetWidth;                            /* Animation neu starten */
  el.classList.add('is-flash');
}

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
  closeCellPicker();
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
