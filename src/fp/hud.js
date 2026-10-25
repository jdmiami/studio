// HUD overlay (DOM): hearts, level bar and stamina ring (top left); compass strip, quest tracker
// and timer (top right); minimap (bottom left); key prompts (bottom center).
const CSS = `
.hud { position: fixed; inset: 0; pointer-events: none; font-family: Nunito, 'Trebuchet MS', system-ui, sans-serif;
  color: #fff8ef; text-shadow: 0 1px 2px rgba(40, 25, 20, 0.55); user-select: none; }
.hud-panel { position: absolute; background: rgba(48, 36, 32, 0.42); border-radius: 12px; backdrop-filter: blur(2px); }
.hud-vitals { top: 14px; left: 14px; padding: 8px 12px 8px 12px; display: flex; gap: 12px; align-items: center; }
.hud-hearts { display: flex; gap: 3px; }
.hud-heart { width: 20px; height: 18px; }
.hud-level { margin-top: 6px; display: flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: 1.5px; font-weight: 700; }
.hud-bar { width: 130px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.22); overflow: hidden; }
.hud-bar > div { height: 100%; background: linear-gradient(90deg, #7fd1c8, #a8e6d8); border-radius: 4px; }
.hud-ring { width: 44px; height: 44px; }
.hud-topright { top: 14px; right: 14px; width: 320px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; background: none; }
.hud-compass { background: rgba(48, 36, 32, 0.42); border-radius: 10px; }
.hud-quest-title { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; color: #ffd27a; }
.hud-quest { font-size: 13px; font-weight: 800; letter-spacing: 0.6px; text-align: right; }
.hud-timer { font-size: 13px; font-weight: 700; padding: 3px 10px; border-radius: 10px; background: rgba(48, 36, 32, 0.42); }
.hud-minimap { left: 14px; bottom: 14px; padding: 6px; }
.hud-prompts { position: absolute; left: 50%; bottom: 46px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.hud-chip { font-size: 15px; font-weight: 700; padding: 5px 14px; border-radius: 9px; background: rgba(48, 36, 32, 0.55); }
.hud-toast { position: absolute; top: 34%; left: 50%; transform: translateX(-50%); font-size: 18px; font-weight: 800;
  padding: 10px 18px; border-radius: 12px; background: rgba(48, 36, 32, 0.6); opacity: 0; transition: opacity 0.4s; }
.hud-start { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: 800;
  padding: 12px 20px; border-radius: 12px; background: rgba(48, 36, 32, 0.6); text-align: center; line-height: 1.6; }
`;

function heartSvg(fill) {
  // fill: 1 full, 0.5 half, 0 empty
  const id = `h${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="hud-heart" viewBox="0 0 24 22"><defs><linearGradient id="${id}">
    <stop offset="${fill * 100}%" stop-color="#f6a46b"/><stop offset="${fill * 100}%" stop-color="rgba(40,28,26,0.55)"/>
    </linearGradient></defs><path d="M12 21s-9-5.8-9-12.2C3 5.6 5.4 3 8.4 3c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2C18.6 3 21 5.6 21 8.8 21 15.2 12 21 12 21z"
    fill="url(#${id})" stroke="#fbe3cf" stroke-width="1.4"/></svg>`;
}

