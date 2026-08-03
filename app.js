(() => {
  'use strict';

  const DEFAULT_NAMES = ['大原 慎也','山野 義人','荒井 卓','粟戸 謙能','寄口 文雄','山崎 直哉','須貝 華奈子','滝口 菜々子','磯部 洸大','鈴木 健二','吉川 龍昇','小橋 采奈'];
  const TEAM_META = [
    { letter: 'A', className: 'a', label: 'ORANGE TEAM' },
    { letter: 'B', className: 'b', label: 'GREEN TEAM' },
    { letter: 'C', className: 'c', label: 'BLUE TEAM' }
  ];
  const STORAGE_KEY = 'marshmallow-challenge-state-v2';
  const slides = [...document.querySelectorAll('.slide')];
  const state = loadState();
  let current = 0;
  let soundEnabled = true;
  let toastTimeout;
  let audioContext;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return {
        names: Array.isArray(saved?.names) ? saved.names : [...DEFAULT_NAMES],
        teams: Array.isArray(saved?.teams) ? saved.teams : null,
        scores: Array.isArray(saved?.scores) ? saved.scores : [0, 0, 0]
      };
    } catch { return { names: [...DEFAULT_NAMES], teams: null, scores: [0, 0, 0] }; }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function defaultTeams(names) {
    return [names.slice(0, 4), names.slice(4, 8), names.slice(8, 12)];
  }

  function syncNames() {
    state.names = $('#participantInput').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    $('#participantCount').textContent = `${state.names.length}名`;
    saveState();
  }

  function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function renderTeams() {
    const teams = state.teams || defaultTeams(state.names);
    $('#teams').innerHTML = TEAM_META.map((meta, index) => `
      <article class="team-card ${meta.className}" data-letter="${meta.letter}">
        <header><b>${meta.letter}</b><span>${meta.label}</span></header>
        <ul>${(teams[index] || []).map(name => `<li>${escapeHtml(name)}</li>`).join('') || '<li>参加者なし</li>'}</ul>
      </article>`).join('');
  }

  function renderMeasurements() {
    $('#measureGrid').innerHTML = TEAM_META.map((meta, index) => `
      <article class="measure-card ${meta.className}">
        <header><b>${meta.letter} TEAM</b><span>HEIGHT</span></header>
        <label><input type="number" min="0" max="999" step="0.1" inputmode="decimal" value="${state.scores[index] || ''}" data-score="${index}" aria-label="${meta.letter}チームの高さ"><span>cm</span></label>
      </article>`).join('');
    $$('[data-score]').forEach(input => input.addEventListener('input', () => {
      state.scores[Number(input.dataset.score)] = Math.max(0, Number(input.value) || 0);
      saveState();
      renderResults();
    }));
  }

  function renderResults() {
    const ranked = TEAM_META.map((team, index) => ({ ...team, score: Number(state.scores[index]) || 0 }))
      .sort((a, b) => b.score - a.score || a.letter.localeCompare(b.letter));
    $('#winnerName').textContent = `${ranked[0].letter} TEAM`;
    $('#podium').innerHTML = ranked.map((team, index) => `
      <article class="podium-step place-${index + 1}"><span>${index + 1}${index === 0 ? 'ST' : index === 1 ? 'ND' : 'RD'} PLACE</span><b>${team.letter}</b><strong>${formatScore(team.score)} cm</strong></article>`).join('');
  }

  function renderPresentationTabs() {
    $('#teamTabs').innerHTML = TEAM_META.map((team, index) => `<button type="button" data-present-team="${index}" class="${index === 0 ? 'is-active' : ''}">TEAM ${team.letter}</button>`).join('');
    $$('[data-present-team]').forEach(button => button.addEventListener('click', () => selectPresentationTeam(Number(button.dataset.presentTeam))));
  }

  function selectPresentationTeam(index) {
    const team = TEAM_META[index];
    $$('[data-present-team]').forEach((button, i) => button.classList.toggle('is-active', i === index));
    $('#presentingBadge').textContent = `TEAM ${team.letter}`;
    $('#presentingBadge').style.background = `var(--${team.className === 'a' ? 'orange' : team.className === 'b' ? 'green' : 'blue'})`;
    $('#presentingTeam').textContent = `${team.letter}チームの発表`;
    const timer = $('.presentation-body .timer-card');
    resetTimer(timer);
  }

  function goTo(index) {
    const next = Math.max(0, Math.min(slides.length - 1, index));
    if (next === current && slides[current].classList.contains('is-active')) return;
    slides[current]?.classList.remove('is-active');
    current = next;
    slides[current].classList.add('is-active');
    slides[current].scrollTop = 0;
    $('#sectionLabel').textContent = slides[current].dataset.title;
    $('#slideCount').textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    $('#progressBar').style.width = `${((current + 1) / slides.length) * 100}%`;
    $('#prevBtn').disabled = current === 0;
    $('#nextBtn').disabled = current === slides.length - 1;
    $('#nextBtn').innerHTML = current === slides.length - 2 ? '終了へ <span>→</span>' : '次へ <span>→</span>';
    $('#stage').focus({ preventScroll: true });
  }

  function setupTimer(card) {
    card._timer = { total: Number(card.dataset.seconds), remaining: Number(card.dataset.seconds), running: false, interval: null, endAt: 0 };
    updateTimer(card);
    $('[data-timer-action="toggle"]', card).addEventListener('click', () => toggleTimer(card));
    $('[data-timer-action="reset"]', card).addEventListener('click', () => resetTimer(card));
  }

  function toggleTimer(card) {
    const timer = card._timer;
    if (timer.running) {
      timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
      clearInterval(timer.interval); timer.interval = null; timer.running = false;
    } else {
      if (timer.remaining <= 0) timer.remaining = timer.total;
      timer.running = true; timer.endAt = Date.now() + timer.remaining * 1000;
      timer.interval = setInterval(() => {
        timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
        updateTimer(card);
        if (timer.remaining === 0) finishTimer(card);
      }, 250);
    }
    updateTimer(card);
  }

  function resetTimer(card) {
    if (!card?._timer) return;
    clearInterval(card._timer.interval);
    Object.assign(card._timer, { remaining: card._timer.total, running: false, interval: null, endAt: 0 });
    updateTimer(card);
  }

  function updateTimer(card) {
    const timer = card._timer;
    const minutes = Math.floor(timer.remaining / 60);
    const seconds = timer.remaining % 60;
    $('.timer-display', card).textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    $('.dial-progress', card).style.strokeDashoffset = `${339.292 * (1 - timer.remaining / timer.total)}`;
    $('[data-timer-action="toggle"]', card).textContent = timer.running ? '一時停止' : timer.remaining === timer.total ? 'スタート' : '再開';
    card.classList.toggle('is-urgent', timer.remaining <= 10 && timer.remaining > 0);
  }

  function finishTimer(card) {
    clearInterval(card._timer.interval); card._timer.interval = null; card._timer.running = false;
    updateTimer(card); playChime(); showToast('タイムアップ！');
  }

  function playChime() {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      [0, .16, .32].forEach((delay, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = [523.25, 659.25, 783.99][index];
        gain.gain.setValueAtTime(.0001, audioContext.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(.22, audioContext.currentTime + delay + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + delay + .45);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + delay); oscillator.stop(audioContext.currentTime + delay + .5);
      });
    } catch { /* Audio is an enhancement only. */ }
  }

  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('is-visible');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function formatScore(value) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }

  $('#participantInput').value = state.names.join('\n');
  $('#participantInput').addEventListener('input', syncNames);
  $('#shuffleBtn').addEventListener('click', () => {
    syncNames();
    if (state.names.length < 3) return showToast('参加者を3名以上入力してください');
    const button = $('#shuffleBtn'); button.classList.add('is-spinning');
    const mixed = shuffled(state.names); state.teams = [[], [], []];
    mixed.forEach((name, index) => state.teams[index % 3].push(name));
    setTimeout(() => { renderTeams(); saveState(); button.classList.remove('is-spinning'); playChime(); showToast('チーム分けが完了しました'); }, 550);
  });
  $('#supplyGrid').addEventListener('click', event => event.target.closest('button')?.classList.toggle('is-checked'));
  $('#ruleGrid').addEventListener('click', event => event.target.closest('button')?.classList.toggle('is-seen'));
  $('#prevBtn').addEventListener('click', () => goTo(current - 1));
  $('#nextBtn').addEventListener('click', () => goTo(current + 1));
  $$('[data-next]').forEach(button => button.addEventListener('click', () => goTo(current + 1)));
  $('.brand').addEventListener('click', event => { event.preventDefault(); goTo(0); });
  $('#restartBtn').addEventListener('click', () => goTo(0));
  $('#soundBtn').addEventListener('click', () => { soundEnabled = !soundEnabled; $('#soundBtn').classList.toggle('is-muted', !soundEnabled); showToast(soundEnabled ? '効果音 ON' : '効果音 OFF'); });
  $('#fullscreenBtn').addEventListener('click', async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('全画面表示を利用できません'); }
  });
  document.addEventListener('keydown', event => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); goTo(current + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goTo(current - 1); }
    if (event.key.toLowerCase() === 'f') $('#fullscreenBtn').click();
  });

  renderTeams(); renderMeasurements(); renderResults(); renderPresentationTabs();
  $$('.timer-card').forEach(setupTimer);
  slides.forEach(slide => slide.classList.remove('is-active'));
  goTo(0);
})();
