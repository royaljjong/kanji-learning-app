export default function BasicKanji({ data }) {
  return (
    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start shadow-lg">
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 border border-white/10 rounded-2xl flex items-center justify-center text-7xl font-bold text-white bg-slate-950 shadow-inner shrink-0">
          <span>{data.kanji}</span>
        </div>

        <div className="mt-4 bg-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
          {data.meaning_kr || '-'}
        </div>
      </div>

      <div className="flex-1 w-full space-y-4">
        <div className="bg-slate-950 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-4 text-base font-bold flex-wrap">
            <span className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg">
              음: {data.onyomi || '-'}
            </span>
            <span className="text-teal-400 bg-teal-500/10 px-3 py-1 rounded-lg">
              훈: {data.kunyomi || '-'}
            </span>
          </div>
        </div>

        {data.memory_hint && (
          <div className="bg-slate-950 border border-white/5 rounded-xl p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500 mb-3">
              Memory Hint
            </p>
            <p className="text-slate-200 leading-relaxed">{data.memory_hint}</p>
          </div>
        )}
      </div>
    </div>
  );
}