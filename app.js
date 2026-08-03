(() => {
  'use strict';

  const DEFAULT_NAMES = [];
  const DEFAULT_SETTINGS = { title: 'マシュマロ・チャレンジ', presenterSeconds: 30, buildMinutes: 18, reflectionMinutes: 3, presentationSeconds: 30, sound: true };
  const TEAM_META = [
    { letter: 'A', className: 'a', label: 'ORANGE TEAM' },
    { letter: 'B', className: 'b', label: 'GREEN TEAM' },
    { letter: 'C', className: 'c', label: 'BLUE TEAM' }
  ];
  const STORAGE_KEY = 'marshmallow-challenge-state-v3';
  const slides = [...document.querySelectorAll('.slide')];
  const state = loadState();
  let current = 0;
  let soundEnabled = state.settings.sound;
  let setupPage = 0;
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
        scores: Array.isArray(saved?.scores) ? saved.scores : [0, 0, 0],
        teamNames: Array.isArray(saved?.teamNames) ? saved.teamNames.slice(0, 3) : ['Aチーム', 'Bチーム', 'Cチーム'],
        settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) }
      };
    } catch { return { names: [], teams: null, scores: [0, 0, 0], teamNames: ['Aチーム', 'Bチーム', 'Cチーム'], settings: { ...DEFAULT_SETTINGS } }; }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function defaultTeams(names) {
    return [names.slice(0, 4), names.slice(4, 8), names.slice(8, 12)];
  }

  function syncNames() {
    state.names = $('#participantInput').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    state.teams = null;
    $('#participantCount').textContent = `${state.names.length}名`;
    if ($('#setupParticipants')) $('#setupParticipants').value = state.names.join('\n');
    if ($('#setupParticipantCount')) $('#setupParticipantCount').textContent = `${state.names.length}名`;
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
        <header><b>${meta.letter}</b><span>${escapeHtml(state.teamNames[index] || meta.label)}</span></header>
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
    $('#winnerName').textContent = state.teamNames[TEAM_META.findIndex(team => team.letter === ranked[0].letter)] || `${ranked[0].letter} TEAM`;
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
    $('#presentingTeam').textContent = `${state.teamNames[index] || `${team.letter}チーム`}の発表`;
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

  function openSetup(page = 0) {
    syncSetupFields(); showSetupPage(page);
    $('#setupOverlay').classList.add('is-open');
    $('#setupOverlay').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeSetup() {
    saveSetupFields();
    $('#setupOverlay').classList.remove('is-open');
    $('#setupOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    $('#setupBtn').focus();
  }

  function showSetupPage(page) {
    setupPage = Math.max(0, Math.min(4, page));
    $$('[data-setup-page]').forEach((button, index) => button.classList.toggle('is-active', index === setupPage));
    $$('[data-setup-panel]').forEach((panel, index) => panel.classList.toggle('is-active', index === setupPage));
    $('#setupPrevBtn').disabled = setupPage === 0;
    $('.setup-footer').classList.toggle('is-last', setupPage === 4);
  }

  function syncSetupFields() {
    $('#setupParticipants').value = state.names.join('\n');
    $('#setupParticipantCount').textContent = `${state.names.length}名`;
    state.teamNames.forEach((name, index) => { $(`#teamName${index}`).value = name || ''; });
    $('#settingTitle').value = state.settings.title;
    $('#settingPresenter').value = state.settings.presenterSeconds;
    $('#settingBuild').value = state.settings.buildMinutes;
    $('#settingReflection').value = state.settings.reflectionMinutes;
    $('#settingPresentation').value = state.settings.presentationSeconds;
    $('#settingSound').checked = state.settings.sound;
  }

  function saveSetupFields() {
    state.names = $('#setupParticipants').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    state.teamNames = [0, 1, 2].map(index => $(`#teamName${index}`).value.trim() || `${TEAM_META[index].letter}チーム`);
    state.settings = {
      title: $('#settingTitle').value.trim() || DEFAULT_SETTINGS.title,
      presenterSeconds: boundedNumber($('#settingPresenter').value, 5, 600, 30),
      buildMinutes: boundedNumber($('#settingBuild').value, 1, 120, 18),
      reflectionMinutes: boundedNumber($('#settingReflection').value, 1, 60, 3),
      presentationSeconds: boundedNumber($('#settingPresentation').value, 5, 600, 30),
      sound: $('#settingSound').checked
    };
    $('#participantInput').value = state.names.join('\n');
    $('#participantCount').textContent = `${state.names.length}名`;
    $('#setupParticipantCount').textContent = `${state.names.length}名`;
    soundEnabled = state.settings.sound;
    $('#soundBtn').classList.toggle('is-muted', !soundEnabled);
    saveState(); renderTeams(); renderResults(); renderPresentationTabs(); applySettingsToApp();
  }

  function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function applySettingsToApp() {
    document.title = state.settings.title;
    const durations = [state.settings.presenterSeconds, state.settings.buildMinutes * 60, state.settings.reflectionMinutes * 60, state.settings.presentationSeconds];
    $$('.timer-card').forEach((card, index) => {
      card.dataset.seconds = String(durations[index]);
      if (card._timer) {
        clearInterval(card._timer.interval);
        card._timer = { total: durations[index], remaining: durations[index], running: false, interval: null, endAt: 0 };
        updateTimer(card);
      }
    });
  }

  function exportConfiguration() {
    saveSetupFields();
    const payload = { type: 'marshmallow-challenge-config', version: 1, exportedAt: new Date().toISOString(), names: state.names, teams: state.teams, teamNames: state.teamNames, settings: state.settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `marshmallow-challenge-config-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('設定ファイルをダウンロードしました');
  }

  async function importConfiguration(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.type !== 'marshmallow-challenge-config' || !Array.isArray(payload.names) || !Array.isArray(payload.teamNames) || typeof payload.settings !== 'object') throw new Error('invalid');
      state.names = payload.names.map(String).map(name => name.trim()).filter(Boolean);
      state.teams = Array.isArray(payload.teams) ? payload.teams.slice(0, 3).map(team => Array.isArray(team) ? team.map(String) : []) : null;
      state.teamNames = payload.teamNames.slice(0, 3).map(String);
      while (state.teamNames.length < 3) state.teamNames.push(`${TEAM_META[state.teamNames.length].letter}チーム`);
      state.settings = { ...DEFAULT_SETTINGS, ...payload.settings };
      syncSetupFields(); saveSetupFields(); renderMeasurements();
      showToast('設定ファイルを読み込みました');
    } catch { showToast('この設定ファイルは読み込めません'); }
  }

  localStorage.removeItem('marshmallow-challenge-state-v2');
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
  $('#setupBtn').addEventListener('click', () => openSetup());
  $('#setupCloseBtn').addEventListener('click', closeSetup);
  $('#setupDoneBtn').addEventListener('click', () => { closeSetup(); showToast('事前準備を保存しました'); });
  $('#setupPrevBtn').addEventListener('click', () => showSetupPage(setupPage - 1));
  $('#setupNextBtn').addEventListener('click', () => showSetupPage(setupPage + 1));
  $$('[data-setup-page]').forEach(button => button.addEventListener('click', () => showSetupPage(Number(button.dataset.setupPage))));
  $('#setupParticipants').addEventListener('input', () => { state.teams = null; $('#setupParticipantCount').textContent = `${$('#setupParticipants').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean).length}名`; saveSetupFields(); });
  $$('.setup-page input').forEach(input => input.addEventListener('change', saveSetupFields));
  $('#setupShuffleBtn').addEventListener('click', () => {
    saveSetupFields();
    if (state.names.length < 3) return showToast('参加者を3名以上入力してください');
    const mixed = shuffled(state.names); state.teams = [[], [], []]; mixed.forEach((name, index) => state.teams[index % 3].push(name));
    saveState(); renderTeams(); playChime(); showToast('チーム分けが完了しました');
  });
  $('#exportConfigBtn').addEventListener('click', exportConfiguration);
  $('#importConfigBtn').addEventListener('click', () => $('#importConfigInput').click());
  $('#importConfigInput').addEventListener('change', event => { const [file] = event.target.files; if (file) importConfiguration(file); event.target.value = ''; });
  $('#setupOverlay').addEventListener('click', event => { if (event.target === $('#setupOverlay')) closeSetup(); });
  $('#fullscreenBtn').addEventListener('click', async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('全画面表示を利用できません'); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#setupOverlay').classList.contains('is-open')) return closeSetup();
    if ($('#setupOverlay').classList.contains('is-open') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); goTo(current + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goTo(current - 1); }
    if (event.key.toLowerCase() === 'f') $('#fullscreenBtn').click();
  });

  applySettingsToApp(); syncSetupFields(); renderTeams(); renderMeasurements(); renderResults(); renderPresentationTabs();
  $$('.timer-card').forEach(setupTimer);
  slides.forEach(slide => slide.classList.remove('is-active'));
  goTo(0);
})();
