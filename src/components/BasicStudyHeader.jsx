import { BookOpen } from 'lucide-react';

export default function BasicStudyHeader({
  groupTitle,
  groupKanjiListText,
  groupSubtitle,
}) {
  return (
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
  );
}