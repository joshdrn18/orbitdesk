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
async function isToolEnabled(env,key) { const row=await env.DB.prepare("SELECT enabled FROM tool_settings WHERE tool_key=?").bind(key).first(); return !row || Number(row.enabled)!==0; }
async function readSetting(env,key,fallback="") { const row=await env.DB.prepare("SELECT setting_value FROM system_settings WHERE setting_key=?").bind(key).first(); return row?.setting_value ?? fallback; }
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
    if((await readSetting(env,"allow_registration","true"))!=="true") return json({error:"New registrations are temporarily disabled."},403,headers);
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


   if(url.pathname==="/api/public/config" && request.method==="GET") {
    const [tools,maintenance,maintenanceMessage,announcementEnabled,announcementMessage]=await Promise.all([
     env.DB.prepare("SELECT tool_key,enabled FROM tool_settings").all(),
     readSetting(env,"maintenance_mode","false"),
     readSetting(env,"maintenance_message",""),
     readSetting(env,"announcement_enabled","false"),
     readSetting(env,"announcement_message","")
    ]);
    return json({tools:Object.fromEntries((tools.results||[]).map(x=>[x.tool_key,Number(x.enabled)===1])),maintenance:maintenance==="true",maintenanceMessage,announcement:announcementEnabled==="true"?announcementMessage:""},200,headers);
   }
   // Admin Control Center — every route is protected by the signed-in admin role.
   if(url.pathname.startsWith("/api/admin")) {
    const admin=await currentUser(request,env);
    if(!admin) return json({error:"Please sign in to continue."},401,headers);
    if(admin.role!=="admin") return json({error:"Admin access required."},403,headers);
    const audit=async(action,targetType=null,targetId=null,metadata=null)=>env.DB.prepare("INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,action,targetType,targetId,metadata?JSON.stringify(metadata):null,Date.now()).run();

    if(url.pathname==="/api/admin/overview" && request.method==="GET") {
     const [users,active,suspended,banned,premium,plans,usage,recent]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE status='active'").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE status='suspended'").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE status='banned'").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE plan IN ('premium','business')").first(),
      env.DB.prepare("SELECT id,name,monthly_price_cents,limits_json,active FROM plans ORDER BY monthly_price_cents ASC").all(),
      env.DB.prepare("SELECT metric,SUM(quantity) AS total FROM usage_counters GROUP BY metric ORDER BY total DESC LIMIT 8").all(),
      env.DB.prepare("SELECT id,email,display_name,role,plan,status,created_at FROM users ORDER BY created_at DESC LIMIT 8").all()
     ]);
     return json({stats:{users:users.total||0,active:active.total||0,suspended:suspended.total||0,banned:banned.total||0,premium:premium.total||0},plans:plans.results||[],usage:usage.results||[],recent:recent.results||[]},200,headers);
    }
    if(url.pathname==="/api/admin/users" && request.method==="GET") {
     const q=(url.searchParams.get("q")||"").trim().slice(0,100);
     const status=url.searchParams.get("status")||"";
     const plan=url.searchParams.get("plan")||"";
     const rows=await env.DB.prepare("SELECT u.id,u.email,u.display_name,u.role,u.plan,u.status,u.created_at,o.limits_json AS limit_overrides FROM users u LEFT JOIN user_limit_overrides o ON o.user_id=u.id WHERE (?='' OR u.email LIKE ? OR u.display_name LIKE ?) AND (?='' OR u.status=?) AND (?='' OR u.plan=?) ORDER BY u.created_at DESC LIMIT 100")
      .bind(q,q?"%"+q+"%":"",q?"%"+q+"%":"",status,status,plan,plan).all();
     return json({users:rows.results||[]},200,headers);
    }
    const userMatch=url.pathname.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/i);
    if(userMatch && request.method==="PATCH") {
     const targetId=userMatch[1];
     if(targetId===admin.id) return json({error:"You cannot change your own admin account here."},400,headers);
     const target=await env.DB.prepare("SELECT id,role,plan,status FROM users WHERE id=?").bind(targetId).first();
     if(!target) return json({error:"User not found."},404,headers);
     const body=await request.json();
     const nextStatus=body.status===undefined?target.status:String(body.status);
     const nextPlan=body.plan===undefined?target.plan:String(body.plan);
     if(!["active","suspended","banned"].includes(nextStatus)) return json({error:"Invalid account status."},400,headers);
     const validPlan=await env.DB.prepare("SELECT id FROM plans WHERE id=? AND active=1").bind(nextPlan).first();
     if(!validPlan) return json({error:"Select an active plan."},400,headers);
     await env.DB.prepare("UPDATE users SET status=?,plan=?,updated_at=? WHERE id=?").bind(nextStatus,nextPlan,Date.now(),targetId).run();
     if(body.limits!==undefined) {
      if(body.limits===null) await env.DB.prepare("DELETE FROM user_limit_overrides WHERE user_id=?").bind(targetId).run();
      else {
       if(!body.limits||typeof body.limits!=="object"||Array.isArray(body.limits)) return json({error:"Limits must be a JSON object."},400,headers);
       const clean={};
       for(const [key,value] of Object.entries(body.limits)) {
        if(!/^[a-z_]{2,40}$/.test(key)||!Number.isInteger(value)||value < -1||value>100000000) return json({error:"Each limit must be an integer from -1 to 100000000."},400,headers);
        clean[key]=value;
       }
       await env.DB.prepare("INSERT INTO user_limit_overrides (user_id,limits_json,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET limits_json=excluded.limits_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(targetId,JSON.stringify(clean),admin.id,Date.now()).run();
      }
     }
     await audit("user.updated","user",targetId,{status:nextStatus,plan:nextPlan,limitsChanged:body.limits!==undefined});
     return json({ok:true},200,headers);
    }
    if(url.pathname==="/api/admin/plans" && request.method==="GET") {
     const rows=await env.DB.prepare("SELECT id,name,monthly_price_cents,limits_json,active FROM plans ORDER BY monthly_price_cents ASC").all();
     return json({plans:rows.results||[]},200,headers);
    }
    const planMatch=url.pathname.match(/^\/api\/admin\/plans\/([a-z]+)$/i);
    if(planMatch && request.method==="PATCH") {
     const plan=await env.DB.prepare("SELECT id FROM plans WHERE id=?").bind(planMatch[1]).first();
     if(!plan) return json({error:"Plan not found."},404,headers);
     const body=await request.json();
     if(body.name!==undefined && (typeof body.name!=="string"||body.name.trim().length<2||body.name.length>40)) return json({error:"Plan name must be 2–40 characters."},400,headers);
     if(body.monthly_price_cents!==undefined && (!Number.isInteger(body.monthly_price_cents)||body.monthly_price_cents<0||body.monthly_price_cents>100000000)) return json({error:"Invalid plan price."},400,headers);
     if(body.limits!==undefined && (!body.limits||typeof body.limits!=="object"||Array.isArray(body.limits)||Object.values(body.limits).some(v=>!Number.isInteger(v)||v < -1||v>100000000))) return json({error:"Plan limits must be integer values."},400,headers);
     if(body.active!==undefined && typeof body.active!=="boolean") return json({error:"Active must be true or false."},400,headers);
     const current=await env.DB.prepare("SELECT name,monthly_price_cents,limits_json,active FROM plans WHERE id=?").bind(planMatch[1]).first();
     await env.DB.prepare("UPDATE plans SET name=?,monthly_price_cents=?,limits_json=?,active=? WHERE id=?").bind(body.name===undefined?current.name:body.name.trim(),body.monthly_price_cents===undefined?current.monthly_price_cents:body.monthly_price_cents,body.limits===undefined?current.limits_json:JSON.stringify(body.limits),body.active===undefined?current.active:(body.active?1:0),planMatch[1]).run();
     await audit("plan.updated","plan",planMatch[1],body);
     return json({ok:true},200,headers);
    }
    if(url.pathname==="/api/admin/tools" && request.method==="GET") {
     const rows=await env.DB.prepare("SELECT tool_key,name,description,enabled,updated_at FROM tool_settings ORDER BY name").all();
     return json({tools:rows.results||[]},200,headers);
    }
    const toolMatch=url.pathname.match(/^\/api\/admin\/tools\/([a-z_]+)$/);
    if(toolMatch && request.method==="PATCH") {
     const body=await request.json();
     if(typeof body.enabled!=="boolean") return json({error:"enabled must be true or false."},400,headers);
     const result=await env.DB.prepare("UPDATE tool_settings SET enabled=?,updated_by=?,updated_at=? WHERE tool_key=?").bind(body.enabled?1:0,admin.id,Date.now(),toolMatch[1]).run();
     if(!result.meta?.changes) return json({error:"Tool not found."},404,headers);
     await audit("tool.toggled","tool",toolMatch[1],{enabled:body.enabled});
     return json({ok:true},200,headers);
    }
    if(url.pathname==="/api/admin/settings" && request.method==="GET") {
     const rows=await env.DB.prepare("SELECT setting_key,setting_value,updated_at FROM system_settings ORDER BY setting_key").all();
     return json({settings:rows.results||[]},200,headers);
    }
    if(url.pathname==="/api/admin/settings" && request.method==="PUT") {
     const body=await request.json();
     const allowed=["maintenance_mode","maintenance_message","allow_registration","announcement_enabled","announcement_message"];
     for(const key of allowed) if(body[key]!==undefined) {
      const value=String(body[key]);
      if(value.length>1000) return json({error:"A setting value is too long."},400,headers);
      await env.DB.prepare("INSERT INTO system_settings (setting_key,setting_value,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(key,value,admin.id,Date.now()).run();
     }
     await audit("settings.updated","system",null,{keys:Object.keys(body).filter(k=>allowed.includes(k))});
     return json({ok:true},200,headers);
    }
    if(url.pathname==="/api/admin/audit" && request.method==="GET") {
     const rows=await env.DB.prepare("SELECT a.id,a.action,a.target_type,a.target_id,a.metadata_json,a.created_at,u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 100").all();
     return json({logs:rows.results||[]},200,headers);
    }
    if(url.pathname==="/api/admin/announcements" && request.method==="GET") {
     const rows=await env.DB.prepare("SELECT id,title,message,is_active,created_at FROM announcements ORDER BY created_at DESC LIMIT 50").all();
     return json({announcements:rows.results||[]},200,headers);
    }
    if(url.pathname==="/api/admin/announcements" && request.method==="POST") {
     const body=await request.json(); const title=String(body.title||"").trim(); const message=String(body.message||"").trim();
     if(title.length<3||title.length>100||message.length<3||message.length>1000) return json({error:"Title must be 3–100 characters and message 3–1000 characters."},400,headers);
     const id=crypto.randomUUID();
     await env.DB.prepare("INSERT INTO announcements (id,title,message,is_active,created_by,created_at) VALUES (?,?,?,1,?,?)").bind(id,title,message,admin.id,Date.now()).run();
     await env.DB.prepare("INSERT INTO system_settings (setting_key,setting_value,updated_by,updated_at) VALUES ('announcement_enabled','true',?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='true',updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(admin.id,Date.now()).run();
     await env.DB.prepare("INSERT INTO system_settings (setting_key,setting_value,updated_by,updated_at) VALUES ('announcement_message',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(title+": "+message,admin.id,Date.now()).run();
     await audit("announcement.created","announcement",id,{title});
     return json({ok:true,id},201,headers);
    }
    return json({error:"Admin endpoint not found."},404,headers);
   }

   const maintenanceMode=(await readSetting(env,"maintenance_mode","false"))==="true";
   const isAuthPath=url.pathname.startsWith("/api/auth/")||url.pathname.startsWith("/api/health");
   if(maintenanceMode&&!isAuthPath&&!url.pathname.startsWith("/api/admin")) {
    const visitor=await currentUser(request,env);
    if(visitor?.role!=="admin") return json({error:await readSetting(env,"maintenance_message","OrbitDesk is undergoing scheduled maintenance.")},503,headers);
   }
   const publicPageMatch=url.pathname.match(/^\/p\/([a-z0-9]+)$/i);
   if(publicPageMatch && request.method==="GET") {
    if(!(await isToolEnabled(env,"pages"))) return new Response("This tool is temporarily unavailable.",{status:503,headers:{"content-type":"text/plain; charset=utf-8"}});
    const page=await env.DB.prepare("SELECT destination_url FROM pages WHERE slug=? AND status='active'").bind(publicPageMatch[1]).first();
    if(!page) return new Response("Page not found.",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
    return Response.redirect(page.destination_url,302);
   }
   if(url.pathname==="/api/pages" && request.method==="GET") {
    if(!(await isToolEnabled(env,"pages"))) return json({error:"My Pages is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const result=await env.DB.prepare("SELECT id,title,slug,description,destination_url,status,created_at,updated_at FROM pages WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
    return json({pages:result.results||[]},200,headers);
   }
   if(url.pathname==="/api/pages" && request.method==="POST") {
    if(!(await isToolEnabled(env,"pages"))) return json({error:"My Pages is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const body=await request.json(); const title=String(body.title||"").trim(); const description=String(body.description||"").trim(); const destination=String(body.destinationUrl||"").trim();
    if(title.length<2||title.length>80) return json({error:"Page title must be between 2 and 80 characters."},400,headers);
    if(!/^https?:\/\//i.test(destination)||destination.length>2048) return json({error:"Enter a valid destination URL starting with http:// or https://."},400,headers);
    const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM pages WHERE user_id=? AND status!='deleted'").bind(user.id).first();
    const plan=await env.DB.prepare("SELECT limits_json FROM plans WHERE id=?").bind(user.plan).first();
    const override=await env.DB.prepare("SELECT limits_json FROM user_limit_overrides WHERE user_id=?").bind(user.id).first();
    const baseLimits=JSON.parse(plan?.limits_json||'{"pages":1}');
    const customLimits=JSON.parse(override?.limits_json||"{}");
    const limit={...baseLimits,...customLimits}.pages??1;
    if(limit!==-1 && Number(count?.total||0)>=limit) return json({error:"Your Free plan allows 1 page. Upgrade to create more."},403,headers);
    const id=crypto.randomUUID(); const slug=random(6).toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8);
    await env.DB.prepare("INSERT INTO pages (id,user_id,title,slug,description,destination_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)").bind(id,user.id,title,slug,description,destination,Date.now(),Date.now()).run();
    return json({page:{id,title,slug,description,destination_url:destination,status:"active",created_at:Date.now()}},201,headers);
   }
   const pageMatch=url.pathname.match(/^\/api\/pages\/([a-f0-9-]+)$/i);
   if(pageMatch && ["PUT","DELETE"].includes(request.method)) {
    if(!(await isToolEnabled(env,"pages"))) return json({error:"My Pages is temporarily disabled."},503,headers);
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
   if(url.pathname==="/api/forms" && request.method==="GET") {
    if(!(await isToolEnabled(env,"forms"))) return json({error:"Forms is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const rows=await env.DB.prepare("SELECT f.id,f.title,f.description,f.slug,f.fields_json,f.status,f.created_at,f.updated_at,(SELECT COUNT(*) FROM form_submissions s WHERE s.form_id=f.id) AS submission_count FROM forms f WHERE f.user_id=? ORDER BY f.created_at DESC").bind(user.id).all();
    return json({forms:rows.results||[]},200,headers);
   }
   if(url.pathname==="/api/forms" && request.method==="POST") {
    if(!(await isToolEnabled(env,"forms"))) return json({error:"Forms is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const body=await request.json(); const title=String(body.title||"").trim(); const description=String(body.description||"").trim(); const slug=String(body.slug||"").trim().toLowerCase(); const fields=Array.isArray(body.fields)?body.fields:[]; const status=String(body.status||"draft");
    if(title.length<2||title.length>100||description.length>500) return json({error:"Form title must be 2–100 characters and description up to 500 characters."},400,headers);
    if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return json({error:"Form URL must be 3–40 characters using letters, numbers and hyphens."},400,headers);
    if(fields.length>30||!["draft","published","closed"].includes(status)||(status==="published"&&fields.length===0)) return json({error:"Add at least one question before publishing. Forms can have up to 30 questions."},400,headers);
    for(const field of fields){if(!field||typeof field!=="object"||!String(field.label||"").trim()||String(field.label).length>120||!["text","email","textarea","select","checkbox"].includes(field.type)||((field.type==="select")&&(!Array.isArray(field.options)||field.options.length<1||field.options.length>20)))return json({error:"Check your questions. Each question needs a label and valid field type/options."},400,headers);}
    const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM forms WHERE user_id=?").bind(user.id).first();
    const plan=await env.DB.prepare("SELECT limits_json FROM plans WHERE id=?").bind(user.plan).first();
    let limit=2;try{limit=JSON.parse(plan?.limits_json||'{"forms":2}').forms??2;}catch{}
    if(limit!==-1&&Number(count?.total||0)>=limit)return json({error:"You have reached your form limit for this plan."},403,headers);
    const conflict=await env.DB.prepare("SELECT id FROM forms WHERE slug=? COLLATE NOCASE").bind(slug).first();if(conflict)return json({error:"That form URL is already taken."},409,headers);
    const id=crypto.randomUUID(),now=Date.now();
    await env.DB.prepare("INSERT INTO forms (id,user_id,title,description,slug,fields_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,description,slug,JSON.stringify(fields),status,now,now).run();
    return json({ok:true,id},201,headers);
   }
   const formMatch=url.pathname.match(/^\/api\/forms\/([a-f0-9-]+)(?:\/(submissions))?$/i);
   if(formMatch) {
    if(!(await isToolEnabled(env,"forms"))) return json({error:"Forms is temporarily disabled."},503,headers);
    const user=await currentUser(request,env);if(!user)return json({error:"Please sign in to continue."},401,headers);
    const form=await env.DB.prepare("SELECT id FROM forms WHERE id=? AND user_id=?").bind(formMatch[1],user.id).first();if(!form)return json({error:"Form not found."},404,headers);
    if(formMatch[2]&&request.method==="GET"){
     const rows=await env.DB.prepare("SELECT id,answers_json,submitted_at FROM form_submissions WHERE form_id=? ORDER BY submitted_at DESC LIMIT 500").bind(form.id).all();
     return json({submissions:(rows.results||[]).map(row=>({...row,answers:JSON.parse(row.answers_json||"{}")}))},200,headers);
    }
    if(!formMatch[2]&&request.method==="PUT"){
     const body=await request.json();const title=String(body.title||"").trim();const description=String(body.description||"").trim();const slug=String(body.slug||"").trim().toLowerCase();const fields=Array.isArray(body.fields)?body.fields:[];const status=String(body.status||"draft");
     if(title.length<2||title.length>100||description.length>500||!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)||fields.length>30||!["draft","published","closed"].includes(status)||(status==="published"&&fields.length===0))return json({error:"Add at least one question before publishing and check your form details."},400,headers);
     for(const field of fields){if(!field||!String(field.label||"").trim()||String(field.label).length>120||!["text","email","textarea","select","checkbox"].includes(field.type)||field.type==="select"&&(!Array.isArray(field.options)||field.options.length<1||field.options.length>20))return json({error:"Check your questions and options."},400,headers);}
     const conflict=await env.DB.prepare("SELECT id FROM forms WHERE slug=? COLLATE NOCASE AND id!=?").bind(slug,form.id).first();if(conflict)return json({error:"That form URL is already taken."},409,headers);
     await env.DB.prepare("UPDATE forms SET title=?,description=?,slug=?,fields_json=?,status=?,updated_at=? WHERE id=? AND user_id=?").bind(title,description,slug,JSON.stringify(fields),status,Date.now(),form.id,user.id).run();
     return json({ok:true},200,headers);
    }
    if(!formMatch[2]&&request.method==="DELETE"){await env.DB.prepare("DELETE FROM forms WHERE id=? AND user_id=?").bind(form.id,user.id).run();return json({ok:true},200,headers);}
   }
   if(url.pathname.match(/^\/api\/public\/forms\/[a-z0-9-]+\/submissions$/i)&&request.method==="POST"){
    const slug=url.pathname.split("/")[4].toLowerCase();
    const form=await env.DB.prepare("SELECT id,fields_json FROM forms WHERE slug=? COLLATE NOCASE AND status='published'").bind(slug).first();
    if(!form)return json({error:"This form is not accepting responses."},404,headers);
    const body=await request.json();const answers=body?.answers;
    if(!answers||typeof answers!=="object"||Array.isArray(answers)||JSON.stringify(answers).length>20000)return json({error:"Invalid form response."},400,headers);
    const fields=JSON.parse(form.fields_json||"[]");
    for(const field of fields){const value=answers[field.id];const textValue=field.type==="checkbox"?(value===true?"yes":""):(Array.isArray(value)?value.join(","):String(value??"").trim());if(field.required&&!textValue)return json({error:"Please complete: "+field.label},400,headers);if(textValue.length>4000)return json({error:"One of your answers is too long."},400,headers);if(field.type==="email"&&textValue&&!validEmail(textValue))return json({error:"Enter a valid email address for "+field.label},400,headers);if(field.type==="select"&&textValue&&!field.options.includes(textValue))return json({error:"Invalid option for "+field.label},400,headers);}
    await env.DB.prepare("INSERT INTO form_submissions (id,form_id,answers_json,submitted_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),form.id,JSON.stringify(answers),Date.now()).run();
    return json({ok:true,message:"Your response has been submitted."},201,headers);
   }
   if(url.pathname==="/api/products" && request.method==="GET") {
    if(!(await isToolEnabled(env,"products"))) return json({error:"Products is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const rows=await env.DB.prepare("SELECT id,name,description,price_cents,currency,category,image_url,status,bio_enabled,store_enabled,created_at,updated_at FROM products WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
    return json({products:rows.results||[]},200,headers);
   }
   if(url.pathname==="/api/products" && request.method==="POST") {
    if(!(await isToolEnabled(env,"products"))) return json({error:"Products is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const body=await request.json(); const name=String(body.name||"").trim(); const description=String(body.description||"").trim(); const category=String(body.category||"").trim(); const imageUrl=String(body.image_url||"").trim(); const currency=String(body.currency||"USD").toUpperCase(); const price=Number(body.price_cents); const status=String(body.status||"active");
    if(name.length<2||name.length>120) return json({error:"Product name must be 2–120 characters."},400,headers);
    if(description.length>2000||category.length>60) return json({error:"Description or category is too long."},400,headers);
    if(!Number.isInteger(price)||price<0||price>100000000000) return json({error:"Enter a valid product price."},400,headers);
    if(!["USD","MYR","IDR","SGD","EUR","GBP"].includes(currency)) return json({error:"Unsupported currency."},400,headers);
    if(imageUrl && (!/^https:\/\//i.test(imageUrl)||imageUrl.length>2048)) return json({error:"Product image must be a valid HTTPS URL."},400,headers);
    if(!["active","draft","archived"].includes(status)) return json({error:"Invalid product status."},400,headers);
    const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM products WHERE user_id=?").bind(user.id).first();
    const plan=await env.DB.prepare("SELECT limits_json FROM plans WHERE id=?").bind(user.plan).first();
    const override=await env.DB.prepare("SELECT limits_json FROM user_limit_overrides WHERE user_id=?").bind(user.id).first();
    const baseLimits=JSON.parse(plan?.limits_json||'{"products":10}'); const customLimits=JSON.parse(override?.limits_json||"{}"); const limit={...baseLimits,...customLimits}.products??10;
    if(limit!==-1 && Number(count?.total||0)>=limit) return json({error:"You have reached your product limit for this plan."},403,headers);
    const id=crypto.randomUUID(); const now=Date.now();
    await env.DB.prepare("INSERT INTO products (id,user_id,name,description,price_cents,currency,category,image_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,name,description,price,currency,category,imageUrl,status,now,now).run();
    return json({ok:true,id},201,headers);
   }
   const productMatch=url.pathname.match(/^\/api\/products\/([a-f0-9-]+)$/i);
   if(productMatch && ["PUT","DELETE"].includes(request.method)) {
    if(!(await isToolEnabled(env,"products"))) return json({error:"Products is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const product=await env.DB.prepare("SELECT id FROM products WHERE id=? AND user_id=?").bind(productMatch[1],user.id).first();
    if(!product) return json({error:"Product not found."},404,headers);
    if(request.method==="DELETE") { await env.DB.prepare("DELETE FROM products WHERE id=? AND user_id=?").bind(product.id,user.id).run(); return json({ok:true},200,headers); }
    const body=await request.json(); const name=String(body.name||"").trim(); const description=String(body.description||"").trim(); const category=String(body.category||"").trim(); const imageUrl=String(body.image_url||"").trim(); const currency=String(body.currency||"USD").toUpperCase(); const price=Number(body.price_cents); const status=String(body.status||"active");
    if(name.length<2||name.length>120||description.length>2000||category.length>60) return json({error:"Check product name, description and category."},400,headers);
    if(!Number.isInteger(price)||price<0||price>100000000000) return json({error:"Enter a valid product price."},400,headers);
    if(!["USD","MYR","IDR","SGD","EUR","GBP"].includes(currency)) return json({error:"Unsupported currency."},400,headers);
    if(imageUrl && (!/^https:\/\//i.test(imageUrl)||imageUrl.length>2048)) return json({error:"Product image must be a valid HTTPS URL."},400,headers);
    if(!["active","draft","archived"].includes(status)) return json({error:"Invalid product status."},400,headers);
    await env.DB.prepare("UPDATE products SET name=?,description=?,price_cents=?,currency=?,category=?,image_url=?,status=?,bio_enabled=?,store_enabled=?,updated_at=? WHERE id=? AND user_id=?").bind(name,description,price,currency,category,imageUrl,status,body.bio_enabled?1:0,body.store_enabled?1:0,Date.now(),product.id,user.id).run();
    return json({ok:true},200,headers);
   }
   if(url.pathname==="/api/product-store" && request.method==="GET") {
    if(!(await isToolEnabled(env,"products"))) return json({error:"Products is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const store=await env.DB.prepare("SELECT slug,store_name,description,logo_url,theme,enabled FROM product_stores WHERE user_id=?").bind(user.id).first();
    return json({store:store||null},200,headers);
   }
   if(url.pathname==="/api/product-store" && request.method==="PUT") {
    if(!(await isToolEnabled(env,"products"))) return json({error:"Products is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const body=await request.json(); const slug=String(body.slug||"").trim().toLowerCase(); const storeName=String(body.store_name||"").trim(); const description=String(body.description||"").trim(); const logoUrl=String(body.logo_url||"").trim(); const theme=["midnight","light","rose"].includes(body.theme)?body.theme:"midnight";
    if(!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) return json({error:"Store URL must be 3–30 characters using letters, numbers and hyphens."},400,headers);
    if(storeName.length<2||storeName.length>60||description.length>240) return json({error:"Store name must be 2–60 characters and description up to 240 characters."},400,headers);
    if(logoUrl && (!/^https:\/\//i.test(logoUrl)||logoUrl.length>2048)) return json({error:"Logo must be a valid HTTPS URL."},400,headers);
    const conflict=await env.DB.prepare("SELECT user_id FROM product_stores WHERE slug=? COLLATE NOCASE").bind(slug).first();
    if(conflict&&conflict.user_id!==user.id) return json({error:"That store URL is already taken."},409,headers);
    const id=crypto.randomUUID(),now=Date.now();
    await env.DB.prepare("INSERT INTO product_stores (id,user_id,slug,store_name,description,logo_url,theme,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET slug=excluded.slug,store_name=excluded.store_name,description=excluded.description,logo_url=excluded.logo_url,theme=excluded.theme,enabled=excluded.enabled,updated_at=excluded.updated_at")
     .bind(id,user.id,slug,storeName,description,logoUrl,theme,body.enabled?1:0,now,now).run();
    return json({ok:true,store:{slug,store_name:storeName,description,logo_url:logoUrl,theme,enabled:body.enabled?1:0}},200,headers);
   }
   if(url.pathname==="/api/bio" && request.method==="GET") {
    if(!(await isToolEnabled(env,"bio_pages"))) return json({error:"Bio Pages is temporarily disabled."},503,headers);
    const user=await currentUser(request,env); if(!user) return json({error:"Please sign in to continue."},401,headers);
    const profile=await env.DB.prepare("SELECT id,username,display_name,bio,avatar_url,theme FROM bio_profiles WHERE user_id=?").bind(user.id).first();
    if(!profile) return json({profile:null,links:[]},200,headers);
    const links=await env.DB.prepare("SELECT id,title,url,icon,position,is_active,clicks FROM bio_links WHERE profile_id=? ORDER BY position ASC").bind(profile.id).all();
    return json({profile,links:links.results||[]},200,headers);
   }
   if(url.pathname==="/api/bio" && request.method==="PUT") {
    if(!(await isToolEnabled(env,"bio_pages"))) return json({error:"Bio Pages is temporarily disabled."},503,headers);
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
      if(!title||title.length>60||!(linkUrl.toLowerCase().startsWith("https://")||linkUrl.toLowerCase().startsWith("http://"))||linkUrl.length>2048) return json({error:"Each link needs a title and a valid http(s) URL."},400,headers);
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
