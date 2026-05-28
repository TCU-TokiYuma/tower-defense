"use strict";

const BOARD_SIZE = 5;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const INITIAL_HEALTH = 300;
const INITIAL_BAG = 7;
const INITIAL_SPLITTER_BAG = 2;
const BASE_DAMAGE = 4.4;
const ATTACK_INTERVAL_SECONDS = 0.5;
const DAMAGE_POPUP_LIFETIME = 0.5;
const REFLECTION_LOSS = 0.88;
const SPLITTER_OUTPUT_FACTOR = 0.72;
const MIN_LASER_ENERGY = 0.28;
const LASER_SHIFT_MIN = 13;
const LASER_SHIFT_MAX = 22;
const BASE_CLEAR_HEAL = 25;

const assetUrl = (path) => new URL(path, document.baseURI).href;

const ASSETS = {
  mirror: assetUrl("../assets/mirror.png"),
  splitter: assetUrl("../assets/splitter.png"),
  enemy: assetUrl("../assets/enemy.svg"),
  emitter: assetUrl("../assets/emitter.png"),
};

const DIRECTIONS = {
  up: { dx: 0, dy: -1, index: 0 },
  right: { dx: 1, dy: 0, index: 1 },
  down: { dx: 0, dy: 1, index: 2 },
  left: { dx: -1, dy: 0, index: 3 },
};

const OPPOSITE = {
  up: "down",
  right: "left",
  down: "up",
  left: "right",
};

const EMITTER_SOURCES = [
  ...Array.from({ length: BOARD_SIZE }, (_, x) => ({
    id: `emitter${x}`,
    edge: "bottom",
    lane: x,
    x,
    y: BOARD_SIZE - 1,
    direction: "up",
  })),
  ...Array.from({ length: BOARD_SIZE }, (_, y) => ({
    id: `emitter${y + BOARD_SIZE}`,
    edge: "left",
    lane: y,
    x: 0,
    y,
    direction: "right",
  })),
  ...Array.from({ length: BOARD_SIZE }, (_, y) => ({
    id: `emitter${y + BOARD_SIZE * 2}`,
    edge: "right",
    lane: y,
    x: BOARD_SIZE - 1,
    y,
    direction: "left",
  })),
];

const REFLECTION = {
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
};

const SPLITTER_PORTS = [
  ["up", "left", "right"],
  ["up", "right", "down"],
  ["right", "down", "left"],
  ["down", "left", "up"],
];

const PIECE_ORDER = ["mirror", "splitter"];

const PIECE_META = {
  mirror: {
    label: "反射板",
    asset: ASSETS.mirror,
  },
  splitter: {
    label: "分岐器",
    asset: ASSETS.splitter,
  },
};

const SCREENS = {
  START: "start",
  PLAY: "play",
  UPGRADE: "upgrade",
  RESULT: "result",
};

const ENEMY_TYPES = [
  {
    id: "basic",
    name: "侵入体",
    hp: 8,
    hpGrow: 1.7,
    speed: 11,
    speedGrow: 0.28,
    attack: 9,
    score: 85,
    minStage: 1,
    weight: 70,
  },
  {
    id: "fast",
    name: "突撃体",
    hp: 5.5,
    hpGrow: 1.1,
    speed: 17,
    speedGrow: 0.34,
    attack: 7,
    score: 105,
    minStage: 2,
    weight: 28,
  },
  {
    id: "tank",
    name: "重装体",
    hp: 15,
    hpGrow: 2.8,
    speed: 7.5,
    speedGrow: 0.14,
    attack: 18,
    score: 155,
    minStage: 3,
    weight: 16,
  },
];

