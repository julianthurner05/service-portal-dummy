/* ================================================================
   SPOT CREATION – Formular, Karten, Zustände, Suche
   ================================================================ */

const cardTemplate   = document.getElementById('card-template');
const titleInput     = document.getElementById('spot-title');
const textFirst      = document.getElementById('text-first');
const textSecond     = document.getElementById('text-second');
const searchInput    = document.getElementById('history-search');
const langToggle     = document.getElementById('lang-toggle');
const langToggleIcon = document.getElementById('lang-toggle-icon');
const firstLangLabel = document.getElementById('first-lang-label');
const secondLangArea = document.getElementById('second-lang-area');
const createBtn      = document.getElementById('create-btn'); /* EXTRA: Create */
const composerWords    = document.getElementById('composer-words');
const composerDuration = document.getElementById('composer-duration');
const creationBlock    = document.getElementById('creation-block');

/* ---- Second Language ---- */
let secondLangOpen = true;

function setSecondLang(open) {
  secondLangOpen = open;
  setCollapse(secondLangArea, open);
  langToggle.setAttribute('aria-expanded', String(open));
  langToggleIcon.innerHTML = open ? ICON_MINUS : ICON_PLUS;
  firstLangLabel.textContent = open ? 'First Language' : 'Announcement Text';
  if (open) {
    autosize(textSecond);
    textSecond.focus({ preventScroll: true });
  }
  updateComposerStats();
}

langToggle.addEventListener('click', () => setSecondLang(!secondLangOpen));

/* ---- Wortzahl & geschätzte Sprechdauer (~2,3 Wörter pro Sekunde) ---- */
const countWords = t => (t.trim().match(/\S+/g) || []).length;

function updateComposerStats() {
  const w1 = countWords(textFirst.value);
  const w2 = secondLangOpen ? countWords(textSecond.value) : 0;
  const total = w1 + w2;
  composerWords.innerHTML = `<strong>${total}</strong> words${w2 ? ` · ${w1} / ${w2}` : ''}`;
  composerDuration.innerHTML = `~ <strong>${formatTime(Math.round(total / 2.3))}</strong> spoken`;
}

/* ---- Entwurf: Punkt am Menüpunkt, sobald sich etwas seit dem letzten
        Reset (Laden, Create, Clear all) geändert hat ---- */
const composerSnapshot = () => JSON.stringify([titleInput.value, textFirst.value, textSecond.value]);
let creationInitial = composerSnapshot();

function updateCreationDraft() {
  setDraftDot('spot-creation', composerSnapshot() !== creationInitial);
}

function onComposerInput() {
  autosize(textFirst);
  autosize(textSecond);
  updateComposerStats();
  updateCreationDraft();
}

[textFirst, textSecond].forEach(el => el.addEventListener('input', onComposerInput));
titleInput.addEventListener('input', updateCreationDraft);

/* Felder leeren und den Leerzustand als neue Basis merken */
function resetComposer() {
  titleInput.value = '';
  textFirst.value = '';
  textSecond.value = '';
  creationInitial = composerSnapshot();
  onComposerInput();
}

document.getElementById('composer-clear').addEventListener('click', () => {
  resetComposer();
  titleInput.focus({ preventScroll: true });
});

/* Geöffnete Höhe des Blocks als min-height merken (oben verankert) */
function freezeCreationHeight() {
  if (creationView.hidden) return;
  creationBlock.style.minHeight = '';
  creationBlock.style.minHeight = creationBlock.offsetHeight + 'px';
}

document.fonts.ready.then(() => {
  [textFirst, textSecond].forEach(autosize);
  freezeCreationHeight();
});
window.addEventListener('resize', () => { if (secondLangOpen) freezeCreationHeight(); });

onComposerInput();

/* ---------------------------------------------------------------
   Karten
   --------------------------------------------------------------- */

