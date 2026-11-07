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

/* ---- Stores – Öffnungszeiten, Stille Stunde, Team; jeder Store hat seinen
   eigenen Plan. Wer alle Stores sieht (Account → Access), schaltet im
   Calendar zwischen ihnen um. shift: der Basisplan läuft dort um so viele
   Minuten versetzt; team: [Name, Rolle]. Index 0 = Montag ---- */
const weekHours = (wd, fr, sa) => [wd, wd, wd, wd, fr, sa, null];
const STORES = [
  { id: 'voesendorf',  name: 'IKEA Vösendorf',        hours: weekHours(['09:00', '20:00'], ['09:00', '21:00'], ['09:00', '18:00']), quiet: [{ day: 2, from: '16:00', to: '18:00' }], shift: 0,   team: [['Lisa Berger', 'manager'], ['Markus Hofer', 'editor'], ['Julian Thurner', 'editor']] },
  { id: 'wien-nord',   name: 'IKEA Wien Nord',        hours: weekHours(['10:00', '20:00'], ['10:00', '20:00'], ['09:00', '18:00']), quiet: [{ day: 1, from: '15:00', to: '17:00' }], shift: 30,  team: [['Sarah Gruber', 'manager'], ['Tobias Wagner', 'editor']] },
  { id: 'westbahnhof', name: 'IKEA Wien Westbahnhof', hours: weekHours(['09:00', '21:00'], ['09:00', '21:00'], ['09:00', '20:00']), quiet: [{ day: 3, from: '14:00', to: '16:00' }], shift: 15,  team: [['Elena Novak', 'manager'], ['David Pichler', 'editor']] },
  { id: 'graz',        name: 'IKEA Graz',             hours: weekHours(['09:30', '19:30'], ['09:30', '20:00'], ['09:00', '18:00']), quiet: [{ day: 2, from: '17:00', to: '19:00' }], shift: -15, team: [['Katharina Mayer', 'manager'], ['Florian Steiner', 'editor']] },
  { id: 'haid',        name: 'IKEA Haid',             hours: weekHours(['10:00', '20:00'], ['10:00', '20:00'], ['09:00', '18:00']), quiet: [{ day: 0, from: '16:00', to: '18:00' }], shift: 45,  team: [['Johanna Leitner', 'manager'], ['Stefan Huber', 'editor']] },
  { id: 'salzburg',    name: 'IKEA Salzburg',         hours: weekHours(['09:30', '19:00'], ['09:30', '20:00'], ['09:00', '18:00']), quiet: [{ day: 3, from: '16:00', to: '18:00' }], shift: 15,  team: [['Anna Fuchs', 'manager'], ['Lukas Eder', 'editor']] },
  { id: 'innsbruck',   name: 'IKEA Innsbruck',        hours: weekHours(['10:00', '19:00'], ['10:00', '19:00'], ['09:00', '18:00']), quiet: [{ day: 1, from: '16:00', to: '18:00' }], shift: 30,  team: [['Marie Hofmann', 'manager'], ['Jakob Brunner', 'editor']] },
  { id: 'klagenfurt',  name: 'IKEA Klagenfurt',       hours: weekHours(['09:00', '19:00'], ['09:00', '19:00'], ['09:00', '18:00']), quiet: [{ day: 4, from: '15:00', to: '17:00' }], shift: 0,   team: [['Laura Wieser', 'manager'], ['Simon Moser', 'editor']] },
];
const HOME_STORE = STORES[0];          /* der eigene Store des eingeloggten Users */
const CURRENT_USER = 'Julian Thurner';
const HEAD_OFFICE_USER = 'Claudia Brandl';   /* Head Office – plant zentrale Kampagnen */

/* ---- Rollen – wer was im Calendar darf. Grundregel: ändern darf man, was
   jemand auf der eigenen Stufe oder darunter eingeplant hat; was Head Office
   für die Stores sperrt (locked), nur Head Office.
   viewer   nur ansehen und anhören
   editor   einplanen, Serien und Slots von Editoren ändern und löschen
   manager  alles im eigenen Store: Kategorien, Audio, Replace taken slots,
            Opening/Closing, Serien des ganzen Teams
   head     alle Stores, Kampagnen in alle Stores auf einmal, sperren ---- */
