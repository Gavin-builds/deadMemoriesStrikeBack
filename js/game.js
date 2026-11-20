(() => {
  'use strict';

  // ============================================================
  // DOM
  // ============================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const elPercent = document.getElementById('progressValue');
  const elFill = document.getElementById('progressFill');
  const elHp = document.getElementById('hpValue');
  const elLifePip = document.getElementById('lifePip');
  const elDeath = document.getElementById('death');
  const elDeathTitle = document.getElementById('deathTitle');
  const elDeathSub = document.getElementById('deathSub');
  const elDeathProgress = document.getElementById('deathProgress');
  const elRestart = document.getElementById('restartBtn');
  const elSceneLabel = document.getElementById('sceneLabel');
  const elDeathScene = document.getElementById('deathScene');
  const elSceneCard = document.getElementById('sceneCard');
  const elSceneAct = document.getElementById('sceneAct');
  const elSceneName = document.getElementById('sceneName');
  const elSceneMood = document.getElementById('sceneMood');
  const elSceneFlash = document.getElementById('sceneFlash');
  const elEnding = document.getElementById('ending');
  const elEndingRestart = document.getElementById('endingRestart');
  const elEndingDamage = document.getElementById('endingDamage');
  const elEndingDamageNote = document.getElementById('endingDamageNote');
  const elBuff = document.getElementById('buffState');

  // Web Audio：全部音效由 OscillatorNode 实时合成（见 js/audio.js）
  const sfx = window.GameAudio || {
    jump() {},
    hit() {},
    pickup() {},
    toggleMuted() {},
    isMuted() { return false; },
  };

  // ============================================================
  // 常量
  // ============================================================
  const STEP_MS = 1000 / 60;          // 固定 60Hz 逻辑步长
  const MAX_STEPS = 5;                // 单帧最多补算步数
  const SCENE_LENGTH = 22000;         // 每幕约 55~60 秒（世界单位）
  const SCENE_INTRO_TIME = 2.4;       // 场景标题卡停留时间

  const GRAVITY = 2700;
  const JUMP_SPEED = 920;
  const RUN_ACCEL = 3000;
  const RUN_MAX = 440;
  const RUN_DRAG = 2800;
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER_TIME = 0.12;
  const CAMERA_EASE = 14;

  const SHADOW_DELAY_NORMAL = 120;    // 2 秒 × 60Hz
  const SHADOW_DELAY_AMNESIA = 240;   // 4 秒 × 60Hz
  const RING_CAPACITY = SHADOW_DELAY_AMNESIA + 1;
  const SHADOW_GRACE = 0.6;           // 影子成形动画期间不判定伤害
  const SHOT_INTERVAL = 1.5;          // 影子开火间隔
  const BULLET_SPEED = 780;
  const BULLET_RADIUS = 16;
  const BULLET_HIT_RADIUS = 13.5;
  const BULLET_LOW_H = 18;            // 低弹：必须跳过去
  const BULLET_HIGH_H = 80;           // 高弹：必须蹲下去
  const MAX_HP = 1;                   // 规则：只有一滴血

  const CHAR_SCALE = 1.3;
  const HITBOX_STAND_H = 92;
  const HITBOX_CROUCH_H = 54;

  const SHOT_TEXTS = ['如果', '后悔', '都怪你', '来不及', '丢脸', '没用', '重来', '记得吗'];

  const KEY_LEFT = new Set(['ArrowLeft', 'KeyA']);
  const KEY_RIGHT = new Set(['ArrowRight', 'KeyD']);
  const KEY_JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
  const KEY_DOWN = new Set(['ArrowDown', 'KeyS']);

  // ============================================================
  // 三幕“后悔时刻”
  // ============================================================
  const SCENES = [
    {
      key: 'exam',
      act: '第一幕',
      actLabel: '第一幕 / 共三幕',
      name: '高考考场',
      mood: '焦虑 · 时间压迫',
      accent: '#ff394f',
      accentRgb: '255, 57, 79',
      sky: ['#040508', '#0b0c10', '#1c1e23', '#05060a'],
      fog: 'rgba(210, 220, 230, 0.13)',
      mote: '#dbe7ef',
      ground: '#0e0f13',
      groundLight: 'rgba(220, 228, 238, 0.15)',
      quotes: [
        '没涂答题卡',
        '那道大题选错了',
        '还有五分钟收卷',
        '答题卡漏了一面',
        '这道题讲过无数遍',
        '复读一年吧',
        '又改错了',
        '时间不够了',
      ],
    },
    {
      key: 'confession',
      act: '第二幕',
      actLabel: '第二幕 / 共三幕',
      name: '尴尬表白现场',
      mood: '社死 · 被注视',
      accent: '#ff4f8b',
      accentRgb: '255, 79, 139',
      sky: ['#0b020a', '#1d0619', '#3a0b28', '#0d0209'],
      fog: 'rgba(255, 90, 150, 0.13)',
      mote: '#ffb3cd',
      ground: '#140611',
      groundLight: 'rgba(255, 110, 160, 0.2)',
      quotes: [
        '她拒绝了你',
        '全场都在笑',
        '手机在录像',
        'ta只当你是朋友',
        '别自作多情',
        '所有人都在看你',
        '玫瑰掉了一地',
        '快逃',
      ],
    },
    {
      key: 'office',
      act: '第三幕',
      actLabel: '第三幕 / 共三幕',
      name: '深夜的职场',
      mood: '疲惫 · 甩锅',
      accent: '#ff465c',
      accentRgb: '255, 70, 92',
      sky: ['#01040a', '#030b16', '#071a2c', '#02060c'],
      fog: 'rgba(70, 150, 255, 0.11)',
      mote: '#8ecbff',
      ground: '#050a12',
      groundLight: 'rgba(110, 180, 255, 0.16)',
      quotes: [
        '如果当时不辞职',
        '老板的臭骂',
        '需求又改了',
        '今晚通宵',
        '99+ 未读',
        '这锅你背一下',
        '明早就要',
        '辛苦了，再改改',
      ],
    },
  ];

  // ============================================================
  // 心理防御机制（增益）
  // ============================================================
  const BUFFS = {
    amnesia: {
      name: '选择性失忆',
      text: '时间会冲淡一切',
      color: '#6fe9ff',
      rgb: '111, 233, 255',
      duration: 10,
    },
    aq: {
      name: '阿Q精神',
      text: '错的不是我，是这个世界',
      color: '#ffd166',
      rgb: '255, 209, 102',
      duration: 2,
    },
    sprint: {
      name: '猛猛冲刺',
      text: '只要跑得够快，悲伤就追不上我',
      color: '#ff7ab6',
      rgb: '255, 122, 182',
      duration: 3,
    },
  };

  // ============================================================
  // 配色（纯代码绘制）
  // ============================================================
  const PLAYER_PALETTE = {
    backLimb: 'rgba(88, 188, 220, 0.55)',
    frontLimb: '#8ef0ff',
    frontFoot: '#bffbff',
    joint: 'rgba(230, 255, 255, 0.92)',
    torsoTop: 'rgba(216, 254, 255, 0.95)',
    torsoMid: 'rgba(120, 235, 255, 0.85)',
    torsoBottom: 'rgba(52, 140, 190, 0.65)',
    torsoStroke: 'rgba(226, 255, 255, 0.9)',
    torsoCore: 'rgba(255, 255, 255, 0.75)',
    neck: 'rgba(190, 250, 255, 0.85)',
    headFill: 'rgba(8, 25, 38, 0.85)',
    headStroke: '#d8feff',
    visor: '#eaffff',
    core: 'rgba(255, 255, 255, 0.95)',
    coreGlow: 'rgba(125, 249, 255, 0.9)',
    glowInner: 'rgba(110, 245, 255, 0.20)',
    glowMid: 'rgba(90, 200, 255, 0.05)',
    glowOuter: 'rgba(90, 200, 255, 0)',
    glowColor: 'rgba(96, 236, 255, 0.85)',
    ribbonStart: 'rgba(150, 250, 255, 0.55)',
    ribbonEnd: 'rgba(120, 220, 255, 0)',
    ribbon2: 'rgba(150, 250, 255, 0.35)',
    orbiters: true,
    orbit: 'rgba(125, 249, 255, 0.4)',
  };

  const SHADOW_PALETTE = {
    backLimb: 'rgba(70, 10, 18, 0.7)',
    frontLimb: 'rgba(150, 26, 42, 0.85)',
    frontFoot: 'rgba(220, 60, 82, 0.85)',
    joint: 'rgba(255, 76, 98, 0.75)',
    torsoTop: 'rgba(88, 10, 22, 0.9)',
    torsoMid: 'rgba(48, 5, 12, 0.92)',
    torsoBottom: 'rgba(18, 2, 6, 0.95)',
    torsoStroke: 'rgba(255, 74, 98, 0.55)',
    torsoCore: 'rgba(255, 90, 110, 0.65)',
    neck: 'rgba(210, 50, 70, 0.7)',
    headFill: 'rgba(8, 1, 4, 0.95)',
    headStroke: 'rgba(255, 74, 98, 0.8)',
    visor: 'rgba(255, 54, 76, 0.95)',
    core: 'rgba(255, 70, 92, 0.75)',
    coreGlow: 'rgba(255, 36, 66, 0.9)',
    glowInner: 'rgba(255, 46, 74, 0.20)',
    glowMid: 'rgba(150, 10, 35, 0.06)',
    glowOuter: 'rgba(150, 10, 35, 0)',
    glowColor: 'rgba(255, 46, 74, 0.75)',
    ribbonStart: 'rgba(255, 60, 84, 0.45)',
    ribbonEnd: 'rgba(255, 60, 84, 0)',
    ribbon2: 'rgba(255, 80, 100, 0.3)',
    orbiters: false,
    orbit: 'rgba(255, 46, 74, 0)',
  };

  // ============================================================
  // 状态
  // ============================================================
  const view = { w: 0, h: 0, dpr: 1 };
  const world = { groundY: 0 };
  const camera = { x: 0, prevX: 0, anchor: 0 };

  const player = {
    worldX: 0,
    prevWorldX: 0,
    furthestX: 0,
    y: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    onGround: true,
    coyote: COYOTE_TIME,
    jumpBuffer: 0,
    runPhase: 0,
    runBlend: 0,
    airBlend: 0,
    crouchBlend: 0,
    squash: 1,
    facing: 1,
    startX: 0,
    slowTimer: 0,
    reverseTimer: 0,
    stunCooldown: 0,
    amnesiaTimer: 0,
    invincibleTimer: 0,
    sprintTimer: 0,
  };

  const game = {
    phase: 'intro',       // intro | running | dead | ending
    hp: MAX_HP,
    shadowAge: 0,         // 影子成形时间
    introTimer: 0,
    shake: 0,
    hitFlash: 0,
    edgeFlash: 0,
  };

  const keys = new Set();
  const bullets = [];
  const particles = [];
  const bg = { motes: [] };
  const statics = [];
  const dynamics = [];
  const pickups = [];
  const rings = [];
  const quotes = [];
  const toasts = [];

  let sceneIndex = 0;
  let scene = SCENES[0];
  let quoteTimer = 0.8;
  let dynamicTimer = 3.2;
  let potTimer = 6.5;
  let buffHudText = '';

  // 整局统计（跨场景重试累计；完整重开时清零）
  const runStats = { damage: 0 };

  // 环形队列：容量覆盖 4 秒延迟，正常读取 2 秒前，失忆时读取 4 秒前
  const shadowRing = new Array(RING_CAPACITY).fill(null);
  let shadowWrite = 0;
  let lastShadowDelay = SHADOW_DELAY_NORMAL;
  let shadowPose = null;
  let shadowPrevPose = null;
  let fireTimer = SHOT_INTERVAL;
  let shotCount = 0;

  let elapsed = 0;
  let hudPercent = -1;
  let dustAccumulator = 0;
  let initialized = false;

  // ============================================================
  // 工具
  // ============================================================
  const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function hash(n) {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return v - Math.floor(v);
  }

  function anyKeyHeld(set) {
    for (const k of set) {
      if (keys.has(k)) return true;
    }
    return false;
  }

  function progressRatio() {
    return clamp((player.furthestX - player.startX) / SCENE_LENGTH, 0, 1);
  }

  // ============================================================
  // 尺寸 / 自适应
  // ============================================================
  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    world.groundY = Math.round(view.h * 0.76);
    camera.anchor = Math.round(view.w / 3);

    if (!initialized) {
      initialized = true;
      player.startX = camera.anchor;
      player.worldX = camera.anchor;
      player.prevWorldX = camera.anchor;
      player.furthestX = camera.anchor;
      camera.x = 0;
      camera.prevX = 0;
    } else {
      camera.x = Math.max(0, player.worldX - camera.anchor);
      camera.prevX = camera.x;
    }

    buildMotes();
  }

  // ============================================================
  // 环境微尘
  // ============================================================
  function buildMotes() {
    bg.motes.length = 0;
    const count = clamp(Math.round((view.w * view.h) / 24000), 24, 110);
    for (let i = 0; i < count; i++) {
      bg.motes.push({
        x: Math.random() * view.w,
        y: Math.random() * view.h,
        r: 0.6 + Math.random() * 1.6,
        speed: 8 + Math.random() * 26,
        alpha: 0.06 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ============================================================
  // 输入
  // ============================================================
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;

    if (e.code === 'KeyM') {
      sfx.toggleMuted();
      return;
    }

    if (e.code === 'KeyR' && (game.phase === 'dead' || game.phase === 'ending')) {
      if (game.phase === 'dead') restartScene();
      else restartGame();
      return;
    }

    if (keys.has(e.code)) return;
    keys.add(e.code);
    if (KEY_JUMP.has(e.code)) player.jumpBuffer = JUMP_BUFFER_TIME;
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  window.addEventListener('blur', () => {
    keys.clear();
  });

  elRestart.addEventListener('click', restartScene);
  elEndingRestart.addEventListener('click', restartGame);

  // ============================================================
  // 场景装载 / 重开
  // ============================================================
  function restartScene() {
    elRestart.blur();
    loadScene(sceneIndex, false);
  }

  function restartGame() {
    elEndingRestart.blur();
    startNewRun();
  }

  function startNewRun() {
    runStats.damage = 0;
    loadScene(0, true);
  }

  function loadScene(index, showIntro) {
    sceneIndex = clamp(index, 0, SCENES.length - 1);
    scene = SCENES[sceneIndex];

    elDeath.classList.remove('show');
    elEnding.classList.remove('show');

    player.startX = camera.anchor;
    player.worldX = player.startX;
    player.prevWorldX = player.startX;
    player.furthestX = player.startX;
    player.y = 0;
    player.prevY = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.coyote = COYOTE_TIME;
    player.jumpBuffer = 0;
    player.runPhase = 0;
    player.runBlend = 0;
    player.airBlend = 0;
    player.crouchBlend = 0;
    player.squash = 1;
    player.facing = 1;
    player.slowTimer = 0;
    player.reverseTimer = 0;
    player.stunCooldown = 0;
    player.amnesiaTimer = 0;
    player.invincibleTimer = 0;
    player.sprintTimer = 0;

    camera.x = 0;
    camera.prevX = 0;

    shadowRing.fill(null);
    shadowWrite = 0;
    lastShadowDelay = SHADOW_DELAY_NORMAL;
    shadowPose = null;
    shadowPrevPose = null;
    fireTimer = SHOT_INTERVAL;
    shotCount = 0;

    bullets.length = 0;
    particles.length = 0;
    statics.length = 0;
    dynamics.length = 0;
    pickups.length = 0;
    rings.length = 0;
    quotes.length = 0;
    toasts.length = 0;
    dustAccumulator = 0;
    elapsed = 0;
    quoteTimer = 1.0;
    dynamicTimer = 4.0;
    potTimer = 8.0;

    buildSceneObstacles();
    buildPickups();

    game.phase = showIntro ? 'intro' : 'running';
    game.hp = MAX_HP;
    game.shadowAge = 0;
    game.introTimer = showIntro ? SCENE_INTRO_TIME : 0;
    game.shake = 0;
    game.hitFlash = 0;
    game.edgeFlash = 0;

    hudPercent = -1;
    buffHudText = null;
    updateHud();
    updateHp();
    updateBuffHud();

    elSceneLabel.textContent = scene.act + ' · ' + scene.name;
    elDeathScene.textContent = scene.act + ' · ' + scene.name;

    if (showIntro) showSceneCard();
    else hideSceneCard();
  }

  function showSceneCard() {
    elSceneAct.textContent = scene.actLabel;
    elSceneName.textContent = scene.name;
    elSceneMood.textContent = scene.mood;
    elSceneCard.style.setProperty('--accent', scene.accent);
    elSceneCard.classList.add('show');
  }

  function hideSceneCard() {
    elSceneCard.classList.remove('show');
  }

  function flashScene(color) {
    elSceneFlash.style.background = color;
    elSceneFlash.animate(
      [{ opacity: 0.82 }, { opacity: 0 }],
      { duration: 700, easing: 'ease-out' }
    );
  }

  // ============================================================
  // 固定步长逻辑更新
  // ============================================================
  function update(dt) {
    elapsed += dt;

    // ---------- 过场 / 死亡 / 结局：只维持环境动画 ----------
    if (game.phase === 'intro') {
      updateAmbient(dt);
      updateQuotes(dt);
      updateToasts(dt);
      game.introTimer -= dt;
      if (game.introTimer <= 0) {
        game.phase = 'running';
        player.jumpBuffer = 0;
        hideSceneCard();
      }
      return;
    }

    if (game.phase !== 'running') {
      updateAmbient(dt);
      updateQuotes(dt);
      updateToasts(dt);
      return;
    }

    player.prevWorldX = player.worldX;
    player.prevY = player.y;
    camera.prevX = camera.x;

    player.slowTimer = Math.max(0, player.slowTimer - dt);
    player.reverseTimer = Math.max(0, player.reverseTimer - dt);
    player.stunCooldown = Math.max(0, player.stunCooldown - dt);
    player.amnesiaTimer = Math.max(0, player.amnesiaTimer - dt);
    player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);
    player.sprintTimer = Math.max(0, player.sprintTimer - dt);

    // ---------- 水平移动 ----------
    let dir = 0;
    if (anyKeyHeld(KEY_RIGHT)) dir = 1;
    else if (anyKeyHeld(KEY_LEFT)) dir = -1;

    // 聚光灯眩晕：左右操作反向
    if (player.reverseTimer > 0) dir = -dir;

    const slowed = player.slowTimer > 0;
    const sprinting = player.sprintTimer > 0;
    const accel = (slowed ? RUN_ACCEL * 0.5 : RUN_ACCEL) * (sprinting ? 1.8 : 1);
    const maxSpeed = (slowed ? RUN_MAX * 0.38 : RUN_MAX) * (sprinting ? 1.5 : 1);

    if (dir !== 0) {
      player.vx += dir * accel * dt;
      player.facing = dir;
    } else {
      const drag = RUN_DRAG * dt;
      player.vx = Math.abs(player.vx) <= drag
        ? 0
        : player.vx - Math.sign(player.vx) * drag;
    }

    player.vx = clamp(player.vx, -maxSpeed * 0.7, maxSpeed);
    player.worldX += player.vx * dt;

    const finishX = player.startX + SCENE_LENGTH;
    if (player.worldX < player.startX) {
      player.worldX = player.startX;
      player.vx = Math.max(0, player.vx);
    } else if (player.worldX > finishX) {
      player.worldX = finishX;
      player.vx = Math.min(0, player.vx);
    }

    // ---------- 跳跃（重力）----------
    player.coyote = player.onGround
      ? COYOTE_TIME
      : Math.max(0, player.coyote - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = JUMP_SPEED;
      player.onGround = false;
      player.jumpBuffer = 0;
      player.coyote = 0;
      player.squash = 1.18;
      spawnDust(player.worldX, 2, 6, 0.55);
      sfx.jump();
    }

    const gravityScale = player.vy > 0 && !anyKeyHeld(KEY_JUMP) ? 1.9 : 1;
    player.vy -= GRAVITY * gravityScale * dt;
    player.y += player.vy * dt;

    if (player.y <= 0) {
      if (!player.onGround) {
        const impact = clamp(Math.abs(player.vy) / JUMP_SPEED, 0.2, 1);
        player.squash = 1 - 0.3 * impact;
        spawnDust(player.worldX, 1, 8 + Math.round(impact * 10), 0.45 + impact * 0.5);
      }
      player.y = 0;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // ---------- 下蹲 ----------
    const downHeld = anyKeyHeld(KEY_DOWN);
    const crouchTarget = downHeld && player.onGround ? 1 : 0;
    player.crouchBlend += (crouchTarget - player.crouchBlend) * Math.min(1, dt * 16);

    // ---------- 姿态动画 ----------
    player.squash += (1 - player.squash) * Math.min(1, dt * 10);

    const speedRatio = Math.abs(player.vx) / RUN_MAX;
    const targetRun = player.onGround
      ? clamp(speedRatio * 1.25, 0, 1) * (1 - 0.45 * player.crouchBlend)
      : 0.4;
    player.runBlend += (targetRun - player.runBlend) * Math.min(1, dt * 9);
    player.airBlend += ((player.onGround ? 0 : 1) - player.airBlend) * Math.min(1, dt * 12);
    player.runPhase += dt * (5 + speedRatio * 15) * (player.onGround ? 1 : 0.35);

    player.furthestX = Math.max(player.furthestX, player.worldX);

    // ---------- 抵达“释怀之门” ----------
    if (player.worldX >= finishX - 2) {
      completeScene();
      return;
    }

    // ---------- 增益拾取 ----------
    updatePickups();
    updateRings(dt);

    // ---------- 场景障碍 ----------
    updateSceneHazards(dt);
    if (game.phase !== 'running') return;

    // ---------- 相机 ----------
    const camTarget = Math.max(0, player.worldX - camera.anchor);
    camera.x += (camTarget - camera.x) * Math.min(1, dt * CAMERA_EASE);

    // ---------- 环形队列：按当前延迟读取快照 ----------
    const shadowDelay = player.amnesiaTimer > 0
      ? SHADOW_DELAY_AMNESIA
      : SHADOW_DELAY_NORMAL;
    const readIndex = (shadowWrite - shadowDelay + RING_CAPACITY) % RING_CAPACITY;

    // 延迟突变时不做插值，避免影子被拉成一条长线
    shadowPrevPose = shadowDelay !== lastShadowDelay ? null : shadowPose;
    lastShadowDelay = shadowDelay;
    shadowPose = shadowRing[readIndex];
    shadowRing[shadowWrite] = capturePose();
    shadowWrite = (shadowWrite + 1) % RING_CAPACITY;

    if (shadowPose) {
      game.shadowAge += dt;
    } else {
      game.shadowAge = 0;
    }

    // ---------- 影子开火 ----------
    if (shadowPose) {
      fireTimer -= dt;
      if (fireTimer <= 0) {
        fireTimer += SHOT_INTERVAL;
        fireBullet();
      }
    }

    updateBullets(dt);
    checkHits();
    if (game.phase !== 'running') return;

    // ---------- 奔跑扬尘 ----------
    if (player.onGround && Math.abs(player.vx) > 90) {
      dustAccumulator += dt * (4 + speedRatio * 16);
      while (dustAccumulator >= 1) {
        dustAccumulator -= 1;
        spawnDust(
          player.worldX - player.facing * 8,
          2,
          1,
          0.35 + speedRatio * 0.3
        );
      }
    } else {
      dustAccumulator = 0;
    }

    updateParticles(dt);
    updateQuotes(dt);
    updateToasts(dt);

    for (const m of bg.motes) {
      m.x -= m.speed * dt;
      m.y += Math.sin(elapsed * 0.8 + m.phase) * 4 * dt;
      if (m.x < -12) {
        m.x = view.w + 12;
        m.y = Math.random() * view.h;
      }
    }

    game.shake = Math.max(0, game.shake - dt * 1.4);
    game.hitFlash = Math.max(0, game.hitFlash - dt * 1.1);
    game.edgeFlash = Math.max(0, game.edgeFlash - dt * 1.6);

    updateHud();
    updateBuffHud();
  }

  function updateAmbient(dt) {
    game.shake = Math.max(0, game.shake - dt * 1.4);
    game.hitFlash = Math.max(0, game.hitFlash - dt * 1.1);
    game.edgeFlash = Math.max(0, game.edgeFlash - dt * 1.6);
    updateParticles(dt);

    for (const m of bg.motes) {
      m.x -= m.speed * dt;
      m.y += Math.sin(elapsed * 0.8 + m.phase) * 4 * dt;
      if (m.x < -12) {
        m.x = view.w + 12;
        m.y = Math.random() * view.h;
      }
    }
  }

  // 一次 60Hz 快照（环形队列元素）
  function capturePose() {
    return {
      worldX: player.worldX,
      y: player.y,
      facing: player.facing,
      runPhase: player.runPhase,
      runBlend: player.runBlend,
      airBlend: player.airBlend,
      crouchBlend: player.crouchBlend,
    };
  }

  function lerpPose(a, b, t) {
    return {
      worldX: lerp(a.worldX, b.worldX, t),
      y: lerp(a.y, b.y, t),
      facing: b.facing,
      runPhase: lerp(a.runPhase, b.runPhase, t),
      runBlend: lerp(a.runBlend, b.runBlend, t),
      airBlend: lerp(a.airBlend, b.airBlend, t),
      crouchBlend: lerp(a.crouchBlend, b.crouchBlend, t),
    };
  }

  // ============================================================
  // 文字弹幕
  // ============================================================
  function fireBullet() {
    if (!shadowPose) return;

    const isHigh = shotCount % 2 === 1;
    bullets.push({
      worldX: shadowPose.worldX + 24,
      height: isHigh ? BULLET_HIGH_H : BULLET_LOW_H,
      spin: Math.random() * Math.PI * 2,
      text: SHOT_TEXTS[Math.floor(Math.random() * SHOT_TEXTS.length)],
      age: 0,
    });
    shotCount++;

    game.edgeFlash = Math.max(game.edgeFlash, 0.42);

    for (let i = 0; i < 5; i++) {
      particles.push({
        x: shadowPose.worldX + 24 + Math.random() * 12,
        y: (isHigh ? BULLET_HIGH_H : BULLET_LOW_H) + (Math.random() - 0.5) * 14,
        vx: 90 + Math.random() * 170,
        vy: 40 + Math.random() * 120,
        life: 0.22 + Math.random() * 0.28,
        maxLife: 0.5,
        size: 1.2 + Math.random() * 2.2,
        tint: 'pink',
      });
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.worldX += BULLET_SPEED * dt;
      b.spin += dt * 3.2;
      b.age += dt;
      if (b.age > 9 || b.worldX > camera.x + view.w + 300) {
        bullets.splice(i, 1);
      }
    }
  }

  // ============================================================
  // 碰撞 / 死亡
  // ============================================================
  function hitboxFor(pose) {
    const c = pose.crouchBlend || 0;
    const w = lerp(26, 32, c);
    const h = lerp(HITBOX_STAND_H, HITBOX_CROUCH_H, c);
    return {
      left: pose.worldX - w / 2,
      right: pose.worldX + w / 2,
      bottom: pose.y,
      top: pose.y + h,
    };
  }

  function boxesOverlap(a, b) {
    return (
      a.left < b.right - 6 &&
      a.right > b.left + 6 &&
      a.bottom < b.top - 5 &&
      a.top > b.bottom + 5
    );
  }

  function bulletHitsBox(b, box) {
    const cx = clamp(b.worldX, box.left, box.right);
    const cy = clamp(b.height, box.bottom, box.top);
    const dx = b.worldX - cx;
    const dy = b.height - cy;
    return dx * dx + dy * dy < BULLET_HIT_RADIUS * BULLET_HIT_RADIUS;
  }

  function checkHits() {
    if (game.phase !== 'running') return;

    const pb = hitboxFor({
      worldX: player.worldX,
      y: player.y,
      crouchBlend: player.crouchBlend,
    });

    if (shadowPose && game.shadowAge > SHADOW_GRACE) {
      const sb = hitboxFor(shadowPose);
      if (boxesOverlap(pb, sb)) {
        die('shadow');
        return;
      }
    }

    for (const b of bullets) {
      if (bulletHitsBox(b, pb)) {
        die('bullet');
        return;
      }
    }
  }

  const DEATH_INFO = {
    shadow: {
      title: '被回忆追上了',
      sub: '你停下的一瞬间，2 秒前的自己就贴了上来。',
    },
    bullet: {
      title: '被一句话击穿了',
      sub: '那些扎心的文字，也是从你自己的心里长出来的。',
    },
    pendulum: {
      title: '时间不够了！',
      sub: '那根巨大的指针替你数完了最后几秒，考场没有等你。',
    },
    pot: {
      title: '背锅侠',
      sub: '一口巨大的黑锅从前方滚来，而你没能躲开。',
    },
  };

  function die(cause) {
    if (game.phase !== 'running') return;
    if (player.invincibleTimer > 0) return;

    runStats.damage += 1;
    game.phase = 'dead';
    game.hp = 0;
    game.shake = 0.7;
    game.hitFlash = 0.75;
    keys.clear();
    sfx.hit();

    const info = DEATH_INFO[cause] || DEATH_INFO.shadow;
    elDeathTitle.textContent = info.title;
    elDeathSub.textContent = info.sub;
    elDeathScene.textContent = scene.act + ' · ' + scene.name;
    elDeathProgress.textContent = Math.floor(progressRatio() * 100) + '%';
    elDeath.classList.add('show');

    updateHp();
  }

  function updateHp() {
    elHp.textContent = game.hp + ' / ' + MAX_HP;
    elLifePip.classList.toggle('lost', game.hp <= 0);
  }

  function updateHud() {
    const pct = Math.floor(progressRatio() * 100 + 1e-6);
    if (pct !== hudPercent) {
      hudPercent = pct;
      elPercent.textContent = pct + '%';
      elFill.style.width = pct + '%';
    }
  }

  // ============================================================
  // 三幕障碍系统
  // ============================================================
  function buildSceneObstacles() {
    statics.length = 0;
    dynamics.length = 0;

    const rnd = (n) => hash(n + sceneIndex * 101.7);
    let x = 1400;
    let i = 0;

    while (x < SCENE_LENGTH - 1700) {
      const roll = rnd(i * 3.7 + 1);

      if (scene.key === 'exam') {
        if (roll < 0.62) {
          statics.push({ kind: 'paper', worldX: x, w: 60, h: 46, seed: i, hit: false });
        } else {
          statics.push({
            kind: 'pendulum',
            worldX: x,
            phase: rnd(i * 5.1 + 2) * Math.PI * 2,
          });
        }
      } else if (scene.key === 'confession') {
        if (roll < 0.72) {
          const count = 2 + Math.floor(rnd(i * 4.3 + 3) * 2);
          for (let c = 0; c < count; c++) {
            statics.push({
              kind: 'heart',
              worldX: x + c * 62,
              w: 50,
              h: 24,
              seed: i * 7 + c,
              hit: false,
            });
          }
        } else {
          statics.push({
            kind: 'spotlight',
            worldX: x,
            phase: rnd(i * 6.7 + 4) * Math.PI * 2,
          });
        }
      } else {
        statics.push({ kind: 'coffee', worldX: x, w: 54, h: 28, seed: i, hit: false });
        if (roll > 0.78) {
          statics.push({ kind: 'coffee', worldX: x + 72, w: 54, h: 28, seed: i + 9, hit: false });
        }
      }

      x += 880 + rnd(i * 8.9 + 5) * 680;
      i++;
    }
  }

  function playerBox() {
    return hitboxFor({
      worldX: player.worldX,
      y: player.y,
      crouchBlend: player.crouchBlend,
    });
  }

  // ---------- 每幕随机摆放心理防御方块 ----------
  function buildPickups() {
    pickups.length = 0;

    const types = ['amnesia', 'aq', 'sprint'];
    const offset = Math.floor(hash(sceneIndex * 19.7) * 3);
    const slots = [3600, 7400, 11200, 15000, 18800];

    for (let i = 0; i < slots.length; i++) {
      let x = slots[i] + hash(sceneIndex * 7.1 + i * 3.3) * 650;

      // 避开大型空中机关
      for (const o of statics) {
        if ((o.kind === 'pendulum' || o.kind === 'spotlight') &&
            Math.abs(o.worldX - x) < 300) {
          x += 480;
          break;
        }
      }

      // 避开地面障碍
      for (const o of statics) {
        if ((o.kind === 'paper' || o.kind === 'heart' || o.kind === 'coffee') &&
            Math.abs(o.worldX - x) < 150) {
          x += 220;
          break;
        }
      }

      x = Math.min(x, SCENE_LENGTH - 1200);

      pickups.push({
        worldX: x,
        height: i % 2 === 0 ? 58 : 132,
        type: types[(i + offset) % types.length],
        seed: hash(sceneIndex * 5.9 + i * 1.7) * 6.28,
      });
    }
  }

  function updatePickups() {
    const bodyCenter = player.y + 46;

    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (Math.abs(player.worldX - p.worldX) > 36) continue;
      if (Math.abs(bodyCenter - p.height) > 54) continue;

      const buff = BUFFS[p.type];
      const x = p.worldX;
      const height = p.height;

      pickups.splice(i, 1);
      activateBuff(p.type);

      rings.push({
        worldX: x,
        height,
        life: 0.65,
        maxLife: 0.65,
        color: buff.color,
      });

      spawnBurst(
        x,
        height,
        p.type === 'aq' ? 'gold' : p.type === 'sprint' ? 'pink' : 'cyan',
        20,
        1.2
      );
    }
  }

  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
  }

  function activateBuff(type) {
    const buff = BUFFS[type];
    if (!buff) return;

    if (type === 'amnesia') {
      player.amnesiaTimer = Math.max(player.amnesiaTimer, buff.duration);
    } else if (type === 'aq') {
      player.invincibleTimer = Math.max(player.invincibleTimer, buff.duration);
      player.slowTimer = 0;
      player.reverseTimer = 0;
    } else if (type === 'sprint') {
      player.sprintTimer = Math.max(player.sprintTimer, buff.duration);
      player.slowTimer = 0;
    }

    addToast('【' + buff.name + '】' + buff.text, buff.color, 18, 2.4);
    sfx.pickup();
    updateBuffHud();
  }

  function updateBuffHud() {
    const bits = [];
    let color = BUFFS.amnesia.color;

    if (player.amnesiaTimer > 0) {
      bits.push('选择性失忆 ' + Math.ceil(player.amnesiaTimer) + 's');
    }
    if (player.sprintTimer > 0) {
      bits.push('猛猛冲刺 ' + Math.ceil(player.sprintTimer) + 's');
      color = BUFFS.sprint.color;
    }
    if (player.invincibleTimer > 0) {
      bits.push('阿Q精神 ' + Math.ceil(player.invincibleTimer) + 's');
      color = BUFFS.aq.color;
    }

    const text = bits.join(' · ');
    if (text === buffHudText || !elBuff) return;

    buffHudText = text;
    elBuff.textContent = text;
    elBuff.style.color = color;
    elBuff.classList.toggle('show', !!text);
  }

  function updateSceneHazards(dt) {
    const pb = playerBox();

    // ---------- 静态地面障碍 / 钟摆 / 聚光灯 ----------
    for (const o of statics) {
      if (o.kind === 'paper' || o.kind === 'heart' || o.kind === 'coffee') {
        if (o.hit) continue;
        const half = o.w / 2 + 13;
        if (Math.abs(player.worldX - o.worldX) > half) continue;
        if (player.y > o.h) continue;

        o.hit = true;
        if (o.kind === 'paper') {
          applySlow(0.9, '这题又错了');
          spawnBurst(o.worldX, 18, 'white', 10, 1);
        } else if (o.kind === 'heart') {
          applySlow(1.0, '心碎了一地，脚步也乱了');
          spawnBurst(o.worldX, 12, 'pink', 10, 1);
        } else {
          slipPlayer('今晚又要加班了');
          spawnBurst(o.worldX, 10, 'coffee', 12, 1);
        }
        continue;
      }

      if (o.kind === 'pendulum') {
        const bladeX = o.worldX + Math.sin(elapsed * 1.5 + o.phase) * 180;
        if (Math.abs(player.worldX - bladeX) > 46) continue;
        if (pb.top < 58 || pb.bottom > 104) continue;
        die('pendulum');
        return;
      }

      if (o.kind === 'spotlight') {
        if (player.stunCooldown > 0) continue;
        const spotX = o.worldX + Math.sin(elapsed * 0.66 + o.phase) * 135;
        if (Math.abs(player.worldX - spotX) > 66) continue;
        if (player.crouchBlend > 0.55) continue;
        if (player.y > 140) continue;
        stunPlayer();
      }
    }

    // ---------- 动态障碍生成 ----------
    if (player.worldX < SCENE_LENGTH - 1500) {
      dynamicTimer -= dt;
      if (dynamicTimer <= 0) {
        spawnDynamic();
        if (scene.key === 'exam') dynamicTimer = 3.0 + Math.random() * 1.2;
        else if (scene.key === 'confession') dynamicTimer = 4.8 + Math.random() * 1.6;
        else dynamicTimer = 3.4 + Math.random() * 1.2;
      }

      if (scene.key === 'office') {
        potTimer -= dt;
        if (potTimer <= 0) {
          spawnDynamic('pot');
          potTimer = 7.4 + Math.random() * 2.0;
        }
      }
    }

    // ---------- 动态障碍更新与碰撞 ----------
    for (let i = dynamics.length - 1; i >= 0; i--) {
      const d = dynamics[i];
      d.worldX -= d.speed * dt;
      d.age += dt;
      d.spin += dt * (d.kind === 'pot' ? 6 : 2.4);

      if (d.dead || d.age > 12 || d.worldX < camera.x - 420) {
        dynamics.splice(i, 1);
        continue;
      }

      if (d.kind === 'redX') {
        if (d.hit) continue;
        if (Math.abs(player.worldX - d.worldX) < 30 &&
            pb.bottom < d.height + 22 && pb.top > d.height - 22) {
          d.hit = true;
          applySlow(0.75, '又错一道');
          spawnBurst(d.worldX, d.height, 'red', 10, 1);
        }
      } else if (d.kind === 'hand') {
        if (d.hit) continue;
        if (Math.abs(player.worldX - d.worldX) < 44 &&
            pb.bottom < d.height + 32 && pb.top > d.height - 34) {
          d.hit = true;
          pushBackPlayer(125, '他们在背后指指点点');
          spawnBurst(d.worldX, d.height, 'pink', 8, 0.7);
        }
      } else if (d.kind === 'doc') {
        if (d.hit) continue;
        if (Math.abs(player.worldX - d.worldX) < 38 &&
            pb.bottom < d.height + 32 && pb.top > d.height - 32) {
          d.hit = true;
          applySlow(0.7, '需求又变了');
          pushBackPlayer(60, '');
          spawnBurst(d.worldX, d.height, 'white', 10, 0.9);
        }
      } else if (d.kind === 'pot') {
        if (Math.abs(player.worldX - d.worldX) < 50 && player.y < d.height + 20) {
          die('pot');
          return;
        }
      }
    }
  }

  function spawnDynamic(forceKind) {
    const x = camera.x + view.w + 160;
    const kind = forceKind ||
      (scene.key === 'exam' ? 'redX' :
        scene.key === 'confession' ? 'hand' : 'doc');

    if (kind === 'redX') {
      dynamics.push({
        kind: 'redX',
        worldX: x,
        height: 52 + Math.random() * 18,
        speed: 340,
        spin: Math.random() * Math.PI * 2,
        age: 0,
        hit: false,
      });
    } else if (kind === 'hand') {
      dynamics.push({
        kind: 'hand',
        worldX: x,
        height: 72,
        speed: 300,
        spin: 0,
        age: 0,
        hit: false,
        phase: Math.random() * Math.PI * 2,
      });
    } else if (kind === 'doc') {
      dynamics.push({
        kind: 'doc',
        worldX: x,
        height: 94,
        speed: 320,
        spin: Math.random() * Math.PI * 2,
        age: 0,
        hit: false,
      });
    } else if (kind === 'pot') {
      dynamics.push({
        kind: 'pot',
        worldX: camera.x + view.w + 220,
        height: 40,
        r: 40,
        speed: 620,
        spin: 0,
        age: 0,
        hit: false,
      });
    }
  }

  // ---------- 负面状态 ----------
  function applySlow(seconds, text) {
    if (player.invincibleTimer > 0) return;
    player.slowTimer = Math.max(player.slowTimer, seconds);
    player.vx *= 0.24;
    player.squash = 0.82;
    game.shake = Math.max(game.shake, 0.2);
    addToast(text);
  }

  function slipPlayer(text) {
    if (player.invincibleTimer > 0) return;
    player.vx = 0;
    player.slowTimer = Math.max(player.slowTimer, 1.2);
    player.squash = 0.7;
    game.shake = Math.max(game.shake, 0.38);
    addToast(text);
  }

  function stunPlayer() {
    if (player.invincibleTimer > 0) return;
    player.reverseTimer = 1.8;
    player.stunCooldown = 2.8;
    player.vx *= 0.28;
    game.shake = Math.max(game.shake, 0.55);
    addToast('所有人都在看你');
  }

  function pushBackPlayer(amount, text) {
    if (player.invincibleTimer > 0) return;
    player.worldX = Math.max(player.startX, player.worldX - amount);
    player.vx = Math.min(0, player.vx) * 0.3;
    player.runPhase += 1.4;
    game.shake = Math.max(game.shake, 0.4);
    if (text) addToast(text);
  }

  function spawnBurst(wx, y, tint, count, power) {
    const n = Math.max(1, Math.round(count));
    for (let i = 0; i < n; i++) {
      particles.push({
        x: wx + (Math.random() - 0.5) * 24,
        y: y + Math.random() * 10,
        vx: (Math.random() - 0.5) * 260 * power,
        vy: 50 + Math.random() * 220 * power,
        life: 0.32 + Math.random() * 0.5,
        maxLife: 0.82,
        size: 1.4 + Math.random() * 2.6,
        tint,
      });
    }
  }

  // ---------- 屏幕飘字 ----------
  function addToast(text, color, size, life) {
    const sx = clamp(player.worldX - camera.x, 100, view.w - 100);
    const duration = life || 1.5;

    toasts.push({
      text,
      x: sx,
      y: world.groundY - 185,
      life: duration,
      maxLife: duration,
      color: color || scene.accent,
      size: size || 16,
    });
  }

  function updateToasts(dt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) toasts.splice(i, 1);
    }
    if (toasts.length > 5) toasts.splice(0, toasts.length - 5);
  }

  // ---------- 场景漂浮刺痛文案 ----------
  function updateQuotes(dt) {
    quoteTimer -= dt;
    if (quoteTimer <= 0) {
      quoteTimer = 1.0 + Math.random() * 1.2;
      quotes.push({
        text: scene.quotes[Math.floor(Math.random() * scene.quotes.length)],
        x: view.w + 120 + Math.random() * 160,
        y: view.h * (0.16 + Math.random() * 0.44),
        size: 12 + Math.random() * 6,
        speed: 26 + Math.random() * 28,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.13 + Math.random() * 0.2,
      });
    }

    for (let i = quotes.length - 1; i >= 0; i--) {
      const q = quotes[i];
      q.x -= q.speed * dt;
      q.y += Math.sin(elapsed * 0.9 + q.phase) * 8 * dt;
      if (q.x < -280) quotes.splice(i, 1);
    }
    if (quotes.length > 18) quotes.splice(0, quotes.length - 18);
  }

  function completeScene() {
    if (game.phase !== 'running') return;

    bullets.length = 0;
    dynamics.length = 0;

    if (sceneIndex >= SCENES.length - 1) {
      game.phase = 'ending';

      if (elEndingDamage) {
        elEndingDamage.textContent = String(runStats.damage);
      }
      if (elEndingDamageNote) {
        elEndingDamageNote.textContent = runStats.damage === 0
          ? '你一次也没有被过去击中。'
          : '这是你被过去击中的次数。';
      }

      elEnding.classList.add('show');
      elEndingRestart.blur();
      sfx.pickup();
      return;
    }

    const next = SCENES[sceneIndex + 1];
    sfx.pickup();
    flashScene(next.accent);
    loadScene(sceneIndex + 1, true);
  }

  // ============================================================
  // 粒子
  // ============================================================
  function spawnDust(wx, y, count, power) {
    const n = Math.max(1, Math.round(count));
    for (let i = 0; i < n; i++) {
      particles.push({
        x: wx + (Math.random() - 0.5) * 18,
        y: y + Math.random() * 4,
        vx: -(30 + Math.random() * 150) * power,
        vy: 20 + Math.random() * 110 * power,
        life: 0.3 + Math.random() * 0.45,
        maxLife: 0.75,
        size: 1.4 + Math.random() * 2.4,
        tint: Math.random() > 0.82 ? 'pink' : 'cyan',
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy -= 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < 0) {
        p.y = 0;
        p.vy *= -0.3;
        p.vx *= 0.7;
      }
    }
    if (particles.length > 280) {
      particles.splice(0, particles.length - 280);
    }
  }

  // ============================================================
  // 绘图工具
  // ============================================================
  function heartPath(c, s) {
    c.beginPath();
    c.moveTo(0, s * 0.86);
    c.bezierCurveTo(-s * 0.98, s * 0.02, -s * 0.7, -s * 0.98, 0, -s * 0.34);
    c.bezierCurveTo(s * 0.7, -s * 0.98, s * 0.98, s * 0.02, 0, s * 0.86);
    c.closePath();
  }

  function crackPath(c, s) {
    c.beginPath();
    c.moveTo(0, -s * 0.34);
    c.lineTo(-s * 0.12, -s * 0.06);
    c.lineTo(s * 0.1, s * 0.16);
    c.lineTo(-s * 0.06, s * 0.44);
    c.lineTo(0, s * 0.86);
  }

  // ============================================================
  // 渲染
  // ============================================================
  function render(alpha) {
    const camX = lerp(camera.prevX, camera.x, alpha);

    // 清屏，避免镜头震动时露出上一帧残影
    ctx.fillStyle = '#020205';
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();

    if (game.shake > 0) {
      const amount = game.shake * game.shake;
      ctx.translate(
        (Math.random() - 0.5) * 26 * amount,
        (Math.random() - 0.5) * 18 * amount
      );
    }

    drawSky(camX);
    drawFar(camX);
    drawFloaters(camX);
    drawMid(camX);
    drawGround(camX);
    drawQuotes();
    drawGoal(camX);
    drawStatics(camX);
    drawPickups(camX);
    drawShadow(alpha, camX);
    drawParticles(camX);
    drawSpeedStreaks(camX);
    drawPlayer(alpha, camX);
    drawDynamics(camX);
    drawRings(camX);
    drawBullets(camX);
    drawEdgeWarning(camX);

    ctx.restore();

    drawToasts();
    drawDamageFlash();
  }

  function drawSky(camX) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, scene.sky[0]);
    g.addColorStop(0.42, scene.sky[1]);
    g.addColorStop(0.72, scene.sky[2]);
    g.addColorStop(1, scene.sky[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    const glow = ctx.createRadialGradient(
      view.w * 0.52, world.groundY, 0,
      view.w * 0.52, world.groundY, Math.max(view.w, view.h) * 0.8
    );
    glow.addColorStop(0, scene.fog);
    glow.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.w, view.h);

    // 场景专属的远处光
    if (scene.key === 'confession') {
      const beam = ctx.createRadialGradient(
        view.w * 0.5, view.h * 0.34, 10,
        view.w * 0.5, view.h * 0.34, view.w * 0.55
      );
      beam.addColorStop(0, 'rgba(255, 80, 150, 0.08)');
      beam.addColorStop(1, 'rgba(255, 80, 150, 0)');
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, view.w, view.h);
    } else if (scene.key === 'office') {
      const monitor = ctx.createRadialGradient(
        view.w * 0.68, world.groundY - 80, 10,
        view.w * 0.68, world.groundY - 80, view.w * 0.5
      );
      monitor.addColorStop(0, 'rgba(70, 150, 255, 0.10)');
      monitor.addColorStop(1, 'rgba(70, 150, 255, 0)');
      ctx.fillStyle = monitor;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    // 漂浮微尘
    for (const m of bg.motes) {
      const twinkle = 0.55 + 0.45 * Math.sin(elapsed * 1.4 + m.phase);
      ctx.globalAlpha = m.alpha * twinkle;
      ctx.fillStyle = scene.mote;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 考场墙上的巨型时钟（可复用远景道具）
  function drawWallClock(x, y, r) {
    if (x < -r * 2 || x > view.w + r * 2) return;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(9, 10, 13, 0.6)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(215, 225, 235, 0.14)';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(215, 225, 235, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(230, 236, 242, 0.22)';
    ctx.lineWidth = Math.max(1, r * 0.012);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84);
      ctx.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
      ctx.stroke();
    }

    // 外圈断裂的刻度
    ctx.strokeStyle = 'rgba(215, 225, 235, 0.06)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.26, -1.35, 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.42, 2.2, 3.9);
    ctx.stroke();

    // 红色批改裂纹
    ctx.strokeStyle = 'rgba(' + scene.accentRgb + ', 0.28)';
    ctx.lineWidth = Math.max(1, r * 0.012);
    ctx.beginPath();
    ctx.moveTo(r * 0.04, -r * 0.96);
    ctx.lineTo(-r * 0.08, -r * 0.58);
    ctx.lineTo(r * 0.1, -r * 0.24);
    ctx.lineTo(-r * 0.04, r * 0.12);
    ctx.lineTo(r * 0.14, r * 0.44);
    ctx.lineTo(r * 0.02, r * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, -r * 0.58);
    ctx.lineTo(-r * 0.3, -r * 0.44);
    ctx.stroke();

    const hourA = elapsed * 0.03 - Math.PI / 2;
    const minuteA = elapsed * 0.36 - Math.PI / 2;
    const secondA = Math.floor(elapsed) * (Math.PI / 30) - Math.PI / 2;

    ctx.strokeStyle = 'rgba(225, 232, 240, 0.26)';
    ctx.lineWidth = Math.max(1.5, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(hourA) * r * 0.45, Math.sin(hourA) * r * 0.45);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(240, 246, 252, 0.32)';
    ctx.lineWidth = Math.max(1, r * 0.016);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(minuteA) * r * 0.68, Math.sin(minuteA) * r * 0.68);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(' + scene.accentRgb + ', 0.7)';
    ctx.lineWidth = Math.max(1, r * 0.018);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(secondA) * r * 0.76, Math.sin(secondA) * r * 0.76);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 70, 92, 0.65)';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, r * 0.035), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // 表白现场的霓虹破碎之心
  function drawNeonHeart(x, y, s, alpha) {
    if (x < -s * 2 || x > view.w + s * 2) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.1);

    const halo = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.8);
    halo.addColorStop(0, 'rgba(255, 70, 135, ' + (0.1 * alpha) + ')');
    halo.addColorStop(1, 'rgba(255, 70, 135, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'rgba(255, 70, 135, 0.65)';
    ctx.shadowBlur = 22;

    heartPath(ctx, s);
    ctx.fillStyle = 'rgba(255, 90, 150, ' + (0.035 * alpha) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 120, 175, ' + (0.55 * alpha) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();

    crackPath(ctx, s);
    ctx.strokeStyle = 'rgba(255, 200, 220, ' + (0.5 * alpha) + ')';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 130, 175, ' + (0.18 * alpha) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.26);
    ctx.lineTo(0, s * 0.1);
    ctx.lineTo(s * 0.5, -s * 0.26);
    ctx.stroke();

    ctx.restore();
  }

  function drawFar(camX) {
    if (scene.key === 'exam') drawExamFar(camX);
    else if (scene.key === 'confession') drawConfessionFar(camX);
    else drawOfficeFar(camX);
  }

  function drawExamFar(camX) {
    const gy = world.groundY;

    // 高而窄的考场窗户
    const winW = Math.min(view.w * 0.26, 340);
    const span = winW + 130;
    const off = (camX * 0.06) % span;
    const top = gy - Math.min(view.h * 0.64, 560);

    ctx.save();
    for (let x = -off - span; x < view.w + span; x += span) {
      ctx.fillStyle = 'rgba(200, 212, 224, 0.03)';
      ctx.fillRect(x, top, winW, gy - top);
      ctx.strokeStyle = 'rgba(200, 212, 224, 0.09)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, winW, gy - top);

      ctx.strokeStyle = 'rgba(200, 212, 224, 0.045)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const bx = x + (winW / 4) * k;
        ctx.beginPath();
        ctx.moveTo(bx, top);
        ctx.lineTo(bx, gy);
        ctx.stroke();
      }
      for (let k = 1; k < 4; k++) {
        const by = top + ((gy - top) / 4) * k;
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x + winW, by);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 墙上巨大的时钟
    const clocks = [800, 2400, 4000];
    for (const cx of clocks) {
      drawWallClock(
        cx - camX * 0.12,
        gy - Math.min(view.h * 0.42, 390),
        Math.min(view.w, view.h) * 0.17
      );
    }

    // 扭曲的数学公式
    const formulas = ['∫ 后悔 dt', 'x² − 1 = ?', 'P(重来) = 0', 'sin θ = ?', 'Σ 错题', 'lim 时间→0'];
    for (let i = 0; i < 24; i++) {
      const x = 260 + i * 360 - camX * 0.22;
      if (x < -260 || x > view.w + 260) continue;

      const y = gy - 100 - hash(i * 3.3 + 7) * view.h * 0.48;
      const size = 13 + hash(i * 5.1) * 12;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((hash(i * 7.7) - 0.5) * 0.4);
      ctx.globalAlpha = 0.07 + hash(i * 2.7) * 0.09;
      ctx.fillStyle = '#e0e7ee';
      ctx.font = '500 ' + size + 'px Consolas, "Courier New", monospace';
      ctx.fillText(formulas[i % formulas.length], 0, 0);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255, 57, 79, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.9);
      ctx.lineTo(60 + hash(i * 9.9) * 90, size * 0.9);
      ctx.stroke();
      ctx.restore();
    }

    // 刺眼的红色批改记号
    for (let i = 0; i < 8; i++) {
      const x = 500 + i * 1100 - camX * 0.18;
      if (x < -80 || x > view.w + 80) continue;

      const y = gy - 130 - hash(i * 6.1) * view.h * 0.4;
      const s = 12 + hash(i * 4.4) * 20;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((hash(i * 8.8) - 0.5) * 0.5);
      ctx.strokeStyle = 'rgba(' + scene.accentRgb + ', 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, s);
      ctx.moveTo(s, -s);
      ctx.lineTo(-s, s);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawConfessionFar(camX) {
    const gy = world.groundY;

    // 远方霓虹光斑
    for (let i = 0; i < 26; i++) {
      const x = i * 260 + 140 - camX * 0.12;
      if (x < -80 || x > view.w + 80) continue;

      const y = gy - 160 - hash(i * 4.6) * view.h * 0.55;
      const r = 1 + hash(i * 7.1) * 2.6;

      ctx.globalAlpha = 0.18 + hash(i * 2.2) * 0.3;
      ctx.fillStyle = hash(i * 3.9) > 0.35 ? '#ff6fa4' : '#8fd4ff';
      ctx.beginPath();
      ctx.arc(x + Math.sin(elapsed * 0.5 + i) * 8, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 巨型霓虹心
    const hearts = [900, 2800, 4700];
    for (let i = 0; i < hearts.length; i++) {
      const x = hearts[i] - camX * 0.15;
      const y = gy - 200 - hash(i * 3.3) * 100;
      const s = Math.min(view.w, view.h) * (0.07 + hash(i * 4.4) * 0.04);
      drawNeonHeart(x, y, s, 0.55 + 0.15 * Math.sin(elapsed * 1.2 + i));
    }

    // 舞台顶部的粉色帘线
    const off = (camX * 0.07) % 180;
    ctx.strokeStyle = 'rgba(255, 90, 150, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(view.w, 22);
    ctx.stroke();
    for (let x = -off; x < view.w + 180; x += 180) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 90, 40, x + 180, 0);
      ctx.stroke();
    }
  }

  function drawOfficeFar(camX) {
    const gy = world.groundY;

    // 落地窗与城市灯火
    const win = 340;
    const off = (camX * 0.05) % win;
    ctx.save();
    for (let x = -off - win; x < view.w + win; x += win) {
      const top = gy - Math.min(view.h * 0.6, 500);
      ctx.fillStyle = 'rgba(10, 26, 44, 0.35)';
      ctx.fillRect(x, top, win - 14, gy - top - 10);
      ctx.strokeStyle = 'rgba(95, 165, 235, 0.10)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, win - 14, gy - top - 10);

      ctx.fillStyle = 'rgba(120, 190, 255, 0.10)';
      for (let k = 0; k < 14; k++) {
        const px = x + 20 + hash(k * 3.1 + x * 0.01) * (win - 50);
        const py = gy - 80 - hash(k * 5.7 + x * 0.02) * (view.h * 0.3);
        ctx.fillRect(px, py, 2, 2);
      }
    }
    ctx.restore();

    // 深夜数字时钟
    const clocks = [
      { x: 1800, text: '01:47' },
      { x: 3700, text: '03:12' },
    ];
    for (const c of clocks) {
      const x = c.x - camX * 0.1;
      if (x < -200 || x > view.w + 200) continue;

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#7fd4ff';
      ctx.font = '600 46px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(90, 190, 255, 0.8)';
      ctx.shadowBlur = 20;
      ctx.fillText(c.text, x, gy - view.h * 0.36);
      ctx.restore();
    }

    // 巨型“99+”消息气泡
    const bubbles = [500, 2200, 3900, 5400];
    for (let i = 0; i < bubbles.length; i++) {
      drawChatBubble(
        bubbles[i] - camX * 0.22,
        gy - 260 - hash(i * 3.7) * 150,
        0.9 + hash(i * 6.2) * 0.5,
        0.5
      );
    }
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawChatBubble(x, y, scale, alpha) {
    if (x < -200 || x > view.w + 200) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const w = 132;
    const h = 76;

    ctx.fillStyle = 'rgba(7, 16, 28, ' + (0.55 * alpha) + ')';
    ctx.strokeStyle = 'rgba(105, 195, 255, ' + (0.35 * alpha) + ')';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 16);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-18, h / 2 - 2);
    ctx.lineTo(-6, h / 2 + 18);
    ctx.lineTo(8, h / 2 - 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(7, 16, 28, ' + (0.55 * alpha) + ')';
    ctx.fill();

    ctx.fillStyle = 'rgba(140, 215, 255, ' + (0.8 * alpha) + ')';
    ctx.font = '700 30px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(90, 190, 255, 0.8)';
    ctx.shadowBlur = 14;
    ctx.fillText('99+', 0, 2);
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function drawFloaters(camX) {
    if (scene.key === 'exam') drawExamFloat(camX);
    else if (scene.key === 'confession') drawPetalRain(camX);
    else drawOfficeFloat(camX);
  }

  function drawExamFloat(camX) {
    const gy = world.groundY;
    const off = camX * 0.32;

    for (let i = 0; i < 26; i++) {
      const x = i * 430 + 120 - off;
      if (x < -120 || x > view.w + 120) continue;

      const y = gy - 120 - hash(i * 4.4) * view.h * 0.5
        + Math.sin(elapsed * 0.7 + i) * 14;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(elapsed * 0.4 + i) * 0.18 + (hash(i * 2.2) - 0.5) * 0.3);

      const w = 30 + hash(i * 8.1) * 26;
      const h = w * 1.3;

      ctx.fillStyle = 'rgba(230, 236, 242, 0.05)';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(220, 230, 240, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      ctx.strokeStyle = 'rgba(220, 230, 240, 0.09)';
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 4, -h / 2 + (k * h) / 4);
        ctx.lineTo(w / 2 - 4, -h / 2 + (k * h) / 4);
        ctx.stroke();
      }

      if (i % 4 === 0) {
        ctx.strokeStyle = 'rgba(255, 57, 79, 0.22)';
        ctx.lineWidth = 1.6;
        const s = 6;
        ctx.beginPath();
        ctx.moveTo(-s, -s);
        ctx.lineTo(s, s);
        ctx.moveTo(s, -s);
        ctx.lineTo(-s, s);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawPetalRain(camX) {
    const wrapW = view.w + 80;
    const wrapH = view.h + 60;

    for (let i = 0; i < 38; i++) {
      const speed = 26 + hash(i * 3.1) * 40;
      const x = ((hash(i * 7.7) * view.w - elapsed * speed * 0.35 + camX * 0.06) % wrapW + wrapW) % wrapW - 40;
      const y = ((elapsed * speed + hash(i * 8.8) * view.h) % wrapH) - 30;
      const size = 2 + hash(i * 4.4) * 2.4;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(elapsed * 0.8 + i);
      ctx.globalAlpha = 0.22 + hash(i * 2.2) * 0.3;
      ctx.fillStyle = i % 5 === 0 ? '#ffd1e1' : '#ff7aa8';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.8, size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawOfficeFloat(camX) {
    const gy = world.groundY;
    const off = camX * 0.28;

    for (let i = 0; i < 22; i++) {
      const x = i * 480 + 200 - off;
      if (x < -100 || x > view.w + 100) continue;

      const y = gy - 160 - hash(i * 5.1) * view.h * 0.45
        + Math.sin(elapsed * 0.6 + i) * 8;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((hash(i * 6.6) - 0.5) * 0.3 + Math.sin(elapsed * 0.5 + i) * 0.1);

      ctx.fillStyle = 'rgba(160, 205, 235, 0.045)';
      ctx.fillRect(-18, -24, 36, 48);
      ctx.strokeStyle = 'rgba(160, 205, 235, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-18, -24, 36, 48);
      ctx.strokeStyle = 'rgba(160, 205, 235, 0.08)';
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(-13, -24 + k * 10);
        ctx.lineTo(13, -24 + k * 10);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 远处漂浮的小气泡
    for (let i = 0; i < 3; i++) {
      drawChatBubble(
        i * 1400 + 600 - camX * 0.38,
        gy - 320 - hash(i * 9.1) * 120,
        0.28,
        0.35
      );
    }
  }

  function drawMid(camX) {
    if (scene.key === 'exam') drawExamMid(camX);
    else if (scene.key === 'confession') drawConfessionMid(camX);
    else drawOfficeMid(camX);
  }

  // 高考考场：一排排课桌与考生的黑色剪影
  function drawExamMid(camX) {
    const gy = world.groundY;
    const spacing = 240;
    const parallax = camX * 0.45;
    const off = parallax % spacing;
    const baseIdx = Math.floor(parallax / spacing);

    for (let k = -1; k <= Math.ceil(view.w / spacing) + 1; k++) {
      const x = k * spacing - off;
      const idx = baseIdx + k;
      const wobble = hash(idx * 4.7);

      const top = gy - 78 - wobble * 6;

      // 坐在课桌后的考生剪影
      ctx.fillStyle = 'rgba(4, 5, 7, 0.82)';
      ctx.beginPath();
      ctx.moveTo(x + 50, gy);
      ctx.lineTo(x + 56, top - 26);
      ctx.quadraticCurveTo(x + 78, top - 40, x + 100, top - 26);
      ctx.lineTo(x + 106, gy);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 78, top - 48, 12 + wobble * 3, 0, Math.PI * 2);
      ctx.fill();

      // 课桌
      ctx.fillStyle = 'rgba(7, 8, 11, 0.9)';
      ctx.fillRect(x + 12, top, 132, 8);
      ctx.fillRect(x + 24, top + 8, 5, 52);
      ctx.fillRect(x + 126, top + 8, 5, 52);

      // 桌子上的答题卡
      ctx.fillStyle = 'rgba(225, 232, 238, 0.06)';
      ctx.fillRect(x + 40, top - 3, 52, 3);
      if (idx % 4 === 0) {
        ctx.strokeStyle = 'rgba(255, 57, 79, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 48, top - 4);
        ctx.lineTo(x + 58, top - 7);
        ctx.moveTo(x + 58, top - 4);
        ctx.lineTo(x + 48, top - 7);
        ctx.stroke();
      }

      // 椅背
      ctx.fillStyle = 'rgba(4, 5, 8, 0.7)';
      ctx.fillRect(x + 68, top + 14, 22, 3);
    }
  }

  // 表白现场：围观人群的黑色剪影
  function drawConfessionMid(camX) {
    const gy = world.groundY;
    const spacing = 74;
    const parallax = camX * 0.55;
    const off = parallax % spacing;
    const baseIdx = Math.floor(parallax / spacing);

    ctx.save();
    for (let k = -1; k <= Math.ceil(view.w / spacing) + 1; k++) {
      const x = k * spacing - off;
      const idx = baseIdx + k;
      const h = 46 + hash(idx * 3.7) * 34;
      const headR = 10 + hash(idx * 5.3) * 4;
      const bob = Math.sin(elapsed * 1.1 + idx * 0.7) * 2;

      const headY = gy - h + bob;

      ctx.fillStyle = 'rgba(4, 1, 6, 0.9)';
      ctx.beginPath();
      ctx.moveTo(x - 26, gy + 22);
      ctx.lineTo(x - 17, headY + headR + 8);
      ctx.quadraticCurveTo(x, headY + headR - 8, x + 17, headY + headR + 8);
      ctx.lineTo(x + 26, gy + 22);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, headY, headR, 0, Math.PI * 2);
      ctx.fill();

      // 零星举起的手
      if (idx % 5 === 0) {
        ctx.strokeStyle = 'rgba(5, 2, 7, 0.85)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 16, headY + headR + 14);
        ctx.lineTo(x + 26, headY - 18);
        ctx.stroke();
      }

      // 手机屏幕的冷光
      if (idx % 7 === 0) {
        ctx.fillStyle = 'rgba(130, 220, 255, 0.5)';
        ctx.fillRect(x + headR - 1, headY + 4, 4, 7);
      }

      // 轮廓的粉色边光
      ctx.strokeStyle = 'rgba(255, 79, 139, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, headY, headR + 0.5, -Math.PI * 0.8, Math.PI * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 深夜职场：格子间隔断与显示器冷光
  function drawOfficeMid(camX) {
    const gy = world.groundY;
    const spacing = 300;
    const parallax = camX * 0.42;
    const off = parallax % spacing;
    const baseIdx = Math.floor(parallax / spacing);

    for (let k = -1; k <= Math.ceil(view.w / spacing) + 1; k++) {
      const x = k * spacing - off;
      const idx = baseIdx + k;
      const panelH = 104 + hash(idx * 4.1) * 36;

      // 隔断面板
      ctx.fillStyle = 'rgba(10, 18, 28, 0.9)';
      ctx.fillRect(x, gy - panelH, 244, panelH);
      ctx.fillStyle = 'rgba(90, 160, 220, 0.08)';
      ctx.fillRect(x, gy - panelH, 244, 2);
      ctx.strokeStyle = 'rgba(90, 160, 220, 0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, gy - panelH + 0.5, 243, panelH - 1);

      // 显示器与蓝光
      const mx = x + 52 + hash(idx * 6.3) * 90;
      const my = gy - panelH + 24;
      const flicker = 0.8 + 0.2 * Math.sin(elapsed * 2.3 + idx);

      ctx.fillStyle = 'rgba(50, 120, 210, ' + (0.10 * flicker) + ')';
      ctx.fillRect(mx - 8, my - 8, 72, 52);
      ctx.fillStyle = 'rgba(140, 210, 255, ' + (0.5 * flicker) + ')';
      ctx.fillRect(mx, my, 56, 36);
      ctx.fillStyle = 'rgba(4, 10, 18, 0.9)';
      ctx.fillRect(mx + 30, my + 36, 4, 10);
      ctx.fillRect(mx + 18, my + 46, 28, 3);

      // 桌上的文件
      ctx.fillStyle = 'rgba(200, 220, 240, 0.06)';
      ctx.fillRect(x + 152, gy - 48, 56, 4);
      ctx.fillRect(x + 160, gy - 42, 40, 3);
    }

    // 顶部日光灯
    const lightOff = (camX * 0.2) % 420;
    for (let x = -lightOff; x < view.w + 420; x += 420) {
      const flicker = 0.6 + 0.4 * Math.sin(elapsed * 9 + x * 0.01);
      ctx.fillStyle = 'rgba(180, 225, 255, ' + (0.05 * flicker) + ')';
      ctx.fillRect(x + 60, 24, 170, 5);
      ctx.fillStyle = 'rgba(180, 225, 255, ' + (0.03 * flicker) + ')';
      ctx.fillRect(x + 40, 29, 210, 20);
    }
  }

  function drawGround(camX) {
    const gy = world.groundY;

    const g = ctx.createLinearGradient(0, gy, 0, view.h);
    g.addColorStop(0, scene.ground);
    g.addColorStop(0.35, '#05040a');
    g.addColorStop(1, '#020205');
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, view.w, view.h - gy);

    // 地面边缘光
    ctx.save();
    ctx.shadowColor = scene.groundLight;
    ctx.shadowBlur = 16;
    ctx.fillStyle = scene.groundLight;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, gy - 1, view.w, 2);
    ctx.restore();

    // 纵向滚动刻度
    const spacing = scene.key === 'office' ? 86 : 110;
    const off = camX % spacing;
    ctx.strokeStyle = scene.key === 'exam'
      ? 'rgba(220, 228, 238, 0.05)'
      : scene.key === 'confession'
        ? 'rgba(255, 130, 170, 0.06)'
        : 'rgba(100, 170, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let x = -off; x < view.w + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 10);
      ctx.lineTo(x, view.h);
      ctx.stroke();
    }

    // 车道虚线
    ctx.save();
    ctx.strokeStyle = scene.key === 'exam'
      ? 'rgba(225, 232, 240, 0.13)'
      : scene.key === 'confession'
        ? 'rgba(255, 115, 165, 0.17)'
        : 'rgba(110, 180, 255, 0.13)';
    ctx.lineWidth = 2;
    const dashGap = 140;
    const dashOff = (camX * 1.35) % dashGap;
    for (let x = -dashOff; x < view.w + dashGap; x += dashGap) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 30);
      ctx.lineTo(x + 52, gy + 30);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = scene.key === 'exam'
      ? 'rgba(220, 230, 240, 0.05)'
      : scene.key === 'confession'
        ? 'rgba(255, 120, 165, 0.06)'
        : 'rgba(110, 180, 255, 0.05)';
    const off2 = (camX * 0.7) % 220;
    for (let x = -off2; x < view.w + 220; x += 220) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 8);
      ctx.lineTo(x + 80, gy + 8);
      ctx.stroke();
    }

    // ---------- 场景地面细节 ----------
    if (scene.key === 'exam') {
      // 散落的草稿纸
      const paperGap = 430;
      const pOff = camX % paperGap;
      const baseIdx = Math.floor(camX / paperGap);
      for (let k = -1; k <= Math.ceil(view.w / paperGap) + 1; k++) {
        const x = k * paperGap - pOff + 90;
        const idx = baseIdx + k;
        const y = gy + 54 + hash(idx * 3.1) * (view.h - gy - 90);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((hash(idx * 4.7) - 0.5) * 0.5);
        ctx.fillStyle = 'rgba(230, 236, 242, 0.07)';
        ctx.fillRect(-20, -13, 40, 26);
        ctx.strokeStyle = 'rgba(220, 230, 238, 0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-20, -13, 40, 26);
        if (idx % 3 === 0) {
          ctx.strokeStyle = 'rgba(255, 57, 79, 0.25)';
          ctx.beginPath();
          ctx.moveTo(-7, -7);
          ctx.lineTo(7, 7);
          ctx.moveTo(7, -7);
          ctx.lineTo(-7, 7);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 地砖接缝
      ctx.strokeStyle = 'rgba(210, 222, 232, 0.04)';
      for (let y = gy + 74; y < view.h; y += 76) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(view.w, y);
        ctx.stroke();
      }
    } else if (scene.key === 'confession') {
      // 舞台地板的霓虹反光
      ctx.save();
      ctx.shadowColor = 'rgba(255, 79, 139, 0.5)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255, 79, 139, 0.14)';
      ctx.lineWidth = 1.5;
      const gap = 260;
      const o = (camX * 1.15) % gap;
      for (let x = -o; x < view.w + gap; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, gy + 96);
        ctx.lineTo(x + 120, gy + 96);
        ctx.stroke();
      }
      ctx.restore();

      // 地上的花瓣与碎光
      const petalOff = (camX * 1.2) % 300;
      for (let k = 0; k < Math.ceil(view.w / 300) + 2; k++) {
        const x = k * 300 - petalOff + 60;
        const idx = Math.floor(camX * 1.2 / 300) + k;
        const y = gy + 52 + hash(idx * 5.1) * (view.h - gy - 80);
        ctx.globalAlpha = 0.25 + hash(idx * 3.3) * 0.3;
        ctx.fillStyle = idx % 4 === 0 ? '#ffd1e1' : '#ff6f9f';
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 1.6, hash(idx * 7.7) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // 办公室地毯格线
      ctx.strokeStyle = 'rgba(90, 160, 235, 0.045)';
      for (let y = gy + 60; y < view.h; y += 66) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(view.w, y);
        ctx.stroke();
      }

      // 咖啡渍
      const stainGap = 520;
      const sOff = camX % stainGap;
      for (let k = -1; k <= Math.ceil(view.w / stainGap) + 1; k++) {
        const x = k * stainGap - sOff + 150;
        const idx = Math.floor(camX / stainGap) + k;
        const y = gy + 80 + hash(idx * 4.9) * (view.h - gy - 110);
        ctx.fillStyle = 'rgba(120, 80, 50, 0.10)';
        ctx.beginPath();
        ctx.ellipse(x, y, 28 + hash(idx * 3.2) * 20, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 每幕终点：释怀之门
  function drawGoal(camX) {
    const gx = player.startX + SCENE_LENGTH - camX;
    if (gx < -240 || gx > view.w + 280) return;

    const gy = world.groundY;
    const pulse = 0.65 + 0.35 * Math.sin(elapsed * 2);
    const rgb = scene.accentRgb;

    ctx.save();

    const halo = ctx.createRadialGradient(gx, gy - 110, 10, gx, gy - 110, 280);
    halo.addColorStop(0, 'rgba(' + rgb + ', ' + (0.2 * pulse) + ')');
    halo.addColorStop(1, 'rgba(' + rgb + ', 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(gx - 280, gy - 390, 560, 400);

    // 门内的光
    const door = ctx.createLinearGradient(0, gy - 220, 0, gy);
    door.addColorStop(0, 'rgba(255, 250, 240, 0.9)');
    door.addColorStop(0.55, 'rgba(' + rgb + ', 0.5)');
    door.addColorStop(1, 'rgba(255, 255, 255, 0.12)');
    ctx.fillStyle = door;
    ctx.fillRect(gx - 46, gy - 220, 92, 220);

    // 门框
    ctx.strokeStyle = 'rgba(' + rgb + ', 0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = scene.accent;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.moveTo(gx - 58, gy);
    ctx.lineTo(gx - 58, gy - 180);
    ctx.quadraticCurveTo(gx, gy - 285, gx + 58, gy - 180);
    ctx.lineTo(gx + 58, gy);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx - 68, gy);
    ctx.lineTo(gx + 68, gy);
    ctx.stroke();

    // 上升的光点
    for (let i = 0; i < 8; i++) {
      const t = (elapsed * 0.35 + i * 0.125) % 1;
      const px = gx + Math.sin(elapsed + i * 2.1) * 44;
      const py = gy - t * 250;
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('释 怀 之 门', gx, gy - 310);

    ctx.restore();
  }

  // ============================================================
  // 障碍绘制
  // ============================================================
  function drawStatics(camX) {
    for (const o of statics) {
      const x = o.worldX - camX;
      if (x < -260 || x > view.w + 260) continue;

      if (o.kind === 'paper') drawPaperStack(x, o);
      else if (o.kind === 'heart') drawGlassHeart(x, o);
      else if (o.kind === 'coffee') drawCoffeeCup(x, o);
      else if (o.kind === 'pendulum') drawPendulum(x, o);
      else if (o.kind === 'spotlight') drawSpotlight(x, o);
    }
  }

  // 试卷堆：白色方块 + 红色 X
  function drawPaperStack(x, o) {
    const gy = world.groundY;

    ctx.save();
    for (let i = 0; i < 6; i++) {
      const w = 58 - i * 4;
      const jitter = (hash(o.seed * 3.3 + i) - 0.5) * 10;
      ctx.fillStyle = i % 2
        ? 'rgba(212, 218, 224, 0.9)'
        : 'rgba(242, 246, 250, 0.96)';
      ctx.fillRect(x - w / 2 + jitter, gy - (i + 1) * 8, w, 7);
    }

    ctx.strokeStyle = 'rgba(255, 45, 66, 0.92)';
    ctx.lineWidth = 3.2;
    ctx.shadowColor = 'rgba(255, 45, 66, 0.5)';
    ctx.shadowBlur = 8;
    const top = gy - 46;
    ctx.beginPath();
    ctx.moveTo(x - 15, top + 4);
    ctx.lineTo(x + 15, top + 34);
    ctx.moveTo(x + 15, top + 4);
    ctx.lineTo(x - 15, top + 34);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 边缘散落的纸
    ctx.fillStyle = 'rgba(235, 240, 245, 0.3)';
    ctx.fillRect(x - 46, gy - 4, 22, 3);
    ctx.fillRect(x + 20, gy - 7, 18, 3);
    ctx.restore();
  }

  // 碎玻璃心
  function drawGlassHeart(x, o) {
    const gy = world.groundY;

    ctx.save();
    ctx.translate(x, gy - 12);
    ctx.scale(1, 0.5);
    ctx.rotate((hash(o.seed * 2.7) - 0.5) * 0.5);

    ctx.shadowColor = 'rgba(210, 20, 55, 0.65)';
    ctx.shadowBlur = 14;

    heartPath(ctx, 24);
    ctx.fillStyle = 'rgba(70, 5, 16, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 92, 120, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    crackPath(ctx, 24);
    ctx.strokeStyle = 'rgba(255, 170, 190, 0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 玻璃碎片
    ctx.fillStyle = 'rgba(255, 120, 145, 0.35)';
    for (let i = 0; i < 3; i++) {
      const a = hash(o.seed * 5.1 + i) * Math.PI * 2;
      const r = 22 + hash(o.seed * 3.9 + i) * 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * r + 3, Math.sin(a) * r + 7);
      ctx.lineTo(Math.cos(a) * r - 2, Math.sin(a) * r + 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // 咖啡杯与四溅的水渍
  function drawCoffeeCup(x, o) {
    const gy = world.groundY;
    const flip = o.seed % 2 === 0 ? 1 : -1;

    ctx.save();
    ctx.translate(x, gy);

    // 水渍
    ctx.fillStyle = 'rgba(92, 58, 38, 0.24)';
    ctx.beginPath();
    ctx.ellipse(-14 * flip, -3, 30, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 78, 50, 0.16)';
    ctx.beginPath();
    ctx.ellipse(-30 * flip, -2, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 杯身
    ctx.fillStyle = 'rgba(72, 43, 28, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-12, -30);
    ctx.lineTo(12, -30);
    ctx.lineTo(9, -2);
    ctx.lineTo(-9, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 130, 90, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 杯口
    ctx.fillStyle = 'rgba(46, 27, 17, 0.98)';
    ctx.beginPath();
    ctx.ellipse(0, -30, 12, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 杯柄
    ctx.strokeStyle = 'rgba(72, 43, 28, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(15 * flip, -19, 7, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();

    // 飞溅的咖啡
    ctx.fillStyle = 'rgba(110, 70, 44, 0.35)';
    ctx.beginPath();
    ctx.arc(-26 * flip, -20, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-34 * flip, -10, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // 倒计时钟摆
  function drawPendulum(x, o) {
    const gy = world.groundY;
    const pivotY = gy - 280;
    const swing = Math.sin(elapsed * 1.5 + o.phase);
    const bx = x + swing * 180;
    const by = gy - 80 - Math.abs(swing) * 16;

    ctx.save();

    // 吊线
    ctx.strokeStyle = 'rgba(3, 3, 5, 0.92)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, pivotY);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // 黑色大指针 / 扇形叶片
    ctx.translate(bx, by);
    ctx.rotate(swing * 0.18);

    ctx.shadowColor = 'rgba(255, 57, 79, 0.5)';
    ctx.shadowBlur = 16;

    ctx.fillStyle = 'rgba(10, 10, 12, 0.96)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 62, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    // 向下的大指针尖
    ctx.beginPath();
    ctx.moveTo(-26, 2);
    ctx.lineTo(0, 20);
    ctx.lineTo(26, 2);
    ctx.closePath();
    ctx.fill();

    // 指针边缘的红色刻度
    ctx.strokeStyle = 'rgba(' + scene.accentRgb + ', 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 62, 19, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26, 2);
    ctx.lineTo(0, 20);
    ctx.lineTo(26, 2);
    ctx.stroke();

    // 中央轴
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 57, 79, 0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // 刺眼的聚光灯
  function drawSpotlight(x, o) {
    const gy = world.groundY;
    const spotX = x + Math.sin(elapsed * 0.66 + o.phase) * 135;
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 2.3 + o.phase);

    ctx.save();

    const cone = ctx.createLinearGradient(0, 0, 0, gy);
    cone.addColorStop(0, 'rgba(255, 246, 200, ' + (0.04 * pulse) + ')');
    cone.addColorStop(0.6, 'rgba(255, 240, 185, ' + (0.11 * pulse) + ')');
    cone.addColorStop(1, 'rgba(255, 235, 170, ' + (0.24 * pulse) + ')');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(spotX - 22, -20);
    ctx.lineTo(spotX + 24, -20);
    ctx.lineTo(spotX + 78, gy);
    ctx.lineTo(spotX - 78, gy);
    ctx.closePath();
    ctx.fill();

    // 光柱核心
    ctx.strokeStyle = 'rgba(255, 255, 230, ' + (0.12 * pulse) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spotX - 4, 0);
    ctx.lineTo(spotX - 10, gy);
    ctx.stroke();

    // 地面光圈
    const groundLight = ctx.createRadialGradient(spotX, gy, 0, spotX, gy, 92);
    groundLight.addColorStop(0, 'rgba(255, 245, 195, ' + (0.34 * pulse) + ')');
    groundLight.addColorStop(1, 'rgba(255, 230, 150, 0)');
    ctx.fillStyle = groundLight;
    ctx.beginPath();
    ctx.ellipse(spotX, gy + 2, 92, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 光柱里的尘埃
    for (let i = 0; i < 5; i++) {
      const t = (elapsed * 0.3 + i * 0.2) % 1;
      const px = spotX - 20 + t * 40 + Math.sin(elapsed + i) * 8;
      const py = gy - t * (gy - 40);
      ctx.globalAlpha = 0.18 * (1 - t);
      ctx.fillStyle = '#fff8d8';
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ============================================================
  // 心理防御方块绘制
  // ============================================================
  function drawPickups(camX) {
    for (const p of pickups) {
      const x = p.worldX - camX;
      if (x < -110 || x > view.w + 110) continue;

      const buff = BUFFS[p.type];
      const bob = Math.sin(elapsed * 2.2 + p.seed) * 6;
      const y = world.groundY - p.height + bob;

      // 垂直光柱
      const beamTop = y - 36;
      const beam = ctx.createLinearGradient(0, world.groundY, 0, beamTop);
      beam.addColorStop(0, 'rgba(' + buff.rgb + ', 0)');
      beam.addColorStop(0.75, 'rgba(' + buff.rgb + ', 0.03)');
      beam.addColorStop(1, 'rgba(' + buff.rgb + ', 0.1)');
      ctx.fillStyle = beam;
      ctx.fillRect(x - 24, beamTop, 48, world.groundY - beamTop);

      // 光晕
      const aura = ctx.createRadialGradient(x, y, 2, x, y, 52);
      aura.addColorStop(0, 'rgba(' + buff.rgb + ', 0.3)');
      aura.addColorStop(1, 'rgba(' + buff.rgb + ', 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(x, y, 52, 0, Math.PI * 2);
      ctx.fill();

      // 旋转轨道
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(elapsed * 1.1 + p.seed);
      ctx.strokeStyle = 'rgba(' + buff.rgb + ', 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 33, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 等距发光方块
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = buff.color;
      ctx.shadowBlur = 20;

      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(18, -13);
      ctx.lineTo(0, -2);
      ctx.lineTo(-18, -13);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + buff.rgb + ', 0.9)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-18, -13);
      ctx.lineTo(0, -2);
      ctx.lineTo(0, 22);
      ctx.lineTo(-18, 11);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + buff.rgb + ', 0.42)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(18, -13);
      ctx.lineTo(0, -2);
      ctx.lineTo(0, 22);
      ctx.lineTo(18, 11);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + buff.rgb + ', 0.2)';
      ctx.fill();

      // 棱边
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(18, -13);
      ctx.lineTo(0, -2);
      ctx.lineTo(-18, -13);
      ctx.closePath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, 22);
      ctx.moveTo(-18, -13);
      ctx.lineTo(-18, 11);
      ctx.lineTo(0, 22);
      ctx.lineTo(18, 11);
      ctx.lineTo(18, -13);
      ctx.stroke();

      drawBuffGlyph(p.type);
      ctx.restore();

      // 环绕火星
      for (let i = 0; i < 3; i++) {
        const a = elapsed * 1.7 + p.seed + i * (Math.PI * 2 / 3);
        const px = x + Math.cos(a) * 30;
        const py = y + Math.sin(a) * 14;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = buff.color;
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawBuffGlyph(type) {
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    if (type === 'amnesia') {
      ctx.beginPath();
      ctx.moveTo(-7, -10);
      ctx.lineTo(7, -10);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 10);
      ctx.lineTo(7, 10);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'aq') {
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(9, -6);
      ctx.lineTo(8, 3);
      ctx.lineTo(0, 11);
      ctx.lineTo(-8, 3);
      ctx.lineTo(-9, -6);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(0, 5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(2, -12);
      ctx.lineTo(-7, 1);
      ctx.lineTo(-1, 1);
      ctx.lineTo(-3, 12);
      ctx.lineTo(8, -2);
      ctx.lineTo(2, -2);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawRings(camX) {
    for (const r of rings) {
      const t = 1 - r.life / r.maxLife;
      const x = r.worldX - camX;
      const y = world.groundY - r.height;

      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, 18 + t * 76, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawDynamics(camX) {
    for (const d of dynamics) {
      const x = d.worldX - camX;
      if (x < -140 || x > view.w + 140) continue;

      if (d.kind === 'redX') drawRedX(x, d);
      else if (d.kind === 'hand') drawHand(x, d);
      else if (d.kind === 'doc') drawFlyingDocs(x, d);
      else if (d.kind === 'pot') drawRollingPot(x, d);
    }
  }

  function drawRedX(x, d) {
    const y = world.groundY - d.height;
    const s = 22 + Math.sin(d.spin) * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(d.spin * 0.25);
    ctx.shadowColor = 'rgba(255, 36, 64, 0.9)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255, 42, 66, 0.95)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s, -s);
    ctx.lineTo(s, s);
    ctx.moveTo(s, -s);
    ctx.lineTo(-s, s);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawHand(x, d) {
    const y = world.groundY - d.height;
    const waggle = Math.sin(elapsed * 4 + d.phase) * 0.16;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(waggle);

    ctx.shadowColor = 'rgba(255, 120, 155, 0.5)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(255, 198, 212, 0.8)';
    ctx.fillStyle = 'rgba(30, 8, 16, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    // 前臂
    ctx.beginPath();
    ctx.moveTo(58, 6);
    ctx.lineTo(20, 0);
    ctx.stroke();

    // 手掌
    ctx.beginPath();
    ctx.ellipse(2, 6, 22, 19, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 指向左边的手指
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-38, -2, -52, -10);
    ctx.stroke();

    // 其余手指
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-12, 8 + i * 6);
      ctx.quadraticCurveTo(-26, 10 + i * 7, -30, 16 + i * 6);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawFlyingDocs(x, d) {
    const y = world.groundY - d.height;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(d.spin);
    ctx.shadowColor = 'rgba(200, 225, 255, 0.35)';
    ctx.shadowBlur = 10;

    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(i * 4 - 4, i * 3 - 3);
      ctx.rotate(i * 0.06);

      ctx.fillStyle = 'rgba(240, 245, 250, ' + (0.92 - i * 0.12) + ')';
      ctx.fillRect(-25, -19, 50, 38);
      ctx.strokeStyle = 'rgba(120, 150, 175, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-25, -19, 50, 38);

      ctx.strokeStyle = 'rgba(90, 120, 145, 0.45)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(-18, -12 + k * 8);
        ctx.lineTo(18 - (k % 2) * 9, -12 + k * 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawRollingPot(x, d) {
    const gy = world.groundY;
    const r = d.r || 40;

    ctx.save();
    ctx.translate(x, gy - r);
    ctx.rotate(-d.spin);

    ctx.shadowColor = 'rgba(255, 40, 60, 0.55)';
    ctx.shadowBlur = 18;

    // 半圆形的黑锅
    ctx.fillStyle = 'rgba(6, 7, 9, 0.98)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI);
    ctx.closePath();
    ctx.fill();

    // 锅沿
    ctx.strokeStyle = 'rgba(130, 135, 145, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 60, 80, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI);
    ctx.stroke();

    // 锅内的暗红反光
    ctx.strokeStyle = 'rgba(255, 60, 80, 0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 4, r * 0.62, 0.3, Math.PI - 0.3);
    ctx.stroke();

    // 锅柄
    ctx.fillStyle = 'rgba(10, 11, 14, 1)';
    ctx.fillRect(r - 2, -7, 30, 13);
    ctx.strokeStyle = 'rgba(130, 135, 145, 0.4)';
    ctx.strokeRect(r - 2, -7, 30, 13);

    // 滚动速度线
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 60, 80, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r - 24, 4);
    ctx.lineTo(-r - 10, 4);
    ctx.moveTo(-r - 30, 18);
    ctx.lineTo(-r - 14, 18);
    ctx.stroke();

    ctx.restore();
  }

  // 场景漂浮刺痛文案
  function drawQuotes() {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const q of quotes) {
      ctx.globalAlpha = q.alpha;
      ctx.fillStyle = scene.key === 'exam' ? '#e2e8ee' : scene.accent;
      ctx.font = '500 ' + q.size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(q.text, q.x, q.y);

      if (scene.key === 'exam') {
        const w = ctx.measureText(q.text).width;
        ctx.globalAlpha = q.alpha * 0.85;
        ctx.strokeStyle = 'rgba(255, 57, 79, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y + q.size * 0.7);
        ctx.lineTo(q.x + w, q.y + q.size * 0.7);
        ctx.stroke();
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 屏幕飘字
  function drawToasts() {
    if (!toasts.length) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (const t of toasts) {
      const alpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = '700 ' + t.size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 16;
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // ============================================================
  // 玩家 / 影子（纯几何绘制）
  // ============================================================
  function drawPlayer(alpha, camX) {
    const pose = {
      worldX: lerp(player.prevWorldX, player.worldX, alpha),
      y: lerp(player.prevY, player.y, alpha),
      facing: player.facing,
      runPhase: player.runPhase,
      runBlend: player.runBlend,
      airBlend: player.airBlend,
      crouchBlend: player.crouchBlend,
      squash: player.squash,
    };
    const screenX = pose.worldX - camX;

    drawPlayerShadow(screenX, pose.y);

    // 猛猛冲刺：青色残影
    if (player.sprintTimer > 0) {
      const behind = -player.facing;
      ctx.save();
      ctx.globalAlpha = 0.14;
      drawFigureAt(pose, PLAYER_PALETTE, screenX + behind * 16);
      ctx.globalAlpha = 0.07;
      drawFigureAt(pose, PLAYER_PALETTE, screenX + behind * 32);
      ctx.restore();
    }

    drawFigureAt(pose, PLAYER_PALETTE, screenX);

    // 阿Q精神：金色护盾
    if (player.invincibleTimer > 0) {
      drawPlayerShield(screenX, world.groundY - pose.y);
    }
  }

  function drawPlayerShield(screenX, feetY) {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 9);
    const cy = feetY - 52;

    ctx.save();
    ctx.translate(screenX, cy);
    ctx.strokeStyle = BUFFS.aq.color;
    ctx.shadowColor = BUFFS.aq.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.32 + 0.3 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, 52 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.14 + 0.1 * pulse;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const px = Math.cos(a) * 60;
      const py = Math.sin(a) * 60;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerShadow(screenX, height) {
    const k = clamp(1 - height / 260, 0.25, 1);
    const r = 30 + 14 * k;

    ctx.save();
    ctx.translate(screenX, world.groundY + 4);
    ctx.scale(1, 0.26);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(100, 240, 255, ' + (0.22 * k) + ')');
    g.addColorStop(1, 'rgba(100, 240, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawShadow(alpha, camX) {
    if (!shadowPose || game.phase === 'ending') return;

    const from = shadowPrevPose || shadowPose;
    const pose = lerpPose(from, shadowPose, alpha);
    const screenX = pose.worldX - camX;
    if (screenX < -180) return;

    const materialize = clamp(game.shadowAge / SHADOW_GRACE, 0, 1);
    const flicker = 0.86 + 0.1 * Math.sin(elapsed * 11.3);
    const jitter = Math.sin(elapsed * 23.7) * 1.4 + Math.sin(elapsed * 7.3) * 0.9;

    drawShadowStain(screenX, pose.y, materialize);

    // 两层残影拖尾
    if (pose.runBlend > 0.25 || pose.airBlend > 0.3) {
      for (let i = 2; i >= 1; i--) {
        ctx.save();
        ctx.globalAlpha = 0.055 * materialize * (3 - i);
        drawFigureAt(pose, SHADOW_PALETTE, screenX - i * 13);
        ctx.restore();
      }
    }

    // 主体
    ctx.save();
    ctx.globalAlpha = 0.92 * materialize * flicker;
    drawFigureAt(pose, SHADOW_PALETTE, screenX + jitter);
    ctx.restore();

    // 故障切片，让影子像一段损坏的录像
    const feetY = world.groundY - pose.y;
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const sy = feetY - 26 - i * 26 + Math.sin(elapsed * 13 + i * 2.1) * 5;
      const sw = 26 + Math.sin(elapsed * 9 + i) * 8;
      ctx.globalAlpha = 0.32 * materialize;
      ctx.fillStyle = 'rgba(255, 34, 62, 0.55)';
      ctx.fillRect(screenX - sw / 2 + jitter * 2, sy, sw, 1.2);
    }
    ctx.restore();

    // 上浮的暗红余烬
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const t = (elapsed * 0.55 + i * 0.27) % 1;
      const ex = screenX + Math.sin(elapsed * 1.3 + i * 2.2) * (12 + i * 4);
      const ey = feetY - 8 - t * 74;
      ctx.globalAlpha = materialize * (1 - t) * 0.5;
      ctx.fillStyle = i % 2 ? '#ff4d6d' : '#b01030';
      ctx.fillRect(ex, ey, 1.6, 1.6);
    }
    ctx.restore();
  }

  function drawShadowStain(screenX, height, alpha) {
    const k = clamp(1 - height / 260, 0.25, 1);
    const r = 36 + 14 * k;

    ctx.save();
    ctx.translate(screenX, world.groundY + 5);
    ctx.scale(1, 0.24);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(190, 14, 40, ' + (0.3 * alpha) + ')');
    g.addColorStop(1, 'rgba(190, 14, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFigureAt(pose, palette, screenX) {
    const feetY = world.groundY - pose.y;
    const squash = pose.squash === undefined ? 1 : pose.squash;
    const sy = squash;
    const sx = 1 + (1 - sy) * 0.5;
    const crouch = pose.crouchBlend || 0;

    ctx.save();
    ctx.translate(screenX, feetY);
    ctx.scale(pose.facing * sx * CHAR_SCALE, sy * CHAR_SCALE);
    if (crouch > 0.001) {
      ctx.scale(1 + 0.1 * crouch, 1 - 0.45 * crouch);
    }
    drawFigure(pose, palette);
    ctx.restore();
  }

  function drawFigure(pose, palette) {
    const run = pose.runBlend;
    const ph = pose.runPhase;
    const air = pose.airBlend;

    const glow = ctx.createRadialGradient(0, -48, 4, 0, -48, 66);
    glow.addColorStop(0, palette.glowInner);
    glow.addColorStop(0.55, palette.glowMid);
    glow.addColorStop(1, palette.glowOuter);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -48, 66, 0, Math.PI * 2);
    ctx.fill();

    // 环绕的几何碎片（只属于“现在的你”）
    if (palette.orbiters) {
      const orbitR = 34;
      for (let i = 0; i < 2; i++) {
        const a = elapsed * (0.55 + i * 0.25) + i * Math.PI;
        const ox = Math.cos(a) * orbitR;
        const oy = -46 + Math.sin(a) * orbitR * 0.42;
        const size = 2.6 + Math.sin(elapsed * 3 + i) * 0.5;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(a);
        ctx.fillStyle = palette.orbit;
        ctx.shadowColor = palette.coreGlow;
        ctx.shadowBlur = 8;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }

    ctx.shadowColor = palette.glowColor;
    ctx.shadowBlur = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawLegs(pose, palette);
    drawRibbon(pose, palette);
    drawUpper(pose, palette);

    ctx.shadowBlur = 0;
  }

  function legPose(phase, front, run, air) {
    const p = front ? phase : phase + Math.PI;
    const s = Math.sin(p);

    let thigh = s * 0.7;
    let knee = 0.16 + Math.max(0, s) * 0.5;

    thigh *= run;
    knee = lerp(0.06, knee, run);

    const airThigh = front ? 0.9 : -0.75;
    const airKnee = front ? 1.35 : 0.85;
    thigh = lerp(thigh, airThigh, air);
    knee = lerp(knee, airKnee, air);

    return { thigh, knee };
  }

  function armPose(phase, front, run, air) {
    const p = phase + (front ? Math.PI : 0);
    const s = Math.sin(p);

    let upper = -s * 0.62;
    let bend = 0.3 + Math.max(0, s) * 0.5;

    upper *= run;
    bend = lerp(0.12, bend, run);

    const airUpper = front ? -0.55 : -1.05;
    upper = lerp(upper, airUpper, air);
    bend = lerp(bend, 0.75, air);

    return { upper, bend };
  }

  function drawLimb(x, y, aUpper, aLower, l1, l2, color, width, jointColor) {
    const ex = x + Math.sin(aUpper) * l1;
    const ey = y + Math.cos(aUpper) * l1;
    const hx = ex + Math.sin(aLower) * l2;
    const hy = ey + Math.cos(aLower) * l2;

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    // 关节节点
    ctx.fillStyle = jointColor || color;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 1.2, 0, Math.PI * 2);
    ctx.fill();

    return { x: hx, y: hy };
  }

  function drawLegs(pose, palette) {
    const run = pose.runBlend;
    const ph = pose.runPhase;
    const air = pose.airBlend;

    const back = legPose(ph, false, run, air);
    const front = legPose(ph, true, run, air);

    const backFoot = drawLimb(
      0, -36,
      back.thigh, back.thigh - back.knee,
      18, 18,
      palette.backLimb, 3.4, palette.joint
    );
    ctx.strokeStyle = palette.backLimb;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(backFoot.x, backFoot.y);
    ctx.lineTo(backFoot.x + 4.5, backFoot.y + 1);
    ctx.stroke();

    const frontFoot = drawLimb(
      0, -36,
      front.thigh, front.thigh - front.knee,
      18, 18,
      palette.frontLimb, 3.6, palette.joint
    );
    ctx.strokeStyle = palette.frontFoot;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(frontFoot.x, frontFoot.y);
    ctx.lineTo(frontFoot.x + 5, frontFoot.y + 1);
    ctx.stroke();
  }

  function drawRibbon(pose, palette) {
    const run = pose.runBlend;
    const ph = pose.runPhase;
    const wave = Math.sin(ph * 0.9) * 6 * run + Math.sin(elapsed * 3) * 1.5;

    const grad = ctx.createLinearGradient(-2, -58, -38, -50);
    grad.addColorStop(0, palette.ribbonStart);
    grad.addColorStop(1, palette.ribbonEnd);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-2, -56);
    ctx.bezierCurveTo(-14, -54 + wave * 0.4, -22, -62 - wave, -36, -54 + wave * 1.2);
    ctx.stroke();

    ctx.strokeStyle = palette.ribbon2;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-2, -53);
    ctx.bezierCurveTo(-12, -50 - wave * 0.5, -20, -56 + wave * 0.8, -30, -50 - wave);
    ctx.stroke();

    // 飘带末端的几何残片
    ctx.save();
    ctx.translate(-36, -54 + wave * 1.2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = palette.ribbonStart;
    ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
    ctx.restore();
  }

  function drawUpper(pose, palette) {
    const run = pose.runBlend;
    const ph = pose.runPhase;
    const air = pose.airBlend;
    const bob = Math.abs(Math.sin(ph)) * 2 * run;

    ctx.save();
    ctx.translate(0, -bob);

    // 后手臂
    const backArm = armPose(ph, false, run, air);
    drawLimb(
      0, -56,
      backArm.upper, backArm.upper - backArm.bend,
      13, 12,
      palette.backLimb, 3.1, palette.joint
    );

    // 躯干
    const bodyGrad = ctx.createLinearGradient(0, -60, 0, -34);
    bodyGrad.addColorStop(0, palette.torsoTop);
    bodyGrad.addColorStop(0.55, palette.torsoMid);
    bodyGrad.addColorStop(1, palette.torsoBottom);

    ctx.beginPath();
    ctx.moveTo(-6, -57);
    ctx.lineTo(7, -59);
    ctx.lineTo(5, -35);
    ctx.lineTo(-5, -35);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = palette.torsoStroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 能量核心
    ctx.strokeStyle = palette.torsoCore;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, -53);
    ctx.lineTo(1, -39);
    ctx.stroke();

    const coreSize = 3.2 + Math.sin(elapsed * 3.4) * 0.5;
    ctx.save();
    ctx.translate(0.5, -46);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = palette.core;
    ctx.shadowColor = palette.coreGlow;
    ctx.shadowBlur = 10;
    ctx.fillRect(-coreSize / 2, -coreSize / 2, coreSize, coreSize);
    ctx.restore();

    // 前手臂
    const frontArm = armPose(ph, true, run, air);
    drawLimb(
      1, -56,
      frontArm.upper, frontArm.upper - frontArm.bend,
      13, 12,
      palette.frontLimb, 3.1, palette.joint
    );

    // 脖颈
    ctx.strokeStyle = palette.neck;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1, -58);
    ctx.lineTo(1, -63);
    ctx.stroke();

    // 头部
    const headX = 2;
    const headY = -73;
    const headR = 9;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const px = headX + Math.cos(a) * headR;
      const py = headY + Math.sin(a) * headR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = palette.headFill;
    ctx.fill();
    ctx.strokeStyle = palette.headStroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 朝向前方的光学缝隙
    ctx.strokeStyle = palette.visor;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(headX - 4.5, headY - 0.5);
    ctx.lineTo(headX + 5.5, headY - 0.5);
    ctx.stroke();

    ctx.restore();
  }

  // ============================================================
  // 文字弹幕绘制
  // ============================================================
  function drawBullets(camX) {
    for (const b of bullets) {
      const x = b.worldX - camX;
      if (x < -80 || x > view.w + 80) continue;

      const y = world.groundY - b.height;

      ctx.save();
      ctx.translate(x, y);

      // 光晕
      const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, BULLET_RADIUS + 22);
      aura.addColorStop(0, 'rgba(255, 50, 80, 0.26)');
      aura.addColorStop(1, 'rgba(255, 50, 80, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, BULLET_RADIUS + 22, 0, Math.PI * 2);
      ctx.fill();

      // 外层虚线环
      ctx.save();
      ctx.rotate(-b.spin * 0.55);
      ctx.strokeStyle = 'rgba(255, 70, 100, 0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.arc(0, 0, BULLET_RADIUS + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 尾焰
      const tail = ctx.createLinearGradient(-58, 0, -10, 0);
      tail.addColorStop(0, 'rgba(255, 44, 74, 0)');
      tail.addColorStop(1, 'rgba(255, 44, 74, 0.42)');
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(-58, 0);
      ctx.quadraticCurveTo(-36, -10, -12, -7);
      ctx.lineTo(-12, 7);
      ctx.quadraticCurveTo(-36, 10, -58, 0);
      ctx.closePath();
      ctx.fill();

      // 拖尾火星
      for (let i = 0; i < 3; i++) {
        const t = (b.age * 2.4 + i * 0.31) % 1;
        const sx = -14 - t * 40;
        const sy = Math.sin(b.spin + i * 2.1) * 7 * t;
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(sx, sy, 1.8, 1.8);
      }
      ctx.globalAlpha = 1;

      // 旋转尖刺（长短交错）
      ctx.save();
      ctx.rotate(b.spin);
      ctx.beginPath();
      const spikes = 12;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const spike = 6 + Math.abs(Math.sin(i * 1.7 + b.spin)) * 5;
        const r = i % 2 === 0 ? BULLET_RADIUS + spike : BULLET_RADIUS - 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(14, 2, 6, 0.97)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 74, 100, 0.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // 球体
      const core = ctx.createRadialGradient(-4, -4, 2, 0, 0, BULLET_RADIUS);
      core.addColorStop(0, '#2a0710');
      core.addColorStop(1, '#060103');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 80, 105, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 内圈涡流
      ctx.save();
      ctx.rotate(b.spin * 0.8);
      ctx.strokeStyle = 'rgba(255, 70, 100, 0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, BULLET_RADIUS * 0.72, 0.25, 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, BULLET_RADIUS * 0.52, 2.0, 3.7);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 60, 88, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, BULLET_RADIUS * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // 扎心文字（带一层错位残字）
      const fontSize = b.text.length >= 3 ? 9 : 10.5;
      ctx.font = '700 ' + fontSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 60, 90, 0.95)';
      ctx.shadowBlur = 8;

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ff4d6d';
      ctx.fillText(b.text, -9, -6);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffe9ee';
      ctx.fillText(b.text, 0, 0.5);

      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  // ============================================================
  // 屏幕边缘危险提示 / 受击闪光
  // ============================================================
  function drawEdgeWarning(camX) {
    if (game.phase !== 'running') return;

    let alpha = 0;
    let showChevron = false;

    if (shadowPose) {
      const sx = shadowPose.worldX - camX;
      if (sx < 30) {
        const proximity = clamp(1 - Math.max(0, -sx) / 900, 0.2, 1);
        alpha = 0.05 + 0.13 * proximity * (0.6 + 0.4 * Math.sin(elapsed * 4.2));
        showChevron = true;
      }
    }

    if (game.edgeFlash > 0) {
      alpha = Math.max(alpha, game.edgeFlash * 0.4);
    }
    if (alpha <= 0.001) return;

    const g = ctx.createLinearGradient(0, 0, 200, 0);
    g.addColorStop(0, 'rgba(255, 36, 64, ' + alpha + ')');
    g.addColorStop(1, 'rgba(255, 36, 64, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 200, view.h);

    if (showChevron) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 92, 112, ' + (0.35 + 0.35 * pulse) + ')';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const cx = 16;
      const cy = world.groundY - 70;
      for (let i = 0; i < 2; i++) {
        const ox = cx + i * 9;
        ctx.beginPath();
        ctx.moveTo(ox, cy - 9);
        ctx.lineTo(ox + 9, cy);
        ctx.lineTo(ox, cy + 9);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawDamageFlash() {
    if (game.hitFlash <= 0) return;

    const a = game.hitFlash;
    const g = ctx.createRadialGradient(
      view.w / 2, view.h * 0.55, Math.min(view.w, view.h) * 0.2,
      view.w / 2, view.h * 0.55, Math.max(view.w, view.h) * 0.75
    );
    g.addColorStop(0, 'rgba(120, 0, 18, 0)');
    g.addColorStop(1, 'rgba(150, 6, 30, ' + (0.6 * a) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  // ============================================================
  // 粒子 / 速度线
  // ============================================================
  function drawParticles(camX) {
    const tintColors = {
      pink: '#ff8fb0',
      white: '#e8eef5',
      red: '#ff4d5e',
      coffee: '#8a5136',
      gold: '#ffe08a',
    };

    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1) * 0.85;
      ctx.fillStyle = tintColors[p.tint] || '#a9f4ff';
      ctx.fillRect(
        p.x - camX - p.size / 2,
        world.groundY - p.y - p.size / 2,
        p.size,
        p.size
      );
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawSpeedStreaks(camX) {
    const scroll = camX * 1.7;
    const spacing = 300;
    const gy = world.groundY;
    const first = Math.floor(scroll / spacing) - 1;
    const count = Math.ceil(view.w / spacing) + 3;

    ctx.save();
    ctx.strokeStyle = scene.key === 'exam'
      ? '#e6edf3'
      : scene.key === 'confession'
        ? '#ffb3cd'
        : '#9ecfff';
    ctx.lineWidth = 1;
    for (let k = 0; k < count; k++) {
      const idx = first + k;
      const x = idx * spacing - scroll;
      if (x < -300 || x > view.w + 300) continue;

      const len = 40 + hash(idx * 3.3) * 140;
      const y = gy + 24 + hash(idx * 7.1) * (view.h - gy - 40);
      ctx.globalAlpha = 0.025 + hash(idx * 9.9) * 0.045;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // 固定 60Hz 主循环
  // ============================================================
  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    let delta = now - lastTime;
    lastTime = now;
    if (delta > 250) delta = 250;

    accumulator += delta;

    let steps = 0;
    while (accumulator >= STEP_MS && steps < MAX_STEPS) {
      update(STEP_MS / 1000);
      accumulator -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;

    render(accumulator / STEP_MS);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);

  resize();
  startNewRun();
  requestAnimationFrame(frame);
})();
