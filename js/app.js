/* 知識ガチャ — 画面制御 */
(function (KG) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const state = {
    current: null,     // 表示中の問題
    nextPromise: null, // 先読み中の次の問題
  };

  /* ---------- 問題の取得と先読み ---------- */

  async function makeQuestion() {
    const articles = await KG.wiki.fetchArticles(4);
    return KG.quiz.buildQuestion(articles, { allowImage: false });
  }

  function prefetch() {
    const p = makeQuestion();
    p.catch(() => {}); // 未処理エラー警告を防ぐ(使う時に改めて扱う)
    state.nextPromise = p;
  }

  async function takeQuestion() {
    const p = state.nextPromise || makeQuestion();
    state.nextPromise = null;
    return p;
  }

  /* ---------- 表示 ---------- */

  function show(id) {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== id; });
    window.scrollTo(0, 0);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function nextQuestion() {
    show('view-quiz');
    $('quiz-loading').hidden = false;
    $('quiz-error').hidden = true;
    $('quiz-body').hidden = true;
    try {
      const q = await takeQuestion();
      renderQuestion(q);
      prefetch(); // 解いている間に次の問題を準備
    } catch (e) {
      $('quiz-loading').hidden = true;
      $('quiz-error').hidden = false;
      $('quiz-error-msg').textContent = e.message || '読み込みに失敗しました。';
    }
  }

  function renderQuestion(q) {
    state.current = q;
    $('quiz-loading').hidden = true;
    $('quiz-body').hidden = false;

    const card = $('q-card');
    card.className = 'q-card';
    $('q-label').textContent = 'この説明はどの記事?';
    card.innerHTML = escapeHtml(q.prompt).replace(/〇〇/g, '<span class="mask">〇〇</span>');

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
    const ok = title === q.answer.title;
    document.querySelectorAll('#options .option').forEach((b) => {
      b.disabled = true;
      if (b.querySelector('.txt').textContent === q.answer.title) b.classList.add('correct');
    });
    if (!ok) btn.classList.add('wrong');
    // 選択肢の色を一瞬見せてから結果画面へ
    setTimeout(() => renderResult(q, ok, title), 450);
  }

  function renderResult(q, ok, chosen) {
    show('view-result');
    $('verdict').innerHTML = ok
      ? '<div class="stamp ok">正解</div>'
      : '<div class="stamp ng">残念</div>';
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
  }

  /* ---------- 起動 ---------- */

  $('btn-next').addEventListener('click', nextQuestion);
  $('btn-retry').addEventListener('click', nextQuestion);
  nextQuestion();
})(window.KG = window.KG || {});
