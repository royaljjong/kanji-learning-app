import React from 'react';
import { BookOpen, FileText } from 'lucide-react';
import BASIC_PAGE_META from '../data/basic_page_meta.json';

export default function BasicPageStudySection({
  currentDatasetList,
  pageStudyVol,
  pageStudyPg,
  setPageStudyVol,
  setPageStudyPg,
  activeDaily,
  setBasicDaily,
  markStudiedToday,
  getBasicPageKey,
  EmptyState,
}) {
  const pageMap = {};
  currentDatasetList.forEach((k) => {
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
    .filter((k) => k.sourceVolume === safeVol && k.sourcePage === safePg)
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

  const pageKey = getBasicPageKey(safeVol, safePg);
  const isStudied = activeDaily.studiedPages?.includes(pageKey);

  const handleMarkPageStudied = () => {
    setBasicDaily((prev) => {
      const nextState = markStudiedToday(prev);
      if (nextState.studiedPages?.includes(pageKey)) return nextState;
      return {
        ...nextState,
        studiedPages: [...(nextState.studiedPages || []), pageKey],
      };
    });
  };

  const groupTitle = pageMeta?.title || `Group ${safeVol}-${safePg}`;
  const groupCount = pageMeta?.count || pageKanji.length;
  const groupKanjiListText = pageMeta?.kanjiList?.join(', ') || '';
  const groupSubtitle = `권 ${safeVol} · 원본 페이지 ${safePg} · 한자 ${groupCount}개`;

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-emerald-400" />
            <span>{groupTitle}</span>
          </h2>

          {groupKanjiListText && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                Group Kanji
              </p>
              <p className="text-base text-slate-200 font-medium">
                {groupKanjiListText}
              </p>
            </div>
          )}

          <p className="text-slate-400 mt-2">{groupSubtitle}</p>
        </div>

        <div className="flex gap-4">
          <select
            value={safeVol}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPageStudyVol(v);
              setPageStudyPg(Math.min(...Array.from(pageMap[v])));
            }}
            className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-white outline-none"
          >
            {volumes.map((v) => (
              <option key={v} value={v}>
                Volume {v}
              </option>
            ))}
          </select>

          <select
            value={safePg}
            onChange={(e) => setPageStudyPg(Number(e.target.value))}
            className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-white outline-none"
          >
            {pages.map((p) => {
              const optionMeta = BASIC_PAGE_META.find(
                (m) => Number(m.sourceVolume) === Number(safeVol) && Number(m.sourcePage) === Number(p)
              );

              const optionLabel = optionMeta?.title || `Group ${safeVol}-${p}`;

              return (
                <option key={p} value={p}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {pageKanji.map((data) => (
          <div
            key={data.id}
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start shadow-lg"
          >
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
                    음: {data.on_readings.join(', ').replace(/,/g, ' / ') || '-'}
                  </span>
                  <span className="text-teal-400 bg-teal-500/10 px-3 py-1 rounded-lg">
                    훈: {data.kun_readings.join(', ').replace(/,/g, ' / ') || '-'}
                  </span>
                </div>
              </div>

              {data.examples?.length > 0 && (
                <div className="bg-slate-950 border border-white/5 rounded-xl p-5">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500 mb-3">Examples</p>
                  <div className="space-y-2">
                    {data.examples.map((ex, idx) => (
                      <div key={idx} className="text-slate-200">
                        {ex}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.memory_story && (
                <div className="bg-slate-950 border border-white/5 rounded-xl p-5">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500 mb-3">Memory Hint</p>
                  <p className="text-slate-200 leading-relaxed">{data.memory_story}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-4">
        <button
          onClick={handleMarkPageStudied}
          className="px-6 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-bold hover:opacity-90 transition"
        >
          {isStudied ? '이 그룹 학습 완료됨' : '이 그룹 학습 완료'}
        </button>

        {nextTarget && (
          <button
            onClick={() => {
              setPageStudyVol(nextTarget.vol);
              setPageStudyPg(nextTarget.page);
            }}
            className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/10 text-white font-bold hover:bg-slate-800 transition"
          >
            다음 그룹
          </button>
        )}
      </div>
    </div>
  );
}