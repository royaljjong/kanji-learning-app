import {
  BarChart3,
  BookOpen,
  BookText,
  FileText,
  Flame,
  Layers,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  Target,
  X,
  Zap,
} from 'lucide-react';

const navButtonClass = (isActive, activeClass) =>
  `w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${
    isActive ? activeClass : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
  }`;

const AppShell = ({
  activeDaily,
  activeTrack,
  children,
  cloudStatusView,
  goTo,
  handleClearData,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  setSessionConfig,
  stats,
  trackConfig,
  view,
}) => {
  const startStudy = (track) => {
    setSessionConfig({ type: 'srs', mode: null, source: null });
    goTo(track, 'study');
  };

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
          <button onClick={() => goTo('bim', 'home')} className={navButtonClass(view === 'home' && activeTrack === 'bim', 'bg-violet-500/20 text-violet-400')}>
            <LayoutGrid className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">홈</span>
          </button>
          <button onClick={() => startStudy('bim')} className={navButtonClass(view === 'study' && activeTrack === 'bim', 'bg-violet-500/20 text-violet-400')}>
            <BookOpen className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">학습</span>
          </button>
          <button onClick={() => goTo('bim', 'library')} className={navButtonClass(view === 'library' && activeTrack === 'bim', 'bg-violet-500/20 text-violet-400')}>
            <Search className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">사전</span>
          </button>
          <button onClick={() => goTo('bim', 'vocab')} className={navButtonClass(['vocab', 'vocab_study'].includes(view) && activeTrack === 'bim', 'bg-violet-500/20 text-violet-400')}>
            <BookText className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">단어</span>
          </button>
          <button onClick={() => goTo('bim', 'stats')} className={navButtonClass(view === 'stats' && activeTrack === 'bim', 'bg-violet-500/20 text-violet-400')}>
            <BarChart3 className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">통계</span>
          </button>
        </div>

        <div className="w-10 h-px bg-white/10 my-2 shrink-0" />

        <div className="w-full flex flex-col items-center gap-2 mb-4 mt-2">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">일상 PDF</div>
          <button onClick={() => goTo('basic', 'home')} className={navButtonClass(view === 'home' && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
            <LayoutGrid className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">홈</span>
          </button>
          <button onClick={() => goTo('basic', 'page')} className={navButtonClass(view === 'page' && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
            <FileText className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">페이지</span>
          </button>
          <button onClick={() => goTo('basic', 'group_study')} className={navButtonClass(view === 'group_study' && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
            <Layers className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">암기장</span>
          </button>
          <button onClick={() => startStudy('basic')} className={navButtonClass(view === 'study' && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
            <Target className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">복습</span>
          </button>
          <button onClick={() => goTo('basic', 'library')} className={navButtonClass(view === 'library' && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
            <Search className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">사전</span>
          </button>
          <button onClick={() => goTo('basic', 'vocab')} className={navButtonClass(['vocab', 'vocab_study'].includes(view) && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
            <BookText className="w-5 h-5 mb-1" /><span className="text-[9px] font-bold">단어</span>
          </button>
          <button onClick={() => goTo('basic', 'stats')} className={navButtonClass(view === 'stats' && activeTrack === 'basic', 'bg-emerald-500/20 text-emerald-400')}>
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
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                Kanji Mastery <span className={`text-[10px] uppercase ml-2 px-2 py-0.5 rounded-full bg-slate-800 ${trackConfig.textColor}`}>{activeTrack === 'bim' ? 'BIM 실무' : '일상 PDF'}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full border text-[9px] sm:text-[10px] font-bold max-w-[120px] sm:max-w-none truncate ${cloudStatusView.className}`}>
              {cloudStatusView.label}
            </div>
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
              <span className="text-[10px] font-bold tracking-wider">{activeDaily.streak}일 연속</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-10 max-w-7xl w-full mx-auto relative">{children}</div>
      </main>
    </div>
  );
};

export default AppShell;
