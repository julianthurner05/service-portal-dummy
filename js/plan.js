/* ================================================================
   PLAN – die eine Quelle für den Durchsagenplan
   - Kategorien, Store-Regeln (Öffnungszeiten, Quiet Hours), Slot-Raster
   - Spot-Bibliothek: Spots aus dem Plan + Spots aus dem SpotTool; was
     „ready“ ist, steht in der Liste „Scheduling Spots“ im Calendar
   - Wochen im Calendar: jede Woche wird beim ersten Öffnen aus den Serien
     befüllt (Basisplan + im Calendar angelegte), danach lebt jeder Slot
     für sich; Serien lassen sich nachträglich bearbeiten
   - Feiertage / Sonderöffnungszeiten, Ersetzen belegter Slots
   - der ganze Plan bleibt im Browser gespeichert (?reset setzt zurück)
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

/* Feiertage und Sonderöffnungszeiten (Beispiel Österreich) – hours null = geschlossen */
const SPECIAL_DAYS = [
  { date: '26.10.2026', name: 'National Day',           hours: null },
  { date: '08.12.2026', name: 'Immaculate Conception',  hours: ['10:00', '18:00'] },
  { date: '24.12.2026', name: 'Christmas Eve',          hours: ['09:00', '14:00'] },
  { date: '25.12.2026', name: 'Christmas Day',          hours: null },
  { date: '26.12.2026', name: 'St. Stephen’s Day',      hours: null },
  { date: '31.12.2026', name: 'New Year’s Eve',         hours: ['09:00', '16:00'] },
  { date: '01.01.2027', name: 'New Year’s Day',         hours: null },
  { date: '06.01.2027', name: 'Epiphany',               hours: null },
  { date: '29.03.2027', name: 'Easter Monday',          hours: null },
  { date: '01.05.2027', name: 'Labour Day',             hours: null },
  { date: '06.05.2027', name: 'Ascension Day',          hours: null },
  { date: '17.05.2027', name: 'Whit Monday',            hours: null },
  { date: '27.05.2027', name: 'Corpus Christi',         hours: null },
];
const specialDay = date => SPECIAL_DAYS.find(s => s.date === fmtDate(date)) || null;

/* Öffnungszeit an einem bestimmten Tag – Feiertage gehen vor */
function hoursOn(date) {
  const sp = specialDay(date);
  return sp ? sp.hours : STORE_HOURS[dayIdx(date)];
}

function isOpen(date, time) {
  const h = hoursOn(date);
  return !!h && minutesOf(time) >= minutesOf(h[0]) && minutesOf(time) < minutesOf(h[1]);
}

function isQuiet(dayI, time) {
  return QUIET_HOURS.some(q => q.day === dayI && minutesOf(time) >= minutesOf(q.from) && minutesOf(time) < minutesOf(q.to));
}

/* ---- Slot-Raster ---- */
const CAL_HOUR_START = 9;                          /* Öffnung – davor läuft nichts */
const CAL_HOUR_END   = 21;                         /* exklusiv: letzte Zeile 20:45 */
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
const cellBlocked = (date, slot) => !isOpen(date, slotTime(slot)) || isQuiet(dayIdx(date), slotTime(slot));

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
const spots = [];                     /* { id, title, category (null = noch keine), duration, source: 'plan' | 'spottool', ready, retired,
                                          audio (null = Original, sonst { title } aus dem SpotTool) } */

const findSpot = title => spots.find(s => s.title === title) || null;
const spotById = id => spots.find(s => s.id === id) || null;

/* front: neue SpotTool-Spots stehen in der Liste oben */
function addSpot({ title, category = 'standard', duration = 9, source = 'plan', ready = true, front = false }) {
  let s = findSpot(title);
  if (s) {
    if (s.retired) { s.retired = false; emitPlanChange('spots'); }
    return s;
  }
  s = { id: ++spotUid, title, category, duration, source, ready, retired: false, audio: null };
  if (front) spots.unshift(s); else spots.push(s);
  emitPlanChange('spots');
  return s;
}

/* „Ready for Schedule“: der Spot steht in der Liste im Calendar.
   Frisch aus dem SpotTool hat er noch keine Kategorie (null) – er steht
   unten unter „Ready for Schedule“ und wird erst durch Ziehen in eine Kategorie
   einplanbar. Aus der Liste nehmen lässt eingeplante Slots stehen. */
