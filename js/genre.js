/*
 * 記事のジャンル判定(AIは使わず、タイトルと説明文の書き方から推定する)
 * ランダム記事は人物や駅などに偏りがちなので、出題頻度を調整するのに使う。
 */
(function (KG) {
  'use strict';

  const ROLE = '俳優|女優|歌手|政治家|選手|作家|小説家|漫画家|声優|アナウンサー|タレント|映画監督|監督|騎手|力士|棋士|画家|作曲家|作詞家|実業家|官僚|軍人|学者|研究者|アイドル|モデル|ミュージシャン|ギタリスト|ベーシスト|ドラマー|プロレスラー|格闘家|武将|大名|公家|貴族|僧|詩人|歌人|俳人|評論家|ジャーナリスト|弁護士|医師|教育者|コーチ|外交官|経営者|芸人|お笑い|脚本家|演出家|プロデューサー|写真家|建築家|彫刻家|指揮者|ピアニスト|ダンサー|YouTuber|ラッパー|旗本|藩士|藩主|天皇|皇族|王族|国王|皇帝|聖人';

  // 期間が「(1914年 - 1918年)」のように書かれる出来事は人物と誤判定しないよう除外
  const EVENT = /(戦争|大戦|の乱|戦い|合戦|事件|事変|革命|時代|王朝|運動|条約|地震|災害|台風|会戦|紛争|内戦|政権|内閣|博覧会|オリンピック)/;

  // 判定は上から順に行い、最初に当てはまったジャンルにする
  const GENRES = [
    {
      id: 'station', label: '駅',
      test: (t, s) => /駅$|停留場$|停留所$|信号場$/.test(t) || /(駅|停留場|停留所|信号場)(である|。)/.test(s),
    },
    {
      id: 'person', label: '人物',
      test: (t, s, d) =>
        !EVENT.test(t) && (
        /[（(][^）)]*\d{1,4}年(\d{1,2}月)?(\d{1,2}日)?\s*[-–—〜~]/.test(s.slice(0, 120)) ||
        /\d{1,4}年(\d{1,2}月\d{1,2}日)?\s*生まれ/.test(s) ||
        new RegExp('(' + ROLE + ')[^。]{0,8}(である|。|$)').test(s) ||
        new RegExp('(' + ROLE + ')$').test(d)),
    },
    {
      id: 'transport', label: '鉄道・道路・車両',
      test: (t, s) =>
        /(線|鉄道|道路|国道\d+号|県道.*|高速道路|自動車道|バイパス|インターチェンジ|ジャンクション|トンネル|形(電車|気動車|客車|機関車)?|系(電車|気動車)?)$/.test(t) ||
        /(路線|鉄道車両|電車|気動車|道路|航空路線|バス路線)(である|。)/.test(s),
    },
    {
      id: 'school', label: '学校',
      test: (t, s) => /(学校|大学|学園|学院|高校|短期大学|幼稚園|保育園)$/.test(t) || /(学校|大学)(である|。)/.test(s),
    },
    {
      id: 'place', label: '市町村・地名',
      test: (t, s) => /(の|にある|に位置する)(市|町|村|区|郡|集落|地区|大字|町名|地名|基礎自治体|自治体|コミューン|ゲマインデ)(である|。|$)/.test(s),
    },
    {
      id: 'sports', label: 'スポーツの大会・チーム',
      test: (t, s) =>
        /^\d{4}年の|\d{4}年?シーズン|^第\d+回|(大会|選手権|リーグ|杯|カップ|グランプリ|競走|ステークス|賞)$/.test(t) ||
        /(サッカークラブ|野球チーム|プロ野球|スポーツクラブ|競走馬)(である|。)/.test(s),
    },
    {
      id: 'music', label: '曲・アルバム',
      test: (t, s) => /(シングル|アルバム|楽曲|ミニアルバム|EP)(である|。|作品)/.test(s),
    },
  ];

  // 「少なめ」のときに採用する割合(元々の多さに合わせて調整)
  const FEW_RATE = {
    station: 0.15, person: 0.2, transport: 0.25, school: 0.25, place: 0.3, sports: 0.25, music: 0.35,
  };

  /** 記事のジャンルIDを返す(どれにも当てはまらなければ 'other') */
  function classify(a) {
    const s = (a.extract || '').split('。')[0] + '。';
    const d = a.description || '';
    const g = GENRES.find((x) => x.test(a.title, s, d));
    return g ? g.id : 'other';
  }

  /**
   * 設定に従ってこの記事を出題に使うか決める。
   * @param {object} a 記事
   * @param {Object<string,string>} levels ジャンルID → 'none' | 'few' | 'normal'
   */
  function accept(a, levels) {
    const id = classify(a);
    const level = (levels && levels[id]) || (id === 'other' ? 'normal' : 'few');
    if (level === 'none') return false;
    if (level === 'few') return Math.random() < FEW_RATE[id];
    return true;
  }

  KG.genre = {
    list: GENRES.map((g) => ({ id: g.id, label: g.label })),
    classify,
    accept,
  };
})(window.KG = window.KG || {});
