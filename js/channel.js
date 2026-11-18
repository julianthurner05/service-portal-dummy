/* ================================================================
   CHANNEL BUILDER – Branche, Teilbereich und Klangraum ergeben
   live einen Channel (und den Steckbrief, vorerst ausgeblendet)
   ================================================================ */

/* ---- Modell: erste Setzungen aus dem Prototyp, alles noch zu kuratieren.
        Werte auf der kalibrierten Konzept-Skala (0 bis 1). ---- */

const CB_BRANCHEN = [
  { value: 'retail', label: 'Retail', icon: 'bag',
    teile: [
      { value: 'fashion',   label: 'Fashion' },
      { value: 'living',    label: 'Living / Design' },
      { value: 'concept',   label: 'Concept Store' },
      { value: 'food',      label: 'Lebensmittel' },
      { value: 'fachmarkt', label: 'Fachmarkt' },
    ],
    flaechen: ['Boutique', 'Große Fläche'] },
  { value: 'gastro', label: 'Gastronomie', icon: 'utensils',
    teile: [
      { value: 'cafe',   label: 'Café / Bäckerei' },
      { value: 'casual', label: 'Casual Dining' },
      { value: 'fine',   label: 'Fine Dining' },
      { value: 'bar',    label: 'Bar / Cocktail', bpm: 'bar' },
      { value: 'quick',  label: 'Quick Service' },
    ] },
  { value: 'hotel', label: 'Hotellerie', icon: 'bed',
    teile: [
      { value: 'lobby',       label: 'Lobby / Empfang' },
      { value: 'fruehstueck', label: 'Frühstücksbereich' },
      { value: 'hotelbar',    label: 'Hotelbar' },
      { value: 'restaurant',  label: 'Hotelrestaurant' },
      { value: 'spa',         label: 'Spa & Wellness', bpm: 'wellness' },
    ] },
];

/* BPM-Korridore Low / Mid / High: ca. 20 BPM breit, ca. 5 BPM Überlappung,
   der ganze Block verschiebt sich je Teilbereich */
const CB_BPM = {
  standard: [[70, 95], [90, 115], [110, 130]],
  bar:      [[75, 100], [95, 120], [115, 135]],   // „leicht nach oben“ – hier +5 BPM (Annahme)
  wellness: [[60, 80], [75, 95], [90, 110]],
};

/* Default-Ranges der drei Energylevels aus dem Konzept */
const CB_LEVELS = [
  { dance: [0.3, 0.5], valence: [0.3, 0.6] },    // Low
  { dance: [0.5, 0.7], valence: [0.5, 0.75] },   // Mid
  { dance: [0.7, 0.9], valence: [0.65, 0.9] },   // High
];

/* Energie in fünf Stufen: Low, Mid und High wie im Konzept, die beiden
   Zwischenstufen liegen mit allen Werten genau dazwischen */
const CB_STUFEN = [
  { label: 'Low',      farbe: 'var(--level-low)' },
  { label: 'Low–Mid',  farbe: 'color-mix(in srgb, var(--level-low), var(--level-mid))' },
  { label: 'Mid',      farbe: 'var(--level-mid)' },
  { label: 'Mid–High', farbe: 'color-mix(in srgb, var(--level-mid), var(--level-high))' },
  { label: 'High',     farbe: 'var(--level-high)' },
];
const CB_STUFE_ABSTAND = 100 / (CB_STUFEN.length - 1);   // Rastpunkte 0, 25, 50, 75, 100

/* Mood-Raster: Zeile = Level (Danceability niedrig / mittel / hoch),
   Spalte = Valence niedrig / mittel / hoch */
const CB_RASTER = [
  [['melancholic', 'wistful', 'somber'], ['calm', 'serene', 'contemplative'], ['peaceful', 'tender', 'hopeful']],
  [['moody', 'brooding', 'tense'],       ['steady', 'focused', 'smooth'],    ['upbeat', 'cheerful', 'sunny']],
  [['intense', 'urgent', 'dark-energetic'], ['driving', 'confident', 'groovy'], ['euphoric', 'exuberant', 'celebratory']],
];
const CB_SPALTEN = ['links', 'mitte', 'rechts'];

