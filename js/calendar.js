/* ================================================================
   CALENDAR – die Schedule-Oberfläche
   - Woche Mo–Sa im 15-Minuten-Raster, Daten aus plan.js
   - jeder Slot lebt für sich: per Drag & Drop verschieben, über das ✕
     oder durch Ablegen in der Palette entfernen
   - rechts die Liste „Scheduling Spots“: jeder Spot einmal, beliebig oft
     einplanbar (Plan-Spots + im SpotTool freigegebene Spots), mit Suche;
     nach Kategorien gruppiert – Ziehen in eine andere Gruppe ändert die
     Kategorie. Frische Spots stehen unten unter „Ready for Schedule“ und
     müssen erst in eine Kategorie gezogen werden, bevor sie einplanbar sind
   - ✕ an einem Slot: Menü – nur dieser Slot, alle an dem Tag, alle in der
     Woche oder alle ab jetzt
   - SpotTool-Icon an einem Spot der Liste: Audio austauschen („Choose audio“
     mit Anhören), Slots und Serien bleiben
   - Klick auf einen Slot: seine Serie bearbeiten (Tage, Laufzeit, Uhrzeiten)
     bzw. einen einzelnen Slot wiederholen; Audio anhören; belegte Slots
     werden in der Vorschau rot markiert und lassen sich ersetzen
   - Feiertage / Sonderöffnungszeiten als gesperrte Blöcke, Klick auf die
     Woche unten springt zu einem Datum
   - nach dem Ablegen aus der Liste färbt sich das Ready-Feld ein und zeigt
     die Einstellungen: Tage (dieser Tag / wöchentlich mit Laufzeit bis zu
     Monaten oder ohne Ende) und pro Tag einmal oder Repeat (alle N Minuten)
   - ⌘Z / ⇧⌘Z: letzte Änderung im Calendar rückgängig / wiederherstellen
   - Save (oder ⌘S): erst dann gelten die Änderungen; bis dahin trägt der
     Menüpunkt Calendar einen Punkt
   - Rollen (plan.js): was man nicht ändern darf, hat ein Schloss und öffnet
     nur zum Ansehen; Head Office: Store-Auswahl oben in der Liste, sperren,
     neue Serien in alle Stores
   - Hover: alle Slots desselben Spots leuchten auf
   - Option (Alt) beim Ziehen eines Slots: kopieren statt verschieben
   - Kopfzeile, Tageszeile und Liste bleiben beim Scrollen stehen
   ================================================================ */

const calGrid      = document.getElementById('cal-grid');
const calRange     = document.getElementById('cal-range');
const calTray      = document.getElementById('cal-tray');
const calTrayList  = document.getElementById('cal-tray-list');
const calTraySearch = document.getElementById('cal-tray-search');
const calTrayEmpty = document.getElementById('cal-tray-empty');
const calTraySettings = document.getElementById('cal-tray-settings');
const calStore     = document.getElementById('cal-store');
const calUnsaved   = document.getElementById('cal-unsaved');

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

/* Slots, die schon gespielt haben (playedSlots, plan.js), sind nur noch zum Nachsehen */
let playedMark = '';                   /* Stand beim letzten Aufbau – ändert er sich, neu zeichnen */