function setSpotReady(meta, ready) {
  const s = addSpot({ ...meta, ready });
  if (s.ready !== ready) {
    s.ready = ready;
    if (ready) moveSpotToEnd(s);
    emitPlanChange('spots');
  }
  return s;
}

function moveSpotToEnd(s) {
  spots.splice(spots.indexOf(s), 1);
  spots.push(s);
}

/* Kategorie ändern (Ziehen in eine andere Gruppe der Liste) – der Spot steht
   danach unten in seiner neuen Gruppe; Farbe ändert sich überall mit */
function setSpotCategory(spotId, category) {
  const s = spotById(spotId);
  if (!s || s.category === category) return false;
  s.category = category;
  moveSpotToEnd(s);
  emitPlanChange('spots');
  return true;
}

const isSpotReady = title => { const s = findSpot(title); return !!s && s.ready && !s.retired; };

/* Opening/Closing vergibt sounddna – nie in der Liste */
const paletteSpots = () => spots.filter(s => s.ready && !s.retired && s.category !== 'closing');

/* Spot gelöscht: aus der Palette nehmen und aus dieser und allen kommenden
   Wochen entfernen. Liefert die Zahl der entfernten Slots. */
function retireSpot(title) {
  const s = findSpot(title);
  if (!s || s.retired) return 0;
  s.retired = true;
  s.ready = false;
  for (let i = userSeries.length - 1; i >= 0; i--) if (userSeries[i].spotId === s.id) userSeries.splice(i, 1);
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

/* Audio austauschen (z. B. im SpotTool umgetextet): Slots, Serien und
   Kategorie bleiben, nur die Aufnahme wechselt. null = wieder das Original */
function setSpotAudio(spotId, audio) {
  const s = spotById(spotId);
  if (!s) return;
  s.audio = audio;
  emitPlanChange('spots');
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
  { title: 'Café Bar Schlussdurchsage',        category: 'commercial' },
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
  { spot: 'Café Bar Schlussdurchsage',        days: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], times: ['17:10'] },

  /* fix – von sounddna vergeben, dürfen bis zur Schließzeit laufen */
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
   können sich einen 15-Minuten-Slot teilen). Eine Durchsage genau auf der
   Rasterkante (Fr 21:00) kommt in den letzten Slot, statt zu verschwinden. */
const CLOSING_OFFSETS = [30, 15, 5, 0];         /* 1.–4. Schlussdurchsage: Minuten vor Ladenschluss */

