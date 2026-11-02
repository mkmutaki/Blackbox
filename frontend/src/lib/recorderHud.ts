// Shared bits of the recorder HUD: the values the on-screen HUD shows, and
// the canvas version of it that gets burned into every recording. The two
// are laid out on the same 1440×900 grid so a saved entry looks like what
// the user saw while recording.

export const MAX_RECORDING_SECONDS = 10 * 60;
// A heads-up this long before the cap, since no timer is shown while recording.
export const CAP_WARNING_SECONDS = 30;

export const METER_SEGMENTS = 20;
export const METER_FLOOR_DB = -60;

export const HUD_COLORS = {
  text: '#F2EEE6',
  dim: 'rgba(242,238,230,.66)',
  tick: 'rgba(242,238,230,.7)',
  rec: '#FF5A45',
  recRail: 'rgba(255,110,90,.85)',
  accent: '#64FFDA',
};

export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/** Mic meter segments, top first: a colour when lit, null when not. The top
 *  ones go amber, then red, as the level nears clipping. */
export const meterSegments = (db: number) => {
  const lit = Math.round(((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * METER_SEGMENTS);
  return Array.from({ length: METER_SEGMENTS }, (_, n) => {
    const i = METER_SEGMENTS - 1 - n;
    const color = i >= 17 ? '#FF6B4A' : i >= 14 ? '#F2C14E' : HUD_COLORS.accent;
    return i < lit ? color : null;
  });
};

/** "FaceTime HD Camera (05ac:8514)" → "FACETIME HD CAMERA" */
export const cleanDeviceLabel = (label: string | undefined) =>
  (label || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim().toUpperCase();

export type RecorderHudState = {
  missionDay: number;
  year: number;
  currentTime: string; // HHMM
  logNumber: string;
  username: string;
  cameraLabel: string;
  micLabel: string;
  micDb: number;
  micLive: boolean;
  stamp: string;
};

const MONO = '"Space Mono", ui-monospace, monospace';
const GRID_W = 1440;
const GRID_H = 900;

const setSpacing = (ctx: CanvasRenderingContext2D, em: number) => {
  // letterSpacing is missing from older Safari; the HUD still reads without it.
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${em}em`;
  }
};

// Soft warm glow first, then a tight dark shadow so text holds up on bright frames.
const hudText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
  ctx.shadowColor = 'rgba(255,236,214,.28)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 0;
  ctx.fillText(text, x, y);
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillText(text, x, y);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
};

// Letter spacing also trails the last glyph; leave it out when centring.
const inkWidth = (ctx: CanvasRenderingContext2D, text: string, size: number, em: number) =>
  ctx.measureText(text).width - ('letterSpacing' in ctx ? size * em : 0);

// Baseline that puts the cap height of `sample` dead centre in a cell.
const centredBaseline = (ctx: CanvasRenderingContext2D, sample: string, top: number, cellH: number) => {
  const m = ctx.measureText(sample);
  return top + (cellH + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
};

const drawSynodicChip = (ctx: CanvasRenderingContext2D, day: number, year: number) => {
  const x = 64;
  const y = 30;
  const h = 41;
  const label = 'SYNODIC';
  const value = `${day}, ${year}`;

  ctx.font = `700 13px ${MONO}`;
  setSpacing(ctx, 0.18);
  const labelInk = inkWidth(ctx, label, 13, 0.18);
  const labelW = labelInk + 24;
  ctx.font = `700 26px ${MONO}`;
  setSpacing(ctx, 0.02);
  const valueInk = inkWidth(ctx, value, 26, 0.02);
  const valueW = valueInk + 28;

  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(12,10,8,.5)';
  ctx.strokeStyle = 'rgba(242,238,230,.16)';
  ctx.beginPath();
  ctx.roundRect(x, y, labelW + valueW, h, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(100,255,218,.14)';
  ctx.beginPath();
  ctx.roundRect(x, y, labelW, h, [4, 0, 0, 4]);
  ctx.fill();
  ctx.fillStyle = 'rgba(100,255,218,.35)';
  ctx.fillRect(x + labelW, y, 1, h);

  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 13px ${MONO}`;
  setSpacing(ctx, 0.18);
  ctx.fillStyle = HUD_COLORS.accent;
  hudText(ctx, label, x + (labelW - labelInk) / 2, centredBaseline(ctx, label, y, h));

  ctx.font = `700 26px ${MONO}`;
  setSpacing(ctx, 0.02);
  ctx.fillStyle = HUD_COLORS.text;
  // Digits, not the value itself, so the comma's tail doesn't pull it upward.
  hudText(ctx, value, x + labelW + (valueW - valueInk) / 2, centredBaseline(ctx, '0', y, h));
  ctx.textBaseline = 'top';
};

/**
 * Draws the HUD over a frame already on the canvas. Everything is placed on a
 * 1440×900 grid scaled to fit inside the frame, so portrait and landscape
 * cameras both keep the whole HUD on screen.
 */
export const drawRecorderHud = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RecorderHudState,
) => {
  const s = Math.min(width / GRID_W, height / GRID_H);
  const W = width / s;
  const H = height / s;

  ctx.save();
  ctx.scale(s, s);
  ctx.textBaseline = 'top';

  // Rails, tinted while recording, never thinner than 2 real pixels.
  const rail = Math.max(2, 2 / s);
  ctx.fillStyle = HUD_COLORS.recRail;
  ctx.fillRect(40, 40, rail, H - 80);
  ctx.fillRect(W - 40 - rail, 40, rail, H - 80);
  ctx.fillStyle = HUD_COLORS.tick;
  ctx.fillRect(40, 40, 10, 1);
  ctx.fillRect(40, H - 41, 10, 1);
  ctx.fillRect(W - 50, 40, 10, 1);
  ctx.fillRect(W - 50, H - 41, 10, 1);

  // Crosshair ticks at mid-height.
  ctx.strokeStyle = 'rgba(242,238,230,.75)';
  ctx.lineWidth = 1.5;
  const cy = H / 2;
  const lx = 196 + 12;
  const rx = W - 196 - 12;
  ctx.beginPath();
  ctx.moveTo(lx, cy - 10); ctx.lineTo(lx, cy - 3);
  ctx.moveTo(lx, cy + 3); ctx.lineTo(lx, cy + 10);
  ctx.moveTo(lx - 10, cy); ctx.lineTo(lx - 3, cy);
  ctx.moveTo(rx, cy - 10); ctx.lineTo(rx, cy - 3);
  ctx.moveTo(rx, cy + 3); ctx.lineTo(rx, cy + 10);
  ctx.moveTo(rx + 3, cy); ctx.lineTo(rx + 10, cy);
  ctx.stroke();

  // Top left: SYNODIC chip.
  drawSynodicChip(ctx, state.missionDay, state.year);

  // Top right: time, log entry, camera + mic.
  ctx.fillStyle = HUD_COLORS.text;
  ctx.textAlign = 'right';
  const right = W - 64;
  ctx.font = `700 22px ${MONO}`;
  setSpacing(ctx, 0.04);
  hudText(ctx, `TIME ${state.currentTime.slice(0, 2)}:${state.currentTime.slice(2, 4)}`, right, 30);
  ctx.font = `400 16px ${MONO}`;
  setSpacing(ctx, 0.06);
  hudText(ctx, `LOG ENTRY #${state.logNumber} > ${state.username}`, right, 66);

  const camRight = right - 27;
  ctx.font = `400 15px ${MONO}`;
  setSpacing(ctx, 0);
  ctx.fillStyle = 'rgba(242,238,230,.8)';
  hudText(ctx, '←', right, 124);
  ctx.fillStyle = HUD_COLORS.text;
  ctx.font = `700 18px ${MONO}`;
  setSpacing(ctx, 0.06);
  hudText(ctx, 'CAM. 1', camRight, 122);
  ctx.font = `400 11px ${MONO}`;
  setSpacing(ctx, 0.14);
  ctx.fillStyle = HUD_COLORS.dim;
  if (state.cameraLabel) hudText(ctx, state.cameraLabel, camRight, 148);
  if (state.micLabel) hudText(ctx, `MIC. ${state.micLabel}`, camRight, 166);

  // Right, mid-height: mic level.
  const meterTop = H / 2 - 100;
  ctx.font = `400 11px ${MONO}`;
  setSpacing(ctx, 0.18);
  ctx.fillStyle = 'rgba(242,238,230,.7)';
  hudText(ctx, 'AUD.', right, meterTop);
  const segTop = meterTop + 24;
  meterSegments(state.micDb).forEach((color, n) => {
    ctx.fillStyle = color ?? 'rgba(242,238,230,.14)';
    if (color) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.roundRect(right - 20, segTop + n * 7, 20, 4, 1);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  });
  setSpacing(ctx, 0.1);
  ctx.fillStyle = 'rgba(242,238,230,.75)';
  hudText(ctx, state.micLive ? `${Math.round(state.micDb)} dB` : 'NO MIC', right, segTop + METER_SEGMENTS * 7 + 5);

  // Left, mid-height: encryption.
  ctx.textAlign = 'left';
  const encX = 64 + 25;
  const encTop = H / 2 - 40;
  ctx.fillStyle = HUD_COLORS.text;
  ctx.font = `700 17px ${MONO}`;
  setSpacing(ctx, 0);
  hudText(ctx, 'ENC.', encX, encTop);
  hudText(ctx, 'ON', encX, encTop + 26);
  ctx.font = `400 10px ${MONO}`;
  setSpacing(ctx, 0.16);
  ctx.fillStyle = 'rgba(242,238,230,.6)';
  hudText(ctx, 'PRIVATE ENTRY', encX, encTop + 52);

  // Bottom left: connection stamp.
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = 'rgba(242,238,230,.8)';
  setSpacing(ctx, 0.08);
  hudText(ctx, `CONNECTED-${state.stamp}`, 64, H - 44);

  ctx.restore();
};
