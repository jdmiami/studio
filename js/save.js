// Stickerwild — saving: a downloadable save file (seed + progress), loading one back,
// copy/paste save codes, and an optional private cloud save when the page runs
// inside a claude.ai artifact.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let db = null, uid = null, cloudDoc = null, writing = false, lastJson = '', cloudMeta = null;

  function game() { return SW.game; }
  function status(msg) { const el = $('saveStatus'); if (el) el.textContent = msg; }

  // ---------- cloud (artifact db, private per player) ----------
  async function init() {
    wire();
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const user = await window.claude.use('user');
      if (!user) return;
      uid = await user.id();
      if (!uid) return;
      db = await window.claude.use('db');
      if (!db) return;
      cloudDoc = db.doc('data/users/' + uid + '/save');
      document.body.classList.add('has-cloud');
      const snap = await withTimeout(cloudDoc.get(), 10000);
      if (snap && snap.exists) cloudMeta = snap.data();
      refreshTitle();
    } catch (e) { db = null; cloudDoc = null; }
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]); }

  async function cloudSave(data, quiet) {
    if (!cloudDoc || writing || !data) return false;
    const json = JSON.stringify(data);
    if (json === lastJson) return true;
    if (json.length > 240000) { if (!quiet) game().toast('This save is too large for the cloud. Download a save file instead.'); return false; }
    writing = true;
    try {
      const meta = { json, seed: data.seed, seedText: data.seedText || String(data.seed), level: data.player.level || 1, day: game().dayOf(data.time), savedAt: Date.now() };
      await cloudDoc.set(meta);
      lastJson = json; cloudMeta = meta;
      if (!quiet) { game().toast('Uploaded to your cloud save.'); }
      status('Cloud save: just now');
      return true;
    } catch (e) {
      if (!quiet) game().toast(e && e.code === 'quota_exceeded' ? 'Cloud storage is full. Download a save file instead.' : 'Could not reach the cloud. Try again in a moment.');
      return false;
    } finally { writing = false; }
  }
  async function cloudLoad() {
    if (!cloudDoc) return null;
    try {
      const snap = await withTimeout(cloudDoc.get(), 10000);
      if (!snap.exists) return null;
      cloudMeta = snap.data();
      return JSON.parse(cloudMeta.json);
    } catch (e) { return null; }
  }

  // ---------- files ----------
  async function download(data) {
    const json = JSON.stringify(data, null, 1);
    const filename = game().saveName();
    try {
      const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
      if (dl) {
        await dl.save({ filename, data: json });
        game().toast('Save file downloaded: ' + filename);
        return;
      }
    } catch (e) {
      if (e && e.code === 'declined') return;
      // fall through to a normal browser download
    }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      game().toast('Save file downloaded: ' + filename);
    } catch (e) { game().toast('Download is not available here. Use "Copy save code" instead.'); }
  }
  function readFile(file) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { resolve(null); } };
      r.onerror = () => resolve(null);
      r.readAsText(file);
    });
  }
  function encodeCode(data) { return 'SW1:' + btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
  function decodeCode(text) {
    text = (text || '').trim();
    try {
      if (text.startsWith('SW1:')) return JSON.parse(decodeURIComponent(escape(atob(text.slice(4)))));
      return JSON.parse(text);
    } catch (e) { return null; }
  }
  function load(data, from) {
    if (!game().validSave(data)) { game().toast('That is not a Stickerwild save.'); return; }
    SW.audio.unlock();
    if (game().restore(data)) game().toast(`Loaded ${from}: level ${data.player.level || 1}, day ${game().dayOf(data.time)}.`);
  }

  // ---------- UI ----------
  function currentSave() {
    const G = game().G;
    return G && (G.mode === 'play' || G.mode === 'paused' || G.mode === 'dead') ? game().serialize() : SW.store.get('save', null);
  }
  function openPanel() {
    const G = game().G;
    const data = currentSave();
    const has = game().validSave(data);
    $('savePanel').hidden = false;
    $('pauseScreen').hidden = true; $('titleScreen').hidden = true;
    $('saveSeed').textContent = has ? (data.seedText || data.seed) : '(start a game first)';
    $('saveSummary').textContent = has ? `Level ${data.player.level || 1} · Day ${game().dayOf(data.time)} · ${Object.values(data.inv || {}).reduce((a, b) => a + b, 0)} items` : 'No game in progress yet.';
    for (const id of ['dlBtn', 'copyCodeBtn', 'seedCopy']) $(id).disabled = !has;
    $('cloudUpBtn').disabled = !has || !cloudDoc;
    $('cloudDownBtn').disabled = !cloudDoc || !cloudMeta;
    $('cloudRow').hidden = !cloudDoc;
    status(cloudMeta ? `Cloud save: level ${cloudMeta.level}, day ${cloudMeta.day}, saved ${ago(cloudMeta.savedAt)}` : cloudDoc ? 'No cloud save yet.' : '');
    $('codeBox').value = '';
    if (G && G.mode === 'title') $('hud').hidden = true;
  }
  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function refreshTitle() {
    const b = $('cloudResumeBtn');
    if (!b) return;
    b.hidden = !cloudMeta;
    if (cloudMeta) b.querySelector('span').textContent = `Cloud save · Lv ${cloudMeta.level} · Day ${cloudMeta.day}`;
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); game().toast(okMsg); }
    catch (e) { const box = $('codeBox'); box.value = text; box.focus(); box.select(); game().toast('Copy the selected text with Ctrl+C (or long-press).'); }
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $('saveBtnTitle').addEventListener('click', openPanel);
    $('saveBtnPause').addEventListener('click', openPanel);
    $('saveClose').addEventListener('click', () => game().closeSavePanel());
    $('dlBtn').addEventListener('click', () => { const d = currentSave(); if (d) download(d); });
    $('loadFileBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      load(await readFile(f), 'save file');
    });
    $('copyCodeBtn').addEventListener('click', () => { const d = currentSave(); if (d) copyText(encodeCode(d), 'Save code copied. Paste it here on any device to resume.'); });
    $('loadCodeBtn').addEventListener('click', () => { const d = decodeCode($('codeBox').value); if (!d) { game().toast('That code did not work. Paste the whole save code.'); return; } load(d, 'save code'); });
    $('seedCopy').addEventListener('click', () => { const d = currentSave(); if (d) copyText(String(d.seedText || d.seed), 'Seed copied. Anyone with it gets the same island.'); });
    $('cloudUpBtn').addEventListener('click', async () => { const d = currentSave(); if (d) { status('Uploading...'); await cloudSave(d, false); openPanel(); } });
    $('cloudDownBtn').addEventListener('click', async () => { status('Downloading...'); const d = await cloudLoad(); if (d) load(d, 'cloud save'); else status('No cloud save found.'); });
    $('cloudResumeBtn').addEventListener('click', async () => { const d = await cloudLoad(); if (d) load(d, 'cloud save'); else game().toast('No cloud save found.'); });
  }

  SW.saves = { init, cloudSave, cloudLoad, download, refreshTitle, encodeCode, decodeCode, get cloud() { return !!cloudDoc; } };
})();