const ROLES = [
  { value: 'viewer',  label: 'Viewer' },
  { value: 'editor',  label: 'Editor' },
  { value: 'manager', label: 'Store Manager' },
  { value: 'head',    label: 'Head Office' },
];
const roleRank  = role => ROLES.findIndex(x => x.value === role);
const roleLabel = role => (ROLES.find(x => x.value === role) || {}).label || '';
let currentRole = 'manager';          /* aus dem Speicher – siehe unten */

const canEdit      = () => currentRole !== 'viewer';
const canManage    = () => roleRank(currentRole) >= roleRank('manager');
const isHeadOffice = () => currentRole === 'head';

/* einen Spot neu einplanen (Opening/Closing erst ab Store Manager) */
const canPlaceSpot = spot => canEdit() && !!spot && (spot.category !== 'closing' || canManage());

/* Serie oder einzelnen Slot ändern */
function canEditEntry(entry, spot) {
  if (!canEdit()) return false;
  if (isHeadOffice()) return true;
  if (!entry || entry.locked) return false;
  if (spot && spot.category === 'closing' && !canManage()) return false;
  return roleRank(entry.role || 'editor') <= roleRank(currentRole);
}

const seriesOf = item => (item.seriesId && userSeries.find(x => x.id === item.seriesId)) || null;
const canEditItem = item => canEditEntry(seriesOf(item) || item, spotById(item.spotId));

/* Regeln des gerade gewählten Stores */
const STORE_HOURS = [];
const QUIET_HOURS = [];
let currentStore = HOME_STORE;

function applyStore(store) {
  currentStore = store;
  STORE_HOURS.splice(0, STORE_HOURS.length, ...store.hours);
  QUIET_HOURS.splice(0, QUIET_HOURS.length, ...store.quiet);
}

/* "9" bzw. "9:30" */
const hourLabel = t => (t.endsWith(':00') ? String(parseInt(t, 10)) : t.replace(/^0/, ''));

/* "Wednesday 16–18" bzw. "Mo–Th 9–20 · Fr 9–21 · Sa 9–18" */
const quietHoursLabel = () =>
  QUIET_HOURS.map(q => `${DAY_NAMES[q.day]} ${hourLabel(q.from)}–${hourLabel(q.to)}`).join(', ');

function storeHoursLabel() {
  const parts = [];
  STORE_HOURS.forEach((h, i) => {
    if (!h) return;
    const last = parts[parts.length - 1];
    if (last && last.h[0] === h[0] && last.h[1] === h[1] && last.to === i - 1) { last.to = i; return; }
    parts.push({ from: i, to: i, h });
  });
  return parts.map(p => `${DAYS[p.from]}${p.to > p.from ? `–${DAYS[p.to]}` : ''} ${hourLabel(p.h[0])}–${hourLabel(p.h[1])}`).join(' · ');
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
let planMuted = false;                /* beim Aufsetzen eines Plans still */
let dirtyMemo = null;                 /* „ungespeichert?“ – nach jeder Änderung neu bestimmt */
const emitPlanChange = kind => {
  dirtyMemo = null;
  if (!planMuted) planListeners.forEach(fn => fn(kind));
};

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

const paletteSpots = () => spots.filter(s => s.ready && !s.retired);

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
   (Woche 21.–26.09.2026), läuft ab 31.08.2026 jede Woche weiter; die
   anderen Stores bekommen ihn um ihren shift versetzt.
   Ein Spot pro Slot, nichts in der Stillen Stunde, nichts außerhalb der
   Öffnungszeit. Zeitlich begrenzte Aktionen stehen vorne und haben damit
   in ihrem Zeitraum Vorrang vor den Dauerbrennern.
   --------------------------------------------------------------- */
const PLAN_START = '31.08.2026';
const MO_FR = ['Mo', 'Tu', 'We', 'Th', 'Fr'];
const MO_SA = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const NO_WE = ['Mo', 'Tu', 'Th', 'Fr'];              /* Mittwoch hat die Stille Stunde 16–18 → eigene Variante */
/* Varianten, die sich nur durch gesperrte Zeiten unterscheiden (Stille Stunde,
   Samstag bis 18 Uhr), werden beim Laden zu einer Serie zusammengelegt */

const SPOT_LIBRARY = [
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
];

/* head: zentrale Kampagne von Head Office, für die Stores gesperrt.
   19:00 bzw. 17:10 der Vorlage liegen jetzt eine Spur früher – die letzte
   Stunde vor Ladenschluss gehört den Schlussdurchsagen */
const BASE_PLAN = [
  { spot: 'Weihnachtsöffnungszeiten Hinweis', days: MO_SA, times: ['11:00', '17:00'], start: '01.12.2026', end: '23.12.2026', head: true },
  { spot: 'IKEA Family Punkte Aktion Juli',   days: MO_SA, times: ['10:00', '15:00'], start: '01.07.2026', end: '31.07.2026', head: true },
  { spot: 'IKEA FOOD Frühstücksangebot',      days: MO_SA, times: ['09:00', '09:45'] },
  { spot: 'IKEA FAMILY Durchsage',            days: NO_WE, times: ['10:00', '13:00', '16:00', '18:45'] },
  { spot: 'IKEA FAMILY Durchsage',            days: ['We'], times: ['10:00', '13:00', '18:45'] },
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
  { spot: 'Café Bar Schlussdurchsage',        days: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], times: ['16:45'] },
];

