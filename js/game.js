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
  const TRACK_LENGTH = 6000;          // 测试跑道长度（世界单位）

  const GRAVITY = 2700;
  const JUMP_SPEED = 920;
  const RUN_ACCEL = 3000;
  const RUN_MAX = 440;
  const RUN_DRAG = 2800;
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER_TIME = 0.12;
  const CAMERA_EASE = 14;

  const DELAY_STEPS = 120;            // 2 秒 × 60Hz 的环形队列长度
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
  };

  const game = {
    phase: 'running',     // running | dead
    hp: MAX_HP,
    shadowAge: 0,         // 影子成形时间
    finished: false,
    shake: 0,
    hitFlash: 0,
    edgeFlash: 0,
  };

  const keys = new Set();
  const bullets = [];
  const particles = [];
  const bg = { far: [], mid: [], floaters: [], motes: [] };

  // 环形队列：每个槽存放一次固定步长的玩家快照
  const shadowRing = new Array(DELAY_STEPS).fill(null);
  let shadowWrite = 0;
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
    return clamp((player.furthestX - player.startX) / TRACK_LENGTH, 0, 1);
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

    buildBackground();
    buildMotes();
  }

  // ============================================================
  // 程序化背景（纯代码，无图片）
  // ============================================================
  function buildBackground() {
    bg.far.length = 0;
    bg.mid.length = 0;
    bg.floaters.length = 0;

    const farSpan = TRACK_LENGTH * 0.16 + view.w * 1.7;
    let x = -200;
    let i = 0;
    while (x < farSpan) {
      const w = 110 + hash(i * 3.7) * 180;
      const h = 120 + hash(i * 8.1) * 280;
      bg.far.push({ x, w, h, seed: i });
      x += w + 20 + hash(i * 5.9) * 80;
      i++;
    }

    const midSpan = TRACK_LENGTH * 0.42 + view.w * 1.7;
    x = -240;
    i = 0;
    while (x < midSpan) {
      const w = 72 + hash(i * 2.3 + 9) * 100;
      const h = 70 + hash(i * 6.7 + 3) * 210;
      const b = { x, w, h, seed: i, windows: [], sign: null };

      const cols = Math.max(2, Math.floor(w / 18));
      const rows = Math.max(2, Math.floor(h / 26));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const n = hash(i * 91.7 + c * 13.1 + r * 7.3);
          if (n > 0.74) {
            b.windows.push({
              x: 7 + c * ((w - 14) / cols),
              y: 10 + r * ((h - 18) / rows),
              w: 4,
              h: 6,
              a: 0.1 + (n - 0.74) * 0.9,
              pink: hash(i * 17.3 + c * 3.1 + r * 5.7) > 0.78,
              phase: n * 6.28,
            });
          }
        }
      }

      if (hash(i * 1.7 + 4) > 0.7) {
        b.sign = {
          color: hash(i * 2.9) > 0.5 ? 'cyan' : 'pink',
          y: h * (0.25 + hash(i * 3.3) * 0.4),
        };
      }

      bg.mid.push(b);
      x += w + 8 + hash(i * 4.1 + 2) * 36;
      i++;
    }

    const floatSpan = TRACK_LENGTH * 0.32 + view.w * 1.7;
    x = 160;
    i = 0;
    while (x < floatSpan) {
      const kind = hash(i * 12.3 + 3);
      bg.floaters.push({
        x,
        y: -150 - hash(i * 9.1) * 460,
        size: 12 + hash(i * 5.5) * 22,
        rot: (hash(i * 7.7) - 0.5) * 1.4,
        bob: hash(i * 6.2) * Math.PI * 2,
        type: kind > 0.7 ? 'frame' : kind > 0.42 ? 'heart' : 'shard',
      });
      x += 220 + hash(i * 8.8) * 380;
      i++;
    }
  }

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

    if (e.code === 'KeyR' && game.phase === 'dead') {
      restart();
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

  elRestart.addEventListener('click', restart);

  // ============================================================
  // 重开
  // ============================================================
  function restart() {
    elDeath.classList.remove('show');
    elRestart.blur();

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

    camera.x = 0;
    camera.prevX = 0;

    shadowRing.fill(null);
    shadowWrite = 0;
    shadowPose = null;
    shadowPrevPose = null;
    fireTimer = SHOT_INTERVAL;
    shotCount = 0;

    bullets.length = 0;
    particles.length = 0;
    dustAccumulator = 0;
    elapsed = 0;

    game.phase = 'running';
    game.hp = MAX_HP;
    game.shadowAge = 0;
    game.finished = false;
    game.shake = 0;
    game.hitFlash = 0;
    game.edgeFlash = 0;

    keys.clear();
    hudPercent = -1;
    updateHud();
    updateHp();
  }

  // ============================================================
  // 固定步长逻辑更新
  // ============================================================
  function update(dt) {
    elapsed += dt;

    if (game.phase === 'dead') {
      updateAmbient(dt);
      return;
    }

    player.prevWorldX = player.worldX;
    player.prevY = player.y;
    camera.prevX = camera.x;

    // ---------- 水平移动 ----------
    let dir = 0;
    if (anyKeyHeld(KEY_RIGHT)) dir = 1;
    else if (anyKeyHeld(KEY_LEFT)) dir = -1;

    if (dir !== 0) {
      player.vx += dir * RUN_ACCEL * dt;
      player.facing = dir;
    } else {
      const drag = RUN_DRAG * dt;
      player.vx = Math.abs(player.vx) <= drag
        ? 0
        : player.vx - Math.sign(player.vx) * drag;
    }

    player.vx = clamp(player.vx, -RUN_MAX * 0.65, RUN_MAX);
    player.worldX += player.vx * dt;

    const finishX = player.startX + TRACK_LENGTH;
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

    // ---------- 到达测试终点 ----------
    if (!game.finished && player.furthestX >= finishX) {
      game.finished = true;
      bullets.length = 0;
    }

    // ---------- 相机 ----------
    const camTarget = Math.max(0, player.worldX - camera.anchor);
    camera.x += (camTarget - camera.x) * Math.min(1, dt * CAMERA_EASE);

    // ---------- 环形队列：取出 2 秒前的快照，写入当前快照 ----------
    shadowPrevPose = shadowPose;
    shadowPose = shadowRing[shadowWrite];
    shadowRing[shadowWrite] = capturePose();
    shadowWrite = (shadowWrite + 1) % DELAY_STEPS;

    if (shadowPose) {
      game.shadowAge += dt;
    } else {
      game.shadowAge = 0;
    }

    // ---------- 影子开火 ----------
    if (shadowPose && !game.finished) {
      fireTimer -= dt;
      if (fireTimer <= 0) {
        fireTimer += SHOT_INTERVAL;
        fireBullet();
      }
    }

    updateBullets(dt);
    checkHits();
    if (game.phase === 'dead') return;

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
    if (game.phase !== 'running' || game.finished) return;

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

  function die(cause) {
    if (game.phase !== 'running') return;

    game.phase = 'dead';
    game.hp = 0;
    game.shake = 0.7;
    game.hitFlash = 0.75;
    keys.clear();
    sfx.hit();

    elDeathTitle.textContent = cause === 'bullet' ? '被一句话击穿了' : '被回忆追上了';
    elDeathSub.textContent = cause === 'bullet'
      ? '那些扎心的文字，也是从你自己的心里长出来的。'
      : '你停下的一瞬间，2 秒前的自己就贴了上来。';
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
    drawGoal(camX);
    drawShadow(alpha, camX);
    drawParticles(camX);
    drawSpeedStreaks(camX);
    drawPlayer(alpha, camX);
    drawBullets(camX);
    drawEdgeWarning(camX);

    ctx.restore();

    drawIntroHint();
    drawDamageFlash();
  }

  // 开场提示：说明“2 秒延迟”的核心规则
  function drawIntroHint() {
    if (game.phase !== 'running' || game.finished || elapsed > 4.4) return;

    const alpha = clamp(Math.min(elapsed / 0.6, (4.4 - elapsed) / 1.2), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#cfeeff';
    ctx.font = '600 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('别停下 · 2 秒前的你正在追来', view.w / 2, view.h * 0.18);
    ctx.restore();
  }

  function drawSky(camX) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#030309');
    g.addColorStop(0.42, '#0a0a1c');
    g.addColorStop(0.7, '#151033');
    g.addColorStop(0.78, '#1a1236');
    g.addColorStop(1, '#05040c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    const glow = ctx.createRadialGradient(
      view.w * 0.52, world.groundY, 0,
      view.w * 0.52, world.groundY, Math.max(view.w, view.h) * 0.8
    );
    glow.addColorStop(0, 'rgba(84, 58, 150, 0.32)');
    glow.addColorStop(0.5, 'rgba(40, 24, 80, 0.14)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.w, view.h);

    drawSkyClock(camX);
    drawSkyHeart(camX);

    for (const m of bg.motes) {
      const twinkle = 0.55 + 0.45 * Math.sin(elapsed * 1.4 + m.phase);
      ctx.globalAlpha = m.alpha * twinkle;
      ctx.fillStyle = '#9cefff';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSkyClock(camX) {
    const x = view.w * 0.72 - camX * 0.09;
    const y = world.groundY - Math.min(view.h * 0.36, 320);
    const r = Math.min(view.w, view.h) * 0.15;
    if (x < -r * 2 || x > view.w + r * 2) return;

    ctx.save();
    ctx.translate(x, y);

    ctx.strokeStyle = 'rgba(150, 150, 255, 0.10)';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(150, 150, 255, 0.07)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(170, 190, 255, 0.16)';
    ctx.lineWidth = Math.max(1, r * 0.012);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84);
      ctx.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
      ctx.stroke();
    }

    // 外圈断开的记忆刻度
    ctx.strokeStyle = 'rgba(150, 150, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.26, -1.35, 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.42, 2.2, 3.9);
    ctx.stroke();

    // 表盘裂纹
    ctx.strokeStyle = 'rgba(255, 130, 168, 0.10)';
    ctx.lineWidth = 1;
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

    ctx.strokeStyle = 'rgba(190, 200, 255, 0.20)';
    ctx.lineWidth = Math.max(1.5, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(hourA) * r * 0.45, Math.sin(hourA) * r * 0.45);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(125, 249, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(minuteA) * r * 0.68, Math.sin(minuteA) * r * 0.68);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 100, 145, 0.20)';
    ctx.lineWidth = Math.max(1, r * 0.014);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(secondA) * r * 0.76, Math.sin(secondA) * r * 0.76);
    ctx.stroke();

    ctx.fillStyle = 'rgba(125, 249, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, r * 0.03), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawSkyHeart(camX) {
    const x = view.w * 0.18 - camX * 0.045;
    const y = world.groundY - view.h * 0.5;
    const s = Math.min(view.w, view.h) * 0.09;
    if (x < -s * 2 || x > view.w + s * 2) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);

    const halo = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.7);
    halo.addColorStop(0, 'rgba(255, 70, 125, 0.035)');
    halo.addColorStop(1, 'rgba(255, 70, 125, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.7, 0, Math.PI * 2);
    ctx.fill();

    heartPath(ctx, s);
    ctx.fillStyle = 'rgba(255, 90, 140, 0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 120, 160, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    crackPath(ctx, s);
    ctx.strokeStyle = 'rgba(255, 140, 175, 0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 内部几何切面
    ctx.strokeStyle = 'rgba(255, 130, 165, 0.055)';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    ctx.lineTo(0, s * 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.26);
    ctx.lineTo(0, s * 0.1);
    ctx.lineTo(s * 0.5, -s * 0.26);
    ctx.stroke();

    ctx.restore();
  }

  function drawFar(camX) {
    const offset = camX * 0.16;
    const gy = world.groundY;

    ctx.save();
    for (const b of bg.far) {
      const x = b.x - offset;
      if (x + b.w < -60 || x > view.w + 60) continue;
      const top = gy - b.h;

      ctx.fillStyle = '#16112c';
      ctx.fillRect(x, top, b.w, b.h);

      ctx.fillStyle = 'rgba(130, 120, 220, 0.10)';
      ctx.fillRect(x, top, b.w, 1);

      if (b.seed % 4 === 0) {
        ctx.strokeStyle = 'rgba(130, 120, 220, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + b.w * 0.66, top);
        ctx.lineTo(x + b.w * 0.66, top - 18);
        ctx.stroke();

        const blink = 0.5 + 0.5 * Math.sin(elapsed * 1.6 + b.seed);
        ctx.fillStyle = 'rgba(255, 100, 140, ' + (0.16 + blink * 0.22) + ')';
        ctx.beginPath();
        ctx.arc(x + b.w * 0.66, top - 20, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFloaters(camX) {
    const offset = camX * 0.3;
    const gy = world.groundY;

    ctx.save();
    for (const f of bg.floaters) {
      const x = f.x - offset;
      if (x < -80 || x > view.w + 80) continue;

      const y = gy + f.y + Math.sin(elapsed * 0.7 + f.bob) * 10;
      const pulse = 0.55 + 0.25 * Math.sin(elapsed * 1.1 + f.bob);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot + Math.sin(elapsed * 0.5 + f.bob) * 0.08);

      if (f.type === 'heart') {
        heartPath(ctx, f.size);
        ctx.fillStyle = 'rgba(255, 92, 138, ' + (0.05 * pulse) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 130, 165, ' + (0.24 * pulse) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        crackPath(ctx, f.size);
        ctx.strokeStyle = 'rgba(255, 150, 180, ' + (0.18 * pulse) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (f.type === 'frame') {
        const w = f.size * 0.95;
        const h = f.size * 1.3;

        ctx.fillStyle = 'rgba(120, 220, 255, 0.02)';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = 'rgba(150, 225, 255, ' + (0.16 * pulse) + ')';
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2, -h / 2, w, h);

        // 扫描线
        ctx.strokeStyle = 'rgba(150, 225, 255, ' + (0.055 * pulse) + ')';
        for (let k = 1; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(-w / 2 + 3, -h / 2 + (k * h) / 3);
          ctx.lineTo(w / 2 - 3, -h / 2 + (k * h) / 3);
          ctx.stroke();
        }

        // 相框裂痕
        ctx.strokeStyle = 'rgba(255, 130, 165, ' + (0.2 * pulse) + ')';
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 3, -h / 2 + 2);
        ctx.lineTo(w * 0.1, h * 0.05);
        ctx.lineTo(-w * 0.06, h * 0.4);
        ctx.lineTo(w / 2 - 3, h / 2 - 3);
        ctx.stroke();
      } else {
        const s = f.size * 0.62;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.55, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.55, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(110, 240, 255, ' + (0.035 * pulse) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(140, 245, 255, ' + (0.18 * pulse) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  function drawMid(camX) {
    const offset = camX * 0.42;
    const gy = world.groundY;

    ctx.save();
    for (const b of bg.mid) {
      const x = b.x - offset;
      if (x + b.w < -40 || x > view.w + 40) continue;
      const top = gy - b.h;

      ctx.fillStyle = '#0c0919';
      ctx.fillRect(x, top, b.w, b.h);

      ctx.fillStyle = 'rgba(110, 230, 255, 0.10)';
      ctx.fillRect(x, top, b.w, 1.5);

      for (const w of b.windows) {
        const flicker = 0.85 + 0.15 * Math.sin(elapsed * 1.7 + w.phase);
        ctx.fillStyle = w.pink
          ? 'rgba(255, 100, 150, ' + clamp(w.a * flicker, 0, 0.5) + ')'
          : 'rgba(120, 235, 255, ' + clamp(w.a * flicker, 0, 0.5) + ')';
        ctx.fillRect(x + w.x, top + w.y, w.w, w.h);
      }

      // 楼顶天线与闪烁航标
      if (b.seed % 3 === 0) {
        const ax = x + b.w * (0.22 + hash(b.seed * 3.1) * 0.5);
        const ah = 14 + hash(b.seed * 5.7) * 22;
        ctx.strokeStyle = 'rgba(120, 210, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, top);
        ctx.lineTo(ax, top - ah);
        ctx.stroke();

        const blink = 0.5 + 0.5 * Math.sin(elapsed * 2 + b.seed);
        ctx.fillStyle = 'rgba(255, 100, 140, ' + (0.2 + blink * 0.35) + ')';
        ctx.beginPath();
        ctx.arc(ax, top - ah, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 楼顶水箱剪影
      if (b.seed % 4 === 1) {
        ctx.fillStyle = '#0a0816';
        ctx.fillRect(x + b.w * 0.15, top - 9, b.w * 0.26, 9);
        ctx.strokeStyle = 'rgba(110, 230, 255, 0.08)';
        ctx.strokeRect(x + b.w * 0.15, top - 9, b.w * 0.26, 9);
      }

      if (b.sign) {
        const rgb = b.sign.color === 'cyan' ? '125, 249, 255' : '255, 92, 138';
        const sx = x + b.w - 8;
        const sy = top + b.sign.y;
        ctx.fillStyle = 'rgba(' + rgb + ', 0.08)';
        ctx.fillRect(sx - 2, sy, 5, b.h * 0.28);
        ctx.fillStyle = 'rgba(' + rgb + ', 0.3)';
        ctx.fillRect(sx, sy + 2, 1, b.h * 0.28 - 4);
      }
    }
    ctx.restore();
  }

  function drawGround(camX) {
    const gy = world.groundY;

    const g = ctx.createLinearGradient(0, gy, 0, view.h);
    g.addColorStop(0, '#0d0a1d');
    g.addColorStop(0.2, '#070511');
    g.addColorStop(1, '#030208');
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, view.w, view.h - gy);

    ctx.save();
    ctx.shadowColor = 'rgba(125, 249, 255, 0.55)';
    ctx.shadowBlur = 14;
    const lineG = ctx.createLinearGradient(0, 0, view.w, 0);
    lineG.addColorStop(0, 'rgba(125, 249, 255, 0.05)');
    lineG.addColorStop(0.5, 'rgba(155, 250, 255, 0.6)');
    lineG.addColorStop(1, 'rgba(125, 249, 255, 0.05)');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, gy - 1, view.w, 2);
    ctx.restore();

    const spacing = 110;
    const off = camX % spacing;
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = -off; x < view.w + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 10);
      ctx.lineTo(x, view.h);
      ctx.stroke();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(160, 240, 255, 0.16)';
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

    ctx.strokeStyle = 'rgba(160, 240, 255, 0.06)';
    ctx.lineWidth = 1;
    const off2 = (camX * 0.7) % 220;
    for (let x = -off2; x < view.w + 220; x += 220) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 8);
      ctx.lineTo(x + 80, gy + 8);
      ctx.stroke();
    }
  }

  function drawGoal(camX) {
    const gx = player.startX + TRACK_LENGTH - camX;
    if (gx < -120 || gx > view.w + 200) return;

    const gy = world.groundY;
    const pulse = 0.65 + 0.35 * Math.sin(elapsed * 2.2);

    ctx.save();

    const beam = ctx.createLinearGradient(0, gy - 220, 0, gy);
    beam.addColorStop(0, 'rgba(125, 249, 255, 0)');
    beam.addColorStop(0.65, 'rgba(125, 249, 255, ' + (0.05 * pulse) + ')');
    beam.addColorStop(1, 'rgba(160, 252, 255, ' + (0.22 * pulse) + ')');
    ctx.fillStyle = beam;
    ctx.fillRect(gx - 26, gy - 220, 52, 220);

    ctx.strokeStyle = 'rgba(170, 252, 255, ' + (0.45 + 0.3 * pulse) + ')';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(125, 249, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy - 190);
    ctx.stroke();

    ctx.translate(gx, gy - 200);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-5, -5, 10, 10);

    ctx.restore();
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
    drawFigureAt(pose, PLAYER_PALETTE, screenX);
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
    if (!shadowPose || game.finished) return;

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
    if (game.phase === 'dead' || game.finished) return;

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
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1) * 0.85;
      ctx.fillStyle = p.tint === 'pink' ? '#ff8fb0' : '#a9f4ff';
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
    ctx.strokeStyle = '#bff7ff';
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
  updateHp();
  requestAnimationFrame(frame);
})();
