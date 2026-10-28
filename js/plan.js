/* ================================================================
   PLAN – die eine Quelle für den Durchsagenplan
   - Kategorien, Store-Regeln (Öffnungszeiten, Quiet Hours), Slot-Raster
   - Spot-Bibliothek: Spots aus dem Plan + fertige Spots aus dem SpotTool
   - Wochen im Calendar: jede Woche wird beim ersten Öffnen aus dem
     Basisplan befüllt, danach lebt jeder Slot für sich
   - fixe Slots (Opening/Closing) vergibt sounddna – sie kommen jede Woche
     aus dem Basisplan und sind nicht verschieb- oder löschbar
   SpotTool, Calendar und Home lesen und schreiben nur hierüber.
   ================================================================ */

/* ---- Tage & Monate ---- */
const DAYS        = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_NAMES   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---- Kategorien = Farben der Slots ---- */
const CATEGORIES = [
  { value: 'closing',    label: 'Opening/Closing', color: 'var(--cat-closing)' },
  { value: 'standard',   label: 'Standard',        color: 'var(--cat-standard)' },
  { value: 'commercial', label: 'Commercial',      color: 'var(--cat-commercial)' },
  { value: 'special',    label: 'Special',         color: 'var(--cat-special)' },
];
const catOf    = id => CATEGORIES.find(c => c.value === id) || {};
const catColor = id => catOf(id).color || 'transparent';

/* Kategorie-Variablen als Style-String (Commercial/Gelb bekommt mehr Farbanteil) */
function catStyle(id) {
  const v = { '--cat': catColor(id) };
  if (id === 'commercial') { v['--cat-tint'] = 'var(--cat-tint-commercial)'; v['--cat-tint-strong'] = 'var(--cat-tint-commercial-strong)'; }
  return Object.entries(v).map(([k, val]) => `${k}:${val};`).join('');
}

/* ---- Store-Regeln (Beispiel IKEA Vösendorf) – Index 0 = Montag ---- */
const STORE_HOURS = [['09:00', '20:00'], ['09:00', '20:00'], ['09:00', '20:00'], ['09:00', '20:00'], ['09:00', '21:00'], ['09:00', '18:00'], null];
const QUIET_HOURS = [{ day: 2, from: '16:00', to: '18:00' }];

/* "Wednesday 16–18" bzw. "Mo–Th 9–20 · Fr 9–21 · Sa 9–18" */
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

function isOpen(dayI, time) {
  const h = STORE_HOURS[dayI];
  return !!h && minutesOf(time) >= minutesOf(h[0]) && minutesOf(time) < minutesOf(h[1]);
}

function isQuiet(dayI, time) {
  return QUIET_HOURS.some(q => q.day === dayI && minutesOf(time) >= minutesOf(q.from) && minutesOf(time) < minutesOf(q.to));
}

/* ---- Slot-Raster ---- */
const CAL_HOUR_START = 8;
const CAL_HOUR_END   = 22;                         /* exklusiv */
const CAL_SLOTS      = (CAL_HOUR_END - CAL_HOUR_START) * 60 / SLOT_MIN;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
const CAL_DAYS       = 6;                          /* Mo–Sa: Sonntag ist geschlossen und wird nicht gezeigt */
document.documentElement.style.setProperty('--cal-slots', CAL_SLOTS);
document.documentElement.style.setProperty('--cal-days', CAL_DAYS);

