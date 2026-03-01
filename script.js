const size = 15;
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const panels = ['home', 'game', 'settings', 'stats'];

const state = {
  mode: 'ai',
  aiLevel: 'easy',
  sound: true,
  theme: 'light',
  first: 'black',
  board: Array.from({ length: size }, () => Array(size).fill(0)),
  current: 1,
  moves: [],
  status: 'idle',
  timer: 0,
  timerHandle: null,
};

const statsKey = 'gomoku_stats_v1';
const getStats = () => JSON.parse(localStorage.getItem(statsKey) || '{"total":0,"win":0,"lose":0,"draw":0,"streak":0,"bestStreak":0,"recent":[]}');
const setStats = (s) => localStorage.setItem(statsKey, JSON.stringify(s));

function showPanel(id) {
  panels.forEach((p) => document.getElementById(p).classList.toggle('active', p === id));
  if (id === 'stats') renderStats();
}

function resetBoard() {
  state.board = Array.from({ length: size }, () => Array(size).fill(0));
  state.moves = [];
  state.status = 'playing';
  state.current = state.first === 'black' ? 1 : 2;
  state.timer = 0;
  clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    if (state.status === 'playing') {
      state.timer += 1;
      document.getElementById('timerLabel').textContent = `用时: ${state.timer}s`;
    }
  }, 1000);
  updateLabels();
  drawBoard();
  if (state.mode === 'ai' && state.current === 2) setTimeout(aiMove, 200);
}

function updateLabels() {
  document.getElementById('modeLabel').textContent = state.mode === 'ai' ? `模式: 人机(${state.aiLevel})` : '模式: 双人';
  document.getElementById('turnLabel').textContent = `当前: ${state.current === 1 ? '黑方' : '白方'}`;
}

function drawBoard() {
  const w = boardCanvas.width;
  const cell = w / (size + 1);
  ctx.clearRect(0, 0, w, w);
  ctx.fillStyle = getComputedStyle(boardCanvas).backgroundColor;
  ctx.fillRect(0, 0, w, w);
  ctx.strokeStyle = '#6a4a2a';
  for (let i = 1; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(cell, i * cell);
    ctx.lineTo(size * cell, i * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * cell, cell);
    ctx.lineTo(i * cell, size * cell);
    ctx.stroke();
  }
  for (const m of state.moves) {
    ctx.beginPath();
    ctx.arc((m.x + 1) * cell, (m.y + 1) * cell, cell * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = m.player === 1 ? '#111' : '#f5f5f5';
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.stroke();
  }
}

function boardPosFromEvent(evt) {
  const rect = boardCanvas.getBoundingClientRect();
  const cell = boardCanvas.width / (size + 1);
  const x = Math.round(((evt.clientX - rect.left) * (boardCanvas.width / rect.width)) / cell) - 1;
  const y = Math.round(((evt.clientY - rect.top) * (boardCanvas.height / rect.height)) / cell) - 1;
  if (x < 0 || x >= size || y < 0 || y >= size) return null;
  return { x, y };
}

function hasFive(x, y, player) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dx, dy] of dirs) {
    let c = 1;
    for (const k of [1, -1]) {
      let nx = x + dx * k;
      let ny = y + dy * k;
      while (nx >= 0 && ny >= 0 && nx < size && ny < size && state.board[ny][nx] === player) {
        c++;
        nx += dx * k;
        ny += dy * k;
      }
    }
    if (c >= 5) return true;
  }
  return false;
}

function placeMove(x, y) {
  if (state.status !== 'playing' || state.board[y][x] !== 0) return false;
  state.board[y][x] = state.current;
  state.moves.push({ x, y, player: state.current, ts: Date.now() });
  drawBoard();

  if (hasFive(x, y, state.current)) return endGame(state.current === 1 ? '黑方获胜' : '白方获胜', state.current);
  if (state.moves.length === size * size) return endGame('和局', 0);

  state.current = state.current === 1 ? 2 : 1;
  updateLabels();
  if (state.mode === 'ai' && state.current === 2) setTimeout(aiMove, 220);
  return true;
}

function scorePoint(x, y, player) {
  if (state.board[y][x] !== 0) return -1;
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  let score = 0;
  for (const [dx, dy] of dirs) {
    let own = 1, block = 0;
    for (const k of [1, -1]) {
      let nx = x + dx * k;
      let ny = y + dy * k;
      while (nx >= 0 && ny >= 0 && nx < size && ny < size && state.board[ny][nx] === player) {
        own++;
        nx += dx * k;
        ny += dy * k;
      }
      if (!(nx >= 0 && ny >= 0 && nx < size && ny < size) || state.board[ny][nx] !== 0) block++;
    }
    score += [0, 2, 10, 80, 500, 5000][own] || 0;
    if (block === 2) score = Math.floor(score * 0.5);
  }
  return score;
}

