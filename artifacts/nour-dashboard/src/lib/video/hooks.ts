import { useEffect, useState, useCallback } from 'react';

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const durationValues = Object.values(durations);

  const restart = useCallback(() => {
    setCurrentScene(0);
    setEpoch(e => e + 1);
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const playScene = (index: number) => {
      setCurrentScene(index);

      const isLastScene = index === durationValues.length - 1;
      const nextIndex = isLastScene ? 0 : index + 1;

      timeout = setTimeout(() => {
        playScene(nextIndex);
      }, durationValues[index]);
    };

    playScene(0);

    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(durations), epoch]);

  return { currentScene, restart };
}
