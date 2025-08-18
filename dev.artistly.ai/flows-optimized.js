module.exports = { personalDesignsFlow };

async function personalDesignsFlow(page, vuContext) {
  const vars = vuContext.vars || {};
  const baseURL = vuContext.config && vuContext.config.target;
  const personalPath = vars.PERSONAL_PATH || "/personal-designs";
  const cookieName = (vars.COOKIE_NAME || "laravel_session").toLowerCase();
  const timeoutMs = parseInt(vars.ECHO_TIMEOUT_MS || "20000", 10);

  // CRITICAL: Multiple WebSocket connections in SAME page (no asset reloading)
  // Higher = More server load testing with same Chrome instance
  // Lower = Less server stress but same asset loading
  const connectionsPerInstance = parseInt(
    vars.CONNECTIONS_PER_INSTANCE || "4",
    10
  );

  // Track only main requests, not assets
  await page.route("**/*", (route, request) => {
    const url = request.url();
    const isAsset =
      /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|webp)$/i.test(
        url
      ) ||
      url.includes("/fonts/") ||
      url.includes("/images/") ||
      url.includes("/assets/") ||
      url.includes("/static/");

    if (
      !isAsset &&
      (url.includes("/personal-designs") || url.includes("/auth"))
    ) {
      request.headers()["x-artillery-track"] = "true";
    }

    route.continue();
  });

  // Optional: friendlier UA to avoid headless flags being blocked
  await page.context().setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  });

  const authUrl =
    vars.AUTH_URL ||
    (baseURL
      ? new URL("/auth/magic-login?token=dev", baseURL).toString()
      : "/auth/magic-login?token=dev");

  // ---- 1) Auth with a single retry/refresh fallback
  await attemptAuthWithRefresh(page, authUrl, cookieName, baseURL);

  // ---- 2) Load page ONCE (single asset download)
  await page.goto(personalPath, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // ---- 3) Establish main WebSocket connection first
  await page.waitForFunction(
    () => {
      const Echo = window.Echo;
      if (!Echo || !Echo.connector) return false;
      const c = Echo.connector;
      if (c.pusher?.connection?.state)
        return c.pusher.connection.state === "connected";
      if (c.socket && typeof c.socket.connected === "boolean")
        return c.socket.connected === true;
      if (c.connection && typeof c.connection.state === "string")
        return c.connection.state === "connected";
      return false;
    },
    { timeout: timeoutMs }
  );

  console.log(`✅ Main WebSocket connection established`);

  // ---- 4) Create additional connections using cached navigation
  const additionalConnections = connectionsPerInstance - 1;
  const connectionResults = [];

  if (additionalConnections > 0) {
    // Create additional pages but they should use cached assets
    for (let i = 0; i < additionalConnections; i++) {
      try {
        const newPage = await page.context().newPage();

        // Navigate to same URL - should use cached assets from first page load
        await newPage.goto(personalPath, {
          waitUntil: "domcontentloaded",
          timeout: 30000, // Shorter timeout since assets should be cached
        });

        // Wait for WebSocket connection on new page
        await newPage.waitForFunction(
          () => {
            const Echo = window.Echo;
            if (!Echo || !Echo.connector) return false;
            const c = Echo.connector;
            if (c.pusher?.connection?.state)
              return c.pusher.connection.state === "connected";
            if (c.socket && typeof c.socket.connected === "boolean")
              return c.socket.connected === true;
            if (c.connection && typeof c.connection.state === "string")
              return c.connection.state === "connected";
            return false;
          },
          { timeout: timeoutMs }
        );

        connectionResults.push(
          `✅ Additional WebSocket ${
            i + 2
          }/${connectionsPerInstance} connected (cached assets)`
        );

        // Store page reference for cleanup
        if (!global.additionalPages) {
          global.additionalPages = [];
        }
        global.additionalPages.push(newPage);
      } catch (error) {
        connectionResults.push(
          `❌ Additional WebSocket ${i + 2}/${connectionsPerInstance} failed: ${
            error.message
          }`
        );
        // Continue with other connections
      }
    }
  }

  connectionResults.forEach((result) => console.log(result));

  console.log(
    `🎯 Total WebSocket connections: ${connectionsPerInstance} (optimized asset loading)`
  );

  // ---- 5) Hold all connections open for the think time
  await page.waitForTimeout(30000);

  // ---- 6) Cleanup additional pages (Artillery will handle main page)
  if (global.additionalPages) {
    for (const additionalPage of global.additionalPages) {
      try {
        await additionalPage.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    global.additionalPages = [];
  }
}

async function attemptAuthWithRefresh(page, authUrl, cookieName, baseURL) {
  // 1st attempt
  await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
  if (await hasSessionCookie(page, cookieName)) return;

  // Try a "same-site" hop (sometimes needed for SESSION_DOMAIN / SameSite to kick in)
  if (baseURL) {
    await page
      .goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 })
      .catch(() => {});
    if (await hasSessionCookie(page, cookieName)) return;
  }

  // 2nd attempt: hard refresh/reload of the auth page (your manual "refresh" effect)
  await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
  if (await hasSessionCookie(page, cookieName)) return;

  // As a last-resort, take a screenshot and throw
  await page.screenshot({
    path: `./screenshots/auth-failed-${Date.now()}.png`,
    fullPage: true,
  });
  const cookies = await page.context().cookies();
  console.log(
    "Auth cookies after retry:",
    cookies.map(
      (c) => `${c.name}@${c.domain}; samesite=${c.sameSite}; secure=${c.secure}`
    )
  );
  throw new Error(
    "Auth failed even after refresh fallback (no session cookie found)."
  );
}

async function hasSessionCookie(page, cookieName) {
  const cookies = await page.context().cookies();
  return cookies.some(
    (c) =>
      c.name.toLowerCase().includes(cookieName) ||
      c.name.toLowerCase().includes("session")
  );
}
