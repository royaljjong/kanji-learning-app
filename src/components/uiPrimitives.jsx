import React from 'react';

export const ProgressRing = ({ percentage, colorClass }) => {
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

export const EmptyState = ({ message, icon: Icon, children }) => (
  <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
    <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-white/5 shadow-xl">
      {React.createElement(Icon, { className: 'w-10 h-10 text-slate-500' })}
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{message}</h3>
    {children}
  </div>
);

export const FlipCard = ({ isFlipped, front, back }) => (
  <div className="relative w-full h-[70vh] md:h-auto md:aspect-[4/5] [perspective:2000px]">
    <div className="relative h-full w-full transition-transform duration-700" style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
      <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>{front}</div>
      <div className="absolute inset-0" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>{back}</div>
    </div>
  </div>
);
