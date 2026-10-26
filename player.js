'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const songId = decodeURIComponent(location.hash.slice(1));
  const STORE_PREFIX = 'kapa-haka:' + songId + ':';

  // 曲を切り替えたら読み込み直す（状態をまっさらにするため）
  window.addEventListener('hashchange', () => location.reload());

  // ---------- localStorage ----------
  function load(key) {
    try {
      const v = localStorage.getItem(STORE_PREFIX + key);
      return v == null ? null : JSON.parse(v);
    } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value)); } catch (e) { /* 保存できなくても動作は続ける */ }
  }
  function remove(key) {
    try { localStorage.removeItem(STORE_PREFIX + key); } catch (e) { /* noop */ }
  }

  // ---------- 状態 ----------
  let song = null;
  let starts = [];            // 各フレーズの開始秒（null = 未設定）
  let timingsAreLocal = false;
  let loop = { start: 0, end: 0 };
  let loopLimit = 0;          // 0 = 無制限
  let loopCount = 0;
  let stoppedByLimit = false;
  let rate = 1;
  let media = null;           // 再生中のアダプタ（YouTube / ローカル動画）
  let ytPlayer = null;
  let localUrl = null;
  let ignoreLoopUntil = 0;    // seek 直後は古い currentTime を拾わないようにする
  let timingMode = false;
  let tapIndex = 0;           // 「次」で記録するフレーズ番号
  let lastCurrent = -2;

  // ---------- 小物 ----------
  const fmt = (t) => (t == null || isNaN(t) ? '--' : t.toFixed(1));
  const round2 = (t) => Math.round(t * 100) / 100;

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  // ---------- 再生アダプタ ----------
  // YouTube と <video> を同じインターフェースで扱う
  function youtubeAdapter(p) {
    return {
      kind: 'youtube',
      time: () => (p.getCurrentTime ? p.getCurrentTime() || 0 : 0),
      seek: (t) => p.seekTo(t, true),
      play: () => p.playVideo(),
      pause: () => p.pauseVideo(),
      isPlaying: () => p.getPlayerState && p.getPlayerState() === YT.PlayerState.PLAYING,
      setRate: (r) => p.setPlaybackRate(r),
    };
  }
  function videoAdapter(v) {
    return {
      kind: 'local',
      time: () => v.currentTime || 0,
      seek: (t) => { v.currentTime = t; },
      play: () => { const pr = v.play(); if (pr) pr.catch(() => {}); },
      pause: () => v.pause(),
      isPlaying: () => !v.paused && !v.ended,
      setRate: (r) => { v.playbackRate = r; },
    };
  }

  function seek(t) {
    if (!media) return;
    media.seek(t);
    ignoreLoopUntil = performance.now() + 400;
  }

  function onPlayStarted() {
    // 上限で止まった後に再生し直したら、周回数を数え直す
    if (stoppedByLimit) {
      stoppedByLimit = false;
      loopCount = 0;
      updateLoopDisplay();
    }
  }

  // ---------- YouTube ----------
  function loadYouTubeApi() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      window.onYouTubeIframeAPIReady = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }

  async function startYouTube() {
    showError('');
    const box = $('video-box');
    if (!$('yt-player')) {
      const div = document.createElement('div');
      div.id = 'yt-player';
      box.insertBefore(div, box.firstChild);
    }
    await loadYouTubeApi();
    ytPlayer = new YT.Player('yt-player', {
      host: 'https://www.youtube-nocookie.com',
      videoId: song.youtubeId,
      playerVars: { playsinline: 1, rel: 0, start: Math.floor(loop.start) },
      events: {
        onReady: () => {
          media = youtubeAdapter(ytPlayer);
          media.setRate(rate);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) onPlayStarted();
          updatePlayButton();
        },
        onError: (e) => {
          const embedBlocked = e.data === 101 || e.data === 150;
          showError(embedBlocked
            ? 'この動画は埋め込み再生が許可されていません。「端末内の動画を使う」からローカル動画モードを使ってください。'
            : 'YouTube 動画を再生できませんでした（エラー ' + e.data + '）。「端末内の動画を使う」からローカル動画モードを使ってください。');
        },
      },
    });
  }

  function stopYouTube() {
    if (ytPlayer) {
      try { ytPlayer.destroy(); } catch (e) { /* noop */ }
      ytPlayer = null;
    }
    // destroy 後は iframe が消えるので、次回用のプレースホルダーを戻す
    const old = $('yt-player');
    if (old) old.remove();
  }

  // ---------- ローカル動画 ----------
  function startLocal(file) {
    stopYouTube();
    showError('');
    const v = $('local-video');
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = URL.createObjectURL(file);
    v.src = localUrl;
    v.hidden = false;
    media = videoAdapter(v);
    media.setRate(rate);
    v.addEventListener('loadedmetadata', () => seek(loop.start), { once: true });
    $('btn-youtube').hidden = false;
    $('mode-note').textContent = 'いまは端末内の動画「' + file.name + '」で再生しています（通信なし）。';
    loopCount = 0;
    updateLoopDisplay();
    updatePlayButton();
  }

  function stopLocal() {
    const v = $('local-video');
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.hidden = true;
    if (localUrl) { URL.revokeObjectURL(localUrl); localUrl = null; }
  }

  function backToYouTube() {
    stopLocal();
    media = null;
    $('btn-youtube').hidden = true;
    $('file-input').value = '';
    $('mode-note').textContent = 'いまは YouTube で再生しています。';
    loopCount = 0;
    updateLoopDisplay();
    startYouTube();
  }

  // ---------- ループ監視（100ms） ----------
  function tick() {
    if (!media) return;
    const t = media.time();
    if (loop.end > loop.start && t >= loop.end && performance.now() > ignoreLoopUntil) {
      loopCount++;
      if (loopLimit > 0 && loopCount >= loopLimit) {
        media.pause();
        seek(loop.start);
        stoppedByLimit = true;
        toast(loopLimit + '周したので停止しました');
      } else {
        seek(loop.start);
      }
      updateLoopDisplay();
    }
    $('time-display').textContent = fmt(t) + ' 秒';
    updateSubtitle(t);
    updatePlayButton();
  }

  function updateLoopDisplay() {
    $('loop-display').textContent = 'ループ ' + loopCount + (loopLimit > 0 ? ' / ' + loopLimit : '') + ' 周';
  }

  let lastPlaying = null;
  function updatePlayButton() {
    const playing = !!(media && media.isPlaying());
    if (playing === lastPlaying) return;
    lastPlaying = playing;
    $('btn-play').textContent = playing ? '⏸ 一時停止' : '▶ 再生';
  }

  // ---------- 字幕 ----------
  const hasAnyTiming = () => starts.some((s) => s != null);

  function currentIndex(t) {
    let best = -1;
    let bestStart = -Infinity;
    starts.forEach((s, i) => {
      if (s != null && s <= t && s >= bestStart) { best = i; bestStart = s; }
    });
    return best;
  }

  function updateSubtitle(t) {
    if (!hasAnyTiming()) return; // 未設定のときは一覧表示のまま
    const cur = currentIndex(t);
    if (cur === lastCurrent) return;
    lastCurrent = cur;
    const p = song.phrases;
    $('cur-kana').textContent = cur >= 0 ? p[cur].kana : '';
    $('cur-text').textContent = cur >= 0 ? p[cur].text : '';
    const next = p[cur + 1];
    $('next').textContent = next ? next.kana : '';
    document.querySelectorAll('#phrase-list li').forEach((li, i) => {
      li.classList.toggle('current', i === cur);
    });
  }

  function renderSubtitleArea() {
    const box = $('subtitle');
    lastCurrent = -2;
    if (hasAnyTiming()) {
      box.classList.remove('all');
      box.innerHTML = '<div class="cur-kana" id="cur-kana"></div><div class="cur-text" id="cur-text"></div><div class="next" id="next"></div>';
      updateSubtitle(media ? media.time() : 0);
    } else {
      // タイミング未設定：全フレーズを一覧表示
      box.classList.add('all');
      box.innerHTML = '';
      const ol = document.createElement('ol');
      ol.className = 'all-phrases';
      for (const p of song.phrases) {
        const li = document.createElement('li');
        const k = document.createElement('div');
        k.className = 'kana';
        k.textContent = p.kana;
        const tx = document.createElement('div');
        tx.className = 'text';
        tx.textContent = p.text;
        li.append(k, tx);
        ol.appendChild(li);
      }
      box.appendChild(ol);
    }
  }

  // ---------- タイミング編集 ----------
  function setStarts(next, persist) {
    starts = next;
    if (persist) {
      save('timings', starts);
      timingsAreLocal = true;
    }
    renderPhraseList();
    renderSubtitleArea();
    $('json-out').hidden = true;
  }

  function updateTimingSource() {
    $('timing-source').textContent = timingsAreLocal
      ? 'この端末で編集したタイミングを使っています。'
      : (hasAnyTiming() ? '共有のタイミング（曲のJSON）を使っています。' : 'タイミングはまだ設定されていません。');
  }

  function renderPhraseList() {
    const ul = $('phrase-list');
    ul.innerHTML = '';
    song.phrases.forEach((p, i) => {
      const li = document.createElement('li');
      if (timingMode && i === tapIndex) li.classList.add('target');

      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = i + 1;

      const body = document.createElement('div');
      const k = document.createElement('div');
      k.className = 'kana';
      k.textContent = p.kana;
      const tx = document.createElement('div');
      tx.className = 'text';
      tx.textContent = p.text;
      body.append(k, tx);
      body.addEventListener('click', () => {
        if (!timingMode) return;
        tapIndex = i;
        renderPhraseList();
        updateTapTarget();
      });

      const adj = document.createElement('div');
      adj.className = 'adj';
      const minus = document.createElement('button');
      minus.className = 'small';
      minus.textContent = '−0.1';
      minus.disabled = starts[i] == null;
      minus.addEventListener('click', () => adjust(i, -0.1));
      const time = document.createElement('button');
      time.className = 'time' + (starts[i] == null ? ' unset' : '');
      time.textContent = fmt(starts[i]);
      time.disabled = starts[i] == null;
      time.addEventListener('click', () => seek(Math.max(0, starts[i] - 0.5)));
      const plus = document.createElement('button');
      plus.className = 'small';
      plus.textContent = '+0.1';
      plus.disabled = starts[i] == null;
      plus.addEventListener('click', () => adjust(i, 0.1));
      adj.append(minus, time, plus);

      li.append(no, body, adj);
      ul.appendChild(li);
    });
    updateTimingSource();
    lastCurrent = -2;
  }

  function adjust(i, delta) {
    const next = starts.slice();
    next[i] = Math.max(0, round2(next[i] + delta));
    setStarts(next, true);
  }

  function updateTapTarget() {
    const p = song.phrases[tapIndex];
    $('tap-target').textContent = p
      ? '次にタップで記録：' + (tapIndex + 1) + '. ' + p.kana
      : 'すべてのフレーズを記録しました';
    $('btn-tap').disabled = !p;
  }

  function tap() {
    if (!media || tapIndex >= song.phrases.length) return;
    const next = starts.slice();
    next[tapIndex] = round2(media.time());
    tapIndex++;
    setStarts(next, true);
    updateTapTarget();
  }

  function setTimingMode(on) {
    timingMode = on;
    $('btn-timing-mode').classList.toggle('on', on);
    $('timing-tools').hidden = !on;
    $('phrase-list').hidden = !on;
    renderPhraseList();
    updateTapTarget();
  }

  function songJson() {
    const phrases = song.phrases.map((p, i) => '    ' + JSON.stringify({ kana: p.kana, text: p.text, start: starts[i] }));
    return '{\n' +
      '  "title": ' + JSON.stringify(song.title) + ',\n' +
      '  "youtubeId": ' + JSON.stringify(song.youtubeId) + ',\n' +
      '  "loop": { "start": ' + song.loop.start + ', "end": ' + song.loop.end + ' },\n' +
      '  "phrases": [\n' + phrases.join(',\n') + '\n  ]\n}\n';
  }

  async function copyJson() {
    const text = songJson();
    const out = $('json-out');
    out.value = text;
    out.hidden = false;
    try {
      await navigator.clipboard.writeText(text);
      toast('JSONをコピーしました');
    } catch (e) {
      out.focus();
      out.select();
      try {
        document.execCommand('copy');
        toast('JSONをコピーしました');
      } catch (e2) {
        toast('下の欄から手動でコピーしてください');
      }
    }
  }

  function resetTimings() {
    if (!confirm('この端末で編集したタイミングを消して、共有の設定（曲のJSON）に戻しますか？')) return;
    remove('timings');
    timingsAreLocal = false;
    setStarts(song.phrases.map((p) => (typeof p.start === 'number' ? p.start : null)), false);
    tapIndex = 0;
    updateTapTarget();
    toast('共有の設定に戻しました');
  }

  // ---------- ループ区間 UI ----------
  function applyLoop(next, persist) {
    loop = next;
    $('loop-start').value = loop.start;
    $('loop-end').value = loop.end;
    if (persist) save('loop', loop);
  }

  function onLoopInput() {
    const s = parseFloat($('loop-start').value);
    const e = parseFloat($('loop-end').value);
    if (isNaN(s) || isNaN(e) || s < 0) return;
    if (e <= s) {
      toast('終了は開始より後にしてください');
      return;
    }
    applyLoop({ start: round2(s), end: round2(e) }, true);
  }

  // ---------- 初期化 ----------
  async function init() {
    if (!/^[a-z0-9-]+$/.test(songId)) {
      location.replace('index.html');
      return;
    }
    $('song-id').textContent = songId;
    try {
      const res = await fetch('songs/' + songId + '.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      song = await res.json();
    } catch (e) {
      $('song-title').textContent = '曲が見つかりません';
      showError('曲データ songs/' + songId + '.json を読み込めませんでした。');
      return;
    }
    document.title = song.title + ' | ハカ練習';
    $('song-title').textContent = song.title;

    // タイミング：localStorage の編集版を JSON より優先
    const shared = song.phrases.map((p) => (typeof p.start === 'number' ? p.start : null));
    const local = load('timings');
    if (Array.isArray(local) && local.length === shared.length) {
      starts = local;
      timingsAreLocal = true;
    } else {
      starts = shared;
    }

    const savedLoop = load('loop');
    applyLoop(savedLoop && savedLoop.end > savedLoop.start ? savedLoop : { start: song.loop.start, end: song.loop.end }, false);
    const savedLimit = load('loopLimit');
    loopLimit = typeof savedLimit === 'number' ? savedLimit : 0;
    $('loop-limit').value = loopLimit > 0 ? loopLimit : '';
    updateLoopDisplay();

    renderPhraseList();
    renderSubtitleArea();
    setTimingMode(false);
    bindEvents();
    setInterval(tick, 100);
    startYouTube();
  }

  function bindEvents() {
    $('btn-play').addEventListener('click', () => {
      if (!media) return;
      if (media.isPlaying()) {
        media.pause();
      } else {
        const t = media.time();
        if (t < loop.start || t >= loop.end) seek(loop.start);
        onPlayStarted();
        media.play();
      }
    });
    $('btn-restart').addEventListener('click', () => {
      seek(loop.start);
      if (media) { onPlayStarted(); media.play(); }
    });

    document.querySelectorAll('#rate-buttons button').forEach((b) => {
      b.addEventListener('click', () => {
        rate = parseFloat(b.dataset.rate);
        if (media) media.setRate(rate);
        document.querySelectorAll('#rate-buttons button').forEach((x) => x.classList.toggle('on', x === b));
      });
    });

    $('loop-start').addEventListener('change', onLoopInput);
    $('loop-end').addEventListener('change', onLoopInput);
    $('loop-start-now').addEventListener('click', () => {
      if (!media) return;
      const t = round2(media.time());
      if (t >= loop.end) return toast('終了より前の位置で押してください');
      applyLoop({ start: t, end: loop.end }, true);
    });
    $('loop-end-now').addEventListener('click', () => {
      if (!media) return;
      const t = round2(media.time());
      if (t <= loop.start) return toast('開始より後の位置で押してください');
      applyLoop({ start: loop.start, end: t }, true);
    });
    $('loop-reset').addEventListener('click', () => {
      remove('loop');
      applyLoop({ start: song.loop.start, end: song.loop.end }, false);
      toast('ループ区間を元に戻しました');
    });
    $('loop-limit').addEventListener('change', () => {
      const n = parseInt($('loop-limit').value, 10);
      loopLimit = n > 0 ? n : 0;
      if (!loopLimit) $('loop-limit').value = '';
      save('loopLimit', loopLimit);
      loopCount = 0;
      updateLoopDisplay();
    });
    $('loop-count-reset').addEventListener('click', () => {
      loopCount = 0;
      stoppedByLimit = false;
      updateLoopDisplay();
    });

    $('file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) startLocal(f);
    });
    $('btn-youtube').addEventListener('click', backToYouTube);
    $('local-video').addEventListener('play', () => { onPlayStarted(); updatePlayButton(); });
    $('local-video').addEventListener('pause', updatePlayButton);

    $('btn-timing-mode').addEventListener('click', () => setTimingMode(!timingMode));
    $('btn-tap').addEventListener('click', tap);
    $('btn-tap-first').addEventListener('click', () => {
      tapIndex = 0;
      renderPhraseList();
      updateTapTarget();
    });
    $('btn-copy-json').addEventListener('click', copyJson);
    $('btn-reset-timing').addEventListener('click', resetTimings);

    // タブが非表示になったら一時停止（通信量・電池対策）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && media && media.isPlaying()) media.pause();
    });
  }

  init();
})();
