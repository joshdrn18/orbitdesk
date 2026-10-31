const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const corsHeaders = (request, env) => {
  const origin = request.headers.get("Origin");
  const allowed = env.SITE_ORIGIN ? env.SITE_ORIGIN.split(",").map(x => x.trim()) : [];
  if (!origin || (allowed.length && !allowed.includes(origin))) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "vary": "Origin" };
};
const enc = new TextEncoder();
const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const random = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return toB64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); };
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:100000, hash:"SHA-256" }, key, 256);
  return toB64(bits);
}
async function passwordRecord(password) { const salt=crypto.getRandomValues(new Uint8Array(16)); return { salt:toB64(salt), hash:await hashPassword(password,salt) }; }
function cookie(name,value,maxAge) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function getCookie(request,name) { return (request.headers.get("Cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="))?.slice(name.length+1); }
async function currentUser(request,env) {
  const token=getCookie(request,"od_session"); if(!token) return null;
  const session=await env.DB.prepare("SELECT user_id, expires_at FROM user_sessions WHERE token_hash = ? AND expires_at > ?").bind(await sha(token),Date.now()).first();
  if(!session) return null;
  return env.DB.prepare("SELECT id,email,display_name,role,plan FROM users WHERE id=? AND status='active'").bind(session.user_id).first();
}
async function sha(value) { return toB64(await crypto.subtle.digest("SHA-256",enc.encode(value))); }
function validEmail(email) { return typeof email==="string" && email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export default {
 async fetch(request,env) {
  const url=new URL(request.url); const headers=corsHeaders(request,env);
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{...headers,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type"}});
  try {
   if(url.pathname==="/api/health" && request.method==="GET") return json({ok:true,service:"OrbitDesk API",version:"0.1.0"});
   if(url.pathname==="/api/health/db" && request.method==="GET") {
    try {
     await env.DB.prepare("SELECT id,email FROM users LIMIT 1").first();
     await env.DB.prepare("SELECT id,user_id,token_hash,expires_at FROM user_sessions LIMIT 1").first();
     return json({ok:true,database:"connected",tables:"users,user_sessions"});
    } catch(dbError) {
     console.error("OrbitDesk D1 diagnostic",dbError);
     return json({ok:false,database:"error",error:String(dbError?.message||dbError).slice(0,180)},500);
    }
   }
   if(url.pathname==="/api/auth/register" && request.method==="POST") {
    const body=await request.json(); const email=String(body.email||"").trim().toLowerCase(); const displayName=String(body.displayName||"").trim(); const password=String(body.password||"");
    if(!validEmail(email)) return json({error:"Enter a valid email address."},400,headers);
    if(displayName.length<2||displayName.length>60) return json({error:"Name must be between 2 and 60 characters."},400,headers);
    if(password.length<10||password.length>128) return json({error:"Password must be between 10 and 128 characters."},400,headers);
    const existing=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if(existing) return json({error:"An account with this email already exists."},409,headers);
    const id=crypto.randomUUID(); const record=await passwordRecord(password);
    await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,plan,status,created_at) VALUES (?,?,?,?,?,'user','free','active',?)").bind(id,email,displayName,record.hash,record.salt,Date.now()).run();
    const token=random(32); await env.DB.prepare("INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,await sha(token),Date.now()+2592000000,Date.now()).run();
    return json({user:{id,email,displayName,role:"user",plan:"free"}},201,{...headers,"set-cookie":cookie("od_session",token,2592000)});
   }
   if(url.pathname==="/api/auth/login" && request.method==="POST") {
    const body=await request.json(); const email=String(body.email||"").trim().toLowerCase(); const password=String(body.password||"");
    if(!validEmail(email)||!password) return json({error:"Invalid email or password."},400,headers);
    const user=await env.DB.prepare("SELECT id,email,display_name,password_hash,password_salt,role,plan,status FROM users WHERE email=?").bind(email).first();
    if(!user||user.status!=="active") return json({error:"Invalid email or password."},401,headers);
    const candidate=await hashPassword(password,fromB64(user.password_salt));
    if(candidate!==user.password_hash) return json({error:"Invalid email or password."},401,headers);
    const token=random(32); await env.DB.prepare("INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),user.id,await sha(token),Date.now()+2592000000,Date.now()).run();
    return json({user:{id:user.id,email:user.email,displayName:user.display_name,role:user.role,plan:user.plan}},200,{...headers,"set-cookie":cookie("od_session",token,2592000)});
   }
   if(url.pathname==="/api/auth/me" && request.method==="GET") {
    const user=await currentUser(request,env); if(!user) return json({error:"Not signed in."},401,headers);
    return json({user:{id:user.id,email:user.email,displayName:user.display_name,role:user.role,plan:user.plan}},200,headers);
   }
   if(url.pathname==="/api/auth/logout" && request.method==="POST") {
    const token=getCookie(request,"od_session"); if(token) await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash=?").bind(await sha(token)).run();
    return json({ok:true},200,{...headers,"set-cookie":cookie("od_session","",0)});
   }


   const publicPageMatch=url.pathname.match(/^\/p\/([a-z0-9]+)$/i);
   if(publicPageMatch && request.method==="GET") {
    const page=await env.DB.prepare("SELECT destination_url FROM pages WHERE slug=? AND status='active'").bind(publicPageMatch[1]).first();
    if(!page) return new Response("Page not found.",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
    return Response.redirect(page.destination_url,302);
   }
   if(url.pathname==="/api/pages" && request.method==="GET") {
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const result=await env.DB.prepare("SELECT id,title,slug,description,destination_url,status,created_at,updated_at FROM pages WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
    return json({pages:result.results||[]},200,headers);
   }
   if(url.pathname==="/api/pages" && request.method==="POST") {
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const body=await request.json(); const title=String(body.title||"").trim(); const description=String(body.description||"").trim(); const destination=String(body.destinationUrl||"").trim();
    if(title.length<2||title.length>80) return json({error:"Page title must be between 2 and 80 characters."},400,headers);
    if(!/^https?:\/\//i.test(destination)||destination.length>2048) return json({error:"Enter a valid destination URL starting with http:// or https://."},400,headers);
    const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM pages WHERE user_id=? AND status!='deleted'").bind(user.id).first();
    const plan=await env.DB.prepare("SELECT limits_json FROM plans WHERE id=?").bind(user.plan).first();
    const limit=JSON.parse(plan?.limits_json||'{"pages":1}').pages;
    if(limit!==-1 && Number(count?.total||0)>=limit) return json({error:"Your Free plan allows 1 page. Upgrade to create more."},403,headers);
    const id=crypto.randomUUID(); const slug=random(6).toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8);
    await env.DB.prepare("INSERT INTO pages (id,user_id,title,slug,description,destination_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)").bind(id,user.id,title,slug,description,destination,Date.now(),Date.now()).run();
    return json({page:{id,title,slug,description,destination_url:destination,status:"active",created_at:Date.now()}},201,headers);
   }
   const pageMatch=url.pathname.match(/^\/api\/pages\/([a-f0-9-]+)$/i);
   if(pageMatch && ["PUT","DELETE"].includes(request.method)) {
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const page=await env.DB.prepare("SELECT id FROM pages WHERE id=? AND user_id=? AND status!='deleted'").bind(pageMatch[1],user.id).first();
    if(!page) return json({error:"Page not found."},404,headers);
    if(request.method==="DELETE") {
     await env.DB.prepare("UPDATE pages SET status='deleted',updated_at=? WHERE id=? AND user_id=?").bind(Date.now(),page.id,user.id).run();
     return json({ok:true},200,headers);
    }
    const body=await request.json(); const title=String(body.title||"").trim(); const description=String(body.description||"").trim(); const destination=String(body.destinationUrl||"").trim();
    if(title.length<2||title.length>80) return json({error:"Page title must be between 2 and 80 characters."},400,headers);
    if(!/^https?:\/\//i.test(destination)||destination.length>2048) return json({error:"Enter a valid destination URL starting with http:// or https://."},400,headers);
    await env.DB.prepare("UPDATE pages SET title=?,description=?,destination_url=?,updated_at=? WHERE id=? AND user_id=?").bind(title,description,destination,Date.now(),page.id,user.id).run();
    return json({ok:true},200,headers);
   }
   if(url.pathname==="/api/bio" && request.method==="GET") {
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const profile=await env.DB.prepare("SELECT id,username,display_name,bio,avatar_url,theme FROM bio_profiles WHERE user_id=?").bind(user.id).first();
    if(!profile) return json({profile:null,links:[]},200,headers);
    const links=await env.DB.prepare("SELECT id,title,url,icon,position,is_active,clicks FROM bio_links WHERE profile_id=? ORDER BY position ASC").bind(profile.id).all();
    return json({profile,links:links.results||[]},200,headers);
   }
   if(url.pathname==="/api/bio" && request.method==="PUT") {
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const body=await request.json(); const username=String(body.username||"").trim().toLowerCase();
    const displayName=String(body.displayName||"").trim(); const bio=String(body.bio||"").trim();
    const avatarUrl=String(body.avatarUrl||"").trim(); const theme=["midnight","light","rose"].includes(body.theme)?body.theme:"midnight";
    const links=Array.isArray(body.links)?body.links:[];
    if(!/^[a-z0-9_]{3,24}$/.test(username)||["admin","api","login","register","settings","p","bio"].includes(username)) return json({error:"Username must be 3–24 characters (letters, numbers, underscore)."},400,headers);
    if(displayName.length<2||displayName.length>60) return json({error:"Display name must be 2–60 characters."},400,headers);
    if(bio.length>160) return json({error:"Bio must be 160 characters or less."},400,headers);
    if(avatarUrl && (!/^https?:\/\//i.test(avatarUrl)||avatarUrl.length>2048)) return json({error:"Avatar must be a valid image URL."},400,headers);
    if(links.length>20) return json({error:"You can add up to 20 links."},400,headers);
    for(const item of links){
      const title=String(item?.title||"").trim(); const linkUrl=String(item?.url||"").trim();
    }
    const existing=await env.DB.prepare("SELECT id FROM bio_profiles WHERE user_id=?").bind(user.id).first();
    const conflict=await env.DB.prepare("SELECT id,user_id FROM bio_profiles WHERE username=? COLLATE NOCASE").bind(username).first();
    if(conflict && conflict.user_id!==user.id) return json({error:"That username is already taken."},409,headers);
    const now=Date.now(); const profileId=existing?.id||crypto.randomUUID();
    await env.DB.prepare("INSERT INTO bio_profiles (id,user_id,username,display_name,bio,avatar_url,theme,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,bio=excluded.bio,avatar_url=excluded.avatar_url,theme=excluded.theme,updated_at=excluded.updated_at")
      .bind(profileId,user.id,username,displayName,bio,avatarUrl,theme,now,now).run();
    await env.DB.prepare("DELETE FROM bio_links WHERE profile_id=?").bind(profileId).run();
    for(let i=0;i<links.length;i++){
      const item=links[i]||{}; const title=String(item.title||"").trim(); const linkUrl=String(item.url||"").trim(); const icon=String(item.icon||"link").slice(0,24);
      if(!title||title.length>60||!/^https?:\/\//i.test(linkUrl)||linkUrl.length>2048) return json({error:"Each link needs a title and a valid http(s) URL."},400,headers);
      await env.DB.prepare("INSERT INTO bio_links (id,profile_id,title,url,icon,position,is_active,created_at) VALUES (?,?,?,?,?,?,1,?)").bind(crypto.randomUUID(),profileId,title,linkUrl,icon,i,now).run();
    }
    return json({ok:true,username},200,headers);
   }
   if(url.pathname.startsWith("/api/")) return json({error:"API endpoint not found."},404,headers);
   return env.ASSETS.fetch(request);
  } catch(error) {
   console.error("OrbitDesk API error",error);
   return json({error:"Something went wrong. Please try again."},500,headers);
  }
 }
};