function aiMove() {
  if (state.status !== 'playing') return;
  const empties = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (state.board[y][x] === 0) empties.push({ x, y });
  if (!empties.length) return;

  let pick = empties[Math.floor(Math.random() * empties.length)];
  if (state.aiLevel !== 'easy') {
    let bestScore = -Infinity;
    for (const p of empties) {
      const atk = scorePoint(p.x, p.y, 2);
      const def = scorePoint(p.x, p.y, 1);
      let total = atk * 1.2 + def;
      if (state.aiLevel === 'hard') {
        state.board[p.y][p.x] = 2;
        const threat = Math.max(...empties.map(e => (state.board[e.y][e.x] === 0 ? scorePoint(e.x, e.y, 1) : -1)));
        state.board[p.y][p.x] = 0;
        total -= threat * 0.3;
      }
      if (total > bestScore) {
        bestScore = total;
        pick = p;
      }
    }
  }
  placeMove(pick.x, pick.y);
}

function endGame(text, winner) {
  state.status = 'ended';
  clearInterval(state.timerHandle);
  const stats = getStats();
  stats.total += 1;
  if (winner === 1 && state.mode === 'ai') { stats.win += 1; stats.streak += 1; stats.bestStreak = Math.max(stats.bestStreak, stats.streak); }
  else if (winner === 2 && state.mode === 'ai') { stats.lose += 1; stats.streak = 0; }
  else { stats.draw += 1; if (state.mode === 'ai') stats.streak = 0; }
  stats.recent.unshift({ result: text, mode: state.mode, duration: state.timer, steps: state.moves.length });
  stats.recent = stats.recent.slice(0, 10);
  setStats(stats);

  document.getElementById('resultTitle').textContent = text;
  document.getElementById('resultDetail').textContent = `步数: ${state.moves.length}，用时: ${state.timer}s`;
  document.getElementById('resultDialog').showModal();
}

function undo() {
  if (state.status !== 'playing' || !state.moves.length) return;
  const need = state.mode === 'ai' ? 2 : 1;
  for (let i = 0; i < need; i++) {
    const m = state.moves.pop();
    if (!m) break;
    state.board[m.y][m.x] = 0;
    state.current = m.player;
  }
  updateLabels();
  drawBoard();
}

function renderStats() {
  const s = getStats();
  const rate = s.total ? ((s.win / s.total) * 100).toFixed(1) : '0.0';
  document.getElementById('statsList').innerHTML = `
    <li>总局数: ${s.total}</li>
    <li>胜/负/平: ${s.win}/${s.lose}/${s.draw}</li>
    <li>胜率: ${rate}%</li>
    <li>当前连胜: ${s.streak}，最高连胜: ${s.bestStreak}</li>
    <li>最近对局: ${s.recent.map(r => `${r.result}(${r.duration}s)`).join('；') || '暂无'}</li>
  `;
}

boardCanvas.addEventListener('click', (e) => {
  const p = boardPosFromEvent(e);
  if (!p) return;
  if (state.mode === 'ai' && state.current === 2) return;
  placeMove(p.x, p.y);
});

document.getElementById('quickStart').onclick = () => {
  state.mode = 'ai';
  showPanel('game');
  resetBoard();
};
document.querySelectorAll('#home button[data-mode]').forEach((b) => {
  b.onclick = () => {
    state.mode = b.dataset.mode;
    showPanel('game');
    resetBoard();
  };
});

document.getElementById('undoBtn').onclick = undo;
document.getElementById('restartBtn').onclick = resetBoard;
document.getElementById('resignBtn').onclick = () => endGame(state.current === 1 ? '黑方认输' : '白方认输', state.current === 1 ? 2 : 1);
document.getElementById('backHomeBtn').onclick = () => { clearInterval(state.timerHandle); showPanel('home'); };
document.getElementById('openSettings').onclick = () => showPanel('settings');
document.getElementById('openStats').onclick = () => showPanel('stats');
document.querySelectorAll('.backBtn').forEach((b) => b.onclick = () => showPanel('home'));

document.getElementById('playAgainBtn').onclick = () => {
  document.getElementById('resultDialog').close();
  resetBoard();
};
document.getElementById('resultBackHomeBtn').onclick = () => {
  document.getElementById('resultDialog').close();
  showPanel('home');
};

document.getElementById('soundToggle').onchange = (e) => { state.sound = e.target.checked; };
document.getElementById('themeSelect').onchange = (e) => {
  state.theme = e.target.value;
  document.documentElement.classList.toggle('dark', state.theme === 'dark');
  drawBoard();
};
document.getElementById('aiLevel').onchange = (e) => { state.aiLevel = e.target.value; updateLabels(); };
document.getElementById('firstPlayer').onchange = (e) => { state.first = e.target.value; };
document.getElementById('clearStatsBtn').onclick = () => { setStats({ total: 0, win: 0, lose: 0, draw: 0, streak: 0, bestStreak: 0, recent: [] }); renderStats(); };

drawBoard();
showPanel('home');
