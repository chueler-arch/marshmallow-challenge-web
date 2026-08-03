const STORAGE_KEY = 'marshmallow-challenge-app-state';

const appState = {
  currentView: 'home',
  roundSeconds: 180,
  totalRounds: 3,
  currentRound: 1,
  currentTeamIndex: 0,
  timerSeconds: 180,
  timerRunning: false,
  timerInterval: null,
  teams: [
    { name: 'チームA', score: 0, comment: '' },
    { name: 'チームB', score: 0, comment: '' },
    { name: 'チームC', score: 0, comment: '' }
  ]
};

const viewMap = {
  home: document.getElementById('home'),
  setup: document.getElementById('setup'),
  progress: document.getElementById('progress'),
  review: document.getElementById('review'),
  result: document.getElementById('result')
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    Object.assign(appState, parsed);
    appState.timerSeconds = appState.roundSeconds;
  } catch (error) {
    console.warn('保存データの読み込みに失敗しました', error);
  }
}

function showView(viewName) {
  appState.currentView = viewName;
  Object.entries(viewMap).forEach(([name, element]) => {
    element.classList.toggle('active', name === viewName);
  });
}

function getTeamNamesFromInput() {
  const raw = document.getElementById('teamNames').value;
  return raw.split(/\n+/).map((name) => name.trim()).filter(Boolean);
}

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function renderTeamList() {
  const teamList = document.getElementById('teamList');
  teamList.innerHTML = '';

  appState.teams.forEach((team, index) => {
    const item = document.createElement('div');
    item.className = `team-item ${index === appState.currentTeamIndex ? 'active' : ''}`;
    item.innerHTML = `<strong>${team.name}</strong><div>点数: ${team.score}</div>`;
    teamList.appendChild(item);
  });
}

function renderReview() {
  const reviewCards = document.getElementById('reviewCards');
  reviewCards.innerHTML = '';

  appState.teams.forEach((team, index) => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <strong>${team.name}</strong>
      <label>
        点数
        <input type="number" data-team-index="${index}" data-field="score" value="${team.score}" />
      </label>
      <label>
        コメント
        <textarea rows="3" data-team-index="${index}" data-field="comment">${team.comment}</textarea>
      </label>
    `;
    reviewCards.appendChild(card);
  });
}

function renderResult() {
  const resultList = document.getElementById('resultList');
  resultList.innerHTML = '';

  const sorted = [...appState.teams].sort((a, b) => b.score - a.score);
  sorted.forEach((team, index) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `<strong>${index + 1}位: ${team.name}</strong><span>点数: ${team.score}</span><div>コメント: ${team.comment || 'なし'}</div>`;
    resultList.appendChild(item);
  });
}

function updateProgressUi() {
  document.getElementById('currentRound').textContent = `${appState.currentRound} / ${appState.totalRounds}`;
  document.getElementById('currentTeam').textContent = appState.teams[appState.currentTeamIndex]?.name || '';
  document.getElementById('timerDisplay').textContent = formatTime(appState.timerSeconds);
  renderTeamList();
}

function applySetup() {
  const teamNames = getTeamNamesFromInput();
  if (teamNames.length === 0) {
    alert('チーム名を入力してください');
    return;
  }

  appState.teams = teamNames.map((name) => ({ name, score: 0, comment: '' }));
  appState.roundSeconds = Number(document.getElementById('roundSeconds').value) || 180;
  appState.totalRounds = Number(document.getElementById('roundCount').value) || 3;
  appState.currentRound = 1;
  appState.currentTeamIndex = 0;
  appState.timerSeconds = appState.roundSeconds;
  appState.timerRunning = false;
  stopTimer();

  renderReview();
  updateProgressUi();
  saveState();
  showView('progress');
}

function startTimer() {
  if (appState.timerRunning) return;
  appState.timerRunning = true;
  document.getElementById('timerToggleBtn').textContent = '一時停止';
  appState.timerInterval = setInterval(() => {
    if (appState.timerSeconds > 0) {
      appState.timerSeconds -= 1;
      updateProgressUi();
    } else {
      stopTimer();
    }
  }, 1000);
  saveState();
}

function stopTimer() {
  appState.timerRunning = false;
  if (appState.timerInterval) {
    clearInterval(appState.timerInterval);
    appState.timerInterval = null;
  }
  document.getElementById('timerToggleBtn').textContent = '開始';
}

function toggleTimer() {
  if (appState.timerSeconds <= 0) {
    appState.timerSeconds = appState.roundSeconds;
  }
  if (appState.timerRunning) {
    stopTimer();
  } else {
    startTimer();
  }
  saveState();
}

function nextRound() {
  appState.currentTeamIndex = (appState.currentTeamIndex + 1) % appState.teams.length;
  if (appState.currentTeamIndex === 0) {
    appState.currentRound += 1;
  }
  if (appState.currentRound > appState.totalRounds) {
    appState.currentRound = appState.totalRounds;
  }
  appState.timerSeconds = appState.roundSeconds;
  stopTimer();
  updateProgressUi();
  saveState();
}

function syncReviewInputs() {
  document.querySelectorAll('[data-field="score"]').forEach((input) => {
    const teamIndex = Number(input.dataset.teamIndex);
    appState.teams[teamIndex].score = Number(input.value) || 0;
  });

  document.querySelectorAll('[data-field="comment"]').forEach((textarea) => {
    const teamIndex = Number(textarea.dataset.teamIndex);
    appState.teams[teamIndex].comment = textarea.value;
  });

  renderTeamList();
  saveState();
}

function resetApp() {
  stopTimer();
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function wireEvents() {
  document.getElementById('startBtn').addEventListener('click', () => showView('setup'));
  document.getElementById('saveSetupBtn').addEventListener('click', applySetup);
  document.getElementById('timerToggleBtn').addEventListener('click', toggleTimer);
  document.getElementById('nextRoundBtn').addEventListener('click', nextRound);
  document.getElementById('toReviewBtn').addEventListener('click', () => {
    renderReview();
    showView('review');
  });
  document.getElementById('toResultBtn').addEventListener('click', () => {
    syncReviewInputs();
    renderResult();
    showView('result');
  });
  document.getElementById('resetBtn').addEventListener('click', resetApp);

  document.getElementById('reviewCards').addEventListener('input', syncReviewInputs);
}

function init() {
  loadState();
  wireEvents();
  updateProgressUi();
  renderReview();
  renderResult();
  showView(appState.currentView);
}

init();
