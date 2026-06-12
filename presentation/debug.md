# プレゼン撮影用デバッグコマンド一覧

`presentation/debug.html` を開いた状態で、ブラウザのデベロッパーツールの Console から実行します。

```js
LogSabaDebug.getState()
```

現在の主要状態を確認します。返り値には `activeEmitter`、`enemySpawnsStopped`、`health`、`maxHealth`、`pieces` などが含まれます。

## Emitter

```js
LogSabaDebug.emitters()
```

利用可能な emitter の一覧を確認します。

```js
LogSabaDebug.setEmitter(7)
LogSabaDebug.setEmitter("emitter12")
LogSabaDebug.switchEmitter(7)
```

指定した emitter からの射出に即時切り替えます。数値指定の場合は `emitter7` のように解釈されます。

```js
LogSabaDebug.lockEmitter("emitter12")
LogSabaDebug.unlockEmitter()
```

`lockEmitter` は指定 emitter に固定します。ゲーム中は SHIFT 表示が `LOCK` になります。`unlockEmitter` で通常のランダム切り替えへ戻します。

## 敵

```js
LogSabaDebug.enemyTypes()
```

利用可能な敵タイプを確認します。現在のタイプIDは `basic`、`fast`、`tank` です。

```js
LogSabaDebug.stopEnemySpawns()
LogSabaDebug.resumeEnemySpawns()
```

`stopEnemySpawns` はランダムな敵出現だけを止めます。すでに出ている敵はそのまま進みます。`resumeEnemySpawns` で再開します。

```js
LogSabaDebug.spawnEnemy("basic", 0)
LogSabaDebug.spawnEnemy("fast", 3)
LogSabaDebug.spawnEnemy("tank", 2)
```

指定したレーンに、指定したタイプの敵を即時出現させます。レーンは `0` から `4` です。

```js
LogSabaDebug.spawnEnemy({ type: "tank", lane: 2, y: 20 })
```

撮影位置を調整したい場合は `y` を指定できます。`y: -8` が通常の出現位置です。

## 体力

```js
LogSabaDebug.setHealth(120)
```

現在体力を即時変更します。最大体力を超える値は現在の最大体力に丸められます。

```js
LogSabaDebug.setHealth({ health: 450, maxHealth: 500 })
```

最大体力と現在体力を同時に変更します。

```js
LogSabaDebug.setMaxHealth(500)
LogSabaDebug.setMaxHealth(200, { keepHealth: true })
```

最大体力だけを変更します。通常は現在体力が最大体力を超えないように丸められます。`keepHealth: true` を指定すると現在体力を維持します。

## 所持パーツ

```js
LogSabaDebug.pieceTypes()
LogSabaDebug.pieces()
```

利用可能なパーツ種別と現在の所持数を確認します。現在のパーツIDは `mirror` と `splitter` です。

```js
LogSabaDebug.setPieceCount("mirror", 8)
LogSabaDebug.setPieceCount("splitter", 3)
```

指定したパーツの所持数を即時変更します。

```js
LogSabaDebug.setPieces({ mirror: 5, splitter: 3 })
LogSabaDebug.setPieces({ "反射板": 5, "分岐器": 3 })
```

複数パーツの所持数をまとめて変更します。数値は 0 以上の整数として扱われます。

## 撮影用の例

```js
LogSabaDebug.stopEnemySpawns()
LogSabaDebug.lockEmitter("emitter12")
LogSabaDebug.setHealth({ health: 180, maxHealth: 300 })
LogSabaDebug.setPieces({ mirror: 7, splitter: 2 })
LogSabaDebug.spawnEnemy("tank", 2)
LogSabaDebug.spawnEnemy({ type: "fast", lane: 4, y: 18 })
```
