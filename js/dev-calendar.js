/* ================================================================
   DEV CALENDAR – Spielwiese: jeder Slot lebt für sich
   - beim ersten Besuch einer Woche wird der normale Plan eingefroren,
     danach hängen die Slots nicht mehr an ihren Schedules
   - Slots lassen sich einzeln per Drag & Drop auf freie Zellen ziehen
   - rechts die Spot-Palette: jeder Spot einmal, beliebig oft in den
     Kalender ziehbar (Kopie) – die Palette leert sich nie; ein Slot,
     der auf der Palette abgelegt wird, verschwindet aus dem Raster
   ================================================================ */

const dcalGrid     = document.getElementById('dcal-grid');
const dcalRange    = document.getElementById('dcal-range');
const dcalTray     = document.getElementById('dcal-tray');
const dcalTrayList = document.getElementById('dcal-tray-list');

let dcalWeekStart = mondayOf(new Date());
let dcalUid = 0;

/* Woche (Montag als Label) → eingefrorene, unabhängige Slots */
const dcalWeeks = new Map();            /* key → [{ id, title, category, day, slot }] */

/* Spot-Palette: jeder Spot aus dem Plan genau einmal.
   Wochentags-Varianten desselben Spots werden zusammengelegt. */
let dcalPalette = null;                 /* [{ title, category }] */

