/* ================================================================
   DEV CALENDAR – Spielwiese: jeder Slot lebt für sich
   - beim ersten Besuch einer Woche wird der normale Plan eingefroren,
     danach hängen die Slots nicht mehr an ihren Schedules
   - Slots lassen sich einzeln per Drag & Drop auf freie Zellen ziehen
   - rechts eine Ablage (Tray), in die Slots geparkt werden können
   ================================================================ */

const dcalGrid      = document.getElementById('dcal-grid');
const dcalRange     = document.getElementById('dcal-range');
const dcalTray      = document.getElementById('dcal-tray');
const dcalTrayList  = document.getElementById('dcal-tray-list');
const dcalTrayEmpty = document.getElementById('dcal-tray-empty');

let dcalWeekStart = mondayOf(new Date());
let dcalUid = 0;

/* Woche (Montag als Label) → eingefrorene, unabhängige Slots */
const dcalWeeks = new Map();            /* key → [{ id, title, category, day, slot }] */
const dcalTrayItems = [];               /* geparkte Slots: { id, title, category } */

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
      items.push({ id: ++dcalUid, title: card._opts.title, category: card._opts.category, day: di, slot });
    }));
  });
  dcalWeeks.set(key, items);
  return items;
}

function renderDevCalendar() {
  const days = weekDates(dcalWeekStart);
  const last = days[6];
  const sameMonth = days[0].getMonth() === last.getMonth();
  dcalRange.textContent = sameMonth
    ? `${MONTH_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${MONTH_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${MONTH_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;

  const items = dcalWeekItems(dcalWeekStart);
  const today = new Date();

  let html = '<div class="cal-col cal-col--time"><div class="cal-col__head"></div><div class="cal-col__body">';
  for (let s = 0; s < CAL_SLOTS; s++) {
    html += `<div class="cal-time">${s % 2 === 0 ? slotTime(s) : ''}</div>`;
  }
  html += '</div></div>';

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
          </div>`;
        continue;
      }
      const closed = !isOpen(di, slotTime(s));
      const quiet = isQuiet(di, slotTime(s));
      html += `<div class="cal-slot devcal-cell${closed ? ' cal-slot--closed' : ''}${quiet ? ' devcal-cell--quiet' : ''}" data-day="${di}" data-slot="${s}">
          <div class="cal-slot__inner"></div>
        </div>`;
    }

    html += '</div></div>';
  });

  dcalGrid.innerHTML = html;
  renderDevTray();
}

function renderDevTray() {
  dcalTrayEmpty.hidden = dcalTrayItems.length > 0;
  dcalTrayList.innerHTML = dcalTrayItems.map(it => `
    <div class="devcal-tray__item" draggable="true" data-id="${it.id}" style="${catStyle(it.category)}">
      <span class="devcal-slot__label">${escapeHtml(it.title)}</span>
    </div>`).join('');
}

/* ---------------------------------------------------------------
   Drag & Drop – Grid ↔ Grid und Grid ↔ Tray
   --------------------------------------------------------------- */
let dcalDrag = null;                    /* { id, from: 'grid' | 'tray' } */

const dcalDropCell = e => {
  const cell = e.target.closest('.devcal-cell');
  return cell && !cell.classList.contains('cal-slot--closed') ? cell : null;
};

function dcalClearDropMarks() {
  dcalGrid.querySelectorAll('.is-drop').forEach(c => c.classList.remove('is-drop'));
  dcalTray.classList.remove('is-drop');
}

document.addEventListener('dragstart', e => {
  const el = e.target.closest('.devcal-slot, .devcal-tray__item');
  if (!el) return;
  dcalDrag = { id: +el.dataset.id, from: el.classList.contains('devcal-slot') ? 'grid' : 'tray' };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', el.dataset.id);
  requestAnimationFrame(() => el.classList.add('is-dragging'));
});

document.addEventListener('dragend', () => {
  dcalDrag = null;
  dcalClearDropMarks();
  dcalGrid.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
  dcalTrayList.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
});

/* freie Zellen nehmen Slots an */
dcalGrid.addEventListener('dragover', e => {
  const cell = dcalDropCell(e);
  if (!cell || !dcalDrag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
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
    const idx = dcalTrayItems.findIndex(i => i.id === dcalDrag.id);
    if (idx > -1) {
      const it = dcalTrayItems.splice(idx, 1)[0];
      items.push({ ...it, day, slot });
    }
  }
  dcalDrag = null;
  renderDevCalendar();
});

/* die Ablage nimmt Slots aus dem Grid an */
dcalTray.addEventListener('dragover', e => {
  if (!dcalDrag || dcalDrag.from === 'tray') return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dcalTray.classList.add('is-drop');
});

dcalTray.addEventListener('dragleave', e => {
  if (!dcalTray.contains(e.relatedTarget)) dcalTray.classList.remove('is-drop');
});

dcalTray.addEventListener('drop', e => {
  if (!dcalDrag || dcalDrag.from === 'tray') return;
  e.preventDefault();
  const items = dcalWeekItems(dcalWeekStart);
  const idx = items.findIndex(i => i.id === dcalDrag.id);
  if (idx > -1) {
    const { id, title, category } = items.splice(idx, 1)[0];
    dcalTrayItems.push({ id, title, category });
  }
  dcalDrag = null;
  renderDevCalendar();
});

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
