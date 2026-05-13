const BOARD_SIZE = 5;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const assetUrl = (path) => new URL(path, document.baseURI).href;
const ASSETS = {
  slash: assetUrl("assets/mirror-slash.svg"),
  backslash: assetUrl("assets/mirror-backslash.svg"),
  turn: assetUrl("assets/prism-turn.svg"),
  enemy: assetUrl("assets/enemy.svg"),
  emitter: assetUrl("assets/emitter.svg"),
};

const PIECE_ORDER = ["empty", "slash", "backslash", "turn"];
const PIECE_META = {
  empty: { label: "消去", countLabel: "FREE" },
  slash: { label: "右上反射" },
  backslash: { label: "左上反射" },
  turn: { label: "時計回り屈折" },
};
const LASER_SHIFT_MIN_SECONDS = 20;
const LASER_SHIFT_MAX_SECONDS = 35;
const PIECE_DROP_CHANCE = 0.36;

const DIR_DELTA = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

const REFLECT = {
  slash: {
    up: "right",
    right: "up",
    down: "left",
    left: "down",
  },
  backslash: {
    up: "left",
    left: "up",
    down: "right",
    right: "down",
  },
  turn: {
    up: "right",
    right: "down",
    down: "left",
    left: "up",
  },
};

const UPGRADE_POOL = [
  {
    id: "damage",
    icon: "ATK",
    name: "高出力レンズ",
    detail: "レーザー威力 +25%",
    apply: (state) => {
      state.stats.damage *= 1.25;
    },
  },
  {
    id: "shield",
    icon: "HP",
    name: "予備コア",
    detail: "耐久値 +1",
    apply: (state) => {
      state.hp += 1;
    },
  },
  {
    id: "slow",
    icon: "SPD",
    name: "粘性フィールド",
    detail: "敵の降下速度 -8%",
    apply: (state) => {
      state.stats.enemySpeedFactor *= 0.92;
    },
  },
  {
    id: "score",
    icon: "PTS",
    name: "解析報酬",
    detail: "撃破スコア +20%",
    apply: (state) => {
      state.stats.scoreFactor *= 1.2;
    },
  },
  {
    id: "pierce",
    icon: "PEN",
    name: "連鎖照射",
    detail: "同じ列の次の敵にも 35% ダメージ",
    apply: (state) => {
      state.stats.pierce += 1;
    },
  },
];

const elements = {
  shell: document.getElementById("gameShell"),
  playArea: document.getElementById("playArea"),
  field: document.getElementById("field"),
  board: document.getElementById("board"),
  emitterRow: document.getElementById("emitterRow"),
  enemyLayer: document.getElementById("enemyLayer"),
  laserSvg: document.getElementById("laserSvg"),
  laserLine: document.getElementById("laserLine"),
  pieceBag: document.getElementById("pieceBag"),
  pauseButton: document.getElementById("pauseButton"),
  upgradeOverlay: document.getElementById("upgradeOverlay"),
  upgradeOptions: document.getElementById("upgradeOptions"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  restartButton: document.getElementById("restartButton"),
  resultText: document.getElementById("resultText"),
  waveText: document.getElementById("waveText"),
  scoreText: document.getElementById("scoreText"),
  hpText: document.getElementById("hpText"),
  laserTimerText: document.getElementById("laserTimerText"),
};

const state = {
  board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("empty")),
  cells: [],
  emitters: [],
  enemies: [],
  bag: createInitialBag(),
  dragging: null,
  laserColumn: 2,
  activeColumn: 2,
  laserShiftTimer: randomLaserInterval(),
  wave: 1,
  score: 0,
  hp: 5,
  running: true,
  paused: false,
  upgradeOpen: false,
  gameOver: false,
  lastTime: performance.now(),
  enemyId: 0,
  spawnTimer: 0,
  spawnedThisWave: 0,
  waveSize: 8,
  hitEnemyId: null,
  stats: {
    damage: 2.8,
    enemySpeedFactor: 1,
    scoreFactor: 1,
    pierce: 0,
  },
};