const UPGRADES = [
  {
    id: "damage",
    icon: "攻",
    name: "出力増幅",
    detail: "レーザー基礎威力 +24%",
    apply: () => {
      state.damage *= 1.24;
    },
  },
  {
    id: "loss",
    icon: "効",
    name: "反射効率",
    detail: "反射後の減衰を軽減",
    apply: () => {
      state.reflectionLoss = Math.min(0.98, state.reflectionLoss + 0.04);
    },
  },
  {
    id: "mirror",
    icon: "鏡",
    name: "反射板補充",
    detail: "反射板 +3",
    apply: () => {
      state.bag.mirror += 3;
    },
  },
  {
    id: "splitter",
    icon: "分",
    name: "分岐器補充",
    detail: "分岐器 +1",
    apply: () => {
      state.bag.splitter += 1;
    },
  },
  {
    id: "slow",
    icon: "遅",
    name: "遅延場",
    detail: "敵の降下速度 -9%",
    apply: () => {
      state.enemySpeedFactor *= 0.91;
    },
  },
  {
    id: "repair",
    icon: "修",
    name: "自陣修復",
    detail: "最大体力 +20，体力 +35",
    apply: () => {
      state.maxHealth += 20;
      state.health = Math.min(state.maxHealth, state.health + 35);
    },
  },
  {
    id: "clearHeal",
    icon: "保",
    name: "保全手順",
    detail: "ステージクリア回復 +15",
    apply: () => {
      state.clearHeal += 15;
    },
  },
];

const elements = {
  main: document.getElementById("main-area"),
  title: document.getElementById("title"),
  stage: document.querySelector("#stage .num"),
  score: document.querySelector("#score .num"),
  laserTimer: document.querySelector("#laser-timer .num"),
  field: document.getElementById("field"),
  fieldLabel: document.getElementById("field-label"),
  enemyLayers: Array.from(document.querySelectorAll(".enemies-layer")),
  hpText: document.getElementById("hp-text"),
  hpFill: document.getElementById("hp-fill"),
  grid: document.getElementById("grid"),
  bag: document.getElementById("bag"),
  pause: document.getElementById("pause"),
  overlay: document.getElementById("overlay"),
  overlayKicker: document.getElementById("overlay-kicker"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayBody: document.getElementById("overlay-body"),
  overlayAction: document.getElementById("overlay-action"),
  upgradeOptions: document.getElementById("upgrade-options"),
  emitters: Array.from(document.querySelectorAll(".emitter")),
};

const state = {
  screen: SCREENS.START,
  board: createEmptyBoard(),
  cells: [],
  bag: createInitialBag(),
  enemies: [],
  damagePopups: [],
  spawnQueue: [],
  spawnTimer: 0,
  spawnedCount: 0,
  stageTarget: 0,
  stage: 1,
  score: 0,
  health: INITIAL_HEALTH,
  maxHealth: INITIAL_HEALTH,
  damage: BASE_DAMAGE,
  enemySpeedFactor: 1,
  clearHeal: BASE_CLEAR_HEAL,
  reflectionLoss: REFLECTION_LOSS,
  pierce: 0,
  activeEmitter: "emitter2",
  shiftTimer: randomLaserShift(),
  paused: false,
  dragging: null,
  lastTime: performance.now(),
  attackTimer: 0,
  enemyId: 1,
  damagePopupId: 1,
  hitEnemyIds: new Set(),
};

function setup() {
  collectCells();
  bindControls();
  resetGameState();
  showStart();
  requestAnimationFrame(loop);
}

function collectCells() {
  state.cells = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = document.getElementById(`sell-${y}${x}`);
      if (!cell) continue;
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `セル ${x + 1}, ${y + 1}`);
      cell.addEventListener("pointerdown", (event) => startBoardDrag(event, x, y));
      state.cells.push(cell);
    }
  }
}

function bindControls() {
  elements.pause.addEventListener("click", () => {
    if (state.screen !== SCREENS.PLAY) return;
    if (state.paused) {
      resumeGame();
    } else {
      pauseGame();
    }
  });

  elements.overlayAction.addEventListener("click", () => {
    if (state.screen === SCREENS.START || state.screen === SCREENS.RESULT) {
      startGame();
    } else if (state.screen === SCREENS.PLAY && state.paused) {
      resumeGame();
    }
  });

  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", handleDragEnd);
  window.addEventListener("pointercancel", handleDragCancel);
}

