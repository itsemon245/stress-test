module.exports = { personalDesignsFlow };

async function personalDesignsFlow(page, vuContext) {
  const vars = vuContext.vars || {};
  const baseURL = vuContext.config && vuContext.config.target;
  const personalPath = vars.PERSONAL_PATH || '/personal-designs';
  const cookieName = (vars.COOKIE_NAME || 'laravel_session').toLowerCase();
  const timeoutMs = parseInt(vars.ECHO_TIMEOUT_MS || '20000', 10);

  // Optional: friendlier UA to avoid headless flags being blocked
  await page.context().setExtraHTTPHeaders({
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
  });

  const authUrl =
    vars.AUTH_URL ||
    (baseURL ? new URL('/auth/magic-login?token=dev', baseURL).toString() : '/auth/magic-login?token=dev');

  // ---- 1) Auth with a single retry/refresh fallback
  await attemptAuthWithRefresh(page, authUrl, cookieName, baseURL);

  // ---- 2) Go to /personal-designs (don’t wait for networkidle; Echo keeps WS open)
  await page.goto(personalPath, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ---- 3) Wait for Echo to be connected
  await page.waitForFunction(
    () => {
      const Echo = window.Echo;
      if (!Echo || !Echo.connector) return false;
      const c = Echo.connector;
      if (c.pusher?.connection?.state) return c.pusher.connection.state === 'connected';
      if (c.socket && typeof c.socket.connected === 'boolean') return c.socket.connected === true;
      if (c.connection && typeof c.connection.state === 'string') return c.connection.state === 'connected';
      return false;
    },
    { timeout: timeoutMs }
  );

  // small think time
  await page.waitForTimeout(500);
}

async function attemptAuthWithRefresh(page, authUrl, cookieName, baseURL) {
  // 1st attempt
  await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => { });
  if (await hasSessionCookie(page, cookieName)) return;

  // Try a “same-site” hop (sometimes needed for SESSION_DOMAIN / SameSite to kick in)
  if (baseURL) {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
    if (await hasSessionCookie(page, cookieName)) return;
  }

  // 2nd attempt: hard refresh/reload of the auth page (your manual “refresh” effect)
  await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => { });
  if (await hasSessionCookie(page, cookieName)) return;

  // As a last-resort, take a screenshot and throw
  await page.screenshot({ path: `auth-failed-${Date.now()}.png`, fullPage: true });
  const cookies = await page.context().cookies();
  console.log('Auth cookies after retry:', cookies.map(c => `${c.name}@${c.domain}; samesite=${c.sameSite}; secure=${c.secure}`));
  throw new Error('Auth failed even after refresh fallback (no session cookie found).');
}

async function hasSessionCookie(page, cookieName) {
  const cookies = await page.context().cookies();
  return cookies.some(
    c => c.name.toLowerCase().includes(cookieName) || c.name.toLowerCase().includes('session')
  );
}
