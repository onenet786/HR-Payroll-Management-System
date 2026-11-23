// Small engine for the simulated IT screens (chapters 30-32). The chapter steps call these functions through
// h.page.evaluate(...): window.sim.play('#term', 'block') types a command and prints its output line by line,
// sim.show('#win') opens a window, sim.ctx(...) shows a right-click menu, and so on. Every call returns a Promise
// that resolves when the animation has finished.
(() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = sel => (typeof sel === 'string' ? document.querySelector(sel) : sel);
  const blocks = {};
  let z = 10;
  const speed = { type: 42, line: 55 };

  function esc(text) { return String(text).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }
  // A line is a string, or an array of segments: 'text' | ['text', 'class'].
  function html(parts) {
    if (!Array.isArray(parts)) return esc(parts);
    return parts.map(part => (Array.isArray(part) ? `<span class="${part[1]}">${esc(part[0])}</span>` : esc(part))).join('');
  }
  function screen(term) { const el = $(term); return el.querySelector('.screen') || el; }
  function scroll(term) { const el = $(term); el.scrollTop = el.scrollHeight; }
  function removeCaret(term) { $(term).querySelectorAll('.caret').forEach(c => c.remove()); }
  function addLine(term, content, cls, id) {
    const line = document.createElement('div');
    line.className = `ln${cls ? ` ${cls}` : ''}`;
    if (id) line.id = id;
    line.innerHTML = content;
    screen(term).appendChild(line);
    scroll(term);
    return line;
  }
  async function typeInto(term, span, text, perChar) {
    const caret = document.createElement('span'); caret.className = 'caret';
    span.after(caret);
    for (const ch of String(text)) { span.textContent += ch; scroll(term); await sleep(perChar ?? speed.type); }
    await sleep(160);
    caret.remove();
  }

  const sim = {
    sleep,
    speed,
    define(name, ops) { blocks[name] = ops; },
    // Plays a named block (or an array of ops) in a terminal element.
    async play(term, nameOrOps, { fast = false } = {}) {
      const ops = Array.isArray(nameOrOps) ? nameOrOps : blocks[nameOrOps];
      if (!ops) throw new Error(`No sim block ${nameOrOps}`);
      removeCaret(term);
      let lineDelay = fast ? 18 : speed.line;
      for (const op of ops) {
        if (op.pause) { await sleep(op.pause); continue; }
        if (op.delay != null) { lineDelay = op.delay; continue; }
        if (op.clear) { screen(term).innerHTML = ''; continue; }
        if (op.cmd != null) { // prompt + typed command + Enter
          const line = addLine(term, html(op.prompt ?? ''), op.cls, op.id);
          const span = document.createElement('span'); line.appendChild(span);
          await typeInto(term, span, op.cmd, op.speed);
          await sleep(op.after ?? 250);
          continue;
        }
        if (op.ask != null) { // Read-Host style: "Label [default]: " then the typed answer (or Enter)
          const label = Array.isArray(op.ask) ? op.ask : [op.ask];
          const line = addLine(term, html(label), op.cls, op.id);
          await sleep(op.think ?? 380);
          const span = document.createElement('span'); line.appendChild(span);
          if (op.a) await typeInto(term, span, op.mask ? op.mask : op.a, op.speed);
          else { const caret = document.createElement('span'); caret.className = 'caret'; span.after(caret); await sleep(op.wait ?? 520); caret.remove(); }
          await sleep(op.after ?? 220);
          continue;
        }
        if (op.idle != null) { // prompt waiting for input, with a blinking caret
          const line = addLine(term, html(op.idle), op.cls, op.id);
          const caret = document.createElement('span'); caret.className = 'caret'; line.appendChild(caret);
          continue;
        }
        const lines = op.lines || [op.o ?? ''];
        for (const text of lines) {
          addLine(term, html(op.c ? (Array.isArray(text) ? text : [[text, op.c]]) : text), op.cls, op.id && lines.length === 1 ? op.id : undefined);
          await sleep(op.each ?? lineDelay);
        }
        if (op.wait) await sleep(op.wait);
      }
      scroll(term);
    },
    clear(term) { screen(term).innerHTML = ''; },
    mark(id, on = true) { const el = document.getElementById(id); if (el) el.classList.toggle('hl', on); },
    // Windows: show (bring to front) / hide.
    show(sel, on = true) { const el = $(sel); if (!el) return; el.classList.toggle('on', on); if (on) el.style.zIndex = String(++z); },
    hide(sel) { sim.show(sel, false); },
    only(...sels) { document.querySelectorAll('.win.on').forEach(w => { if (!sels.some(s => w.matches(s))) w.classList.remove('on'); }); sels.forEach(s => sim.show(s)); },
    title(sel, text) { const t = $(sel)?.querySelector('.tbar .ttl'); if (t) t.textContent = text; },
    // Right-click menu next to an element: items are labels, '-' for a separator, '*Label' for bold.
    ctx(targetSel, items, { dx = 60, dy = 18 } = {}) {
      const target = $(targetSel); const menu = $('#ctx');
      const r = target.getBoundingClientRect();
      menu.innerHTML = items.map(item => {
        if (item === '-') return '<div class="sep"></div>';
        const bold = item.startsWith('*'); const label = bold ? item.slice(1) : item;
        const id = `ctx-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
        const shield = /administrator/i.test(label) ? '<span class="ic">' + sim.icons.shield + '</span>' : '';
        return `<div class="it" id="${id}" onclick="sim.ctxClose()">${shield}${bold ? `<b>${esc(label)}</b>` : esc(label)}</div>`;
      }).join('');
      menu.style.left = `${Math.min(r.left + dx, 1600 - 280)}px`; menu.style.top = `${r.top + dy}px`;
      menu.classList.add('on');
      return sleep(250);
    },
    ctxClose() { $('#ctx')?.classList.remove('on'); },
    async uac(app = 'Windows Command Processor', publisher = 'Microsoft Windows') {
      const veil = $('#uac'); veil.querySelector('.app').textContent = app; veil.querySelector('.pub').textContent = publisher;
      veil.classList.add('on');
      await sleep(200);
    },
    uacClose() { $('#uac')?.classList.remove('on'); },
    select(sel) { document.querySelectorAll('.exp-list .row.sel').forEach(r => r.classList.remove('sel')); $(sel)?.classList.add('sel'); },
    icons: {
      shield: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1l6 2v4.5C14 11 11.4 13.9 8 15 4.6 13.9 2 11 2 7.5V3z" fill="#1f6fd1"/><path d="M8 1v14C11.4 13.9 14 11 14 7.5V3z" fill="#f5c400"/><path d="M8 1L2 3v4.5h6z" fill="#e03c31"/><path d="M8 7.5V15C11.4 13.9 14 11 14 7.5z" fill="#1aa64a"/></svg>',
      folder: '<svg width="20" height="18" viewBox="0 0 20 18"><path d="M1 3a2 2 0 012-2h5l2 2h7a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2z" fill="#f8c94c"/><path d="M1 6h18v9a2 2 0 01-2 2H3a2 2 0 01-2-2z" fill="#ffd864"/></svg>',
      zip: '<svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1h10l4 4v14H2z" fill="#f8c94c" stroke="#c79a22"/><path d="M8 1v2h2v2H8v2h2v2H8v2h2" stroke="#6b4e00" stroke-width="1.4" fill="none"/><rect x="7" y="12" width="4" height="4" rx="1" fill="#6b4e00"/></svg>',
      cmd: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="2" width="16" height="14" rx="1.5" fill="#2b2b2b"/><rect x="1" y="2" width="16" height="3" fill="#cfd8e3"/><path d="M4 8l3 2-3 2" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M8.5 12.5h4" stroke="#fff" stroke-width="1.5"/></svg>',
      txt: '<svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1h9l5 5v13H1z" fill="#fff" stroke="#8b8b8b"/><path d="M4 9h8M4 12h8M4 15h6" stroke="#8b8b8b"/></svg>',
      json: '<svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1h9l5 5v13H1z" fill="#fff" stroke="#8b8b8b"/><text x="3" y="15" font-size="7" fill="#a35c00" font-family="Consolas">{ }</text></svg>',
      cer: '<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 2h12l4 4v12H1z" fill="#fff" stroke="#8b8b8b"/><circle cx="7" cy="11" r="3.2" fill="#e8b100"/><path d="M5.5 13.5L4.5 18l2.5-1.5L9.5 18l-1-4.5" fill="#d24a3a"/></svg>',
      exe: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="3" fill="#0f766e"/><path d="M5 9.5l2.6 2.6L13 6.5" stroke="#fff" stroke-width="2" fill="none"/></svg>',
      ps1: '<svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1h9l5 5v13H1z" fill="#fff" stroke="#8b8b8b"/><rect x="3" y="9" width="10" height="7" fill="#012456"/><path d="M4.5 10.5l2 1.5-2 1.5" stroke="#fff" fill="none"/></svg>',
      pdf: '<svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1h9l5 5v13H1z" fill="#fff" stroke="#8b8b8b"/><rect x="2.5" y="10" width="11" height="5" fill="#d93025"/><text x="3.6" y="14" font-size="4.5" fill="#fff" font-family="Arial" font-weight="700">PDF</text></svg>',
      drive: '<svg width="20" height="16" viewBox="0 0 20 16"><rect x="1" y="4" width="18" height="9" rx="1.5" fill="#dfe6ee" stroke="#8796a8"/><rect x="13" y="8" width="3" height="2" fill="#2fb34a"/></svg>',
      pc: '<svg width="20" height="18" viewBox="0 0 20 18"><rect x="1" y="1" width="18" height="12" rx="1" fill="#3b8de0"/><rect x="7" y="14" width="6" height="2" fill="#8aa"/></svg>',
    },
    // Explorer: path text and rows [{ id, name, icon, date, type, size }].
    explorer(win, { path, rows, nav, status }) {
      const el = $(win);
      el.querySelector('.path').innerHTML = `${sim.icons.pc}<span>${esc(path)}</span>`;
      if (nav) el.querySelectorAll('.exp-nav div').forEach(d => d.classList.toggle('on', d.dataset.nav === nav));
      el.querySelector('.exp-rows').innerHTML = rows.map(r => `<div class="row" id="${r.id || ''}"><span class="nm">${sim.icons[r.icon] || ''}<span>${esc(r.name)}</span></span><span class="dim">${esc(r.date || '')}</span><span class="dim">${esc(r.type || '')}</span><span class="dim" style="text-align:right">${esc(r.size || '')}</span></div>`).join('');
      el.querySelector('.exp-status').textContent = status || `${rows.length} items`;
    },
  };
  window.sim = sim;
})();
