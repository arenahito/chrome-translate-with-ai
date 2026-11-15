export const languages = [
  ['ja', '日本語'], ['en', '英語'], ['zh-Hans', '中国語（簡体字）'], ['zh-Hant', '中国語（繁体字）'],
  ['ko', '韓国語'], ['fr', 'フランス語'], ['de', 'ドイツ語'], ['es', 'スペイン語'],
  ['pt-BR', 'ポルトガル語（ブラジル）'], ['pt', 'ポルトガル語'], ['it', 'イタリア語'],
  ['ru', 'ロシア語'], ['ar', 'アラビア語'], ['he', 'ヘブライ語'], ['hi', 'ヒンディー語'],
  ['uk', 'ウクライナ語'], ['vi', 'ベトナム語'], ['th', 'タイ語'], ['id', 'インドネシア語'],
  ['nl', 'オランダ語'], ['pl', 'ポーランド語'], ['tr', 'トルコ語'], ['sv', 'スウェーデン語'],
  ['da', 'デンマーク語'], ['fi', 'フィンランド語'], ['nb', 'ノルウェー語'], ['cs', 'チェコ語'],
  ['el', 'ギリシャ語'], ['ro', 'ルーマニア語'], ['hu', 'ハンガリー語'], ['bg', 'ブルガリア語'],
  ['ms', 'マレー語'], ['tl', 'フィリピン語'], ['bn', 'ベンガル語'], ['fa', 'ペルシャ語'],
];

export const targetLanguages = languages.flatMap(([code, label]) => code === 'ja'
  ? [['ja', '日本語（敬体）'], ['ja-plain', '日本語（常体）']]
  : [[code, label]]);

export function normalizeTargetLanguage(value) {
  return value === 'ja-plain' ? value : normalizeLanguage(value);
}

export function normalizeLanguage(value) {
  if (!value) return null;
  const code = value.toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(code)) return 'zh-Hant';
  if (code.startsWith('zh')) return 'zh-Hans';
  const exact = languages.find(([language]) => language.toLowerCase() === code);
  if (exact) return exact[0];
  const base = code.split('-')[0];
  if (base === 'no') return 'nb';
  return languages.find(([language]) => language === base)?.[0] ?? null;
}