/* Stimmung: verschiebt die Valence-Ranges um bis zu ± 0,1 und wählt die
   Raster-Spalte (das Briefing nennt keine Formel – Annahme) */
const CB_STIMMUNG = { verschiebung: 0.1, valenceMin: 0.3, valenceMax: 0.9 };

/* Charakter als Spektren (links ↔ rechts). vintage / futuristic und warm
   haben keinen eigenen Regler, sie kommen aus Modernität und Stimmung */
const CB_SPEKTREN = [
  ['organic', 'polished'],
  ['natural', 'urban'],
  ['playful', 'elegant'],
];
const CB_CHARAKTER_SCHWELLE = 0.3;   // ab 30 % Ausschlag zur Seite zählt ein Pol
const CB_CHARAKTER_MAX = 3;          // die stärksten drei werden Charakter-Moods

/* Genres: Position auf der Modernitätsachse (0 klassisch bis 1 jung) und
   Freigabe je Branche */
const CB_GENRES = [
  { name: 'Riviera Jazz',               pos: 0.05, in: ['gastro', 'hotel'] },
  { name: 'Jahrzehnte / Oldies',        pos: 0.10, in: ['retail', 'gastro'] },
  { name: 'Retro Soul',                 pos: 0.20, in: ['retail', 'gastro', 'hotel'] },
  { name: 'Pop-Schlager',               pos: 0.28, in: ['retail', 'gastro'] },
  { name: 'Acoustic Singer-Songwriter', pos: 0.32, in: ['retail', 'gastro', 'hotel'] },
  { name: 'Sunny Soft Rock',            pos: 0.38, in: ['retail', 'gastro'] },
  { name: 'Ambient Lounge',             pos: 0.42, in: ['gastro', 'hotel'] },
  { name: 'Uplift Folk Pop',            pos: 0.46, in: ['retail', 'gastro', 'hotel'] },
  { name: 'Breakfast R&B',              pos: 0.50, in: ['gastro', 'hotel'] },
  { name: 'Balearic House Chillout',    pos: 0.56, in: ['gastro', 'hotel'] },
  { name: 'Ibiza Electronic Lounge',    pos: 0.62, in: ['gastro', 'hotel'] },
  { name: 'Nu-Disco',                   pos: 0.64, in: ['retail', 'gastro'] },
  { name: 'Indie Funk',                 pos: 0.66, in: ['retail', 'gastro'] },
  { name: 'Evening House',              pos: 0.72, in: ['retail', 'gastro', 'hotel'] },
  { name: 'Upbeat Mainstream Pop',      pos: 0.78, in: ['retail', 'gastro'] },
  { name: 'Upbeat Afrobeats',           pos: 0.86, in: ['retail', 'gastro'] },
  { name: 'Reggaeton',                  pos: 0.95, in: ['retail'] },
];

/* sichtbar bis 0,22 Abstand zum Reglerwert – daraus wird der Mix gebildet */
const CB_FENSTER = 0.22;

/* Genre-Mix aus den nächstgelegenen sichtbaren Genres; die Gewichte für
   weniger als drei sichtbare Genres sind eine Annahme */
const CB_MIX = { 3: [40, 30, 30], 2: [60, 40], 1: [100] };

/* Ergebnis-Channel, PROVISORISCH: Dummy-Tracks aus Genre-Mix und BPM-Korridor */
const CB_TRACKS = 10;
const CB_TITEL = [
  ['Velvet', 'Golden', 'Slow', 'Silver', 'Late', 'Soft', 'Bright', 'Paper', 'Coastal', 'Midnight', 'Morning', 'Copper'],
  ['Hours', 'Avenue', 'Light', 'Motion', 'Garden', 'Window', 'Tide', 'Echoes', 'Summer', 'Lines', 'Bloom', 'Drive'],
];

/* ---- Zustand ---- */
const cb = {
  branche: null, teil: null, flaeche: null,
  energie: 50, stimmung: 50, modern: 50,
  spektren: CB_SPEKTREN.map(() => 50),   // 50 = neutral
};

