import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, filter: 'blur(20px)', scale: 1.1 }}
      animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#001a33]/80 backdrop-blur-lg z-0" />

      <div className="flex flex-col items-center justify-center relative z-10 w-full px-[5vw]">
        {/* Glow */}
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] bg-[#FFB800]/10 blur-[100px] rounded-full pointer-events-none"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 2, ease: "easeOut" }}
        />

        <motion.div
          className="mb-[4vh] relative"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
        >
          <h1 className="text-[6vw] font-black text-white tracking-tight leading-none drop-shadow-2xl font-mono relative z-10 text-center uppercase">
            Yazaki AI Table Reader
          </h1>
          <motion.div 
            className="absolute -bottom-[2vh] left-1/2 -translate-x-1/2 h-[4px] bg-[#FFB800]"
            initial={{ width: 0 }}
            animate={phase >= 2 ? { width: '100%' } : { width: 0 }}
            transition={{ duration: 1, ease: "circOut" }}
          />
        </motion.div>

        <motion.h2 
          className="text-[3.5vw] font-medium text-[#FFB800] mt-[2vh] text-center font-sans drop-shadow-md"
          dir="rtl"
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={phase >= 3 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 20, filter: 'blur(10px)' }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          حيث تنتهي حيرة الورق، ويبدأ يقين الرقم
        </motion.h2>
      </div>
    </motion.div>
  );
}