function renderCalendar() {
  litSpot = null;
  const days = calWeekDays(calWeekStart);
  calRange.textContent = weekRangeLabel(days);

  const items = weekItems(calWeekStart);
  const today = new Date();

  let html = timeColumn();

  playedMark = days.map(d => playedSlots(d, today)).join();

  days.forEach((date, di) => {
    /* Gespieltes ist nur noch zum Nachsehen – kein Ziehen, Löschen, Ablegen */
    const played = playedSlots(date, today);
    const pastDay = played === CAL_SLOTS && !sameDay(date, today);
    html += `<div class="cal-col${sameDay(date, today) ? ' cal-col--today' : ''}${pastDay ? ' cal-col--past' : ''}" data-day="${di}">
      <div class="cal-col__head">${DAY_NAMES[di].slice(0, 3)}<span class="cal-col__date">${date.getDate()}</span></div>
      <div class="cal-col__body">`;

    /* Feiertag / Sonderöffnungszeit: ab Ladenschluss ein gesperrter Block
       mit dem Namen des Tages */
    const sp = specialDay(date);
    const closedFrom = sp ? (sp.hours ? slotIndex(sp.hours[1]) : 0) : CAL_SLOTS;

    for (let s = 0; s < CAL_SLOTS; s++) {
      const past = s < played;
      const pastCls = past ? ' is-past' : '';
      if (s >= closedFrom) {
        const n = CAL_SLOTS - s;
        const meta = sp.hours ? `Open ${parseInt(sp.hours[0], 10)}–${parseInt(sp.hours[1], 10)}` : 'Closed';
        html += `<div class="cal-closed${pastCls}" data-rows="${n}" style="height: calc(${n} * var(--slot-h) + ${n - 1} * var(--slot-gap))">
            <span class="cal-closed__name">${escapeHtml(sp.name)}</span><span class="cal-closed__meta">${meta}</span>
          </div>`;
        break;
      }
      const it = items.find(i => i.day === di && i.slot === s);
      if (it) {
        const spot = spotById(it.spotId);
        /* nicht änderbar (Rolle, gesperrt): Schloss, kein Ziehen, kein ✕ */
        const editable = !past && canEditItem(it);
        const locked = !past && !editable && canEdit();
        html += `<div class="cal-slot cal-slot--spot cal-item${pastCls}${locked ? ' is-locked' : ''}"${editable ? ' draggable="true"' : ''} data-id="${it.id}" data-spot="${spot.id}" style="${catStyle(spot.category)}">
            <div class="cal-slot__inner"></div>
            <span class="cal-item__label">${escapeHtml(spot.title)}</span>
            ${editable ? `<button class="cal-item__x" data-x="${it.id}" aria-label="Remove slot" type="button">${icon('x')}</button>` : locked ? icon('lock', 'cal-item__lock') : ''}
          </div>`;
        continue;
      }

      /* Stille Stunde: gesperrter Block – kein Drop-Ziel */
      if (isQuiet(di, slotTime(s))) {
        let n = 1;
        while (s + n < CAL_SLOTS && isQuiet(di, slotTime(s + n))) n++;
        html += `<div class="cal-quiet${pastCls}" data-rows="${n}" style="height: calc(${n} * var(--slot-h) + ${n - 1} * var(--slot-gap))">Quiet Hour</div>`;
        s += n - 1;
        continue;
      }

      const closed = !isOpen(date, slotTime(s));
      html += `<div class="cal-slot cal-cell${closed ? ' cal-slot--closed' : ''}${pastCls}" data-day="${di}" data-slot="${s}">
          <div class="cal-slot__inner"></div>
        </div>`;
    }

    html += '</div></div>';
  });

  calGrid.innerHTML = html;

  /* Bearbeitungsmodus übersteht den Wochenwechsel; er endet erst, wenn der
     Slot bzw. die Serie weg ist (Cancel, Undo …). Ziel und Vorschau gleich
     mit aufbauen, bevor irgendetwas gemessen wird – sonst blenden sie ein. */
  if (repeat) {
    if (repeatAlive()) renderRepeat();
    else closeRepeat();
  }

  renderTray();
  renderNowLine();
  syncHeadHeight();

  closeSlotMenu();
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

/* ---- Liste „Scheduling Spots“ ----
   Gruppen je Kategorie (Opening/Closing zuletzt), darunter „Ready for
   Schedule“ für frisch freigegebene Spots ohne Kategorie und ganz unten
   „Expired“ für zeitlich begrenzte Spots, deren Laufzeit vorbei ist */
const TRAY_CATS = [...CATEGORIES.filter(c => c.value !== 'closing'), catOf('closing')];

/* zeitlich begrenzt: Enddatum rechts, gelb, wenn es in den nächsten Tagen ausläuft */
function trayItem(s, expired) {
  const end = expired ? null : spotEnd(s);
  const until = end ? `<span class="cal-tray__end${spotEndsSoon(s) ? ' is-soon' : ''}">until ${end.getDate()} ${MONTH_SHORT[end.getMonth()]}</span>` : '';
  return `
  <div class="cal-tray__item${s.category ? '' : ' is-new'}${expired ? ' is-expired' : ''}${end ? ' has-end' : ''}" draggable="${(s.category ? canPlaceSpot(s) : canManage()) ? 'true' : 'false'}" data-spot="${s.id}" style="${s.category ? catStyle(s.category) : ''}">
    <span class="cal-item__label">${escapeHtml(s.title)}</span>
    ${until}
  </div>`;
}

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
        <p class="cal-tray__cat">Ready for Schedule<span class="cal-tray__count">${fresh.length}</span></p>
        ${fresh.map(s => trayItem(s)).join('')}
      </div>`;
  }

  /* wieder einplanen holt einen abgelaufenen Spot zurück in seine Gruppe */
  if (expired.length) {
    html += `
      <div class="cal-tray__group cal-tray__group--expired${expiredOpen ? '' : ' is-collapsed'}">
        <button class="cal-tray__cat cal-tray__toggle" type="button" aria-expanded="${expiredOpen}">Expired${icon('chevron-down', 'cal-tray__chev')}<span class="cal-tray__count">${expired.length}</span></button>
        ${expired.map(s => trayItem(s, true)).join('')}
      </div>`;
  }
  calTrayList.innerHTML = html;
  calTrayEmpty.hidden = found.length > 0 || !q;
  calTrayEmpty.textContent = 'No spots match your search.';
}

calTraySearch.addEventListener('input', renderTray);

/* „Expired“ auf- und zuklappen */
let expiredOpen = true;
calTrayList.addEventListener('click', e => {
  if (e.target.closest('.cal-tray__toggle')) {
    expiredOpen = !expiredOpen;
    renderTray();
    return;
  }
  /* Klick auf einen Spot: seine Serie bearbeiten – ohne Serie eine neue
     anlegen; Spots ohne Kategorie lassen sich noch nicht einplanen */
  const item = e.target.closest('.cal-tray__item');
  const spot = item && spotById(+item.dataset.spot);
  if (!spot || !spot.category) return;
  const series = spotSeries(spot.id)[0] || null;
  if (!series && !canPlaceSpot(spot)) return;
  setLit(null);
  openSeries(spot, series);
});

/* ---- Hover: alle Slots desselben Spots leuchten auf – auch beim Zeigen
   auf einen Eintrag der Liste ---- */
let litSpot = null;

function setLit(spotId) {
  if (spotId === litSpot) return;
  litSpot = spotId;
  calGrid.querySelectorAll('.cal-item:not(.is-past)').forEach(el =>
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
  for (const el of body.querySelectorAll('.cal-slot, .cal-quiet, .cal-closed')) {
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

/* jede Minute: Jetzt-Linie nachziehen; hat ein neuer Slot begonnen, graut
   der gerade gespielte aus (nicht mitten im Ziehen) */
setInterval(() => {
  if (calendarView.hidden) return;
  const mark = calWeekDays(calWeekStart).map(d => playedSlots(d)).join();
  if (mark !== playedMark && !calDrag) renderCalendar();
  else renderNowLine();
}, 60000);

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
  return cell && !cell.classList.contains('cal-slot--closed') && !cell.classList.contains('is-past') ? cell : null;
};

function clearDropMarks() {
  calGrid.querySelectorAll('.is-drop').forEach(c => c.classList.remove('is-drop'));
  calTrayList.querySelectorAll('.is-drop').forEach(g => g.classList.remove('is-drop'));
  calTray.classList.remove('is-drop');
}

/* Spot aus „Ready for Schedule“ (noch ohne Kategorie): erst in eine Kategorie ziehen */
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
  const el = e.target.closest('.cal-item[draggable="true"], .cal-tray__item[draggable="true"]');
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
  if (!canManage()) return null;
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
   ✕ an einem Slot: kleines Menü mit den Löschoptionen – nur dieser Slot,
   alle dieses Spots an dem Tag, in der Woche oder ab diesem Slot überall.
   Gespieltes bleibt stehen (plan.js, removeSpotSlots).
   --------------------------------------------------------------- */
const slotMenu = document.createElement('div');
slotMenu.className = 'context-menu cal-slot-menu';
slotMenu.setAttribute('role', 'menu');
slotMenu.hidden = true;
document.body.appendChild(slotMenu);
let slotMenuItem = null;               /* { id, spotId, day } */

function closeSlotMenu() {
  slotMenu.hidden = true;
  slotMenuItem = null;
  calGrid.querySelectorAll('.cal-item.is-menu').forEach(el => el.classList.remove('is-menu'));
}

function openSlotMenu(x) {
  const it = weekItems(calWeekStart).find(i => i.id === +x.dataset.x);
  if (!it) return;
  closeAllMenus();
  closeSlotMenu();
  slotMenuItem = it;
  slotMenu.innerHTML = [
    ['slot', 'This slot'],
    ['day', `All on ${DAY_NAMES[it.day]}`],
    ['week', 'All this week'],
    ['from', 'All from here on'],
  ].map(([v, label]) => `<button class="context-menu__item" role="menuitem" data-remove="${v}" type="button">${label}</button>`).join('');
  slotMenu.hidden = false;
  x.closest('.cal-item').classList.add('is-menu');
  /* unter dem ✕, rechtsbündig; unten zu wenig Platz → darüber */
  const r = x.getBoundingClientRect();
  const h = slotMenu.offsetHeight;
  const top = r.bottom + 4 + h > window.innerHeight - 8 ? r.top - 4 - h : r.bottom + 4;
  slotMenu.style.top = `${Math.round(top)}px`;
  slotMenu.style.left = `${Math.round(r.right - slotMenu.offsetWidth)}px`;
}

calGrid.addEventListener('click', e => {
  const x = e.target.closest('.cal-item__x');
  if (x) {
    e.stopPropagation();
    if (!slotMenu.hidden && slotMenuItem && slotMenuItem.id === +x.dataset.x) closeSlotMenu();
    else openSlotMenu(x);
    return;
  }
  /* Klick auf einen Slot: Serie bearbeiten bzw. einzelnen Slot wiederholen –
     ohne Recht dazu nur ansehen */
  const el = e.target.closest('.cal-item[data-id]:not(.is-past)');
  if (!el || calendarView.classList.contains('is-editing')) return;
  const it = weekItems(calWeekStart).find(i => i.id === +el.dataset.id);
  if (!it) return;
  const series = it.seriesId && userSeries.find(r => r.id === it.seriesId);
  if (series) openSeries(spotById(it.spotId), series);
  else openRepeat(it, 'single');
});

slotMenu.addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn || !slotMenuItem) return;
  e.stopPropagation();
  const { id, spotId, day, slot } = slotMenuItem;
  const spot = spotById(spotId);
  const scope = btn.dataset.remove;
  closeSlotMenu();
  recordUndo();
  if (scope === 'slot') {
    removeItem(calWeekStart, id);
    renderCalendar();
    return;
  }
  const n = removeSpotSlots(spotId, scope, calWeekStart, day, slot);
  const slots = `${n} slot${n === 1 ? '' : 's'}`;
  showToast('success',
    scope === 'from' ? `“${spot.title}” removed from ${longDate(calWeekDays(calWeekStart)[day])}, ${slotTime(slot)} on.`
    : scope === 'week' ? `${slots} of “${spot.title}” removed this week.`
    : `${slots} of “${spot.title}” removed on ${longDate(calWeekDays(calWeekStart)[day])}.`);
});

/* Klick daneben, Scrollen, Esc → zu */
document.addEventListener('click', e => { if (!slotMenu.contains(e.target)) closeSlotMenu(); });
mainEl.addEventListener('scroll', () => { if (!slotMenu.hidden) closeSlotMenu(); }, { passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSlotMenu(); });

/* ---------------------------------------------------------------
   „Choose audio“ – wie im alten Scheduler: Lightbox mit den fertigen
   Spots aus dem SpotTool, jeder zum Anhören. Der Spot behält Slots,
   Serien und Kategorie, nur die Aufnahme wechselt.
   --------------------------------------------------------------- */
const audioPicker       = document.getElementById('audio-picker');
const audioPickerList   = document.getElementById('audio-picker-list');
const audioPickerSearch = document.getElementById('audio-picker-search');
let audioSpot = null;

function openAudioPicker(spot) {
  stopPanelAudio();
  audioSpot = spot;
  audioPickerSearch.value = '';
  renderAudioPicker();
  audioPicker.hidden = false;
  setTimeout(() => audioPickerSearch.focus(), 50);
}

function closeAudioPicker() {
  if (activePlayer && audioPicker.contains(activePlayer.el)) activePlayer.stop();
  audioPicker.hidden = true;
  audioSpot = null;
}

function renderAudioPicker() {
  const spot = audioSpot;
  const q = audioPickerSearch.value.trim().toLowerCase();
  /* Plan-Spots haben ihre eigene Aufnahme (kein SpotTool-Eintrag) – steht oben */
  const own = spotToolAudios().some(a => a.title === spot.title)
    ? [] : [{ title: spot.title, date: 'Original', duration: spot.duration, original: true }];
  const list = [...own, ...spotToolAudios()].filter(a => a.title.toLowerCase().includes(q));
  const currentTitle = spot.audio ? spot.audio.title : spot.title;

  audioPickerList.innerHTML = list.length ? '' : '<p class="lightbox__empty">No spots found.</p>';
  list.forEach(a => {
    const current = a.title === currentTitle;
    const row = document.createElement('div');
    row.className = `picker-row${current ? ' is-current' : ''}`;
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
    row.querySelector('.picker-row__title').textContent = a.title;
    row.querySelector('.picker-row__meta').textContent = a.date;
    createPlayer({
      playBtn: row.querySelector('.play-btn'),
      slider: row.querySelector('.slider'),
      timeEl: row.querySelector('.card__time'),
      duration: a.duration,
      resetOnStop: true,
    });
    row.querySelector('.picker-row__choose').addEventListener('click', () => {
      closeAudioPicker();
      if (current) return;
      recordUndo();
      const original = a.title === spot.title;
      setSpotAudio(spot.id, original ? null : { title: a.title });
      if (!original) setCardScheduled(a.title);
      if (repeat && repeat.spot.id === spot.id) renderRepeat();
      showToast('success', original ? `“${spot.title}” plays its original audio again.` : `“${spot.title}” now plays “${a.title}”.`);
    });
    audioPickerList.appendChild(row);
  });
}

document.getElementById('audio-picker-close').addEventListener('click', closeAudioPicker);
audioPicker.addEventListener('click', e => { if (e.target === audioPicker) closeAudioPicker(); });
audioPickerSearch.addEventListener('input', renderAudioPicker);
/* Esc schließt nur die Lightbox – das Bearbeitungsfeld dahinter bleibt offen */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || audioPicker.hidden) return;
  e.stopImmediatePropagation();
  closeAudioPicker();
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

/* Einstellungen im Ready-Feld – drei Fälle:
   'drop'   gerade aus der Liste abgelegt (Cancel nimmt den Slot wieder raus)
   'single' Klick auf einen einzelnen Slot (Cancel schließt nur)
   'series' Klick auf einen Slot einer Serie: Tage, Laufzeit, Uhrzeiten */
let repeat = null;                    /* { kind, item, week, spot, date, days: Set, end, override,
                                          drop/single: mode 'day'|'weekly', perDay 'once'|'repeat', every, until,
                                          series: series, times: [slot, …] } */

/* Uhrzeiten eines Tages mit der aktuellen Einstellung (Slot-Indizes) */
function repeatSlots(r) {
  if (r.kind === 'series') return r.times;
  if (r.perDay === 'once') return [r.item.slot];
  const step = r.every / SLOT_MIN;
  const last = slotIndex(r.until);
  const list = [];
  for (let s = r.item.slot; s <= last && s < CAL_SLOTS; s += step) list.push(s);
  return list;
}

const isWeekly = r => r.kind === 'series' || r.mode === 'weekly';

/* legt „Done“ eine neue Serie an? (dann auch in alle Stores möglich) */
const isNewSeries = r => (r.kind === 'series' ? !r.series : r.mode === 'weekly');

/* Serienbeginn: bestehende Serie wie gehabt; neue Serien gelten ab dem
   Montag ihrer Woche (Gespieltes wird beim Eintragen übersprungen) */
const repeatStart = r => (r.kind === 'series' ? r.start : mondayOf(r.date));

/* gibt es noch, worum es geht? (sonst endet die Bearbeitung) */
const repeatAlive = () => (repeat.kind === 'series'
  ? (repeat.series ? userSeries.includes(repeat.series) : spots.includes(repeat.spot) && !repeat.spot.retired)
  : weekItems(repeat.week).some(i => i.id === repeat.item.id));

/* Einstellung vollständig? (Tage gewählt, Enddatum gesetzt, Uhrzeiten da) */
const repeatValid = r => !(isWeekly(r) && (!r.days.size || r.end === '')) && repeatSlots(r).length > 0;

function stopPanelAudio() {
  if (activePlayer && calTraySettings.contains(activePlayer.el)) activePlayer.stop();
}

function closeRepeat() {
  if (!repeat) return;
  stopPanelAudio();
  clearPreview();
  repeat = null;
  calTraySettings.hidden = true;
  calTraySettings.innerHTML = '';
  calTray.classList.remove('is-editing');
  calTray.removeAttribute('style');
  calendarView.classList.remove('is-editing');
}

function enterEditing(spot) {
  calTray.classList.add('is-editing');
  calTray.style.cssText = catStyle(spot.category);
  calTraySettings.hidden = false;
  /* Bearbeitungsmodus: bestehende Slots treten zurück, die betroffenen bleiben */
  calendarView.classList.add('is-editing');
}

function openRepeat(item, kind = 'drop') {
  closeRepeat();
  const spot = spotById(item.spotId);
  const date = calWeekDays(calWeekStart)[item.day];
  const lastStart = slotTime(CAL_SLOTS - 1);
  const until = minutesOf(slotTime(item.slot)) < minutesOf('18:00') ? '18:00' : lastStart;
  repeat = { kind, item, week: new Date(calWeekStart), spot, date, mode: 'day', days: new Set([DAYS[item.day]]), end: null, perDay: 'once', every: 60, until, override: false, steps: undoStack.length,
             readonly: kind === 'single' && !canEditItem(item), locked: !!item.locked, allStores: false };
  enterEditing(spot);
  renderRepeat();
}

/* Serien eines Spots, die noch laufen oder kommen (nach Wochentag sortiert);
   ist alles vorbei, die zuletzt gelaufene – zum Verlängern */
function spotSeries(spotId) {
  const today = dayStart(new Date());
  const own = userSeries.filter(r => r.spotId === spotId);
  const live = own.filter(r => !r.end || r.end >= today);
  if (!live.length && own.length) return [own.reduce((a, b) => (b.end > a.end ? b : a))];
  const first = r => Math.min(...r.days.map(d => DAYS.indexOf(d))) * CAL_SLOTS + Math.min(...r.slots);
  return live.sort((a, b) => first(a) - first(b));
}

/* series null: neue Serie ab heute */
function openSeries(spot, series = null) {
  closeRepeat();
  repeat = {
    kind: 'series', item: null, week: new Date(calWeekStart), spot, series,
    start: series ? series.start : mondayOf(new Date()),
    days: new Set(series ? series.days : []), end: series && series.end ? fmtDate(series.end) : null,
    times: series ? [...series.slots].sort((a, b) => a - b) : [], override: false,
    readonly: series ? !canEditEntry(series, spot) : !canPlaceSpot(spot), locked: !!(series && series.locked), allStores: false,
  };
  enterEditing(spot);
  renderRepeat();
}

/* Auswahl, wenn ein Spot mehrere Serien hat (z. B. Mittwoch mit eigenen Zeiten) */
function seriesPicker(r) {
  const list = spotSeries(r.spot.id);
  if (r.series && !list.includes(r.series)) list.push(r.series);
  if (list.length < 2) return '';
  const labels = list.map(x => daysLabel(x.days));
  return `
    <p class="cal-repeat__label">Series</p>
    <div class="cal-chips cal-chips--flush cal-series">
      ${list.map((x, i) => `<button class="cal-chip${x === r.series ? ' is-active' : ''}" data-series="${x.id}" type="button">${labels[i]}${labels.indexOf(labels[i]) !== i || labels.lastIndexOf(labels[i]) !== i ? ` · ${slotTime(Math.min(...x.slots))}` : ''}</button>`).join('')}
    </div>`;
}

/* Audio des Spots zum Anhören – bei getauschtem Audio steht dessen Name dabei */
/* wer es eingeplant hat: an der Serie bzw. am einzelnen Slot */
function byLine(r) {
  const src = r.kind === 'series' ? r.series : r.item;
  const info = src && (r.kind === 'series' ? (src.by ? { by: src.by, role: src.role, at: src.at, locked: !!src.locked } : null) : scheduledBy(src));
  if (!info) return '';
  const now = new Date();
  const when = !info.at ? '' : sameDay(info.at, now) ? 'Today'
    : `${info.at.getDate()} ${MONTH_SHORT[info.at.getMonth()]}${info.at.getFullYear() === now.getFullYear() ? '' : ` ${info.at.getFullYear()}`}`;
  const role = info.by !== 'sounddna' && info.role ? `, ${roleLabel(info.role)}` : '';
  const text = `Scheduled by ${info.by}${role}${when ? ` · ${when}` : ''}`;
  return `<p class="cal-repeat__by" title="${escapeHtml(text)}">${info.locked ? icon('lock', 'cal-repeat__lock') : ''}<span>${escapeHtml(text)}</span></p>`;
}

function audioOf(spot) {
  const swapped = spot.audio ? spotToolAudios().find(a => a.title === spot.audio.title) : null;
  return { title: spot.audio ? spot.audio.title : null, duration: swapped ? swapped.duration : spot.duration };
}

function renderRepeat() {
  const r = repeat;
  const series = r.kind === 'series';
  const weekly = isWeekly(r);
  const repeating = r.perDay === 'repeat';
  const audio = audioOf(r.spot);
  const conflicts = previewCells().conflict.length;
  stopPanelAudio();

  const endField = `
      <p class="cal-repeat__label">Runs until</p>
      <div class="field field--date">
        <button class="field__btn" data-act="end" type="button"><span class="${r.end === '' ? 'is-placeholder' : ''}">${r.end === null ? 'infinite' : (r.end || 'Select end date')}</span></button>
        ${r.readonly ? '' : `<button class="field__aux" data-act="end-aux" type="button" aria-label="${r.end === null ? 'Remove infinite' : 'Set to infinite'}">${icon(r.end === null ? 'x' : 'infinity')}</button>`}
      </div>`;
  const dayChips = `
      <div class="cal-chips cal-chips--days">
        ${DAYS.slice(0, CAL_DAYS).map(d => `<button class="cal-chip cal-chip--day${r.days.has(d) ? ' is-active' : ''}" data-day="${d}" type="button">${d}</button>`).join('')}
      </div>`;
  const check = (key, on, label) => `<button class="cal-check${on ? ' is-on' : ''}" data-check="${key}" type="button" aria-pressed="${on}"><span class="cal-check__box">${icon('check')}</span>${label}</button>`;

  calTraySettings.innerHTML = `
    <div class="cal-repeat__head">
      <span class="cal-repeat__dot"></span>
      <p class="cal-repeat__title">${escapeHtml(r.spot.title)}</p>
      <button class="cal-repeat__close" data-act="close" aria-label="Close settings" type="button">${icon('x')}</button>
    </div>
    ${byLine(r)}

    <p class="cal-repeat__label">Audio</p>
    ${audio.title ? `<p class="cal-audio__name">${escapeHtml(audio.title)}</p>` : ''}
    <div class="cal-audio">
      <button class="play-btn" aria-label="Play" type="button">${icon('play', 'icon--filled')}</button>
      <div class="slider"><div class="slider__track"></div><div class="slider__progress"></div><div class="slider__thumb"></div></div>
      <span class="card__time"></span>
    </div>
    ${canManage() && !r.readonly ? '<button class="cal-chip cal-audio__change" data-act="audio" type="button">Change audio</button>' : ''}

    ${series ? seriesPicker(r) : ''}

    <div class="cal-repeat__body"${r.readonly ? ' inert' : ''}>
    <p class="cal-repeat__label">Days</p>
    ${series ? `${dayChips.replace('cal-chips--days', 'cal-chips--days cal-chips--flush')}${endField}` : `
      ${check('weekly', weekly, 'Weekly')}
      ${weekly ? `${dayChips}${endField}` : ''}`}

    ${series ? `
      <p class="cal-repeat__label">Times</p>
      <div class="cal-times">
        ${r.times.map(s => `
          <div class="cal-tchip">
            <div class="dropdown" data-dd="time" data-slot="${s}"></div>
            ${r.times.length > 1 && !r.readonly ? `<button class="cal-tchip__x" data-time-x="${s}" type="button" aria-label="Remove ${slotTime(s)}">${icon('x')}</button>` : ''}
          </div>`).join('')}
        ${r.readonly ? '' : '<div class="dropdown cal-times__add" data-dd="add-time"></div>'}
      </div>` : `
      <p class="cal-repeat__label">Times per day</p>
      ${check('repeat', repeating, 'Repeat')}
      ${repeating ? `
        <div class="cal-repeat__fields">
          <label class="cal-repeat__field"><span>Every</span><div class="dropdown" data-dd="every"></div></label>
          <label class="cal-repeat__field"><span>Until</span><div class="dropdown" data-dd="until"></div></label>
        </div>` : ''}`}

    ${canManage() && !r.readonly && (conflicts || r.override) ? `<div class="cal-repeat__replace">${check('override', r.override, 'Replace taken slots')}</div>` : ''}

    ${isHeadOffice() ? `
      <div class="cal-repeat__head-office">
        ${check('lock', r.locked, 'Lock for stores')}
        ${isNewSeries(r) ? check('allstores', r.allStores, 'All stores') : ''}
      </div>` : ''}
    </div>

    <div class="cal-repeat__foot">
      ${r.readonly ? `<button class="ghost-btn ghost-btn--sm" data-act="close" type="button">Close</button>` : `
      <button class="ghost-btn ghost-btn--sm" data-act="cancel" type="button">Cancel</button>
      <button class="ghost-btn ghost-btn--sm ghost-btn--invert" data-act="done" type="button"${repeatValid(r) ? '' : ' disabled'}>Done</button>`}
    </div>`;

  createPlayer({
    playBtn: calTraySettings.querySelector('.cal-audio .play-btn'),
    slider: calTraySettings.querySelector('.cal-audio .slider'),
    timeEl: calTraySettings.querySelector('.cal-audio .card__time'),
    duration: audio.duration,
    resetOnStop: true,
  });

  if (series) {
    /* Klick auf eine Uhrzeit: auf eine andere ändern */
    const free = keep => [...Array(CAL_SLOTS).keys()].filter(s => s === keep || !r.times.includes(s)).map(s => ({ value: slotTime(s), label: slotTime(s) }));
    calTraySettings.querySelectorAll('[data-dd="time"]').forEach(dd => {
      const cur = +dd.dataset.slot;
      buildDropdown(dd, {
        options: free(cur),
        value: slotTime(cur),
        tall: true,
        onChange: v => { r.times = r.times.map(s => (s === cur ? slotIndex(v) : s)).sort((a, b) => a - b); renderRepeat(); },
      });
    });
    const addTime = calTraySettings.querySelector('[data-dd="add-time"]');
    if (addTime) buildDropdown(addTime, {
      options: [...Array(CAL_SLOTS).keys()].filter(s => !r.times.includes(s)).map(s => ({ value: slotTime(s), label: slotTime(s) })),
      placeholder: 'Add',
      tall: true,
      onChange: v => { r.times = [...r.times, slotIndex(v)].sort((a, b) => a - b); renderRepeat(); },
    });
  } else if (repeating) {
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

/* Vorschau in der angezeigten Woche (auch beim Wochenwechsel):
   keep     – Slots, die bleiben bzw. neu sind (hell)
   place    – freie Zellen, in die der Spot neu kommt (hell angedeutet); auf
              schon gespielten Zellen nur zum Ansehen (ausgegraut) – dort
              kommt nichts dazu
   remove   – Slots der Serie, die mit der Änderung wegfallen: Zelle steht leer
              (gespielte nur in der Vorschau)
   conflict – belegt von einem anderen Spot: rot umrandet, mit „Replace
              taken slots“ steht dort stattdessen der neue Spot */
function previewCells() {
  const r = repeat;
  const out = { keep: [], place: [], remove: [], conflict: [] };
  const own = sameDay(calWeekStart, r.week);
  if (r.kind !== 'series' && own) out.keep.push(r.item.id);
  const items = weekItems(calWeekStart);
  const dates = calWeekDays(calWeekStart);
  const ours = it => r.kind === 'series' && r.series && it.seriesId === r.series.id;
  if (!repeatValid(r)) {
    /* ohne Tage fällt die ganze Serie weg, sonst (z. B. Enddatum fehlt) bleibt sie */
    items.forEach(it => { if (ours(it)) (r.days.size ? out.keep : out.remove).push(it.id); });
    return out;
  }
  const end = endOf(r);
  const rule = { days: [...r.days], start: repeatStart(r), end: end ? dayStart(end) : null };
  /* Gespieltes zeigt die Vorschau ab der Startwoche */
  const pastRule = { ...rule, start: mondayOf(rule.start) };
  const slots = repeatSlots(r);
  dates.forEach((date, di) => {
    const played = playedSlots(date);
    const on = isWeekly(r) ? seriesOn(rule, date, di) : own && di === r.item.day;
    const onPast = isWeekly(r) ? seriesOn(pastRule, date, di) : on;
    /* auch Gespieltes verschwindet in der Vorschau – nur zum Ansehen, es bleibt */
    items.forEach(it => {
      if (it.day === di && ours(it) && !((it.slot < played ? onPast : on) && slots.includes(it.slot))) out.remove.push(it.id);
    });
    slots.forEach(slot => {
      const it = items.find(i => i.day === di && i.slot === slot);
      if (slot < played) {
        if (!onPast) return;
        if (it && it.spotId === r.spot.id) out.keep.push(it.id);
        else if (!it && cellFree(calWeekStart, di, slot)) out.place.push({ di, slot });
        return;
      }
      if (!on) return;
      if (it && ours(it)) { out.keep.push(it.id); return; }
      if (it && r.kind !== 'series' && it.id === r.item.id) return;
      /* derselbe Spot läuft dort schon (andere Serie) – bleibt, kein Konflikt */
      if (it && it.spotId === r.spot.id) { out.keep.push(it.id); return; }
      if (it) { out.conflict.push(it.id); return; }
      if (cellFree(calWeekStart, di, slot)) out.place.push({ di, slot });
    });
  });
  return out;
}

function clearPreview() {
  calGrid.querySelectorAll('.cal-cell.is-preview').forEach(cell => {
    cell.classList.remove('is-preview');
    cell.removeAttribute('style');
    cell.querySelector('.cal-item__label')?.remove();
  });
  calGrid.querySelectorAll('.cal-item.is-target, .cal-item.is-removed').forEach(el => el.classList.remove('is-target', 'is-removed'));
  calGrid.querySelectorAll('.cal-item.is-conflict').forEach(el => {
    if (el.classList.contains('is-replace')) {
      el.setAttribute('style', el.dataset.origStyle);
      const label = el.querySelector('.cal-item__label');
      label.textContent = label.dataset.orig;
    }
    el.classList.remove('is-conflict', 'is-replace');
  });
}

function paintPreview() {
  clearPreview();
  const r = repeat;
  const p = previewCells();
  p.keep.forEach(id => calGrid.querySelector(`.cal-item[data-id="${id}"]`)?.classList.add('is-target'));
  p.remove.forEach(id => calGrid.querySelector(`.cal-item[data-id="${id}"]`)?.classList.add('is-removed'));
  p.place.forEach(({ di, slot }) => {
    const cell = calGrid.querySelector(`.cal-cell[data-day="${di}"][data-slot="${slot}"]`);
    if (!cell) return;
    cell.classList.add('is-preview');
    cell.setAttribute('style', catStyle(r.spot.category));
    cell.insertAdjacentHTML('beforeend', `<span class="cal-item__label">${escapeHtml(r.spot.title)}</span>`);
  });
  p.conflict.forEach(id => {
    const el = calGrid.querySelector(`.cal-item[data-id="${id}"]`);
    if (!el) return;
    el.classList.add('is-conflict');
    const it = weekItems(calWeekStart).find(i => i.id === id);
    if (!r.override || !it || !canEditItem(it)) return;
    el.classList.add('is-replace');
    el.dataset.origStyle = el.getAttribute('style') || '';
    el.setAttribute('style', catStyle(r.spot.category));
    const label = el.querySelector('.cal-item__label');
    label.dataset.orig = label.textContent;
    label.textContent = r.spot.title;
  });
}

calTraySettings.addEventListener('click', e => {
  const r = repeat;
  if (!r) return;
  const check = e.target.closest('[data-check]');
  const day = e.target.closest('[data-day]');
  const time = e.target.closest('[data-time-x]');
  const act = e.target.closest('[data-act]');
  const pick = e.target.closest('[data-series]');
  if (pick) {
    const next = userSeries.find(x => x.id === +pick.dataset.series);
    if (next && next !== r.series) openSeries(r.spot, next);
    return;
  }
  /* ohne Häkchen gilt „dieser Tag“ bzw. „einmal“ */
  if (check && check.dataset.check === 'weekly') r.mode = r.mode === 'weekly' ? 'day' : 'weekly';
  else if (check && check.dataset.check === 'repeat') r.perDay = r.perDay === 'repeat' ? 'once' : 'repeat';
  else if (check && check.dataset.check === 'override') r.override = !r.override;
  else if (check && check.dataset.check === 'lock') r.locked = !r.locked;
  else if (check && check.dataset.check === 'allstores') r.allStores = !r.allStores;
  else if (day) r.days.has(day.dataset.day) ? r.days.delete(day.dataset.day) : r.days.add(day.dataset.day);
  else if (time) r.times = r.times.filter(s => s !== +time.dataset.timeX);
  else if (act && act.dataset.act === 'end') {
    e.stopPropagation();
    const today = dayStart(new Date());
    openDatepicker(act.closest('.field--date'), {
      value: r.end || fmtDate(r.kind === 'series' ? today : r.date),
      min: r.kind === 'series' ? today : dayStart(r.date),
      allowInfinite: true,
      onSelect: d => { r.end = d; renderRepeat(); },
      onInfinite: () => { r.end = null; renderRepeat(); },
    });
    return;
  }
  /* ✕ nimmt „infinite“ weg (Feld wird leer), ∞ setzt es wieder */
  else if (act && act.dataset.act === 'end-aux') r.end = r.end === null ? '' : null;
  else if (act && act.dataset.act === 'close') { closeRepeat(); return; }
  else if (act && act.dataset.act === 'audio') { openAudioPicker(r.spot); return; }
  else if (act && act.dataset.act === 'cancel') {
    const dropped = r.kind === 'drop';
    closeRepeat();
    if (dropped) {
      /* Ablegen rückgängig: der Slot verschwindet, ohne Spur im Verlauf –
         kam seither etwas dazu (Audio getauscht), nur der Slot */
      if (undoStack.length === r.steps) discardPlanStep();
      else {
        /* … und auch aus dem Verlauf: Schritt des Ablegens raus, in den
           späteren Ständen fehlt der Slot */
        const key = fmtDate(r.week);
        undoStack.splice(r.steps - 1, 1);
        undoStack.slice(r.steps - 1).forEach(snap => {
          const w = snap.weeks.find(([k]) => k === key);
          if (w) w[1] = w[1].filter(i => i.id !== r.item.id);
        });
        removeItem(r.week, r.item.id);
      }
      syncReadyBadges();
      renderCalendar();
    }
    return;
  } else if (act && act.dataset.act === 'done') {
    applyRepeat();
    return;
  } else return;
  renderRepeat();
});

const timesLabel = slots => (slots.length > 4 ? `${slots.length} times a day` : `at ${slots.map(slotTime).join(', ')}`);
const skippedNote = n => (n ? ` ${n} taken slot${n === 1 ? '' : 's'} skipped.` : '');

function applyRepeat() {
  const r = repeat;
  const slots = repeatSlots(r);
  const end = endOf(r);
  const days = DAYS.filter(d => r.days.has(d));
  const locked = isHeadOffice() ? r.locked : false;
  if (r.kind === 'series') {
    recordUndo();
    const def = { days, slots: [...slots], start: r.start, end, override: r.override, locked };
    const { skipped } = r.series
      ? updateSeries(r.series.id, { ...def, locked: isHeadOffice() ? r.locked : null })
      : addSeries({ ...def, spotId: r.spot.id });
    if (!r.series) spotPlaced(r.spot);
    const stores = !r.series && isHeadOffice() && r.allStores ? addSeriesToAllStores(r.spot, def) : 0;
    showToast('success', `“${r.spot.title}” ${r.series ? 'now runs' : 'runs'} every ${daysLabel(days)} ${timesLabel(slots)}${end ? ` until ${longDate(end)}` : ''}${stores ? ` in all ${stores + 1} stores` : ''}.${skippedNote(skipped)}`);
    closeRepeat();
    renderCalendar();
    return;
  }
  const time = slotTime(r.item.slot);
  const perDay = slots.length > 1 ? `every ${r.every} min from ${time} to ${slotTime(slots[slots.length - 1])}` : `at ${time}`;
  if (r.mode === 'day') {
    const lockChanged = locked !== !!r.item.locked;
    if (slots.length === 1 && !lockChanged) { closeRepeat(); return; }
    recordUndo();
    r.item.locked = locked;
    let skipped = 0;
    slots.slice(1).forEach(slot => {
      const it = placeSpot(r.week, r.spot.id, r.item.day, slot, r.override);
      if (it) it.locked = locked;
      else if (!spotAt(r.week, r.item.day, slot, r.spot.id)) skipped++;
    });
    if (slots.length > 1) showToast('success', `“${r.spot.title}” runs ${perDay} on ${longDate(r.date)}.${skippedNote(skipped)}`);
    else emitPlanChange('week');
  } else {
    recordUndo();
    /* der Slot geht in der Serie auf */
    removeItem(r.week, r.item.id);
    const def = { days, slots, start: repeatStart(r), end, override: r.override, locked };
    const { skipped } = addSeries({ ...def, spotId: r.spot.id });
    const stores = isHeadOffice() && r.allStores ? addSeriesToAllStores(r.spot, def) : 0;
    showToast('success', `“${r.spot.title}” runs every ${daysLabel(days)} ${perDay}${end ? ` until ${longDate(end)}` : ''}${stores ? ` in all ${stores + 1} stores` : ''}.${skippedNote(skipped)}`);
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

/* ---------------------------------------------------------------
   Ungespeichert: rechts an der Leiste unten klappt „Unsaved changes“ mit
   Discard und Save an (⌘S speichert auch); Punkt am Menüpunkt Calendar,
   solange irgendein Store ungespeicherte Änderungen hat
   --------------------------------------------------------------- */
function syncSaveState() {
  const dirty = anyUnsaved();
  const n = unsavedList().length;
  calUnsaved.querySelector('.cal-unsaved__text').textContent =
    n > 1 || (n === 1 && !planDirty()) ? `Unsaved changes in ${n} store${n === 1 ? '' : 's'}` : 'Unsaved changes';
  calUnsaved.classList.toggle('is-open', dirty);
  calUnsaved.setAttribute('aria-hidden', String(!dirty));
  calUnsaved.querySelectorAll('button').forEach(b => { b.tabIndex = dirty ? 0 : -1; });
  setDraftDot('calendar', anyUnsaved());
  calStore.querySelectorAll('.dropdown__option').forEach(o => o.classList.toggle('is-unsaved', storeUnsaved(o.dataset.value)));
}

/* Head Office: Save und Discard gelten für alle Stores mit Änderungen */
const storesNote = n => (n > 1 ? ` in ${n} stores` : '');

function savePlanNow() {
  if (!anyUnsaved()) return;
  closeRepeat();
  const n = commitAll();
  showToast('success', `Changes${storesNote(n)} saved.`);
}

document.getElementById('cal-save').addEventListener('click', savePlanNow);
document.getElementById('cal-discard').addEventListener('click', () => {
  if (!anyUnsaved()) return;
  closeRepeat();
  const n = discardAll();
  syncReadyBadges();
  renderCalendar();
  showToast('success', `Changes${storesNote(n)} discarded.`);
});
document.addEventListener('keydown', e => {
  if (calendarView.hidden || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
  e.preventDefault();
  savePlanNow();
});

/* ---- Store-Auswahl (Head Office) ---- */
function renderStorePicker() {
  calStore.hidden = !isHeadOffice();
  if (calStore.hidden) { calStore.innerHTML = ''; return; }
  buildDropdown(calStore, {
    options: accessibleStores().map(st => ({ value: st.id, label: st.name })),
    value: currentStore.id,
    tall: true,
    onChange: id => { closeRepeat(); switchStore(id); },
  });
}

onPlanChange(kind => {
  if (kind === 'store') syncReadyBadges();
  if (kind === 'access') {
    /* andere Rolle: andere Rechte – neu zeichnen */
    closeRepeat();
    if (!calendarView.hidden) renderCalendar();
  }
  if (kind === 'access' || kind === 'store') renderStorePicker();
  syncSaveState();
});
renderStorePicker();
syncSaveState();

/* ---- Wochennavigation ---- */
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
calPrev.addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() - 7); renderCalendar(); });
calNext.addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() + 7); renderCalendar(); });
document.getElementById('cal-today').addEventListener('click', () => { calWeekStart = mondayOf(new Date()); renderCalendar(); });

/* Klick auf die Woche: Datum wählen, der Kalender springt in dessen Woche */
calRange.addEventListener('click', e => {
  e.stopPropagation();
  const wrap = calRange.parentElement;
  if (wrap.querySelector('.datepicker')) { closeAllMenus(); return; }
  openDatepicker(wrap, {
    value: fmtDate(calWeekStart),
    onSelect: d => { calWeekStart = mondayOf(parseDate(d)); renderCalendar(); },
  });
});

document.addEventListener('keydown', e => {
  if (calendarView.hidden || (e.target instanceof Element && e.target.closest('input, textarea'))) return;
  if (e.key === 'ArrowLeft') calPrev.click();
  if (e.key === 'ArrowRight') calNext.click();
});