function loop(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;

  if (state.screen === SCREENS.PLAY && !state.paused) {
    updateGame(dt);
  } else {
    state.hitEnemyIds.clear();
    updateDamagePopups(dt);
  }

  const trace = computeLaserTrace();
  renderLaser(trace);
  renderEnemies();
  renderEmitters();
  updateHud();
  requestAnimationFrame(loop);
}

function updateGame(dt) {
  updateLaserShift(dt);
  spawnEnemies(dt);
  moveEnemies(dt);
  updateEnemyDisplayHp(dt);
  updateDamagePopups(dt);

  const trace = computeLaserTrace();
  updateLaserAttack(dt, trace);
  resolveStage();
}

function startGame() {
  resetGameState();
  startStage(1);
  state.screen = SCREENS.PLAY;
  state.paused = false;
  elements.pause.textContent = "一時停止";
  elements.pause.disabled = false;
  hideOverlay();
}

function resetGameState() {
  state.board = createEmptyBoard();
  state.bag = createInitialBag();
  state.enemies = [];
  state.damagePopups = [];
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.spawnedCount = 0;
  state.stageTarget = 0;
  state.stage = 1;
  state.score = 0;
  state.health = INITIAL_HEALTH;
  state.maxHealth = INITIAL_HEALTH;
  state.damage = BASE_DAMAGE;
  state.enemySpeedFactor = 1;
  state.clearHeal = BASE_CLEAR_HEAL;
  state.reflectionLoss = REFLECTION_LOSS;
  state.pierce = 0;
  state.activeEmitter = "emitter2";
  state.shiftTimer = randomLaserShift();
  state.paused = false;
  state.attackTimer = 0;
  state.enemyId = 1;
  state.damagePopupId = 1;
  state.hitEnemyIds = new Set();
  clearDragState();
  renderBoard();
  renderBag();
  renderEmitters();
  updateHud();
}

function startStage(stageNumber) {
  state.stage = stageNumber;
  state.spawnQueue = createSpawnQueue(stageNumber);
  state.stageTarget = state.spawnQueue.length;
  state.spawnedCount = 0;
  state.spawnTimer = 0.45;
  elements.fieldLabel.textContent = `第${stageNumber}面 / 侵入体 ${state.stageTarget}`;
}

function updateLaserShift(dt) {
  state.shiftTimer -= dt;
  if (state.shiftTimer > 0) return;

  state.activeEmitter = pickNextEmitter();
  state.shiftTimer = randomLaserShift();
}

function spawnEnemies(dt) {
  if (state.spawnQueue.length === 0) return;

  const interval = Math.max(0.42, 1.08 - state.stage * 0.035);
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  const enemyType = state.spawnQueue.shift();
  const level = Math.max(0, state.stage - 1);
  const hp = enemyType.hp + enemyType.hpGrow * level;
  const speed = (enemyType.speed + enemyType.speedGrow * level) * state.enemySpeedFactor;
  const lane = Math.floor(Math.random() * BOARD_SIZE);

  state.enemies.push({
    id: state.enemyId,
    type: enemyType.id,
    name: enemyType.name,
    lane,
    y: -8,
    hp,
    maxHp: hp,
    displayHp: hp,
    speed,
    attack: enemyType.attack + Math.round(level * 1.15),
    score: enemyType.score,
  });

  state.enemyId += 1;
  state.spawnedCount += 1;
  state.spawnTimer = interval;
}

function moveEnemies(dt) {
  for (const enemy of state.enemies) {
    enemy.y += enemy.speed * dt;
  }

  const survivors = [];
  for (const enemy of state.enemies) {
    if (enemy.y >= 101) {
      state.health = Math.max(0, state.health - enemy.attack);
    } else {
      survivors.push(enemy);
    }
  }
  state.enemies = survivors;

  if (state.health <= 0) {
    endGame();
  }
}

function updateEnemyDisplayHp(dt) {
  const follow = Math.min(1, dt / (ATTACK_INTERVAL_SECONDS * 0.72));
  for (const enemy of state.enemies) {
    enemy.displayHp += (enemy.hp - enemy.displayHp) * follow;
    if (Math.abs(enemy.displayHp - enemy.hp) < 0.02) {
      enemy.displayHp = enemy.hp;
    }
  }
}

