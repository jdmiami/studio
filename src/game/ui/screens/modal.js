// A small modal over the current screen: confirm (yes / no), prompt (a text field or paste box) or
// code (a read-only, copyable export code). Opened through ctx.confirm / ctx.prompt / ctx.showCode,
// which return a Promise: confirm → bool, prompt → string | null, code → undefined.
import { h, button } from '../dom.js';

async function copyText(text, field) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  try { field.select(); return document.execCommand('copy'); } catch { return false; }
}

export default {
  modal: true,
  scrim: true,
  create(ctx, p) {
    const kind = p.kind ?? 'confirm';
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      ctx.pop();
      p.resolve?.(value);
    };
    let field = null;
    if (kind === 'prompt' || kind === 'code') {
      const multiline = kind === 'code' || !!p.multiline;
      field = h(multiline ? 'textarea.phl-input' : 'input.phl-input', {
        'data-focus': true, 'data-key': 'field', placeholder: p.placeholder, maxlength: p.maxLength ?? (multiline ? null : 24),
        readonly: kind === 'code', spellcheck: 'false', autocomplete: 'off', 'aria-label': p.title,
      });
      field.value = kind === 'code' ? String(p.code ?? '') : String(p.value ?? '');
      if (kind === 'code') field.addEventListener('focus', () => field.select());
    }

    const buttons = [];
    if (kind === 'confirm') {
      buttons.push(button(p.cancelLabel ?? 'Not now', () => settle(false), { key: 'cancel', autofocus: !p.danger }));
      const ok = button(p.confirmLabel ?? 'Yes', () => settle(true), { key: 'ok', kind: p.danger ? 'danger' : 'primary', autofocus: !!p.danger });
      ok.dataset.primary = '';
      buttons.push(ok);
    } else if (kind === 'prompt') {
      buttons.push(button(p.cancelLabel ?? 'Cancel', () => settle(null), { key: 'cancel' }));
      const ok = button(p.confirmLabel ?? 'OK', () => settle(field.value), { key: 'ok', kind: 'primary' });
      ok.dataset.primary = '';
      buttons.push(ok);
    } else {
      const copy = button('Copy code', async () => {
        const ok = await copyText(field.value, field);
        ctx.toast(ok ? 'Code copied, keep it somewhere cosy' : 'Select the code and copy it by hand', ok ? 'info' : 'error');
      }, { key: 'copy', kind: 'primary', autofocus: true });
      buttons.push(copy, button('Done', () => settle(undefined), { key: 'done' }));
    }

    const panel = h('div.phl-panel.phl-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': p.title },
      h('h2.phl-title', {}, p.title ?? ''),
      p.text ? h('p.phl-modal-text', {}, p.text) : null,
      field,
      h('div.phl-modal-buttons', {}, buttons));
    const el = h('div', {}, panel);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) settle(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined); });

    return {
      el,
      initialFocus: () => (kind === 'prompt' ? field : null),
      onBack() { settle(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined); return true; },
      onSubmit() { if (kind === 'prompt') { settle(field.value); return true; } return false; },
      destroy() { if (!settled) { settled = true; p.resolve?.(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined); } },
      wrap: true,
    };
  },
};
