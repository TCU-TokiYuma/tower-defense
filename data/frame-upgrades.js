"use strict";

window.FRAME_UPGRADES = [
  {
    id: "damage",
    icon: "攻",
    name: "出力増幅",
    detail: "レーザー基礎威力 +24%",
    effect: {
      type: "multiplyState",
      key: "damage",
      factor: 1.24,
    },
  },
  {
    id: "reflection",
    icon: "効",
    name: "反射効率",
    detail: "反射効率 +15%",
    effect: {
      type: "adjustReflection",
      amount: 0.15,
    },
  },
  {
    id: "mirror",
    icon: "鏡",
    name: "反射板補充",
    detail: "反射板 +3",
    effect: {
      type: "addBag",
      piece: "mirror",
      amount: 3,
    },
  },
  {
    id: "splitter",
    icon: "分",
    name: "分岐器補充",
    detail: "分岐器 +1",
    effect: {
      type: "addBag",
      piece: "splitter",
      amount: 1,
    },
  },
  {
    id: "slow",
    icon: "遅",
    name: "遅延場",
    detail: "敵の降下速度 -9%",
    effect: {
      type: "multiplyState",
      key: "enemySpeedFactor",
      factor: 0.91,
    },
  },
  {
    id: "repair",
    icon: "修",
    name: "自陣修復",
    detail: "最大体力 +20，体力 +35",
    effect: {
      type: "repair",
      maxHealth: 20,
      health: 35,
    },
  },
  {
    id: "clearHeal",
    icon: "保",
    name: "保全手順",
    detail: "ステージクリア回復 +15",
    effect: {
      type: "addState",
      key: "clearHeal",
      amount: 15,
    },
  },
];