function setup() {
  buildBoard();
  buildEmitters();
  bindControls();
  updateHud();
  renderBoard();
  renderEmitters();
  renderPieceBag();
  requestAnimationFrame(loop);
}

function buildBoard() {
  elements.board.innerHTML = "";
  state.cells = [];

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const y = Math.floor(index / BOARD_SIZE);
    const x = index % BOARD_SIZE;
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    cell.dataset.x = String(x);
    cell.dataset.y = String(y);
    cell.setAttribute("aria-label", `セル ${x + 1}, ${y + 1}`);
    elements.board.appendChild(cell);
    state.cells.push(cell);
  }
}

function buildEmitters() {
  elements.emitterRow.innerHTML = "";
  state.emitters = [];

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    const emitter = document.createElement("button");
    emitter.className = "emitter";
    emitter.type = "button";
    emitter.setAttribute("aria-label", `射出口 ${x + 1}`);
    emitter.innerHTML = `<img src="${ASSETS.emitter}" alt="">`;
    elements.emitterRow.appendChild(emitter);
    state.emitters.push(emitter);
  }
}

function bindControls() {
  elements.pauseButton.addEventListener("click", () => {
    if (state.upgradeOpen || state.gameOver) return;
    state.paused = !state.paused;
    elements.pauseButton.textContent = state.paused ? "RESUME" : "PAUSE";
  });

  elements.restartButton.addEventListener("click", resetGame);

  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", handleDragEnd);
  window.addEventListener("pointercancel", handleDragCancel);
  window.addEventListener("resize", drawLaser);
}

function renderPieceBag() {
  elements.pieceBag.innerHTML = "";

  for (const piece of PIECE_ORDER) {
    const count = state.bag[piece] ?? 0;
    const depleted = piece !== "empty" && count <= 0;
    const button = document.createElement("button");
    button.className = `bag-piece${piece === "empty" ? " is-empty-tool" : ""}${depleted ? " is-depleted" : ""}`;
    button.type = "button";
    button.dataset.piece = piece;
    button.setAttribute("aria-label", `${PIECE_META[piece].label}ピース`);
    button.setAttribute("aria-disabled", depleted ? "true" : "false");
    button.innerHTML = `
      ${getPieceIcon(piece)}
      <span class="piece-count">${piece === "empty" ? PIECE_META.empty.countLabel : count}</span>
    `;
    button.addEventListener("pointerdown", (event) => startPieceDrag(event, piece));
    elements.pieceBag.appendChild(button);
  }
}

function startPieceDrag(event, piece) {
  if (state.upgradeOpen || state.gameOver || !canUsePiece(piece)) return;

  event.preventDefault();
  clearDragState();

  state.dragging = {
    piece,
    pointerId: event.pointerId,
    ghost: createDragGhost(piece),
    targetCell: null,
  };

  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // ブラウザ差異で capture に失敗しても、window 側の pointermove で追跡します。
  }

  document.body.appendChild(state.dragging.ghost);
  moveDragGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientX, event.clientY);
}

function handleDragMove(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  event.preventDefault();
  moveDragGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientX, event.clientY);
}

function handleDragEnd(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  event.preventDefault();

  const cell = getCellAtPoint(event.clientX, event.clientY);
  if (cell) {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    placePieceFromBag(state.dragging.piece, x, y);
  }

  clearDragState();
}

function handleDragCancel(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  clearDragState();
}

function placePieceFromBag(piece, x, y) {
  const oldPiece = state.board[y][x];
  if (oldPiece === piece) return;

  if (piece === "empty") {
    if (oldPiece !== "empty") {
      addPieceToBag(oldPiece, 1);
      state.board[y][x] = "empty";
    }
  } else {
    if (!canUsePiece(piece)) return;
    state.bag[piece] -= 1;
    if (oldPiece !== "empty") {
      addPieceToBag(oldPiece, 1);
    }
    state.board[y][x] = piece;
  }

  renderBoard();
  renderPieceBag();
  drawLaser();
}

function canUsePiece(piece) {
  return piece === "empty" || (state.bag[piece] ?? 0) > 0;
}