const slotIndex = t => Math.floor((minutesOf(t) - CAL_HOUR_START * 60) / SLOT_MIN);
const slotTime  = s => hhmm(CAL_HOUR_START * 60 + s * SLOT_MIN);
const sameDay   = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const weekDates = monday => [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
const calWeekDays = monday => weekDates(monday).slice(0, CAL_DAYS);

/* frei bespielbar: offen und keine Quiet Hour */
const cellBlocked = (dayI, slot) => !isOpen(dayI, slotTime(slot)) || isQuiet(dayI, slotTime(slot));

/* ---------------------------------------------------------------
   Änderungen melden – Calendar, Home und SpotTool hören mit
   --------------------------------------------------------------- */
const planListeners = new Set();
const onPlanChange  = fn => planListeners.add(fn);
const emitPlanChange = kind => planListeners.forEach(fn => fn(kind));

/* ---------------------------------------------------------------
   Spot-Bibliothek
   --------------------------------------------------------------- */
let spotUid = 0;
const spots = [];                     /* { id, title, category, duration, source: 'plan' | 'spottool', retired } */

const findSpot = title => spots.find(s => s.title === title) || null;
const spotById = id => spots.find(s => s.id === id) || null;

/* front: neue SpotTool-Spots stehen in der Palette oben */
function addSpot({ title, category = 'standard', duration = 9, source = 'plan', front = false }) {
  let s = findSpot(title);
  if (s) {
    if (s.retired) { s.retired = false; emitPlanChange('spots'); }
    return s;
  }
  s = { id: ++spotUid, title, category, duration, source, retired: false };
  if (front) spots.unshift(s); else spots.push(s);
  emitPlanChange('spots');
  return s;
}

/* Opening/Closing vergibt sounddna – nicht in der Palette */
const paletteSpots = () => spots.filter(s => !s.retired && s.category !== 'closing');

/* Spot gelöscht: aus der Palette nehmen und aus dieser und allen kommenden
   Wochen entfernen. Liefert die Zahl der entfernten Slots. */
function retireSpot(title) {
  const s = findSpot(title);
  if (!s || s.retired) return 0;
  s.retired = true;
  const thisWeek = mondayOf(new Date());
  let removed = 0;
  weeks.forEach((items, key) => {
    if (parseDate(key) < thisWeek) return;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].spotId === s.id) { items.splice(i, 1); removed++; }
    }
  });
  emitPlanChange('spots');
  if (removed) emitPlanChange('week');
  return removed;
}

/* ---------------------------------------------------------------
   Basisplan – IKEA Vösendorf, Durchsagenplan aus der Excel-Vorlage
   (Woche 21.–26.09.2026), läuft ab 31.08.2026 jede Woche weiter.
   Ein Spot pro Slot, nichts in der Stillen Stunde, nichts außerhalb der
   Öffnungszeit. Zeitlich begrenzte Aktionen stehen vorne und haben damit
   in ihrem Zeitraum Vorrang vor den Dauerbrennern.
   --------------------------------------------------------------- */
const PLAN_START = '31.08.2026';
const MO_FR = ['Mo', 'Tu', 'We', 'Th', 'Fr'];
const MO_TH = ['Mo', 'Tu', 'We', 'Th'];
const MO_SA = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const NO_WE = ['Mo', 'Tu', 'Th', 'Fr'];              /* Mittwoch hat die Stille Stunde 16–18 → eigene Variante */

[
  { title: 'Weihnachtsöffnungszeiten Hinweis', category: 'special' },
  { title: 'IKEA Family Punkte Aktion Juli',   category: 'commercial' },
  { title: 'IKEA FOOD Frühstücksangebot',      category: 'commercial' },
  { title: 'IKEA FAMILY Durchsage',            category: 'standard' },
  { title: 'SCAN & PAY Durchsage',             category: 'standard' },
  { title: 'IKEA Geschenkkarte Durchsage',     category: 'standard' },
  { title: 'Neuer Gesenkter Preis Durchsage',  category: 'commercial' },
  { title: 'ZLS Durchsage',                    category: 'standard' },
  { title: 'SMÅLAND Kipa Durchsage',           category: 'special' },
  { title: 'Stille Stunde Durchsage',          category: 'special' },
  { title: 'Café Bar Schlussdurchsage',        category: 'closing' },
  { title: '1. Schlussdurchsage',              category: 'closing' },
  { title: '2. Schlussdurchsage',              category: 'closing' },
  { title: '3. Schlussdurchsage',              category: 'closing' },
  { title: '4. Schlussdurchsage',              category: 'closing' },
].forEach(s => addSpot(s));

