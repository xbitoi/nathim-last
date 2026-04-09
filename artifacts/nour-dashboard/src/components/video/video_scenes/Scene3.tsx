import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.5, filter: 'blur(20px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-md z-0" />
      
      {/* Central glow */}
      <motion.div 
        className="absolute w-[50vw] h-[50vw] bg-[#FFB800]/20 rounded-full blur-[100px] mix-blend-screen"
        initial={{ scale: 0, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full px-[10vw]">
        
        {/* Abstract Camera / Flash symbol */}
        <motion.div
          className="relative w-[12vw] h-[12vw] mb-[4vh] flex items-center justify-center"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="absolute inset-0 border-4 border-[#FFB800]/50 rounded-[2vw]" />
          <motion.div 
            className="w-[4vw] h-[4vw] bg-[#FFB800] rounded-full"
            initial={{ scale: 0 }}
            animate={phase >= 2 ? { scale: [0, 1.5, 1], opacity: [1, 1, 0.8] } : { scale: 0 }}
            transition={{ duration: 0.6 }}
          />
          {/* Flash Effect */}
          {phase >= 2 && (
            <motion.div 
              className="absolute inset-[-50vw] bg-white z-50 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
        </motion.div>

        <motion.h1 
          className="text-[5.5vw] font-black text-white tracking-tight leading-tight drop-shadow-2xl font-sans"
          dir="rtl"
        >
          {'صوّر. ارفع. احصل على كل شيء في ثوانٍ'.split(' ').map((word, i) => (
            <motion.span 
              key={i} 
              className="inline-block mx-[0.5vw]"
              initial={{ opacity: 0, y: 40, rotateX: -45 }}
              animate={phase >= 3 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -45 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: phase >= 3 ? i * 0.1 : 0 }}
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>

        {/* Abstract Data points rising */}
        {phase >= 4 && (
           <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
             {[...Array(20)].map((_, i) => (
               <motion.div
                 key={i}
                 className="absolute bottom-[-10%] w-[2px] bg-[#FFB800]/50"
                 style={{ left: `${Math.random() * 100}%`, height: `${Math.random() * 20 + 10}vh` }}
                 initial={{ y: 0, opacity: 0 }}
                 animate={{ y: '-120vh', opacity: [0, 1, 0] }}
                 transition={{ duration: Math.random() * 2 + 1.5, repeat: Infinity, delay: Math.random() }}
               />
             ))}
           </div>
        )}
      </div>
    </motion.div>
  );
}
