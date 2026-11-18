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
    satzDarueber: 1.42,        // offen: gilt hier für alle Stellplätze, sobald es mehr als 5.000 sind
  },

  buero: {                     // § 61 A, Gänge, Stiegenhäuser, Aufzüge
    proAngefangene: 50,        // m² Bürofläche
    satzMonat: 0.43,
  },
};

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
  garage: s => s * (s <= AKM_TARIF.garage.grenze ? AKM_TARIF.garage.satzBis : AKM_TARIF.garage.satzDarueber),
  buero:  b => Math.ceil(b / AKM_TARIF.buero.proAngefangene) * AKM_TARIF.buero.satzMonat * 12,
};

/* Ergebnis in ganzen Euro – gerundet wird erst hier, ganz am Ende */
function akmJahr(tarif, n) {
  const exakt = AKM_ENTGELT[tarif](n) * AKM_ZUSCHLAG;
  return Math.round(+exakt.toFixed(6));
}

/* ---- Branchen: genau ein Eingabefeld je Branche ---- */
const AKM_BRANCHEN = [
  { value: 'handel', label: 'Handel', tarif: 'handel',
    eingabe: 'Bespielte Fläche in m²',
    hinweis: 'Gemeint ist die Fläche von Wand zu Wand in allen Räumen, in denen die Musik hörbar ist.' },
  { value: 'gastro', label: 'Gastronomie', tarif: 'gastro',
    eingabe: 'Verabreichungsplätze' },
  { value: 'hotel', label: 'Hotel (Restaurant, Bar, Frühstücksraum)', tarif: 'gastro',
    eingabe: 'Verabreichungsplätze' },
  { value: 'garage', label: 'Garage, Parkhaus', tarif: 'garage',
    eingabe: 'Stellplätze des Betreibers gesamt',
    hinweis: 'Es zählen alle Stellplätze des Betreibers über alle Standorte.' },
  { value: 'buero', label: 'Bürogebäude (Gänge, Stiegenhäuser, Aufzüge)', tarif: 'buero',
    eingabe: 'Bürofläche des Hauses in m²',
    hinweis: 'Es zählt die Bürofläche, nicht die Fläche der Gänge und Lifte.' },
];

/* ---- Ansicht ---- */
const akmInput    = document.getElementById('akm-input');
const akmLabel    = document.getElementById('akm-input-label');
const akmHint     = document.getElementById('akm-hint');
const akmResult   = document.getElementById('akm-result');
const akmAmount   = document.getElementById('akm-amount');
const akmMore     = document.getElementById('akm-more');
const akmAnnahmen = document.getElementById('akm-annahmen');
const akmZahl     = new Intl.NumberFormat('de-DE');   // 1.592

const AKM_MAX_STELLEN = 7;
const akmWerte = {};          // Eingabe je Branche, bleibt beim Wechseln erhalten
let akmBranche = AKM_BRANCHEN[0];

const akmZahlAus = s => Number(s.replace(/\D/g, ''));

function akmRender() {
  const n = akmZahlAus(akmInput.value);
  akmResult.classList.toggle('is-empty', !n);
  akmAmount.textContent = `${n ? akmZahl.format(akmJahr(akmBranche.tarif, n)) : '–'} €`;
}

function akmZeigeBranche() {
  akmLabel.textContent = akmBranche.eingabe;
  akmHint.textContent = akmBranche.hinweis || '';
  akmHint.hidden = !akmBranche.hinweis;
  akmInput.value = akmWerte[akmBranche.value] || '';
  akmRender();
}

buildDropdown(document.getElementById('akm-branche'), {
  options: AKM_BRANCHEN.map(({ value, label }) => ({ value, label })),
  value: akmBranche.value,
  tall: true,
  onChange: value => {
    akmWerte[akmBranche.value] = akmInput.value;
    akmBranche = AKM_BRANCHEN.find(b => b.value === value);
    akmZeigeBranche();
  },
});

/* nur Ziffern, mit Tausenderpunkten; der Cursor bleibt hinter derselben Ziffer */
akmInput.addEventListener('input', () => {
  const vorCursor = akmInput.value.slice(0, akmInput.selectionStart).replace(/\D/g, '').length;
  const ziffern = akmInput.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, AKM_MAX_STELLEN);
  const text = ziffern ? akmZahl.format(+ziffern) : '';
  akmInput.value = text;

  let pos = 0;
  for (let gesehen = 0; pos < text.length && gesehen < vorCursor; pos++) {
    if (/\d/.test(text[pos])) gesehen++;
  }
  akmInput.setSelectionRange(pos, pos);
  akmRender();
});

akmMore.addEventListener('click', () => {
  const open = akmMore.getAttribute('aria-expanded') !== 'true';
  akmMore.setAttribute('aria-expanded', String(open));
  setCollapse(akmAnnahmen, open);
});

document.getElementById('akm-stand').textContent = AKM_TARIF.stand;
akmZeigeBranche();
