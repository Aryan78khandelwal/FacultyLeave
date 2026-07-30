import React, { useMemo } from 'react';

const AnimatedBackground = () => {
  const bubbles = useMemo(() => {
    return Array.from({ length: 55 }).map((_, i) => {
      const size = Math.random() * 18 + 6; // 6px to 24px
      const left = Math.random() * 100; // 0% to 100%
      const delay = Math.random() * 12; // 0s to 12s
      const duration = Math.random() * 16 + 14; // 14s to 30s
      const scale = Math.random() * 0.6 + 0.7; // 0.7 to 1.3 individual opacity multiplier
      
      // Harmonious solid brand colors (opacity is handled via the CSS keyframe variable)
      const colors = [
        'bg-primary-500 dark:bg-primary-600',
        'bg-purple-500 dark:bg-purple-600',
        'bg-emerald-500 dark:bg-emerald-600',
        'bg-indigo-500 dark:bg-indigo-600'
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];

      return {
        id: i,
        style: {
          width: `${size}px`,
          height: `${size}px`,
          left: `${left}%`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          '--bubble-scale': scale.toFixed(2),
          filter: 'blur(0.5px)',
          bottom: '-40px',
        },
        className: `absolute rounded-full animate-bubble ${color}`,
      };
    });
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Premium ambient radial glows (visible in both light and dark modes) */}
      <div className="absolute top-[15%] left-[-10%] w-[35rem] h-[35rem] bg-primary-400/15 dark:bg-primary-950/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[10%] right-[-10%] w-[40rem] h-[40rem] bg-purple-400/15 dark:bg-purple-950/10 rounded-full blur-[120px]" />
      
      {/* Floating little balls */}
      {bubbles.map((bubble) => (
        <div key={bubble.id} className={bubble.className} style={bubble.style} />
      ))}
    </div>
  );
};

export default AnimatedBackground;
