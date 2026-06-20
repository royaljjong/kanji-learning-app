import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const readJson = (filePath) => {
  const text = fs.readFileSync(path.join(root, filePath), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
};

const parseExamples = (value) => {
  if (!value || value === '(없음)') return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.+?)\((.+?)\)$/);
      return {
        word: match ? match[1].trim() : entry,
        raw: entry,
      };
    });
};

const hasKana = (value) => /[ぁ-ゖァ-ヺー]/.test(String(value || ''));

const auditBasic = () => {
  const rows = readJson('src/data/basic_kanji.json');
  const suspiciousExamples = [];
  const readingsWithoutTrustedExample = [];

  for (const row of rows) {
    const examples = [
      ...parseExamples(row.onyomiExamples),
      ...parseExamples(row.kunyomiExamples),
    ];

    const mismatched = examples.filter((example) => {
      if (!example.word || example.word === '(없음)') return false;
      return !example.word.includes(row.kanji);
    });

    if (mismatched.length > 0) {
      suspiciousExamples.push({
        id: row.id,
        kanji: row.kanji,
        meaning: row.koreanMeaning,
        examples: mismatched.map((example) => example.raw).join(' / '),
      });
    }

    const trustedExamples = examples.filter((example) => example.word?.includes(row.kanji));
    if ((hasKana(row.onyomi) || hasKana(row.kunyomi)) && trustedExamples.length === 0) {
      readingsWithoutTrustedExample.push({
        id: row.id,
        kanji: row.kanji,
        meaning: row.koreanMeaning,
        onyomi: row.onyomi,
        kunyomi: row.kunyomi,
      });
    }
  }

  return { suspiciousExamples, readingsWithoutTrustedExample };
};

const { suspiciousExamples, readingsWithoutTrustedExample } = auditBasic();

console.log(`Suspicious examples: ${suspiciousExamples.length}`);
console.table(suspiciousExamples.slice(0, 80));

console.log(`Readings without trusted examples: ${readingsWithoutTrustedExample.length}`);
console.table(readingsWithoutTrustedExample.slice(0, 80));

if (suspiciousExamples.length > 0) {
  process.exitCode = 1;
}
