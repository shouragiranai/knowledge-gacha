/* localStorage への保存(気になる・間違えた問題・成績) */
(function (KG) {
  'use strict';

  const KEYS = {
    favorites: 'kg.favorites.v1',
    mistakes: 'kg.mistakes.v1',
    stats: 'kg.stats.v1',
    settings: 'kg.settings.v1',
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // プライベートモード等で保存できない場合はそのまま続行
    }
  }

  function todayKey(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function pickArticle(a) {
    return { title: a.title, extract: a.extract, thumbnail: a.thumbnail || null, url: a.url };
  }

  /* ---------- 気になる ---------- */
  const favorites = {
    list() { return load(KEYS.favorites, []); },
    has(title) { return this.list().some((f) => f.title === title); },
    add(article) {
      const list = this.list().filter((f) => f.title !== article.title);
      list.unshift(Object.assign(pickArticle(article), { savedAt: Date.now() }));
      save(KEYS.favorites, list);
    },
    remove(title) {
      save(KEYS.favorites, this.list().filter((f) => f.title !== title));
    },
    toggle(article) {
      if (this.has(article.title)) { this.remove(article.title); return false; }
      this.add(article);
      return true;
    },
  };

  /* ---------- 間違えた問題 ---------- */
  const mistakes = {
    list() { return load(KEYS.mistakes, []); },
    add(q) {
      const list = this.list();
      const prev = list.find((m) => m.answer.title === q.answer.title);
      const rest = list.filter((m) => m.answer.title !== q.answer.title);
      rest.unshift({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        answer: pickArticle(q.answer),
        options: q.options.slice(),
        wrongCount: (prev ? prev.wrongCount : 0) + 1,
        savedAt: Date.now(),
      });
      save(KEYS.mistakes, rest);
    },
    remove(id) {
      save(KEYS.mistakes, this.list().filter((m) => m.id !== id));
    },
    get(id) { return this.list().find((m) => m.id === id) || null; },
  };

  /* ---------- 成績 ---------- */
  const stats = {
    get() {
      const s = load(KEYS.stats, null) || {};
      return {
        days: s.days || {},
        streak: s.streak || 0,
        bestStreak: s.bestStreak || 0,
      };
    },
    record(correct) {
      const s = this.get();
      const k = todayKey();
      const d = s.days[k] || { answered: 0, correct: 0 };
      d.answered++;
      if (correct) d.correct++;
      s.days[k] = d;
      s.streak = correct ? s.streak + 1 : 0;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      save(KEYS.stats, s);
      return s;
    },
    summary() {
      const s = this.get();
      const today = s.days[todayKey()] || { answered: 0, correct: 0 };
      let answered = 0;
      let correct = 0;
      Object.values(s.days).forEach((d) => { answered += d.answered; correct += d.correct; });
      const recent = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        const k = todayKey(dt);
        recent.push(Object.assign({ date: dt }, s.days[k] || { answered: 0, correct: 0 }));
      }
      return {
        today,
        total: { answered, correct },
        streak: s.streak,
        bestStreak: s.bestStreak,
        recent,
      };
    },
  };

  /* ---------- 設定 ---------- */
  const settings = {
    get() {
      const s = load(KEYS.settings, null) || {};
      return {
        difficulty: s.difficulty || 'normal', // 'easy' | 'normal' | 'hard'
        genres: s.genres || {},              // ジャンルID → 'none' | 'few' | 'normal'(未設定は 'few')
      };
    },
    set(patch) {
      save(KEYS.settings, Object.assign(this.get(), patch));
    },
  };

  KG.store = { favorites, mistakes, stats, settings };
})(window.KG = window.KG || {});