/* ---- Helfer ---- */
const cbClamp = (v, a, b) => Math.min(Math.max(v, a), b);
const cbKomma = v => v.toFixed(2).replace('.', ',');
const cbVonBis = ([a, b]) => `${cbKomma(a)}–${cbKomma(b)}`;
const cbGross = s => s.charAt(0).toUpperCase() + s.slice(1);

/* stabiler Hash (FNV-1a mit Durchmischung) – gleiche Eingabe, gleicher Dummy-Track */
function cbHash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/* ---- Ableitungen ---- */
const cbStufe = () => Math.round(cb.energie / CB_STUFE_ABSTAND);   // 0 … 4

/* Lage einer Stufe zwischen den drei Grundlevels: 0, 0,5, 1, 1,5, 2 */
const cbLage = i => i * (CB_LEVELS.length - 1) / (CB_STUFEN.length - 1);

/* Range einer Stufe aus den drei Grundlevels, Zwischenstufen gemittelt */
function cbZwischen(ranges, i) {
  const p = cbLage(i), lo = Math.floor(p), hi = Math.ceil(p), k = p - lo;
  return ranges[lo].map((v, j) => v + (ranges[hi][j] - v) * k);
}

/* Raster-Zeilen einer Stufe: eine, bei Zwischenstufen die beiden Nachbarn */
function cbZeilen(i) {
  const p = cbLage(i);
  return Math.floor(p) === Math.ceil(p) ? [p] : [Math.floor(p), Math.ceil(p)];
}

/* Stimmung 0 … 100 → Spalte links / mitte / rechts, dazwischen „mitte bis rechts“ */
function cbSpalten() {
  const p = cb.stimmung / 50, lo = Math.floor(p), rest = p - lo;
  if (rest < 0.25) return [lo];
  if (rest > 0.75) return [lo + 1];
  return [lo, lo + 1];
}

/* zwei Affekt-Moods: aus einer Zelle die ersten beiden, über zwei Zellen je
   der erste, über vier Zellen die Diagonale */
function cbMoods(i) {
  const zeilen = cbZeilen(i), spalten = cbSpalten();
  if (zeilen.length === 1 && spalten.length === 1) return CB_RASTER[zeilen[0]][spalten[0]].slice(0, 2);
  if (zeilen.length === 1) return spalten.map(s => CB_RASTER[zeilen[0]][s][0]);
  if (spalten.length === 1) return zeilen.map(z => CB_RASTER[z][spalten[0]][0]);
  return zeilen.map((z, k) => CB_RASTER[z][spalten[k]][0]);
}

const cbDance = i => cbZwischen(CB_LEVELS.map(l => l.dance), i);

function cbValence(i) {
  const shift = (cb.stimmung / 50 - 1) * CB_STIMMUNG.verschiebung;
  return cbZwischen(CB_LEVELS.map(l => l.valence), i)
    .map(v => cbClamp(v + shift, CB_STIMMUNG.valenceMin, CB_STIMMUNG.valenceMax));
}

const cbBpm = i => cbZwischen(CB_BPM[cb.teil?.bpm || 'standard'], i).map(Math.round);

/* Charakter-Moods: die stärksten Ausschläge aus den Spektren, dazu warm
   (Stimmung links) und vintage / futuristic (Modernität) */
function cbCharakter() {
  const kandidaten = [];
  const pol = (wert, links, rechts) => {
    const a = (wert - 50) / 50;
    if (links && a < 0) kandidaten.push({ tag: links, staerke: -a });
    if (rechts && a > 0) kandidaten.push({ tag: rechts, staerke: a });
  };
  cb.spektren.forEach((w, i) => pol(w, ...CB_SPEKTREN[i]));
  pol(cb.stimmung, 'warm', null);
  pol(cb.modern, 'vintage', 'futuristic');
  return kandidaten
    .filter(k => k.staerke >= CB_CHARAKTER_SCHWELLE - 1e-9)
    .sort((a, b) => b.staerke - a.staerke)
    .slice(0, CB_CHARAKTER_MAX)
    .map(k => k.tag);
}

