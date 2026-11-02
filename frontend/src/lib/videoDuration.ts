// MediaRecorder writes WebM without a duration in its header, so Chrome
// reports `duration` as Infinity and its scrubber guesses, running well ahead
// of the picture. Seeking far past the end makes the browser read to the last
// frame and learn the real length; then we jump back to the start.
// Call it once metadata has loaded. Resolves with the length in seconds, or
// NaN if the browser never works it out.
export const resolveVideoDuration = (video: HTMLVideoElement, timeoutMs = 4000): Promise<number> =>
  new Promise((resolve) => {
    if (Number.isFinite(video.duration)) {
      resolve(video.duration);
      return;
    }

    const finish = () => {
      clearTimeout(timer);
      video.removeEventListener('durationchange', onChange);
      video.removeEventListener('timeupdate', onChange);
      video.currentTime = 0;
      resolve(Number.isFinite(video.duration) ? video.duration : NaN);
    };
    const onChange = () => {
      if (Number.isFinite(video.duration)) finish();
    };
    const timer = setTimeout(finish, timeoutMs);

    video.addEventListener('durationchange', onChange);
    video.addEventListener('timeupdate', onChange);
    video.currentTime = Number.MAX_SAFE_INTEGER;
  });
