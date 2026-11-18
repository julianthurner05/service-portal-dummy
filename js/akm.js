/* ================================================================
   AKM-ERSPARNISRECHNER – Schritt 1: AKM-Kosten pro Jahr
   Richtwert, netto, keine verbindliche Tarifauskunft.
   ================================================================ */

/* ---- Tarifsätze: Gesamtvertrag AKM/VVAT. Sie ändern sich jedes Jahr am
        1. November mit dem Verbraucherpreisindex – nur hier anpassen. ---- */
const AKM_TARIF = {
  stand: '1.11.2026',          // steht so im Pflichttext beim Ergebnis

  lsg: 0.23,                   // LSG-Zuschlag, Musik von Tonträger/Streaming (Anhang III)
  vvat: 0.05,                  // VVAT-Beitrag
  vorauszahlungsRabatt: 0.20,  // jährliche Vorauszahlung, wirkt nur im Handel

  handel: {                    // § 29, Monatssätze nach bespielter Fläche
    bis50: 11.67,
    bis100: 23.34,
    schritt: 100,              // je angefangene 100 m² …
    staffel: [                 // … mit diesem Satz bis zur Obergrenze der Stufe
      { ab: 100,   bis: 1000,     satz: 11.67 },
      { ab: 1000,  bis: 5000,     satz: 4.92 },
      { ab: 5000,  bis: 10000,    satz: 3.03 },
      { ab: 10000, bis: Infinity, satz: 1.74 },
    ],
  },

  gastro: {                    // § 17, Tarifgruppe B (auch Hotel-Restaurant, Bar, Frühstücksraum)
    tageProWoche: 6,
    wochenfaktor: 4.33,
    gaesteProPlatz: 2,         // Belegung pro Platz und Tag
    satzProGast: 0.0417,
    mindestMonat: 7.08,
  },

  garage: {                    // § 61 B, Jahressätze pro Stellplatz
    grenze: 5000,
    satzBis: 1.55,
    satzDarueber: 1.42,
    /* offen, der Vertrag sagt es nicht: 'alle' = ab 5.001 gilt der niedrigere
       Satz für alle Stellplätze (wie im Briefing), 'darueber' = nur für die
       Stellplätze über 5.000 */
    staffel: 'alle',
  },

  buero: {                     // § 61 A, Gänge, Stiegenhäuser, Aufzüge
    proAngefangene: 50,        // m² Bürofläche
    satzMonat: 0.43,
  },
};

/* ---- Unser Preis: PROVISORISCH, bis die echten Preise feststehen. Netto
        pro Standort; hängt er später von Branche, Fläche oder Standortzahl
        ab, kommt die Staffel in sdnaJahr() dazu ---- */
const SDNA_PREIS = { proStandortMonat: 29 };
const sdnaJahr = () => SDNA_PREIS.proStandortMonat * 12;

/* erst 23 % LSG, dann 5 % VVAT = 1,2915 */
const AKM_ZUSCHLAG = (1 + AKM_TARIF.lsg) * (1 + AKM_TARIF.vvat);

function akmHandelMonat(m2) {
  const t = AKM_TARIF.handel;
  if (m2 <= 50)  return t.bis50;
  if (m2 <= 100) return t.bis100;
  return t.staffel.reduce((m, s) =>
    m2 > s.ab ? m + Math.ceil((Math.min(m2, s.bis) - s.ab) / t.schritt) * s.satz : m, t.bis100);
}

function akmGastroMonat(plaetze) {
  const t = AKM_TARIF.gastro;
  const frequenz = t.tageProWoche * t.wochenfaktor * plaetze * t.gaesteProPlatz;
  return Math.max(frequenz * t.satzProGast, t.mindestMonat);
}

/* AKM-Entgelt pro Jahr, noch ohne Zuschläge */
const AKM_ENTGELT = {
  handel: a => akmHandelMonat(a) * 12 * (1 - AKM_TARIF.vorauszahlungsRabatt),
  gastro: p => akmGastroMonat(p) * 12,
  garage: s => {
    const g = AKM_TARIF.garage;
    if (s <= g.grenze) return s * g.satzBis;
    return g.staffel === 'alle' ? s * g.satzDarueber : g.grenze * g.satzBis + (s - g.grenze) * g.satzDarueber;
  },
  buero:  b => Math.ceil(b / AKM_TARIF.buero.proAngefangene) * AKM_TARIF.buero.satzMonat * 12,
};

