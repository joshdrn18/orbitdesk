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
      .prepare("SELECT destination_url FROM pages WHERE slug = ? AND status = 'active'")
      .bind(slug)
      .first();

    if (!page?.destination_url) {
      return new Response("Page not found.", {
        status: 404,
        headers: { "Cache-Control": "no-store" }
      });
    }

    return Response.redirect(page.destination_url, 302);
  } catch (error) {
    console.error("OrbitDesk public page redirect error", error);
    return new Response("Unable to open this page right now.", {
      status: 500,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
