const boardSize = 15;
const maxUndo = 3;
const players = {
  black: { name: "黑棋", next: "white" },
  white: { name: "白棋", next: "black" },
};

const appState = {
  screen: "home",
  board: createBoard(),
  currentPlayer: "black",
  preview: null,
  moveHistory: [],
  undoLeft: { black: maxUndo, white: maxUndo },
  soundEnabled: true,
  winner: null,
  boardGeometry: null,
  toastTimer: null,
  audioContext: null,
  lastTouchEnd: 0,
};

const elements = {
  screens: document.querySelectorAll(".screen"),
  boardCanvas: document.getElementById("gomokuBoard"),
  startGameButton: document.getElementById("startGameButton"),
  homeSettingsButton: document.getElementById("homeSettingsButton"),
  gameSettingsButton: document.getElementById("gameSettingsButton"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  settingsSheet: document.getElementById("settingsSheet"),
  soundToggle: document.getElementById("soundToggle"),
  undoButton: document.getElementById("undoButton"),
  restartButton: document.getElementById("restartButton"),
  backHomeButton: document.getElementById("backHomeButton"),
  playAgainButton: document.getElementById("playAgainButton"),
  resultHomeButton: document.getElementById("resultHomeButton"),
  turnText: document.getElementById("turnText"),
  turnStone: document.getElementById("turnStone"),
  moveCount: document.getElementById("moveCount"),
  blackUndoLeft: document.getElementById("blackUndoLeft"),
  whiteUndoLeft: document.getElementById("whiteUndoLeft"),
  resultTitle: document.getElementById("resultTitle"),
  resultMoves: document.getElementById("resultMoves"),
  toast: document.getElementById("toast"),
};

const canvasContext = elements.boardCanvas.getContext("2d");

function syncViewportSize() {
  const visualViewport = window.visualViewport;
  const width = Math.ceil(visualViewport?.width || window.innerWidth || document.documentElement.clientWidth);
  const rawHeight = Math.ceil(visualViewport?.height || window.innerHeight || document.documentElement.clientHeight);
  const landscapeHeightCap = width >= 821 ? Math.floor(width * 0.75) : rawHeight;
  const height = Math.min(rawHeight, landscapeHeightCap);
  document.documentElement.style.setProperty("--app-width", `${width}px`);
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  window.scrollTo(0, 0);
  requestAnimationFrame(resizeBoard);
}

function createBoard() {
  return Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
}

function resetGame() {
  appState.board = createBoard();
  appState.currentPlayer = "black";
  appState.preview = null;
  appState.moveHistory = [];
  appState.undoLeft = { black: maxUndo, white: maxUndo };
  appState.winner = null;
  render();
}

function showScreen(screenName) {
  appState.screen = screenName;
  window.scrollTo(0, 0);
  elements.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === screenName);
  });
  if (screenName === "game") {
    requestAnimationFrame(resizeBoard);
  }
}

function startGame() {
  resetGame();
  showScreen("game");
}

function returnHome() {
  appState.winner = null;
  appState.preview = null;
  showScreen("home");
}

function openSettings() {
  elements.settingsSheet.classList.add("open");
  elements.settingsSheet.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  elements.settingsSheet.classList.remove("open");
  elements.settingsSheet.setAttribute("aria-hidden", "true");
}

function updateInterface() {
  elements.turnText.textContent = players[appState.currentPlayer].name;
  elements.turnStone.classList.toggle("white", appState.currentPlayer === "white");
  elements.moveCount.textContent = String(appState.moveHistory.length);
  elements.blackUndoLeft.textContent = String(appState.undoLeft.black);
  elements.whiteUndoLeft.textContent = String(appState.undoLeft.white);
  elements.undoButton.disabled = !canUndo();
}

function canUndo() {
  if (appState.winner) return false;
  if (appState.preview) return true;
  const lastMove = appState.moveHistory.at(-1);
  if (!lastMove) return false;
  return appState.undoLeft[lastMove.player] > 0;
}

function handleBoardPointer(event) {
  event.preventDefault();
  window.scrollTo(0, 0);

  if (appState.screen !== "game" || appState.winner) return;

  const point = getBoardPoint(event);
  if (!point) return;

  const { row, col } = point;
  if (appState.board[row][col]) {
    showToast("这里已有棋子");
    return;
  }

  if (appState.preview && appState.preview.row === row && appState.preview.col === col) {
    commitMove(row, col);
    return;
  }

  appState.preview = { row, col, player: appState.currentPlayer };
  render();
}

function getBoardPoint(event) {
  const geometry = appState.boardGeometry;
  if (!geometry) return null;

  const rect = elements.boardCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const col = Math.round((x - geometry.padding) / geometry.cell);
  const row = Math.round((y - geometry.padding) / geometry.cell);

  if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) return null;

  const pointX = geometry.padding + col * geometry.cell;
  const pointY = geometry.padding + row * geometry.cell;
  const distance = Math.hypot(x - pointX, y - pointY);
  if (distance > geometry.cell * 0.58) return null;

  return { row, col };
}

