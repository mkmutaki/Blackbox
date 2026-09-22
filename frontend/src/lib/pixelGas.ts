/**
 * pixelGas — a dithered, pixelated gas cloud rendered with a single WebGL
 * fragment shader.
 *
 * The cloud blooms in from the viewport edges, dissipates to nothing, then
 * blooms back — a seamless loop. Everything time-dependent is driven by one
 * phase angle derived from `cycleSeconds`, so the loop closes exactly and the
 * time uniform can be wrapped every cycle (no float drift on long sessions).
 *
 * Cost is kept low by rendering into a buffer that is `pixelSize` times
 * smaller than the canvas and letting CSS upscale it with
 * `image-rendering: pixelated` — that upscale is what produces the chunky
 * dither cells, so the look and the speed come from the same trick.
 *
 * Framework-agnostic on purpose; see components/PixelGasBackground.tsx for the
 * React wrapper.
 */

export interface PixelGasOptions {
  /** Colour of the sparse, low-density dither pixels. */
  baseColor?: string;
  /** Colour reached at the densest cores of the cloud. */
  coreColor?: string;
  /** Edge length of one dither cell, in CSS pixels. Bigger = chunkier + cheaper. */
  pixelSize?: number;
  /** Seconds for one full bloom → dissipate → bloom loop. */
  cycleSeconds?: number;
  /** Overall opacity, 0–1. */
  opacity?: number;
}

export interface PixelGasHandle {
  /** false when WebGL is unavailable — in that case nothing is drawn. */
  readonly supported: boolean;
  /** Apply new options without tearing down the GL context. */
  setOptions(next: PixelGasOptions): void;
  destroy(): void;
}

const DEFAULTS: Required<PixelGasOptions> = {
  baseColor: '#0F423A',
  coreColor: '#61FFED',
  pixelSize: 4,
  cycleSeconds: 10.5,
  opacity: 1,
};

/** How far the mid tone sits between base and core. */
const MID_BLEND = 0.42;

/** Phase used for the single static frame under prefers-reduced-motion. */
const STATIC_PHASE = 0.12;

const VERTEX_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;      // drawing-buffer size, in dither cells
uniform float uPhase;    // loop position, 0 .. 2*PI
uniform vec3  uBase;
uniform vec3  uMid;
uniform vec3  uCore;
uniform float uOpacity;

// ---------------------------------------------------------------- noise ---
// Hash without sin() — holds up on GPUs that only give us mediump.
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.03;
    amp *= 0.5;
  }
  return v;
}

