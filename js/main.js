// main.js — entry point: fetch config, wire modules, handle intro

import { createAudioEngine } from './audio-engine.js';
import { createStemLoader } from './stem-loader.js';
import { createScrollController } from './scroll-controller.js';
import { initUI } from './ui.js';

const compositionId = new URLSearchParams(window.location.search).get('c') || 'ancient-wanderer';
const configUrl = `compositions/${compositionId}/config.json`;

async function boot() {
  const config = await fetch(configUrl).then(r => r.json());
  const engine = createAudioEngine(config);
  const loader = createStemLoader(engine, config);
  const ui = initUI(config, engine);
  const scroll = createScrollController(config, engine, loader, ui);

  // Wire controls
  document.getElementById('vol').addEventListener('input', e => {
    const wasMuted = engine.muted;
    const isMuted = engine.setMasterGain(e.target.value);
    if (wasMuted && !isMuted) {
      const b = document.getElementById('mute-btn');
      b.textContent = '\u266A'; b.style.color = 'var(--gold)'; b.setAttribute('aria-pressed', 'false');
    }
    ui.vis();
  });

  document.getElementById('mute-btn').addEventListener('click', () => {
    const isMuted = engine.toggleMute(document.getElementById('vol').value);
    const b = document.getElementById('mute-btn');
    if (isMuted) {
      b.textContent = '\u2715'; b.style.color = 'var(--text-dim)'; b.setAttribute('aria-pressed', 'true');
    } else {
      b.textContent = '\u266A'; b.style.color = 'var(--gold)'; b.setAttribute('aria-pressed', 'false');
    }
    ui.vis();
  });

  document.getElementById('as-btn').addEventListener('click', () => scroll.toggleAS());

  // Entry point — "Enter the World" button
  const introBtn = document.getElementById('intro-btn');
  introBtn.addEventListener('click', async () => {
    introBtn.disabled = true;
    await engine.init();

    // Load initial stems with progress
    let loaded = 0;
    const initialStems = config.rooms[0].stems;
    const nextStems = config.rooms.length > 1 ? config.rooms[1].stems : [];
    const allInitial = [...new Set([...initialStems, ...nextStems])];
    const total = allInitial.length;
    introBtn.textContent = 'Loading 0/' + total + '\u2026';

    await engine.loadStems(allInitial, () => {
      loaded++;
      introBtn.textContent = 'Loading ' + loaded + '/' + total + '\u2026';
    });

    engine.ready = true;

    // Close modal and start
    ui.closeModal();
    engine.setRoom(0);
    engine.startScheduler();
    scroll.startLock(0);
    scroll.start();
    ui.note('Journey begins');
  });
}

boot();
