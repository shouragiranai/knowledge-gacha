/* 記事からクイズを組み立てる(AIは使わない) */
(function (KG) {
  'use strict';

  const MASK = '〇〇';

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** 位置 start の開きカッコから対応する閉じカッコの次の位置を返す(なければ -1) */
  function skipParen(text, start) {
    const open = '(（';
    const close = ')）';
    if (!open.includes(text[start])) return -1;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (open.includes(text[i])) depth++;
      else if (close.includes(text[i])) {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }

  /**
   * 要約中の記事名を「〇〇」に置き換える。
   * 冒頭の「〇〇(よみ、英: ...)」の読み仮名部分は答えのヒントになるので取り除く。
   */
  function maskTitle(extract, title) {
    const base = title.replace(/\s*[（(][^（()）]*[）)]\s*$/, '').trim();
    const variants = new Set();
    [title, base].forEach((t) => {
      if (!t) return;
      variants.add(t);
      variants.add(t.replace(/\s+/g, ''));
      variants.add(t.replace(/\s+/g, '・'));
      variants.add(t.replace(/・/g, ''));
    });

    let text = extract;
    const sorted = [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const v of sorted) {
      if (v.length >= 2) {
        text = text.replace(new RegExp(escapeRegExp(v), 'g'), MASK);
      } else if (text.startsWith(v)) {
        // 1文字の記事名は誤置換を避けるため冒頭だけ置き換える
        text = MASK + text.slice(v.length);
      }
    }
    // 連続した「〇〇〇〇」をまとめる
    text = text.replace(new RegExp('(?:' + MASK + ')+', 'g'), MASK);

    // 冒頭付近の「〇〇(…)」の読みを除去
    const idx = text.indexOf(MASK);
    if (idx !== -1 && idx < 6) {
      let p = idx + MASK.length;
      while (text[p] === ' ') p++;
      const end = skipParen(text, p);
      if (end !== -1) text = text.slice(0, idx + MASK.length) + text.slice(end);
    }
    return text;
  }

  function baseTitle(t) {
    return t.replace(/\s*[（(][^（()）]*[）)]\s*$/, '').trim();
  }

  /**
   * 似た記事の候補から、紛らわしいが答えにならない選択肢を選ぶ。
   * @param {object} answer 正解記事
   * @param {string[]} candidates 検索で見つかった似た記事のタイトル(関連度順)
   * @param {number} [n] 選ぶ数
   * @param {number} [pool] 関連度の上位何件から選ぶか(小さいほど紛らわしい)
   */
  function pickDistractors(answer, candidates, n, pool) {
    n = n || 3;
    pool = pool || 6;
    const ansBase = baseTitle(answer.title);
    const seenBase = new Set([ansBase]);
    const ok = [];
    for (const t of candidates) {
      const b = baseTitle(t);
      if (!b || seenBase.has(b)) continue;               // 同名の別記事は紛らわしすぎる
      if (/曖昧さ回避|一覧|^Wikipedia:/.test(t)) continue;
      if ((ansBase.length >= 2 && b.includes(ansBase)) || (b.length >= 2 && ansBase.includes(b))) continue; // 名前の一部が重なると答えが絞れてしまう
      if (b.length >= 2 && answer.extract.includes(b)) continue; // 説明文に出てくる語は消去法で外せてしまう
      seenBase.add(b);
      ok.push(t);
    }
    // 関連度の高い上位から選び、毎回同じ組み合わせにならないよう少し混ぜる
    return shuffle(ok.slice(0, Math.max(n, pool))).slice(0, n);
  }

  /**
   * 正解記事と3つの選択肢から1問作る。
   * @param {object} answer 正解記事
   * @param {string[]} distractors 不正解の選択肢(3件)
   */
  function buildQuestion(answer, distractors) {
    const type = answer.thumbnail && Math.random() < 0.5 ? 'image' : 'text';
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type,
      prompt: type === 'text' ? maskTitle(answer.extract, answer.title) : null,
      answer,
      options: shuffle([answer.title, ...distractors.slice(0, 3)]),
    };
  }

  KG.quiz = { buildQuestion, pickDistractors, maskTitle, shuffle };
})(window.KG = window.KG || {});