const BASE_PLAN = [
  { spot: 'Weihnachtsöffnungszeiten Hinweis', days: MO_SA, times: ['11:00', '17:00'], start: '01.12.2026', end: '23.12.2026' },
  { spot: 'IKEA Family Punkte Aktion Juli',   days: MO_SA, times: ['10:00', '15:00'], start: '01.07.2026', end: '31.07.2026' },
  { spot: 'IKEA FOOD Frühstücksangebot',      days: MO_SA, times: ['09:00', '09:45'] },
  { spot: 'IKEA FAMILY Durchsage',            days: NO_WE, times: ['10:00', '13:00', '16:00', '19:00'] },
  { spot: 'IKEA FAMILY Durchsage',            days: ['We'], times: ['10:00', '13:00', '19:00'] },
  { spot: 'IKEA FAMILY Durchsage',            days: ['Sa'], times: ['10:00', '13:00', '16:00'] },
  { spot: 'SCAN & PAY Durchsage',             days: NO_WE, times: ['10:30', '12:30', '15:30', '17:30'] },
  { spot: 'SCAN & PAY Durchsage',             days: ['We'], times: ['10:30', '12:30'] },
  { spot: 'SCAN & PAY Durchsage',             days: ['Sa'], times: ['11:30', '13:30', '15:30'] },
  { spot: 'IKEA Geschenkkarte Durchsage',     days: MO_SA, times: ['11:00', '14:00'] },
  { spot: 'Neuer Gesenkter Preis Durchsage',  days: NO_WE, times: ['11:30', '14:30', '16:30', '18:30'] },
  { spot: 'Neuer Gesenkter Preis Durchsage',  days: ['We'], times: ['11:30', '14:30', '18:30'] },
  { spot: 'Neuer Gesenkter Preis Durchsage',  days: ['Sa'], times: ['12:30', '14:30', '16:30'] },
  { spot: 'ZLS Durchsage',                    days: MO_FR, times: ['12:00', '15:00', '18:00'] },
  { spot: 'ZLS Durchsage',                    days: ['Sa'], times: ['12:00', '15:00'] },
  { spot: 'SMÅLAND Kipa Durchsage',           days: ['Fr'], times: ['13:30'] },
  { spot: 'SMÅLAND Kipa Durchsage',           days: ['Sa'], times: ['10:30'] },
  { spot: 'Stille Stunde Durchsage',          days: ['We'], times: ['15:45'] },

  /* fix – von sounddna vergeben, dürfen bis zur Schließzeit laufen */
  { spot: 'Café Bar Schlussdurchsage', fixed: true, days: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], times: ['17:10'] },
  { spot: '1. Schlussdurchsage', fixed: true, days: MO_TH, times: ['19:30'] },
  { spot: '2. Schlussdurchsage', fixed: true, days: MO_TH, times: ['19:45'] },
  { spot: '3. Schlussdurchsage', fixed: true, days: MO_TH, times: ['19:55'] },
  { spot: '4. Schlussdurchsage', fixed: true, days: MO_TH, times: ['20:00'] },
  { spot: '1. Schlussdurchsage', fixed: true, days: ['Fr'], times: ['20:30'] },
  { spot: '2. Schlussdurchsage', fixed: true, days: ['Fr'], times: ['20:45'] },
  { spot: '3. Schlussdurchsage', fixed: true, days: ['Fr'], times: ['20:55'] },
  { spot: '4. Schlussdurchsage', fixed: true, days: ['Fr'], times: ['21:00'] },
  { spot: '1. Schlussdurchsage', fixed: true, days: ['Sa'], times: ['17:30'] },
  { spot: '2. Schlussdurchsage', fixed: true, days: ['Sa'], times: ['17:45'] },
  { spot: '3. Schlussdurchsage', fixed: true, days: ['Sa'], times: ['17:55'] },
  { spot: '4. Schlussdurchsage', fixed: true, days: ['Sa'], times: ['18:00'] },
];

