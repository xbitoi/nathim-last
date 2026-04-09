import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: '-10vw', filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Image of messy papers */}
      <motion.div 
        className="absolute inset-0"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.7 }}
        transition={{ duration: 4, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/messy-papers.png`} 
          alt="Messy factory papers" 
          className="w-full h-full object-cover mix-blend-screen grayscale-[20%]"
        />
        <div className="absolute inset-0 bg-[#001a33]/80 mix-blend-multiply" />
      </motion.div>

      <div className="relative z-10 w-full px-[10vw] flex flex-col items-center justify-center text-center">
        <motion.div
          className="relative inline-block mb-[3vh]"
          initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.8, rotate: -5 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="absolute inset-0 bg-[#FFB800] -rotate-2 rounded-sm" />
          <h2 className="relative text-[3vw] font-bold text-[#001a33] px-[2vw] py-[1vh] font-sans" dir="rtl">
            الشيمة الورقية:
          </h2>
        </motion.div>

        <motion.h1 
          className="text-[7vw] font-black text-white tracking-tight leading-none drop-shadow-2xl font-sans"
          dir="rtl"
        >
          {'فوضى لا نهاية لها'.split(' ').map((word, i) => (
            <motion.span 
              key={i} 
              className="inline-block mx-[1vw]"
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: phase >= 2 ? i * 0.15 : 0 }}
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>

        {/* Abstract lines representing confusion */}
        <div className="absolute inset-0 pointer-events-none -z-10 opacity-40">
          <motion.div 
            className="absolute top-1/4 left-[10%] w-[80%] h-[2px] bg-red-500"
            initial={{ scaleX: 0, originX: 0, rotate: 5 }}
            animate={phase >= 3 ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{ duration: 1, ease: "circOut" }}
          />
          <motion.div 
            className="absolute top-3/4 left-[15%] w-[70%] h-[2px] bg-red-500"
            initial={{ scaleX: 0, originX: 1, rotate: -3 }}
            animate={phase >= 3 ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{ duration: 1.2, ease: "circOut", delay: 0.2 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