/* Schlussdurchsagen: die vier Slots vor Ladenschluss – je Schließzeit eine
   Serie. Ganz normale Slots: verschieben, löschen, Serie bearbeiten */
const CLOSINGS = ['1. Schlussdurchsage', '2. Schlussdurchsage', '3. Schlussdurchsage', '4. Schlussdurchsage'];

function closingPlan() {
  const byClose = new Map();
  STORE_HOURS.forEach((h, i) => {
    if (!h || i >= CAL_DAYS) return;
    if (!byClose.has(h[1])) byClose.set(h[1], []);
    byClose.get(h[1]).push(DAYS[i]);
  });
  const out = [];
  byClose.forEach((days, close) => CLOSINGS.forEach((spot, k) =>
    out.push({ spot, days, times: [hhmm(minutesOf(close) - (CLOSINGS.length - k) * SLOT_MIN)], by: 'sounddna', role: 'manager' })));
  return out;
}

/* Stille Stunde: Hinweis im Slot davor */
const quietPlan = () => QUIET_HOURS.map(q =>
  ({ spot: 'Stille Stunde Durchsage', days: [DAYS[q.day]], times: [hhmm(minutesOf(q.from) - SLOT_MIN)] }));

/* ---------------------------------------------------------------
   Wochen
   --------------------------------------------------------------- */
let itemUid = 0;
const weeks = new Map();              /* Montag 'dd.mm.yyyy' → [{ id, spotId, day, slot, seriesId?, by?, at? }]
                                         by/at nur bei Slots ohne Serie – sonst steht es an der Serie */

/* Slots einer Woche – beim ersten Zugriff aus den Serien befüllt, in ihrer
   Reihenfolge (Schlussdurchsagen zuerst, zeitlich begrenzte Aktionen vorne);
   Serien mit „Replace taken slots“ gehen allen vor */
function weekItems(monday) {
  const key = fmtDate(monday);
  if (weeks.has(key)) return weeks.get(key);
  const items = buildWeek(monday, userSeries, spots).map(i => ({ id: ++itemUid, ...i }));
  weeks.set(key, items);
  return items;
}

/* die Slots einer Woche aus Serien (auch aus einem gespeicherten Stand) */
function buildWeek(monday, seriesList, spotList) {
  const taken = new Set();
  const items = [];
  const order = [...seriesList.filter(r => r.override), ...seriesList.filter(r => !r.override)];
  weekDates(monday).forEach((date, di) => order.forEach(r => {
    const spot = spotList.find(x => x.id === r.spotId);
    if (!spot || spot.retired || !seriesOn(r, date, di)) return;
    r.slots.forEach(slot => {
      const cell = `${di}:${slot}`;
      if (slot < 0 || slot >= CAL_SLOTS || taken.has(cell) || cellBlocked(date, slot)) return;
      taken.add(cell);
      items.push({ spotId: r.spotId, day: di, slot, seriesId: r.id });
    });
  }));
  return items;
}

/* ---------------------------------------------------------------
   Wiederholungen (Serien) – im Calendar beim Ablegen eingestellt:
   ein Spot zu einer oder mehreren Uhrzeiten (Repeat: alle N Minuten)
   an gewählten Wochentagen, ab dem Ablegedatum bis zu einem Enddatum
   oder ohne Ende
   --------------------------------------------------------------- */
let seriesUid = 0;
const userSeries = [];                /* alle Serien: { id, spotId, days: ['Mo', …], slots: [slot, …], start: Date, end: Date | null, override,
                                          by: wer sie eingeplant hat, role: dessen Rolle, at: Date,
                                          locked: von Head Office für die Stores gesperrt } */