/* Genre-Mix: Freigabe durch die Branche, die drei nächsten im Fenster der Modernität */
function cbMix() {
  if (!cb.branche) return [];
  const m = cb.modern / 100;
  const nah = CB_GENRES
    .filter(g => g.in.includes(cb.branche.value))
    .map(g => ({ name: g.name, d: Math.abs(g.pos - m) - 1e-9 }))   // 0,64 − 0,42 zählt als genau 0,22
    .filter(g => g.d <= CB_FENSTER)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const gewichte = CB_MIX[nah.length] || [];
  return nah.map((g, i) => ({ name: g.name, anteil: gewichte[i] }));
}

/* Dummy-Tracks: Genres nach Gewicht verzahnt, BPM im Korridor der Stufe */
function cbTracks(mix, bpm) {
  const anzahl = mix.map(m => Math.round(m.anteil / 100 * CB_TRACKS));
  const folge = [];
  for (let runde = 0; folge.length < CB_TRACKS && mix.length; runde++) {
    mix.forEach((m, i) => { if (runde < anzahl[i] && folge.length < CB_TRACKS) folge.push(m.name); });
    if (runde > CB_TRACKS) break;
  }
  return folge.map((genre, i) => {
    const h = cbHash(`${genre}${i}`);
    return {
      titel: `${CB_TITEL[0][h % CB_TITEL[0].length]} ${CB_TITEL[1][(h >>> 4) % CB_TITEL[1].length]}`,
      genre,
      bpm: bpm[0] + (h >>> 8) % (bpm[1] - bpm[0] + 1),
      dauer: 170 + (h >>> 12) % 80,   // 2:50 bis 4:09
    };
  });
}

/* ---- Ansicht ---- */
const $cb = id => document.getElementById(id);
const cbBranchenEl   = $cb('cb-branchen');
const cbMore         = $cb('cb-more');
const cbTeileEl      = $cb('cb-teilbereiche');
const cbFlaecheWrap  = $cb('cb-flaeche');
const cbFlaechenEl   = $cb('cb-flaechen');
const cbEnergie      = $cb('cb-energie');
const cbEnergieTrack = $cb('cb-energie-track');
const cbEnergieLevel = $cb('cb-energie-level');
const cbStimmung     = $cb('cb-stimmung');
const cbModern       = $cb('cb-modern');
const cbCharakterEl  = $cb('cb-charakter');
const cbView         = document.querySelector('.cb-view');

function cbButton(cls, html, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = cls;
  el.innerHTML = html;
  el.addEventListener('click', onClick);
  return el;
}

const cbMarkiere = (wrap, aktiv) => wrap.querySelectorAll('button').forEach(b => {
  const on = b.dataset.value === aktiv;
  b.classList.toggle('is-active', on);
  b.setAttribute('aria-pressed', String(on));
});

/* 1 Branche */
CB_BRANCHEN.forEach(b => {
  const el = cbButton('tile', `${icon(b.icon)}<span class="tile__text"><span class="tile__label">${b.label}</span></span>`, () => cbWaehleBranche(b));
  el.dataset.value = b.value;
  el.setAttribute('aria-pressed', 'false');
  cbBranchenEl.appendChild(el);
});

function cbWaehleBranche(b) {
  if (cb.branche === b) return;
  const erste = !cb.branche;
  cb.branche = b;
  cb.teil = null;
  cb.flaeche = null;
  cbMarkiere(cbBranchenEl, b.value);

  /* 2 Teilbereich (+ Fläche bei Retail) */
  cbTeileEl.innerHTML = '';
  b.teile.forEach(t => {
    const el = cbButton('cb-chip', escapeHtml(t.label), () => {
      cb.teil = t;
      cbMarkiere(cbTeileEl, t.value);
      cbUpdate();
    });
    el.dataset.value = t.value;
    cbTeileEl.appendChild(el);
  });

  cbFlaecheWrap.hidden = !b.flaechen;
  cbFlaechenEl.innerHTML = '';
  (b.flaechen || []).forEach(f => {
    const el = cbButton('cb-chip', escapeHtml(f), () => {
      cb.flaeche = cb.flaeche === f ? null : f;   // optional: erneut klicken nimmt sie raus
      cbMarkiere(cbFlaechenEl, cb.flaeche);
      cbUpdate();
    });
    el.dataset.value = f;
    cbFlaechenEl.appendChild(el);
  });

  if (erste) setCollapse(cbMore, true);
  cbUpdate();
}

