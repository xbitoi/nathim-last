import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = { open: 3000, problem: 4000, solution: 5000, magic: 5000, close: 5000 };
const TOTAL_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

type RecordState = 'idle' | 'waiting' | 'recording' | 'converting' | 'done' | 'error';

export default function VideoTemplate() {
  const { currentScene, restart } = useVideoPlayer({ durations: SCENE_DURATIONS });

  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [errorMsg, setErrorMsg] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setRecordState('waiting');
      setCountdown(3);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } as any, audio: false });

      for (let i = 3; i >= 1; i--) {
        setCountdown(i);
        await new Promise(r => setTimeout(r, 1000));
      }
      restart();
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const webmBlob = new Blob(chunksRef.current, { type: mimeType });

        // Try server-side MP4 conversion
        setRecordState('converting');
        setProgress(0);
        try {
          const formData = new FormData();
          formData.append('video', webmBlob, 'recording.webm');

          const response = await fetch('/api/video/convert', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) throw new Error(`Server error ${response.status}`);

          const mp4Blob = await response.blob();
          const url = URL.createObjectURL(mp4Blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'yazaki-ai-video.mp4';
          a.click();
          URL.revokeObjectURL(url);
          setRecordState('done');
        } catch (convErr) {
          // Fallback: download the WebM directly
          console.warn('MP4 conversion failed, downloading WebM:', convErr);
          const url = URL.createObjectURL(webmBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'yazaki-ai-video.webm';
          a.click();
          URL.revokeObjectURL(url);
          setRecordState('done');
        }

        setProgress(0);
        setTimeout(() => setRecordState('idle'), 4000);
      };

      recorder.start(100);
      setRecordState('recording');

      const startTime = Date.now();
      const tick = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setProgress(Math.min((elapsed / TOTAL_MS) * 100, 100));
        if (elapsed >= TOTAL_MS) { clearInterval(tick); recorder.stop(); }
      }, 100);
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setErrorMsg('حدث خطأ في التسجيل');
        setTimeout(() => setErrorMsg(''), 3000);
      }
      setRecordState('idle');
      setProgress(0);
    }
  }, [restart]);

  const stopEarly = useCallback(() => { recorderRef.current?.stop(); }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#001a33] font-sans flex items-center justify-center">
      {/* Background Layer — data-flow video */}
      <div className="absolute inset-0 opacity-20 mix-blend-screen">
        <video src={`${import.meta.env.BASE_URL}videos/data-flow.mp4`} className="w-full h-full object-cover" autoPlay loop muted playsInline />
      </div>

      {/* Background Layer — factory-bg video */}
      <div className="absolute inset-0 opacity-15">
        <video src={`${import.meta.env.BASE_URL}videos/factory-bg.mp4`} className="w-full h-full object-cover mix-blend-overlay" autoPlay loop muted playsInline />
      </div>

      {/* Cinematic Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#001a33] via-transparent to-transparent opacity-80" />
      <div className="absolute inset-0 bg-[#003366]/30 mix-blend-multiply pointer-events-none" />

      {/* Persistent Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full opacity-20 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}
          animate={{ x: ['0%', '20%', '-10%', '0%'], y: ['0%', '10%', '-20%', '0%'], scale: [1, 1.2, 0.8, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full opacity-30 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #FFB800, transparent)' }}
          animate={{ x: ['0%', '-20%', '10%', '0%'], y: ['0%', '-10%', '20%', '0%'], scale: [1, 0.9, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Cross-scene persistent gold accent line */}
      <motion.div
        className="absolute h-[2px] bg-[#FFB800]"
        animate={{
          left: ['25%', '5%', '55%', '35%', '15%'][currentScene],
          width: ['50%', '90%', '25%', '60%', '40%'][currentScene],
          top: ['52%', '12%', '88%', '30%', '70%'][currentScene],
          opacity: currentScene === 0 ? 0 : 0.6,
        }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Scene Content */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="problem" />}
        {currentScene === 2 && <Scene3 key="solution" />}
        {currentScene === 3 && <Scene4 key="magic" />}
        {currentScene === 4 && <Scene5 key="close" />}
      </AnimatePresence>

      {/* ── Recording Controls ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">

        {recordState === 'waiting' && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-2">
            <div className="text-white/80 text-sm" style={{ fontFamily: 'Tajawal, sans-serif' }}>اختر علامة التبويب هذه في نافذة المشاركة...</div>
            <div className="text-6xl font-bold text-white">{countdown}</div>
          </motion.div>
        )}

        {recordState === 'recording' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-64">
            <div className="flex items-center gap-2 text-white text-sm" style={{ fontFamily: 'Tajawal, sans-serif' }}>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              جارٍ التسجيل...
              <span className="text-white/60">{Math.round((progress / 100) * (TOTAL_MS / 1000))}s / {TOTAL_MS / 1000}s</span>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div className="h-full bg-red-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <button onClick={stopEarly} className="text-xs text-white/50 hover:text-white/80 transition-colors" style={{ fontFamily: 'Tajawal, sans-serif' }}>إيقاف مبكر</button>
          </motion.div>
        )}

        {recordState === 'converting' && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-[#FFB800] text-sm font-medium" style={{ fontFamily: 'Tajawal, sans-serif' }}>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="inline-block"
              >⚙️</motion.span>
              جارٍ التحويل إلى MP4...
            </div>
            <div className="text-white/50 text-xs" style={{ fontFamily: 'Tajawal, sans-serif' }}>يرجى الانتظار</div>
          </motion.div>
        )}

        {recordState === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-green-400 text-sm font-medium" style={{ fontFamily: 'Tajawal, sans-serif' }}>
            ✅ تم تحميل الفيديو MP4!
          </motion.div>
        )}

        {recordState === 'error' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm" style={{ fontFamily: 'Tajawal, sans-serif' }}>
            ❌ {errorMsg}
          </motion.div>
        )}

        {recordState === 'idle' && (
          <motion.button
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
            onClick={startRecording}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-lg transition-all"
            style={{ background: 'rgba(239,68,68,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', fontFamily: 'Tajawal, sans-serif' }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            سجّل وحمّل MP4
          </motion.button>
        )}
      </div>
    </div>
  );
}
