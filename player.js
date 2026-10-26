'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const songId = decodeURIComponent(location.hash.slice(1));

  // 曲を切り替えたら読み込み直す（状態をまっさらにするため）
  window.addEventListener('hashchange', () => location.reload());

  let song = null;
  let player = null;
  let loopCount = 0;
  let ignoreLoopUntil = 0;    // seek 直後は古い currentTime を拾わないようにする
  let lastCurrent = -2;

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
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
    await loadYouTubeApi();
    const p = new YT.Player('yt-player', {
      host: 'https://www.youtube-nocookie.com',
      videoId: song.youtubeId,
      playerVars: { playsinline: 1, rel: 0, start: Math.floor(song.loop.start) },
      events: {
        onReady: () => { player = p; },
        onError: (e) => {
          showError(e.data === 101 || e.data === 150
            ? 'この動画は埋め込み再生が許可されていません。'
            : 'YouTube 動画を再生できませんでした（エラー ' + e.data + '）。');
        },
      },
    });
  }

  const isPlaying = () => player.getPlayerState() === YT.PlayerState.PLAYING;

  // ---------- ループ監視（100ms） ----------
  function tick() {
    if (!player) return;
    const t = player.getCurrentTime() || 0;
    if (t >= song.loop.end && performance.now() > ignoreLoopUntil) {
      player.seekTo(song.loop.start, true);
      ignoreLoopUntil = performance.now() + 400;
      loopCount++;
      $('loop-display').textContent = 'ループ ' + loopCount + ' 周';
    }
    updateSubtitle(t);
  }

  // ---------- 字幕 ----------
  const hasAnyTiming = () => song.phrases.some((p) => p.start != null);

  function currentIndex(t) {
    let best = -1;
    let bestStart = -Infinity;
    song.phrases.forEach((p, i) => {
      if (p.start != null && p.start <= t && p.start >= bestStart) { best = i; bestStart = p.start; }
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
  }

  function renderSubtitleArea() {
    const box = $('subtitle');
    if (hasAnyTiming()) {
      box.innerHTML = '<div class="cur-kana" id="cur-kana"></div><div class="cur-text" id="cur-text"></div><div class="next" id="next"></div>';
      updateSubtitle(song.loop.start);
      return;
    }
    // タイミング未設定：全フレーズを一覧表示
    box.classList.add('all');
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

  // ---------- 初期化 ----------
  async function init() {
    if (!/^[a-z0-9-]+$/.test(songId)) {
      location.replace('index.html');
      return;
    }
    try {
      const res = await fetch('songs/' + songId + '.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      song = await res.json();
    } catch (e) {
      showError('曲データ songs/' + songId + '.json を読み込めませんでした。');
      return;
    }
    document.title = song.title + ' | ハカ練習';

    renderSubtitleArea();
    setInterval(tick, 100);
    startYouTube();

    // タブが非表示になったら一時停止（通信量・電池対策）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && player && isPlaying()) player.pauseVideo();
    });
  }

  init();
})();
