import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  LayoutGrid,
  Settings,
  Star,
  Zap,
  Flame,
  BarChart3,
  Clock,
  ArrowRight,
  X,
  AlertTriangle,
  Target,
  XCircle,
  RotateCw,
  FileText,
  CheckSquare,
  BookText,
  Filter,
  Layers,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import RAW_BIM_KANJI_DATA from './data/bim_kanji.json';
import RAW_BASIC_KANJI_DATA from './data/basic_kanji.json';
import BASIC_PAGE_META from './data/basic_page_meta.json';
// ==========================================
// 1. HELPERS & NORMALIZATION
// ==========================================
const DEFAULT_SESSION_CONFIG = { type: 'srs', mode: null, source: null };
const STORAGE_VERSION = 'v18';
const OTP_COOLDOWN_MS = 5 * 60 * 1000;
const OTP_STORAGE_KEY = 'kanjiapp_otp_cooldown_until';

const cleanText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const pickFirstValue = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return undefined;
};

const pickFirstString = (obj, keys, fallback = '') => {
  const value = pickFirstValue(obj, keys);
  const text = cleanText(value);
  return text || fallback;
};

const pickFirstNumber = (obj, keys, fallback = 0) => {
  const value = pickFirstValue(obj, keys);
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseReadingToArray = (value) => {
  if (value === null || value === undefined) return [];

  const values = Array.isArray(value) ? value : [value];

  const tokens = values.flatMap((entry) =>
    String(entry)
      .split(/[\n,，、/・|]/)
      .map((v) => v.trim())
      .filter(Boolean)
  );

  const cleaned = tokens
    .flatMap((entry) => {
      const text = String(entry).trim();
      if (!text) return [];
      if (text === '-' || text === '없음' || text === 'なし') return [];

      // 1) "さん(산)" / "ハイ(배)" 형태면 괄호 앞 일본어만 추출
      const beforeParen = text.match(/^([ぁ-ゖァ-ヺーゝゞヽヾ]+)/);
      if (beforeParen?.[1]) return [beforeParen[1]];

      // 2) 문자열 안의 히라가나/카타카나 모두 추출
      const kanaMatches = text.match(/[ぁ-ゖァ-ヺーゝゞヽヾ]+/g);
      if (kanaMatches && kanaMatches.length > 0) return kanaMatches;

      return [];
    })
    .map((v) => v.trim())
    .filter(Boolean);

  return [...new Set(cleaned)];
};

const displayReadings = (value) => {
  const list = Array.isArray(value) ? value : parseReadingToArray(value);
  if (!Array.isArray(list) || list.length === 0) return '-';

  const text = list
    .map((entry) => String(entry).replace(/\./g, '').trim())
    .filter(Boolean)
    .join(', ');

  return text || '-';
};

const getShortMeaningLabel = (mean) => {
  const text = cleanText(mean);
  if (!text) return '';

  const parts = text.split(/\s+/).filter(Boolean);
  return parts[0] || text;
};

const getReadingDisplay = (card, type) => {
  const direct = type === 'on' ? card?.on_readings : card?.kun_readings;
  const examples = type === 'on' ? card?.onExamples : card?.kunExamples;

  if (Array.isArray(direct) && direct.length > 0) {
    return displayReadings(direct);
  }

  const exampleReadings = Array.isArray(examples)
    ? examples
        .map((ex) => ex?.reading)
        .flatMap((reading) => parseReadingToArray(reading))
    : [];

  return displayReadings(exampleReadings);
};
const getCombinedReadingText = (card) => {
  const on = getReadingDisplay(card, 'on');
  const kun = getReadingDisplay(card, 'kun');

  if (on !== '-' && kun !== '-') return `음: ${on} / 훈: ${kun}`;
  if (on !== '-') return `음: ${on}`;
  if (kun !== '-') return `훈: ${kun}`;
  return '-';
};
const getReadingBadgeText = (card, type) => {
  const readingText = getReadingDisplay(card, type);
  if (readingText === '-') return '-';

  const examples = type === 'on' ? card?.onExamples : card?.kunExamples;
  const exampleMeaning = cleanText(examples?.[0]?.meaning);
  const gloss = exampleMeaning || getShortMeaningLabel(card?.mean);

  return gloss ? `${readingText} (${gloss})` : readingText;
};

const parseTags = (value, fallback = []) => {
  if (Array.isArray(value)) {
    const tags = value.map((item) => cleanText(item)).filter(Boolean);
    return tags.length > 0 ? tags : fallback;
  }

  const text = cleanText(value);
  if (!text) return fallback;

  return text
    .split(/[,#/|]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseExampleEntry = (entry) => {
  if (!entry) return null;

  if (typeof entry === 'string') {
    const raw = cleanText(entry);
    if (!raw) return null;

    const pipeSplit = raw.split('|').map((item) => item.trim()).filter(Boolean);
    if (pipeSplit.length >= 3) {
      return {
        word: pipeSplit[0],
        reading: pipeSplit[1],
        meaning: pipeSplit.slice(2).join(' | '),
      };
    }

    const match1 = raw.match(/^(.+?)\s*\[(.+?)\]\s*[-:：]\s*(.+)$/);
    if (match1) {
      return {
        word: match1[1].trim(),
        reading: match1[2].trim(),
        meaning: match1[3].trim(),
      };
    }

    const match2 = raw.match(/^(.+?)\s*[(:：（]\s*([ぁ-ゖァ-ヺー・.]+)\s*[)\]）]\s*[-:：]?\s*(.*)$/);
    if (match2) {
      return {
        word: match2[1].trim(),
        reading: match2[2].trim(),
        meaning: match2[3].trim(),
      };
    }

    return { word: raw, reading: '', meaning: '' };
  }

  if (typeof entry === 'object') {
    const word = pickFirstString(entry, [
      'word',
      'term',
      'vocab',
      'surface',
      'kanji',
      'text',
      '표기',
      '단어',
      '단어1',
      '예시',
      'example',
      '語',
    ]);

    const reading = pickFirstString(entry, [
      'reading',
      'yomi',
      'kana',
      'ruby',
      'hiragana',
      '음',
      '독음',
      '요미',
      '후리가나',
      '読み',
      'かな',
    ]);

    const meaning = pickFirstString(entry, [
      'meaning',
      'meaning_kr',
      'mean',
      'translation',
      'gloss',
      '뜻',
      '의미',
      '해석',
      '번역',
    ]);

    if (!word && !reading && !meaning) return null;

    return {
      word: word || '-',
      reading,
      meaning,
    };
  }

  return null;
};

const parseExamples = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseExamples(entry));
  }

  if (typeof value === 'object') {
    const nestedCandidates = [
      value.examples,
      value.items,
      value.words,
      value.list,
      value.data,
      value.entries,
      value.values,
    ].filter(Boolean);

    for (const nested of nestedCandidates) {
      const parsed = parseExamples(nested);
      if (parsed.length > 0) return parsed;
    }

    const single = parseExampleEntry(value);
    return single ? [single] : [];
  }

  const text = cleanText(value);
  if (!text) return [];

  return text
    .split(/[\n;,，]+/)
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .map((entry) => {
      const raw = String(entry).trim();

      // 예: 登山(등산)
      const match = raw.match(/^(.+?)\((.+?)\)$/);
      if (match) {
        return {
          word: match[1].trim(),
          reading: '',
          meaning: match[2].trim(),
        };
      }

      return {
        word: raw,
        reading: '',
        meaning: '',
      };
    });
};

const ensureExampleFallbacks = (examples, kanji, readings, mean) => {
  if (Array.isArray(examples) && examples.length > 0) return examples;
  if (!Array.isArray(readings) || readings.length === 0) return [];
  return [
    {
      word: kanji || '-',
      reading: readings[0] || '',
      meaning: cleanText(mean) || '',
    },
  ];
};

const formatGroupLabel = (groupNum) => String(Number(groupNum) || 0).padStart(3, '0');

const parseKanjiList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }

  const text = cleanText(value);
  if (!text) return [];

  return text
    .split(/[,/]/)
    .map((item) => item.replace(/^\d+\s*[:：-]\s*/, '').trim())
    .filter(Boolean);
};

