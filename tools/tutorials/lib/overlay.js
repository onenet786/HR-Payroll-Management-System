// Injected into every recorded page (Playwright addInitScript). Draws the tutorial chrome on top of the app:
// a chapter chip, a caption bar, a title card, an animated cursor with click ripple, a highlight ring and a progress bar.
// The recorder drives it through window.__tut.* ; nothing here talks to the app.
(() => {
  if (window.__tut) return;
  const ready = fn => (document.body ? fn() : document.addEventListener('DOMContentLoaded', fn, { once: true }));
  const css = `
  #tut-root{position:fixed;inset:0;pointer-events:none;z-index:2147483646;font-family:'Segoe UI',system-ui,sans-serif}
  #tut-chip{position:absolute;left:14px;bottom:30px;max-width:200px;display:none;align-items:center;gap:10px;padding:7px 14px 7px 8px;border-radius:999px;
    background:rgba(6,20,15,.82);color:#d1fae5;font-size:14px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.25);backdrop-filter:blur(6px)}
  #tut-chip b{display:inline-grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:#10b981;color:#fff;font-size:13px}
  #tut-cap{position:absolute;left:50%;bottom:26px;transform:translateX(-50%) translateY(12px);opacity:0;max-width:1240px;width:calc(100% - 120px);
    padding:16px 26px;border-radius:16px;background:rgba(8,15,13,.88);color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.35);
    border:1px solid rgba(16,185,129,.35);transition:opacity .35s,transform .35s;backdrop-filter:blur(8px)}
  #tut-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
  #tut-cap .main{font-size:23px;line-height:1.42;font-weight:500}
  #tut-cap .sub{margin-top:6px;font-size:15px;line-height:1.4;color:#a7f3d0;opacity:.9}
  #tut-cap .ur,.tut-ur{direction:rtl;text-align:right;font-family:'Urdu Typesetting','Jameel Noori Nastaleeq','Segoe UI',serif}
  #tut-cap .main.ur{font-size:30px;line-height:1.7}
  #tut-cap .sub.ur{font-size:21px;line-height:1.6}
  #tut-bar{position:absolute;top:0;left:0;height:4px;width:0;background:linear-gradient(90deg,#10b981,#34d399);transition:width .6s}
  #tut-cursor{position:absolute;left:0;top:0;width:30px;height:30px;transform:translate(800px,450px);transition:transform .7s cubic-bezier(.4,.1,.2,1);
    filter:drop-shadow(0 3px 5px rgba(0,0,0,.45));display:none}
  .tut-ripple{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:999px;border:3px solid #10b981;animation:tutr .7s ease-out forwards}
  @keyframes tutr{from{transform:scale(.4);opacity:1}to{transform:scale(4.2);opacity:0}}
  #tut-hl{position:absolute;display:none;border-radius:12px;border:3px solid #10b981;box-shadow:0 0 0 6px rgba(16,185,129,.22),0 0 28px rgba(16,185,129,.55);
    transition:all .45s cubic-bezier(.4,.1,.2,1)}
  #tut-card{position:absolute;inset:0;display:none;place-items:center;background:radial-gradient(1200px 700px at 30% 30%,#0f5132 0%,#062018 55%,#030c09 100%);color:#fff}
  #tut-card.on{display:grid;animation:tutf .5s ease-out}
  @keyframes tutf{from{opacity:0}to{opacity:1}}
  #tut-card .wrap{width:1180px;max-width:90%}
  #tut-card .kicker{display:inline-flex;gap:10px;align-items:center;padding:8px 16px;border-radius:999px;border:1px solid rgba(52,211,153,.45);color:#6ee7b7;font-weight:700;letter-spacing:.12em;font-size:15px}
  #tut-card h1{margin:26px 0 10px;font-size:76px;line-height:1.04;font-weight:800;letter-spacing:-.02em}
  #tut-card h1.ur{font-size:84px;line-height:1.5;font-weight:700}
  #tut-card p{margin:0;font-size:27px;line-height:1.45;color:#c9f5e0;max-width:1000px}
  #tut-card p.ur{font-size:34px;line-height:1.7;max-width:none}
  #tut-card .aud{margin-top:34px;display:flex;gap:12px;flex-wrap:wrap}
  #tut-card .aud span{padding:9px 16px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-size:18px;font-weight:600}
  #tut-card .brand{position:absolute;left:60px;bottom:44px;font-size:17px;color:#6ee7b7;font-weight:700;letter-spacing:.06em}
  #tut-card .num{position:absolute;right:70px;bottom:10px;font-size:260px;font-weight:900;color:rgba(255,255,255,.05);line-height:1}
  `;
  const svg = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l16 9.2-7 1.6 4.2 7.6-3 1.6-4.2-7.7L4 19z" fill="#fff" stroke="#0b1f17" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const state = { x: 800, y: 450 };
  const el = {};
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  ready(() => {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const root = document.createElement('div'); root.id = 'tut-root';
    root.innerHTML = `<div id="tut-bar"></div><div id="tut-hl"></div><div id="tut-chip"><b></b><span></span></div>
      <div id="tut-cap"><div class="main"></div><div class="sub"></div></div><div id="tut-cursor">${svg}</div><div id="tut-card"></div>`;
    document.body.appendChild(root);
    for (const id of ['bar', 'hl', 'chip', 'cap', 'cursor', 'card']) el[id] = root.querySelector(`#tut-${id}`);
  });
  window.__tut = {
    chip(num, text, rtl) { el.chip.style.display = 'flex'; el.chip.querySelector('b').textContent = num; const s = el.chip.querySelector('span'); s.textContent = text; s.className = rtl ? 'tut-ur' : ''; },
    // main/sub: text; mainRtl/subRtl: Urdu lines are right-to-left in an Urdu font.
    caption(main, sub, mainRtl, subRtl) {
      const m = el.cap.querySelector('.main'); m.innerHTML = esc(main); m.className = 'main' + (mainRtl ? ' ur' : '');
      const s = el.cap.querySelector('.sub'); s.innerHTML = esc(sub || ''); s.style.display = sub ? 'block' : 'none'; s.className = 'sub' + (subRtl ? ' ur' : '');
      el.cap.classList.add('on');
    },
    hideCaption() { el.cap.classList.remove('on'); },
    progress(f) { el.bar.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`; },
    card({ kicker, title, subtitle, audience = [], num = '', brand = '', rtl = false }) {
      el.card.innerHTML = `<div class="wrap"><div class="kicker">${esc(kicker)}</div><h1 class="${rtl ? 'ur' : ''}">${esc(title)}</h1>
        <p class="${rtl ? 'ur' : ''}">${esc(subtitle)}</p><div class="aud">${audience.map(a => `<span class="${rtl ? 'tut-ur' : ''}">${esc(a)}</span>`).join('')}</div></div>
        <div class="brand">${esc(brand)}</div><div class="num">${esc(num)}</div>`;
      el.card.classList.add('on');
    },
    hideCard() { el.card.classList.remove('on'); },
    showCursor(on = true) { el.cursor.style.display = on ? 'block' : 'none'; },
    move(x, y) { state.x = x; state.y = y; el.cursor.style.display = 'block'; el.cursor.style.transform = `translate(${x - 4}px,${y - 2}px)`; },
    ripple(x, y) { const r = document.createElement('div'); r.className = 'tut-ripple'; r.style.left = `${x}px`; r.style.top = `${y}px`; document.getElementById('tut-root').appendChild(r); setTimeout(() => r.remove(), 800); },
    highlight(box) {
      if (!box) { el.hl.style.display = 'none'; return; }
      const pad = 6; el.hl.style.display = 'block';
      Object.assign(el.hl.style, { left: `${box.x - pad}px`, top: `${box.y - pad}px`, width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px` });
    },
  };
})();