const dcalBaseTitle = t => t.replace(/\s*\((Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\)$/, '');

function dcalPaletteItems() {
  if (dcalPalette) return dcalPalette;
  const seen = new Set();
  dcalPalette = [];
  [...scheduleList.querySelectorAll('.sched-card')].forEach(card => {
    const title = dcalBaseTitle(card._opts.title);
    if (seen.has(title)) return;
    seen.add(title);
    dcalPalette.push({ title, category: card._opts.category });
  });
  return dcalPalette;
}

function dcalWeekItems(monday) {
  const key = fmtDate(monday);
  if (dcalWeeks.has(key)) return dcalWeeks.get(key);

  const items = [];
  const taken = new Set();              /* eine Zelle trägt genau einen Slot – Rest fällt weg */
  const cards = [...scheduleList.querySelectorAll('.sched-card')];
  weekDates(monday).forEach((date, di) => {
    cards.forEach(card => occurrences(card._opts, date).forEach(({ slot }) => {
      const cell = `${di}:${slot}`;
      if (taken.has(cell)) return;
      taken.add(cell);
      items.push({ id: ++dcalUid, title: dcalBaseTitle(card._opts.title), category: card._opts.category, day: di, slot });
    }));
  });
  dcalWeeks.set(key, items);
  return items;
}

function renderDevCalendar() {
  const days = calWeekDays(dcalWeekStart);
  const last = days[days.length - 1];
  const sameMonth = days[0].getMonth() === last.getMonth();
  dcalRange.textContent = sameMonth
    ? `${MONTH_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${MONTH_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${MONTH_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;

  const items = dcalWeekItems(dcalWeekStart);
  const today = new Date();

  let html = timeColumn();

  days.forEach((date, di) => {
    const isToday = sameDay(date, today);
    html += `<div class="cal-col${isToday ? ' cal-col--today' : ''}">
      <div class="cal-col__head">${DAY_NAMES[di].slice(0, 3)}<span class="cal-col__date">${date.getDate()}</span></div>
      <div class="cal-col__body">`;

    for (let s = 0; s < CAL_SLOTS; s++) {
      const it = items.find(i => i.day === di && i.slot === s);
      if (it) {
        html += `<div class="cal-slot cal-slot--spot devcal-slot" draggable="true" data-id="${it.id}" style="${catStyle(it.category)}">
            <div class="cal-slot__inner"></div>
            <span class="devcal-slot__label">${escapeHtml(it.title)}</span>
            <button class="devcal-slot__x" data-x="${it.id}" aria-label="Remove slot" data-tip="Remove" type="button">${icon('x')}</button>
          </div>`;
        continue;
      }

      /* Stille Stunde: gesperrter Block wie im normalen Kalender – kein Drop-Ziel */
      if (isQuiet(di, slotTime(s))) {
        let n = 1;
        while (s + n < CAL_SLOTS && isQuiet(di, slotTime(s + n)) && !items.find(i => i.day === di && i.slot === s + n)) n++;
        html += `<div class="cal-quiet" data-rows="${n}" style="height: calc(${n} * var(--slot-h) + ${n - 1} * var(--slot-gap))">Quiet Hour</div>`;
        s += n - 1;
        continue;
      }

      const closed = !isOpen(di, slotTime(s));
      html += `<div class="cal-slot devcal-cell${closed ? ' cal-slot--closed' : ''}" data-day="${di}" data-slot="${s}">
          <div class="cal-slot__inner"></div>
        </div>`;
    }

    html += '</div></div>';
  });

  dcalGrid.innerHTML = html;
  renderDevTray();
}

function renderDevTray() {
  if (dcalTrayList.childElementCount) return;         /* Palette ist statisch */
  dcalTrayList.innerHTML = dcalPaletteItems().map((it, i) => `
    <div class="devcal-tray__item" draggable="true" data-palette="${i}" style="${catStyle(it.category)}">
      <span class="devcal-slot__label">${escapeHtml(it.title)}</span>
    </div>`).join('');
}

/* ---------------------------------------------------------------
   Drag & Drop – Palette → Grid (Kopie), Grid → Grid (Verschieben),
   Grid → Palette (Entfernen)
   --------------------------------------------------------------- */
let dcalDrag = null;                    /* { from: 'grid', id } | { from: 'palette', index } */

const dcalDropCell = e => {
  const cell = e.target.closest('.devcal-cell');
  return cell && !cell.classList.contains('cal-slot--closed') ? cell : null;
};

function dcalClearDropMarks() {
  dcalGrid.querySelectorAll('.is-drop').forEach(c => c.classList.remove('is-drop'));
  dcalTray.classList.remove('is-drop');
}

/* Eigenes Drag-Bild: eine saubere Titel-Pille statt des Browser-Schnappschusses.
   Der Schnappschuss umfasst auch den Überstand des unsichtbaren ✕-Tooltips und
   nahm so den Anfang des Nachbar-Slots mit; im Collapsed-Modus wäre er zudem
   nur eine dünne Linie. */
function dcalSetDragImage(e, el, spot) {
  const r = el.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'devcal-ghost';
  ghost.style.cssText = `${catStyle(spot.category)}width:${Math.round(r.width)}px;`;
  ghost.textContent = spot.title;
  document.body.appendChild(ghost);
  const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
  const y = Math.min(Math.max(e.clientY - r.top, 0), ghost.offsetHeight);
  e.dataTransfer.setDragImage(ghost, x, y);
  setTimeout(() => ghost.remove(), 0);
}

document.addEventListener('dragstart', e => {
  const el = e.target.closest('.devcal-slot, .devcal-tray__item');
  if (!el) return;
  dcalDrag = el.classList.contains('devcal-slot')
    ? { from: 'grid', id: +el.dataset.id }
    : { from: 'palette', index: +el.dataset.palette };
  const spot = dcalDrag.from === 'grid'
    ? dcalWeekItems(dcalWeekStart).find(i => i.id === dcalDrag.id)
    : dcalPaletteItems()[dcalDrag.index];
  e.dataTransfer.effectAllowed = dcalDrag.from === 'palette' ? 'copy' : 'move';
  e.dataTransfer.setData('text/plain', spot ? spot.title : '');
  if (spot) dcalSetDragImage(e, el, spot);
  if (dcalDrag.from === 'grid') requestAnimationFrame(() => el.classList.add('is-dragging'));
});

document.addEventListener('dragend', () => {
  dcalDrag = null;
  dcalClearDropMarks();
  dcalGrid.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
});

/* freie Zellen nehmen Slots an */
dcalGrid.addEventListener('dragover', e => {
  const cell = dcalDropCell(e);
  if (!cell || !dcalDrag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = dcalDrag.from === 'palette' ? 'copy' : 'move';
  dcalClearDropMarks();
  cell.classList.add('is-drop');
});

dcalGrid.addEventListener('drop', e => {
  const cell = dcalDropCell(e);
  if (!cell || !dcalDrag) return;
  e.preventDefault();
  const day = +cell.dataset.day;
  const slot = +cell.dataset.slot;
  const items = dcalWeekItems(dcalWeekStart);

  if (dcalDrag.from === 'grid') {
    const it = items.find(i => i.id === dcalDrag.id);
    if (it) { it.day = day; it.slot = slot; }
  } else {
    const spot = dcalPaletteItems()[dcalDrag.index];
    if (spot) items.push({ id: ++dcalUid, title: spot.title, category: spot.category, day, slot });
  }
  dcalDrag = null;
  renderDevCalendar();
});

/* die Palette nimmt Slots aus dem Grid an – der Slot wird entfernt,
   die Palette selbst bleibt unverändert */
dcalTray.addEventListener('dragover', e => {
  if (!dcalDrag || dcalDrag.from !== 'grid') return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dcalTray.classList.add('is-drop');
});

dcalTray.addEventListener('dragleave', e => {
  if (!dcalTray.contains(e.relatedTarget)) dcalTray.classList.remove('is-drop');
});

dcalTray.addEventListener('drop', e => {
  if (!dcalDrag || dcalDrag.from !== 'grid') return;
  e.preventDefault();
  const items = dcalWeekItems(dcalWeekStart);
  const idx = items.findIndex(i => i.id === dcalDrag.id);
  if (idx > -1) items.splice(idx, 1);
  dcalDrag = null;
  dcalClearDropMarks();
  renderDevCalendar();
});

/* ---------------------------------------------------------------
   Kreuz am Slot: einzelnen Slot aus dem Raster löschen
   --------------------------------------------------------------- */
dcalGrid.addEventListener('click', e => {
  const btn = e.target.closest('.devcal-slot__x');
  if (!btn) return;
  e.stopPropagation();
  const items = dcalWeekItems(dcalWeekStart);
  const idx = items.findIndex(i => i.id === +btn.dataset.x);
  if (idx > -1) items.splice(idx, 1);
  renderDevCalendar();
});

/* ---------------------------------------------------------------
   Dichte: derselbe Collapsed/Expanded-Wechsel wie im normalen Kalender
   --------------------------------------------------------------- */
wireDensityToggle(document.getElementById('dcal-density'), value => morphGrid(devcalView, dcalGrid, value));

/* ---------------------------------------------------------------
   Wochennavigation
   --------------------------------------------------------------- */
document.getElementById('dcal-prev').addEventListener('click', () => { dcalWeekStart.setDate(dcalWeekStart.getDate() - 7); renderDevCalendar(); });
document.getElementById('dcal-next').addEventListener('click', () => { dcalWeekStart.setDate(dcalWeekStart.getDate() + 7); renderDevCalendar(); });
document.getElementById('dcal-today').addEventListener('click', () => { dcalWeekStart = mondayOf(new Date()); renderDevCalendar(); });

document.addEventListener('keydown', e => {
  if (devcalView.hidden || e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') document.getElementById('dcal-prev').click();
  if (e.key === 'ArrowRight') document.getElementById('dcal-next').click();
});