/* 3 Klangraum: Energie rastet beim Loslassen auf eine der fünf Stufen ein */
CB_STUFEN.forEach((s, i) => {
  const t = document.createElement('span');
  t.className = 'cb-tick';
  t.style.left = `calc(8px + (100% - 16px) * ${i / (CB_STUFEN.length - 1)})`;
  t.style.background = s.farbe;
  cbEnergieTrack.insertBefore(t, cbEnergie);
});

let cbEnergieAnim = null;

function cbFahreEnergie(ziel) {
  cancelAnimationFrame(cbEnergieAnim);
  const von = +cbEnergie.value, t0 = performance.now(), dauer = 220;
  const schritt = jetzt => {
    const k = Math.min((jetzt - t0) / dauer, 1);
    cbEnergie.value = von + (ziel - von) * (1 - (1 - k) ** 3);
    cb.energie = +cbEnergie.value;
    cbUpdate();
    if (k < 1) cbEnergieAnim = requestAnimationFrame(schritt);
  };
  cbEnergieAnim = requestAnimationFrame(schritt);
}

cbEnergie.addEventListener('input', () => {
  cancelAnimationFrame(cbEnergieAnim);
  cb.energie = +cbEnergie.value;
  cbUpdate();
});
cbEnergie.addEventListener('change', () => cbFahreEnergie(cbStufe() * CB_STUFE_ABSTAND));

/* Tastatur springt direkt von Stufe zu Stufe */
cbEnergie.addEventListener('keydown', e => {
  const letzte = CB_STUFEN.length - 1;
  const schritt = { ArrowLeft: -1, ArrowDown: -1, PageDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: 1, Home: -letzte, End: letzte }[e.key];
  if (schritt === undefined) return;
  e.preventDefault();
  cbFahreEnergie(cbClamp(cbStufe() + schritt, 0, letzte) * CB_STUFE_ABSTAND);
});

cbStimmung.addEventListener('input', () => { cb.stimmung = +cbStimmung.value; cbUpdate(); });
cbModern.addEventListener('input', () => { cb.modern = +cbModern.value; cbUpdate(); });

/* Charakter-Spektren: volle Breite wie die Regler darüber, Pole darunter */
CB_SPEKTREN.forEach(([links, rechts], i) => {
  const row = document.createElement('div');
  row.className = 'cb-slider';
  row.innerHTML = `
    <div class="cb-slider__track">
      <span class="cb-tick cb-tick--mitte"></span>
      <input class="range" type="range" min="0" max="100" step="1" value="50" aria-label="${links} bis ${rechts}">
    </div>
    <div class="cb-poles"><span data-tag="${links}">${links}</span><span data-tag="${rechts}">${rechts}</span></div>`;
  row.querySelector('input').addEventListener('input', e => { cb.spektren[i] = +e.target.value; cbUpdate(); });
  cbCharakterEl.appendChild(row);
});

/* 4 Channel: Dummy-Vorhören, Details aufklappbar */
const cbPlayer = createPlayer({ playBtn: $cb('cb-play'), slider: $cb('cb-slider'), timeEl: $cb('cb-time'), duration: 30 });

const cbDetailsToggle = $cb('cb-details-toggle');
cbDetailsToggle.addEventListener('click', () => {
  const open = cbDetailsToggle.getAttribute('aria-expanded') !== 'true';
  cbDetailsToggle.setAttribute('aria-expanded', String(open));
  setCollapse($cb('cb-details'), open);
});

/* 5 Steckbrief (ausgeblendet): Level-Zeilen einmal aufbauen, danach nur Werte setzen */
const CB_WERTE = [
  { label: 'Danceability', wert: i => cbVonBis(cbDance(i)) },
  { label: 'Valence',      wert: i => cbVonBis(cbValence(i)) },
  { label: 'BPM',          wert: i => cbBpm(i).join('–') },
];