export function createHud({ columns, interactables, shot }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-panel hud-vitals">
      <div>
        <div class="hud-hearts"></div>
        <div class="hud-level">LEVEL <div class="hud-bar"><div style="width:46%"></div></div></div>
      </div>
      <svg class="hud-ring" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="5"/>
        <circle class="hud-ring-fill" cx="22" cy="22" r="18" fill="none" stroke="#8fd3a0" stroke-width="5"
          stroke-linecap="round" transform="rotate(-90 22 22)" stroke-dasharray="113" stroke-dashoffset="30"/>
        <path d="M22 12c3 4 6 6 6 11a6 6 0 0 1-12 0c0-2 1-4 2-5 0 2 1 3 2 3 0-4 1-6 2-9z" fill="#8fd3a0"/>
      </svg>
    </div>
    <div class="hud-panel hud-topright">
      <canvas class="hud-compass" width="300" height="30"></canvas>
      <div class="hud-quest-title">QUEST TRACKER</div>
      <div class="hud-quest">INVESTIGATE THE GREAT CAVE DOOR (0/1)</div>
      <div class="hud-timer">⏱ 15:00</div>
    </div>
    <div class="hud-panel hud-minimap"><canvas width="128" height="128"></canvas></div>
    <div class="hud-prompts"></div>
    <div class="hud-toast"></div>
    <div class="hud-start">Click to look around<br>WASD to move · Shift to run · Space to jump · E to interact</div>
  `;
  document.body.appendChild(root);

  const hearts = root.querySelector('.hud-hearts');
  const ringFill = root.querySelector('.hud-ring-fill');
  const compass = root.querySelector('.hud-compass');
  const cctx = compass.getContext('2d');
  const questEl = root.querySelector('.hud-quest');
  const timerEl = root.querySelector('.hud-timer');
  const minimap = root.querySelector('.hud-minimap canvas');
  const mctx = minimap.getContext('2d');
  const prompts = root.querySelector('.hud-prompts');
  const toast = root.querySelector('.hud-toast');
  const start = root.querySelector('.hud-start');

  const health = 3.5;
  hearts.innerHTML = Array.from({ length: 10 }, (_, i) => heartSvg(Math.max(0, Math.min(1, health - i)))).join('');
  if (shot) start.style.display = 'none';
  document.addEventListener('pointerlockchange', () => {
    start.style.display = document.pointerLockElement ? 'none' : '';
  });

  // Static minimap terrain, drawn once from the level grid.
  const terrain = document.createElement('canvas');
  terrain.width = terrain.height = 128;
  const tctx = terrain.getContext('2d');
  const cell = 128 / 17;
  const toMap = (x, z) => [(x + 8.5) * cell, (z + 13.5) * cell * 0.82];
  for (const [k, col] of columns) {
    const [x, z] = k.split(',').map(Number);
    const [px, py] = toMap(x, z);
    tctx.fillStyle = col.kind === 'water' || col.kind === 'stream' ? '#6f9fd9'
      : col.kind === 'floor' ? '#e7cfc2'
        : col.top >= 7 ? '#5a4a43'
          : col.top >= 1 ? '#8fb877' : '#c7a497';
    tctx.fillRect(px, py, cell + 0.5, cell * 0.82 + 0.5);
  }

  const doorTarget = interactables.find((i) => i.id === 'door').position;
  let questDone = false;
  let shownRunHint = true;
  let stamina = 1;
  let frame = 0;
  let toastTimer = 0;

  function showToast(text) {
    toast.textContent = text;
    toast.style.opacity = '1';
    toastTimer = 3.5;
  }

  function drawCompass(heading, doorBearing) {
    const w = compass.width;
    const h = compass.height;
    cctx.clearRect(0, 0, w, h);
    const span = 120; // degrees visible
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    cctx.textAlign = 'center';
    for (let d = -180; d <= 540; d += 15) {
      const rel = ((d - heading + 540) % 360) - 180;
      if (Math.abs(rel) > span / 2) continue;
      const x = w / 2 + (rel / span) * w;
      const deg = ((d % 360) + 360) % 360;
      if (labels[deg] !== undefined) {
        cctx.fillStyle = '#fff8ef';
        cctx.font = '700 11px Nunito, Trebuchet MS, sans-serif';
        cctx.fillText(labels[deg], x, 20);
      } else {
        cctx.fillStyle = 'rgba(255,248,239,0.7)';
        cctx.fillRect(x - 0.5, 10, 1, 8);
      }
    }
    const rel = ((doorBearing - heading + 540) % 360) - 180;
    if (Math.abs(rel) <= span / 2) {
      const x = w / 2 + (rel / span) * w;
      cctx.fillStyle = '#ffd27a';
      cctx.beginPath();
      cctx.moveTo(x, 3); cctx.lineTo(x - 4, 9); cctx.lineTo(x + 4, 9);
      cctx.fill();
    }
    cctx.fillStyle = '#fff8ef';
    cctx.fillRect(w / 2 - 1, 0, 2, h);
  }

  return {
    showToast,
    /** Returns the interactable in range, if any, so the caller can react to E. */
    update({ dt, yaw, position, running, moving, timeLeft }) {
      frame++;
      const heading = ((-yaw * 180) / Math.PI % 360 + 360) % 360;
      const doorBearing = ((Math.atan2(doorTarget.x - position.x, -(doorTarget.z - position.z)) * 180) / Math.PI + 360) % 360;
      drawCompass(heading, doorBearing);

      stamina = Math.max(0, Math.min(1, stamina + (running && moving ? -0.25 : 0.15) * dt));
      ringFill.setAttribute('stroke-dashoffset', String(113 * (1 - (shot ? 0.74 : stamina))));

      const t = Math.max(0, timeLeft);
      timerEl.textContent = `⏱ ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

      if (frame % 6 === 1) {
        mctx.clearRect(0, 0, 128, 128);
        mctx.drawImage(terrain, 0, 0);
        const [px, py] = toMap(position.x, position.z);
        mctx.save();
        mctx.translate(px, py);
        mctx.rotate(-yaw);
        mctx.fillStyle = '#ffffff';
        mctx.beginPath();
        mctx.moveTo(0, -6); mctx.lineTo(4, 4); mctx.lineTo(-4, 4);
        mctx.fill();
        mctx.restore();
      }

      let near = null;
      for (const it of interactables) {
        if (it.position.distanceTo(position) < it.radius) near = it;
      }
      if (shot) near = interactables.find((i) => i.id === 'door');
      if (running) shownRunHint = false;
      const chips = [];
      if (near) chips.push(`Press [E] to ${near.label}`);
      if (shownRunHint || shot) chips.push('L-SHIFT to Run');
      const html = chips.map((c) => `<div class="hud-chip">${c}</div>`).join('');
      if (prompts.innerHTML !== html) prompts.innerHTML = html;

      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toast.style.opacity = '0';
      }
      return near;
    },
    completeQuest() {
      if (questDone) return;
      questDone = true;
      questEl.textContent = 'INVESTIGATE THE GREAT CAVE DOOR (1/1)';
      showToast('The great door is sealed with a felt lock. Find the key...');
    },
  };
}
