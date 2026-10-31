export async function onRequest({request,env,params}) {
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed.",{status:405,headers:{Allow:"GET, HEAD"}});
  const id=String(params.id||"");
  if(!/^[a-f0-9-]{30,40}$/i.test(id))return new Response("Link not found.",{status:404});
  try {
    const link=await env.DB.prepare("SELECT l.id,l.url,p.user_id FROM bio_links l JOIN bio_profiles p ON p.id=l.profile_id WHERE l.id=? AND l.is_active=1").bind(id).first();
    if(!link)return new Response("Link not found.",{status:404});
    try {
      const referrer=request.headers.get("Referer")?new URL(request.headers.get("Referer")).hostname:"";
      await env.DB.prepare("INSERT INTO analytics_events (id,user_id,event_type,resource_type,resource_id,country,referrer,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),link.user_id,"bio_click","bio_link",link.id,request.cf?.country||"Unknown",referrer,Date.now()).run();
    } catch(trackingError) { console.error("Analytics tracking failed",trackingError); }
    return Response.redirect(link.url,302);
  } catch(error) {
    console.error("OrbitDesk Bio link redirect error",error);
    return new Response("Unable to open this link right now.",{status:500});
  }
}