/* Ergebnis in ganzen Euro – gerundet wird erst hier, ganz am Ende */
function akmJahr(tarif, n) {
  const exakt = AKM_ENTGELT[tarif](n) * AKM_ZUSCHLAG;
  return Math.round(+exakt.toFixed(6));
}

/* ---- Branchen: genau ein Eingabefeld je Branche ----
   zusatz: steht klein unter dem Namen auf der Kachel
   regler: Spanne des Reglers (logarithmisch) und Startwert; tippen geht
   auch darüber hinaus */
const AKM_BRANCHEN = [
  { value: 'handel', label: 'Handel', icon: 'bag', tarif: 'handel',
    eingabe: 'Bespielte Fläche in m²',
    hinweis: 'Gemeint ist die Fläche von Wand zu Wand in allen Räumen, in denen die Musik hörbar ist.',
    regler: { von: 20, bis: 20000, start: 300 } },
  { value: 'gastro', label: 'Gastronomie', icon: 'utensils', tarif: 'gastro',
    eingabe: 'Verabreichungsplätze',
    regler: { von: 1, bis: 500, start: 40 } },
  { value: 'hotel', label: 'Hotel', zusatz: 'Restaurant, Bar, Frühstücksraum', icon: 'bed', tarif: 'gastro',
    eingabe: 'Verabreichungsplätze',
    regler: { von: 1, bis: 500, start: 40 } },
  { value: 'garage', label: 'Garage, Parkhaus', icon: 'parking', tarif: 'garage',
    eingabe: 'Stellplätze des Betreibers gesamt',
    hinweis: 'Es zählen alle Stellplätze des Betreibers über alle Standorte.',
    regler: { von: 10, bis: 10000, start: 400 } },
  { value: 'buero', label: 'Bürogebäude', zusatz: 'Gänge, Stiegenhäuser, Aufzüge', icon: 'building', tarif: 'buero',
    eingabe: 'Bürofläche des Hauses in m²',
    hinweis: 'Es zählt die Bürofläche, nicht die Fläche der Gänge und Lifte.',
    regler: { von: 100, bis: 100000, start: 2000 } },
];

/* ---- Ansicht ---- */
const akmInput    = document.getElementById('akm-input');
const akmRegler   = document.getElementById('akm-regler');
const akmLabel    = document.getElementById('akm-input-label');
const akmHint     = document.getElementById('akm-hint');
const akmResult   = document.getElementById('akm-result');
const akmAmount   = document.getElementById('akm-amount');
const akmMore     = document.getElementById('akm-more');
const akmAnnahmen = document.getElementById('akm-annahmen');
const akmDienst   = document.getElementById('akm-dienst');
const akmCompare  = document.getElementById('akm-compare');
const akmBisher   = document.getElementById('akm-bisher');
const akmBisherTeile = document.getElementById('akm-bisher-parts');
const akmSdna     = document.getElementById('akm-sdna');
const akmDiffLabel = document.getElementById('akm-diff-label');
const akmDiff     = document.getElementById('akm-diff');
const akmZahl     = new Intl.NumberFormat('de-DE');   // 1.592
const akmEuro     = n => `${n === null ? '–' : akmZahl.format(n)} €`;

const AKM_MAX_STELLEN = 7;
const AKM_DIENST_STELLEN = 5;
const AKM_REGLER_MAX = +akmRegler.max;   // Reglerpositionen 0 … 1000
const akmWerte = {};          // Eingabe je Branche, bleibt beim Wechseln erhalten
let akmBranche = AKM_BRANCHEN[0];

const akmZahlAus = s => Number(s.replace(/\D/g, ''));

/* Regler ↔ Wert auf logarithmischer Skala */
function akmWertAus(pos) {
  const { von, bis } = akmBranche.regler;
  return von * (bis / von) ** (pos / AKM_REGLER_MAX);
}

function akmPosAus(n) {
  const { von, bis } = akmBranche.regler;
  const k = Math.log(Math.min(Math.max(n, von), bis) / von) / Math.log(bis / von);
  return k * AKM_REGLER_MAX;
}

/* runde Werte beim Ziehen: zwei gültige Stellen (347 → 350, 12.345 → 12.000) */
function akmRund(v) {
  if (v < 10) return Math.max(1, Math.round(v));
  const stelle = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / stelle) * stelle;
}