/** Zustand: null | 'pending' | 'new' | 'error' | 'deleted' */
function setCardState(card, state) {
  card.classList.remove('card--pending', 'card--new', 'card--error', 'card--deleted');
  if (state) card.classList.add(`card--${state}`);
  card._state.status = state;

  card.querySelector('.badge--pending').hidden = state !== 'pending';
  card.querySelector('.badge--new').hidden = state !== 'new';
  card.querySelector('.badge--failed').hidden = state !== 'error';

  if (state === 'deleted' || state === 'error' || state === 'pending') card._player.stop();
  if (state === 'deleted') {
    card.querySelector('.badge--scheduled').hidden = true;
    card.querySelector('.badge--received').hidden = true;
  }
}

/** options: { title, date, duration, scheduled, received, texts, status, isNew } */
function createCard(options) {
  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.card');

  card.querySelector('.card__date').textContent = options.date;
  card.querySelector('.card__title').textContent = options.title;
  card.querySelector('.badge--scheduled').hidden = !options.scheduled;
  card.querySelector('.badge--received').hidden = !options.received;
  if (options.isNew) card.classList.add('card--new-anim');

  card._state = {
    duration: options.duration,
    status: null,
    texts: options.texts ?? { first: '', second: '' },
    title: options.title,
  };

  card._player = createPlayer({
    playBtn: card.querySelector('.play-btn'),
    slider: card.querySelector('.slider'),
    timeEl: card.querySelector('.card__time'),
    duration: options.duration,
  });

  wireCardMenu(card);
  if (options.status) setCardState(card, options.status);
  return card;
}

function wireCardMenu(card) {
  const kebab = card.querySelector('.kebab');
  const menu  = card.querySelector('.context-menu');

  kebab.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closeAllMenus();
    if (willOpen) {
      menu.hidden = false;
      kebab.classList.add('is-open');
    }
  });

  menu.addEventListener('click', e => {
    const item = e.target.closest('.context-menu__item');
    if (!item) return;
    e.stopPropagation();

    switch (item.dataset.action) {
      case 'receive':
        card.querySelector('.badge--received').hidden = false;
        break;
      case 'schedule':
        card.querySelector('.badge--scheduled').hidden = false;
        openScheduleFor(card._state.title, card._state.duration);
        break;
      case 'reuse':
        titleInput.value = card._state.title;
        textFirst.value = card._state.texts.first;
        textSecond.value = card._state.texts.second;
        setSecondLang(Boolean(card._state.texts.second.trim()));
        onComposerInput();
        titleInput.focus({ preventScroll: true });
        break;
      case 'delete':
        setCardState(card, 'deleted');
        break;
    }
    closeAllMenus();
  });
}

/* ---------------------------------------------------------------
   EXTRA: Create – Validierung, Generier-Zustand, Meldungen
   --------------------------------------------------------------- */
createBtn.addEventListener('click', () => {
  const title = titleInput.value.trim();
  if (!title) {
    showToast('error', 'Please enter a title first.');
    titleInput.focus({ preventScroll: true });
    return;
  }
  if (!textFirst.value.trim()) {
    showToast('error', 'Announcement text is missing.');
    textFirst.focus({ preventScroll: true });
    return;
  }

  const card = createCard({
    title,
    date: nowLabel(),
    duration: 6 + Math.floor(Math.random() * 7),
    scheduled: false,
    received: false,
    texts: {
      first: textFirst.value,
      second: secondLangOpen ? textSecond.value : '',
    },
    status: 'pending',
    isNew: true,
  });
  historyList.prepend(card);
  applySearch();
  resetComposer();

  setTimeout(() => {
    if (card._state.status !== 'pending') return;
    setCardState(card, 'new');
    showToast('success', 'Spot generated successfully.');

    /* New-State nach einer Minute wieder zurücknehmen */
    setTimeout(() => {
      if (card._state.status === 'new') setCardState(card, null);
    }, 60000);
  }, 2400);
});
/* ---- /EXTRA ---- */