function updateDamagePopups(dt) {
  for (const popup of state.damagePopups) {
    popup.age += dt;
  }
  state.damagePopups = state.damagePopups.filter((popup) => popup.age < DAMAGE_POPUP_LIFETIME);
}

function updateLaserAttack(dt, trace) {
  state.attackTimer -= dt;
  if (state.attackTimer > 0) return;

  state.attackTimer += ATTACK_INTERVAL_SECONDS;
  if (state.attackTimer < 0) {
    state.attackTimer = ATTACK_INTERVAL_SECONDS;
  }

  applyLaserDamage(trace);
}

function applyLaserDamage(trace) {
  state.hitEnemyIds.clear();

  for (const [laneText, energy] of trace.attackColumns.entries()) {
    const lane = Number(laneText);
    const targets = state.enemies
      .filter((enemy) => enemy.lane === lane && enemy.hp > 0)
      .sort((a, b) => b.y - a.y);

    if (targets.length === 0) continue;

    const target = targets[0];
    const damage = state.damage * energy * ATTACK_INTERVAL_SECONDS;
    target.hp -= damage;
    state.hitEnemyIds.add(target.id);
    addDamagePopup(target, damage);
  }

  const defeated = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (defeated.length === 0) return;

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  for (const enemy of defeated) {
    state.score += Math.round(enemy.score * (1 + state.stage * 0.08));
    if (Math.random() < 0.28) {
      state.bag.mirror += 1;
    }
    if (Math.random() < 0.08) {
      state.bag.splitter += 1;
    }
  }
  renderBag();
}

function addDamagePopup(enemy, damage) {
  state.damagePopups.push({
    id: state.damagePopupId,
    enemyId: enemy.id,
    amount: formatDamage(damage),
    age: 0,
  });
  state.damagePopupId += 1;
}

