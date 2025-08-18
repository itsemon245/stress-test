module.exports = { personalDesignsFlow };

async function personalDesignsFlow(page, vuContext) {
  const vars = vuContext.vars || {};
  const baseURL = vuContext.config && vuContext.config.target;
  const personalPath = vars.PERSONAL_PATH || "/personal-designs";
  const cookieName = (vars.COOKIE_NAME || "laravel_session").toLowerCase();
  const timeoutMs = parseInt(vars.ECHO_TIMEOUT_MS || "20000", 10);

  // CRITICAL: Number of WebSocket connections per Chrome instance
  // Higher = More server load testing with fewer Chrome processes
  // Lower = Less CPU overhead but less server stress testing
  // CRITICAL: Optimized for asset loading limits discovered during testing
  // You found server handles ~400 concurrent browser sessions before asset bottleneck
  // 4 connections per instance allows more Chrome instances while staying under asset limit
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
      // Mark important requests for Artillery metrics
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

  // ---- 1) Auth with a single retry/refresh fallback on the main page
  await attemptAuthWithRefresh(page, authUrl, cookieName, baseURL);

  // ---- 2) Create multiple WebSocket connections in separate tabs
  const pages = [page]; // Start with the main page
  const connections = [];

  try {
    // Create additional pages/tabs for multiple connections
    for (let i = 1; i < connectionsPerInstance; i++) {
      const newPage = await page.context().newPage();

      // Apply same route filtering and headers
      await newPage.route("**/*", (route, request) => {
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

      await newPage.setExtraHTTPHeaders({
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });

      pages.push(newPage);
    }

    // ---- 3) Navigate all pages to personal-designs and establish WebSocket connections
    await Promise.all(
      pages.map(async (currentPage, index) => {
        try {
          // Navigate to personal-designs page
          await currentPage.goto(personalPath, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });

          // Wait for Echo WebSocket connection
          await currentPage.waitForFunction(
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

          console.log(
            `✅ WebSocket ${
              index + 1
            }/${connectionsPerInstance} connected successfully`
          );
          connections.push(currentPage);
        } catch (error) {
          const echoState = await currentPage.evaluate(() => {
            const Echo = window.Echo;
            if (!Echo) return "Echo not loaded";
            if (!Echo.connector) return "Echo connector not initialized";
            const c = Echo.connector;
            if (c.pusher?.connection?.state)
              return `Pusher state: ${c.pusher.connection.state}`;
            if (c.socket) return `Socket connected: ${c.socket.connected}`;
            if (c.connection) return `Connection state: ${c.connection.state}`;
            return "Unknown Echo state";
          });

          console.log(
            `❌ WebSocket ${index + 1}/${connectionsPerInstance} failed: ${
              error.message
            }. Echo state: ${echoState}`
          );
          throw error;
        }
      })
    );

    console.log(
      `🎯 Successfully established ${connections.length}/${connectionsPerInstance} WebSocket connections`
    );

    // ---- 4) Hold all connections open for the think time
    await page.waitForTimeout(30000);
  } finally {
    // Clean up additional pages (main page will be closed by Artillery)
    for (let i = 1; i < pages.length; i++) {
      try {
        await pages[i].close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

async function attemptAuthWithRefresh(page, authUrl, cookieName, baseURL) {
  // 1st attempt
  await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
  if (await hasSessionCookie(page, cookieName)) return;

  // Try a “same-site” hop (sometimes needed for SESSION_DOMAIN / SameSite to kick in)
  if (baseURL) {
    await page
      .goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 })
      .catch(() => {});
    if (await hasSessionCookie(page, cookieName)) return;
  }

  // 2nd attempt: hard refresh/reload of the auth page (your manual “refresh” effect)
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
