(() => {
  'use strict';

  // ============================================================
  // 纯代码音频引擎
  // 不加载任何音频文件，所有声音由 Web Audio API 的
  // OscillatorNode / GainNode / BiquadFilterNode 实时合成。
  // ============================================================
  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  let ambient = null;
  let muted = false;

  const logged = new Set();
  const elState = document.getElementById('audioState');

  // ------------------------------------------------------------
  // UI / 日志
  // ------------------------------------------------------------
  function updateStateLabel() {
    if (!elState) return;
    elState.classList.toggle('ready', !!ctx && !muted);
    elState.classList.toggle('muted', muted);
    elState.textContent = muted
      ? 'AUDIO · MUTED'
      : ctx
        ? 'AUDIO · OSC SYNTH'
        : 'AUDIO · STANDBY';
  }

  function logOnce(key, message) {
    if (logged.has(key)) return;
    logged.add(key);
    console.info('%c[Audio] ' + message, 'color:#ffd166');
  }

  // ------------------------------------------------------------
  // 上下文与总线
  // ------------------------------------------------------------
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    if (!AudioCtor) {
      console.warn('[Audio] 当前浏览器不支持 Web Audio API');
      return null;
    }

    try {
      ctx = new AudioCtor();
    } catch (err) {
      console.error('[Audio] AudioContext 创建失败', err);
      return null;
    }

    // 压缩器：防止多轨叠加时爆音
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressor.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.62;
    master.connect(compressor);

    console.info(
      '%c[Audio] 纯代码音频启动：0 个音频文件，全部由 OscillatorNode 实时合成',
      'color:#7df9ff;font-weight:bold'
    );
    console.info(
      '[Audio] 合成配方 → 跳跃:三角波上扫 / 受击:方波下扫+正弦低音 / 增益:正弦双音铃声 / 环境:低频锯齿+正弦+LFO 心跳'
    );

    startAmbient();
    updateStateLabel();

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function ensure() {
    if (!ctx) return init();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // ------------------------------------------------------------
  // 跳跃：短促高频“啾”声，频率快速上扬
  // ------------------------------------------------------------
  function jump() {
    if (muted) return;
    const c = ensure();
    if (!c) return;

    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(1180, t + 0.13);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.2);

    logOnce('jump', '跳跃音：三角波 420→1180Hz 上扫，0.17s');
  }

  // ------------------------------------------------------------
  // 受击：低频“咚”，方波频率快速下降
  // ------------------------------------------------------------
  function hit() {
    if (muted) return;
    const c = ensure();
    if (!c) return;

    const t = c.currentTime;

    // 方波主音
    const osc = c.createOscillator();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.4);
    filter.Q.value = 5;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    osc.connect(filter).connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.55);

    // 正弦低音，让“咚”更有身体感
    const sub = c.createOscillator();
    const subGain = c.createGain();

    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, t);
    sub.frequency.exponentialRampToValueAtTime(32, t + 0.45);

    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

    sub.connect(subGain).connect(master);
    sub.start(t);
    sub.stop(t + 0.6);

    logOnce('hit', '受击音：方波 170→38Hz 下扫 + 正弦低音 92→32Hz，0.55s');
  }

  // ------------------------------------------------------------
  // 拾取增益：清脆“叮”，正弦波高频双音
  // ------------------------------------------------------------
  function pickup() {
    if (muted) return;
    const c = ensure();
    if (!c) return;

    const t = c.currentTime;
    const notes = [1318.5, 1975.5]; // E6 → B6，纯正弦

    notes.forEach((freq, i) => {
      const start = t + i * 0.055;
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.006, start + 0.3);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.36);

      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    logOnce('pickup', '增益音：正弦波 1318.5→1975.5Hz 双音铃声，0.4s');
  }

  // ------------------------------------------------------------
  // 环境音：低频、沉闷、持续，带心跳式起伏
  // ------------------------------------------------------------
  function startAmbient() {
    if (!ctx || ambient) return;

    const t = ctx.currentTime;

    // 调制总线（LFO 直接叠加在它的 gain 上）
    const bus = ctx.createGain();
    bus.gain.value = 0.07;

    // 独立淡入级，避免调制把音量压成负数
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0.0001, t);
    fade.gain.exponentialRampToValueAtTime(1, t + 2.4);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 1.1;

    filter.connect(bus);
    bus.connect(fade);
    fade.connect(master);

    const nodes = [];

    const droneA = ctx.createOscillator();
    droneA.type = 'sawtooth';
    droneA.frequency.value = 55;
    const gainA = ctx.createGain();
    gainA.gain.value = 0.42;
    droneA.connect(gainA).connect(filter);
    nodes.push(droneA);

    const droneB = ctx.createOscillator();
    droneB.type = 'sine';
    droneB.frequency.value = 82.5;
    const gainB = ctx.createGain();
    gainB.gain.value = 0.24;
    droneB.connect(gainB).connect(filter);
    nodes.push(droneB);

    // 轻微失谐的第二层锯齿，制造压迫感
    const droneC = ctx.createOscillator();
    droneC.type = 'sawtooth';
    droneC.frequency.value = 55.45;
    const gainC = ctx.createGain();
    gainC.gain.value = 0.2;
    droneC.connect(gainC).connect(filter);
    nodes.push(droneC);

    // 0.18Hz 低频呼吸
    const swell = ctx.createOscillator();
    swell.type = 'sine';
    swell.frequency.value = 0.18;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.018;
    swell.connect(swellDepth).connect(bus.gain);
    nodes.push(swell);

    // 1.05Hz 微弱心跳脉动
    const heart = ctx.createOscillator();
    heart.type = 'sine';
    heart.frequency.value = 1.05;
    const heartDepth = ctx.createGain();
    heartDepth.gain.value = 0.006;
    heart.connect(heartDepth).connect(bus.gain);
    nodes.push(heart);

    nodes.forEach((node) => node.start(t));

    ambient = { bus, fade, filter, nodes };

    logOnce(
      'ambient',
      '环境音：55Hz / 82.5Hz / 55.45Hz 振荡器 → 240Hz 低通 → 0.18Hz 呼吸 + 1.05Hz 心跳调制'
    );
  }

  // ------------------------------------------------------------
  // 静音控制
  // ------------------------------------------------------------
  function setMuted(value) {
    muted = !!value;

    if (ctx && master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(muted ? 0 : 0.62, t, 0.04);
    }

    updateStateLabel();
    console.info('[Audio] ' + (muted ? '已静音' : '已恢复声音'));
  }

  function toggleMuted() {
    if (!ctx) init();
    setMuted(!muted);
    return muted;
  }

  // ------------------------------------------------------------
  // 浏览器自动播放策略：首次按键 / 点击时解锁
  // ------------------------------------------------------------
  function unlock() {
    ensure();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('pointerdown', unlock);
  }

  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  // 切到后台时挂起，回来时恢复
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });

  updateStateLabel();

  window.GameAudio = {
    init,
    unlock,
    jump,
    hit,
    pickup,
    setMuted,
    toggleMuted,
    isMuted: () => muted,
    isReady: () => !!ctx,
  };
})();