const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function seriesOn(r, date, dayI) {
  if (dayI >= CAL_DAYS || !r.days.includes(DAYS[dayI])) return false;
  const d = dayStart(date);
  return d >= r.start && (!r.end || d <= r.end);
}

/* an einem Wochentag grundsätzlich nicht zu vergeben: zu oder Stille Stunde */
function weekdayBlocked(dayI, slot) {
  const t = slotTime(slot);
  const h = STORE_HOURS[dayI];
  return !h || minutesOf(t) < minutesOf(h[0]) || minutesOf(t) >= minutesOf(h[1]) || isQuiet(dayI, t);
}

/* Serien eines Spots zusammenlegen, die an ihren Tagen dieselben Uhrzeiten
   haben – eine Uhrzeit, die an einem Tag ohnehin gesperrt ist, zählt dabei
   als gleich (Mo–Sa 10, 13, 16, 19 Uhr statt Mo–Fr / Mi / Sa). Eine eigene
   Serie bleibt nur ein Tag, der wirklich anders läuft. Gleicher Zeitraum,
   gleiches „Replace“, dieselbe Person und gleiche Sperre sind Voraussetzung. */
function mergeSeries(spotId) {
  const eff = (slots, day) => slots.filter(x => !weekdayBlocked(DAYS.indexOf(day), x)).sort((a, b) => a - b).join();
  for (let changed = true; changed;) {
    changed = false;
    const own = userSeries.filter(r => r.spotId === spotId);
    for (let i = 0; i < own.length && !changed; i++) {
      for (let j = i + 1; j < own.length && !changed; j++) {
        const a = own[i], b = own[j];
        if (+a.start !== +b.start || +(a.end || 0) !== +(b.end || 0) || a.override !== b.override) continue;
        if (a.by !== b.by || a.role !== b.role || !!a.locked !== !!b.locked) continue;
        if (a.days.some(d => b.days.includes(d))) continue;
        const u = [...new Set([...a.slots, ...b.slots])].sort((x, y) => x - y);
        if (![a, b].every(r => r.days.every(d => eff(r.slots, d) === eff(u, d)))) continue;
        a.days = DAYS.filter(d => a.days.includes(d) || b.days.includes(d));
        a.slots = u;
        userSeries.splice(userSeries.indexOf(b), 1);
        weeks.forEach(items => items.forEach(it => { if (it.seriesId === b.id) it.seriesId = a.id; }));
        changed = true;
      }
    }
  }
}

/* Plan eines Stores neu aufsetzen: Spot-Bibliothek, dann Schlussdurchsagen,
   Stille Stunde und Basisplan als ganz normale Serien – jeder Slot ist im
   Calendar bearbeitbar. Eingeplant hat sie das Team des Stores (die
   Schlussdurchsagen sounddna, zentrale Kampagnen Head Office), ein paar
   Tage vor dem Start. */
function seedPlan(store) {
  spots.length = 0;
  userSeries.length = 0;
  weeks.clear();
  spotUid = itemUid = seriesUid = 0;
  SPOT_LIBRARY.forEach(s => addSpot(s));
  const shifted = t => hhmm(minutesOf(t) + store.shift);
  [...closingPlan(), ...quietPlan(), ...BASE_PLAN.map(e => ({ ...e, times: e.times.map(shifted) }))].forEach(e => {
    const slots = e.times.map(slotIndex).filter(s => s >= 0 && s < CAL_SLOTS);
    if (!slots.length) return;
    const n = SPOT_LIBRARY.findIndex(s => s.title === e.spot);
    const start = parseDate(e.start || PLAN_START);
    const at = new Date(Math.min(start, parseDate(PLAN_START)));
    at.setDate(at.getDate() - 2 - n % 5);
    const [name, role] = e.head ? [HEAD_OFFICE_USER, 'head'] : e.by ? [e.by, e.role] : store.team[n % store.team.length];
    userSeries.push({
      id: ++seriesUid, spotId: findSpot(e.spot).id, days: [...e.days], slots,
      start, end: e.end ? parseDate(e.end) : null, override: false,
      by: name, role, at, locked: !!e.head,
    });
  });
  spots.forEach(sp => mergeSeries(sp.id));
  planRev = savedRev = revUid = 0;
}

/* Zelle für einen Spot freimachen (Replace taken slots): ein anderer,
   noch nicht gespielter Slot dort wird entfernt – sofern der User ihn ändern
   darf. Gesperrte und gespielte Zellen bleiben, wie sie sind, derselbe Spot auch. */