function addPieceToBag(piece, amount) {
  if (!state.bag[piece]) {
    state.bag[piece] = 0;
  }
  state.bag[piece] += amount;
}

function createDragGhost(piece) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.innerHTML = getPieceIcon(piece);
  return ghost;
}

function getPieceIcon(piece) {
  if (piece === "empty") {
    return '<span class="empty-icon"></span>';
  }
  return `<img src="${ASSETS[piece]}" alt="">`;
}

function moveDragGhost(x, y) {
  state.dragging.ghost.style.left = `${x}px`;
  state.dragging.ghost.style.top = `${y}px`;
}

function updateDropTarget(x, y) {
  const cell = getCellAtPoint(x, y);
  if (state.dragging.targetCell === cell) return;

  if (state.dragging.targetCell) {
    state.dragging.targetCell.classList.remove("is-drop-target");
  }

  state.dragging.targetCell = cell;

  if (cell) {
    cell.classList.add("is-drop-target");
  }
}

function getCellAtPoint(x, y) {
  const node = document.elementFromPoint(x, y);
  if (!node) return null;
  return node.closest(".cell");
}

function clearDragState() {
  if (!state.dragging) return;

  if (state.dragging.targetCell) {
    state.dragging.targetCell.classList.remove("is-drop-target");
  }

  if (state.dragging.ghost) {
    state.dragging.ghost.remove();
  }

  state.dragging = null;
}

function renderBoard() {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = state.cells[y * BOARD_SIZE + x];
      const block = state.board[y][x];
      cell.innerHTML = block === "empty" ? "" : `<img src="${ASSETS[block]}" alt="">`;
    }
  }
}

function renderEmitters() {
  state.emitters.forEach((emitter, index) => {
    emitter.classList.toggle("is-active", index === state.laserColumn);
  });
}

function loop(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;

  if (state.running && !state.paused && !state.upgradeOpen && !state.gameOver) {
    updateGame(dt);
  }

  drawLaser();
  renderEnemies();
  requestAnimationFrame(loop);
}

function updateGame(dt) {
  spawnEnemies(dt);
  moveEnemies(dt);
  updateLaserShift(dt);
  damageEnemies(dt);
  resolveWave();
  updateHud();
}

function updateLaserShift(dt) {
  state.laserShiftTimer -= dt;
  if (state.laserShiftTimer > 0) return;

  state.laserColumn = pickNextLaserColumn();
  state.laserShiftTimer = randomLaserInterval();
  renderEmitters();
  drawLaser();
}

function spawnEnemies(dt) {
  if (state.spawnedThisWave >= state.waveSize) return;

  const spawnInterval = Math.max(0.42, 1.15 - state.wave * 0.035);
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  const lane = Math.floor(Math.random() * BOARD_SIZE);
  const baseHp = 4 + state.wave * 0.8;
  state.enemies.push({
    id: state.enemyId,
    lane,
    y: -8,
    hp: baseHp,
    maxHp: baseHp,
    speed: (13 + state.wave * 0.8) * state.stats.enemySpeedFactor,
  });

  state.enemyId += 1;
  state.spawnedThisWave += 1;
  state.spawnTimer = spawnInterval;
}

function moveEnemies(dt) {
  for (const enemy of state.enemies) {
    enemy.y += enemy.speed * dt;
  }

  const survivors = [];
  for (const enemy of state.enemies) {
    if (enemy.y >= 101) {
      state.hp -= 1;
      continue;
    }
    survivors.push(enemy);
  }
  state.enemies = survivors;

  if (state.hp <= 0) {
    endGame();
  }
}

function damageEnemies(dt) {
  const trace = traceLaser();
  state.activeColumn = trace.activeColumn;
  state.hitEnemyId = null;

  if (state.activeColumn === null) return;

  const laneEnemies = state.enemies
    .filter((enemy) => enemy.lane === state.activeColumn)
    .sort((a, b) => b.y - a.y);

  if (laneEnemies.length === 0) return;

  const primary = laneEnemies[0];
  primary.hp -= state.stats.damage * dt;
  state.hitEnemyId = primary.id;

  for (let index = 1; index <= state.stats.pierce && index < laneEnemies.length; index += 1) {
    laneEnemies[index].hp -= state.stats.damage * dt * 0.35;
  }

  const defeated = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (defeated.length === 0) return;

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  state.score += Math.round(defeated.length * 100 * state.wave * state.stats.scoreFactor);
  grantPieceRewards(defeated.length);
}

