import { METER_FLOOR_DB, meterSegments } from '@/lib/recorderHud';

// Mic level column for the recorder HUD. The level comes from useMicLevel so
// the recording's burned-in meter can show the same reading.
export function AudioMeter({ db, live }: { db: number; live: boolean }) {
  return (
    <div className="flex flex-col items-end gap-2" role="meter" aria-label="Microphone level" aria-valuemin={METER_FLOOR_DB} aria-valuemax={0} aria-valuenow={Math.round(db)}>
      <span className="text-[11px] tracking-[.18em] text-[rgba(242,238,230,.7)]">AUD.</span>
      <div className="flex flex-col gap-[3px]" aria-hidden="true">
        {meterSegments(db).map((color, n) => (
          <div
            key={n}
            className="h-1 w-5 rounded-[1px] transition-colors duration-100"
            style={{
              background: color ?? 'rgba(242,238,230,.14)',
              boxShadow: color ? `0 0 8px ${color}` : 'none',
            }}
          />
        ))}
      </div>
      <span className="text-[11px] tracking-[.1em] text-[rgba(242,238,230,.75)] tabular-nums">
        {live ? `${Math.round(db)} dB` : 'NO MIC'}
      </span>
    </div>
  );
}
