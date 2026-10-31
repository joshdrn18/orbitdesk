export async function onRequest({ request, env, params }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    });
  }

  const slug = String(params.slug || "").toLowerCase();
  if (!/^[a-z0-9]{1,32}$/.test(slug)) {
    return new Response("Page not found.", { status: 404 });
  }

  try {
    const page = await env.DB
      .prepare("SELECT id,user_id,destination_url FROM pages WHERE slug = ? AND status = 'active'")
      .bind(slug)
      .first();

    if (!page?.destination_url) {
      return new Response("Page not found.", {
        status: 404,
        headers: { "Cache-Control": "no-store" }
      });
    }

    try {
      const referrer = request.headers.get("Referer") ? new URL(request.headers.get("Referer")).hostname : "";
      await env.DB.prepare("INSERT INTO analytics_events (id,user_id,event_type,resource_type,resource_id,country,referrer,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),page.user_id,"page_click","page",page.id,request.cf?.country||"Unknown",referrer,Date.now()).run();
    } catch (trackingError) { console.error("Analytics tracking failed",trackingError); }
    return Response.redirect(page.destination_url, 302);
  } catch (error) {
    console.error("OrbitDesk public page redirect error", error);
    return new Response("Unable to open this page right now.", {
      status: 500,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
