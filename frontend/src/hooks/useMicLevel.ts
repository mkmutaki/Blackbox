import { useEffect, useState } from 'react';
import { METER_FLOOR_DB } from '@/lib/recorderHud';

// Live mic level in dBFS, so the recorder can show the mic works before the
// user presses record. Measured in the browser only; nothing is kept.
export const useMicLevel = (stream: MediaStream | null) => {
  const [db, setDb] = useState(METER_FLOOR_DB);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setDb(METER_FLOOR_DB);
      return;
    }

    const audioCtx = new AudioContext();
    audioCtx.resume().catch(() => {});
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      const next = rms > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(rms)) : METER_FLOOR_DB;
      setDb(prev => prev + (next - prev) * 0.5);
    }, 120);

    return () => {
      clearInterval(id);
      source.disconnect();
      audioCtx.close().catch(() => {});
    };
  }, [stream]);

  return db;
};
