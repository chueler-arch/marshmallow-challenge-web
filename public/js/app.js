(() => {
  'use strict';

  const DEFAULT_SETTINGS = { presenterSeconds: 30, buildMinutes: 18, reflectionMinutes: 3, presentationSeconds: 30, sound: true, preStartEnabled: false, preStartText: 'みなさんにチャレンジ頂くのは・・・', prize1: '', prize2: '', prize3: '' };
  const TEAM_COLORS = ['#f36f32', '#2c7657', '#3197b9', '#8b5fbf', '#d94865', '#348a89', '#cf8a24', '#5968b0', '#7b8d42', '#b45b8c'];
  const STORAGE_KEY = 'marshmallow-challenge-state-v4';
  const state = loadState();
  let slides = [];
  let current = 0;
  let soundEnabled = state.settings.sound;
  let setupPage = 0;
  let toastTimeout;
  let audioContext;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const teamLetter = index => index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
  const teamColor = index => TEAM_COLORS[index % TEAM_COLORS.length];
  const allNames = () => state.teams.flatMap(team => team.members);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const teams = Array.isArray(saved?.teams) && saved.teams.length
        ? saved.teams.map((team, index) => ({ name: String(team?.name || `チーム${index + 1}`), members: Array.isArray(team?.members) ? team.members.map(String) : [] }))
        : [{ name: 'チーム1', members: [] }];
      return { teams, scores: Array.isArray(saved?.scores) ? saved.scores.slice(0, teams.length) : teams.map(() => 0), settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) } };
    } catch { return { teams: [{ name: 'チーム1', members: [] }], scores: [0], settings: { ...DEFAULT_SETTINGS } }; }
  }

  function normalizeState() {
    if (!state.teams.length) state.teams = [{ name: 'チーム1', members: [] }];
    state.teams.forEach((team, index) => { team.name ||= `チーム${index + 1}`; team.members = Array.isArray(team.members) ? team.members : []; });
    state.scores = state.teams.map((_, index) => Number(state.scores[index]) || 0);
  }

  function saveState() { normalizeState(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function refreshSlides() {
    const active = $('.slide.is-active');
    slides = $$('.slide').filter(slide => slide.dataset.optional !== 'prestart' || state.settings.preStartEnabled);
    $$('.slide[data-optional="prestart"]').forEach(slide => slide.classList.toggle('is-disabled-slide', !state.settings.preStartEnabled));
    if (active && slides.includes(active)) current = slides.indexOf(active);
  }

  function distributeNames(names, shuffle = false) {
    const items = shuffle ? shuffled(names) : [...names];
    state.teams.forEach(team => { team.members = []; });
    items.forEach((name, index) => state.teams[index % state.teams.length].members.push(name));
  }

  function syncNames() {
    const names = $('#participantInput').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    distributeNames(names);
    $('#participantCount').textContent = `${names.length}名`;
    saveState(); renderTeams(); syncSetupFields();
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
    $('#teams').style.setProperty('--team-count', Math.min(state.teams.length, 4));
    $('#teams').innerHTML = state.teams.map((team, index) => `
      <article class="team-card" style="--team-color:${teamColor(index)}" data-letter="${teamLetter(index)}">
        <header><b>${teamLetter(index)}</b><span><button type="button" data-edit-team-name="${index}" title="クリックしてチーム名を編集">${escapeHtml(team.name)}</button><input type="text" data-team-name-editor="${index}" maxlength="30" value="${escapeHtml(team.name)}" aria-label="チーム名を編集"></span></header>
        <ul>${team.members.map(name => `<li>${escapeHtml(name)}</li>`).join('') || '<li class="empty-member">参加者未登録</li>'}</ul>
      </article>`).join('');
    $('#mainTeamCount').value = state.teams.length;
  }

  function setTeamCount(value) {
    const count = Math.min(20, Math.max(1, Number(value) || 1));
    if (count === state.teams.length) return;
    const names = allNames();
    if (count > state.teams.length) while (state.teams.length < count) state.teams.push({ name: `チーム${state.teams.length + 1}`, members: [] });
    else state.teams = state.teams.slice(0, count);
    state.scores = state.teams.map((_, index) => state.scores[index] || 0);
    distributeNames(names); saveState(); syncMainFromState(); syncSetupFields(); showToast(`${count}チームに変更しました`);
  }

  function renderMeasurements() {
    $('#measureGrid').style.setProperty('--team-count', Math.min(state.teams.length, 4));
    $('#measureGrid').innerHTML = state.teams.map((team, index) => `
      <article class="measure-card" style="--team-color:${teamColor(index)}">
        <header><b>${escapeHtml(team.name)}</b><span>HEIGHT</span></header>
        <label><input type="number" min="0" max="999" step="0.1" inputmode="decimal" value="${state.scores[index] || ''}" data-score="${index}" aria-label="${escapeHtml(team.name)}の高さ"><span>cm</span></label>
      </article>`).join('');
    $$('[data-score]').forEach(input => input.addEventListener('input', () => {
      state.scores[Number(input.dataset.score)] = Math.max(0, Number(input.value) || 0);
      saveState(); renderResults();
    }));
  }

  function renderResults() {
    const ranked = state.teams.map((team, index) => ({ ...team, sourceIndex: index, score: Number(state.scores[index]) || 0 }))
      .sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
    const topThree = ranked.slice(0, 3);
    $('#winnerName').textContent = ranked[0]?.name || 'NO TEAM';
    $('#podium').classList.remove('many-teams');
    $('#podium').innerHTML = topThree.map((team, index) => `
      <article class="podium-step place-${index + 1}" style="--team-color:${teamColor(team.sourceIndex)}">
        <i class="podium-medal" aria-hidden="true">${['★', '◆', '●'][index]}</i><span>${index + 1} PLACE</span><b>${escapeHtml(team.name)}</b><strong>${formatScore(team.score)} cm</strong><em>${index + 1}</em>
      </article>`).join('');
    renderPrize(ranked);
  }

  function renderPrize(ranked) {
    const prizes = [state.settings.prize1, state.settings.prize2, state.settings.prize3];
    const hasPrizes = prizes.some(prize => prize?.trim());
    const winner = ranked[0]?.name || '優勝チーム';
    $('#prizeTitle').innerHTML = hasPrizes ? '健闘をたたえて、<br><em>景品授与。</em>' : `健闘をたたえて、<br><em>${escapeHtml(winner)}に拍手！</em>`;
    $('#prizeList').innerHTML = [0, 1, 2].filter(index => ranked[index]).map(index => `<li><b>${index + 1}位 ${escapeHtml(ranked[index].name)}</b>${hasPrizes ? escapeHtml(prizes[index]?.trim() || '景品なし') : ''}</li>`).join('');
  }

  function renderPresentationTabs() {
    $('#teamTabs').innerHTML = state.teams.map((team, index) => `<button type="button" data-present-team="${index}" class="${index === 0 ? 'is-active' : ''}">${escapeHtml(team.name)}</button>`).join('');
    $$('[data-present-team]').forEach(button => button.addEventListener('click', () => selectPresentationTeam(Number(button.dataset.presentTeam))));
    selectPresentationTeam(0, false);
  }

  function selectPresentationTeam(index, reset = true) {
    const team = state.teams[index]; if (!team) return;
    $$('[data-present-team]').forEach((button, i) => button.classList.toggle('is-active', i === index));
    $('#presentingBadge').textContent = `TEAM ${teamLetter(index)}`;
    $('#presentingBadge').style.background = teamColor(index);
    $('#presentingTeam').textContent = `${team.name}の発表`;
    if (reset) resetTimer($('.presentation-body .timer-card'));
  }

  function renderTeamRegistration() {
    $('#teamRegistration').innerHTML = state.teams.map((team, index) => `
      <div class="team-registration-row" data-team-row="${index}">
        <label><span>TEAM ${teamLetter(index)}</span><input type="text" maxlength="30" value="${escapeHtml(team.name)}" data-team-name="${index}" aria-label="チーム${index + 1}の名前"></label>
        <label><textarea rows="4" data-team-members="${index}" aria-label="${escapeHtml(team.name)}の参加者" placeholder="参加者名を1行に1名入力">${escapeHtml(team.members.join('\n'))}</textarea></label>
        <button type="button" data-remove-team="${index}" aria-label="${escapeHtml(team.name)}を削除" ${state.teams.length === 1 ? 'disabled' : ''}>×</button>
      </div>`).join('');
    $('#setupParticipantCount').textContent = `${allNames().length}名・${state.teams.length}チーム`;
  }

  function saveTeamRegistration() {
    const rows = $$('[data-team-row]');
    if (!rows.length) return;
    state.teams = rows.map((row, index) => ({
      name: $(`[data-team-name="${index}"]`, row).value.trim() || `チーム${index + 1}`,
      members: $(`[data-team-members="${index}"]`, row).value.split(/\r?\n/).map(name => name.trim()).filter(Boolean)
    }));
    normalizeState(); saveState(); syncMainFromState(); renderMaterialTeamTable();
  }

  function renderMaterialTeamTable() {
    const table = $('#materialTeamTable');
    if (!table) return;
    table.innerHTML = state.teams.map(team => `<tr><th>${escapeHtml(team.name)}</th><td>20本</td><td>90cm</td><td>90cm</td><td>1つ</td><td>1つ</td></tr>`).join('');
  }

  function syncMainFromState() {
    const names = allNames();
    $('#participantInput').value = names.join('\n');
    $('#participantCount').textContent = `${names.length}名`;
    renderTeams(); renderMeasurements(); renderResults(); renderPresentationTabs();
  }

  function goTo(index) {
    const next = Math.max(0, Math.min(slides.length - 1, index));
    if (next === current && slides[current].classList.contains('is-active')) return;
    slides[current]?.classList.remove('is-active'); current = next; slides[current].classList.add('is-active'); slides[current].scrollTop = 0;
    $('#sectionLabel').textContent = slides[current].dataset.title;
    $('#slideCount').textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    $('#progressBar').style.width = `${((current + 1) / slides.length) * 100}%`;
    $('#prevBtn').disabled = current === 0; $('#nextBtn').disabled = current === slides.length - 1;
    $('#nextBtn').innerHTML = current === slides.length - 2 ? '終了へ <span>→</span>' : '次へ <span>→</span>';
    document.body.classList.toggle('prestart-active', slides[current].dataset.optional === 'prestart');
    $('#stage').focus({ preventScroll: true });
  }

  function setupTimer(card) {
    card._timer = { total: Number(card.dataset.seconds), remaining: Number(card.dataset.seconds), running: false, interval: null, endAt: 0 };
    updateTimer(card);
  }

  function toggleTimer(card) {
    const timer = card._timer;
    if (timer.running) { timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)); clearInterval(timer.interval); timer.interval = null; timer.running = false; }
    else {
      if (timer.remaining <= 0) timer.remaining = timer.total;
      timer.running = true; timer.endAt = Date.now() + timer.remaining * 1000;
      timer.interval = window.setInterval(() => tickTimer(card), 200);
    }
    updateTimer(card);
  }

  function tickTimer(card) {
    const timer = card._timer;
    if (!timer?.running) return;
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    updateTimer(card);
    if (timer.remaining === 0) finishTimer(card);
  }

  function resetTimer(card) {
    if (!card?._timer) return;
    clearInterval(card._timer.interval); Object.assign(card._timer, { remaining: card._timer.total, running: false, interval: null, endAt: 0 }); updateTimer(card);
  }

  function updateTimer(card) {
    const timer = card._timer; const minutes = Math.floor(timer.remaining / 60); const seconds = timer.remaining % 60;
    $('.timer-display', card).textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    $('.dial-progress', card).style.strokeDashoffset = `${339.292 * (1 - timer.remaining / timer.total)}`;
    $('[data-timer-action="toggle"]', card).textContent = timer.running ? '一時停止' : timer.remaining === timer.total ? 'スタート' : '再開';
    card.classList.toggle('is-urgent', timer.remaining <= 10 && timer.remaining > 0);
  }

  function finishTimer(card) { clearInterval(card._timer.interval); card._timer.interval = null; card._timer.running = false; updateTimer(card); playChime(); showToast('タイムアップ！'); }

  function playChime() {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      [0, .16, .32].forEach((delay, index) => {
        const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.frequency.value = [523.25, 659.25, 783.99][index];
        gain.gain.setValueAtTime(.0001, audioContext.currentTime + delay); gain.gain.exponentialRampToValueAtTime(.22, audioContext.currentTime + delay + .02); gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + delay + .45);
        oscillator.connect(gain).connect(audioContext.destination); oscillator.start(audioContext.currentTime + delay); oscillator.stop(audioContext.currentTime + delay + .5);
      });
    } catch { /* Audio is optional. */ }
  }

  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('is-visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2400); }
  function formatScore(value) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }

  function openSetup(page = 0) { syncSetupFields(); showSetupPage(page); $('#setupOverlay').classList.add('is-open'); $('#setupOverlay').setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function closeSetup() { saveSetupFields(); $('#setupOverlay').classList.remove('is-open'); $('#setupOverlay').setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; $('#setupBtn').focus(); }
  function showSetupPage(page) {
    setupPage = Math.max(0, Math.min(6, page));
    $$('[data-setup-page]').forEach((button, index) => button.classList.toggle('is-active', index === setupPage));
    $$('[data-setup-panel]').forEach((panel, index) => panel.classList.toggle('is-active', index === setupPage));
    $('#setupPrevBtn').disabled = setupPage === 0; $('.setup-footer').classList.toggle('is-last', setupPage === 6);
    if (setupPage === 2) renderMaterialTeamTable();
  }

  function syncSetupFields() {
    renderTeamRegistration(); renderMaterialTeamTable();
    $('#settingPresenter').value = state.settings.presenterSeconds; $('#settingBuild').value = state.settings.buildMinutes;
    $('#settingReflection').value = state.settings.reflectionMinutes; $('#settingPresentation').value = state.settings.presentationSeconds; $('#settingSound').checked = state.settings.sound;
    $('#settingPreStart').checked = state.settings.preStartEnabled; $('#settingPreStartText').value = state.settings.preStartText;
    $('#settingPrize1').value = state.settings.prize1; $('#settingPrize2').value = state.settings.prize2; $('#settingPrize3').value = state.settings.prize3;
  }

  function saveSetupFields() {
    saveTeamRegistration();
    state.settings = {
      presenterSeconds: boundedNumber($('#settingPresenter').value, 5, 600, 30), buildMinutes: boundedNumber($('#settingBuild').value, 1, 120, 18),
      reflectionMinutes: boundedNumber($('#settingReflection').value, 1, 60, 3), presentationSeconds: boundedNumber($('#settingPresentation').value, 5, 600, 30), sound: $('#settingSound').checked,
      preStartEnabled: $('#settingPreStart').checked, preStartText: $('#settingPreStartText').value.trim() || DEFAULT_SETTINGS.preStartText,
      prize1: $('#settingPrize1').value.trim(), prize2: $('#settingPrize2').value.trim(), prize3: $('#settingPrize3').value.trim()
    };
    soundEnabled = state.settings.sound; $('#soundBtn').classList.toggle('is-muted', !soundEnabled); saveState(); applySettingsToApp(); renderResults();
  }

  function boundedNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
  function applySettingsToApp() {
    document.title = 'マシュマロ・チャレンジ';
    $('#preStartMessage').innerHTML = sanitizeDisplayHtml(state.settings.preStartText);
    $('#ruleBuildMinutes').textContent = `${state.settings.buildMinutes}分。`;
    $('#challengeDurationTitle').textContent = `${state.settings.buildMinutes}分間の`;
    $('#presentationDurationTitle').textContent = `${state.settings.presentationSeconds}秒で、`;
    refreshSlides();
    const durations = [state.settings.presenterSeconds, state.settings.buildMinutes * 60, state.settings.reflectionMinutes * 60, state.settings.presentationSeconds];
    $$('.timer-card').forEach((card, index) => { card.dataset.seconds = String(durations[index]); if (card._timer) { clearInterval(card._timer.interval); card._timer = { total: durations[index], remaining: durations[index], running: false, interval: null, endAt: 0 }; updateTimer(card); } });
  }

  function exportConfiguration() {
    saveSetupFields();
    const rows = [
      ['type', 'index', 'key', 'value'],
      ['meta', '', 'format', 'marshmallow-challenge-config'],
      ['meta', '', 'version', '3'],
      ['meta', '', 'exportedAt', new Date().toISOString()],
      ...Object.entries(state.settings).map(([key, value]) => ['setting', '', key, String(value)]),
      ...state.teams.flatMap((team, index) => [
        ['team', String(index), 'name', team.name],
        ...team.members.map(member => ['member', String(index), 'name', member])
      ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvEscape).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `marshmallow-challenge-config-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('CSV設定ファイルをダウンロードしました');
  }

  async function importConfiguration(file) {
    try {
      const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
      if (rows.length < 2 || rows[0].join(',') !== 'type,index,key,value') throw new Error('invalid-header');
      const records = rows.slice(1);
      if (!records.some(row => row[0] === 'meta' && row[2] === 'format' && row[3] === 'marshmallow-challenge-config')) throw new Error('invalid-format');
      const importedTeams = [];
      records.filter(row => row[0] === 'team').forEach(row => {
        const index = Number(row[1]); if (!Number.isInteger(index) || index < 0) return;
        importedTeams[index] = { name: row[3] || `チーム${index + 1}`, members: [] };
      });
      records.filter(row => row[0] === 'member').forEach(row => {
        const index = Number(row[1]); if (importedTeams[index] && row[3]?.trim()) importedTeams[index].members.push(row[3].trim());
      });
      if (!importedTeams.length || importedTeams.some(team => !team)) throw new Error('invalid-teams');
      const importedSettings = { ...DEFAULT_SETTINGS };
      records.filter(row => row[0] === 'setting').forEach(row => {
        const [,, key, value] = row;
        if (!(key in DEFAULT_SETTINGS)) return;
        importedSettings[key] = typeof DEFAULT_SETTINGS[key] === 'boolean' ? value === 'true' : typeof DEFAULT_SETTINGS[key] === 'number' ? Number(value) : value;
      });
      state.teams = importedTeams; state.settings = importedSettings; state.scores = state.teams.map(() => 0); normalizeState(); syncSetupFields(); saveSetupFields(); showToast('CSV設定ファイルを読み込みました');
    } catch { showToast('このCSV設定ファイルは読み込めません'); }
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function parseCsv(text) {
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += char;
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    return rows.filter(item => item.some(value => value !== ''));
  }

  function sanitizeDisplayHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '').replace(/\r?\n/g, '<br>');
    const allowed = new Set(['BR', 'STRONG', 'B', 'EM', 'I', 'U', 'SPAN', 'SMALL', 'MARK', 'P', 'DIV', 'H1', 'H2', 'H3']);
    [...template.content.querySelectorAll('*')].forEach(element => {
      if (!allowed.has(element.tagName)) element.replaceWith(...element.childNodes);
      else [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    });
    return template.innerHTML;
  }

  function restartExperience() {
    $$('.timer-card').forEach(resetTimer); refreshSlides();
    $$('.slide').forEach(slide => slide.classList.remove('is-active'));
    current = -1; goTo(0);
  }

  localStorage.removeItem('marshmallow-challenge-state-v2'); localStorage.removeItem('marshmallow-challenge-state-v3');
  applySettingsToApp(); syncMainFromState(); syncSetupFields();
  $('#participantInput').addEventListener('input', syncNames);
  function activateControl(control) {
    if (control.matches('[data-restart]')) return restartExperience();
    const card = control.closest('.timer-card');
    if (!card?._timer) return;
    if (control.dataset.timerAction === 'toggle') toggleTimer(card);
    if (control.dataset.timerAction === 'reset') resetTimer(card);
  }
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const control = $$('[data-timer-action], [data-restart]').filter(button => button.closest('.slide')?.classList.contains('is-active')).find(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (!control) return;
    event.preventDefault(); event.stopImmediatePropagation(); activateControl(control);
  }, true);
  document.addEventListener('click', event => {
    if (event.detail !== 0) return;
    const control = event.target.closest('[data-timer-action], [data-restart]');
    if (control) { event.preventDefault(); activateControl(control); }
  });
  $('#mainTeamCount').addEventListener('change', event => setTeamCount(event.target.value));
  $('#teams').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-team-name]'); if (!button) return;
    const card = button.closest('.team-card'); card.classList.add('is-editing-name'); const input = $('[data-team-name-editor]', card); input.focus(); input.select();
  });
  $('#teams').addEventListener('keydown', event => { if (event.target.matches('[data-team-name-editor]') && event.key === 'Enter') { event.preventDefault(); event.target.blur(); } });
  $('#teams').addEventListener('focusout', event => {
    const input = event.target.closest('[data-team-name-editor]'); if (!input) return;
    const index = Number(input.dataset.teamNameEditor); state.teams[index].name = input.value.trim() || `チーム${index + 1}`; saveState(); syncMainFromState(); syncSetupFields();
  });
  $('#shuffleBtn').addEventListener('click', () => {
    const names = $('#participantInput').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (names.length < state.teams.length) return showToast('参加者数がチーム数より少なくなっています');
    const button = $('#shuffleBtn'); button.classList.add('is-spinning'); distributeNames(names, true);
    setTimeout(() => { syncMainFromState(); syncSetupFields(); saveState(); button.classList.remove('is-spinning'); playChime(); showToast(`${state.teams.length}チームに振り分けました`); }, 550);
  });
  $('#supplyGrid').addEventListener('click', event => event.target.closest('button')?.classList.toggle('is-checked'));
  $('#prevBtn').addEventListener('click', () => goTo(current - 1)); $('#nextBtn').addEventListener('click', () => goTo(current + 1));
  $$('[data-next]').forEach(button => button.addEventListener('click', () => goTo(current + 1)));
  $('.brand').addEventListener('click', event => { event.preventDefault(); restartExperience(); });
  $('#soundBtn').addEventListener('click', () => { soundEnabled = !soundEnabled; state.settings.sound = soundEnabled; saveState(); $('#soundBtn').classList.toggle('is-muted', !soundEnabled); showToast(soundEnabled ? '効果音 ON' : '効果音 OFF'); });
  $('#setupBtn').addEventListener('click', () => openSetup()); $('#setupCloseBtn').addEventListener('click', closeSetup); $('#setupDoneBtn').addEventListener('click', () => { closeSetup(); showToast('事前準備を保存しました'); });
  $('#setupPrevBtn').addEventListener('click', () => showSetupPage(setupPage - 1)); $('#setupNextBtn').addEventListener('click', () => showSetupPage(setupPage + 1));
  $$('[data-setup-page]').forEach(button => button.addEventListener('click', () => showSetupPage(Number(button.dataset.setupPage))));
  $('#teamRegistration').addEventListener('input', () => { saveTeamRegistration(); $('#setupParticipantCount').textContent = `${allNames().length}名・${state.teams.length}チーム`; });
  $('#teamRegistration').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-team]'); if (!button || state.teams.length === 1) return;
    saveTeamRegistration(); const index = Number(button.dataset.removeTeam); const removed = state.teams.splice(index, 1)[0];
    if (removed?.members.length) state.teams[0].members.push(...removed.members); state.scores.splice(index, 1); saveState(); syncSetupFields(); syncMainFromState();
  });
  $('#addTeamBtn').addEventListener('click', () => { saveTeamRegistration(); const index = state.teams.length; state.teams.push({ name: `チーム${index + 1}`, members: [] }); state.scores.push(0); saveState(); syncSetupFields(); syncMainFromState(); });
  $('#setupShuffleBtn').addEventListener('click', () => { saveTeamRegistration(); const names = allNames(); if (names.length < state.teams.length) return showToast('参加者数がチーム数より少なくなっています'); distributeNames(names, true); saveState(); syncSetupFields(); syncMainFromState(); playChime(); showToast(`${state.teams.length}チームに再振り分けました`); });
  $$('.setup-page input').forEach(input => input.addEventListener('change', saveSetupFields));
  $('#settingPreStartText').addEventListener('change', saveSetupFields);
  $$('.export-config-btn').forEach(button => button.addEventListener('click', exportConfiguration));
  $$('.import-config-btn').forEach(button => button.addEventListener('click', () => $('#importConfigInput').click()));
  $('#importConfigInput').addEventListener('change', event => { const [file] = event.target.files; if (file) importConfiguration(file); event.target.value = ''; });
  $('#setupOverlay').addEventListener('click', event => { if (event.target === $('#setupOverlay')) closeSetup(); });
  $('#fullscreenBtn').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('全画面表示を利用できません'); } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#setupOverlay').classList.contains('is-open')) return closeSetup();
    if ($('#setupOverlay').classList.contains('is-open') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); goTo(current + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goTo(current - 1); }
    if (event.key.toLowerCase() === 'f') $('#fullscreenBtn').click();
  });
  $$('.timer-card').forEach(setupTimer); $$('.slide').forEach(slide => slide.classList.remove('is-active')); current = 0; goTo(0);
})();