function grantPieceRewards(defeatedCount) {
  let gained = false;

  for (let i = 0; i < defeatedCount; i += 1) {
    if (Math.random() > PIECE_DROP_CHANCE) continue;
    const piece = PIECE_ORDER[1 + Math.floor(Math.random() * (PIECE_ORDER.length - 1))];
    addPieceToBag(piece, 1);
    gained = true;
  }

  if (gained) {
    renderPieceBag();
  }
}

function resolveWave() {
  if (state.spawnedThisWave < state.waveSize || state.enemies.length > 0 || state.gameOver) {
    return;
  }
  openUpgrade();
}

function traceLaser() {
  let x = state.laserColumn;
  let y = BOARD_SIZE - 1;
  let direction = "up";
  let activeColumn = null;
  const cells = [];
  const visited = new Set();
  let exitDirection = direction;

  for (let step = 0; step < 36; step += 1) {
    if (!isInsideBoard(x, y)) {
      if (y < 0 && direction === "up") {
        activeColumn = x;
      }
      break;
    }

    const visitKey = `${x}:${y}:${direction}`;
    if (visited.has(visitKey)) break;
    visited.add(visitKey);
    cells.push({ x, y, direction });

    const block = state.board[y][x];
    if (block !== "empty") {
      direction = REFLECT[block][direction];
    }
    cells[cells.length - 1].exitDirection = direction;
    exitDirection = direction;

    x += DIR_DELTA[direction].dx;
    y += DIR_DELTA[direction].dy;
  }

  return { cells, activeColumn, exitDirection };
}