function formatDamage(damage) {
  const rounded = Math.round(damage * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function resolveStage() {
  if (state.screen !== SCREENS.PLAY) return;
  if (state.spawnQueue.length > 0 || state.enemies.length > 0 || state.spawnedCount < state.stageTarget) return;

  state.health = Math.min(state.maxHealth, state.health + state.clearHeal);
  showUpgrade();
}

function computeLaserTrace() {
  const cellBeams = new Map();
  const attackColumns = new Map();
  const source = getActiveEmitterSource();
  const beams = [
    {
      x: source.x,
      y: source.y,
      direction: source.direction,
      energy: 1,
      visited: new Set(),
    },
  ];
  let processed = 0;

  while (beams.length > 0 && processed < 72) {
    processed += 1;
    const beam = beams.pop();
    let { x, y, direction, energy } = beam;
    const visited = new Set(beam.visited);

    for (let step = 0; step < CELL_COUNT * 4; step += 1) {
      if (!isInsideBoard(x, y)) {
        if (y < 0 && direction === "up" && x >= 0 && x < BOARD_SIZE) {
          attackColumns.set(String(x), (attackColumns.get(String(x)) ?? 0) + energy);
        }
        break;
      }

      const visitKey = `${x}:${y}:${direction}`;
      if (visited.has(visitKey)) break;
      visited.add(visitKey);

      const cellKey = `${x}:${y}`;
      addBeamDirection(cellBeams, cellKey, OPPOSITE[direction], energy);

      const block = state.board[y][x];
      if (block?.type === "mirror") {
        direction = reflect(direction, block.rotation);
        energy *= state.reflectionLoss;
        addBeamDirection(cellBeams, cellKey, direction, energy);
      } else if (block?.type === "splitter") {
        const outputDirections = getSplitterOutputDirections(block, direction);
        if (outputDirections.length === 0) break;

        for (const outputDirection of outputDirections) {
          const nextEnergy = energy * SPLITTER_OUTPUT_FACTOR;
          if (nextEnergy < MIN_LASER_ENERGY) continue;

          addBeamDirection(cellBeams, cellKey, outputDirection, nextEnergy);
          const delta = DIRECTIONS[outputDirection];
          beams.push({
            x: x + delta.dx,
            y: y + delta.dy,
            direction: outputDirection,
            energy: nextEnergy,
            visited: new Set(visited),
          });
        }
        break;
      } else {
        addBeamDirection(cellBeams, cellKey, direction, energy);
      }

      if (energy < MIN_LASER_ENERGY) break;

      x += DIRECTIONS[direction].dx;
      y += DIRECTIONS[direction].dy;
    }
  }

  return { cellBeams, attackColumns };
}

function addBeamDirection(cellBeams, cellKey, direction, energy) {
  if (!cellBeams.has(cellKey)) {
    cellBeams.set(cellKey, new Map());
  }
  const directions = cellBeams.get(cellKey);
  directions.set(direction, Math.max(directions.get(direction) ?? 0, energy));
}

function reflect(direction, rotation) {
  const mirrorType = rotation % 2 === 0 ? "slash" : "backslash";
  return REFLECTION[mirrorType][direction] ?? direction;
}

function getSplitterOutputDirections(block, direction) {
  const ports = SPLITTER_PORTS[block.rotation % 4];
  const entryPort = OPPOSITE[direction];
  if (!ports.includes(entryPort)) return [];
  return ports.filter((port) => port !== entryPort);
}

function renderLaser(trace) {
  for (const cell of state.cells) {
    for (const laser of cell.querySelectorAll(".laser")) {
      laser.setAttribute("laser-type", "0");
      laser.setAttribute("laser-damage", "0");
    }
  }

  for (const [cellKey, directions] of trace.cellBeams.entries()) {
    const [xText, yText] = cellKey.split(":");
    const cell = getCell(Number(xText), Number(yText));
    if (!cell) continue;

    for (const [direction, energy] of directions.entries()) {
      const laser = cell.querySelector(`.direction-${DIRECTIONS[direction].index}`);
      if (!laser) continue;
      laser.setAttribute("laser-type", "1");
      laser.setAttribute("laser-damage", energy.toFixed(2));
    }
  }

  for (let lane = 0; lane < BOARD_SIZE; lane += 1) {
    const active = trace.attackColumns.has(String(lane));
    const layer = elements.enemyLayers[lane];
    if (layer) {
      layer.setAttribute("lane-active", active ? "1" : "0");
      layer.setAttribute("laser-type", active ? "1" : "0");
      layer.setAttribute("laser-damage", active ? trace.attackColumns.get(String(lane)).toFixed(2) : "0");
    }
  }
}

function renderEnemies() {
  for (const layer of elements.enemyLayers) {
    layer.querySelectorAll(".enemy").forEach((enemy) => enemy.remove());
  }

  for (const enemy of state.enemies) {
    const layer = elements.enemyLayers[enemy.lane];
    if (!layer) continue;

    const node = document.createElement("div");
    const hpRatio = Math.max(0, Math.min(1, enemy.displayHp / enemy.maxHp));
    const damagePopupHtml = state.damagePopups
      .filter((popup) => popup.enemyId === enemy.id)
      .map((popup) => {
        const progress = Math.min(1, popup.age / DAMAGE_POPUP_LIFETIME);
        const opacity = Math.max(0, 1 - progress);
        const lift = -8 * progress;
        return `<span class="damage-popup" data-popup-id="${popup.id}" style="--damage-opacity:${opacity.toFixed(2)}; --damage-lift:${lift.toFixed(1)}px">${popup.amount}</span>`;
      })
      .join("");
    node.className = `enemy${state.hitEnemyIds.has(enemy.id) ? " hit" : ""}`;
    node.style.top = `${enemy.y}%`;
    node.title = `${enemy.name} / HP ${Math.ceil(enemy.hp)}`;
    node.innerHTML = `
      <img src="${ASSETS.enemy}" alt="">
      ${damagePopupHtml}
      <div class="enemy-hp"><span style="width: ${hpRatio * 100}%"></span></div>
    `;
    layer.appendChild(node);
  }
}

function renderBoard() {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = getCell(x, y);
      if (!cell) continue;

      cell.querySelectorAll(".piece-node").forEach((piece) => piece.remove());
      const block = state.board[y][x];
      cell.classList.toggle("has-piece", Boolean(block));
      cell.setAttribute("cell-type", block ? "1" : "0");

      if (!block) continue;

      const pieceNode = document.createElement("div");
      pieceNode.className = "piece-node";
      pieceNode.innerHTML = `<img src="${getPieceAsset(block.type)}" alt="" style="transform: rotate(${block.rotation * 90}deg)">`;
      cell.appendChild(pieceNode);
    }
  }
}

