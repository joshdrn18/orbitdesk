const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
export async function onRequest({ request, env, params }) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed.", { status:405, headers:{Allow:"GET, HEAD"} });
  const username = String(params.username || "").toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return new Response("Profile not found.", {status:404});
  try {
    const profile = await env.DB.prepare("SELECT id,username,display_name,bio,avatar_url,theme FROM bio_profiles WHERE username=? COLLATE NOCASE").bind(username).first();
    if (!profile) return new Response("Profile not found.", {status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
    const result = await env.DB.prepare("SELECT title,url,icon FROM bio_links WHERE profile_id=? AND is_active=1 ORDER BY position ASC").bind(profile.id).all();
    const links = result.results || [];
    const theme = profile.theme === "light" ? "light" : profile.theme === "rose" ? "rose" : "midnight";
    const backgrounds = { midnight:"background:radial-gradient(circle at 50% 0%,#30294e,#10121d 58%);color:#f7f5ff", light:"background:#f4f5fb;color:#22263a", rose:"background:radial-gradient(circle at 50% 0%,#713c5a,#251723 70%);color:#fff2f8" };
    const avatar = profile.avatar_url
      ? '<img class="avatar" src="' + escapeHtml(profile.avatar_url) + '" alt="Profile photo">'
      : '<div class="avatar fallback">' + escapeHtml(profile.display_name.slice(0,1).toUpperCase()) + '</div>';
    const buttons = links.map(link => '<a class="link" href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer"><span>' + escapeHtml(link.title) + '</span><b>↗</b></a>').join("");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#10121d"><meta name="description" content="${escapeHtml(profile.bio || profile.display_name + "'s links")}"><title>${escapeHtml(profile.display_name)} · OrbitDesk</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:42px 18px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;${backgrounds[theme]}}main{width:min(100%,440px);text-align:center}.avatar{width:94px;height:94px;border-radius:50%;object-fit:cover;border:3px solid #ffffff35;box-shadow:0 12px 35px #0003}.fallback{display:grid;place-items:center;margin:auto;background:#554a80;font-size:34px;font-weight:800}h1{font-size:25px;letter-spacing:-.8px;margin:18px 0 7px}p{font-size:14px;line-height:1.65;opacity:.72;white-space:pre-wrap;margin:0 auto;max-width:350px}.links{display:grid;gap:12px;margin:30px 0}.link{min-height:56px;padding:16px 18px;border:1px solid #ffffff38;border-radius:13px;background:#ffffff12;color:inherit;text-decoration:none;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:14px;transition:transform .18s,background .18s}.link:hover{transform:translateY(-2px);background:#ffffff22}.light .link{background:#fff;border-color:#e0e3ed;box-shadow:0 5px 18px #252b4210}.light .link:hover{background:#fdfdff}footer{font-size:10px;opacity:.5;margin-top:36px}footer a{color:inherit;text-decoration:none;font-weight:700}</style></head><body><main class="${theme}">${avatar}<h1>${escapeHtml(profile.display_name)}</h1><p>${escapeHtml(profile.bio)}</p><section class="links">${buttons || '<p>Add your first link from your OrbitDesk dashboard.</p>'}</section><footer>Made with <a href="/">OrbitDesk</a></footer></main></body></html>`;
    return new Response(request.method === "HEAD" ? null : html, {status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=60"}});
  } catch (error) {
    console.error("OrbitDesk Bio Page error", error);
    return new Response("Unable to load this profile right now.", {status:500});
  }
}