function clearCellFor(monday, dayI, slot, spotId = null) {
  const date = weekDates(monday)[dayI];
  if (slot < playedSlots(date) || cellBlocked(date, slot)) return;
  const items = weekItems(monday);
  const i = items.findIndex(x => x.day === dayI && x.slot === slot);
  if (i >= 0 && items[i].spotId !== spotId && canEditItem(items[i])) items.splice(i, 1);
}

/* läuft der Spot dort schon (z. B. aus einer anderen seiner Serien)? */
function spotAt(monday, dayI, slot, spotId) {
  return weekItems(monday).some(x => x.day === dayI && x.slot === slot && x.spotId === spotId);
}

/* Serie anlegen: gilt für alle Wochen, die später zum ersten Mal geöffnet
   werden, und wird sofort in die schon geöffneten Wochen eingetragen.
   override: belegte Slots werden ersetzt statt übersprungen.
   Liefert { placed, skipped } für die schon geöffneten Wochen. */
function addSeries({ spotId, days, slots, start, end = null, override = false, locked = false }) {
  const r = { id: ++seriesUid, spotId, days, slots, start: dayStart(start), end: end ? dayStart(end) : null, override,
              by: CURRENT_USER, role: currentRole, at: new Date(), locked };
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
  mergeSeries(spotId);
  emitPlanChange('week');
  return { placed, skipped };
}

/* Serie bearbeiten (Tage, Uhrzeiten, Ende) – gilt ab jetzt: Gespieltes bleibt,
   in den geöffneten Wochen kommt nur der Unterschied dazu bzw. weg, einzeln
   gelöschte oder verschobene Slots bleiben also, wie sie sind. */
