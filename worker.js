export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Proxy the Umami tracker script
    if (url.pathname === "/stats.js" && request.method === "GET") {
      const response = await fetch("https://cloud.umami.is/script.js");
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // 2. Proxy the analytics collection endpoint
    if (url.pathname === "/api/send" && request.method === "POST") {
      const response = await fetch("https://gateway.umami.is/api/send", {
        method: "POST",
        headers: {
          "Content-Type": request.headers.get("Content-Type") || "application/json",
          "User-Agent": request.headers.get("User-Agent") || "",
          "X-Forwarded-For": request.headers.get("CF-Connecting-IP") || "",
        },
        body: request.body,
      });

      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "application/json",
        },
      });
    }

    // 3. Fallback to static assets
    return env.ASSETS.fetch(request);
  },
};
