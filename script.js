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
  empty: { label: "消去", countLabel: "無限" },
  slash: { label: "右上反射" },
  backslash: { label: "左上反射" },
  turn: { label: "時計回り屈折" },
};
const LASER_SHIFT_MIN_SECONDS = 20;
const LASER_SHIFT_MAX_SECONDS = 35;
const PIECE_DROP_CHANCE = 0.36;
const INITIAL_HEALTH = 100;
const BASE_STAGE_ENEMY_COUNT = 8;
const ENEMIES_PER_STAGE = 3;
const BASE_SPAWN_INTERVAL = 1.15;
const MIN_SPAWN_INTERVAL = 0.38;

const SCREENS = {
  START: "start",
  PLAY: "play",
  LEVEL_UP: "levelup",
  RESULT: "result",
};

const SCREEN_LABELS = {
  [SCREENS.START]: "スタート",
  [SCREENS.PLAY]: "プレイ",
  [SCREENS.LEVEL_UP]: "レベルアップ",
  [SCREENS.RESULT]: "リザルト",
};

const ENEMY_DATA_FILES = [
  "data/enemies/basic.json",
  "data/enemies/fast.json",
  "data/enemies/tank.json",
];

const ENEMY_FALLBACK = [
  {
    id: "basic",
    name: "侵入体",
    asset: "assets/enemy.svg",
    baseSpeed: 13,
    baseHealth: 4.8,
    healthPerLevel: 0.9,
    baseAttack: 8,
    attackPerLevel: 1.1,
    speedPerLevel: 0.18,
    score: 100,
    spawnWeight: 70,
    minStage: 1,
  },
  {
    id: "fast",
    name: "突撃体",
    asset: "assets/enemy.svg",
    baseSpeed: 18,
    baseHealth: 3.6,
    healthPerLevel: 0.65,
    baseAttack: 6,
    attackPerLevel: 0.85,
    speedPerLevel: 0.24,
    score: 120,
    spawnWeight: 26,
    minStage: 2,
  },
  {
    id: "tank",
    name: "重装体",
    asset: "assets/enemy.svg",
    baseSpeed: 8,
    baseHealth: 9,
    healthPerLevel: 1.8,
    baseAttack: 18,
    attackPerLevel: 2.2,
    speedPerLevel: 0.08,
    score: 180,
    spawnWeight: 14,
    minStage: 3,
  },
];

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
    icon: "攻",
    name: "高出力レンズ",
    detail: "レーザー威力 +25%",
    apply: (state) => {
      state.stats.damage *= 1.25;
    },
  },
  {
    id: "shield",
    icon: "体",
    name: "防壁補強",
    detail: "最大体力 +15、体力 +15",
    apply: (state) => {
      state.maxHealth += 15;
      state.health = Math.min(state.maxHealth, state.health + 15);
    },
  },
  {
    id: "slow",
    icon: "遅",
    name: "粘性フィールド",
    detail: "敵の降下速度 -8%",
    apply: (state) => {
      state.stats.enemySpeedFactor *= 0.92;
    },
  },
  {
    id: "score",
    icon: "点",
    name: "解析報酬",
    detail: "撃破スコア +20%",
    apply: (state) => {
      state.stats.scoreFactor *= 1.2;
    },
  },
  {
    id: "pierce",
    icon: "貫",
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
  stagePlanText: document.getElementById("stagePlanText"),
  board: document.getElementById("board"),
  emitterRow: document.getElementById("emitterRow"),
  enemyLayer: document.getElementById("enemyLayer"),
  laserSvg: document.getElementById("laserSvg"),
  laserLine: document.getElementById("laserLine"),
  pieceBag: document.getElementById("pieceBag"),
  pauseButton: document.getElementById("pauseButton"),
  startOverlay: document.getElementById("startOverlay"),
  startButton: document.getElementById("startButton"),
  upgradeOverlay: document.getElementById("upgradeOverlay"),
  upgradeOptions: document.getElementById("upgradeOptions"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  restartButton: document.getElementById("restartButton"),
  resultText: document.getElementById("resultText"),
  screenText: document.getElementById("screenText"),
  stageText: document.getElementById("stageText"),
  scoreText: document.getElementById("scoreText"),
  healthText: document.getElementById("healthText"),
  laserTimerText: document.getElementById("laserTimerText"),
};

const state = {
  screen: SCREENS.START,
  board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("empty")),
  cells: [],
  emitters: [],
  enemies: [],
  enemyCatalog: ENEMY_FALLBACK.map(normalizeEnemyDef),
  bag: createInitialBag(),
  dragging: null,
  laserColumn: 2,
  activeColumn: 2,
  laserShiftTimer: randomLaserInterval(),
  stage: 1,
  stagePlan: null,
  spawnQueue: [],
  score: 0,
  health: INITIAL_HEALTH,
  maxHealth: INITIAL_HEALTH,
  paused: false,
  lastTime: performance.now(),
  enemyId: 0,
  spawnTimer: 0,
  spawnedThisStage: 0,
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
  setScreen(SCREENS.START);
  updateHud();
  renderBoard();
  renderEmitters();
  renderPieceBag();
  requestAnimationFrame(loop);
  loadEnemyCatalog().then((catalog) => {
    state.enemyCatalog = catalog;
  });
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
  elements.startButton.addEventListener("click", startGame);

  elements.pauseButton.addEventListener("click", () => {
    if (state.screen !== SCREENS.PLAY) return;
    state.paused = !state.paused;
    elements.pauseButton.textContent = state.paused ? "再開" : "一時停止";
  });

  elements.restartButton.addEventListener("click", startGame);

  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", handleDragEnd);
  window.addEventListener("pointercancel", handleDragCancel);
  window.addEventListener("resize", drawLaser);
}

