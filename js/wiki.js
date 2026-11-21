/* Wikipedia REST API からランダム記事を取得する */
(function (KG) {
  'use strict';

  const RANDOM_URL = 'https://ja.wikipedia.org/api/rest_v1/page/random/summary';
  const MIN_EXTRACT = 50;

  /** クイズに使える記事か判定する */
  function isUsable(d) {
    if (!d || !d.title || !d.extract) return false;
    if (d.type === 'disambiguation') return false;
    if (d.extract.length < MIN_EXTRACT) return false;
    if (/曖昧さ回避/.test(d.extract) || /曖昧さ回避/.test(d.description || '')) return false;
    return true;
  }

  /** APIレスポンスから必要な項目だけを取り出す */
  function normalize(d) {
    const urls = d.content_urls || {};
    return {
      title: d.title,
      extract: d.extract,
      thumbnail: d.thumbnail ? d.thumbnail.source : null,
      url: (urls.mobile && urls.mobile.page) || (urls.desktop && urls.desktop.page) ||
        'https://ja.wikipedia.org/wiki/' + encodeURIComponent(d.title),
    };
  }

  async function fetchRandomRaw() {
    const res = await fetch(RANDOM_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /**
   * 使える記事を n 件集めて返す。
   * @param {number} n
   */
  async function fetchArticles(n) {
    const found = [];
    const titles = new Set();
    let attempts = 0;
    let failures = 0;
    const MAX_ATTEMPTS = n * 8;

    while (found.length < n && attempts < MAX_ATTEMPTS) {
      const batch = Math.min(n - found.length + 2, 6);
      attempts += batch;
      const results = await Promise.allSettled(
        Array.from({ length: batch }, fetchRandomRaw)
      );
      for (const r of results) {
        if (r.status === 'rejected') { failures++; continue; }
        const d = r.value;
        if (!isUsable(d) || titles.has(d.title)) continue;
        found.push(normalize(d));
        titles.add(d.title);
        if (found.length >= n) break;
      }
      if (failures >= MAX_ATTEMPTS / 2) break;
    }
    if (found.length < n) {
      throw new Error('記事を取得できませんでした。通信状況を確認してください。');
    }
    return found;
  }

  const ACTION_API = 'https://ja.wikipedia.org/w/api.php';

  /**
   * 内容が似ている記事のタイトルを検索で集める(CirrusSearch の morelike)。
   * 紛らわしい選択肢を作るのに使う。
   */
  async function fetchSimilarTitles(title) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: 'morelike:' + title,
      srnamespace: '0',
      srlimit: '20',
      srprop: '',
      format: 'json',
      formatversion: '2',
      origin: '*', // 匿名のCORSリクエスト
    });
    const res = await fetch(ACTION_API + '?' + params.toString());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return ((data.query && data.query.search) || []).map((r) => r.title);
  }

  KG.wiki = { fetchArticles, fetchSimilarTitles, isUsable };
})(window.KG = window.KG || {});