const extractKanjiListFromTitle = (title) => {
  const text = cleanText(title);
  if (!text.includes(':')) return [];
  return text
    .split(':')
    .slice(1)
    .join(':')
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeBasicMetaEntry = (meta, index) => {
  const sourceVolume = pickFirstNumber(meta, ['sourceVolume', 'volume', 'vol', 'book'], 1);
  const sourcePage = pickFirstNumber(meta, ['sourcePage', 'page', 'pageNum', 'page_no'], index + 1);
  const groupId = pickFirstNumber(meta, ['groupId', 'groupNum', 'group', 'memorizeGroup'], sourcePage);

  let kanjiIds = pickFirstValue(meta, ['kanjiIds', 'ids', 'kanji_ids', 'kanjiIdList']) || [];
  if (typeof kanjiIds === 'string') {
    kanjiIds = kanjiIds
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  kanjiIds = Array.isArray(kanjiIds) ? kanjiIds.map((item) => String(item).trim()).filter(Boolean) : [];

  const title = pickFirstString(meta, ['title', 'groupTitle', 'name'], `${formatGroupLabel(groupId)}`);
  const explicitKanjiList = parseKanjiList(pickFirstValue(meta, ['kanjiList', 'kanji_list', 'titleKanji']));
  const normalizedKanjiList = explicitKanjiList.length > 0 ? explicitKanjiList : extractKanjiListFromTitle(title);
  const count = pickFirstNumber(meta, ['count', 'kanjiCount', 'length'], kanjiIds.length || normalizedKanjiList.length || 0);

  return {
    ...meta,
    sourceVolume,
    sourcePage,
    groupId,
    title,
    kanjiIds,
    kanjiList: normalizedKanjiList,
    count,
  };
};

const NORMALIZED_BASIC_PAGE_META = (Array.isArray(BASIC_PAGE_META) ? BASIC_PAGE_META : [])
  .map(normalizeBasicMetaEntry)
  .sort((a, b) => {
    return (
      (Number(a.sourceVolume) || 0) - (Number(b.sourceVolume) || 0) ||
      (Number(a.sourcePage) || 0) - (Number(b.sourcePage) || 0) ||
      (Number(a.groupId) || 0) - (Number(b.groupId) || 0)
    );
  });

const BASIC_META_BY_KANJI_ID = (() => {
  const map = {};

  NORMALIZED_BASIC_PAGE_META.forEach((meta) => {
    meta.kanjiIds.forEach((kanjiId, index) => {
      map[String(kanjiId)] = {
        ...meta,
        pageIndex: index + 1,
      };
    });
  });

  return map;
})();

const findBasicPageMeta = (volume, page) =>
  NORMALIZED_BASIC_PAGE_META.find(
    (meta) =>
      Number(meta.sourceVolume) === Number(volume) &&
      Number(meta.sourcePage) === Number(page)
  ) || null;

const normalizeBasicItem = (item) => {
  const meta = BASIC_META_BY_KANJI_ID[String(item.id)] || null;

  const mean = pickFirstString(
    item,
    ['mean', 'meaning_kr', 'meaning', 'translation', '뜻', 'koreanMeaning'],
    '-'
  );

  const story = pickFirstString(item, [
    'memory_hint',
    'memoryHint',
    'memoryTip',
    'story',
    'mnemonic',
    'reason',
    'hint',
    'memory',
    'memo',
    '암기비법',
    '암기 비법',
    '연상법',
    '스토리',
    '설명',
    'note',
    'notes',
    'description',
    'desc',
  ]);

  const onReadings = parseReadingToArray(
    pickFirstValue(item, [
      'on_readings',
      'on_reading',
      'onReading',
      'reading_on',
      'onyomi',
      'on',
      '音読み',
      '음독',
      'reading',
      'readings_on',
    ])
  );

  const kunReadings = parseReadingToArray(
    pickFirstValue(item, [
      'kun_readings',
      'kun_reading',
      'kunReading',
      'reading_kun',
      'kunyomi',
      'kun',
      '訓読み',
      '훈독',
      'readings_kun',
    ])
  );

  const rawOnExamples = parseExamples(
    pickFirstValue(item, [
      'onyomiExamples',
      'onExamples',
      'on_examples',
      'onyomi_examples',
      'onyomi_words',
      'examplesOn',
      'examples_on',
      'on_words',
      'related_on',
      'vocab_on',
      '音読例',
      '음독예',
      'onExample',
    ])
  );

  const rawKunExamples = parseExamples(
    pickFirstValue(item, [
      'kunyomiExamples',
      'kunExamples',
      'kun_examples',
      'kunyomi_examples',
      'kunyomi_words',
      'examplesKun',
      'examples_kun',
      'kun_words',
      'related_kun',
      'vocab_kun',
      '訓読例',
      '훈독예',
      'kunExample',
    ])
  );

  const extraExamples = parseExamples(
    pickFirstValue(item, ['otherExamples', 'examples', 'example'])
  );

  const normalizedOnReadings =
    onReadings.length > 0
      ? onReadings
      : parseReadingToArray(rawOnExamples.map((ex) => ex?.reading).join(','));

  const normalizedKunReadings =
    kunReadings.length > 0
      ? kunReadings
      : parseReadingToArray(rawKunExamples.map((ex) => ex?.reading).join(','));

  return {
    ...item,
    id: `basic-${item.id}`,
    originalId: item.id,
    dataset: 'basic',
    mean,
    on_readings: normalizedOnReadings,
    kun_readings: normalizedKunReadings,
    onExamples: ensureExampleFallbacks(rawOnExamples, item.kanji, normalizedOnReadings, mean),
    kunExamples: ensureExampleFallbacks(rawKunExamples, item.kanji, normalizedKunReadings, mean),
    examples: [...rawOnExamples, ...rawKunExamples, ...extraExamples],
    story,
    groupNum: Number(meta?.groupId ?? pickFirstNumber(item, ['groupNum', 'group', 'group_id', 'groupNumNormalized'], 1)),
    sourceVolume: Number(meta?.sourceVolume ?? pickFirstNumber(item, ['sourceVolume', 'volume'], 1)),
    sourcePage: Number(meta?.sourcePage ?? pickFirstNumber(item, ['sourcePage', 'page'], 1)),
    pageOrder: Number(meta?.pageIndex ?? pickFirstNumber(item, ['pageOrder', 'order', 'codeId'], item.id || 0)),
    level: pickFirstString(item, ['level', 'jlpt', 'jlpt_level', 'grade'], 'BASIC'),
    tags: parseTags(
      pickFirstValue(item, ['tags', 'tag', 'categories', 'category']),
      ['basic']
    ),
  };
};

const normalizeBimItem = (item) => {
  const mean = pickFirstString(
    item,
    ['mean', 'meaning_kr', 'meaning', 'translation', '뜻', 'koreanMeaning'],
    '-'
  );

  const story = pickFirstString(item, [
    'memory_hint',
    'memoryHint',
    'memoryTip',
    'story',
    'mnemonic',
    'reason',
    'hint',
    'memory',
    'memo',
    '암기비법',
    '암기 비법',
    '연상법',
    '스토리',
    '설명',
    'note',
    'notes',
    'description',
    'desc',
  ]);

  const onReadings = parseReadingToArray(
    pickFirstValue(item, [
      'on_readings',
      'on_reading',
      'onReading',
      'reading_on',
      'onyomi',
      'on',
      '音読み',
      '음독',
      'readings_on',
    ])
  );

  const kunReadings = parseReadingToArray(
    pickFirstValue(item, [
      'kun_readings',
      'kun_reading',
      'kunReading',
      'reading_kun',
      'kunyomi',
      'kun',
      '訓読み',
      '훈독',
      'readings_kun',
    ])
  );

  const rawOnExamples = parseExamples(
    pickFirstValue(item, [
      'onyomiExamples',
      'onExamples',
      'on_examples',
      'onyomi_examples',
      'examplesOn',
      'examples_on',
      'on_words',
      'related_on',
      'vocab_on',
    ])
  );

  const rawKunExamples = parseExamples(
    pickFirstValue(item, [
      'kunyomiExamples',
      'kunExamples',
      'kun_examples',
      'kunyomi_examples',
      'examplesKun',
      'examples_kun',
      'kun_words',
      'related_kun',
      'vocab_kun',
    ])
  );

  const extraExamples = parseExamples(
    pickFirstValue(item, ['otherExamples', 'examples', 'example'])
  );

  const normalizedOnReadings =
    onReadings.length > 0
      ? onReadings
      : parseReadingToArray(rawOnExamples.map((ex) => ex?.reading).join(','));

  const normalizedKunReadings =
    kunReadings.length > 0
      ? kunReadings
      : parseReadingToArray(rawKunExamples.map((ex) => ex?.reading).join(','));

  const onExamples = ensureExampleFallbacks(
    rawOnExamples,
    item.kanji,
    normalizedOnReadings,
    mean
  );

  const kunExamples = ensureExampleFallbacks(
    rawKunExamples,
    item.kanji,
    normalizedKunReadings,
    mean
  );

  const rawBimTerm = pickFirstValue(item, [
    'bim_term',
    'bimTerm',
    'term',
    'representativeTerm',
  ]);

  const bimTerm = (() => {
    if (!rawBimTerm) return null;

    if (typeof rawBimTerm === 'string') {
      const text = cleanText(rawBimTerm);
      if (!text) return null;

      const parsed = parseExampleEntry(text);
      if (parsed) {
        return {
          word: parsed.word || item.kanji,
          reading: parsed.reading || '',
          meaning: parsed.meaning || mean,
        };
      }

      return {
        word: text,
        reading: '',
        meaning: mean,
      };
    }

    if (typeof rawBimTerm === 'object') {
      const parsed = parseExampleEntry(rawBimTerm);
      if (!parsed) return null;

      return {
        word: parsed.word || item.kanji,
        reading: parsed.reading || '',
        meaning: parsed.meaning || mean,
      };
    }

    return null;
  })();

  return {
    ...item,
    id: `bim-${item.id}`,
    originalId: item.id,
    dataset: 'bim',
    mean,
    on_readings: normalizedOnReadings,
    kun_readings: normalizedKunReadings,
    onExamples,
    kunExamples,
    examples: [...rawOnExamples, ...rawKunExamples, ...extraExamples],
    story,
    bimTerm,
    level: pickFirstString(item, ['level', 'importance', 'jlpt', 'grade'], 'BIM'),
    tags: parseTags(
      pickFirstValue(item, ['tags', 'tag', 'categories', 'category']),
      ['bim']
    ),
  };
};
const BIM_KANJI_DATA = RAW_BIM_KANJI_DATA.map(normalizeBimItem);
const BASIC_KANJI_DATA = RAW_BASIC_KANJI_DATA.map(normalizeBasicItem);
const ALL_KANJI_DATA = [...BIM_KANJI_DATA, ...BASIC_KANJI_DATA];

const compareKanjiOrder = (a, b) => {
  if (a.dataset !== b.dataset) return a.dataset === 'bim' ? -1 : 1;

  if (a.dataset === 'basic') {
    return (
      (Number(a.sourceVolume) || 0) - (Number(b.sourceVolume) || 0) ||
      (Number(a.sourcePage) || 0) - (Number(b.sourcePage) || 0) ||
      (Number(a.groupNum) || 0) - (Number(b.groupNum) || 0) ||
      (Number(a.pageOrder) || 0) - (Number(b.pageOrder) || 0) ||
      (Number(a.originalId) || 0) - (Number(b.originalId) || 0) ||
      String(a.kanji).localeCompare(String(b.kanji), 'ko')
    );
  }

  return (
    (Number(a.originalId) || 0) - (Number(b.originalId) || 0) ||
    String(a.kanji).localeCompare(String(b.kanji), 'ko')
  );
};

const sortKanjiList = (list) => [...list].sort(compareKanjiOrder);

const getKanjiMap = () =>
  ALL_KANJI_DATA.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

const buildIdResolver = (list) => {
  const validIds = new Set();
  const byLegacyId = {};

  list.forEach((item) => {
    validIds.add(item.id);
    byLegacyId[item.id] = item.id;
    byLegacyId[String(item.originalId)] = item.id;
  });

  return { validIds, byLegacyId };
};

const BIM_ID_RESOLVER = buildIdResolver(BIM_KANJI_DATA);
const BASIC_ID_RESOLVER = buildIdResolver(BASIC_KANJI_DATA);

const normalizeKanjiId = (rawId, track) => {
  if (rawId === null || rawId === undefined) return null;

  const resolver = track === 'bim' ? BIM_ID_RESOLVER : BASIC_ID_RESOLVER;
  const text = String(rawId).trim();

  if (resolver.validIds.has(text)) return text;

  const stripped = text.replace(/^bim-/, '').replace(/^basic-/, '');
  return resolver.byLegacyId[stripped] || null;
};

const normalizeKanjiIdList = (ids, track) => {
  if (!Array.isArray(ids)) return [];

  const seen = new Set();
  const next = [];

  ids.forEach((rawId) => {
    const normalized = normalizeKanjiId(rawId, track);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });

  return next;
};

const mergeFlashStats = (raw) => ({
  meaning: {
    c: Number(raw?.meaning?.c || 0),
    w: Number(raw?.meaning?.w || 0),
  },
  on: {
    c: Number(raw?.on?.c || 0),
    w: Number(raw?.on?.w || 0),
  },
  kun: {
    c: Number(raw?.kun?.c || 0),
    w: Number(raw?.kun?.w || 0),
  },
});

const sanitizeHistoryList = (history, track) => {
  if (!Array.isArray(history)) return [];

  return history
    .map((entry) => {
      const normalizedId = normalizeKanjiId(entry?.kanjiId, track);
      if (!normalizedId) return null;
      return {
        ...entry,
        kanjiId: normalizedId,
        timestamp: Number(entry?.timestamp || Date.now()),
      };
    })
    .filter(Boolean);
};

const getDateKeyFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return null;

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getYesterdayKey = () => {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getBasicPageKey = (vol, pg) => `v${vol}_p${pg}`;

const createFreshCards = (track) =>
  ALL_KANJI_DATA.filter((item) => item.dataset === track).reduce((acc, item) => {
    acc[item.id] = {
      kanjiId: item.id,
      status: 'new',
      interval: 0,
      easeFactor: 2.5,
      lapseCount: 0,
      nextReviewAt: 0,
      lastReviewedAt: null,
      flashStats: {
        meaning: { c: 0, w: 0 },
        on: { c: 0, w: 0 },
        kun: { c: 0, w: 0 },
      },
    };
    return acc;
  }, {});

const migrateCardsState = (cards, track) => {
  const fresh = createFreshCards(track);
  if (!cards || typeof cards !== 'object') return fresh;

  Object.entries(cards).forEach(([rawKey, rawCard]) => {
    const normalizedId = normalizeKanjiId(rawCard?.kanjiId ?? rawKey, track);
    if (!normalizedId || !fresh[normalizedId]) return;

    fresh[normalizedId] = {
      ...fresh[normalizedId],
      status: ['new', 'learning', 'review', 'mastered'].includes(rawCard?.status)
        ? rawCard.status
        : 'new',
      interval: Number(rawCard?.interval || 0),
      easeFactor: Number(rawCard?.easeFactor || 2.5),
      lapseCount: Number(rawCard?.lapseCount || 0),
      nextReviewAt: Number(rawCard?.nextReviewAt || 0),
      lastReviewedAt: rawCard?.lastReviewedAt ?? null,
      flashStats: mergeFlashStats(rawCard?.flashStats),
    };
  });

  return fresh;
};

const isValidCardsShape = (cards, track) => {
  if (!cards || typeof cards !== 'object') return false;
  const resolver = track === 'bim' ? BIM_ID_RESOLVER : BASIC_ID_RESOLVER;
  return Array.from(resolver.validIds).some((id) => cards[id]);
};

const sanitizeDailyState = (daily, track, { resetTodayArrays = false } = {}) => {
  const today = getTodayKey();
  const base = daily && typeof daily === 'object' ? daily : {};

  return {
    dateKey: cleanText(base.dateKey) || today,
    lastStudyDate: base.lastStudyDate || null,
    streak: Number(base.streak || 0),
    introducedNewIds: resetTodayArrays ? [] : normalizeKanjiIdList(base.introducedNewIds, track),
    todaySeenIds: resetTodayArrays ? [] : normalizeKanjiIdList(base.todaySeenIds, track),
    todayWrongIds: resetTodayArrays ? [] : normalizeKanjiIdList(base.todayWrongIds, track),
    srsCompletedIds: resetTodayArrays ? [] : normalizeKanjiIdList(base.srsCompletedIds, track),
    reviewsCompleted: resetTodayArrays ? 0 : Number(base.reviewsCompleted || 0),
    studiedPages: Array.isArray(base.studiedPages) ? base.studiedPages : [],
    studiedGroups: Array.isArray(base.studiedGroups)
      ? base.studiedGroups.map((num) => Number(num)).filter((num) => Number.isFinite(num))
      : [],
  };
};

const reconcileDailyWithCards = (daily, cards) => {
  const validIds = new Set(Object.keys(cards));

  const filterValid = (list) => list.filter((id) => validIds.has(id));

  return {
    ...daily,
    introducedNewIds: filterValid(daily.introducedNewIds || []),
    todaySeenIds: filterValid(daily.todaySeenIds || []),
    todayWrongIds: filterValid(daily.todayWrongIds || []),
    srsCompletedIds: filterValid(daily.srsCompletedIds || []),
    reviewsCompleted: Number(daily.reviewsCompleted || 0),
  };
};

const createInitialDailyState = (track) =>
  sanitizeDailyState(
    {
      dateKey: getTodayKey(),
      lastStudyDate: null,
      streak: 0,
      introducedNewIds: [],
      todaySeenIds: [],
      todayWrongIds: [],
      srsCompletedIds: [],
      reviewsCompleted: 0,
      studiedPages: [],
      studiedGroups: [],
    },
    track
  );

const getStorageKey = (track, suffix) => `${track}_${suffix}_${STORAGE_VERSION}`;
const getLegacyStorageKeys = (track, suffix) => [
  getStorageKey(track, suffix),
  `${track}_${suffix}_v17`,
  `${track}_${suffix}_v16`,
  `${track}_${suffix}_v15`,
];

const readStoredJson = (keys, fallback) => {
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (!value) continue;
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error(`${key} 파싱 실패`, error);
    }
  }
  return fallback;
};

const unique = (list) => Array.from(new Set(list));

const shuffle = (list) => {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const buildWeightedQueue = (ids, getWeight, maxLength = 20) => {
  const expanded = [];

  ids.forEach((id) => {
    const weight = Math.max(1, Number(getWeight(id) || 1));
    const repeat = Math.min(4, Math.max(1, Math.ceil(weight)));
    for (let i = 0; i < repeat; i += 1) {
      expanded.push(id);
    }
  });

  const targetLength = Math.max(ids.length, maxLength);
  return shuffle(expanded).slice(0, targetLength);
};

// ==========================================
// 2. LOGIC: SRS (Spaced Repetition System)
// ==========================================
// ==========================================
// 2. LOGIC: SRS (Spaced Repetition System)
// ==========================================
const calculateReviewSchedule = (card, difficulty) => {
  let { interval, easeFactor, lapseCount, status } = card;
  const now = Date.now();
  let nextIntervalDays = 0;

  if (status === 'new' || status === 'learning') {
    if (difficulty === 'again') { nextIntervalDays = 0; status = 'learning'; }
    else if (difficulty === 'hard') { nextIntervalDays = 1; status = 'review'; }
    else if (difficulty === 'good') { nextIntervalDays = 3; status = 'review'; }
    else if (difficulty === 'easy') { nextIntervalDays = 7; status = 'mastered'; }
  } else {
    if (difficulty === 'again') { nextIntervalDays = 0; lapseCount += 1; status = 'learning'; }
    else if (difficulty === 'hard') { nextIntervalDays = Math.min(60, interval + 3); status = 'review'; }
    else if (difficulty === 'good') { nextIntervalDays = Math.min(60, interval + 7); status = nextIntervalDays > 21 ? 'mastered' : 'review'; }
    else if (difficulty === 'easy') { nextIntervalDays = Math.min(60, interval + 14); status = 'mastered'; }
  }

  const nextReviewAt = nextIntervalDays === 0 ? now + 10 * 60 * 1000 : now + (nextIntervalDays * 24 * 60 * 60 * 1000);
  return { ...card, interval: nextIntervalDays, easeFactor, lapseCount, status, nextReviewAt, lastReviewedAt: now };
};

// ==========================================
// 3. COMPONENTS
// ==========================================
const ProgressRing = ({ percentage, colorClass }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <svg className="w-24 h-24 -rotate-90">
      <circle cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
      <circle cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={`${colorClass} transition-all duration-1000`} />
    </svg>
  );
};

const EmptyState = ({ message, icon: Icon, children }) => (
  <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
    <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-white/5 shadow-xl">
      <Icon className="w-10 h-10 text-slate-500" />
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{message}</h3>
    {children}
  </div>
);

const FlipCard = ({ isFlipped, front, back }) => {
  return (
    <div className="relative w-full h-[70vh] md:h-auto md:aspect-[4/5] [perspective:2000px]">
      <div className="relative h-full w-full transition-transform duration-700" style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>{front}</div>
        <div className="absolute inset-0" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>{back}</div>
      </div>
    </div>
  );
};

// ==========================================
// 4. APP SHELL
// ==========================================
const App = () => {
  const kanjiMap = useMemo(() => getKanjiMap(), []);

  const [activeTrack, setActiveTrack] = useState('bim');
  const [view, setView] = useState('home');
  const currentDatasetList = useMemo(
    () => sortKanjiList(ALL_KANJI_DATA.filter((item) => item.dataset === activeTrack)),
    [activeTrack]
  );
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [libFilter, setLibFilter] = useState('all');
  const [libSort, setLibSort] = useState('default');
  const [selectedKanjiId, setSelectedKanjiId] = useState(null);

  const [sessionConfig, setSessionConfig] = useState(DEFAULT_SESSION_CONFIG);
  const [studyQueue, setStudyQueue] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isBuildingSession, setIsBuildingSession] = useState(false);

  const [pageStudyVol, setPageStudyVol] = useState(1);
  const [pageStudyPg, setPageStudyPg] = useState(1);
  const [studyGroupNum, setStudyGroupNum] = useState(1);

  const [isSendingLogin, setIsSendingLogin] = useState(false);
  const [loginCooldownUntil, setLoginCooldownUntil] = useState(() => {
    const saved = localStorage.getItem(OTP_STORAGE_KEY);
    return saved ? Number(saved) : 0;
  });
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [progressReady, setProgressReady] = useState(false);

  const BIM_CONFIG = {
    titleMain: 'BIM 한자관',
    titleSub: '실무/도면 마스터',
    desc: '일본 제네콘/BIM 회사 취업을 위한 실무 어휘 특화 트랙입니다.',
    bgGlow: 'bg-violet-500/20',
    bgLight: 'bg-violet-500/5',
    bgSolid: 'bg-violet-500',
    borderLight: 'border-violet-500/20',
    textColor: 'text-violet-400',
    gradientText: 'from-violet-400 to-indigo-400',
    dropShadowHex: 'rgba(139,92,246,0.3)',
  };

  const BASIC_CONFIG = {
    titleMain: '일상 한자관',
    titleSub: 'JLPT & 독해 체력',
    desc: '일상 한자를 기반으로 일본어 회화 실력을 늘려봅시다.',
    bgGlow: 'bg-emerald-500/20',
    bgLight: 'bg-emerald-500/5',
    bgSolid: 'bg-emerald-500',
    borderLight: 'border-emerald-500/20',
    textColor: 'text-emerald-400',
    gradientText: 'from-emerald-400 to-teal-400',
    dropShadowHex: 'rgba(16,185,129,0.3)',
  };

  const trackConfig = activeTrack === 'bim' ? BIM_CONFIG : BASIC_CONFIG;

  const initCards = (track) => {
    const stored = readStoredJson(getLegacyStorageKeys(track, 'cards'), null);
    return migrateCardsState(stored, track);
  };

  const initHistory = (track) => {
    const stored = readStoredJson(getLegacyStorageKeys(track, 'history'), []);
    return sanitizeHistoryList(stored, track);
  };

  const initDaily = (track) => {
    const today = getTodayKey();
    const stored = readStoredJson(getLegacyStorageKeys(track, 'daily'), null);

    if (stored) {
      const sanitized = sanitizeDailyState(stored, track);
      if (sanitized.dateKey === today) return sanitized;

      const yesterdayKey = getYesterdayKey();
      const keepStreak =
        sanitized.lastStudyDate === today || sanitized.lastStudyDate === yesterdayKey
          ? sanitized.streak
          : 0;

      return sanitizeDailyState(
        {
          ...sanitized,
          dateKey: today,
          streak: keepStreak,
        },
        track,
        { resetTodayArrays: true }
      );
    }

    return createInitialDailyState(track);
  };

  const [bimCards, setBimCards] = useState(() => initCards('bim'));
  const [basicCards, setBasicCards] = useState(() => initCards('basic'));
  const [bimHistory, setBimHistory] = useState(() => initHistory('bim'));
  const [basicHistory, setBasicHistory] = useState(() => initHistory('basic'));
  const [bimDaily, setBimDaily] = useState(() => reconcileDailyWithCards(initDaily('bim'), initCards('bim')));
  const [basicDaily, setBasicDaily] = useState(() => reconcileDailyWithCards(initDaily('basic'), initCards('basic')));

  const activeCards = activeTrack === 'bim' ? bimCards : basicCards;
  const setActiveCards = activeTrack === 'bim' ? setBimCards : setBasicCards;
  const activeHistory = activeTrack === 'bim' ? bimHistory : basicHistory;
  const setActiveHistory = activeTrack === 'bim' ? setBimHistory : setBasicHistory;
  const activeDaily = activeTrack === 'bim' ? bimDaily : basicDaily;
  const setActiveDaily = activeTrack === 'bim' ? setBimDaily : setBasicDaily;

  const activeHistoryPressureMap = useMemo(() => {
    const pressure = {};

    [...bimHistory, ...basicHistory].forEach((entry) => {
      const id = entry.kanjiId;
      if (!id) return;

      if (entry.type === 'srs') {
        if (entry.difficulty === 'again') pressure[id] = (pressure[id] || 0) + 3;
        if (entry.difficulty === 'hard') pressure[id] = (pressure[id] || 0) + 2;
      }

      if (String(entry.type).startsWith('flash_') && entry.difficulty === 'again') {
        pressure[id] = (pressure[id] || 0) + 1;
      }
    });

    return pressure;
  }, [bimHistory, basicHistory]);

  const persistLocalBackup = useCallback((nextState) => {
    localStorage.setItem(getStorageKey('bim', 'cards'), JSON.stringify(nextState.bimCards));
    localStorage.setItem(getStorageKey('basic', 'cards'), JSON.stringify(nextState.basicCards));
    localStorage.setItem(getStorageKey('bim', 'history'), JSON.stringify(nextState.bimHistory));
    localStorage.setItem(getStorageKey('basic', 'history'), JSON.stringify(nextState.basicHistory));
    localStorage.setItem(getStorageKey('bim', 'daily'), JSON.stringify(nextState.bimDaily));
    localStorage.setItem(getStorageKey('basic', 'daily'), JSON.stringify(nextState.basicDaily));
  }, []);

  useEffect(() => {
    persistLocalBackup({
      bimCards,
      basicCards,
      bimHistory,
      basicHistory,
      bimDaily,
      basicDaily,
    });
  }, [persistLocalBackup, bimCards, basicCards, bimHistory, basicHistory, bimDaily, basicDaily]);

  const applyOtpCooldown = (ms) => {
    const until = Date.now() + ms;
    setLoginCooldownUntil(until);
    localStorage.setItem(OTP_STORAGE_KEY, String(until));
  };

  const handleEmailLogin = async () => {
    const now = Date.now();
    const email = authEmail.trim();

    if (isSendingLogin) return;

    if (loginCooldownUntil > now) {
      const remainSec = Math.ceil((loginCooldownUntil - now) / 1000);
      setAuthMessage(`로그인 링크는 잠시 후 다시 요청할 수 있어요. ${remainSec}초 후 다시 시도해주세요.`);
      return;
    }

    if (!email || !email.includes('@')) {
      setAuthMessage('올바른 이메일 주소를 입력해주세요.');
      return;
    }

    try {
      setIsSendingLogin(true);
      setAuthMessage('');

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        const lowerMsg = error.message?.toLowerCase() || '';
        console.error('로그인 링크 전송 실패:', error.message);

        if (
          lowerMsg.includes('rate limit') ||
          lowerMsg.includes('too many requests') ||
          lowerMsg.includes('email rate limit exceeded')
        ) {
          applyOtpCooldown(10 * 60 * 1000);
          setAuthMessage('이메일 전송 요청이 제한되었습니다. 10분 후 다시 시도해주세요.');
          return;
        }

        setAuthMessage(`로그인에 실패했습니다: ${error.message}`);
        return;
      }

      applyOtpCooldown(OTP_COOLDOWN_MS);
      setAuthMessage('로그인 링크를 이메일로 보냈습니다. 메일함을 확인해주세요.');
    } catch (error) {
      console.error('로그인 처리 중 오류:', error);
      setAuthMessage('로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSendingLogin(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error(error);
      setAuthMessage('로그아웃 중 오류가 발생했습니다.');
      return;
    }

    setAuthEmail('');
    setAuthMessage('로그아웃되었습니다.');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      if (!nextSession?.user?.id) setProgressReady(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const createFreshProgressPayload = useCallback(
    (userId) => {
      return {
        user_id: userId,
        active_track: 'bim',
        bim_cards: createFreshCards('bim'),
        basic_cards: createFreshCards('basic'),
        bim_history: [],
        basic_history: [],
        bim_daily: createInitialDailyState('bim'),
        basic_daily: createInitialDailyState('basic'),
      };
    },
    []
  );

  const applyProgressToState = useCallback((progress) => {
    if (!progress) return;

    const nextBimCards = migrateCardsState(progress.bim_cards, 'bim');
    const nextBasicCards = migrateCardsState(progress.basic_cards, 'basic');
const nextBimDaily = reconcileDailyWithCards(
  rolloverDailyState(progress.bim_daily, 'bim'),
  nextBimCards
);

const nextBasicDaily = reconcileDailyWithCards(
  rolloverDailyState(progress.basic_daily, 'basic'),
  nextBasicCards
);

    setActiveTrack(progress.active_track || 'bim');
    setBimCards(nextBimCards);
    setBasicCards(nextBasicCards);
    setBimHistory(sanitizeHistoryList(progress.bim_history, 'bim'));
    setBasicHistory(sanitizeHistoryList(progress.basic_history, 'basic'));
    setBimDaily(nextBimDaily);
    setBasicDaily(nextBasicDaily);
  }, [rolloverDailyState]);

  const loadUserProgress = useCallback(
    async (userId) => {
      setProgressReady(false);

      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('progress 불러오기 실패:', error);
        setProgressReady(true);
        return;
      }

      if (!data) {
        const freshPayload = createFreshProgressPayload(userId);
        const { error: insertError } = await supabase.from('user_progress').insert(freshPayload);
        if (insertError) {
          console.error('초기 progress 생성 실패:', insertError);
        } else {
          applyProgressToState(freshPayload);
        }
        setProgressReady(true);
        return;
      }

      applyProgressToState(data);
      setProgressReady(true);
    },
    [applyProgressToState, createFreshProgressPayload]
  );

  const saveProgressToSupabase = useCallback(async () => {
    if (!session?.user?.id || !progressReady) return;

    const payload = {
      user_id: session.user.id,
      active_track: activeTrack,
      bim_cards: bimCards,
      basic_cards: basicCards,
      bim_history: bimHistory,
      basic_history: basicHistory,
      bim_daily: bimDaily,
      basic_daily: basicDaily,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('user_progress').upsert(payload);
    if (error) console.error('progress 저장 실패:', error);
  }, [
    session,
    progressReady,
    activeTrack,
    bimCards,
    basicCards,
    bimHistory,
    basicHistory,
    bimDaily,
    basicDaily,
  ]);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadUserProgress(session.user.id);
  }, [session, loadUserProgress]);

  useEffect(() => {
    if (!session?.user?.id || !progressReady) return;

    const timer = setTimeout(() => {
      saveProgressToSupabase();
    }, 800);

    return () => clearTimeout(timer);
  }, [session, progressReady, saveProgressToSupabase]);
const rolloverDailyState = useCallback((daily, track) => {
  const today = getTodayKey();
  const sanitized = sanitizeDailyState(daily, track);

  if (sanitized.dateKey === today) return sanitized;

  const yesterdayKey = getYesterdayKey();
  const keepStreak =
    sanitized.lastStudyDate === today || sanitized.lastStudyDate === yesterdayKey
      ? sanitized.streak
      : 0;

  return sanitizeDailyState(
    {
      ...sanitized,
      dateKey: today,
      streak: keepStreak,
    },
    track,
    { resetTodayArrays: true }
  );
}, []);
  const markStudiedToday = (prev) => {
    const today = getTodayKey();
    if (prev.lastStudyDate === today) return prev;

    const yesterdayKey = getYesterdayKey();
    const nextStreak = prev.lastStudyDate === yesterdayKey ? (prev.streak || 0) + 1 : 1;

    return {
      ...prev,
      lastStudyDate: today,
      streak: nextStreak,
    };
  };

  const getRecommendedBasicGroupStart = useCallback(() => {
    const groups = unique(
      sortKanjiList(BASIC_KANJI_DATA)
        .map((item) => item.groupNum)
        .filter((num) => Number.isFinite(num))
    ).sort((a, b) => a - b);

    if (groups.length === 0) return 1;

    const studied = new Set((basicDaily.studiedGroups || []).map((num) => Number(num)));
    return groups.find((groupNum) => !studied.has(Number(groupNum))) || groups[0];
  }, [basicDaily.studiedGroups]);

  const getRecommendedBasicPageTarget = useCallback(() => {
    const pages = unique(
      sortKanjiList(BASIC_KANJI_DATA).map((item) => getBasicPageKey(item.sourceVolume, item.sourcePage))
    );

    if (pages.length === 0) return { vol: 1, page: 1 };

    const studied = new Set(basicDaily.studiedPages || []);
    const firstUnread = pages.find((key) => !studied.has(key)) || pages[0];
    const match = firstUnread.match(/^v(\d+)_p(\d+)$/);

    return match ? { vol: Number(match[1]), page: Number(match[2]) } : { vol: 1, page: 1 };
  }, [basicDaily.studiedPages]);

  const goTo = useCallback((track, targetView, options = {}) => {
    setActiveTrack(track);
    setActiveQuiz(null);
    setStudyQueue([]);
    setIsFlipped(false);
    setSearchTerm('');
    setSelectedKanjiId(null);
    setIsBuildingSession(targetView === 'study');
    setIsMobileMenuOpen(false);

    if (targetView === 'library') setLibFilter(track);

    if (targetView === 'group_study') {
      if (typeof options.groupNum === 'number') {
        setStudyGroupNum(options.groupNum);
      } else if (track === 'basic') {
        setStudyGroupNum(getRecommendedBasicGroupStart());
      } else {
        setStudyGroupNum(1);
      }
    }

    if (targetView === 'page') {
      if (typeof options.pageVol === 'number') setPageStudyVol(options.pageVol);
      if (typeof options.pagePg === 'number') setPageStudyPg(options.pagePg);
      if (track === 'basic' && options.autoRecommendPage) {
        const target = getRecommendedBasicPageTarget();
        setPageStudyVol(target.vol);
        setPageStudyPg(target.page);
      }
    }

    setView(targetView);
  }, [getRecommendedBasicGroupStart, getRecommendedBasicPageTarget]);

  const getAllBasicGroups = useCallback(() => {
  return unique(
    sortKanjiList(BASIC_KANJI_DATA)
      .map((item) => item.groupNum)
      .filter((num) => Number.isFinite(num))
  ).sort((a, b) => a - b);
}, []);

const getRelativeBasicGroup = useCallback((offset = 0) => {
  const groups = getAllBasicGroups();
  if (groups.length === 0) return 1;

  const current = getRecommendedBasicGroupStart();
  const currentIndex = groups.indexOf(current);
  if (currentIndex === -1) return current;

  const nextIndex = Math.max(0, Math.min(groups.length - 1, currentIndex + offset));
  return groups[nextIndex];
}, [getAllBasicGroups, getRecommendedBasicGroupStart]);

const startRegularStudy = useCallback(() => {
  if (activeTrack === 'bim') {
    setSessionConfig({ ...DEFAULT_SESSION_CONFIG, type: 'srs' });
    goTo('bim', 'study');
    return;
  }

  const targetGroup = getRecommendedBasicGroupStart();
  setStudyGroupNum(targetGroup);
  goTo('basic', 'group_study', { groupNum: targetGroup });
}, [activeTrack, goTo, getRecommendedBasicGroupStart]);

  const getGroupStudyChunk = useCallback((currentGroupNum) => {
    const currentGroupCards = currentDatasetList
      .filter((item) => item.groupNum === currentGroupNum)
      .sort(compareKanjiOrder);

    const nextGroupCards = currentDatasetList
      .filter((item) => item.groupNum === currentGroupNum + 1)
      .sort(compareKanjiOrder);

    if (currentGroupCards.length === 0) return [];

    if (currentGroupCards.length + nextGroupCards.length <= 7 && nextGroupCards.length > 0) {
      return [...currentGroupCards, ...nextGroupCards];
    }

    return currentGroupCards;
  }, [currentDatasetList]);

  const getWeaknessScore = useCallback((kanjiId, modeStat = 'meaning') => {
    const card = activeCards[kanjiId];
    if (!card) return 0;

    return (
      (card.lapseCount || 0) * 2 +
      (card.flashStats?.[modeStat]?.w || 0) * 3 +
      (activeHistoryPressureMap[kanjiId] || 0) +
      ((activeDaily.todayWrongIds || []).includes(kanjiId) ? 2 : 0) +
      (card.status === 'learning' ? 1 : 0)
    );
  }, [activeCards, activeHistoryPressureMap, activeDaily.todayWrongIds]);

const getQuizText = useCallback((kanjiData, mode) => {
  if (!kanjiData) return '';

  if (mode === 'meaning') return cleanText(kanjiData.mean);
  if (mode === 'onyomi') return displayReadings(kanjiData.on_readings);
  if (mode === 'kunyomi') return displayReadings(kanjiData.kun_readings);
  if (mode === 'reading') return getCombinedReadingText(kanjiData);

  return cleanText(kanjiData.mean);
}, []);

  // --- Session Queue Builder (SRS / Flash) ---
  const buildSessionQueue = useCallback(() => {
    const { type, source, mode } = sessionConfig;

    if (type === 'srs') {
          if (source === 'today') {
      const todayQueue = unique(
        (activeDaily.todaySeenIds || []).filter((id) => {
          const data = kanjiMap[id];
          return data && data.dataset === activeTrack && activeCards[id];
        })
      );

      setStudyQueue(todayQueue);
      setActiveQuiz(null);
      setIsBuildingSession(false);
      return;
    }
      const now = Date.now();
      const learningCards = [];
      const reviewCards = [];
      const newCardsPool = [];
      const introducedIds = activeDaily.introducedNewIds || [];

      Object.values(activeCards).forEach((card) => {
        const data = kanjiMap[card.kanjiId];
        if (!data || data.dataset !== activeTrack) return;

        if (card.status === 'learning') {
          learningCards.push(card.kanjiId);
          return;
        }

        if (card.nextReviewAt > 0 && card.nextReviewAt <= now) {
          reviewCards.push(card.kanjiId);
          return;
        }

        if (
          activeTrack === 'bim' &&
          card.status === 'new' &&
          !introducedIds.includes(card.kanjiId)
        ) {
          newCardsPool.push(card.kanjiId);
        }
      });

      const remainingDailyNew = introducedIds.filter(
        (id) => activeCards[id] && activeCards[id].status === 'new'
      );

      const freshNewToIntroduce =
        activeTrack === 'bim'
          ? newCardsPool.slice(0, Math.max(0, 5 - introducedIds.length))
          : [];

      const nextQueue = unique([
        ...learningCards,
        ...reviewCards,
        ...remainingDailyNew,
        ...freshNewToIntroduce,
      ]);

      setStudyQueue(nextQueue);
      setActiveQuiz(null);
      setIsBuildingSession(false);
      return;
    }

    if (type === 'flash_review') {
      const modeStat = mode === 'onyomi' ? 'on' : mode === 'kunyomi' ? 'kun' : 'meaning';
      const introducedIds = (activeDaily.introducedNewIds || []).filter((id) => activeCards[id]);
      const seenTodayIds = (activeDaily.todaySeenIds || []).filter((id) => activeCards[id]);
      const completedTodayIds = (activeDaily.srsCompletedIds || []).filter((id) => activeCards[id]);

const hasModeData = (id) => {
  const data = kanjiMap[id];
  if (!data || data.dataset !== activeTrack) return false;

  if (mode === 'onyomi') {
    return Array.isArray(data.on_readings) && data.on_readings.length > 0;
  }

  if (mode === 'kunyomi') {
    return Array.isArray(data.kun_readings) && data.kun_readings.length > 0;
  }

  if (mode === 'reading') {
    return (
      (Array.isArray(data.on_readings) && data.on_readings.length > 0) ||
      (Array.isArray(data.kun_readings) && data.kun_readings.length > 0)
    );
  }

  return Boolean(cleanText(data.mean) && cleanText(data.mean) !== '-');
};

const studiedByRecordIds =
  activeTrack === 'basic'
    ? unique([
        ...currentDatasetList
          .filter((item) =>
            (activeDaily.studiedGroups || []).includes(item.groupNum) ||
            (activeDaily.studiedPages || []).includes(
              getBasicPageKey(item.sourceVolume, item.sourcePage)
            )
          )
          .map((item) => item.id),
      ])
    : [];

const studiedIds = unique([
  ...Object.values(activeCards)
    .filter((card) => {
      const data = kanjiMap[card.kanjiId];
      if (!data || data.dataset !== activeTrack) return false;
      return (
        card.status !== 'new' ||
        introducedIds.includes(card.kanjiId) ||
        seenTodayIds.includes(card.kanjiId)
      );
    })
    .map((card) => card.kanjiId),
  ...introducedIds,
  ...seenTodayIds,
  ...completedTodayIds,
  ...studiedByRecordIds,
]).filter(hasModeData);

      let pool = [];

      if (source === 'today') {
        pool = unique([...seenTodayIds, ...completedTodayIds, ...introducedIds]).filter(hasModeData);
      } else if (source === 'weak') {
        const ranked = [...studiedIds].sort(
          (a, b) => getWeaknessScore(b, modeStat) - getWeaknessScore(a, modeStat)
        );
        const weakOnly = ranked.filter((id) => getWeaknessScore(id, modeStat) > 0);
        pool = weakOnly.length > 0 ? weakOnly : ranked;
      } else {
        const ranked = [...studiedIds].sort(
          (a, b) => getWeaknessScore(b, modeStat) - getWeaknessScore(a, modeStat)
        );
        pool = ranked;
      }

      if (pool.length > 0 && (source === 'weak' || mode === 'onyomi' || mode === 'kunyomi')) {
        pool = buildWeightedQueue(pool, (id) => 1 + getWeaknessScore(id, modeStat) / 2, 24);
      }

      if (source === 'today') {
        pool = unique(pool);
      }

      setStudyQueue(pool);
      setActiveQuiz(null);
      setIsBuildingSession(false);
    }
  }, [sessionConfig, activeCards, kanjiMap, activeTrack, activeDaily, getWeaknessScore]);

  useEffect(() => {
    if (view === 'study') buildSessionQueue();
  }, [view, buildSessionQueue]);

  // --- Flash Quiz Generator ---
  const generateQuiz = useCallback((targetId, mode) => {
    const target = kanjiMap[targetId];
    if (!target) return null;

    const correctText = getQuizText(target, mode);
    if (!correctText || correctText === '-') return null;

    const choices = [{ id: target.id, text: correctText, kanji: target.kanji }];
    const usedTexts = new Set([correctText]);

    let pool = currentDatasetList.filter((item) => item.id !== targetId);
if (mode === 'onyomi') {
  pool = pool.filter((item) => Array.isArray(item.on_readings) && item.on_readings.length > 0);
}
if (mode === 'kunyomi') {
  pool = pool.filter((item) => Array.isArray(item.kun_readings) && item.kun_readings.length > 0);
}
if (mode === 'reading') {
  pool = pool.filter(
    (item) =>
      (Array.isArray(item.on_readings) && item.on_readings.length > 0) ||
      (Array.isArray(item.kun_readings) && item.kun_readings.length > 0)
  );
}
if (mode === 'meaning') {
  pool = pool.filter((item) => cleanText(item.mean) && cleanText(item.mean) !== '-');
}

    const score = (item) => {
      const tagMatch =
        item.tags && target.tags && item.tags.some((tag) => target.tags.includes(tag)) ? 2 : 0;
      const levelMatch = item.level === target.level ? 1 : 0;
      const weaknessBias =
  getWeaknessScore(
    item.id,
    mode === 'meaning'
      ? 'meaning'
      : mode === 'onyomi'
      ? 'on'
      : mode === 'kunyomi'
      ? 'kun'
      : 'on'
  ) * 0.05;
      return tagMatch + levelMatch + weaknessBias + Math.random() * 0.01;
    };

    pool.sort((a, b) => score(b) - score(a));

    for (const item of pool) {
      const text = getQuizText(item, mode);
      if (!text || text === '-' || usedTexts.has(text)) continue;
      choices.push({ id: item.id, text, kanji: item.kanji });
      usedTexts.add(text);
      if (choices.length === 4) break;
    }

    if (choices.length < 4) return null;

    const shuffledChoices = shuffle(choices);

    return {
      kanjiId: targetId,
      mode,
      prompt: target.kanji,
      choices: shuffledChoices,
      correctChoiceIndex: shuffledChoices.findIndex((choice) => choice.id === targetId),
      selectedChoiceIndex: null,
      isAnswered: false,
      isCorrect: null,
    };
  }, [kanjiMap, currentDatasetList, getQuizText, getWeaknessScore]);

  useEffect(() => {
    if (sessionConfig.type === 'flash_review' && studyQueue.length > 0 && !activeQuiz) {
      const quiz = generateQuiz(studyQueue[0], sessionConfig.mode);
      if (!quiz) setStudyQueue((prev) => prev.slice(1));
      else setActiveQuiz(quiz);
    }
  }, [sessionConfig, studyQueue, activeQuiz, generateQuiz]);

  // --- Action Handlers ---
  const handleSrsNext = (difficulty) => {
    const currentCardId = studyQueue[0];
    if (!currentCardId) return;

    setActiveDaily((prev) => {
      let nextDaily = markStudiedToday(prev);

      if (
        activeCards[currentCardId]?.status === 'new' &&
        !nextDaily.introducedNewIds.includes(currentCardId)
      ) {
        nextDaily = {
          ...nextDaily,
          introducedNewIds: [...nextDaily.introducedNewIds, currentCardId],
        };
      }

      if (!nextDaily.todaySeenIds.includes(currentCardId)) {
        nextDaily = {
          ...nextDaily,
          todaySeenIds: [...nextDaily.todaySeenIds, currentCardId],
        };
      }

      if (difficulty === 'again' && !nextDaily.todayWrongIds.includes(currentCardId)) {
        nextDaily = {
          ...nextDaily,
          todayWrongIds: [...nextDaily.todayWrongIds, currentCardId],
        };
      }

      if (difficulty !== 'again') {
        nextDaily = {
          ...nextDaily,
          reviewsCompleted: Number(nextDaily.reviewsCompleted || 0) + 1,
          srsCompletedIds: nextDaily.srsCompletedIds.includes(currentCardId)
            ? nextDaily.srsCompletedIds
            : [...nextDaily.srsCompletedIds, currentCardId],
        };
      }

      return nextDaily;
    });

    setActiveCards((prev) => ({
      ...prev,
      [currentCardId]: calculateReviewSchedule(prev[currentCardId], difficulty),
    }));

    setActiveHistory((prev) => [
      ...prev,
      { kanjiId: currentCardId, difficulty, timestamp: Date.now(), type: 'srs' },
    ]);

    setIsFlipped(false);

    setStudyQueue((prev) => {
      const nextQueue = [...prev.slice(1)];
      if (difficulty === 'again') nextQueue.push(currentCardId);
      return nextQueue;
    });
  };

  const handleFlashAnswer = (choiceIndex) => {
    if (!activeQuiz || activeQuiz.isAnswered) return;

    const isCorrect = choiceIndex === activeQuiz.correctChoiceIndex;
    setActiveQuiz((prev) => ({
      ...prev,
      selectedChoiceIndex: choiceIndex,
      isAnswered: true,
      isCorrect,
    }));

    const targetId = activeQuiz.kanjiId;
    const modeStat = activeQuiz.mode === 'onyomi' ? 'on' : activeQuiz.mode === 'kunyomi' ? 'kun' : 'meaning';

    setActiveCards((prev) => {
      const card = prev[targetId];
      if (!card) return prev;

      const nextStats = {
        ...card.flashStats,
        [modeStat]: { ...card.flashStats[modeStat] },
      };

      if (isCorrect) nextStats[modeStat].c += 1;
      else nextStats[modeStat].w += 1;

      return {
        ...prev,
        [targetId]: {
          ...card,
          flashStats: nextStats,
        },
      };
    });

    setActiveHistory((prev) => [
      ...prev,
      {
        kanjiId: targetId,
        difficulty: isCorrect ? 'good' : 'again',
        timestamp: Date.now(),
        type: `flash_${modeStat}`,
      },
    ]);
  };

  const handleNextQuiz = () => {
    setStudyQueue((prev) => prev.slice(1));
    setActiveQuiz(null);
  };

  const handleResetTodayTrackSession = () => {
    const ok = window.confirm(`${activeTrack === 'bim' ? 'BIM' : '일상 한자'} 오늘 세션만 초기화할까요?`);
    if (!ok) return;

    const todayKey = getTodayKey();
    const idsToReset = new Set([
      ...(activeDaily.introducedNewIds || []),
      ...(activeDaily.todaySeenIds || []),
      ...(activeDaily.srsCompletedIds || []),
    ]);

    const resetCardMap = (prev) => {
      const fresh = createFreshCards(activeTrack);
      const next = { ...prev };

      idsToReset.forEach((id) => {
        const card = prev[id];
        if (!card) return;

        const reviewedToday = getDateKeyFromTimestamp(card.lastReviewedAt) === todayKey;
        if (reviewedToday || card.status === 'new' || card.status === 'learning') {
          next[id] = {
            ...fresh[id],
            kanjiId: id,
          };
        }
      });

      return next;
    };

    if (activeTrack === 'bim') {
      setBimCards((prev) => resetCardMap(prev));
      setBimDaily((prev) => ({
        ...prev,
        dateKey: todayKey,
        introducedNewIds: [],
        todaySeenIds: [],
        todayWrongIds: [],
        srsCompletedIds: [],
        reviewsCompleted: 0,
      }));
    } else {
      setBasicCards((prev) => resetCardMap(prev));
      setBasicDaily((prev) => ({
        ...prev,
        dateKey: todayKey,
        introducedNewIds: [],
        todaySeenIds: [],
        todayWrongIds: [],
        srsCompletedIds: [],
        reviewsCompleted: 0,
      }));
    }

    setStudyQueue([]);
    setActiveQuiz(null);
    setIsFlipped(false);
    setSessionConfig(DEFAULT_SESSION_CONFIG);
    setView('home');
  };

  const handleClearData = async () => {
    const ok = window.confirm('모든 학습 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.');
    if (!ok) return;

    const freshBimCards = createFreshCards('bim');
    const freshBasicCards = createFreshCards('basic');
    const freshBimDaily = createInitialDailyState('bim');
    const freshBasicDaily = createInitialDailyState('basic');

    setActiveTrack('bim');
    setView('home');
    setSessionConfig(DEFAULT_SESSION_CONFIG);
    setStudyQueue([]);
    setActiveQuiz(null);
    setIsFlipped(false);
    setSearchTerm('');
    setSelectedKanjiId(null);

    setBimCards(freshBimCards);
    setBasicCards(freshBasicCards);
    setBimHistory([]);
    setBasicHistory([]);
    setBimDaily(freshBimDaily);
    setBasicDaily(freshBasicDaily);
    setPageStudyVol(1);
    setPageStudyPg(1);
    setStudyGroupNum(1);

    getLegacyStorageKeys('bim', 'cards').forEach((key) => localStorage.removeItem(key));
    getLegacyStorageKeys('basic', 'cards').forEach((key) => localStorage.removeItem(key));
    getLegacyStorageKeys('bim', 'history').forEach((key) => localStorage.removeItem(key));
    getLegacyStorageKeys('basic', 'history').forEach((key) => localStorage.removeItem(key));
    getLegacyStorageKeys('bim', 'daily').forEach((key) => localStorage.removeItem(key));
    getLegacyStorageKeys('basic', 'daily').forEach((key) => localStorage.removeItem(key));

    if (session?.user?.id) {
      const payload = {
        user_id: session.user.id,
        active_track: 'bim',
        bim_cards: freshBimCards,
        basic_cards: freshBasicCards,
        bim_history: [],
        basic_history: [],
        bim_daily: freshBimDaily,
        basic_daily: freshBasicDaily,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('user_progress').upsert(payload);
      if (error) console.error('progress 초기화 저장 실패:', error);
    }
  };

  // --- Computed Stats ---
  const stats = useMemo(() => {
    let total = 0, newCount = 0, learningCount = 0, reviewCount = 0, masteredCount = 0;
    const tagProgress = {};
    const flashTotals = { meaning: { c: 0, w: 0 }, on: { c: 0, w: 0 }, kun: { c: 0, w: 0 } };

    Object.values(activeCards).forEach((c) => {
      const kData = kanjiMap[c.kanjiId];
      if (!kData || kData.dataset !== activeTrack) return;

      total += 1;
      if (c.status === 'new') newCount += 1;
      else if (c.status === 'learning') learningCount += 1;
      else if (c.status === 'review') reviewCount += 1;
      else if (c.status === 'mastered') masteredCount += 1;

      kData.tags?.forEach((tag) => {
        if (!tagProgress[tag]) tagProgress[tag] = { total: 0, mastered: 0 };
        tagProgress[tag].total += 1;
        if (c.status === 'mastered') tagProgress[tag].mastered += 1;
      });

      flashTotals.meaning.c += c.flashStats.meaning.c; flashTotals.meaning.w += c.flashStats.meaning.w;
      flashTotals.on.c += c.flashStats.on.c; flashTotals.on.w += c.flashStats.on.w;
      flashTotals.kun.c += c.flashStats.kun.c; flashTotals.kun.w += c.flashStats.kun.w;
    });

    const srsHist = activeHistory.filter((h) => h.type === 'srs');
    const srsAccuracy = srsHist.length > 0 ? Math.round((srsHist.filter((h) => h.difficulty === 'good' || h.difficulty === 'easy').length / srsHist.length) * 100) : 0;
    const flashAcc = {
      meaning: flashTotals.meaning.c + flashTotals.meaning.w > 0 ? Math.round((flashTotals.meaning.c / (flashTotals.meaning.c + flashTotals.meaning.w)) * 100) : 0,
      on: flashTotals.on.c + flashTotals.on.w > 0 ? Math.round((flashTotals.on.c / (flashTotals.on.c + flashTotals.on.w)) * 100) : 0,
      kun: flashTotals.kun.c + flashTotals.kun.w > 0 ? Math.round((flashTotals.kun.c / (flashTotals.kun.c + flashTotals.kun.w)) * 100) : 0,
    };

    const weakSrs = Object.values(activeCards).filter((c) => kanjiMap[c.kanjiId]?.dataset === activeTrack && c.lapseCount > 0).sort((a, b) => b.lapseCount - a.lapseCount).slice(0, 5).map((c) => ({ kanji: kanjiMap[c.kanjiId].kanji, lapses: c.lapseCount }));
    const weakMean = Object.values(activeCards).filter((c) => kanjiMap[c.kanjiId]?.dataset === activeTrack && c.flashStats.meaning.w > 0).sort((a, b) => b.flashStats.meaning.w - a.flashStats.meaning.w).slice(0, 3).map((c) => ({ kanji: kanjiMap[c.kanjiId].kanji, lapses: c.flashStats.meaning.w }));
    const weakOn = Object.values(activeCards).filter((c) => kanjiMap[c.kanjiId]?.dataset === activeTrack && c.flashStats.on.w > 0).sort((a, b) => b.flashStats.on.w - a.flashStats.on.w).slice(0, 3).map((c) => ({ kanji: kanjiMap[c.kanjiId].kanji, lapses: c.flashStats.on.w }));
    const weakKun = Object.values(activeCards).filter((c) => kanjiMap[c.kanjiId]?.dataset === activeTrack && c.flashStats.kun.w > 0).sort((a, b) => b.flashStats.kun.w - a.flashStats.kun.w).slice(0, 3).map((c) => ({ kanji: kanjiMap[c.kanjiId].kanji, lapses: c.flashStats.kun.w }));

    const srsDiffStats = activeHistory.reduce((acc, h) => {
      if (h.type === 'srs') acc[h.difficulty] += 1;
      return acc;
    }, { again: 0, hard: 0, good: 0, easy: 0 });

    const todayDue = Object.values(activeCards).filter((c) => {
      const kData = kanjiMap[c.kanjiId];
      if (!kData || kData.dataset !== activeTrack) return false;
      const isIntroducedNew = c.status === 'new' && activeDaily.introducedNewIds.includes(c.kanjiId);
      return isIntroducedNew || c.status === 'learning' || (c.nextReviewAt > 0 && c.nextReviewAt <= Date.now());
    }).length;

    // 오늘 할당량(남은 신규 카드 수) 계산
    let newCardsPool = [];
    Object.values(activeCards).forEach((card) => {
      const kData = kanjiMap[card.kanjiId];
      if (!kData || kData.dataset !== activeTrack) return;
      if (card.status === 'new' && !activeDaily.introducedNewIds.includes(card.kanjiId)) {
        newCardsPool.push(card.kanjiId);
      }
    });

    let newAvailable = 0;
    if (activeTrack === 'bim') {
      newAvailable = Math.min(newCardsPool.length, Math.max(0, 5 - activeDaily.introducedNewIds.length));
    } else {
      if (activeDaily.introducedNewIds.length === 0 && newCardsPool.length > 0) {
        newCardsPool.sort((a, b) => (kanjiMap[a].groupNum || 0) - (kanjiMap[b].groupNum || 0));
        const firstCard = kanjiMap[newCardsPool[0]];
        const currentGroup = firstCard.groupNum;
        const currentGroupCards = newCardsPool.filter(id => kanjiMap[id].groupNum === currentGroup);
        const nextGroupCards = newCardsPool.filter(id => kanjiMap[id].groupNum === currentGroup + 1);
        newAvailable = (currentGroupCards.length + nextGroupCards.length <= 7 && nextGroupCards.length > 0) ? currentGroupCards.length + nextGroupCards.length : currentGroupCards.length;
      }
    }

    const totalGroups = [...new Set(currentDatasetList.map(k => k.groupNum))].length;
    const studiedGroups = activeDaily.studiedGroups?.length || 0;
    const totalPages = [...new Set(currentDatasetList.map(k => `${k.sourceVolume}_${k.sourcePage}`))].length;
    const studiedPages = activeDaily.studiedPages?.length || 0;

    return { total, newCount, learningCount, reviewCount, masteredCount, srsAccuracy, flashAcc, progressPercent: total > 0 ? Math.round((masteredCount / total) * 100) : 0, todayDue, newAvailable, tagProgress, weakSrs, weakMean, weakOn, weakKun, srsDiffStats, totalGroups, studiedGroups, totalPages, studiedPages };
  }, [activeCards, activeHistory, activeDaily, kanjiMap, activeTrack, currentDatasetList]);

  const libraryList = useMemo(() => {
    let baseList = sortKanjiList([...ALL_KANJI_DATA]);

    if (libFilter !== 'all') {
      baseList = baseList.filter((item) => item.dataset === libFilter);
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      baseList = baseList.filter((item) => {
        if (String(item.kanji).toLowerCase().includes(lower)) return true;
        if (cleanText(item.mean).toLowerCase().includes(lower)) return true;
        if (
          item.bimTerm &&
          [item.bimTerm.word, item.bimTerm.reading, item.bimTerm.meaning].some((field) =>
            cleanText(field).toLowerCase().includes(lower)
          )
        ) {
          return true;
        }
        if (
          item.onExamples?.some((ex) =>
            [ex.word, ex.reading, ex.meaning].some((field) => cleanText(field).toLowerCase().includes(lower))
          )
        ) {
          return true;
        }
        if (
          item.kunExamples?.some((ex) =>
            [ex.word, ex.reading, ex.meaning].some((field) => cleanText(field).toLowerCase().includes(lower))
          )
        ) {
          return true;
        }
        if (item.tags?.some((tag) => cleanText(tag).toLowerCase().includes(lower))) return true;
        return false;
      });
    }

    const getCardForItem = (item) => (item.dataset === 'bim' ? bimCards[item.id] : basicCards[item.id]);

    if (libSort === 'mastered') {
      baseList = [...baseList].sort((a, b) => {
        const statusA = getCardForItem(a)?.status;
        const statusB = getCardForItem(b)?.status;
        if (statusA === 'mastered' && statusB !== 'mastered') return -1;
        if (statusA !== 'mastered' && statusB === 'mastered') return 1;
        return compareKanjiOrder(a, b);
      });
    } else if (libSort === 'weak') {
      baseList = [...baseList].sort((a, b) => {
        const cardA = getCardForItem(a);
        const cardB = getCardForItem(b);
        const weaknessA = (cardA?.lapseCount || 0) + (cardA?.flashStats?.meaning?.w || 0) + (cardA?.flashStats?.on?.w || 0);
        const weaknessB = (cardB?.lapseCount || 0) + (cardB?.flashStats?.meaning?.w || 0) + (cardB?.flashStats?.on?.w || 0);
        return weaknessB - weaknessA || compareKanjiOrder(a, b);
      });
    }

    return baseList;
  }, [searchTerm, libFilter, libSort, bimCards, basicCards]);

  // ==========================================
  // VIEW RENDERS (MODALS & CARDS)
  // ==========================================
  // ==========================================
  // VIEW RENDERS (MODALS & CARDS)
  // ==========================================

  const renderKanjiDetailModal = () => {
    if (!selectedKanjiId) return null;
    const data = kanjiMap[selectedKanjiId];
    if (!data) return null;

    const isBimMode = data.dataset === 'bim';
    const accentText = isBimMode ? 'text-violet-400' : 'text-emerald-400';
    const accentBgLight = isBimMode ? 'bg-violet-500/5' : 'bg-emerald-500/5';
    const accentBorder = isBimMode ? 'border-violet-500/20' : 'border-emerald-500/20';

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] p-8 shadow-2xl relative custom-scrollbar">
          <button
            onClick={() => setSelectedKanjiId(null)}
            className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {data.dataset === 'basic' && (
            <div className={`absolute top-6 left-8 px-3 py-1 rounded-full ${accentBgLight} border ${accentBorder} text-xs font-bold ${accentText}`}>
              G{formatGroupLabel(data.groupNum)} · v{data.sourceVolume} p{data.sourcePage}
            </div>
          )}

          <div className={`flex items-center gap-8 mb-8 ${data.dataset === 'basic' ? 'mt-10' : ''}`}>
            <div className="w-32 h-32 bg-slate-950 border border-white/5 rounded-3xl flex items-center justify-center text-7xl font-bold text-white shadow-inner shrink-0">
              {data.kanji}
            </div>
            <div>
              <h2 className="text-3xl font-black text-white mb-2">{data.mean}</h2>
              <div className="flex gap-4 text-sm font-bold flex-wrap">
<span className={accentText}>음: {getReadingDisplay(data, 'on')}</span>
<span className="text-indigo-400">훈: {getReadingDisplay(data, 'kun')}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {data.dataset === 'bim' && data.bimTerm && (
              <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-6">
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4">대표 BIM 용어</h4>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={`text-2xl font-black ${accentText}`}>{data.bimTerm.word}</span>
                  <span className="text-sm font-bold text-slate-400">[{data.bimTerm.reading || '-'}]</span>
                  <span className="text-sm text-slate-300 ml-2">- {data.bimTerm.meaning || '-'}</span>
                </div>
              </div>
            )}

            {data.dataset === 'basic' && (
              <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-6 flex justify-between items-center">
                <div>
                  <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">JLPT 레벨</h4>
                  <span className={`text-2xl font-black ${accentText}`}>{data.level || '-'}</span>
                </div>
                <div className="text-right">
                  <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">분류 태그</h4>
                  <span className="text-sm text-slate-300">{data.tags?.join(', ') || '-'}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-5">
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">음독 관련 단어</h4>
                {data.onExamples?.length > 0 ? (
                  <ul className="space-y-2">
                    {data.onExamples.map((ex, idx) => (
                      <li key={`${ex.word}-${idx}`} className="flex flex-col sm:flex-row sm:justify-between text-sm gap-1">
                        <span className="text-white font-bold">
                          {ex.word} <span className="text-slate-500 font-normal text-xs ml-1">[{ex.reading || '-'}]</span>
                        </span>
                        <span className="text-slate-400 text-xs sm:text-right">{ex.meaning || '-'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-600">-</p>
                )}
              </div>

              <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-5">
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">훈독 관련 단어</h4>
                {data.kunExamples?.length > 0 ? (
                  <ul className="space-y-2">
                    {data.kunExamples.map((ex, idx) => (
                      <li key={`${ex.word}-${idx}`} className="flex flex-col sm:flex-row sm:justify-between text-sm gap-1">
                        <span className="text-white font-bold">
                          {ex.word} <span className="text-slate-500 font-normal text-xs ml-1">[{ex.reading || '-'}]</span>
                        </span>
                        <span className="text-slate-400 text-xs sm:text-right">{ex.meaning || '-'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-600">-</p>
                )}
              </div>
            </div>

            <div className={`${accentBgLight} border ${accentBorder} rounded-2xl p-6 relative overflow-hidden`}>
              <Zap className={`absolute top-4 right-4 w-12 h-12 opacity-10 ${accentText}`} />
              <h4 className={`text-[10px] ${accentText} font-black uppercase tracking-widest mb-3`}>암기 비법</h4>
              <p className="text-slate-200 leading-relaxed font-medium break-keep">{data.story || '-'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // VIEW RENDERS (MAIN)
  // ==========================================
  // ==========================================
  // VIEW RENDERS (MAIN)
  // ==========================================
  const renderHome = () => (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section className="relative p-12 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 overflow-hidden">
        <div className="relative z-10 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${trackConfig.bgLight} border ${trackConfig.borderLight} ${trackConfig.textColor} text-xs font-bold tracking-wider`}>
              <Star className="w-3 h-3" /> WELCOME BACK, CHIEF
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 max-w-xl">
              {session ? (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">로그인됨</p>
                    <p className="text-white font-bold">{session.user.email}</p>
                    {!progressReady && <p className="text-xs text-amber-400 mt-1">학습 데이터를 불러오는 중...</p>}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
                  >
                    로그아웃
                  </button>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-3 md:items-center">
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="이메일 입력"
                    autoComplete="email"
                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                  />
                  <button
                    onClick={handleEmailLogin}
                    disabled={isSendingLogin || loginCooldownUntil > Date.now()}
                    className={`px-4 py-2 rounded-xl font-bold transition-all ${
                      isSendingLogin || loginCooldownUntil > Date.now()
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isSendingLogin ? '전송 중...' : '로그인 링크 보내기'}
                  </button>
                </div>
              )}

              {authMessage && <p className="mt-3 text-sm text-slate-400">{authMessage}</p>}
            </div>

            <h2 className="text-5xl font-extrabold leading-tight text-white">
              {trackConfig.titleMain} <br />
              <span className={`text-transparent bg-clip-text bg-gradient-to-r ${trackConfig.gradientText}`}>
                {trackConfig.titleSub}
              </span>
            </h2>

            <p className="text-slate-400 text-lg leading-relaxed max-w-md">{trackConfig.desc}</p>

            <div className="flex gap-4 flex-wrap">
              <button
                onClick={startRegularStudy}
                className="px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all active:scale-95 shadow-xl"
              >
                정규 학습 시작 <ArrowRight className="w-5 h-5" />
              </button>

              {activeTrack === 'basic' && (
                <button
                  onClick={() => goTo('basic', 'group_study', { groupNum: getRecommendedBasicGroupStart() })}
                  className={`px-8 py-4 ${trackConfig.bgSolid} text-white rounded-2xl font-bold flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-emerald-500/20`}
                >
                  스토리 암기장 <Layers className="w-5 h-5" />
                </button>
              )}
{activeTrack === 'basic' && (
  <>
    <button
      onClick={() => goTo('basic', 'group_study', { groupNum: getRelativeBasicGroup(-1) })}
      className="px-6 py-4 bg-slate-900 border border-white/10 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
    >
      저번 학습으로 가기
    </button>

    <button
      onClick={() => goTo('basic', 'group_study', { groupNum: getRelativeBasicGroup(1) })}
      className="px-6 py-4 bg-slate-900 border border-white/10 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
    >
      다음 학습으로 가기
    </button>
  </>
)}
              <button
                onClick={() => goTo(activeTrack, 'library')}
                className="px-8 py-4 bg-slate-900 border border-white/10 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
              >
                사전 보기
              </button>

              <button
                onClick={handleResetTodayTrackSession}
                className="px-6 py-4 bg-slate-900 border border-white/10 text-slate-300 rounded-2xl font-bold hover:bg-slate-800 transition-all"
              >
                오늘 세션 초기화
              </button>
            </div>
          </div>

          <div className="hidden md:flex justify-end">
            <div className="relative">
              <div className={`absolute inset-0 ${trackConfig.bgGlow} blur-[60px]`} />
              <div className="relative w-72 h-72 bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-[3rem] p-8 flex flex-col items-center justify-center gap-4 shadow-2xl">
                <ProgressRing percentage={stats.progressPercent} colorClass={trackConfig.textColor} />
                <div className="text-center mt-2">
                  <p className="text-3xl font-black text-white">{stats.progressPercent}%</p>
                  <p className="text-slate-500 text-sm">Overall Progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="p-8 rounded-3xl bg-slate-900/40 border border-white/5">
          <Clock className="w-8 h-8 text-blue-400 mb-6" />
          <h3 className="text-slate-500 text-sm font-bold uppercase tracking-widest">오늘 남은 할당</h3>
          <p className="text-4xl font-black text-white mt-2 mb-1">{stats.newAvailable + stats.todayDue}</p>
          <p className="text-slate-500 text-xs">신규 {stats.newAvailable} / 복습 {stats.todayDue} / 완료 {activeDaily.reviewsCompleted}</p>
        </div>
        <div className="p-8 rounded-3xl bg-slate-900/40 border border-white/5">
          <BookOpen className={`w-8 h-8 ${trackConfig.textColor} mb-6`} />
          <h3 className="text-slate-500 text-sm font-bold uppercase tracking-widest">마스터/학습중</h3>
          <p className="text-4xl font-black text-white mt-2 mb-1">{stats.masteredCount}</p>
          <p className="text-slate-500 text-xs">전체 {stats.total}자 중</p>
        </div>
        <div className="p-8 rounded-3xl bg-slate-900/40 border border-white/5">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-6" />
          <h3 className="text-slate-500 text-sm font-bold uppercase tracking-widest">정확도 (Ease)</h3>
          <p className="text-4xl font-black text-white mt-2 mb-1">{stats.srsAccuracy}%</p>
          <p className="text-slate-500 text-xs">정규 학습 기준</p>
        </div>
      </div>
    </div>
  );

  const renderBasicStoryCard = (data, { showExamples = true } = {}) => (
    <div key={data.id} className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start shadow-lg">
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 border border-white/10 rounded-2xl flex items-center justify-center text-7xl font-bold text-white bg-slate-950 shadow-inner shrink-0">
          <span>{data.kanji}</span>
        </div>
        <div className="mt-4 bg-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
          {data.mean}
        </div>
      </div>

      <div className="flex-1 w-full space-y-4">
        <div className="bg-slate-950 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-4 text-base font-bold flex-wrap">
<span className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg">
  음: {getReadingBadgeText(data, 'on')}
</span>
<span className="text-teal-400 bg-teal-500/10 px-3 py-1 rounded-lg">
  훈: {getReadingBadgeText(data, 'kun')}
</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-white/5 p-5 rounded-xl relative overflow-hidden group">
          <BookText className="absolute top-4 right-4 w-12 h-12 opacity-5 text-emerald-500" />
          <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">암기 비법</h4>
          <p className="text-sm leading-relaxed text-slate-300 break-keep">{data.story || '-'}</p>
        </div>

        {showExamples && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-950 border border-white/5 p-4 rounded-xl">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 inline-block w-full">주요 단어 (음독)</span>
              <ul className="space-y-1">
                {data.onExamples?.length > 0 ? (
                  data.onExamples.map((ex, idx) => (
                    <li key={`${data.id}-on-${idx}`} className="flex justify-between gap-3 border-b border-white/5 pb-1">
                      <span className="font-bold text-slate-200">
                        {ex.word} <span className="text-slate-600 font-normal text-[10px]">[{ex.reading || '-'}]</span>
                      </span>
                      <span className="text-slate-400 text-right">{ex.meaning || '-'}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-600">-</li>
                )}
              </ul>
            </div>
            <div className="bg-slate-950 border border-white/5 p-4 rounded-xl">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 inline-block w-full">주요 단어 (훈독)</span>
              <ul className="space-y-1">
                {data.kunExamples?.length > 0 ? (
                  data.kunExamples.map((ex, idx) => (
                    <li key={`${data.id}-kun-${idx}`} className="flex justify-between gap-3 border-b border-white/5 pb-1">
                      <span className="font-bold text-slate-200">
                        {ex.word} <span className="text-slate-600 font-normal text-[10px]">[{ex.reading || '-'}]</span>
                      </span>
                      <span className="text-slate-400 text-right">{ex.meaning || '-'}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-600">-</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );

const renderBasicPageStudy = () => {
  const pageMap = {};
  currentDatasetList.forEach((k) => {
    if (k.dataset !== 'basic') return;
    if (!pageMap[k.sourceVolume]) pageMap[k.sourceVolume] = new Set();
    pageMap[k.sourceVolume].add(k.sourcePage);
  });

  const volumes = Object.keys(pageMap).sort((a, b) => Number(a) - Number(b));
  if (volumes.length === 0) {
    return <EmptyState message="페이지 데이터가 없습니다." icon={FileText} />;
  }

  const safeVol = pageMap[pageStudyVol] ? pageStudyVol : Number(volumes[0]);
  const pages = Array.from(pageMap[safeVol] || []).sort((a, b) => a - b);
  const safePg = pages.includes(pageStudyPg) ? pageStudyPg : pages[0];

  const pageKanji = currentDatasetList
    .filter((k) => k.dataset === 'basic' && k.sourceVolume === safeVol && k.sourcePage === safePg)
    .sort((a, b) => a.pageOrder - b.pageOrder);

  const pageMeta = BASIC_PAGE_META.find(
    (m) => Number(m.sourceVolume) === Number(safeVol) && Number(m.sourcePage) === Number(safePg)
  );

  const currentVolIndex = volumes.indexOf(String(safeVol));

  const nextPageInSameVol = pages.find((p) => p > safePg);
  const nextVol = currentVolIndex >= 0 ? Number(volumes[currentVolIndex + 1]) : null;
  const nextTarget = nextPageInSameVol
    ? { vol: safeVol, page: nextPageInSameVol }
    : nextVol
      ? { vol: nextVol, page: Math.min(...Array.from(pageMap[nextVol])) }
      : null;

  const prevPageInSameVol = [...pages].reverse().find((p) => p < safePg);
  const prevVol = currentVolIndex > 0 ? Number(volumes[currentVolIndex - 1]) : null;
  const prevTarget = prevPageInSameVol
    ? { vol: safeVol, page: prevPageInSameVol }
    : prevVol
      ? { vol: prevVol, page: Math.max(...Array.from(pageMap[prevVol])) }
      : null;

  const pageKey = getBasicPageKey(safeVol, safePg);
  const isStudied = activeDaily.studiedPages?.includes(pageKey);

  const handleTogglePageStudied = () => {
    setBasicDaily((prev) => {
      const nextState = markStudiedToday(prev);
      const current = new Set(nextState.studiedPages || []);

      if (current.has(pageKey)) {
        current.delete(pageKey);
      } else {
        current.add(pageKey);
      }

      return {
        ...nextState,
        studiedPages: [...current],
      };
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            한자_부분 {safeVol}권
            <span className="text-emerald-400">|</span>
            <span className="text-slate-300">Page {safePg}</span>
          </h2>
          {pageMeta && <p className="text-emerald-400 font-bold mt-2 text-lg">"{pageMeta.title}"</p>}
          {pageMeta?.kanjiList?.length > 0 && (
            <p className="text-slate-500 text-sm mt-1">{pageMeta.kanjiList.join(', ')}</p>
          )}
        </div>

        <div className="flex gap-4">
          <select
            value={safeVol}
            onChange={(e) => {
              const nextVolKey = Number(e.target.value);
              setPageStudyVol(nextVolKey);
              setPageStudyPg(Math.min(...Array.from(pageMap[nextVolKey])));
            }}
            className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-white outline-none cursor-pointer"
          >
            {volumes.map((volume) => (
              <option key={volume} value={volume}>
                Volume {volume}
              </option>
            ))}
          </select>

          <select
            value={safePg}
            onChange={(e) => setPageStudyPg(Number(e.target.value))}
            className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-white outline-none cursor-pointer"
          >
            {pages.map((page) => (
              <option key={page} value={page}>
                Page {page}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {pageKanji.map((data) => renderBasicStoryCard(data))}
      </div>

<div className="mt-10 flex flex-wrap justify-center gap-4">
  {prevTarget && (
    <button
      onClick={() => {
        setPageStudyVol(prevTarget.vol);
        setPageStudyPg(prevTarget.page);
        window.scrollTo(0, 0);
      }}
      className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/10 text-white font-bold hover:bg-slate-800 transition"
    >
      이전 페이지
    </button>
  )}

  <button
    onClick={handleTogglePageStudied}
    className={`px-6 py-3 rounded-2xl font-bold transition ${
      isStudied
        ? 'bg-amber-500 text-slate-950 hover:opacity-90'
        : 'bg-emerald-500 text-slate-950 hover:opacity-90'
    }`}
  >
    {isStudied ? '읽지않음 표시' : '읽음 표시'}
  </button>

  {nextTarget && (
    <button
      onClick={() => {
        setPageStudyVol(nextTarget.vol);
        setPageStudyPg(nextTarget.page);
        window.scrollTo(0, 0);
      }}
      className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/10 text-white font-bold hover:bg-slate-800 transition"
    >
      다음 페이지
    </button>
  )}
</div>
    </div>
  );
};

  const renderBasicGroupStudy = () => {
    const chunk = getGroupStudyChunk(studyGroupNum);
    if (chunk.length === 0) {
      return (
        <EmptyState message="더 이상 학습할 암기 번호가 없습니다." icon={CheckCircle2}>
          <button onClick={() => goTo('basic', 'home')} className="mt-4 text-emerald-400 hover:text-white">
            홈으로
          </button>
        </EmptyState>
      );
    }

    const nextGroupNum = chunk.some((item) => item.groupNum === studyGroupNum + 1)
      ? studyGroupNum + 2
      : studyGroupNum + 1;
    const isMerged = chunk.some((item) => item.groupNum !== studyGroupNum);
    const chunkGroupNums = [...new Set(chunk.map((item) => item.groupNum))];
    const isGroupStudied = chunkGroupNums.every((num) => activeDaily.studiedGroups?.includes(num));

    const handleMarkGroupStudied = () => {
      setBasicDaily((prev) => {
        const nextState = markStudiedToday(prev);
        const existing = new Set(nextState.studiedGroups || []);
        chunkGroupNums.forEach((num) => existing.add(num));
        return {
          ...nextState,
          studiedGroups: [...existing].sort((a, b) => a - b),
        };
      });
    };
const handleToggleGroupStudied = () => {
  setBasicDaily((prev) => {
    const nextState = markStudiedToday(prev);
    const existing = new Set(nextState.studiedGroups || []);
    const allStudied = chunkGroupNums.every((num) => existing.has(num));

    if (allStudied) {
      chunkGroupNums.forEach((num) => existing.delete(num));
    } else {
      chunkGroupNums.forEach((num) => existing.add(num));
    }

    return {
      ...nextState,
      studiedGroups: [...existing].sort((a, b) => a - b),
    };
  });
};

const prevGroupNum = studyGroupNum > 1 ? studyGroupNum - 1 : null;
    return (
      <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-500 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              암기장 <span className="text-emerald-400">|</span>
              <span className="text-slate-300">
                그룹 {formatGroupLabel(studyGroupNum)} {isMerged ? `& ${formatGroupLabel(studyGroupNum + 1)}` : ''}
              </span>
            </h2>
            <p className="text-slate-400 font-bold mt-2 text-sm">연관된 스토리텔링 묶음을 한 번에 외워보세요. (총 {chunk.length}자)</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-emerald-400 font-bold">
              {chunk.length <= 7 && isMerged ? '병합 학습 모드 (<=7)' : '단일 그룹 모드'}
            </div>
          </div>
        </div>

        <div className="space-y-6">{chunk.map((data) => renderBasicStoryCard(data, { showExamples: false }))}</div>

<div className="mt-10 flex flex-wrap justify-center gap-4">
  {prevGroupNum && (
    <button
      onClick={() => {
        setStudyGroupNum(prevGroupNum);
        window.scrollTo(0, 0);
      }}
      className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/10 text-white font-bold hover:bg-slate-800 transition"
    >
      이전 그룹
    </button>
  )}

  <button
    onClick={handleToggleGroupStudied}
    className={`px-6 py-3 rounded-2xl font-bold transition ${
      isGroupStudied
        ? 'bg-amber-500 text-slate-950 hover:opacity-90'
        : 'bg-emerald-500 text-slate-950 hover:opacity-90'
    }`}
  >
    {isGroupStudied ? '읽지않음 표시' : '읽음 표시'}
  </button>

  <button
    onClick={() => {
      setStudyGroupNum(nextGroupNum);
      window.scrollTo(0, 0);
    }}
    className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/10 text-white font-bold hover:bg-slate-800 transition"
  >
    다음 그룹
  </button>
</div>
      </div>
    );
  };

  const renderPostSessionMenu = () => (
    <div className="flex flex-col items-center justify-center py-10 max-w-2xl mx-auto animate-in zoom-in-95 duration-500">
      <div className={`w-24 h-24 ${trackConfig.bgGlow} rounded-full flex items-center justify-center mb-8 border ${trackConfig.borderLight} shadow-xl`}>
        <CheckCircle2 className={`w-12 h-12 ${trackConfig.textColor}`} />
      </div>
      <h2 className="text-3xl font-black text-white mb-4">정규 세션 완료!</h2>
      <p className="text-slate-400 mb-10 text-center">
        현재 트랙에 할당된 장기 기억(SRS) 복습을 모두 마쳤습니다.<br />단기 기억 강화를 위해 추가 퀴즈 드릴을 진행할 수 있습니다.
      </p>

      <div className="w-full space-y-4">
        {activeDaily.todaySeenIds.length > 0 && (
          <button onClick={() => { setSessionConfig({ ...DEFAULT_SESSION_CONFIG, type: 'srs', source: 'today' }); goTo(activeTrack, 'study'); }} className="w-full p-6 bg-slate-900 border border-white/10 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 shadow-inner"><Clock className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">오늘 본 카드 다시보기</p>
                <p className="text-xs text-slate-500 mt-1">방금 학습한 {activeDaily.todaySeenIds.length}개의 카드를 빠르게 뜻으로 복습합니다.</p>
              </div>
            </div>
            <ChevronRight className="text-slate-600 group-hover:text-blue-400 transition-colors" />
          </button>
        )}
        <button onClick={() => { setSessionConfig({ ...DEFAULT_SESSION_CONFIG, type: 'flash_review', mode: 'meaning', source: 'weak' }); goTo(activeTrack, 'study'); }} className="w-full p-6 bg-slate-900 border border-white/10 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-between group">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center text-orange-400 shadow-inner"><AlertTriangle className="w-5 h-5" /></div>
            <div className="text-left">
              <p className="text-lg font-bold text-white group-hover:text-orange-400 transition-colors">취약점 집중 퀴즈 (뜻 편)</p>
              <p className="text-xs text-slate-500 mt-1">자주 틀린 카드를 가중 랜덤으로 뽑아 의미를 묻습니다.</p>
            </div>
          </div>
          <ChevronRight className="text-slate-600 group-hover:text-orange-400 transition-colors" />
        </button>
        <button onClick={() => { setSessionConfig({ ...DEFAULT_SESSION_CONFIG, type: 'flash_review', mode: 'reading', source: 'all' }); goTo(activeTrack, 'study'); }} className="w-full p-6 bg-slate-900 border border-white/10 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-between group">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center text-violet-400 shadow-inner"><Target className="w-5 h-5" /></div>
            <div className="text-left">
              <p className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">전체 음독/훈독 퀴즈</p>
              <p className="text-xs text-slate-500 mt-1">현재 활성화된 모든 카드 중 무작위 4지선다 테스트를 합니다.</p>
            </div>
          </div>
          <ChevronRight className="text-slate-600 group-hover:text-violet-400 transition-colors" />
        </button>
        <button onClick={() => goTo(activeTrack, 'home')} className="w-full p-4 text-slate-500 font-bold hover:text-white transition-colors mt-4">대시보드로 돌아가기</button>
      </div>
    </div>
  );

  const renderSrsStudyCard = (currentKanjiId) => {
    const currentCard = kanjiMap[currentKanjiId];
    const cardState = activeCards[currentKanjiId];

    const getIntervalLabel = (cState, diff) => {
      if (cState.status === 'new' || cState.status === 'learning') {
        if (diff === 'again') return '이번 세션';
        if (diff === 'hard') return '1d';
        if (diff === 'good') return '3d';
        return '7d';
      }
      if (diff === 'again') return '이번 세션';
      let nextDays = diff === 'hard' ? cState.interval + 3 : diff === 'good' ? cState.interval + 7 : cState.interval + 14;
      nextDays = Math.min(60, nextDays);
      return nextDays < 30 ? `${Math.floor(nextDays)}d` : `${Math.floor(nextDays / 30)}mo`;
    };

    const front = (
<div className="h-full w-full bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-white/10 rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 flex flex-col items-center justify-center shadow-2xl">
  <h2 className={`text-[5rem] sm:text-[7rem] md:text-[12rem] font-bold text-white leading-none`} style={{ textShadow: `0 0 50px ${trackConfig.dropShadowHex}` }}>
              {currentCard.kanji}
        </h2>
      </div>
    );

    const back = (
<div className="h-full w-full bg-slate-950 border-2 border-slate-700 rounded-[2rem] md:rounded-[3rem] p-4 md:p-8 flex flex-col overflow-hidden shadow-2xl">
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-3xl font-black text-white">{currentCard.mean}</h3>
              <div className="flex gap-3 mt-2 text-sm flex-wrap">
<span className={`${trackConfig.textColor} font-bold`}>
  음: {getReadingDisplay(currentCard, 'on')}
</span>
<span className="text-indigo-400 font-bold">
  훈: {getReadingDisplay(currentCard, 'kun')}
</span>
              </div>
            </div>
          </div>

          {currentCard.dataset === 'bim' && currentCard.bimTerm && (
            <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-1">대표 BIM 용어</p>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className={`text-xl font-black ${trackConfig.textColor}`}>{currentCard.bimTerm.word}</span>
                <span className="text-sm font-bold text-slate-400">[{currentCard.bimTerm.reading || '-'}]</span>
                <span className="text-sm text-slate-300 ml-2">- {currentCard.bimTerm.meaning}</span>
              </div>
            </div>
          )}

          {currentCard.dataset === 'basic' && (
            <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">JLPT 레벨</h4>
                <span className={`text-xl font-black ${trackConfig.textColor}`}>{currentCard.level || '-'}</span>
              </div>
              <div className="text-right">
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">분류 태그</h4>
                <span className="text-sm text-slate-300">{currentCard.tags?.join(', ') || '-'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-900 rounded-2xl border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-2">음독 활용</p>
              {currentCard.onExamples?.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {currentCard.onExamples.map((ex, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-white font-bold">{ex.word}</span>
                      <span className="text-slate-400 text-xs text-right leading-tight">
                        {ex.meaning || '-'}
<br />
<span className="text-[10px] text-slate-500">[{(ex.reading || '-').replace(/\./g, '')}]</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <span className="text-xs text-slate-600">-</span>}
            </div>

            <div className="bg-slate-900 rounded-2xl border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-2">훈독 활용</p>
              {currentCard.kunExamples?.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {currentCard.kunExamples.map((ex, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-white font-bold">{ex.word}</span>
                      <span className="text-slate-400 text-xs text-right leading-tight">
                        {ex.meaning || '-'}
<br />
<span className="text-[10px] text-slate-500">[{(ex.reading || '-').replace(/\./g, '')}]</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <span className="text-xs text-slate-600">-</span>}
            </div>
          </div>

          <div className={`${trackConfig.bgLight} border ${trackConfig.borderLight} rounded-2xl p-5 relative overflow-hidden`}>
            <Zap className={`absolute top-4 right-4 w-12 h-12 opacity-10 ${trackConfig.textColor}`} />
            <h4 className={`text-[10px] font-black ${trackConfig.textColor} uppercase tracking-widest mb-2`}>암기 비법</h4>
            <p className="text-base leading-relaxed text-slate-200 font-medium break-keep">
  {currentCard.story || '-'}
</p>
          </div>
        </div>
      </div>
    );

    return (
      <>
        <div className="w-full flex justify-between items-center text-sm mb-6">
          <span className="text-slate-500 font-bold uppercase tracking-widest">SRS Session • Queue: {studyQueue.length}</span>
          <div className="flex gap-2">
            {cardState.status === 'new' && <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-[10px] font-bold">NEW</span>}
            {cardState.status === 'learning' && <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-[10px] font-bold">LEARNING</span>}
            {cardState.status === 'review' && <span className="px-2 py-1 bg-violet-500/20 text-violet-400 rounded text-[10px] font-bold">REVIEW</span>}
            {cardState.status === 'mastered' && <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">MASTERED</span>}
          </div>
        </div>

        <FlipCard isFlipped={isFlipped} front={front} back={back} />

        <div className="w-full pt-6">
          {!isFlipped ? (
            <button onClick={() => setIsFlipped(true)} className="w-full h-16 bg-white text-slate-950 rounded-2xl font-black text-lg shadow-xl shadow-white/5 active:scale-95 transition-all">정답 확인</button>
          ) : (
            <div className="grid grid-cols-5 gap-2 w-full h-16 animate-in fade-in zoom-in-95 duration-300">
              <button onClick={() => setIsFlipped(false)} className="col-span-1 h-full flex flex-col items-center justify-center bg-slate-800 border border-white/10 rounded-2xl hover:bg-slate-700 transition-all active:scale-95">
                <RotateCw className="w-5 h-5 text-slate-400" /><span className="text-[10px] text-slate-400 font-bold mt-1">앞면</span>
              </button>
              <button onClick={() => handleSrsNext('again')} className="col-span-1 h-full flex flex-col items-center justify-center bg-red-500/10 border border-red-500/20 rounded-2xl hover:bg-red-500/20 transition-all active:scale-95">
                <span className="text-xs font-black uppercase text-red-500 tracking-tighter mb-1">Again</span><span className="text-[10px] text-red-400/70 font-bold">{getIntervalLabel(cardState, 'again')}</span>
              </button>
              <button onClick={() => handleSrsNext('hard')} className="col-span-1 h-full flex flex-col items-center justify-center bg-orange-500/10 border border-orange-500/20 rounded-2xl hover:bg-orange-500/20 transition-all active:scale-95">
                <span className="text-xs font-black uppercase text-orange-500 tracking-tighter mb-1">Hard</span><span className="text-[10px] text-orange-400/70 font-bold">{getIntervalLabel(cardState, 'hard')}</span>
              </button>
              <button onClick={() => handleSrsNext('good')} className="col-span-1 h-full flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/20 transition-all active:scale-95">
                <span className="text-xs font-black uppercase text-emerald-500 tracking-tighter mb-1">Good</span><span className="text-[10px] text-emerald-400/70 font-bold">{getIntervalLabel(cardState, 'good')}</span>
              </button>
              <button onClick={() => handleSrsNext('easy')} className="col-span-1 h-full flex flex-col items-center justify-center bg-blue-500/10 border border-blue-500/20 rounded-2xl hover:bg-blue-500/20 transition-all active:scale-95">
                <span className="text-xs font-black uppercase text-blue-500 tracking-tighter mb-1">Easy</span><span className="text-[10px] text-blue-400/70 font-bold">{getIntervalLabel(cardState, 'easy')}</span>
              </button>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderFlashMultipleChoiceQuiz = () => {
    if (!activeQuiz) {
      return (
        <div className="w-full py-20 flex flex-col items-center justify-center text-slate-500 animate-pulse">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-slate-300 rounded-full animate-spin mb-4" />
          <p className="font-bold tracking-widest uppercase text-xs">다음 문제 구성 중...</p>
        </div>
      );
    }

    const { prompt, choices, isAnswered, isCorrect, selectedChoiceIndex, mode, kanjiId } = activeQuiz;
    const currentCard = kanjiMap[kanjiId];
const modeLabel =
  mode === 'meaning'
    ? '뜻 편'
    : mode === 'onyomi'
    ? '음독 편'
    : mode === 'kunyomi'
    ? '훈독 편'
    : '음독/훈독 편';

const modeQuestion =
  mode === 'meaning'
    ? '이 한자의 뜻은?'
    : mode === 'onyomi'
    ? '이 한자의 음독은?'
    : mode === 'kunyomi'
    ? '이 한자의 훈독은?'
    : '이 한자의 음독/훈독은?';
    return (
      <div className="w-full flex flex-col animate-in fade-in duration-300">
        <div className="w-full flex justify-between items-center text-sm mb-8">
          <span className="text-slate-500 font-bold uppercase tracking-widest">Flash Quiz ({modeLabel})</span>
          <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-bold">{studyQueue.length} 남음</span>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center shadow-lg mb-6 min-h-[200px]">
          <p className="text-slate-400 text-lg font-bold mb-4">{modeQuestion}</p>
          <h2 className="text-[8rem] font-black text-white tracking-widest leading-none drop-shadow-[0_0_50px_rgba(255,255,255,0.1)]">{prompt}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {choices.map((choice, index) => {
            let btnClass = 'bg-slate-900 border-white/10 hover:bg-slate-800 text-white';
            if (isAnswered) {
              if (index === activeQuiz.correctChoiceIndex) btnClass = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]';
              else if (index === selectedChoiceIndex && !isCorrect) btnClass = 'bg-red-500/20 border-red-500/50 text-red-400';
              else btnClass = 'bg-slate-900/50 border-white/5 text-slate-600 opacity-50';
            }

            return (
              <button key={choice.id} onClick={() => handleFlashAnswer(index)} disabled={isAnswered} className={`flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all duration-300 ${!isAnswered && 'active:scale-95'} ${btnClass}`}>
                <span className="text-2xl font-bold">{choice.text}</span>
              </button>
            );
          })}
        </div>

        {isAnswered && (
          <div className="w-full mt-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-6 ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {isCorrect ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="text-3xl">{currentCard.kanji}</span> : {currentCard.mean}</h3>
<p className="text-sm text-slate-400 mt-1">
  음: {getReadingDisplay(currentCard, 'on')}
  <span className="mx-2">|</span>
  훈: {getReadingDisplay(currentCard, 'kun')}
</p>
                </div>
              </div>
              <button onClick={handleNextQuiz} className="w-full md:w-auto px-8 py-4 bg-white text-slate-950 font-black rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-xl">
                다음 문제 <ArrowRight className="inline-block w-5 h-5 ml-2" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStudySession = () => {
    if (isBuildingSession) {
      return (
        <div className="w-full py-20 flex flex-col items-center justify-center text-slate-500 animate-pulse">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-slate-300 rounded-full animate-spin mb-4" />
          <p className="font-bold tracking-widest uppercase text-xs">학습 세션 준비 중...</p>
        </div>
      );
    }

    if (studyQueue.length === 0 && !activeQuiz) {
      if (sessionConfig.type === 'srs') return renderPostSessionMenu();
      return (
        <EmptyState message="드릴 퀴즈가 완료되었습니다!" icon={Target}>
          <button
            onClick={() => goTo(activeTrack, 'home')}
            className="mt-4 text-sm font-bold text-slate-400 hover:text-white transition-colors"
          >
            홈으로 돌아가기
          </button>
        </EmptyState>
      );
    }

    return (
<div className="flex flex-col items-center max-w-2xl mx-auto py-2 md:py-4 animate-in fade-in duration-300 w-full">
          {sessionConfig.type === 'flash_review'
          ? renderFlashMultipleChoiceQuiz()
          : renderSrsStudyCard(studyQueue[0])}
      </div>
    );
  };

  const renderLibrary = () => {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-20">
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-white">사전 (Library)</h2>
            <p className="text-slate-500">모든 한자 데이터 검색 및 탐색 ({libraryList.length}자)</p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto flex-wrap">
            <div className="flex bg-slate-900 rounded-xl p-1 border border-white/10 shrink-0">
              {['all', 'bim', 'basic'].map((f) => (
                <button key={f} onClick={() => setLibFilter(f)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${libFilter === f ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                  {f === 'all' ? '전체' : f === 'bim' ? 'BIM 실무' : '일상 PDF'}
                </button>
              ))}
            </div>
            <div className="flex bg-slate-900 rounded-xl p-1 border border-white/10 shrink-0">
              <select value={libSort} onChange={(e) => setLibSort(e.target.value)} className="bg-transparent text-slate-300 text-xs font-bold px-3 py-1.5 outline-none cursor-pointer">
                <option value="default">기본 정렬</option>
                <option value="mastered">마스터 우선</option>
                <option value="weak">취약점 우선</option>
              </select>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input type="text" placeholder="검색어 입력..." className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/30 transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </div>

        {libraryList.length === 0 ? (
          <EmptyState message="검색 조건에 맞는 데이터가 없습니다." icon={Search} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {libraryList.map((item) => {
              const cTrack = item.dataset;
              const cardState = cTrack === 'bim' ? bimCards[item.id] : basicCards[item.id];
              const hoverBorder = cTrack === 'bim' ? 'hover:border-violet-500/30' : 'hover:border-emerald-500/30';
              const badgeBg = cTrack === 'bim' ? 'bg-violet-500/20 text-violet-400' : 'bg-emerald-500/20 text-emerald-400';
              
              return (
                <div key={item.id} className={`p-6 bg-slate-900/40 border border-white/5 rounded-3xl transition-all group cursor-pointer text-center relative overflow-hidden ${hoverBorder}`} onClick={() => setSelectedKanjiId(item.id)}>
                  {cardState?.status === 'mastered' && <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/20 blur-xl rounded-full" />}
                  
                  <div className="absolute top-3 left-3 flex flex-col gap-1 items-start">
                     <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${badgeBg}`}>
                       {cTrack === 'bim' ? `BIM ${item.level}` : `G${formatGroupLabel(item.groupNum)} · v${item.sourceVolume} p${item.sourcePage}`}
                     </span>
                  </div>

                  <div className="absolute top-3 right-3 opacity-50">
                    {cardState?.status === 'mastered' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {cardState?.status === 'learning' && <Clock className="w-4 h-4 text-orange-400" />}
                  </div>

                  <span className="text-4xl font-bold text-white group-hover:scale-110 block transition-transform mt-4">{item.kanji}</span>
                  <p className="text-sm font-bold mt-3 truncate text-slate-300">{item.mean}</p>
                  {cTrack === 'bim' && item.bimTerm && <p className="text-[10px] text-slate-500 mt-1 truncate">{item.bimTerm.word}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderStats = () => (
    <div className="max-w-5xl mx-auto space-y-10 animate-in slide-in-from-right-4 duration-700 pb-20">
      <h2 className="text-3xl font-black text-white">SRS Insights ({trackConfig.titleMain})</h2>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10 flex flex-col items-center justify-center text-center">
          <ProgressRing percentage={stats.progressPercent} colorClass={trackConfig.textColor} />
          <h3 className="text-2xl font-bold text-white mt-6">Mastery Level</h3>
          <p className="text-slate-500 mt-2">전체 {stats.total}자 중 {stats.masteredCount}자</p>
        </div>

        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10 flex flex-col justify-center">
          <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Status Breakdown</h3>
          <div className="space-y-6">
            {[
              { label: 'New Cards', val: stats.newCount, color: 'bg-slate-500' },
              { label: 'Learning / Review', val: stats.learningCount + stats.reviewCount, color: 'bg-blue-500' },
              { label: 'Mastered', val: stats.masteredCount, color: 'bg-emerald-500' },
            ].map((bar, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400 font-bold">{bar.label}</span>
                  <span className="text-white font-black">{bar.val}</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`${bar.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${(bar.val / (stats.total || 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10 flex flex-col justify-center">
          <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Difficulty Distribution</h3>
          <div className="space-y-4">
            {[
              { label: 'Again', val: stats.srsDiffStats.again, color: 'text-red-500', bg: 'bg-red-500' },
              { label: 'Hard', val: stats.srsDiffStats.hard, color: 'text-orange-500', bg: 'bg-orange-500' },
              { label: 'Good', val: stats.srsDiffStats.good, color: 'text-emerald-500', bg: 'bg-emerald-500' },
              { label: 'Easy', val: stats.srsDiffStats.easy, color: 'text-blue-500', bg: 'bg-blue-500' },
            ].map((stat, i) => {
              const totalDiffs = stats.srsDiffStats.again + stats.srsDiffStats.hard + stats.srsDiffStats.good + stats.srsDiffStats.easy || 1;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={`${stat.color} font-bold uppercase text-[10px]`}>{stat.label}</span>
                    <span className="text-slate-400">{stat.val}회</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`${stat.bg} h-full rounded-full`} style={{ width: `${(stat.val / totalDiffs) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-16">
        <div className="p-8 rounded-[2.5rem] bg-slate-900 border border-white/10">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><AlertTriangle className="text-orange-500 w-5 h-5" /> Weak SRS Cards</h3>
          {stats.weakSrs.length === 0 ? <p className="text-slate-500 text-sm">아직 취약한 카드가 없습니다.</p> : (
            <div className="space-y-3">
              {stats.weakSrs.map((c, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-white/5">
                  <span className="text-2xl font-bold text-white">{c.kanji}</span>
                  <span className="text-xs font-bold text-orange-400 bg-orange-400/10 px-2 py-1 rounded">Lapses: {c.lapses}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-8 rounded-[2.5rem] bg-slate-900 border border-white/10">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Filter className={`${trackConfig.textColor} w-5 h-5`} /> Tag Progress</h3>
          <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar pr-2">
            {Object.entries(stats.tagProgress).sort((a, b) => b[1].total - a[1].total).map(([tag, data], i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1"><span className="text-slate-300 font-bold">{tag}</span><span className="text-slate-500">{data.mastered} / {data.total}</span></div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`${trackConfig.bgSolid} h-full rounded-full`} style={{ width: `${(data.mastered / data.total) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="text-3xl font-black text-white pt-8 border-t border-white/10">Flash Drill Insights (플래시 퀴즈)</h2>

      <div className="grid md:grid-cols-4 gap-8">
        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10 flex flex-col justify-center">
          <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Accuracy by Mode</h3>
          <div className="space-y-6">
            {[
              { label: '뜻 편 (Meaning)', val: stats.flashAcc.meaning, color: 'bg-blue-500' },
              { label: '음독 편 (Onyomi)', val: stats.flashAcc.on, color: 'bg-violet-500' },
              { label: '훈독 편 (Kunyomi)', val: stats.flashAcc.kun, color: 'bg-emerald-500' },
            ].map((bar, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400 font-bold">{bar.label}</span><span className="text-white font-black">{bar.val}%</span></div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden"><div className={`${bar.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${bar.val}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10">
          <h3 className="text-sm font-black text-white mb-6 flex items-center gap-2"><Target className="text-blue-500 w-5 h-5" /> Weak in Meaning</h3>
          {stats.weakMean.length === 0 ? <p className="text-slate-500 text-xs">오답 없음</p> : (
            <div className="space-y-3">
              {stats.weakMean.map((c, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-white/5"><span className="text-xl font-bold text-white">{c.kanji}</span><span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded">오답: {c.lapses}</span></div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10">
          <h3 className="text-sm font-black text-white mb-6 flex items-center gap-2"><Target className="text-violet-500 w-5 h-5" /> Weak in Onyomi</h3>
          {stats.weakOn.length === 0 ? <p className="text-slate-500 text-xs">오답 없음</p> : (
            <div className="space-y-3">
              {stats.weakOn.map((c, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-white/5"><span className="text-xl font-bold text-white">{c.kanji}</span><span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 px-2 py-1 rounded">오답: {c.lapses}</span></div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-1 p-8 rounded-[2.5rem] bg-slate-900 border border-white/10">
          <h3 className="text-sm font-black text-white mb-6 flex items-center gap-2"><Target className="text-emerald-500 w-5 h-5" /> Weak in Kunyomi</h3>
          {stats.weakKun.length === 0 ? <p className="text-slate-500 text-xs">오답 없음</p> : (
            <div className="space-y-3">
              {stats.weakKun.map((c, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-white/5"><span className="text-xl font-bold text-white">{c.kanji}</span><span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">오답: {c.lapses}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-slate-500/30 overflow-x-hidden flex">
      <div className={`fixed top-[-10%] left-[-10%] w-[50%] h-[50%] ${trackConfig.bgGlow} blur-[120px] rounded-full pointer-events-none transition-colors duration-1000`} />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-800/20 blur-[120px] rounded-full pointer-events-none" />
{isMobileMenuOpen && (
  <button
    type="button"
    aria-label="메뉴 닫기"
    onClick={() => setIsMobileMenuOpen(false)}
    className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden"
  />
)}

<nav className={`fixed left-0 top-0 h-full w-24 border-r border-white/5 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center py-6 z-50 overflow-y-auto custom-scrollbar transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="w-12 h-12 bg-gradient-to-tr from-slate-700 to-slate-800 rounded-2xl flex items-center justify-center shadow-lg mb-6 shrink-0">
          <Zap className="text-white w-6 h-6" />
        </div>

        <div className="w-full flex flex-col items-center gap-2 mb-4">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">BIM 실무</div>
          <button onClick={() => goTo('bim', 'home')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'home' && activeTrack === 'bim' ? 'bg-violet-500/20 text-violet-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <LayoutGrid className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">홈</span>
          </button>
          <button onClick={() => { setSessionConfig({ ...DEFAULT_SESSION_CONFIG, type: 'srs' }); goTo('bim', 'study'); }} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'study' && activeTrack === 'bim' ? 'bg-violet-500/20 text-violet-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <BookOpen className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">학습</span>
          </button>
          <button onClick={() => goTo('bim', 'library')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'library' && activeTrack === 'bim' ? 'bg-violet-500/20 text-violet-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <Search className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">사전</span>
          </button>
          <button onClick={() => goTo('bim', 'stats')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'stats' && activeTrack === 'bim' ? 'bg-violet-500/20 text-violet-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <BarChart3 className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">통계</span>
          </button>
        </div>

        <div className="w-10 h-px bg-white/10 my-2 shrink-0" />

        <div className="w-full flex flex-col items-center gap-2 mb-4 mt-2">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">일상 PDF</div>
          <button onClick={() => goTo('basic', 'home')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'home' && activeTrack === 'basic' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <LayoutGrid className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">홈</span>
          </button>
          <button onClick={() => goTo('basic', 'page')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'page' && activeTrack === 'basic' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <FileText className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">페이지</span>
          </button>
          <button onClick={() => goTo('basic', 'group_study')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'group_study' && activeTrack === 'basic' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <Layers className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">암기장</span>
          </button>
          <button onClick={() => { setSessionConfig({ ...DEFAULT_SESSION_CONFIG, type: 'srs' }); goTo('basic', 'study'); }} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'study' && activeTrack === 'basic' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <Target className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">복습</span>
          </button>
          <button onClick={() => goTo('basic', 'library')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'library' && activeTrack === 'basic' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <Search className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">사전</span>
          </button>
          <button onClick={() => goTo('basic', 'stats')} className={`w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${view === 'stats' && activeTrack === 'basic' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            <BarChart3 className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">통계</span>
          </button>
        </div>

        <button className="mt-auto p-3 text-slate-600 hover:text-red-400 transition-colors shrink-0" title="전체 데이터 초기화" onClick={handleClearData}>
          <Settings className="w-5 h-5" />
        </button>
      </nav>

<main className="w-full min-h-screen flex flex-col md:pl-24">
<header className="w-full bg-slate-950/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40 h-16 flex items-center px-4 md:px-10 justify-between">
  <div className="flex items-center gap-3">
<button
  onClick={() => setIsMobileMenuOpen((prev) => !prev)}
  className="md:hidden p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300"
  aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
>
  {isMobileMenuOpen ? <X className="w-5 h-5" /> : '☰'}
</button>
    <div>
      <h1 className="text-lg font-bold text-white tracking-tight">
        Kanji Mastery <span className={`text-[10px] uppercase ml-2 px-2 py-0.5 rounded-full bg-slate-800 ${trackConfig.textColor}`}>{activeTrack} mode</span>
      </h1>
    </div>
  </div>
          <div className="flex items-center gap-4">
            {activeTrack === 'basic' && (
               <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-white/10 rounded-full text-slate-400 text-[10px] font-bold">
                 <FileText className="w-3 h-3 text-emerald-400" />
                 읽은 페이지 {stats.studiedPages} / {stats.totalPages}
                 <span className="mx-1 opacity-20">|</span>
                 <Layers className="w-3 h-3 text-emerald-400" />
                 암기 그룹 {stats.studiedGroups} / {stats.totalGroups}
               </div>
            )}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 border border-white/10 rounded-full text-slate-300">
              <Flame className={`w-3 h-3 ${trackConfig.textColor}`} />
              <span className="text-[10px] font-bold tracking-wider">DAY {activeDaily.streak}</span>
            </div>
          </div>
        </header>

<div className="flex-1 p-4 md:p-10 max-w-7xl w-full mx-auto relative">
          {view === 'home' && renderHome()}
          {view === 'page' && renderBasicPageStudy()}
          {view === 'group_study' && renderBasicGroupStudy()}
          {view === 'study' && renderStudySession()}
          {view === 'library' && renderLibrary()}
          {view === 'stats' && renderStats()}
        </div>
      </main>

      {/* Render Modal Safety */}
      {renderKanjiDetailModal()}

      <style dangerouslySetInnerHTML={{ __html: `.backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; } .custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }`}} />
    </div>
  );
};
export default App;