function renderBag() {
  elements.bag.innerHTML = "";

  for (const piece of PIECE_ORDER) {
    const count = state.bag[piece] ?? 0;
    const item = document.createElement("button");
    item.id = piece;
    item.className = "item";
    item.type = "button";
    item.dataset.piece = piece;
    item.setAttribute("aria-label", PIECE_META[piece].label);
    item.setAttribute("aria-disabled", count > 0 ? "false" : "true");
    item.innerHTML = `
      <img src="${getPieceAsset(piece)}" alt="">
      <span class="item-count">${count}</span>
    `;
    item.addEventListener("pointerdown", (event) => startBagDrag(event, piece));
    elements.bag.appendChild(item);
  }
}

function renderEmitters() {
  for (const emitter of elements.emitters) {
    emitter.setAttribute("emitter-state", emitter.id === state.activeEmitter ? "1" : "0");
  }
}

function updateHud() {
  elements.stage.textContent = String(state.stage);
  elements.score.textContent = String(state.score);
  elements.laserTimer.textContent = state.screen === SCREENS.PLAY ? `${Math.ceil(Math.max(0, state.shiftTimer))}s` : "--";
  elements.hpText.textContent = `${Math.ceil(Math.max(0, state.health))}/${state.maxHealth}`;
  elements.hpFill.style.width = `${getHealthRatio() * 100}%`;
  elements.pause.disabled = state.screen !== SCREENS.PLAY;
}

function pauseGame() {
  state.paused = true;
  elements.pause.textContent = "再開";
  showPauseOverlay();
}

function resumeGame() {
  state.paused = false;
  elements.pause.textContent = "一時停止";
  hideOverlay();
}

function showStart() {
  state.screen = SCREENS.START;
  elements.overlayKicker.textContent = "屈折防衛";
  elements.overlayTitle.textContent = "屈折ローグ";
  elements.overlayBody.textContent = "反射板と分岐器でレーザー経路を組み替え，侵入体を防衛してください。";
  elements.overlayAction.textContent = "開始";
  elements.overlayAction.hidden = false;
  elements.upgradeOptions.innerHTML = "";
  elements.overlay.classList.remove("hidden");
  elements.pause.disabled = true;
}

function showPauseOverlay() {
  elements.overlayKicker.textContent = "一時停止";
  elements.overlayTitle.textContent = "現在のステータス";
  elements.overlayBody.textContent = `第${state.stage}面 / 得点 ${state.score}`;
  elements.overlayAction.textContent = "再開";
  elements.overlayAction.hidden = false;
  elements.upgradeOptions.innerHTML = `<dl class="status-list">${getPauseStatusRows()
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("")}</dl>`;
  elements.overlay.classList.remove("hidden");
}

function getPauseStatusRows() {
  return [
    ["レーザー出力", formatStat(state.damage * ATTACK_INTERVAL_SECONDS)],
    ["攻撃間隔", `${ATTACK_INTERVAL_SECONDS.toFixed(1)} 秒`],
    ["体力", `${Math.ceil(Math.max(0, state.health))} / ${state.maxHealth}`],
    ["反射効率", formatPercent(state.reflectionLoss)],
    ["分岐出力", formatPercent(SPLITTER_OUTPUT_FACTOR)],
    ["貫通数", String(state.pierce)],
    ["敵速度倍率", formatPercent(state.enemySpeedFactor)],
    ["クリア回復", String(state.clearHeal)],
    ["反射板", String(state.bag.mirror ?? 0)],
    ["分岐器", String(state.bag.splitter ?? 0)],
  ];
}

