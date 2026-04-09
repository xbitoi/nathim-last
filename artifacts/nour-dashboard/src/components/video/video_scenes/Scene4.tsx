import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1700),
      setTimeout(() => setPhase(4), 2600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const features = [
    "بيانات دقيقة",
    "وصول فوري",
    "إنتاج بلا توقف"
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: '-10vw', filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 flex">
        {/* Left half: Digital data image */}
        <motion.div 
          className="w-[45%] h-full relative"
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/digital-data.png`} 
            alt="Digital Data" 
            className="w-full h-full object-cover mix-blend-screen opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#001a33]" />
        </motion.div>
        {/* Right half background */}
        <div className="w-[55%] h-full bg-[#001a33]/90 backdrop-blur-md" />
      </div>

      <div className="absolute right-[10vw] top-1/2 -translate-y-1/2 w-[40vw] flex flex-col items-end text-right z-20">
        <motion.div
          className="w-[3vw] h-[3vw] border-t-4 border-l-4 border-[#FFB800] mb-8"
          initial={{ opacity: 0, scale: 0 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        />

        <div className="flex flex-col gap-[3vh]">
          {features.map((text, i) => (
            <motion.div 
              key={text}
              className="flex items-center justify-end gap-[1.5vw]"
              initial={{ opacity: 0, x: 50 }}
              animate={phase >= i + 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <h2 className="text-[4vw] font-bold text-white tracking-tight font-sans" dir="rtl">
                {text}
              </h2>
              <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-[#FFB800]" />
            </motion.div>
          ))}
        </div>
        
        <motion.div
          className="w-full h-[2px] bg-gradient-to-l from-[#FFB800] to-transparent mt-[6vh]"
          initial={{ scaleX: 0, originX: 1 }}
          animate={phase >= 4 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 1, ease: "circOut" }}
        />
      </div>
    </motion.div>
  );
}
