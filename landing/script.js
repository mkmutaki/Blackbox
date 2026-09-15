// Terminal typing animation for the "what blackbox does" panel.
// Ported from the Claude Design mockup's inline script (same script, timing, and loop behavior).

const TERMINAL_SCRIPT = [
  ['record', 'Open the camera. Talk about your day. Sixty seconds is plenty.'],
  ['keep', 'It lands in your box, encrypted, out of everyone else’s reach.'],
  ['revisit', 'Scroll back through the ordinary days that turned out to matter.'],
  ['pass on', 'Choose who opens which entry, and when they get to.'],
];

const TYPE_SPEED_MS = 18; // ms per character for command lines
const CURSOR = '▍';

function buildTypingQueue(script) {
  const queue = [];
  script.forEach(([cmd, out]) => {
    queue.push({ prefix: '$', full: cmd, type: 'cmd', rate: TYPE_SPEED_MS });
    queue.push({ prefix: ' ', full: out, type: 'out', rate: Math.max(3, TYPE_SPEED_MS * 0.55) });
  });
  return queue;
}

function startTerminal(container) {
  const queue = buildTypingQueue(TERMINAL_SCRIPT);
  let currentLineEl = null;

  function addLine(prefix, type) {
    const row = document.createElement('div');
    row.className = 'terminal__line';

    const prefixEl = document.createElement('span');
    prefixEl.className = 'terminal__prefix';
    prefixEl.textContent = prefix;

    const textEl = document.createElement('span');
    textEl.className = type === 'cmd' ? 'terminal__text--cmd' : 'terminal__text--out';

    row.append(prefixEl, textEl);
    container.appendChild(row);
    return textEl;
  }

  function step(index, charCount) {
    if (index >= queue.length) {
      setTimeout(() => {
        container.innerHTML = '';
        step(0, 0);
      }, 7000);
      return;
    }

    const line = queue[index];
    if (charCount === 0) currentLineEl = addLine(line.prefix, line.type);

    const done = charCount >= line.full.length;
    currentLineEl.textContent = line.full.slice(0, charCount) + (done ? '' : CURSOR);

    if (done) {
      setTimeout(() => step(index + 1, 0), line.type === 'cmd' ? 260 : 700);
    } else {
      setTimeout(() => step(index, charCount + 1), line.rate);
    }
  }

  setTimeout(() => step(0, 0), 400);
}

document.addEventListener('DOMContentLoaded', () => {
  const terminal = document.getElementById('terminal-body');
  if (terminal) startTerminal(terminal);
});
