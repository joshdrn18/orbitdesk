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
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:310000, hash:"SHA-256" }, key, 256);
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
   if(url.pathname.startsWith("/api/")) return json({error:"API endpoint not found."},404,headers);
   return env.ASSETS.fetch(request);
  } catch(error) {
   console.error("OrbitDesk API error",error);
   return json({error:"Something went wrong. Please try again."},500,headers);
  }
 }
};
