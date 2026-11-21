/* 知識ガチャ — 画面制御 */
(function (KG) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const { favorites, mistakes, stats } = KG.store;

  const state = {
    mode: 'normal',     // 'normal' | 'review'
    phase: 'loading',   // 'loading' | 'question' | 'result' | 'error'
    current: null,      // 表示中の問題
    nextPromise: null,  // 先読み中の次の問題(通常モード)
    reviewQueue: [],    // 復習する問題IDの列
    reviewTotal: 0,
    reviewDone: 0,
    lastResult: null,   // { ok, chosen }
  };

  /* ---------- 問題の取得と先読み ---------- */

  async function makeQuestion() {
    const articles = await KG.wiki.fetchArticles(4);
    return KG.quiz.buildQuestion(articles);
  }

  function prefetch() {
    if (state.nextPromise) return;
    const p = makeQuestion();
    p.catch(() => {}); // 未処理エラー警告を防ぐ(使う時に改めて扱う)
    state.nextPromise = p;
    // 画像問題なら画像も先に読み込んでおく
    p.then((q) => { if (q.type === 'image') new Image().src = q.answer.thumbnail; }, () => {});
  }

  function takeQuestion() {
    const p = state.nextPromise || makeQuestion();
    state.nextPromise = null;
    return p;
  }

  /* ---------- 画面切り替え ---------- */

  const TAB_OF_VIEW = {
    'view-quiz': 'quiz', 'view-result': 'quiz',
    'view-favorites': 'favorites', 'view-mistakes': 'mistakes', 'view-stats': 'stats',
  };

  function show(id) {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== id; });
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.tab === TAB_OF_VIEW[id]);
    });
    document.body.classList.toggle('has-sticky', id === 'view-result');
    window.scrollTo(0, 0);
  }

  function openTab(tab) {
    if (tab === 'quiz') {
      if (state.mode === 'review') exitReview();
      if (state.phase === 'result' && state.current) {
        show('view-result');
      } else if (state.phase === 'question' && state.current) {
        show('view-quiz');
      } else {
        nextQuestion();
      }
    } else if (tab === 'favorites') {
      renderFavorites();
      show('view-favorites');
    } else if (tab === 'mistakes') {
      renderMistakes();
      show('view-mistakes');
    } else if (tab === 'stats') {
      renderStats();
      show('view-stats');
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ---------- 出題 ---------- */

  function setQuizPhase(phase, message) {
    state.phase = phase;
    $('quiz-loading').hidden = phase !== 'loading';
    $('quiz-error').hidden = phase !== 'error';
    $('quiz-body').hidden = phase !== 'question';
    if (phase === 'error') $('quiz-error-msg').textContent = message || '読み込みに失敗しました。';
  }

  async function nextQuestion() {
    if (state.mode === 'review') return nextReviewQuestion();
    show('view-quiz');
    renderReviewBanner();
    setQuizPhase('loading');
    try {
      const q = await takeQuestion();
      if (state.mode !== 'normal') return; // 待っている間に復習へ移った
      renderQuestion(q);
      prefetch(); // 解いている間に次の問題を準備
    } catch (e) {
      setQuizPhase('error', e.message);
    }
  }

  function renderQuestion(q) {
    state.current = q;
    setQuizPhase('question');

    const card = $('q-card');
    if (q.type === 'image') {
      $('q-label').textContent = 'この画像は何?';
      card.className = 'q-card is-image';
      card.innerHTML = '';
      const img = document.createElement('img');
      img.src = q.answer.thumbnail;
      img.alt = 'クイズの画像';
      card.appendChild(img);
    } else {
      $('q-label').textContent = 'この説明はどの記事?';
      card.className = 'q-card';
      card.innerHTML = escapeHtml(q.prompt).replace(/〇〇/g, '<span class="mask">〇〇</span>');
    }

    const box = $('options');
    box.innerHTML = '';
    q.options.forEach((title, i) => {
      const b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.innerHTML = '<span class="num">' + '一二三四'[i] + '</span><span class="txt"></span>';
      b.querySelector('.txt').textContent = title;
      b.addEventListener('click', () => answer(title, b));
      box.appendChild(b);
    });
  }

  function answer(title, btn) {
    const q = state.current;
    if (state.phase !== 'question') return;
    state.phase = 'answering';
    const ok = title === q.answer.title;

    document.querySelectorAll('#options .option').forEach((b) => {
      b.disabled = true;
      if (b.querySelector('.txt').textContent === q.answer.title) b.classList.add('correct');
    });
    if (!ok) btn.classList.add('wrong');

    stats.record(ok);
    if (state.mode === 'review') {
      if (ok) mistakes.remove(q.id);
      else mistakes.add(q); // 間違えた回数を増やす
      state.reviewDone++;
    } else if (!ok) {
      mistakes.add(q);
    }
    updateBadges();

    // 選択肢の色を一瞬見せてから結果画面へ
    setTimeout(() => renderResult(q, ok, title), 450);
  }

  /* ---------- 回答後 ---------- */

  function renderResult(q, ok, chosen) {
    state.phase = 'result';
    state.lastResult = { ok, chosen };
    show('view-result');

    const s = stats.get();
    const sub = ok
      ? (s.streak >= 2 ? s.streak + '問連続正解' : '')
      : (state.mode === 'review' ? '復習リストに残ります' : '復習リストに追加しました');
    $('verdict').innerHTML =
      (ok ? '<div class="stamp ok">正解</div>' : '<div class="stamp ng">残念</div>') +
      (sub ? '<p class="verdict-sub">' + escapeHtml(sub) + '</p>' : '');

    const ya = $('your-answer');
    if (ok) {
      ya.hidden = true;
    } else {
      ya.hidden = false;
      ya.innerHTML = 'あなたの答え:<b></b>';
      ya.querySelector('b').textContent = chosen;
    }

    const a = q.answer;
    const img = $('r-img');
    if (a.thumbnail) {
      img.src = a.thumbnail;
      img.alt = a.title;
      img.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
    }
    $('r-title').textContent = a.title;
    $('r-extract').textContent = a.extract;
    $('r-link').href = a.url;
    renderFavButton();

    const next = $('btn-next');
    if (state.mode === 'review') {
      next.textContent = state.reviewQueue.length ? '次の復習問題' : '復習を終える';
    } else {
      next.textContent = '次の問題';
    }
  }

  function renderFavButton() {
    const on = favorites.has(state.current.answer.title);
    const b = $('btn-fav');
    b.textContent = on ? '★ 保存済み' : '☆ 気になる';
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }

  /* ---------- 復習モード ---------- */

  function startReview(ids) {
    const list = ids.filter((id) => mistakes.get(id));
    if (!list.length) return;
    state.mode = 'review';
    state.reviewQueue = list;
    state.reviewTotal = list.length;
    state.reviewDone = 0;
    nextReviewQuestion();
  }

  function nextReviewQuestion() {
    let m = null;
    while (state.reviewQueue.length && !m) m = mistakes.get(state.reviewQueue.shift());
    if (!m) {
      exitReview();
      openTab('mistakes');
      return;
    }
    show('view-quiz');
    renderReviewBanner();
    // 選択肢の順番は毎回シャッフルし直す
    renderQuestion(Object.assign({}, m, { options: KG.quiz.shuffle(m.options) }));
  }

  function exitReview() {
    state.mode = 'normal';
    state.reviewQueue = [];
    state.current = null;
    state.phase = 'loading';
    renderReviewBanner();
  }

  function renderReviewBanner() {
    const on = state.mode === 'review';
    $('review-banner').hidden = !on;
    if (on) $('review-progress').textContent = (state.reviewDone + 1) + ' / ' + state.reviewTotal;
  }

  /* ---------- 気になるリスト ---------- */

  function renderFavorites() {
    const list = favorites.list();
    const ul = $('fav-list');
    ul.innerHTML = '';
    $('fav-empty').hidden = list.length > 0;
    list.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML =
        (f.thumbnail ? '<img class="item-thumb" alt="" loading="lazy">' : '<div class="item-thumb is-blank">記</div>') +
        '<div class="item-body">' +
        '  <a class="item-title" target="_blank" rel="noopener"></a>' +
        '  <p class="item-text"></p>' +
        '</div>' +
        '<button class="icon-btn" type="button" aria-label="削除">✕</button>';
      if (f.thumbnail) li.querySelector('img').src = f.thumbnail;
      const a = li.querySelector('.item-title');
      a.textContent = f.title;
      a.href = f.url;
      li.querySelector('.item-text').textContent = f.extract;
      li.querySelector('.icon-btn').setAttribute('aria-label', f.title + 'を削除');
      li.querySelector('.icon-btn').addEventListener('click', () => {
        favorites.remove(f.title);
        renderFavorites();
      });
      ul.appendChild(li);
    });
  }

  /* ---------- 間違えた問題リスト ---------- */

  function renderMistakes() {
    const list = mistakes.list();
    const ul = $('mis-list');
    ul.innerHTML = '';
    $('mis-empty').hidden = list.length > 0;
    $('btn-review-all').hidden = list.length === 0;
    $('btn-review-all').textContent = 'すべて復習する(' + list.length + '問)';
    list.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML =
        '<div class="item-body">' +
        '  <span class="tag"></span>' +
        '  <p class="item-text"></p>' +
        '  <button class="btn btn-small" type="button">解き直す</button>' +
        '</div>' +
        '<button class="icon-btn" type="button">✕</button>';
      li.querySelector('.tag').textContent =
        (m.type === 'image' ? '画像' : '説明文') + (m.wrongCount > 1 ? ' ・ ' + m.wrongCount + '回ミス' : '');
      // 答えが分からないよう、問題文(伏せ字)を表示する
      li.querySelector('.item-text').textContent =
        m.type === 'image' ? '選択肢:' + m.options.join(' / ') : m.prompt;
      li.querySelector('.btn-small').addEventListener('click', () => startReview([m.id]));
      const del = li.querySelector('.icon-btn');
      del.setAttribute('aria-label', 'この問題を削除');
      del.addEventListener('click', () => {
        mistakes.remove(m.id);
        updateBadges();
        renderMistakes();
      });
      ul.appendChild(li);
    });
  }

  /* ---------- 成績 ---------- */

  function pct(c, a) { return a ? Math.round((c / a) * 100) + '%' : '—'; }

  function renderStats() {
    const s = stats.summary();
    const tiles = [
      ['今日解いた数', s.today.answered, '問'],
      ['今日の正答率', pct(s.today.correct, s.today.answered), ''],
      ['連続正解', s.streak, '問'],
      ['最高連続正解', s.bestStreak, '問'],
      ['これまでに解いた数', s.total.answered, '問'],
      ['通算の正答率', pct(s.total.correct, s.total.answered), ''],
    ];
    $('stats-tiles').innerHTML = tiles.map(([label, val, unit]) =>
      '<div class="tile"><div class="tile-label">' + label + '</div>' +
      '<div class="tile-val">' + escapeHtml(val) + '<small>' + unit + '</small></div></div>'
    ).join('');

    const max = Math.max(1, ...s.recent.map((d) => d.answered));
    const wd = '日月火水木金土';
    $('stats-week').innerHTML = s.recent.map((d, i) => {
      const h = Math.round((d.answered / max) * 100);
      const hc = d.answered ? Math.round((d.correct / d.answered) * h) : 0;
      return '<div class="day' + (i === 6 ? ' is-today' : '') + '">' +
        '<div class="day-num">' + (d.answered || '') + '</div>' +
        '<div class="day-track"><div class="day-bar" style="height:' + h + '%"><div class="day-ok" style="height:' + (h ? (hc / h) * 100 : 0) + '%"></div></div></div>' +
        '<div class="day-label">' + wd[d.date.getDay()] + '</div></div>';
    }).join('');
  }

  /* ---------- ヘッダー・バッジ ---------- */

  function updateBadges() {
    const n = mistakes.list().length;
    const badge = $('mis-badge');
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    const s = stats.get();
    $('header-stat').textContent = s.streak > 0 ? s.streak + '連続正解中' : '';
  }

  /* ---------- 起動 ---------- */

  $('btn-next').addEventListener('click', nextQuestion);
  $('btn-retry').addEventListener('click', nextQuestion);
  $('btn-fav').addEventListener('click', () => {
    favorites.toggle(state.current.answer);
    renderFavButton();
  });
  $('btn-review-all').addEventListener('click', () => {
    startReview(mistakes.list().map((m) => m.id));
  });
  $('btn-review-quit').addEventListener('click', () => {
    exitReview();
    openTab('mistakes');
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => openTab(t.dataset.tab));
  });

  updateBadges();
  nextQuestion();
})(window.KG = window.KG || {});