function commitMove(row, col) {
  const player = appState.currentPlayer;
  appState.board[row][col] = player;
  appState.moveHistory.push({ row, col, player });
  appState.preview = null;
  playStoneSound();

  const winningLine = findWinningLine(row, col, player);
  if (winningLine) {
    appState.winner = { player, line: winningLine };
    render();
    window.setTimeout(showResult, 420);
    return;
  }

  appState.currentPlayer = players[player].next;
  render();
}

function findWinningLine(row, col, player) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    const line = [{ row, col }];
    collectLine(line, row, col, dr, dc, player);
    collectLine(line, row, col, -dr, -dc, player);
    if (line.length >= 5) {
      return line.sort((a, b) => a.row - b.row || a.col - b.col);
    }
  }

  return null;
}

function collectLine(line, row, col, dr, dc, player) {
  let nextRow = row + dr;
  let nextCol = col + dc;

  while (
    nextRow >= 0 &&
    nextRow < boardSize &&
    nextCol >= 0 &&
    nextCol < boardSize &&
    appState.board[nextRow][nextCol] === player
  ) {
    line.push({ row: nextRow, col: nextCol });
    nextRow += dr;
    nextCol += dc;
  }
}

function undoMove() {
  if (!canUndo()) return;

  if (appState.preview) {
    appState.preview = null;
    render();
    return;
  }

  const lastMove = appState.moveHistory.pop();
  appState.board[lastMove.row][lastMove.col] = null;
  appState.undoLeft[lastMove.player] -= 1;
  appState.currentPlayer = lastMove.player;
  render();
}

function showResult() {
  if (!appState.winner) return;
  elements.resultTitle.textContent = `${players[appState.winner.player].name}获胜`;
  elements.resultMoves.textContent = `总步数 ${appState.moveHistory.length}`;
  showScreen("result");
}

function render() {
  updateInterface();
  drawBoard();
}

function resizeBoard() {
  const rect = elements.boardCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  elements.boardCanvas.width = Math.round(rect.width * dpr);
  elements.boardCanvas.height = Math.round(rect.height * dpr);
  canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoard();
}

function drawBoard() {
  const rect = elements.boardCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (!width || !height) return;

  const size = Math.min(width, height);
  const padding = Math.max(26, size * 0.055);
  const cell = (size - padding * 2) / (boardSize - 1);
  const stoneRadius = cell * 0.38;

  appState.boardGeometry = { size, padding, cell, stoneRadius };

  canvasContext.clearRect(0, 0, width, height);
  drawWoodSurface(size);
  drawBoardFrame(size, padding);
  drawGrid(padding, cell);
  drawStarPoints(padding, cell);
  drawPieces(padding, cell, stoneRadius);
  drawPreview(padding, cell, stoneRadius);
  drawWinningLine(padding, cell, stoneRadius);
}

function drawWoodSurface(size) {
  void size;
}

function drawBoardFrame(size, padding) {
  const inset = Math.max(8, padding * 0.42);
  const frameSize = size - inset * 2;

  canvasContext.save();
  canvasContext.strokeStyle = "rgba(83, 47, 21, 0.28)";
  canvasContext.lineWidth = Math.max(3, size * 0.005);
  canvasContext.strokeRect(inset, inset, frameSize, frameSize);

  canvasContext.strokeStyle = "rgba(255, 235, 194, 0.18)";
  canvasContext.lineWidth = 1;
  canvasContext.strokeRect(inset + 4, inset + 4, frameSize - 8, frameSize - 8);
  canvasContext.restore();
}

function drawGrid(padding, cell) {
  canvasContext.save();
  canvasContext.strokeStyle = "rgba(58, 31, 13, 0.82)";
  canvasContext.lineWidth = 1.4;
  canvasContext.lineCap = "round";

  for (let index = 0; index < boardSize; index += 1) {
    const offset = padding + index * cell;
    canvasContext.beginPath();
    canvasContext.moveTo(padding, offset);
    canvasContext.lineTo(padding + cell * (boardSize - 1), offset);
    canvasContext.stroke();

    canvasContext.beginPath();
    canvasContext.moveTo(offset, padding);
    canvasContext.lineTo(offset, padding + cell * (boardSize - 1));
    canvasContext.stroke();
  }

  canvasContext.lineWidth = 2.2;
  canvasContext.strokeRect(padding, padding, cell * (boardSize - 1), cell * (boardSize - 1));
  canvasContext.restore();
}

function drawStarPoints(padding, cell) {
  const points = [
    [3, 3],
    [3, 11],
    [7, 7],
    [11, 3],
    [11, 11],
  ];

  canvasContext.save();
  canvasContext.fillStyle = "rgba(55, 29, 13, 0.86)";
  points.forEach(([row, col]) => {
    canvasContext.beginPath();
    canvasContext.arc(padding + col * cell, padding + row * cell, Math.max(3, cell * 0.08), 0, Math.PI * 2);
    canvasContext.fill();
  });
  canvasContext.restore();
}

