/* ================================================================
   SPOT CREATION – Formular, Karten, Zustände, Suche
   „Ready for Schedule“ setzt einen fertigen Spot auf die gleichnamige
   Liste im Calendar (plan.js); von dort wird er eingeplant.
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
    card.querySelector('.badge--ready').hidden = true;
  }
}

/** options: { title, date, duration, category, scheduled, received, texts, status, isNew } */
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
    category: options.category || 'standard',
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
      menu.querySelector('[data-action="ready"] .context-menu__label').textContent =
        isSpotReady(card._state.title) ? 'Remove from Ready for Schedule' : 'Ready for Schedule';
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
      case 'ready':
        toggleCardReady(card);
        break;
      case 'reuse':
        titleInput.value = card._state.title;
        textFirst.value = card._state.texts.first;
        textSecond.value = card._state.texts.second;
        setSecondLang(Boolean(card._state.texts.second.trim()));
        onComposerInput();
        titleInput.focus({ preventScroll: true });
        break;
      case 'delete': {
        setCardState(card, 'deleted');
        const removed = retireSpot(card._state.title);
        syncReadyBadges();
        if (removed) showToast('success', `Removed from ${removed} calendar slot${removed === 1 ? '' : 's'}.`);
        break;
      }
    }
    closeAllMenus();
  });
}

/* ---------------------------------------------------------------
   Verbindung zum Calendar
   --------------------------------------------------------------- */
/* Spot auf die Liste „Ready for Schedule“ setzen bzw. wieder herunternehmen */
function toggleCardReady(card) {
  if (['pending', 'error', 'deleted'].includes(card._state.status)) {
    showToast('error', card._state.status === 'pending' ? 'The spot is still being generated.' : 'This spot can’t be scheduled.');
    return;
  }
  const { title, category, duration } = card._state;
  if (category === 'closing') {
    showToast('error', 'Opening and closing announcements are scheduled by sounddna.');
    return;
  }
  const ready = !isSpotReady(title);
  setSpotReady({ title, category, duration, source: 'spottool', front: true }, ready);
  syncReadyBadges();
  showToast('success', ready ? `“${title}” is ready for schedule.` : `“${title}” removed from Ready for Schedule.`);
}

/* Ready-Badge an allen Karten nach der Liste ausrichten */
function syncReadyBadges() {
  historyList.querySelectorAll('.card').forEach(card => {
    card.querySelector('.badge--ready').hidden = card._state.status === 'deleted' || !isSpotReady(card._state.title);
  });
}

/* im Calendar eingeplant → Badge an allen Karten dieses Spots */
function setCardScheduled(title) {
  historyList.querySelectorAll('.card').forEach(card => {
    if (card._state.title === title && card._state.status !== 'deleted') card.querySelector('.badge--scheduled').hidden = false;
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

/* ---- EXTRA: Suche ---- */
function setEmptyState(total, filtered) {
  historyEmpty.classList.toggle('history__empty--intro', total === 0);
  document.querySelector('.history').classList.toggle('is-empty', total === 0);
  if (total === 0) {
    historyEmpty.innerHTML = `${icon('wave')}<p><strong>No spots yet</strong>Enter a title and your announcement text, then create your first spot.</p>`;
  } else {
    historyEmpty.textContent = 'No spots match your search.';
  }
  historyEmpty.hidden = filtered > 0;
}

function applySearch() {
  const q = searchInput.value.trim().toLowerCase();
  const cards = [...historyList.querySelectorAll('.card')];
  let visible = 0;
  cards.forEach(card => {
    const show = card._state.title.toLowerCase().includes(q);
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  setEmptyState(cards.length, visible);
}

searchInput.addEventListener('input', applySearch);
/* ---- /EXTRA ---- */

/* ---------------------------------------------------------------
   Beispieldaten (alle Zustände, Player bei 0)
   --------------------------------------------------------------- */
const demoAnnouncement =
  'Liebe IKEA Kundin, lieber IKEA Kunde!\nEntdecke jede Woche ein neues Angebot für IKEA Family Mitglieder. RIAN, Beistelltisch um nur € 9,99 statt um € 29,99. Das und viele weitere Angebote findest du unter ikea.at/Innsbruck.\nLebe Smart!';

const demoSpots = [
  { title: 'IKEA FOOD Vösendorf Schlussdurchsage Café Bar_2', category: 'closing',    date: 'Today, 10:21',     duration: 9,  scheduled: true, received: true },
  { title: 'IKEA FOOD Mittagsangebot Köttbullar',             category: 'commercial', date: 'Today, 10:02',     duration: 12, received: true },
  { title: 'IKEA Family Angebot RIAN Beistelltisch',          category: 'commercial', date: 'Today, 09:48',     duration: 14, scheduled: true },
  { title: 'Smaland Abholung Durchsage_1',                    category: 'special',    date: 'Yesterday, 17:40', duration: 8 },
  { title: 'Öffnungszeiten Feiertag Westbahnhof',             category: 'special',    date: 'Yesterday, 11:12', duration: 11, status: 'error' },
  { title: 'Schlussdurchsage Restaurant_3',                   category: 'closing',    date: 'Yesterday, 09:31', duration: 10, scheduled: true, received: true },
  { title: 'IKEA Family Punkte Aktion September',             category: 'commercial', date: 'Mon, 10:02',       duration: 15, scheduled: true },
  { title: 'Parkdeck Hinweis Wochenende',                     category: 'standard',   date: 'Mon, 08:24',       duration: 7,  status: 'deleted' },
  { title: 'Fundbüro Durchsage Kassenbereich',                category: 'standard',   date: 'Sun, 14:47',       duration: 9 },
  { title: 'IKEA Vösendorf Aktion TISDAG Frühstück',          category: 'commercial', date: 'Sun, 09:15',       duration: 13, scheduled: true, received: true },
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