function isInsideBoard(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function drawLaser() {
  const playRect = elements.playArea.getBoundingClientRect();
  const boardRect = elements.board.getBoundingClientRect();
  const fieldRect = elements.field.getBoundingClientRect();
  if (!playRect.width || !boardRect.width) return;

  elements.laserSvg.setAttribute("viewBox", `0 0 ${playRect.width} ${playRect.height}`);

  const trace = traceLaser();
  state.activeColumn = trace.activeColumn;

  const cellW = boardRect.width / BOARD_SIZE;
  const cellH = boardRect.height / BOARD_SIZE;
  const boardLeft = boardRect.left - playRect.left;
  const boardTop = boardRect.top - playRect.top;
  const boardBottom = boardRect.bottom - playRect.top;
  const fieldTop = fieldRect.top - playRect.top;
  const points = [];

  points.push({
    x: boardLeft + (state.laserColumn + 0.5) * cellW,
    y: boardBottom + 12,
  });

  for (const point of trace.cells) {
    points.push({
      x: boardLeft + (point.x + 0.5) * cellW,
      y: boardTop + (point.y + 0.5) * cellH,
    });
  }

  if (trace.activeColumn !== null) {
    const x = boardLeft + (trace.activeColumn + 0.5) * cellW;
    points.push({ x, y: boardTop - 6 });
    points.push({ x, y: fieldTop + 8 });
  } else if (trace.cells.length > 0) {
    const last = trace.cells[trace.cells.length - 1];
    const exit = exitPointFromLastCell(last, trace.exitDirection, boardLeft, boardTop, cellW, cellH);
    points.push(exit);
  }

  elements.laserLine.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
}

function exitPointFromLastCell(last, direction, boardLeft, boardTop, cellW, cellH) {
  const centerX = boardLeft + (last.x + 0.5) * cellW;
  const centerY = boardTop + (last.y + 0.5) * cellH;
  const margin = 8;

  if (direction === "left") return { x: centerX - cellW * 0.58 - margin, y: centerY };
  if (direction === "right") return { x: centerX + cellW * 0.58 + margin, y: centerY };
  if (direction === "down") return { x: centerX, y: centerY + cellH * 0.58 + margin };
  return { x: centerX, y: centerY - cellH * 0.58 - margin };
}

function renderEnemies() {
  const fieldRect = elements.field.getBoundingClientRect();
  const laneWidth = fieldRect.width / BOARD_SIZE || 1;
  const html = state.enemies
    .map((enemy) => {
      const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
      const left = laneWidth * (enemy.lane + 0.5);
      const hitClass = enemy.id === state.hitEnemyId ? " is-hit" : "";
      return `
        <div class="enemy${hitClass}" style="left:${left}px; top:${enemy.y}%">
          <img src="${ASSETS.enemy}" alt="">
          <div class="hp-bar"><span style="width:${hpRatio * 100}%"></span></div>
        </div>
      `;
    })
    .join("");

  elements.enemyLayer.innerHTML = html;
}

function openUpgrade() {
  state.upgradeOpen = true;
  elements.upgradeOptions.innerHTML = "";

  const options = shuffle([...UPGRADE_POOL]).slice(0, 3);
  for (const upgrade of options) {
    const button = document.createElement("button");
    button.className = "upgrade-card";
    button.type = "button";
    button.innerHTML = `
      <span class="upgrade-icon">${upgrade.icon}</span>
      <span>
        <strong>${upgrade.name}</strong>
        <span>${upgrade.detail}</span>
      </span>
    `;
    button.addEventListener("click", () => {
      upgrade.apply(state);
      startNextWave();
    });
    elements.upgradeOptions.appendChild(button);
  }

  elements.upgradeOverlay.classList.remove("is-hidden");
}

function startNextWave() {
  state.wave += 1;
  state.spawnedThisWave = 0;
  state.waveSize = 8 + state.wave * 3;
  state.spawnTimer = 0.45;
  state.upgradeOpen = false;
  elements.upgradeOverlay.classList.add("is-hidden");
  updateHud();
}

function endGame() {
  state.gameOver = true;
  state.running = false;
  state.hp = 0;
  elements.resultText.textContent = `WAVE ${state.wave} / SCORE ${state.score}`;
  elements.gameOverOverlay.classList.remove("is-hidden");
  updateHud();
}

function resetGame() {
  state.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("empty"));
  state.bag = createInitialBag();
  clearDragState();
  state.enemies = [];
  state.laserColumn = 2;
  state.activeColumn = 2;
  state.laserShiftTimer = randomLaserInterval();
  state.wave = 1;
  state.score = 0;
  state.hp = 5;
  state.running = true;
  state.paused = false;
  state.upgradeOpen = false;
  state.gameOver = false;
  state.enemyId = 0;
  state.spawnTimer = 0;
  state.spawnedThisWave = 0;
  state.waveSize = 8;
  state.hitEnemyId = null;
  state.stats = {
    damage: 2.8,
    enemySpeedFactor: 1,
    scoreFactor: 1,
    pierce: 0,
  };

  elements.pauseButton.textContent = "PAUSE";
  elements.upgradeOverlay.classList.add("is-hidden");
  elements.gameOverOverlay.classList.add("is-hidden");

  renderBoard();
  renderEmitters();
  renderPieceBag();
  updateHud();
}

function updateHud() {
  elements.waveText.textContent = String(state.wave);
  elements.scoreText.textContent = String(state.score);
  elements.hpText.textContent = String(Math.max(0, state.hp));
  elements.laserTimerText.textContent = `${Math.ceil(Math.max(0, state.laserShiftTimer))}s`;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createInitialBag() {
  return {
    slash: 3,
    backslash: 3,
    turn: 2,
  };
}

function randomLaserInterval() {
  return LASER_SHIFT_MIN_SECONDS + Math.random() * (LASER_SHIFT_MAX_SECONDS - LASER_SHIFT_MIN_SECONDS);
}

function pickNextLaserColumn() {
  if (BOARD_SIZE <= 1) return 0;

  let next = state.laserColumn;
  while (next === state.laserColumn) {
    next = Math.floor(Math.random() * BOARD_SIZE);
  }
  return next;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup, { once: true });
} else {
  setup();
}
