import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm z-0" />

      <div className="relative z-10 text-center px-[10vw]">
        {/* Abstract shape representing chaos/problem */}
        <motion.div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] border-[1px] border-white/10 rounded-full"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={phase >= 1 ? { scale: 1, opacity: 1, rotate: 180 } : { scale: 0.5, opacity: 0, rotate: 0 }}
          transition={{ duration: 3, ease: "easeOut" }}
        />
        
        <motion.h1 
          className="text-[6vw] font-black text-white tracking-tight leading-tight drop-shadow-2xl font-sans text-center"
          dir="rtl"
        >
          {'ساعات ضائعة في البحث'.split(' ').map((word, i) => (
            <motion.span 
              key={i} 
              className="inline-block mx-[1vw]"
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={phase >= 2 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 40, filter: 'blur(10px)' }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: phase >= 2 ? i * 0.15 : 0 }}
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>

        <motion.div
          className="mt-[4vh] w-[4vw] h-[4vw] border-b-2 border-r-2 border-[#FFB800] mx-auto opacity-50"
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 3 ? { opacity: 0.5, y: 0, rotate: 45 } : { opacity: 0, y: -20, rotate: 45 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
