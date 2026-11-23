// Node-side helpers for the simulated IT chapters (30-32): open a sim page, take a picture of the real demo app for
// the simulated browser window, and short wrappers the chapter steps use to drive window.sim.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const simDir = path.dirname(fileURLToPath(import.meta.url));
export const simUrl = file => pathToFileURL(path.join(simDir, file)).href;

// Screenshot of the demo server's sign-in page (signed out), shown inside the simulated browser window.
export async function appShot(page, url, { width = 1478, height = 636 } = {}) {
  const browser = page.context().browser();
  if (!browser) return '';
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'en-GB' });
  try {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => undefined);
    await p.waitForTimeout(900);
    const buf = await p.screenshot();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return '';
  } finally {
    await ctx.close();
  }
}

// Wrappers used in chapter steps.
export const play = (h, term, block) => h.page.evaluate(([t, b]) => window.sim.play(t, b), [term, block]);
export const run = (h, fn, arg) => h.page.evaluate(fn, arg);
export async function rightClick(h, css, items, opts) {
  await h.point({ css }, { hold: 350 });
  await h.page.evaluate(([c, i, o]) => { window.sim.select(c); return window.sim.ctx(c, i, o); }, [css, items, opts || {}]);
  await h.wait(450);
}
export async function mark(h, id, hold = 1400) {
  await h.page.evaluate(i => window.sim.mark(i), id);
  await h.point({ css: `#${id}` }, { hold });
}