function drawPieces(padding, cell, radius) {
  appState.board.forEach((rowItems, row) => {
    rowItems.forEach((player, col) => {
      if (!player) return;
      const isLast = appState.moveHistory.at(-1)?.row === row && appState.moveHistory.at(-1)?.col === col;
      const isWinning = Boolean(appState.winner?.line.some((point) => point.row === row && point.col === col));
      drawStone(padding + col * cell, padding + row * cell, radius, player, { isLast, isWinning });
    });
  });
}

function drawPreview(padding, cell, radius) {
  if (!appState.preview || appState.winner) return;
  const { row, col, player } = appState.preview;
  canvasContext.save();
  canvasContext.globalAlpha = 0.48;
  drawStone(padding + col * cell, padding + row * cell, radius, player, { isPreview: true });
  canvasContext.restore();

  canvasContext.save();
  canvasContext.strokeStyle = player === "black" ? "rgba(255, 246, 226, 0.9)" : "rgba(42, 27, 16, 0.65)";
  canvasContext.lineWidth = 3;
  canvasContext.beginPath();
  canvasContext.arc(padding + col * cell, padding + row * cell, radius + 6, 0, Math.PI * 2);
  canvasContext.stroke();
  canvasContext.restore();
}

function drawWinningLine(padding, cell, radius) {
  if (!appState.winner) return;

  appState.winner.line.forEach(({ row, col }) => {
    canvasContext.save();
    canvasContext.strokeStyle = "#f7d36f";
    canvasContext.lineWidth = Math.max(3, radius * 0.18);
    canvasContext.beginPath();
    canvasContext.arc(padding + col * cell, padding + row * cell, radius + 5, 0, Math.PI * 2);
    canvasContext.stroke();
    canvasContext.restore();
  });
}

function drawStone(x, y, radius, player, options = {}) {
  canvasContext.save();
  canvasContext.shadowColor = "rgba(38, 21, 10, 0.32)";
  canvasContext.shadowBlur = options.isPreview ? 3 : 10;
  canvasContext.shadowOffsetY = options.isPreview ? 2 : 5;

  const gradient = canvasContext.createRadialGradient(x - radius * 0.35, y - radius * 0.38, radius * 0.08, x, y, radius);
  if (player === "black") {
    gradient.addColorStop(0, "#6c6259");
    gradient.addColorStop(0.18, "#2c2926");
    gradient.addColorStop(1, "#070606");
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.55, "#efe8d9");
    gradient.addColorStop(1, "#bfb4a2");
  }

  canvasContext.fillStyle = gradient;
  canvasContext.beginPath();
  canvasContext.arc(x, y, radius, 0, Math.PI * 2);
  canvasContext.fill();
  canvasContext.restore();

  if (options.isLast && !appState.winner) {
    canvasContext.save();
    canvasContext.fillStyle = player === "black" ? "#efe2c2" : "#332316";
    canvasContext.beginPath();
    canvasContext.arc(x, y, Math.max(3, radius * 0.16), 0, Math.PI * 2);
    canvasContext.fill();
    canvasContext.restore();
  }
}

function playStoneSound() {
  if (!appState.soundEnabled) return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!appState.audioContext) appState.audioContext = new AudioContext();

  const context = appState.audioContext;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(540, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(180, context.currentTime + 0.08);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

function showToast(message) {
  window.clearTimeout(appState.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  appState.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1200);
}

elements.startGameButton.addEventListener("click", startGame);
elements.playAgainButton.addEventListener("click", startGame);
elements.homeSettingsButton.addEventListener("click", openSettings);
elements.gameSettingsButton.addEventListener("click", openSettings);
elements.closeSettingsButton.addEventListener("click", closeSettings);
elements.settingsSheet.addEventListener("click", (event) => {
  if (event.target === elements.settingsSheet) closeSettings();
});
elements.soundToggle.addEventListener("change", () => {
  appState.soundEnabled = elements.soundToggle.checked;
});
elements.undoButton.addEventListener("click", undoMove);
elements.restartButton.addEventListener("click", startGame);
elements.backHomeButton.addEventListener("click", returnHome);
elements.resultHomeButton.addEventListener("click", returnHome);
elements.boardCanvas.addEventListener("pointerdown", handleBoardPointer, { passive: false });

document.addEventListener("touchmove", (event) => {
  event.preventDefault();
}, { passive: false });

document.addEventListener("touchend", (event) => {
  const now = Date.now();
  if (now - appState.lastTouchEnd < 420) {
    event.preventDefault();
  }
  appState.lastTouchEnd = now;
}, { passive: false });

document.addEventListener("gesturestart", (event) => {
  event.preventDefault();
}, { passive: false });

window.addEventListener("scroll", () => {
  if (window.scrollX || window.scrollY) {
    window.scrollTo(0, 0);
  }
}, { passive: true });

const resizeObserver = new ResizeObserver(resizeBoard);
resizeObserver.observe(elements.boardCanvas);

window.addEventListener("resize", syncViewportSize);
window.addEventListener("orientationchange", () => {
  window.setTimeout(syncViewportSize, 120);
  window.setTimeout(syncViewportSize, 420);
});
window.visualViewport?.addEventListener("resize", syncViewportSize);
window.visualViewport?.addEventListener("scroll", syncViewportSize);

syncViewportSize();
showScreen("home");
render();
