/* ================================================================
   CHANNEL BUILDER – Branche, Teilbereich, Klangraum und Genres
   ergeben live den Channel-Steckbrief
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
      { value: 'lobby',      label: 'Lobby / Empfang' },
      { value: 'fruehstueck', label: 'Frühstücksbereich' },
      { value: 'hotelbar',   label: 'Hotelbar' },
      { value: 'restaurant', label: 'Hotelrestaurant' },
      { value: 'spa',        label: 'Spa & Wellness', bpm: 'wellness' },
    ] },
];

/* BPM-Korridore Low / Mid / High: ca. 20 BPM breit, ca. 5 BPM Überlappung,
   der ganze Block verschiebt sich je Teilbereich */
const CB_BPM = {
  standard: [[70, 95], [90, 115], [110, 130]],
  bar:      [[75, 100], [95, 120], [115, 135]],   // „leicht nach oben“ – hier +5 BPM (Annahme)
  wellness: [[60, 80], [75, 95], [90, 110]],
};

/* Default-Ranges je Energylevel */
const CB_LEVELS = [
  { label: 'Low',  farbe: 'var(--level-low)',  dance: [0.3, 0.5], valence: [0.3, 0.6] },
  { label: 'Mid',  farbe: 'var(--level-mid)',  dance: [0.5, 0.7], valence: [0.5, 0.75] },
  { label: 'High', farbe: 'var(--level-high)', dance: [0.7, 0.9], valence: [0.65, 0.9] },
];

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

const CB_CHARAKTER = ['warm', 'organic', 'polished', 'raw', 'vintage', 'futuristic', 'urban', 'natural', 'elegant', 'playful'];
const CB_CHARAKTER_MAX = 3;

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

/* sichtbar bis 0,22 Abstand zum Reglerwert, blass bis 0,38, darüber aus */
const CB_FENSTER = { sichtbar: 0.22, blass: 0.38 };

/* Genre-Mix aus den nächstgelegenen sichtbaren Genres; die Gewichte für
   weniger als drei sichtbare Genres sind eine Annahme */
const CB_MIX = { 3: [40, 30, 30], 2: [60, 40], 1: [100] };

/* ---- Zustand ---- */
const cb = {
  branche: null, teil: null, flaeche: null,
  energie: 50, stimmung: 50, modern: 50,
  charakter: [],              // in Wahlreihenfolge – der erste gibt dem Channel den Namen
};

/* ---- Helfer ---- */
const cbClamp = (v, a, b) => Math.min(Math.max(v, a), b);
const cbKomma = v => v.toFixed(2).replace('.', ',');
const cbVonBis = ([a, b]) => `${cbKomma(a)}–${cbKomma(b)}`;
const cbGross = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---- Ableitungen ---- */
const cbLevel = () => Math.round(cb.energie / 50);   // 0 Low, 1 Mid, 2 High

/* Stimmung 0 … 100 → Spalte links / mitte / rechts, dazwischen „mitte bis rechts“ */
function cbSpalten() {
  const p = cb.stimmung / 50, lo = Math.floor(p), rest = p - lo;
  if (rest < 0.25) return [lo];
  if (rest > 0.75) return [lo + 1];
  return [lo, lo + 1];
}

/* zwei Affekt-Moods: aus einer Zelle die ersten beiden, über zwei Spalten je der erste */
function cbMoods(level) {
  const sp = cbSpalten();
  return sp.length === 1 ? CB_RASTER[level][sp[0]].slice(0, 2) : sp.map(s => CB_RASTER[level][s][0]);
}

function cbValence(level) {
  const shift = (cb.stimmung / 50 - 1) * CB_STIMMUNG.verschiebung;
  return CB_LEVELS[level].valence.map(v => cbClamp(v + shift, CB_STIMMUNG.valenceMin, CB_STIMMUNG.valenceMax));
}

const cbBpm = level => CB_BPM[cb.teil?.bpm || 'standard'][level];

/* Freigabe durch die Branche, Sichtbarkeit durch die Modernität */
function cbGenreStatus() {
  if (!cb.branche) return [];
  const m = cb.modern / 100;
  return CB_GENRES.filter(g => g.in.includes(cb.branche.value)).map(g => {
    const d = Math.abs(g.pos - m) - 1e-9;   // 0,64 − 0,42 zählt als genau 0,22
    return { g, d, status: d <= CB_FENSTER.sichtbar ? 'on' : d <= CB_FENSTER.blass ? 'faint' : 'off' };
  });
}

function cbMix(status) {
  const nah = status.filter(s => s.status === 'on').sort((a, b) => a.d - b.d).slice(0, 3);
  const gewichte = CB_MIX[nah.length] || [];
  return nah.map((s, i) => ({ name: s.g.name, anteil: gewichte[i] }));
}

/* ---- Ansicht ---- */
const cbBranchenEl   = document.getElementById('cb-branchen');
const cbMore         = document.getElementById('cb-more');
const cbTeileEl      = document.getElementById('cb-teilbereiche');
const cbFlaecheWrap  = document.getElementById('cb-flaeche');
const cbFlaechenEl   = document.getElementById('cb-flaechen');
const cbEnergie      = document.getElementById('cb-energie');
const cbEnergieLevel = document.getElementById('cb-energie-level');
const cbStimmung     = document.getElementById('cb-stimmung');
const cbModern       = document.getElementById('cb-modern');
const cbCharakterEl  = document.getElementById('cb-charakter');
const cbCount        = document.getElementById('cb-charakter-count');
const cbGenresEl     = document.getElementById('cb-genres');
const cbName         = document.getElementById('cb-name');
const cbWhere        = document.getElementById('cb-where');
const cbMixEl        = document.getElementById('cb-mix');
const cbMoodsEl      = document.getElementById('cb-moods');
const cbSpalteEl     = document.getElementById('cb-spalte');
const cbLevelsEl     = document.getElementById('cb-levels');

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
  const el = cbButton('cb-tile', `${icon(b.icon)}<span>${b.label}</span>`, () => cbWaehleBranche(b));
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

  /* 4 Genres: alle Freigaben der Branche, die Modernität blendet sie ein und aus */
  cbGenresEl.innerHTML = '';
  CB_GENRES.filter(g => g.in.includes(b.value)).forEach(g => {
    const el = document.createElement('span');
    el.className = 'cb-genre is-off';
    el.dataset.name = g.name;
    el.textContent = g.name;
    cbGenresEl.appendChild(el);
  });

  if (erste) setCollapse(cbMore, true);
  requestAnimationFrame(cbUpdate);   /* ein Frame später, damit die Genres einblenden */
}

