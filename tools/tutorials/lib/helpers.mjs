// Actions available to chapter steps as `h`: every visible action moves the tutorial cursor to its target,
// highlights it, then acts, so the viewer always sees where the click or typing happens.
export function createHelpers(page, { baseUrl, log }) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tut = (fn, ...args) => page.evaluate(([f, a]) => window.__tut && window.__tut[f](...a), [fn, args]).catch(() => undefined);

  // target: 'Button text' | { role, name } | { label } | { placeholder } | { text } | { css } | (page) => Locator
  async function resolve(target, { within } = {}) {
    const scope = within ? page.locator(within) : page;
    if (typeof target === 'function') return target(page).first();
    if (target && typeof target === 'object' && typeof target.first === 'function') return target.first();
    const candidates = [];
    if (typeof target === 'string') {
      for (const role of ['button', 'link', 'tab', 'menuitem', 'option']) candidates.push(scope.getByRole(role, { name: target, exact: true }));
      for (const role of ['button', 'link', 'tab', 'menuitem']) candidates.push(scope.getByRole(role, { name: target }));
      candidates.push(scope.getByText(target, { exact: true }), scope.getByText(target));
    } else if (target.css) candidates.push(scope.locator(target.css));
    else if (target.role) candidates.push(scope.getByRole(target.role, { name: target.name, exact: target.exact }));
    else if (target.label) candidates.push(scope.getByLabel(target.label, { exact: target.exact }));
    else if (target.placeholder) candidates.push(scope.getByPlaceholder(target.placeholder));
    else if (target.text) candidates.push(scope.getByText(target.text, { exact: target.exact }));
    for (const candidate of candidates) {
      const visible = candidate.filter({ visible: true });
      if (await visible.count().catch(() => 0)) return visible.nth(target.nth || 0);
    }
    throw new Error(`Not found on screen: ${JSON.stringify(typeof target === 'function' ? 'locator fn' : target)}`);
  }

  async function point(target, { hold = 650, within, scroll = true } = {}) {
    const loc = await resolve(target, { within });
    if (scroll) await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
    await sleep(150);
    const box = await loc.boundingBox();
    if (box) {
      await tut('move', box.x + Math.min(box.width / 2, 40), box.y + box.height / 2);
      await tut('highlight', box);
    }
    await sleep(hold);
    return { loc, box };
  }

  const h = {
    page, sleep, resolve, point,
    wait: ms => sleep(ms),
    async click(target, opts = {}) {
      const { loc, box } = await point(target, opts);
      if (box) await tut('ripple', box.x + Math.min(box.width / 2, 40), box.y + box.height / 2);
      await loc.click({ timeout: 6000, force: opts.force });
      await sleep(opts.after ?? 350);
      await tut('highlight', null);
    },
    async fill(target, value, opts = {}) {
      const { loc } = await point(target, { hold: 350, ...opts });
      await loc.click({ timeout: 6000 });
      await loc.fill('');
      await loc.pressSequentially(String(value), { delay: opts.delay ?? 45 });
      await sleep(250);
      await tut('highlight', null);
    },
    async select(target, option, opts = {}) {
      const { loc } = await point(target, { hold: 400, ...opts });
      if (typeof option === 'string') await loc.selectOption({ label: option }).catch(() => loc.selectOption({ value: option }));
      else await loc.selectOption(option);
      await sleep(400);
      await tut('highlight', null);
    },
    async check(target, opts = {}) { const { loc } = await point(target, opts); await loc.check({ timeout: 6000 }).catch(() => loc.click()); await tut('highlight', null); },
    async press(key) { await page.keyboard.press(key); await sleep(300); },
    async highlightOff() { await tut('highlight', null); },
    // Smoothly scroll whatever is under the middle of the screen (the app scrolls its main panel, not the window).
    async scroll(dy, { x = 900, y = 520, steps = 8 } = {}) {
      await page.mouse.move(x, y);
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(45); }
      await sleep(400);
    },
    async scrollTo(target) { const loc = await resolve(target); await loc.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(700); },
    async goto(pathname) { await page.goto(new URL(pathname, baseUrl).toString()); await page.waitForLoadState('networkidle').catch(() => undefined); },
    // Sidebar module (People, Payroll, ...) then the item in its mega-menu card.
    async nav(moduleName, itemName) {
      await h.click({ css: `nav >> text="${moduleName}"` }).catch(async () => h.click(moduleName));
      await sleep(500);
      await h.click(itemName, { after: 900 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
    },
    async visible(target, timeout = 8000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { try { return await resolve(target); } catch { await sleep(250); } }
      throw new Error(`Never appeared: ${JSON.stringify(target)}`);
    },
    log,
  };
  return h;
}