function entryActive(e, date, dayI) {
  if (!e.days.includes(DAYS[dayI])) return false;
  if (date < parseDate(e.start || PLAN_START)) return false;
  return !(e.end && date > parseDate(e.end));
}

/* ---------------------------------------------------------------
   Wochen
   --------------------------------------------------------------- */
let itemUid = 0;
const weeks = new Map();              /* Montag 'dd.mm.yyyy' → [{ id, spotId, day, slot }] */

/* fixe Slots einer Woche: 'day:slot' → [{ spot, time }] (mehrere Schlussdurchsagen
   können sich einen 15-Minuten-Slot teilen) */
function fixedCells(monday) {
  const cells = new Map();
  weekDates(monday).forEach((date, di) => BASE_PLAN.forEach(e => {
    if (!e.fixed || !entryActive(e, date, di)) return;
    const spot = findSpot(e.spot);
    e.times.forEach(time => {
      const slot = slotIndex(time);
      if (slot < 0 || slot >= CAL_SLOTS) return;
      const key = `${di}:${slot}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ spot, time });
    });
  }));
  cells.forEach(list => list.sort((a, b) => minutesOf(a.time) - minutesOf(b.time)));
  return cells;
}

/* Slots einer Woche – beim ersten Zugriff aus dem Basisplan befüllt */
function weekItems(monday) {
  const key = fmtDate(monday);
  if (weeks.has(key)) return weeks.get(key);

  const taken = new Set(fixedCells(monday).keys());
  const items = [];
  weekDates(monday).forEach((date, di) => BASE_PLAN.forEach(e => {
    if (e.fixed || !entryActive(e, date, di)) return;
    const spot = findSpot(e.spot);
    if (!spot || spot.retired) return;
    e.times.forEach(time => {
      const slot = slotIndex(time);
      if (slot < 0 || slot >= CAL_SLOTS || cellBlocked(di, slot)) return;
      const cell = `${di}:${slot}`;
      if (taken.has(cell)) return;
      taken.add(cell);
      items.push({ id: ++itemUid, spotId: spot.id, day: di, slot });
    });
  }));
  weeks.set(key, items);
  return items;
}

/* frei für einen Spot: offen, keine Quiet Hour, kein fixer und kein anderer Slot */
function cellFree(monday, dayI, slot, ignoreId = null) {
  if (dayI < 0 || dayI >= CAL_DAYS || slot < 0 || slot >= CAL_SLOTS || cellBlocked(dayI, slot)) return false;
  if (fixedCells(monday).has(`${dayI}:${slot}`)) return false;
  return !weekItems(monday).some(i => i.id !== ignoreId && i.day === dayI && i.slot === slot);
}

function placeSpot(monday, spotId, dayI, slot) {
  if (!cellFree(monday, dayI, slot)) return null;
  const it = { id: ++itemUid, spotId, day: dayI, slot };
  weekItems(monday).push(it);
  emitPlanChange('week');
  return it;
}

function moveItem(monday, id, dayI, slot) {
  const it = weekItems(monday).find(i => i.id === id);
  if (!it || !cellFree(monday, dayI, slot, id)) return false;
  it.day = dayI;
  it.slot = slot;
  emitPlanChange('week');
  return true;
}

function removeItem(monday, id) {
  const items = weekItems(monday);
  const idx = items.findIndex(i => i.id === id);
  if (idx < 0) return false;
  items.splice(idx, 1);
  emitPlanChange('week');
  return true;
}

/* alle Durchsagen eines Tages (Slots + fixe), nach Uhrzeit – für Home */
function announcementsOn(date) {
  const monday = mondayOf(date);
  const di = dayIdx(date);
  const list = weekItems(monday)
    .filter(i => i.day === di)
    .map(i => ({ time: slotTime(i.slot), slot: i.slot, spot: spotById(i.spotId), fixed: false }));
  fixedCells(monday).forEach((entries, key) => {
    const [d, slot] = key.split(':').map(Number);
    if (d === di) entries.forEach(f => list.push({ time: f.time, slot, spot: f.spot, fixed: true }));
  });
  return list.sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}