function akmSetRegler(pos) {
  akmRegler.value = pos;
  akmRegler.style.setProperty('--fill', `${(pos / AKM_REGLER_MAX) * 100}%`);
}

function akmRender() {
  const n = akmZahlAus(akmInput.value);
  const akm = n ? akmJahr(akmBranche.tarif, n) : null;
  akmResult.classList.toggle('is-empty', akm === null);
  akmAmount.textContent = akmEuro(akm);

  /* Schritt 2: bisher (AKM + Musikdienst) gegen sounddna */
  const dienst = akmZahlAus(akmDienst.value) * 12;
  const bisher = akm === null ? null : akm + dienst;
  const diff = bisher === null ? null : bisher - sdnaJahr();
  akmCompare.classList.toggle('is-empty', akm === null);
  akmBisher.textContent = akmEuro(bisher);
  akmBisherTeile.textContent = akm === null ? '' :
    dienst ? `AKM ${akmEuro(akm)} + Musikdienst ${akmEuro(dienst)}` : `AKM ${akmEuro(akm)}`;
  akmSdna.textContent = akmEuro(sdnaJahr());
  akmDiffLabel.textContent = diff < 0 ? 'Mehrkosten' : 'Ersparnis';
  akmDiff.textContent = akmEuro(diff === null ? null : Math.abs(diff));
}

function akmZeigeBranche() {
  akmLabel.textContent = akmBranche.eingabe;
  akmHint.textContent = akmBranche.hinweis || '';
  akmHint.hidden = !akmBranche.hinweis;
  akmInput.value = akmWerte[akmBranche.value] ?? akmZahl.format(akmBranche.regler.start);
  akmSetRegler(akmPosAus(akmZahlAus(akmInput.value) || akmBranche.regler.von));
  akmRender();
}

akmRegler.addEventListener('input', () => {
  const n = akmRund(akmWertAus(+akmRegler.value));
  akmSetRegler(+akmRegler.value);
  akmInput.value = akmZahl.format(n);
  akmRender();
});

/* Branche als Kacheln wie im Channel Builder */
const akmBranchenEl = document.getElementById('akm-branche');

AKM_BRANCHEN.forEach(b => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'tile';
  el.dataset.value = b.value;
  el.innerHTML = `${icon(b.icon)}<span class="tile__text"><span class="tile__label"></span><span class="tile__sub"></span></span>`;
  el.querySelector('.tile__label').textContent = b.label;
  el.querySelector('.tile__sub').textContent = b.zusatz || '';
  el.querySelector('.tile__sub').hidden = !b.zusatz;
  el.addEventListener('click', () => {
    if (b === akmBranche) return;
    akmWerte[akmBranche.value] = akmInput.value;
    akmBranche = b;
    akmMarkiere();
    akmZeigeBranche();
  });
  akmBranchenEl.appendChild(el);
});

function akmMarkiere() {
  akmBranchenEl.querySelectorAll('.tile').forEach(t => {
    const on = t.dataset.value === akmBranche.value;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-pressed', String(on));
  });
}

/* nur Ziffern, mit Tausenderpunkten; der Cursor bleibt hinter derselben Ziffer.
   Liefert die Zahl (0 bei leerem Feld) */
function akmFormatiere(el, maxStellen) {
  const vorCursor = el.value.slice(0, el.selectionStart).replace(/\D/g, '').length;
  const ziffern = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, maxStellen);
  const text = ziffern ? akmZahl.format(+ziffern) : '';
  el.value = text;

  let pos = 0;
  for (let gesehen = 0; pos < text.length && gesehen < vorCursor; pos++) {
    if (/\d/.test(text[pos])) gesehen++;
  }
  el.setSelectionRange(pos, pos);
  return +ziffern;
}

akmInput.addEventListener('input', () => {
  const n = akmFormatiere(akmInput, AKM_MAX_STELLEN);
  if (n) akmSetRegler(akmPosAus(n));
  akmRender();
});

akmDienst.addEventListener('input', () => {
  akmFormatiere(akmDienst, AKM_DIENST_STELLEN);
  akmRender();
});

akmMore.addEventListener('click', () => {
  const open = akmMore.getAttribute('aria-expanded') !== 'true';
  akmMore.setAttribute('aria-expanded', String(open));
  setCollapse(akmAnnahmen, open);
});

document.getElementById('akm-stand').textContent = AKM_TARIF.stand;
akmMarkiere();
akmZeigeBranche();