function updateSeries(seriesId, { days, slots, end = null, override = false, locked = null }) {
  const r = userSeries.find(x => x.id === seriesId);
  if (!r) return { placed: 0, skipped: 0 };
  const old = { ...r, days: [...r.days], slots: [...r.slots] };
  Object.assign(r, { days, slots, end: end ? dayStart(end) : null, override: r.override || override });
  if (locked !== null) r.locked = locked;
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
  mergeSeries(r.spotId);
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
   'from' ab dem angeklickten Slot (Tag + Uhrzeit) überall: seine Serien
          enden mit dem Vortag, was an dem Tag davor liegt, bleibt,
   'week' nur in dieser Woche, 'day' nur an einem Tag dieser Woche.
   Nur, was der User ändern darf (Rollen). Liefert die Zahl der entfernten Slots in den schon geöffneten Wochen. */
function removeSpotSlots(spotId, scope, monday, day = null, slot = 0) {
  const s = spotById(spotId);
  if (!s) return 0;
  const from = scope === 'from' ? weekDates(monday)[day] : null;
  if (from) {
    const before = new Date(from);
    before.setDate(from.getDate() - 1);
    const cut = new Map();
    for (let i = userSeries.length - 1; i >= 0; i--) {
      const r = userSeries[i];
      if (r.spotId !== spotId || !canEditEntry(r, s)) continue;
      if (r.start >= from) { cut.set(r.id, r); userSeries.splice(i, 1); }
      else if (!r.end || r.end > before) { cut.set(r.id, r); r.end = before; }
    }
    /* was an dem Tag vor dem Slot bleibt, gehört zu keiner Serie mehr –
       wer es eingeplant hat, steht dann am Slot selbst */
    weekItems(monday).forEach(it => {
      const r = it.day === day && cut.get(it.seriesId);
      if (!r) return;
      delete it.seriesId;
      Object.assign(it, { by: r.by, role: r.role, at: r.at, locked: r.locked });
    });
  }
  let removed = 0;
  weeks.forEach((items, key) => {
    const m = parseDate(key);
    if (!from && !sameDay(m, monday)) return;
    const dates = weekDates(m);
    const ahead = new Set(spotSlotsAhead(spotId, m, scope === 'day' ? day : null));
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!ahead.has(it) || !canEditItem(it)) continue;
      if (from && (dates[it.day] < from || (sameDay(dates[it.day], from) && it.slot < slot))) continue;
      items.splice(i, 1);
      removed++;
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
  return !weekItems(monday).some(i => i.id !== ignoreId && i.day === dayI && i.slot === slot);
}

function placeSpot(monday, spotId, dayI, slot, override = false) {
  if (override) clearCellFor(monday, dayI, slot, spotId);
  if (!cellFree(monday, dayI, slot)) return null;
  const it = { id: ++itemUid, spotId, day: dayI, slot, by: CURRENT_USER, role: currentRole, at: new Date() };
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

/* alle Durchsagen eines Tages, nach Uhrzeit – für Home */
function announcementsOn(date) {
  const di = dayIdx(date);
  return weekItems(mondayOf(date))
    .filter(i => i.day === di)
    .map(i => ({ time: slotTime(i.slot), slot: i.slot, spot: spotById(i.spotId) }))
    .sort((a, b) => a.slot - b.slot);
}

/* wer einen Slot eingeplant hat (an seiner Serie bzw. am Slot selbst) */
function scheduledBy(item) {
  const src = seriesOf(item) || item;
  return src.by ? { by: src.by, role: src.role || null, at: src.at || null, locked: !!src.locked } : null;
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
    rev: planRev,
  };
}

function restorePlan(snap) {
  weeks.clear();
  snap.weeks.forEach(([key, items]) => weeks.set(key, items.map(i => ({ ...i }))));
  userSeries.splice(0, userSeries.length, ...snap.series.map(r => ({ ...r, days: [...r.days], slots: [...r.slots] })));
  spots.splice(0, spots.length, ...snap.spots.map(sp => ({ ...sp })));
  if (snap.rev !== undefined) planRev = snap.rev;
  emitPlanChange('spots');
  emitPlanChange('week');
}

/* vor einer Änderung aufrufen */
function recordUndo() {
  undoStack.push(snapshotPlan());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  planRev = ++revUid;                 /* neuer Stand – bis „Save“ ungespeichert */
  emitPlanChange('dirty');
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
   Speichern: Änderungen im Calendar gelten erst mit „Save“. Bis dahin ist
   der Plan ein Entwurf – er bleibt im Browser und übersteht ein Neuladen,
   der Menüpunkt Calendar trägt so lange einen Punkt. Jede Änderung im
   Calendar (recordUndo) bekommt eine neue Nummer (planRev); gespeichert
   ist, solange sie der zuletzt gespeicherten entspricht – Undo bis dorthin
   heißt also wieder „nichts zu speichern“. Änderungen aus dem SpotTool
   (Liste, Löschen, Audio) brauchen kein „Save“.
   Jeder Store hat seinen eigenen Plan; ?reset in der Adresse startet
   überall wieder beim Basisplan. PLAN_VERSION hochzählen, wenn sich der
   Basisplan im Code ändert.
   --------------------------------------------------------------- */
const PLAN_KEY = 'sounddna-plan';
const PLAN_VERSION = 4;
const UNSAVED_KEY = 'sounddna-unsaved';
const ROLE_KEY = 'sounddna-role';
const STORE_KEY = 'sounddna-store';
const planKey  = id => `${PLAN_KEY}:${id}`;        /* Entwurf (was gerade zu sehen ist) */
const savedKey = id => `${PLAN_KEY}-saved:${id}`;  /* zuletzt gespeicherter Stand – für „Discard“ */

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat / voll – dann eben ohne Speichern */ }
}

let planRev = 0, savedRev = 0, revUid = 0;

/* gespeicherter Stand des geöffneten Stores – für Discard und den Vergleich */
let savedSnap = null;
let savedWeekMap = new Map();         /* seine offenen Wochen */
const savedGen = new Map();           /* Wochen, die dort noch nicht offen waren – aus seinen Serien */

function setSavedSnap(snap) {
  savedSnap = snap;
  savedWeekMap = new Map(snap.weeks);
  savedGen.clear();
  dirtyMemo = null;
}

/* Ungespeichert heißt: der Plan sieht anders aus als der gespeicherte Stand.
   Wer etwas ändert und es wieder zurückstellt (Slot zurückgeschoben, Tag
   wieder an), hat also nichts zu speichern. Verglichen werden Slots (ohne
   ihre IDs), Serien und Kategorie/Audio der Spots – nicht, was das SpotTool
   ändert (Liste, Ready, gelöschte Spots). */
const itemSig = i => `${i.spotId}:${i.day}:${i.slot}:${i.seriesId || 0}:${i.locked ? 1 : 0}`;
const weekSig = (items, gone) => items.filter(i => !gone.has(i.spotId)).map(itemSig).sort().join('|');
const seriesSig = r => [r.id, r.spotId, r.days.join(), [...r.slots].sort((a, b) => a - b).join(), +r.start, +(r.end || 0), r.override ? 1 : 0, r.locked ? 1 : 0].join('/');

function planDiffers() {
  const saved = savedSnap;
  const gone = new Set(spots.filter(sp => sp.retired).map(sp => sp.id));
  const savedSpots = new Map(saved.spots.map(sp => [sp.id, sp]));
  const audioOf = sp => (sp.audio ? sp.audio.title : null);
  for (const sp of spots) {
    if (sp.retired) continue;
    const o = savedSpots.get(sp.id);
    if (o ? o.category !== sp.category || audioOf(o) !== audioOf(sp) : sp.category !== null) return true;
  }
  const sig = list => list.filter(r => !gone.has(r.spotId)).map(seriesSig).sort().join('\n');
  if (sig(userSeries) !== sig(saved.series)) return true;
  for (const key of new Set([...weeks.keys(), ...savedWeekMap.keys()])) {
    let old = savedWeekMap.get(key);
    if (!old) {
      if (!savedGen.has(key)) savedGen.set(key, buildWeek(parseDate(key), saved.series, saved.spots));
      old = savedGen.get(key);
    }
    if (weekSig(weekItems(parseDate(key)), gone) !== weekSig(old, gone)) return true;
  }
  return false;
}

function planDirty() {
  if (dirtyMemo === null) dirtyMemo = !!savedSnap && planDiffers();
  return dirtyMemo;
}

/* Stores mit ungespeicherten Änderungen – auch die gerade nicht gewählten */
const unsavedStores = new Set(readLocal(UNSAVED_KEY, []));

/* Entwurf ablegen (nach jeder Änderung, kurz verzögert) */
function savePlan() {
  if (planDirty()) unsavedStores.add(currentStore.id); else unsavedStores.delete(currentStore.id);
  writeLocal(planKey(currentStore.id), { v: PLAN_VERSION, ...snapshotPlan(), savedRev, uids: { spotUid, itemUid, seriesUid, revUid } });
  writeLocal(UNSAVED_KEY, [...unsavedStores]);
}

/* den jetzigen Stand als gespeicherten festhalten */
function writeSaved() {
  const snap = { v: PLAN_VERSION, ...snapshotPlan() };
  writeLocal(savedKey(currentStore.id), snap);
  setSavedSnap(snap);
}

/* „Save“: der Entwurf gilt */
function commitPlan() {
  savedRev = planRev;
  clearTimeout(saveTimer);
  writeSaved();
  savePlan();
  emitPlanChange('saved');
}

/* „Discard“: zurück auf den gespeicherten Stand. Was das SpotTool seither
   geändert hat (neue Spots, Ready, gelöscht), bleibt – das braucht ja kein
   Save. Mit ⌘Z lässt sich das Verwerfen zurücknehmen. */
function discardPlan() {
  if (!planDirty() || !savedSnap) return false;
  const now = spots.map(sp => ({ ...sp }));
  recordUndo();
  planMuted = true;
  restorePlan(savedSnap);
  now.forEach(c => {
    const sp = spotById(c.id);
    if (!sp) { spots.push(c); return; }
    sp.ready = c.ready;
    if (c.retired && !sp.retired) retireSpot(sp.title);
  });
  planRev = savedRev;
  planMuted = false;
  emitPlanChange('spots');
  emitPlanChange('week');
  emitPlanChange('saved');
  return true;
}

/* Datumsangaben aus dem Speicher wieder zu Dates */
function reviveSnapshot(data) {
  data.series.forEach(r => { r.start = new Date(r.start); r.end = r.end ? new Date(r.end) : null; r.at = r.at ? new Date(r.at) : null; });
  data.weeks.forEach(([, items]) => items.forEach(i => { if (i.at) i.at = new Date(i.at); }));
}

function loadPlan() {
  const data = readLocal(planKey(currentStore.id), null);
  if (!data || data.v !== PLAN_VERSION) return false;
  try {
    reviveSnapshot(data);
    ({ spotUid, itemUid, seriesUid, revUid } = data.uids);
    savedRev = data.savedRev;
    restorePlan(data);
    return true;
  } catch {
    seedPlan(currentStore);           /* kaputt – Basisplan */
    return false;
  }
}

/* ---- Rolle (Account → Role): Head Office sieht alle Stores ---- */
currentRole = ROLES.some(x => x.value === readLocal(ROLE_KEY, '')) ? readLocal(ROLE_KEY, '') : 'manager';
const accessibleStores = () => (isHeadOffice() ? STORES : [HOME_STORE]);
const storeUnsaved = id => (id === currentStore.id ? planDirty() : unsavedStores.has(id));
const unsavedList = () => accessibleStores().filter(s => storeUnsaved(s.id));
const anyUnsaved = () => unsavedList().length > 0;

/* Store öffnen: gespeicherter Entwurf bzw. Basisplan */
function openStore(store) {
  applyStore(store);
  writeLocal(STORE_KEY, store.id);
  planMuted = true;
  seedPlan(store);
  /* noch nie gespeichert: der Basisplan ist der gespeicherte Stand */
  const saved = readLocal(savedKey(store.id), null);
  try {
    if (!saved || saved.v !== PLAN_VERSION) throw new Error('none');
    reviveSnapshot(saved);
    setSavedSnap(saved);
  } catch { writeSaved(); }
  loadPlan();
  planMuted = false;
}

/* anderer Store: der Entwurf des bisherigen bleibt liegen, wie er ist */
function switchStore(id) {
  const store = STORES.find(s => s.id === id);
  if (!store || store === currentStore) return;
  clearTimeout(saveTimer);
  savePlan();
  clearPlanHistory();
  openStore(store);
  emitPlanChange('store');
  emitPlanChange('spots');
  emitPlanChange('week');
}

function setRole(role) {
  currentRole = role;
  writeLocal(ROLE_KEY, role);
  if (!accessibleStores().includes(currentStore)) switchStore(HOME_STORE.id);
  emitPlanChange('access');
}

/* ---- Head Office: eine neue Serie in allen anderen Stores anlegen – dort
   ungespeichert wie jede Änderung. Fehlt der Spot in einem Store, kommt er
   mit Kategorie und Audio dazu. Liefert die Zahl der Stores. ---- */
function addSeriesToAllStores(spot, def) {
  const home = currentStore;
  clearTimeout(saveTimer);
  savePlan();
  planMuted = true;
  let n = 0;
  STORES.forEach(st => {
    if (st === home) return;
    openStore(st);
    const had = findSpot(spot.title);
    const sp = addSpot({ title: spot.title, category: spot.category, duration: spot.duration, source: spot.source });
    if (!had) sp.audio = spot.audio;
    if (!sp.category) sp.category = spot.category;
    sp.ready = true;
    planRev = ++revUid;
    addSeries({ ...def, spotId: sp.id });
    savePlan();
    n++;
  });
  openStore(home);
  planMuted = false;
  emitPlanChange('dirty');
  return n;
}

/* ---- Save / Discard über alle Stores, die der User sieht (Head Office);
   die nicht geöffneten direkt im Speicher ---- */
function commitStoredPlan(id) {
  const data = readLocal(planKey(id), null);
  if (!data) return;
  data.savedRev = data.rev;
  writeLocal(planKey(id), data);
  const { savedRev, uids, ...snap } = data;
  writeLocal(savedKey(id), snap);
  unsavedStores.delete(id);
}

function discardStoredPlan(id) {
  const data = readLocal(planKey(id), null);
  const saved = readLocal(savedKey(id), null);
  if (!data || !saved || saved.v !== PLAN_VERSION) return;
  writeLocal(planKey(id), { ...saved, savedRev: saved.rev, uids: data.uids });
  unsavedStores.delete(id);
}

/* liefert die Zahl der betroffenen Stores */
function commitAll() {
  const list = unsavedList();
  list.forEach(st => { if (st !== currentStore) commitStoredPlan(st.id); });
  writeLocal(UNSAVED_KEY, [...unsavedStores]);
  if (planDirty()) commitPlan(); else emitPlanChange('saved');
  return list.length;
}

function discardAll() {
  const list = unsavedList();
  list.forEach(st => { if (st !== currentStore) discardStoredPlan(st.id); });
  writeLocal(UNSAVED_KEY, [...unsavedStores]);
  if (planDirty()) discardPlan(); else emitPlanChange('saved');
  return list.length;
}

try {
  if (new URLSearchParams(location.search).has('reset')) {
    Object.keys(localStorage).filter(k => k.startsWith(PLAN_KEY)).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(UNSAVED_KEY);
    unsavedStores.clear();
  }
  localStorage.removeItem(PLAN_KEY);  /* Stand von vor den Stores */
} catch { /* ohne Speicher */ }

openStore(accessibleStores().find(s => s.id === readLocal(STORE_KEY, HOME_STORE.id)) || HOME_STORE);
let saveTimer = null;
onPlanChange(() => { clearTimeout(saveTimer); saveTimer = setTimeout(savePlan, 150); });
