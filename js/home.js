/* ================================================================
   HOME – Dashboard aus den Live-Daten von SpotTool & Calendar (plan.js)
   ================================================================ */

const homeStats  = document.getElementById('home-stats');
const homeNext   = document.getElementById('home-next');
const homeChart  = document.getElementById('home-chart');
const homeLast   = document.getElementById('home-last');
const homeDate   = document.getElementById('home-date');
const homeTodayCount = document.getElementById('home-today-count');
const homeWeekTotal  = document.getElementById('home-week-total');

const SPOTS_BASELINE = 140;    /* bereits vor dem Dummy generierte Spots */
const PLAN_SPOTS_PER_MONTH = 100;
const PLAN_USED_BEFORE = 31;   /* in diesem Monat vor dem Dummy schon generiert */

document.getElementById('home-hours').textContent = storeHoursLabel();
document.getElementById('home-quiet').textContent = quietHoursLabel();

let homePlayer = null;         /* Player für den letzten Spot (Dummy, wie in der History) */

function renderHome() {
  const now = new Date();
  const cards = [...historyList.querySelectorAll('.card')];

  homeDate.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* ---- Woche & heute – alles aus dem Calendar ---- */
  const week = weekDates(mondayOf(now));
  const perDayList = week.map(date => announcementsOn(date));
  const perDay = perDayList.map(list => list.length);
  const weekTotal = perDay.reduce((a, b) => a + b, 0);
  const todayIdx = dayIdx(now);
  const spotsOnAir = new Set(perDayList.flat().map(x => x.spot.id)).size;
  const fixedThisWeek = perDayList.flat().filter(x => x.fixed).length;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayAll = perDayList[todayIdx];
  const upcoming = todayAll.filter(x => minutesOf(x.time) >= nowMin);

  /* ---- Kennzahlen ---- */
  const generated = SPOTS_BASELINE + cards.filter(c => c._state.status !== 'error').length;

  const usedThisMonth = PLAN_USED_BEFORE + cards.filter(c => /^(Today|Yesterday|Mon|Sun)/.test(c.querySelector('.card__date').textContent) && c._state.status !== 'error').length;
  const left = Math.max(0, PLAN_SPOTS_PER_MONTH - usedThisMonth);
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  homeStats.innerHTML = [
    { label: 'Spots left this month', value: left, hint: `of ${PLAN_SPOTS_PER_MONTH} in your plan · resets ${MONTH_SHORT[resetDate.getMonth()]} 1`, bar: usedThisMonth / PLAN_SPOTS_PER_MONTH },
    { label: 'Spots generated', value: generated, hint: `${usedThisMonth} this month` },
    { label: 'Spots on air', value: spotsOnAir, hint: `this week · ${fixedThisWeek} fixed by sounddna` },
    { label: 'Announcements this week', value: weekTotal, hint: `${perDay[todayIdx]} today` },
  ].map(s => `
    <div class="home-stat">
      <p class="home-stat__label">${s.label}</p>
      <p class="home-stat__value">${s.value}</p>
      ${s.bar !== undefined ? `<div class="home-stat__bar"><div class="home-stat__bar-fill" style="width:${Math.round(s.bar * 100)}%"></div></div>` : ''}
      <p class="home-stat__hint">${s.hint}</p>
    </div>`).join('');

  /* ---- Up next ---- */
  if (upcoming.length) {
    const diff = minutesOf(upcoming[0].time) - nowMin;
    homeTodayCount.textContent = diff === 0 ? 'playing now' : `next in ${diff} min · ${todayAll.length} today`;
  } else {
    homeTodayCount.textContent = `${todayAll.length} today`;
  }
  homeNext.innerHTML = upcoming.length
    ? upcoming.slice(0, 5).map(x => `
        <div class="home-next__row">
          <span class="home-next__time">${x.time}</span>
          <span class="home-next__dot" style="background:${catColor(x.spot.category)}"></span>
          <span class="home-next__title">${escapeHtml(x.spot.title)}</span>
        </div>`).join('')
    : '<p class="home-empty">Nothing more scheduled for today.</p>';

  /* ---- Chart ---- */
  homeWeekTotal.textContent = `${weekTotal} announcements`;
  const max = Math.max(1, ...perDay);
  homeChart.innerHTML = week.map((date, i) => `
    <div class="home-bar${i === todayIdx ? ' home-bar--today' : ''}">
      <span class="home-bar__count">${perDay[i] || ''}</span>
      <div class="home-bar__track"><div class="home-bar__fill" style="height:${Math.max(4, Math.round(perDay[i] / max * 100))}%"></div></div>
      <span class="home-bar__label">${DAYS[i]}</span>
    </div>`).join('');

  /* ---- Slot-Raster ---- */
  /* bespielbar = offen und keine Quiet Hour – wie im Calendar */
  const openSlotsPerDay = [...Array(7)].map((_, di) =>
    [...Array(CAL_SLOTS)].filter((_, s) => !cellBlocked(di, s)).length);
  const openTotal = openSlotsPerDay.reduce((a, b) => a + b, 0);
  const usedTotal = perDayList.reduce((n, list, di) =>
    n + new Set(list.filter(x => !cellBlocked(di, x.slot)).map(x => x.slot)).size, 0);
  const usedPct = openTotal ? Math.round(usedTotal / openTotal * 100) : 0;
  document.getElementById('home-slots-day').textContent = `${openSlotsPerDay[0]} (Mo–Fr) · ${openSlotsPerDay[5]} (Sa)`;
  document.getElementById('home-slots-used').textContent = `${usedTotal} of ${openTotal} · ${usedPct}%`;
  document.getElementById('home-slots-fill').style.width = `${usedPct}%`;
  document.getElementById('home-slots-hint').textContent =
    `${openTotal - usedTotal} free slots left this week. Quiet hour ${quietHoursLabel()}.`;

  /* ---- Letzter Spot ---- */
  const last = cards.find(c => !['deleted', 'error', 'pending'].includes(c._state.status));
  if (homePlayer) homePlayer.stop();
  if (last) {
    homeLast.innerHTML = `
      <p class="home-last__title"></p>
      <p class="home-last__meta">${escapeHtml(last.querySelector('.card__date').textContent)}</p>
      <div class="home-last__player">
        <button class="play-btn" id="home-play" aria-label="Play">${icon('play', 'icon--filled')}</button>
        <div class="slider" id="home-slider">
          <div class="slider__track"></div><div class="slider__progress"></div><div class="slider__thumb"></div>
        </div>
        <span class="card__time" id="home-time"></span>
      </div>`;
    homeLast.querySelector('.home-last__title').textContent = last._state.title;
    homePlayer = createPlayer({
      playBtn: document.getElementById('home-play'),
      slider: document.getElementById('home-slider'),
      timeEl: document.getElementById('home-time'),
      duration: last._state.duration,
    });
  } else {
    homePlayer = null;
    homeLast.innerHTML = '<p class="home-empty">No spots generated yet.</p>';
  }
}

/* Live: alle 30 Sekunden auffrischen, solange Home sichtbar ist */
setInterval(() => { if (!homeView.hidden && !(homePlayer && homePlayer.playing)) renderHome(); }, 30000);

/* Navigation aus dem Dashboard heraus */
homeView.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) showView(go.dataset.go);
});