/* ---- EXTRA: Suche (beide Listen) ---- */
function setEmptyState(kind, total, filtered) {
  historyEmpty.classList.toggle('history__empty--intro', total === 0);
  document.querySelector('.history').classList.toggle('is-empty', total === 0);
  if (total === 0) {
    historyEmpty.innerHTML = kind === 'spots'
      ? `${icon('wave')}<p><strong>No spots yet</strong>Enter a title and your announcement text, then create your first spot.</p>`
      : `${icon('gantt')}<p><strong>No schedules yet</strong>Choose a spot's audio, set days and times, and send it to the schedule.</p>`;
  } else {
    historyEmpty.textContent = kind === 'spots' ? 'No spots match your search.' : 'No schedules match your filters.';
  }
  historyEmpty.hidden = filtered > 0;
}

function applySearch() {
  const q = searchInput.value.trim().toLowerCase();
  let visible = 0;

  if (!historyList.hidden) {
    const cards = [...historyList.querySelectorAll('.card')];
    cards.forEach(card => {
      const show = card._state.title.toLowerCase().includes(q);
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    setEmptyState('spots', cards.length, visible);
  } else {
    const cat = categoryFilter.value;
    const st = statusFilter.value;
    const cards = [...scheduleList.querySelectorAll('.sched-card')];
    cards.forEach(card => {
      const o = card._opts;
      const show = o.title.toLowerCase().includes(q)
        && (cat === 'all' || o.category === cat)
        && (st === 'all' || scheduleStatus(o) === st);
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    setEmptyState('schedules', cards.length, visible);
  }
}

searchInput.addEventListener('input', applySearch);
/* ---- /EXTRA ---- */

/* ---------------------------------------------------------------
   Beispieldaten (alle Zustände, Player bei 0)
   --------------------------------------------------------------- */
const demoAnnouncement =
  'Liebe IKEA Kundin, lieber IKEA Kunde!\nEntdecke jede Woche ein neues Angebot für IKEA Family Mitglieder. RIAN, Beistelltisch um nur € 9,99 statt um € 29,99. Das und viele weitere Angebote findest du unter ikea.at/Innsbruck.\nLebe Smart!';

const demoSpots = [
  { title: 'IKEA FOOD Vösendorf Schlussdurchsage Café Bar_2', date: 'Today, 10:21',     duration: 9,  scheduled: true, received: true },
  { title: 'IKEA FOOD Mittagsangebot Köttbullar',             date: 'Today, 10:02',     duration: 12, received: true },
  { title: 'IKEA Family Angebot RIAN Beistelltisch',          date: 'Today, 09:48',     duration: 14, scheduled: true },
  { title: 'Smaland Abholung Durchsage_1',                    date: 'Yesterday, 17:40', duration: 8 },
  { title: 'Öffnungszeiten Feiertag Westbahnhof',             date: 'Yesterday, 11:12', duration: 11, status: 'error' },
  { title: 'Schlussdurchsage Restaurant_3',                   date: 'Yesterday, 09:31', duration: 10, scheduled: true, received: true },
  { title: 'IKEA Family Punkte Aktion September',             date: 'Mon, 10:02',       duration: 15, scheduled: true },
  { title: 'Parkdeck Hinweis Wochenende',                     date: 'Mon, 08:24',       duration: 7,  status: 'deleted' },
  { title: 'Fundbüro Durchsage Kassenbereich',                date: 'Sun, 14:47',       duration: 9 },
  { title: 'IKEA Vösendorf Aktion TISDAG Frühstück',          date: 'Sun, 09:15',       duration: 13, scheduled: true, received: true },
];

demoSpots.forEach(spot => {
  historyList.appendChild(
    createCard({
      scheduled: false,
      received: false,
      ...spot,
      texts: { first: demoAnnouncement, second: '' },
    })
  );
});