/* 3 Klangraum: Energie rastet beim Loslassen auf Low / Mid / High ein */
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
cbEnergie.addEventListener('change', () => cbFahreEnergie(cbLevel() * 50));

/* Tastatur springt direkt von Stufe zu Stufe */
cbEnergie.addEventListener('keydown', e => {
  const schritt = { ArrowLeft: -1, ArrowDown: -1, PageDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: 1, Home: -2, End: 2 }[e.key];
  if (schritt === undefined) return;
  e.preventDefault();
  cbFahreEnergie(cbClamp(cbLevel() + schritt, 0, 2) * 50);
});

cbStimmung.addEventListener('input', () => { cb.stimmung = +cbStimmung.value; cbUpdate(); });
cbModern.addEventListener('input', () => { cb.modern = +cbModern.value; cbUpdate(); });

/* Charakter: 2 bis 3 Chips */
CB_CHARAKTER.forEach(c => {
  const el = cbButton('cb-chip', c, () => {
    const i = cb.charakter.indexOf(c);
    if (i >= 0) cb.charakter.splice(i, 1);
    else if (cb.charakter.length < CB_CHARAKTER_MAX) cb.charakter.push(c);
    cbUpdate();
  });
  el.dataset.value = c;
  cbCharakterEl.appendChild(el);
});

/* 5 Steckbrief: Level-Raster einmal aufbauen, danach nur Werte setzen */
const CB_ZEILEN = [
  { label: 'Danceability', wert: i => cbVonBis(CB_LEVELS[i].dance) },
  { label: 'Valence',      wert: i => cbVonBis(cbValence(i)) },
  { label: 'BPM',          wert: i => cbBpm(i).join('–') },
  { label: 'Affekt-Moods', wert: i => cbMoods(i).join('<br>') },
];

cbLevelsEl.innerHTML = '<span class="cb-levels__hl"></span><span></span>' +
  CB_LEVELS.map((l, i) =>
    `<span class="cb-levels__head" data-level="${i}"><span class="cb-dot" style="background:${l.farbe}"></span>${l.label}</span>`).join('') +
  CB_ZEILEN.map((z, r) =>
    `<span class="cb-levels__label">${z.label}</span>` +
    CB_LEVELS.map((_, i) => `<span class="cb-levels__cell" data-level="${i}" data-row="${r}"></span>`).join('')).join('');

function cbUpdate() {
  const lvl = cbLevel();
  const status = cbGenreStatus();
  const mix = cbMix(status);
  const level = CB_LEVELS[lvl];

  cbEnergieLevel.innerHTML = `<span class="cb-dot" style="background:${level.farbe}"></span>${level.label}`;
  cbEnergie.setAttribute('aria-valuetext', level.label);

  /* Charakter */
  cbCharakterEl.querySelectorAll('button').forEach(b => {
    const on = cb.charakter.includes(b.dataset.value);
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
    b.disabled = !on && cb.charakter.length >= CB_CHARAKTER_MAX;
  });
  cbCount.textContent = `${cb.charakter.length} / ${CB_CHARAKTER_MAX}`;

  /* Genres */
  const imMix = mix.map(m => m.name);
  cbGenresEl.querySelectorAll('.cb-genre').forEach(el => {
    const s = status.find(x => x.g.name === el.dataset.name);
    el.classList.toggle('is-faint', s?.status === 'faint');
    el.classList.toggle('is-off', !s || s.status === 'off');
    el.classList.toggle('is-mix', imMix.includes(el.dataset.name));
  });

  /* Steckbrief */
  const ort = cb.teil?.label || cb.branche?.label;
  const tag = cb.charakter[0] || cbMoods(lvl)[0];
  cbName.textContent = ort ? `${ort} · ${cbGross(tag)}` : '–';
  cbWhere.textContent = [cb.branche?.label, cb.teil?.label, cb.flaeche].filter(Boolean).join(' · ');
  cbWhere.hidden = !cb.branche;

  cbMixEl.innerHTML = mix.length
    ? mix.map(m => `<div class="cb-mix__row"><span class="cb-mix__pct">${m.anteil} %</span><span>${escapeHtml(m.name)}</span></div>`).join('')
    : '<span class="cb-empty">–</span>';
  cbMoodsEl.innerHTML = cb.charakter.length
    ? cb.charakter.map(c => `<span class="cb-tag">${c}</span>`).join('')
    : '<span class="cb-empty">–</span>';
  cbSpalteEl.textContent = cbSpalten().map(s => CB_SPALTEN[s]).join(' bis ');

  cbLevelsEl.style.setProperty('--aktiv', lvl);
  cbLevelsEl.querySelectorAll('[data-level]').forEach(el => {
    const i = +el.dataset.level;
    el.classList.toggle('is-active', i === lvl);
    if (el.dataset.row !== undefined) el.innerHTML = CB_ZEILEN[+el.dataset.row].wert(i);
  });
}

cbUpdate();