function showUpgrade() {
  state.screen = SCREENS.UPGRADE;
  state.paused = false;
  elements.pause.textContent = "一時停止";
  elements.overlayKicker.textContent = "ステージクリア";
  elements.overlayTitle.textContent = "強化を選択";
  elements.overlayBody.textContent = `体力を ${state.clearHeal} 回復しました。`;
  elements.overlayAction.hidden = true;
  elements.upgradeOptions.innerHTML = "";

  for (const upgrade of shuffle([...UPGRADES]).slice(0, 3)) {
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
      upgrade.apply();
      renderBag();
      startStage(state.stage + 1);
      state.screen = SCREENS.PLAY;
      hideOverlay();
    });
    elements.upgradeOptions.appendChild(button);
  }

  elements.overlay.classList.remove("hidden");
}

function endGame() {
  if (state.screen === SCREENS.RESULT) return;
  state.screen = SCREENS.RESULT;
  state.paused = false;
  elements.pause.textContent = "一時停止";
  elements.overlayKicker.textContent = "リザルト";
  elements.overlayTitle.textContent = "防衛終了";
  elements.overlayBody.textContent = `到達面: ${state.stage} / 得点: ${state.score}`;
  elements.overlayAction.textContent = "再挑戦";
  elements.overlayAction.hidden = false;
  elements.upgradeOptions.innerHTML = "";
  elements.overlay.classList.remove("hidden");
}

function hideOverlay() {
  elements.overlay.classList.add("hidden");
}

function startBagDrag(event, piece) {
  if (state.screen !== SCREENS.PLAY || state.paused || state.bag[piece] <= 0) return;

  event.preventDefault();
  clearDragState();

  state.dragging = {
    source: "bag",
    piece,
    pointerId: event.pointerId,
    ghost: createGhost(piece, 0),
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    targetCell: null,
  };

  capturePointer(event);
  document.body.appendChild(state.dragging.ghost);
  moveGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientX, event.clientY);
}

function startBoardDrag(event, x, y) {
  if (state.screen !== SCREENS.PLAY || state.paused || !state.board[y][x]) return;

  event.preventDefault();
  clearDragState();

  const block = state.board[y][x];
  state.dragging = {
    source: "board",
    piece: block.type,
    fromX: x,
    fromY: y,
    rotation: block.rotation,
    pointerId: event.pointerId,
    ghost: createGhost(block.type, block.rotation),
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    targetCell: null,
    fieldTarget: false,
  };

  capturePointer(event);
  document.body.appendChild(state.dragging.ghost);
  moveGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientX, event.clientY);
}

function handleDragMove(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
  event.preventDefault();

  const distance = Math.hypot(event.clientX - state.dragging.startX, event.clientY - state.dragging.startY);
  if (distance > 7) {
    state.dragging.moved = true;
  }

  moveGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientX, event.clientY);
}

function handleDragEnd(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
  event.preventDefault();

  if (state.dragging.source === "bag") {
    const cell = getCellAtPoint(event.clientX, event.clientY);
    if (cell) {
      placePiece(Number(cell.dataset.x), Number(cell.dataset.y));
    }
  } else if (state.dragging.source === "board") {
    const cell = getCellAtPoint(event.clientX, event.clientY);

    if (!state.dragging.moved) {
      rotatePiece(state.dragging.fromX, state.dragging.fromY);
    } else if (isPointInField(event.clientX, event.clientY)) {
      removePiece(state.dragging.fromX, state.dragging.fromY);
    } else if (cell) {
      movePiece(state.dragging.fromX, state.dragging.fromY, Number(cell.dataset.x), Number(cell.dataset.y));
    }
  }

  clearDragState();
}

function handleDragCancel(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
  clearDragState();
}

function placePiece(x, y) {
  const piece = state.dragging?.piece;
  if (!piece || !PIECE_ORDER.includes(piece)) return;
  if (!isInsideBoard(x, y) || state.board[y][x] || state.bag[piece] <= 0) return;

  state.bag[piece] -= 1;
  state.board[y][x] = { type: piece, rotation: 0 };
  renderBoard();
  renderBag();
}

function rotatePiece(x, y) {
  const block = state.board[y][x];
  if (!block) return;
  block.rotation = (block.rotation + 1) % 4;
  renderBoard();
}

