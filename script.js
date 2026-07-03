const FRAME_COUNT = 240;
const INITIAL_BATCH = 24;
const framePath = (index) => `assets/frames/frame_${String(index).padStart(6, "0")}.jpg`;

const sequence = document.querySelector(".sequence");
const canvas = document.querySelector("#watch-canvas");
const context = canvas.getContext("2d", { alpha: false });
const loader = document.querySelector("#loader");
const loadingBar = document.querySelector("#loading-bar");
const loadingCount = document.querySelector("#loading-count");
const progressBar = document.querySelector("#progress-bar");
const frameCounter = document.querySelector("#frame-counter");
const scrollCue = document.querySelector("#scroll-cue");
const chapters = [...document.querySelectorAll(".chapter")];
const images = new Array(FRAME_COUNT);
const loaded = new Set();

let targetFrame = 0;
let renderedFrame = -1;
let rafPending = false;

function loadFrame(index) {
  if (images[index]) return Promise.resolve(images[index]);
  return new Promise((resolve) => {
    const image = new Image();
    images[index] = image;
    image.decoding = "async";
    image.onload = () => {
      loaded.add(index);
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = framePath(index);
  });
}

function closestLoaded(index) {
  if (loaded.has(index)) return index;
  for (let distance = 1; distance < FRAME_COUNT; distance += 1) {
    if (index - distance >= 0 && loaded.has(index - distance)) return index - distance;
    if (index + distance < FRAME_COUNT && loaded.has(index + distance)) return index + distance;
  }
  return 0;
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  renderedFrame = -1;
  renderFrame();
}

function drawCover(image) {
  if (!image || !image.naturalWidth) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = cw / ch;
  let width;
  let height;

  if (canvasRatio > imageRatio) {
    width = cw;
    height = width / imageRatio;
  } else {
    height = ch;
    width = height * imageRatio;
  }

  context.fillStyle = "#080705";
  context.fillRect(0, 0, cw, ch);
  context.drawImage(image, (cw - width) / 2, (ch - height) / 2, width, height);
}

function renderFrame() {
  rafPending = false;
  const displayFrame = closestLoaded(targetFrame);
  if (displayFrame === renderedFrame) return;
  renderedFrame = displayFrame;
  drawCover(images[displayFrame]);
}

function queueRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(renderFrame);
}

function updateChapters(progress) {
  chapters.forEach((chapter) => {
    const start = Number(chapter.dataset.start);
    const end = Number(chapter.dataset.end);
    const edge = Math.min(0.025, (end - start) / 4);
    const active = progress >= start + edge && progress <= end - edge;
    chapter.classList.toggle("is-visible", active);
  });
}

function updateFromScroll() {
  const rect = sequence.getBoundingClientRect();
  const distance = sequence.offsetHeight - window.innerHeight;
  const progress = Math.max(0, Math.min(1, -rect.top / distance));
  targetFrame = Math.round(progress * (FRAME_COUNT - 1));
  frameCounter.textContent = String(targetFrame + 1).padStart(3, "0");
  progressBar.style.width = `${progress * 100}%`;
  scrollCue.style.opacity = progress > 0.035 ? "0" : "1";
  updateChapters(progress);
  queueRender();

  for (let offset = 1; offset <= 5; offset += 1) {
    const nearby = targetFrame + offset;
    if (nearby < FRAME_COUNT && !images[nearby]) loadFrame(nearby);
  }
}

async function preloadInitialFrames() {
  await loadFrame(0);
  resizeCanvas();

  const initialIndexes = Array.from({ length: INITIAL_BATCH }, (_, i) =>
    Math.round((i / (INITIAL_BATCH - 1)) * (FRAME_COUNT - 1))
  );

  let complete = 0;
  await Promise.all(
    initialIndexes.map((index) =>
      loadFrame(index).then(() => {
        complete += 1;
        const percent = Math.round((complete / INITIAL_BATCH) * 100);
        loadingBar.style.width = `${percent}%`;
        loadingCount.textContent = `${percent}%`;
      })
    )
  );

  loader.classList.add("is-hidden");
  updateFromScroll();
  preloadRemainingFrames();
}

async function preloadRemainingFrames() {
  const queue = Array.from({ length: FRAME_COUNT }, (_, index) => index).filter((index) => !images[index]);
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const index = queue.shift();
      await loadFrame(index);
      if (index === targetFrame) queueRender();
    }
  });
  await Promise.all(workers);
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    });
  },
  { threshold: 0.18 }
);
document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

window.addEventListener("scroll", updateFromScroll, { passive: true });
window.addEventListener("resize", resizeCanvas);
preloadInitialFrames();