function setScreen(nextScreen) {
  state.screen = nextScreen;
  elements.shell.dataset.screen = nextScreen;
  elements.screenText.textContent = SCREEN_LABELS[nextScreen];
  elements.startOverlay.classList.toggle("is-hidden", nextScreen !== SCREENS.START);
  elements.upgradeOverlay.classList.toggle("is-hidden", nextScreen !== SCREENS.LEVEL_UP);
  elements.gameOverOverlay.classList.toggle("is-hidden", nextScreen !== SCREENS.RESULT);
}

function startGame() {
  resetGameState();
  beginStage(1);
  setScreen(SCREENS.PLAY);
  updateHud();
  drawLaser();
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
  if (state.screen !== SCREENS.PLAY || state.paused || !canUsePiece(piece)) return;

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

  if (state.screen === SCREENS.PLAY && !state.paused) {
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
  resolveStage();
  updateHud();
}

function beginStage(stageNumber) {
  state.stage = stageNumber;
  state.stagePlan = createStagePlan(stageNumber);
  state.spawnQueue = createSpawnQueue(state.stagePlan);
  state.spawnedThisStage = 0;
  state.spawnTimer = 0.45;
  updateStagePlanView();
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
  if (state.spawnQueue.length === 0) return;

  const spawnInterval = Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - state.stage * 0.035);
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  const lane = Math.floor(Math.random() * BOARD_SIZE);
  const enemyDef = findEnemyDefinition(state.spawnQueue.shift());
  const enemyStats = calculateEnemyStats(enemyDef, state.stagePlan.level);
  state.enemies.push({
    id: state.enemyId,
    type: enemyDef.id,
    name: enemyDef.name,
    asset: enemyDef.asset,
    lane,
    y: -8,
    hp: enemyStats.health,
    maxHp: enemyStats.health,
    speed: enemyStats.speed,
    attack: enemyStats.attack,
    score: enemyDef.score,
    level: state.stagePlan.level,
  });

  state.enemyId += 1;
  state.spawnedThisStage += 1;
  state.spawnTimer = spawnInterval;
}