function fixedCells(monday) {
  const cells = new Map();
  weekDates(monday).forEach((date, di) => BASE_PLAN.forEach(e => {
    if (!e.fixed || !entryActive(e, date, di)) return;
    const sp = specialDay(date);
    if (sp && !sp.hours) return;                   /* Feiertag: geschlossen, keine Durchsagen */
    const spot = findSpot(e.spot);
    /* Sonderöffnungszeit: Schlussdurchsagen rücken an die frühere Schließzeit */
    const times = sp ? [hhmm(minutesOf(sp.hours[1]) - CLOSING_OFFSETS[parseInt(e.spot, 10) - 1])] : e.times;
    times.forEach(time => {
      const slot = minutesOf(time) === CAL_HOUR_END * 60 ? CAL_SLOTS - 1 : slotIndex(time);
      if (slot < 0 || slot >= CAL_SLOTS) return;
      const key = `${di}:${slot}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ spot, time });
    });
  }));
  cells.forEach(list => list.sort((a, b) => minutesOf(a.time) - minutesOf(b.time)));
  return cells;
}

/* Slots einer Woche – beim ersten Zugriff aus den Serien befüllt, in ihrer
   Reihenfolge (Basisplan zuerst, zeitlich begrenzte Aktionen vorne); Serien
   mit „Replace taken slots“ gehen allen vor */
function weekItems(monday) {
  const key = fmtDate(monday);
  if (weeks.has(key)) return weeks.get(key);

  const taken = new Set(fixedCells(monday).keys());
  const items = [];
  const order = [...userSeries.filter(r => r.override), ...userSeries.filter(r => !r.override)];
  weekDates(monday).forEach((date, di) => order.forEach(r => {
    const spot = spotById(r.spotId);
    if (!spot || spot.retired || !seriesOn(r, date, di)) return;
    r.slots.forEach(slot => {
      const cell = `${di}:${slot}`;
      if (slot < 0 || slot >= CAL_SLOTS || taken.has(cell) || cellBlocked(date, slot)) return;
      taken.add(cell);
      items.push({ id: ++itemUid, spotId: r.spotId, day: di, slot, seriesId: r.id });
    });
  }));
  weeks.set(key, items);
  return items;
}

/* ---------------------------------------------------------------
   Wiederholungen (Serien) – im Calendar beim Ablegen eingestellt:
   ein Spot zu einer oder mehreren Uhrzeiten (Repeat: alle N Minuten)
   an gewählten Wochentagen, ab dem Ablegedatum bis zu einem Enddatum
   oder ohne Ende
   --------------------------------------------------------------- */
let seriesUid = 0;
const userSeries = [];                /* alle Serien: { id, spotId, days: ['Mo', …], slots: [slot, …], start: Date, end: Date | null, override } */

const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function seriesOn(r, date, dayI) {
  if (dayI >= CAL_DAYS || !r.days.includes(DAYS[dayI])) return false;
  const d = dayStart(date);
  return d >= r.start && (!r.end || d <= r.end);
}

/* der Basisplan wird zu ganz normalen Serien – damit ist jeder Slot im
   Calendar bearbeitbar (fixe Schlussdurchsagen bleiben im Basisplan) */
BASE_PLAN.forEach(e => {
  if (e.fixed) return;
  userSeries.push({
    id: ++seriesUid, spotId: findSpot(e.spot).id, days: [...e.days], slots: e.times.map(slotIndex),
    start: parseDate(e.start || PLAN_START), end: e.end ? parseDate(e.end) : null, override: false,
  });
});

/* Zelle für einen Spot freimachen (Replace taken slots): ein anderer,
   noch nicht gespielter Slot dort wird entfernt. Fixe, gesperrte und
   gespielte Zellen bleiben, wie sie sind – derselbe Spot auch. */
function clearCellFor(monday, dayI, slot, spotId = null) {
  const date = weekDates(monday)[dayI];
  if (slot < playedSlots(date) || cellBlocked(date, slot) || fixedCells(monday).has(`${dayI}:${slot}`)) return;
  const items = weekItems(monday);
  const i = items.findIndex(x => x.day === dayI && x.slot === slot);
  if (i >= 0 && items[i].spotId !== spotId) items.splice(i, 1);
}

/* läuft der Spot dort schon (z. B. aus einer anderen seiner Serien)? */
function spotAt(monday, dayI, slot, spotId) {
  return weekItems(monday).some(x => x.day === dayI && x.slot === slot && x.spotId === spotId);
}

/* Serie anlegen: gilt für alle Wochen, die später zum ersten Mal geöffnet
   werden, und wird sofort in die schon geöffneten Wochen eingetragen.
   override: belegte Slots werden ersetzt statt übersprungen.
   Liefert { placed, skipped } für die schon geöffneten Wochen. */
function addSeries({ spotId, days, slots, start, end = null, override = false }) {
  const r = { id: ++seriesUid, spotId, days, slots, start: dayStart(start), end: end ? dayStart(end) : null, override };
  userSeries.push(r);
  let placed = 0, skipped = 0;
  weeks.forEach((items, key) => {
    const monday = parseDate(key);
    weekDates(monday).forEach((date, di) => {
      if (!seriesOn(r, date, di)) return;
      slots.forEach(slot => {
        /* gespielt oder gesperrt (zu, Feiertag, Quiet Hour) zählt nicht als belegt */
        if (slot < playedSlots(date) || cellBlocked(date, slot)) return;
        if (override) clearCellFor(monday, di, slot, spotId);
        if (cellFree(monday, di, slot)) {
          weekItems(monday).push({ id: ++itemUid, spotId, day: di, slot, seriesId: r.id });
          placed++;
        } else if (!spotAt(monday, di, slot, spotId)) {
          skipped++;
        }
      });
    });
  });
  emitPlanChange('week');
  return { series: r, placed, skipped };
}

/* Serie bearbeiten (Tage, Uhrzeiten, Ende) – gilt ab jetzt: Gespieltes bleibt,
   in den geöffneten Wochen kommt nur der Unterschied dazu bzw. weg, einzeln
   gelöschte oder verschobene Slots bleiben also, wie sie sind. */
function updateSeries(seriesId, { days, slots, end = null, override = false }) {
  const r = userSeries.find(x => x.id === seriesId);
  if (!r) return { placed: 0, skipped: 0 };
  const old = { ...r, days: [...r.days], slots: [...r.slots] };
  Object.assign(r, { days, slots, end: end ? dayStart(end) : null, override: r.override || override });
  let placed = 0, skipped = 0;
  weeks.forEach((items, key) => {
    const monday = parseDate(key);
    weekDates(monday).forEach((date, di) => {
      const played = playedSlots(date);
      const wasOn = seriesOn(old, date, di), isOn = seriesOn(r, date, di);
      new Set([...old.slots, ...r.slots]).forEach(slot => {
        if (slot < played) return;
        const before = wasOn && old.slots.includes(slot);
        const after = isOn && r.slots.includes(slot);
        if (before && !after) {
          const i = items.findIndex(x => x.seriesId === r.id && x.day === di && x.slot === slot);
          if (i >= 0) items.splice(i, 1);
        } else if (!before && after && !cellBlocked(date, slot)) {
          if (override) clearCellFor(monday, di, slot, r.spotId);
          if (cellFree(monday, di, slot)) {
            weekItems(monday).push({ id: ++itemUid, spotId: r.spotId, day: di, slot, seriesId: r.id });
            placed++;
          } else if (!spotAt(monday, di, slot, r.spotId)) {
            skipped++;
          }
        }
      });
    });
  });
  emitPlanChange('week');
  return { placed, skipped };
}

/* Gespielt: vergangene Tage ganz, heute alle Slots bis zur aktuellen Uhrzeit
   (ein Slot zählt ab seiner Startzeit). Liefert die Zahl gespielter Slots. */
function playedSlots(date, now = new Date()) {
  if (dayStart(date) < dayStart(now)) return CAL_SLOTS;
  if (!sameDay(date, now)) return 0;
  const elapsed = now.getHours() * 60 + now.getMinutes() - CAL_HOUR_START * 60;
  return elapsed < 0 ? 0 : Math.min(CAL_SLOTS, Math.floor(elapsed / SLOT_MIN) + 1);
}

/* noch nicht gespielte Slots eines Spots in einer Woche (optional nur an einem Tag) */
function spotSlotsAhead(spotId, monday, day = null) {
  const dates = weekDates(monday);
  return weekItems(monday).filter(i =>
    i.spotId === spotId && (day === null || i.day === day) && i.slot >= playedSlots(dates[i.day]));
}

/* Spot aus dem Kalender nehmen – nur, was noch nicht gespielt hat:
   'all'  ab jetzt überall (seine Serien enden mit gestern),
   'week' nur in dieser Woche, 'day' nur an einem Tag dieser Woche.
   Liefert die Zahl der entfernten Slots in den schon geöffneten Wochen. */
function removeSpotSlots(spotId, scope, monday, day = null) {
  const s = spotById(spotId);
  if (!s) return 0;
  if (scope === 'all') {
    const today = dayStart(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    for (let i = userSeries.length - 1; i >= 0; i--) {
      const r = userSeries[i];
      if (r.spotId !== spotId) continue;
      if (r.start >= today) userSeries.splice(i, 1);
      else if (!r.end || r.end > yesterday) r.end = yesterday;
    }
  }
  let removed = 0;
  weeks.forEach((items, key) => {
    const m = parseDate(key);
    if (scope !== 'all' && !sameDay(m, monday)) return;
    const ahead = new Set(spotSlotsAhead(spotId, m, scope === 'day' ? day : null));
    for (let i = items.length - 1; i >= 0; i--) {
      if (ahead.has(items[i])) { items.splice(i, 1); removed++; }
    }
  });
  emitPlanChange('week');
  return removed;
}

/* ---------------------------------------------------------------
   Abgelaufen: ein Spot war nur zeitlich begrenzt geplant (alle seine Serien
   haben ein Ende), alle Zeiträume sind vorbei und er hat in dieser und den
   kommenden Wochen keine Slots mehr
   --------------------------------------------------------------- */
function spotEnd(spot) {
  const ends = [];
  let open = false;
  userSeries.forEach(r => {
    if (r.spotId !== spot.id) return;
    if (r.end) ends.push(r.end); else open = true;
  });
  if (open || !ends.length) return null;            /* unbefristet oder nie geplant */
  return new Date(Math.max(...ends));
}

function isSpotExpired(spot) {
  const end = spotEnd(spot);
  const today = dayStart(new Date());
  if (!end || end >= today) return false;
  const thisWeek = mondayOf(today);
  for (const [key, items] of weeks) {
    if (parseDate(key) >= thisWeek && items.some(i => i.spotId === spot.id)) return false;
  }
  return true;
}

/* läuft in den nächsten Tagen aus (für einen Hinweis in der Liste) */
const ENDS_SOON_DAYS = 7;
function spotEndsSoon(spot) {
  const end = spotEnd(spot);
  if (!end) return false;
  const today = dayStart(new Date());
  return end >= today && (end - today) / 864e5 <= ENDS_SOON_DAYS;
}

/* frei für einen Spot: offen, keine Quiet Hour, kein fixer und kein anderer Slot */
function cellFree(monday, dayI, slot, ignoreId = null) {
  if (dayI < 0 || dayI >= CAL_DAYS || slot < 0 || slot >= CAL_SLOTS || cellBlocked(weekDates(monday)[dayI], slot)) return false;
  if (fixedCells(monday).has(`${dayI}:${slot}`)) return false;
  return !weekItems(monday).some(i => i.id !== ignoreId && i.day === dayI && i.slot === slot);
}

function placeSpot(monday, spotId, dayI, slot, override = false) {
  if (override) clearCellFor(monday, dayI, slot, spotId);
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

/* ---------------------------------------------------------------
   Rückgängig / Wiederholen (⌘Z / ⇧⌘Z im Calendar)
   Vor jeder Änderung im Calendar wird der ganze Plan-Zustand gemerkt:
   geöffnete Wochen, Serien und die Spots (Kategorie, Liste, Reihenfolge).
   Noch nicht geöffnete Wochen entstehen beim nächsten Öffnen ohnehin neu.
   --------------------------------------------------------------- */
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 60;

function snapshotPlan() {
  return {
    weeks: [...weeks].map(([key, items]) => [key, items.map(i => ({ ...i }))]),
    series: userSeries.map(r => ({ ...r, days: [...r.days], slots: [...r.slots] })),
    spots: spots.map(sp => ({ ...sp })),
  };
}

function restorePlan(snap) {
  weeks.clear();
  snap.weeks.forEach(([key, items]) => weeks.set(key, items.map(i => ({ ...i }))));
  userSeries.splice(0, userSeries.length, ...snap.series.map(r => ({ ...r, days: [...r.days], slots: [...r.slots] })));
  spots.splice(0, spots.length, ...snap.spots.map(sp => ({ ...sp })));
  emitPlanChange('spots');
  emitPlanChange('week');
}

/* vor einer Änderung aufrufen */
function recordUndo() {
  undoStack.push(snapshotPlan());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function undoPlan() {
  if (!undoStack.length) return false;
  redoStack.push(snapshotPlan());
  restorePlan(undoStack.pop());
  return true;
}

/* Abbrechen: letzten Schritt verwerfen – zurück auf den Stand davor, ohne
   dass er sich wiederherstellen lässt */
function discardPlanStep() {
  if (!undoStack.length) return false;
  restorePlan(undoStack.pop());
  return true;
}

function redoPlan() {
  if (!redoStack.length) return false;
  undoStack.push(snapshotPlan());
  restorePlan(redoStack.pop());
  return true;
}

/* Änderungen aus dem SpotTool (Liste, Löschen) gehören nicht in den Verlauf
   des Calendar – danach ist ein Zurückspringen nicht mehr eindeutig */
function clearPlanHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
}

/* ---------------------------------------------------------------
   Speichern: der ganze Plan (Wochen, Serien, Spots) liegt im Browser und
   übersteht ein Neuladen. ?reset in der Adresse startet wieder beim Basisplan.
   PLAN_VERSION hochzählen, wenn sich der Basisplan im Code ändert.
   --------------------------------------------------------------- */
const PLAN_KEY = 'sounddna-plan';
const PLAN_VERSION = 1;

function savePlan() {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify({ v: PLAN_VERSION, ...snapshotPlan(), uids: { spotUid, itemUid, seriesUid } }));
  } catch { /* privat / voll – dann eben ohne Speichern */ }
}

function loadPlan() {
  try {
    if (new URLSearchParams(location.search).has('reset')) { localStorage.removeItem(PLAN_KEY); return; }
    const data = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
    if (!data || data.v !== PLAN_VERSION) return;
    data.series.forEach(r => { r.start = new Date(r.start); r.end = r.end ? new Date(r.end) : null; });
    ({ spotUid, itemUid, seriesUid } = data.uids);
    restorePlan(data);
  } catch { /* kaputt – Basisplan bleibt */ }
}

loadPlan();
let saveTimer = null;
onPlanChange(() => { clearTimeout(saveTimer); saveTimer = setTimeout(savePlan, 150); });