$cb('cb-levels').innerHTML =
  `<div class="cb-lvl cb-lvl--head"><span></span>${CB_WERTE.map(w => `<span>${w.label}</span>`).join('')}</div>` +
  CB_STUFEN.map((s, i) => `
    <div class="cb-lvl" data-level="${i}">
      <span class="cb-lvl__name"><span class="cb-dot" style="background:${s.farbe}"></span>${s.label}</span>
      ${CB_WERTE.map((_, k) => `<span data-wert="${k}"></span>`).join('')}
      <span class="cb-lvl__moods"></span>
    </div>`).join('');

const cbTag = t => `<span class="cb-tag">${escapeHtml(t)}</span>`;
const cbLeer = '<span class="cb-empty">–</span>';
const cbDauer = s => `${Math.floor(s / 60)}:${pad2(s % 60)}`;

function cbUpdate() {
  const stufe = cbStufe();
  const s = CB_STUFEN[stufe];
  const mix = cbMix();
  const charakter = cbCharakter();
  const bpm = cbBpm(stufe);

  cbEnergieLevel.innerHTML = `<span class="cb-dot" style="background:${s.farbe}"></span>${s.label}`;
  cbEnergie.setAttribute('aria-valuetext', s.label);

  /* Pole leuchten, wenn sie einen Charakter-Mood liefern */
  cbView.querySelectorAll('[data-tag]').forEach(p => p.classList.toggle('is-on', charakter.includes(p.dataset.tag)));

  /* Name und Herkunft (für Channel und Steckbrief) */
  const ort = cb.teil?.label || cb.branche?.label;
  const tag = charakter[0] || cbMoods(stufe)[0];
  const name = ort ? `${ort} · ${cbGross(tag)}` : '–';
  const herkunft = [cb.branche?.label, cb.teil?.label, cb.flaeche].filter(Boolean).join(' · ');
  const genresHtml = mix.length ? mix.map(m => cbTag(`${m.anteil} % ${m.name}`)).join('') : cbLeer;
  const charakterHtml = charakter.length ? charakter.map(cbTag).join('') : cbLeer;

  /* 4 Channel */
  $cb('cb-channel-name').textContent = name;
  $cb('cb-channel-meta').textContent = herkunft;
  $cb('cb-cover').style.setProperty('--cover', s.farbe);
  $cb('cb-channel-genres').innerHTML = genresHtml;
  $cb('cb-channel-moods').innerHTML = charakterHtml;
  $cb('cb-channel-energie').innerHTML = `<span class="cb-dot" style="background:${s.farbe}"></span>${s.label}`;
  $cb('cb-channel-bpm').textContent = bpm.join('–');
  $cb('cb-tracks').innerHTML = cbTracks(mix, bpm).map((t, i) => `
    <li class="cb-track">
      <span class="cb-track__nr">${pad2(i + 1)}</span>
      <span class="cb-track__title">${escapeHtml(t.titel)}<span class="cb-track__genre">${escapeHtml(t.genre)}</span></span>
      <span class="cb-track__bpm">${t.bpm} BPM</span>
      <span class="cb-track__dauer">${cbDauer(t.dauer)}</span>
    </li>`).join('');

  /* 5 Steckbrief */
  $cb('cb-name').textContent = name;
  $cb('cb-where').textContent = herkunft;
  $cb('cb-where').hidden = !cb.branche;
  $cb('cb-mix').innerHTML = mix.length
    ? mix.map(m => `<div class="cb-mix__row"><span class="cb-mix__pct">${m.anteil} %</span><span>${escapeHtml(m.name)}</span></div>`).join('')
    : cbLeer;
  $cb('cb-moods').innerHTML = charakterHtml;
  $cb('cb-spalte').textContent = cbSpalten().map(sp => CB_SPALTEN[sp]).join(' bis ');
  $cb('cb-levels').querySelectorAll('.cb-lvl[data-level]').forEach(row => {
    const i = +row.dataset.level;
    row.classList.toggle('is-active', i === stufe);
    row.querySelectorAll('[data-wert]').forEach(c => { c.textContent = CB_WERTE[+c.dataset.wert].wert(i); });
    row.querySelector('.cb-lvl__moods').textContent = cbMoods(i).join(', ');
  });
}

cbUpdate();