// --------------------------------------------------------------- dither ---
// Ordered Bayer thresholds built by recursion instead of a lookup table —
// WebGL1 has no dynamic array indexing in fragment shaders.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / max(uRes.y, 1.0);

  // 1 = fully bloomed, 0 = fully dissipated. Shaped rather than a raw cosine:
  // the cloud lingers near full for most of the loop and goes completely clear
  // only for a beat around the midpoint, the way the reference does.
  float raw = 0.5 + 0.5 * cos(uPhase);
  float presence = pow(clamp((raw - 0.08) / 0.92, 0.0, 1.0), 0.60);

  // Where the gas is allowed to live: an elliptical clear zone sitting just
  // above centre, gas filling everything outside it. The ellipse is stretched
  // horizontally and squashed vertically, so the cloud packs against the left
  // and right edges at full height and leaves a readable column down the
  // middle. Distance is normalised by the ellipse's own corner reach, which
  // keeps the composition identical at every aspect ratio.
  const float X_STRETCH = 1.50;
  const float Y_STRETCH = 0.80;
  vec2 offset = vec2((uv.x - 0.5) * X_STRETCH, (uv.y - 0.55) * Y_STRETCH);
  float d = length(offset) / length(vec2(0.5 * X_STRETCH, 0.55 * Y_STRETCH));

  // Narrow viewports widen the clear zone, so a centred column of content stays
  // legible on a phone. Past presence 0 the zone swells beyond the corners and
  // the cloud is gone entirely.
  float narrow = clamp((1.40 - aspect) / 0.90, 0.0, 1.0);
  float inner = mix(0.92, mix(0.26, 0.44, narrow), presence);
  float field = smoothstep(inner, inner + 0.50, d);

  // The last of the cloud dissolves in place rather than only retracting —
  // retraction alone leaves a hard sliver clinging to the corners for most of
  // the way out, which reads as a wipe instead of gas thinning away.
  field *= smoothstep(0.0, 0.22, presence);

  // Domain-warped fbm supplies the churn. Both warp offsets orbit in noise
  // space at whole-number harmonics of uPhase, so the motion is exactly
  // periodic over one cycle.
  vec2 p = vec2(uv.x * aspect, uv.y) * 3.2;
  vec2 driftA = vec2(cos(uPhase), sin(uPhase)) * 0.60;
  vec2 driftB = vec2(cos(uPhase * 2.0 + 1.3), sin(uPhase * 2.0 + 1.3)) * 0.35;

  vec2 q = vec2(fbm(p + driftA),
                fbm(p + vec2(5.2, 1.3) - driftA));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + driftB),
                fbm(p + 3.0 * q + vec2(8.3, 2.8) - driftB));
  float n = fbm(p + 3.5 * r);

  float density = field * (0.30 + 1.30 * n);

  // Two decorrelated threshold grids: one decides whether a cell is lit at
  // all, the other quantises its colour. Coverage carries the sense of
  // density; the palette stays hard-edged rather than fading to a blur.
  // Thresholds land on (i + 0.5) / 64 rather than i / 64. Centring them keeps
  // the average coverage honest and, more importantly, stops the i = 0 cell
  // from passing step() against a density of exactly zero — which would
  // sprinkle one lit texel per tile across fully clear areas.
  const float CELL = 1.0 / 64.0;
  float b1 = bayer8(gl_FragCoord.xy) + 0.5 * CELL;
  float b2 = bayer8(gl_FragCoord.xy + vec2(3.0, 5.0)) + 0.5 * CELL;

  float lit = step(b1, density);
  // Ramp chosen so shade tops out short of 1.0: the core colour then shows up
  // only on the densest noise peaks, as an accent, instead of flooding every
  // cell where the field is saturated.
  float shade = clamp((density - 0.45) / 1.30, 0.0, 1.0);
  float cq = clamp(floor(shade * 3.0 + b2) / 3.0, 0.0, 1.0);

  vec3 col = mix(uBase, uMid, clamp(cq * 1.5, 0.0, 1.0));
  col = mix(col, uCore, smoothstep(0.66, 1.0, cq));

  float a = lit * uOpacity;
  gl_FragColor = vec4(col * a, a);   // premultiplied
}
`;

type Rgb = [number, number, number];

function hexToRgb(hex: string, fallback: Rgb): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  const int = parseInt(h, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('pixelGas: could not create shader');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`pixelGas: shader compile failed — ${log ?? 'unknown error'}`);
  }
  return shader;
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = gl.createProgram();
  if (!program) throw new Error('pixelGas: could not create program');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  // The shader objects are reference-counted by the program from here on.
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`pixelGas: program link failed — ${log ?? 'unknown error'}`);
  }
  return program;
}

function stripUndefined(source: PixelGasOptions): PixelGasOptions {
  const out: PixelGasOptions = {};
  (Object.keys(source) as Array<keyof PixelGasOptions>).forEach((key) => {
    if (source[key] !== undefined) (out as Record<string, unknown>)[key] = source[key];
  });
  return out;
}

const FALLBACK_BASE = hexToRgb(DEFAULTS.baseColor, [0, 0, 0]);
const FALLBACK_CORE = hexToRgb(DEFAULTS.coreColor, [1, 1, 1]);

const NOOP_HANDLE: PixelGasHandle = {
  supported: false,
  setOptions() {},
  destroy() {},
};

export function createPixelGas(
  canvas: HTMLCanvasElement,
  options: PixelGasOptions = {},
): PixelGasHandle {
  let opts: Required<PixelGasOptions> = { ...DEFAULTS, ...stripUndefined(options) };

  const gl = (canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
  }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

  if (!gl) return NOOP_HANDLE;

  let program: WebGLProgram | null = null;
  let quad: WebGLBuffer | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uPhase: WebGLUniformLocation | null = null;
  let uOpacity: WebGLUniformLocation | null = null;

  let raf = 0;
  let running = false;
  let destroyed = false;
  let contextLost = false;
  let phaseOffset = 0; // seconds of loop already elapsed before the current run
  let runStart = 0;

  const motionQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let reducedMotion = motionQuery?.matches ?? false;

  function pushColors() {
    if (!program) return;
    const base = hexToRgb(opts.baseColor, FALLBACK_BASE);
    const core = hexToRgb(opts.coreColor, FALLBACK_CORE);
    const mid = mixRgb(base, core, MID_BLEND);
    gl.useProgram(program);
    gl.uniform3fv(gl.getUniformLocation(program, 'uBase'), base);
    gl.uniform3fv(gl.getUniformLocation(program, 'uMid'), mid);
    gl.uniform3fv(gl.getUniformLocation(program, 'uCore'), core);
  }

  function init() {
    program = buildProgram(gl);
    gl.useProgram(program);

    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    // One oversized triangle covers the viewport with no seam down the middle.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uRes = gl.getUniformLocation(program, 'uRes');
    uPhase = gl.getUniformLocation(program, 'uPhase');
    uOpacity = gl.getUniformLocation(program, 'uOpacity');

    pushColors();
    gl.clearColor(0, 0, 0, 0);
    resize();
  }

  /** Size the drawing buffer to one texel per dither cell. */
  function resize() {
    const cell = Math.max(1, opts.pixelSize);
    const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const cssHeight = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    const width = Math.max(1, Math.ceil(cssWidth / cell));
    const height = Math.max(1, Math.ceil(cssHeight / cell));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    if (uRes) gl.uniform2f(uRes, width, height);
  }

  function draw(seconds: number) {
    if (!program || contextLost) return;
    const phase = ((seconds % opts.cycleSeconds) / opts.cycleSeconds) * Math.PI * 2;
    gl.useProgram(program);
    if (uPhase) gl.uniform1f(uPhase, phase);
    if (uOpacity) gl.uniform1f(uOpacity, Math.min(Math.max(opts.opacity, 0), 1));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawStatic() {
    resize();
    draw(opts.cycleSeconds * STATIC_PHASE);
  }

  function frame(now: number) {
    if (!running) return;
    draw(phaseOffset + (now - runStart) / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || destroyed || contextLost) return;
    if (reducedMotion) {
      drawStatic();
      return;
    }
    running = true;
    runStart = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    // Bank the elapsed loop position so resuming does not jump.
    phaseOffset = (phaseOffset + (performance.now() - runStart) / 1000) % opts.cycleSeconds;
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // ------------------------------------------------------------ listeners ---
  let resizeScheduled = false;
  const observer = new ResizeObserver(() => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      if (destroyed || contextLost) return;
      if (running) resize();
      else drawStatic();
    });
  });

  const onVisibility = () => {
    if (document.hidden) stop();
    else start();
  };

  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      stop();
      drawStatic();
    } else {
      start();
    }
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    stop();
  };

  const onContextRestored = () => {
    contextLost = false;
    if (destroyed) return;
    try {
      init();
      start();
    } catch {
      contextLost = true;
    }
  };

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  try {
    init();
  } catch (error) {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    if (import.meta.env.DEV) console.warn(error);
    return NOOP_HANDLE;
  }

  observer.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  motionQuery?.addEventListener('change', onMotionChange);
  start();

  return {
    supported: true,
    setOptions(next: PixelGasOptions) {
      if (destroyed) return;
      const previous = opts;
      opts = { ...opts, ...stripUndefined(next) };
      if (opts.baseColor !== previous.baseColor || opts.coreColor !== previous.coreColor) {
        pushColors();
      }
      if (opts.pixelSize !== previous.pixelSize) resize();
      if (!running) drawStatic();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery?.removeEventListener('change', onMotionChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (quad) gl.deleteBuffer(quad);
      if (program) gl.deleteProgram(program);
      quad = null;
      program = null;
      // Free the GPU context straight away rather than waiting on GC — SPA
      // routes mount and unmount this often, and browsers cap live contexts.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