function removePiece(x, y) {
  const block = state.board[y][x];
  if (!block) return;
  state.board[y][x] = null;
  state.bag[block.type] = (state.bag[block.type] ?? 0) + 1;
  renderBoard();
  renderBag();
}

function movePiece(fromX, fromY, toX, toY) {
  if (!isInsideBoard(toX, toY)) return;
  if (fromX === toX && fromY === toY) return;

  const moving = state.board[fromY][fromX];
  const target = state.board[toY][toX];
  state.board[toY][toX] = moving;
  state.board[fromY][fromX] = target;
  renderBoard();
}

function updateDropTarget(x, y) {
  if (!state.dragging) return;

  if (state.dragging.targetCell) {
    state.dragging.targetCell.classList.remove("is-drop-target");
  }

  const cell = getCellAtPoint(x, y);
  const fieldTarget = state.dragging.source === "board" && state.dragging.moved && isPointInField(x, y);
  const cellTarget = fieldTarget ? null : cell;

  elements.field.classList.toggle("delete-target", fieldTarget);
  state.dragging.targetCell = cellTarget;
  state.dragging.fieldTarget = fieldTarget;

  if (state.dragging.targetCell) {
    state.dragging.targetCell.classList.add("is-drop-target");
  }
}

function clearDragState() {
  if (!state.dragging) return;

  if (state.dragging.targetCell) {
    state.dragging.targetCell.classList.remove("is-drop-target");
  }

  elements.field.classList.remove("delete-target");
  state.dragging.ghost?.remove();
  state.dragging = null;
}

function capturePointer(event) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // capture が使えない環境でも window の pointermove で追跡します。
  }
}

function createGhost(piece, rotation) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.innerHTML = `<img src="${getPieceAsset(piece)}" alt="" style="transform: rotate(${rotation * 90}deg)">`;
  return ghost;
}

function moveGhost(x, y) {
  if (!state.dragging?.ghost) return;
  state.dragging.ghost.style.left = `${x}px`;
  state.dragging.ghost.style.top = `${y}px`;
}

function getCellAtPoint(x, y) {
  const node = document.elementFromPoint(x, y);
  return node?.closest(".cell") ?? null;
}

function isPointInField(x, y) {
  const rect = elements.field.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getCell(x, y) {
  if (!isInsideBoard(x, y)) return null;
  return state.cells[y * BOARD_SIZE + x] ?? null;
}

function isInsideBoard(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function createSpawnQueue(stageNumber) {
  const count = 7 + stageNumber * 3;
  const pool = ENEMY_TYPES.filter((enemy) => enemy.minStage <= stageNumber);
  return Array.from({ length: count }, () => pickWeighted(pool));
}

function pickWeighted(pool) {
  const total = pool.reduce((sum, enemy) => sum + enemy.weight, 0);
  let cursor = Math.random() * total;

  for (const enemy of pool) {
    cursor -= enemy.weight;
    if (cursor <= 0) {
      return enemy;
    }
  }

  return pool[0];
}

function pickNextEmitter() {
  let next = state.activeEmitter;
  while (next === state.activeEmitter) {
    next = EMITTER_SOURCES[Math.floor(Math.random() * EMITTER_SOURCES.length)].id;
  }
  return next;
}

function getActiveEmitterSource() {
  return EMITTER_SOURCES.find((source) => source.id === state.activeEmitter) ?? EMITTER_SOURCES[2];
}

function getPieceAsset(piece) {
  return PIECE_META[piece]?.asset ?? ASSETS.mirror;
}

function createInitialBag() {
  return {
    mirror: INITIAL_BAG,
    splitter: INITIAL_SPLITTER_BAG,
  };
}

function randomLaserShift() {
  return LASER_SHIFT_MIN + Math.random() * (LASER_SHIFT_MAX - LASER_SHIFT_MIN);
}

function getHealthRatio() {
  if (state.maxHealth <= 0) return 0;
  return Math.max(0, Math.min(1, state.health / state.maxHealth));
}

function formatStat(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup, { once: true });
} else {
  setup();
}