function moveEnemies(dt) {
  for (const enemy of state.enemies) {
    enemy.y += enemy.speed * dt;
  }

  const survivors = [];
  for (const enemy of state.enemies) {
    if (enemy.y >= 101) {
      state.health = Math.max(0, state.health - enemy.attack);
      continue;
    }
    survivors.push(enemy);
  }
  state.enemies = survivors;

  if (state.health <= 0) {
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
  const defeatedScore = defeated.reduce((total, enemy) => total + enemy.score, 0);
  state.score += Math.round(defeatedScore * state.stage * state.stats.scoreFactor);
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

function resolveStage() {
  if (state.spawnQueue.length > 0 || state.enemies.length > 0 || state.screen !== SCREENS.PLAY) {
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
        <div class="enemy${hitClass}" style="left:${left}px; top:${enemy.y}%" title="${enemy.name} 攻撃力:${enemy.attack}">
          <img src="${enemy.asset}" alt="">
          <div class="hp-bar"><span style="width:${hpRatio * 100}%"></span></div>
        </div>
      `;
    })
    .join("");

  elements.enemyLayer.innerHTML = html;
}

function openUpgrade() {
  setScreen(SCREENS.LEVEL_UP);
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
      startNextStage();
    });
    elements.upgradeOptions.appendChild(button);
  }

  updateHud();
}

function startNextStage() {
  beginStage(state.stage + 1);
  setScreen(SCREENS.PLAY);
  updateHud();
}

function endGame() {
  state.health = 0;
  elements.resultText.textContent = `到達面: ${state.stage} / 得点: ${state.score}`;
  setScreen(SCREENS.RESULT);
  updateHud();
}

function resetGameState() {
  state.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("empty"));
  state.bag = createInitialBag();
  clearDragState();
  state.enemies = [];
  state.laserColumn = 2;
  state.activeColumn = 2;
  state.laserShiftTimer = randomLaserInterval();
  state.stage = 1;
  state.stagePlan = null;
  state.spawnQueue = [];
  state.score = 0;
  state.health = INITIAL_HEALTH;
  state.maxHealth = INITIAL_HEALTH;
  state.paused = false;
  state.enemyId = 0;
  state.spawnTimer = 0;
  state.spawnedThisStage = 0;
  state.hitEnemyId = null;
  state.stats = {
    damage: 2.8,
    enemySpeedFactor: 1,
    scoreFactor: 1,
    pierce: 0,
  };

  elements.pauseButton.textContent = "一時停止";

  renderBoard();
  renderEmitters();
  renderPieceBag();
  updateStagePlanView();
  updateHud();
}

function updateHud() {
  elements.stageText.textContent = String(state.stage);
  elements.scoreText.textContent = String(state.score);
  elements.healthText.textContent = `${Math.ceil(Math.max(0, state.health))}/${state.maxHealth}`;
  elements.laserTimerText.textContent = `${Math.ceil(Math.max(0, state.laserShiftTimer))}s`;
}

function updateStagePlanView() {
  if (!state.stagePlan) {
    elements.stagePlanText.textContent = "出現予定: --";
    return;
  }

  const enemySummary = state.stagePlan.enemies
    .map((entry) => `${findEnemyDefinition(entry.enemyId).name} x${entry.count}`)
    .join(" / ");
  elements.stagePlanText.textContent = `第${state.stagePlan.stageNumber}面 出現予定: ${enemySummary}`;
}

async function loadEnemyCatalog() {
  if (window.location.protocol === "file:") {
    return ENEMY_FALLBACK.map(normalizeEnemyDef);
  }

  try {
    const catalogResponse = await fetch(assetUrl("data/enemies/catalog.json"), { cache: "no-store" });
    if (!catalogResponse.ok) throw new Error(`catalog ${catalogResponse.status}`);

    const catalog = await catalogResponse.json();
    const files = Array.isArray(catalog.files) ? catalog.files : ENEMY_DATA_FILES;
    const definitions = await Promise.all(
      files.map(async (file) => {
        const response = await fetch(assetUrl(file), { cache: "no-store" });
        if (!response.ok) throw new Error(`${file} ${response.status}`);
        return response.json();
      }),
    );

    return definitions.map(normalizeEnemyDef);
  } catch (error) {
    console.warn("敵JSONの読み込みに失敗したため、内蔵定義で起動します。", error);
    return ENEMY_FALLBACK.map(normalizeEnemyDef);
  }
}

function normalizeEnemyDef(definition) {
  return {
    id: String(definition.id ?? "unknown"),
    name: String(definition.name ?? "敵"),
    asset: assetUrl(definition.asset ?? "assets/enemy.svg"),
    speed: Number(definition.baseSpeed ?? definition.speed ?? 12),
    speedPerLevel: Number(definition.speedPerLevel ?? 0),
    health: Number(definition.baseHealth ?? definition.health ?? 4),
    healthPerLevel: Number(definition.healthPerLevel ?? 0),
    attack: Number(definition.baseAttack ?? definition.attack ?? 8),
    attackPerLevel: Number(definition.attackPerLevel ?? 0),
    score: Number(definition.score ?? 100),
    spawnWeight: Number(definition.spawnWeight ?? 10),
    minStage: Number(definition.minStage ?? definition.minWave ?? 1),
  };
}

function createStagePlan(stageNumber) {
  const candidates = state.enemyCatalog.filter((enemy) => enemy.minStage <= stageNumber);
  const pool = candidates.length > 0 ? candidates : state.enemyCatalog;
  const totalCount = BASE_STAGE_ENEMY_COUNT + (stageNumber - 1) * ENEMIES_PER_STAGE;
  const countMap = new Map();

  for (let i = 0; i < totalCount; i += 1) {
    const enemy = pickWeightedEnemy(pool);
    countMap.set(enemy.id, (countMap.get(enemy.id) ?? 0) + 1);
  }

  return {
    stageNumber,
    level: stageNumber,
    totalCount,
    enemies: Array.from(countMap, ([enemyId, count]) => ({ enemyId, count })),
  };
}

function createSpawnQueue(stagePlan) {
  const queue = [];
  for (const entry of stagePlan.enemies) {
    for (let i = 0; i < entry.count; i += 1) {
      queue.push(entry.enemyId);
    }
  }
  return shuffle(queue);
}

function calculateEnemyStats(enemyDef, level) {
  const adjustmentLevel = Math.max(0, level - 1);

  return {
    health: enemyDef.health + enemyDef.healthPerLevel * adjustmentLevel,
    attack: Math.round(enemyDef.attack + enemyDef.attackPerLevel * adjustmentLevel),
    speed: (enemyDef.speed + enemyDef.speedPerLevel * adjustmentLevel) * state.stats.enemySpeedFactor,
  };
}

function findEnemyDefinition(enemyId) {
  return state.enemyCatalog.find((enemy) => enemy.id === enemyId) ?? state.enemyCatalog[0];
}

function pickWeightedEnemy(pool) {
  const totalWeight = pool.reduce((total, enemy) => total + Math.max(0, enemy.spawnWeight), 0);
  let cursor = Math.random() * totalWeight;

  for (const enemy of pool) {
    cursor -= Math.max(0, enemy.spawnWeight);
    if (cursor <= 0) {
      return enemy;
    }
  }

  return pool[0];
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
