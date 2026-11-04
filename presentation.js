const video = document.querySelector('#presentation-video');
const quality = document.querySelector('#video-quality');
let pendingRestore;
quality.addEventListener('change', () => {
  const time = video.currentTime;
  const resume = !video.paused;
  video.pause();
  if (pendingRestore) video.removeEventListener('canplay', pendingRestore);
  video.src = quality.value;
  pendingRestore = () => {
    video.currentTime = Math.min(time, video.duration);
    if (resume) video.play().catch(() => {});
    pendingRestore = null;
  };
  video.addEventListener('canplay', pendingRestore, { once: true });
  video.load();
});
