import React from 'react';

const AnimatedBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Animated background with financial/forex theme */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-900 to-zinc-900">
        {/* Moving particles */}
        <div className="absolute inset-0">
          {/* Large floating shapes */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-lime-500/10 rounded-full blur-xl animate-pulse"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-green-500/10 rounded-full blur-xl animate-pulse delay-2000"></div>
          
          {/* Moving grid */}
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%" className="animate-pulse">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          
          {/* Floating financial symbols */}
          <div className="absolute inset-0 overflow-hidden">
            {/* EUR symbol */}
            <div className="absolute top-20 left-10 text-lime-400/20 text-4xl font-bold animate-float">€</div>
            <div className="absolute top-40 right-20 text-green-400/20 text-3xl font-bold animate-float delay-500">$</div>
            <div className="absolute bottom-32 left-16 text-emerald-400/20 text-3xl font-bold animate-float delay-1000">£</div>
            <div className="absolute bottom-20 right-32 text-yellow-400/20 text-2xl font-bold animate-float delay-1500">¥</div>
            
            {/* Trend lines */}
            <svg className="absolute inset-0 w-full h-full opacity-20">
              <path 
                d="M 50,300 Q 200,200 350,250 T 650,180" 
                stroke="url(#gradient1)" 
                strokeWidth="2" 
                fill="none"
                className="animate-pulse"
              />
              <path 
                d="M 100,400 Q 300,350 500,380 T 800,320" 
                stroke="url(#gradient2)" 
                strokeWidth="2" 
                fill="none"
                className="animate-pulse delay-1000"
              />
              <defs>
                <linearGradient id="gradient1">
                  <stop offset="0%" stopColor="#c4d82e" />
                  <stop offset="100%" stopColor="#65a30d" />
                </linearGradient>
                <linearGradient id="gradient2">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#c4d82e" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          {/* Animated dots representing data points */}
          <div className="absolute inset-0">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className={`absolute w-2 h-2 bg-gradient-to-r from-lime-400 to-emerald-400 rounded-full animate-pulse`}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>
          
          {/* Subtle overlay patterns */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-transparent to-slate-900/30"></div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedBackground;
