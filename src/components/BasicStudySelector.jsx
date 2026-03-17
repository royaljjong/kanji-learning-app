import BASIC_PAGE_META from './data/Basic_Page_Meta.json';

export default function BasicStudySelector({
  safeVol,
  safePg,
  volumes,
  pages,
  pageMap,
  setPageStudyVol,
  setPageStudyPg,
}) {
  return (
    <div className="flex gap-4">
      <select
        value={safeVol}
        onChange={(e) => {
          const v = Number(e.target.value);
          setPageStudyVol(v);
          setPageStudyPg(Math.min(...Array.from(pageMap[v] || [1])));
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
            (m) =>
              Number(m.sourceVolume) === Number(safeVol) &&
              Number(m.sourcePage) === Number(p)
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
  );
}