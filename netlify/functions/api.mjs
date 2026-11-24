import postgres from 'postgres';
import { randomBytes, randomUUID, createHash, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
let client;
const db = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  return client ||= postgres(process.env.DATABASE_URL, {
    max: 1, prepare: false, idle_timeout: 20, connect_timeout: 15,
    ssl: 'require'
  });
};
const q = (statement, params = []) => db().unsafe(statement, params);
const id = () => randomUUID();
const now = () => new Date().toISOString();
const clean = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length < 255;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const safeEq = (a, b) => { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); };
const passwordHash = async p => { const salt=randomBytes(16); const key=await scrypt(p,salt,64); return `${salt.toString('hex')}:${Buffer.from(key).toString('hex')}`; };
const verifyPassword = async (p, stored) => { try { const [s,k]=stored.split(':'); const key=Buffer.from(await scrypt(p,Buffer.from(s,'hex'),64)); return safeEq(key.toString('hex'),k); } catch { return false; } };
const parseCookies = s => Object.fromEntries((s||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
const cookie = (name,value,maxAge=604800) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
const clearCookie = () => cookie('eduaxis_session','',0);
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'DENY' };
const response = (status, data, extra={}) => ({ statusCode:status, headers:{...headers,...extra}, body:JSON.stringify(data) });
const fail = (status, message) => response(status,{error:message});
const body = event => { try { return event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body,'base64').toString('utf8') : event.body) : {}; } catch { return null; } };

async function ensureAdmin() {
  const email=clean(process.env.ADMIN_EMAIL,254).toLowerCase();
  const password=String(process.env.ADMIN_PASSWORD||'');
  if (!emailOk(email) || password.length < 14) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 14 characters in Netlify environment variables.');
  const exists=await q('SELECT id,role FROM users WHERE email=$1',[email]);
  if (exists.length && exists[0].role !== 'admin') throw new Error('ADMIN_EMAIL already belongs to a parent account. Choose a separate administrator email.');
  if (!exists.length) await q('INSERT INTO users (id,email,password_hash,role,full_name,phone) VALUES ($1,$2,$3,$4,$5,$6)',[id(),email,await passwordHash(password),'admin','EduAxis Administrator',null]);
}
async function auth(event) {
  const token=parseCookies(event.headers?.cookie || event.headers?.Cookie).eduaxis_session;
  if (!token) return null;
  const rows=await q('SELECT s.id_hash,s.user_id,s.csrf,s.expires_at,u.email,u.role,u.full_name,u.phone FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.expires_at>$2',[hashToken(token),Date.now()]);
  return rows[0] ? {...rows[0],token} : null;
}
const csrfOk = (event,user,data) => !!user && safeEq(event.headers?.['x-csrf-token'] || event.headers?.['X-CSRF-Token'] || data?._csrf || '',user.csrf);
const memoryLimits=new Map();
function limitedInMemory(key, max, windowMs) {
  const bucket=Math.floor(Date.now()/windowMs);
  const k=`${key}:${bucket}`;
  const count=(memoryLimits.get(k)||0)+1;
  memoryLimits.set(k,count);
  if (memoryLimits.size>5000) for (const old of memoryLimits.keys()) { if (!old.endsWith(`:${bucket}`)) memoryLimits.delete(old); }
  return count>max;
}
// Best-effort variants used by the AI assistant so it keeps working even when the database is unavailable.
async function limitedSoft(key, max, windowMs=60000) {
  try { return await limited(key,max,windowMs); } catch { return limitedInMemory(key,max,windowMs); }
}
async function authSoft(event) {
  try { return await auth(event); } catch { return null; }
}
async function limited(key, max=8, windowMs=60000) {
  // Persisted fixed-window rate limiting works across Netlify function instances.
  const bucket=Math.floor(Date.now()/windowMs);
  const rows=await q(`INSERT INTO rate_limits (rate_key,bucket,count) VALUES ($1,$2,1)
    ON CONFLICT (rate_key,bucket) DO UPDATE SET count=rate_limits.count+1
    RETURNING count`,[key,bucket]);
  return Number(rows[0].count)>max;
}

export const handler = async (event) => {
  try {
    const url=new URL(event.rawUrl || `https://netlify.local${event.path||'/'}`);
    let path=url.pathname.replace(/^\/.netlify\/functions\/api/,'/api');
    if (!path.startsWith('/api/')) path='/api'+(path==='/'?'':path);
    const method=event.httpMethod || 'GET';
    if (method==='OPTIONS') return {statusCode:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-CSRF-Token'},body:''};
    if (path==='/api/health' && method==='GET') { await q('SELECT 1 AS ok'); return response(200,{ok:true,app:'EduAxis Tutor Centre',version:'2.0.0',database:'connected'}); }


    // EduAxis AI learning endpoints. The API key stays server-side in Netlify environment variables.
    if (path==='/api/ai/chat' && method==='POST') {
      const d=body(event); if(!d) return fail(400,'Invalid chat request.');
      const prompt=clean(d.prompt,6000);
      const mode=['general','teacher','language'].includes(d.mode)?d.mode:'general';
      const conversationId=clean(d.conversationId,80) || id();
      if(!prompt) return fail(400,'Please enter a question.');
      if(await limitedSoft(`ai:${event.headers?.['x-nf-client-connection-ip']||'unknown'}`,12,60000)) return fail(429,'The learning assistant is busy. Please try again in a minute.');
      const apiKey=process.env.OPENROUTER_API_KEY;
      if(!apiKey) return fail(503,'The AI learning assistant is not configured yet. Please try again later.');
      const user=await authSoft(event);
      const grade=clean(d.grade,20), subject=clean(d.subject,80), targetLanguage=clean(d.targetLanguage,60);
      const systemByMode={
        general:'You are the friendly EduAxis Book Assistant, a patient and encouraging study helper for school learners. Explain clearly, age-appropriately and step by step. Ask guiding questions rather than simply doing assessed work. Do not claim to be a human teacher. If a learner appears distressed or describes danger, encourage them to speak to a trusted adult.',
        teacher:`You are the EduAxis Teacher Assistant for South African learners. Provide CAPS-oriented tutoring, not official curriculum certification. Grade: ${grade||'not specified'}. Subject: ${subject||'not specified'}. Explain concepts in age-appropriate language, show worked examples, then give a short practice question and wait for the learner's attempt. Do not simply provide answers to homework without teaching the method. If the exact curriculum scope is uncertain, say so and ask for the topic or textbook page.`,
        language:`You are the EduAxis Language Assistant. Teach ${targetLanguage||'the learner-selected language'} in progressive lessons. Each lesson should include: lesson number/title, learning objective, vocabulary with pronunciation guidance, useful phrases, a short grammar point, dialogue, practice activity, and a mini review. Adapt to the learner's level. Include phonetic pronunciation guidance where useful.`
      };
      const prior=Array.isArray(d.messages)?d.messages.slice(-12).map(m=>({role:m.role==='assistant'?'assistant':'user',content:clean(m.content,4000)})).filter(m=>m.content):[];
      const messages=[{role:'system',content:systemByMode[mode]},...prior,{role:'user',content:prompt}];
      const responseAI=await fetch('https://openrouter.ai/api/v1/chat/completions',{
        method:'POST',
        headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json','HTTP-Referer':process.env.OPENROUTER_SITE_URL||'https://eduaxis-tutor-centre.netlify.app','X-Title':'EduAxis Tutor Centre'},
        body:JSON.stringify({model:'openrouter/free',messages,temperature:0.55,max_tokens:1200})
      });
      const result=await responseAI.json().catch(()=>({}));
      if(!responseAI.ok) {
        console.error('OpenRouter error:',responseAI.status,result?.error?.message||'unknown');
        return fail(responseAI.status===429?429:502,responseAI.status===429?'The free AI model is temporarily busy. Please try again shortly.':'The AI provider could not complete that response. Please try again.');
      }
      const answer=clean(result?.choices?.[0]?.message?.content,12000);
      if(!answer) return fail(502,'The AI provider returned an empty response. Please try again.');
      // Persist only for signed-in parents. Public/guest chats remain in the current browser session.
      if(user && user.role==='parent') try {
        const owned=await q('SELECT id FROM ai_conversations WHERE id=$1 AND user_id=$2',[conversationId,user.user_id]);
        const saveId=owned.length?conversationId:(conversationId===d.conversationId?id():conversationId);
        await q(`INSERT INTO ai_conversations (id,user_id,title,mode,created_at,updated_at)
          VALUES ($1,$2,$3,$4,NOW(),NOW())
          ON CONFLICT (id) DO UPDATE SET updated_at=NOW()
          WHERE ai_conversations.user_id=$2`,[saveId,user.user_id,prompt.slice(0,100),mode]);
        await q('INSERT INTO ai_messages (id,conversation_id,role,content,created_at) VALUES ($1,$2,$3,$4,NOW())',
          [id(),saveId,'user',prompt]);
        await q('INSERT INTO ai_messages (id,conversation_id,role,content,created_at) VALUES ($1,$2,$3,$4,NOW())',
          [id(),saveId,'assistant',answer]);
        return response(200,{ok:true,answer,conversationId:saveId,persisted:true,model:result?.model||'openrouter/free'});
      } catch (saveError) { console.error('AI conversation could not be saved:',saveError?.message||saveError); }
      return response(200,{ok:true,answer,conversationId,persisted:false,model:result?.model||'openrouter/free'});
    }
    await ensureAdmin();
    if(path==='/api/ai/history' && method==='GET') {
      const user=await auth(event); if(!user||user.role!=='parent') return fail(401,'Sign in to view saved learning conversations.');
      const rows=await q('SELECT id,title,mode,created_at,updated_at FROM ai_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 30',[user.user_id]);
      return response(200,{conversations:rows});
    }
    if(path==='/api/ai/conversation' && method==='GET') {
      const user=await auth(event); if(!user||user.role!=='parent') return fail(401,'Sign in to view saved learning conversations.');
      const cid=clean(url.searchParams.get('id'),80);
      const rows=await q('SELECT id FROM ai_conversations WHERE id=$1 AND user_id=$2',[cid,user.user_id]);
      if(!rows.length) return fail(404,'Conversation not found.');
      const messages=await q('SELECT role,content,created_at FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 100',[cid]);
      return response(200,{messages});
    }

    if (path==='/api/public' && method==='GET') {
      const [notices,resources,news,testimonials,gallery]=await Promise.all([
        q('SELECT id,title,body,created_at FROM notices WHERE published=TRUE ORDER BY created_at DESC LIMIT 10'),
        q('SELECT id,title,grade,subject,description,file_url FROM resources WHERE published=TRUE ORDER BY created_at DESC'),
        q('SELECT id,title,body,created_at FROM news WHERE published=TRUE ORDER BY created_at DESC LIMIT 10'),
        q('SELECT id,display_name,quote FROM testimonials WHERE published=TRUE AND permission_confirmed=TRUE'),
        q('SELECT id,title,image_url,alt_text FROM gallery WHERE published=TRUE AND permission_confirmed=TRUE')
      ]);
      return response(200,{business:{name:'EduAxis Tutor Centre',owner:'Vernique Santos',phone:'060 521 3315',email:'eduaxis.tutor@gmail.com',address:'738 29th Avenue, Villieria, Pretoria, Gauteng, South Africa',slogan:'Learning differently. Growing confidently.',supporting:'Building Confidence. Inspiring Growth. Creating Opportunities.',grades:'Grades 1–12',curriculum:'CAPS through Impaq; parents register children for home education.'},notices,resources,news,testimonials,gallery});
    }
    if (path==='/api/enquiry' && method==='POST') {
      if(await limited(`enq:${event.headers?.['x-nf-client-connection-ip']||'unknown'}`,6))return fail(429,'Please wait before submitting another enquiry.');
      const d=body(event);if(!d)return fail(400,'Invalid form data.');
      const parent=clean(d.parentName,120),email=clean(d.email,254),phone=clean(d.phone,40);
      if(!parent||!emailOk(email)||!phone)return fail(400,'Please provide your name, a valid email and phone number.');
      await q('INSERT INTO enquiries (id,parent_name,email,phone,learner_name,grade,service,message,created_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id(),parent,email,phone,clean(d.learnerName,120),clean(d.grade,30),clean(d.service,120),clean(d.message,3000),now(),'New']);
      return response(201,{ok:true,message:'Thank you. Your enquiry has been received. EduAxis will be in touch.'});
    }
    if (path==='/api/application' && method==='POST') {
      if(await limited(`app:${event.headers?.['x-nf-client-connection-ip']||'unknown'}`,4))return fail(429,'Please wait before submitting another application.');
      const d=body(event);if(!d)return fail(400,'Invalid form data.');
      const f=[clean(d.parentName,120),clean(d.parentEmail,254),clean(d.parentPhone,40),clean(d.learnerName,120),clean(d.grade,30)];
      if(f.some(x=>!x)||!emailOk(f[1]))return fail(400,'Complete all required parent and learner fields.');
      if(d.consent!==true)return fail(400,'Parent/guardian consent is required.');
      await q('INSERT INTO applications (id,parent_name,parent_email,parent_phone,learner_name,grade,previous_school,academic_info,support_needs,additional_info,consent,created_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12)',[id(),...f,clean(d.previousSchool,180),clean(d.academicInfo,2000),clean(d.supportNeeds,2000),clean(d.additionalInfo,2000),now(),'Received']);
      return response(201,{ok:true,message:'Your initial application has been received. Please do not email identity documents; the centre will arrange a secure process if needed.'});
    }
    if (path==='/api/booking' && method==='POST') {
      if(await limited(`book:${event.headers?.['x-nf-client-connection-ip']||'unknown'}`,5))return fail(429,'Please wait before submitting another request.');
      const d=body(event);if(!d)return fail(400,'Invalid form data.');
      const n=clean(d.parentName,120),e=clean(d.email,254),p=clean(d.phone,40),date=clean(d.date,10),time=clean(d.time,20);
      if(!n||!emailOk(e)||!p||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!time)return fail(400,'Please complete the required booking fields.');
      await q('INSERT INTO bookings (id,parent_name,email,phone,preferred_date,preferred_time,notes,created_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(),n,e,p,date,time,clean(d.notes,1000),now(),'Requested']);
      return response(201,{ok:true,message:'Your consultation request has been sent. The centre will confirm availability.'});
    }
    if (path==='/api/register' && method==='POST') {
      if(await limited(`reg:${event.headers?.['x-nf-client-connection-ip']||'unknown'}`,4))return fail(429,'Please wait before trying again.');
      const d=body(event);if(!d)return fail(400,'Invalid form data.');
      const name=clean(d.fullName,120),email=clean(d.email,254).toLowerCase(),phone=clean(d.phone,40),password=String(d.password||'');
      if(!name||!emailOk(email)||password.length<12)return fail(400,'Enter your name, valid email and a password of at least 12 characters.');
      try { await q('INSERT INTO users (id,email,password_hash,role,full_name,phone,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id(),email,await passwordHash(password),'parent',name,phone,now()]); }
      catch { return fail(409,'An account with that email already exists.'); }
      return response(201,{ok:true,message:'Parent account created. The centre must link your learner before learner records appear.'});
    }
    if (path==='/api/login' && method==='POST') {
      if(await limited(`login:${event.headers?.['x-nf-client-connection-ip']||'unknown'}`,8))return fail(429,'Too many login attempts. Try again later.');
      const d=body(event);if(!d)return fail(400,'Invalid login data.');
      const email=clean(d.email,254).toLowerCase(),password=String(d.password||'');
      const rows=await q('SELECT * FROM users WHERE email=$1',[email]);const u=rows[0];
      if(!u||!(await verifyPassword(password,u.password_hash)))return fail(401,'Email or password is incorrect.');
      const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
      await q('INSERT INTO sessions (id_hash,user_id,csrf,expires_at) VALUES ($1,$2,$3,$4)',[hashToken(token),u.id,csrf,Date.now()+7*86400000]);
      return response(200,{ok:true,user:{email:u.email,role:u.role,fullName:u.full_name},csrf},{'Set-Cookie':cookie('eduaxis_session',token)});
    }
    if (path==='/api/me' && method==='GET') {
      const u=await auth(event);if(!u)return fail(401,'Not signed in.');
      return response(200,{user:{email:u.email,role:u.role,fullName:u.full_name},csrf:u.csrf});
    }
    if (path==='/api/logout' && method==='POST') {
      const u=await auth(event),d=body(event)||{};if(!u||!csrfOk(event,u,d))return fail(403,'Session check failed.');
      await q('DELETE FROM sessions WHERE id_hash=$1',[hashToken(u.token)]);
      return response(200,{ok:true},{'Set-Cookie':clearCookie()});
    }
    if (path==='/api/portal' && method==='GET') {
      const u=await auth(event);if(!u)return fail(401,'Please sign in.');if(u.role==='admin')return response(200,{role:'admin',csrf:u.csrf});
      const learners=await q('SELECT id,full_name,grade FROM learners WHERE parent_user_id=$1 ORDER BY full_name',[u.user_id]);
      const result=await Promise.all(learners.map(async l=>{const [homework,progress,timetable]=await Promise.all([
        q('SELECT id,title,subject,due_date,details FROM homework WHERE learner_id=$1 ORDER BY due_date',[l.id]),
        q('SELECT id,subject,period,summary FROM progress WHERE learner_id=$1 ORDER BY created_at DESC',[l.id]),
        q('SELECT id,day,time,subject FROM timetable WHERE learner_id=$1 ORDER BY day,time',[l.id])]);return {id:l.id,name:l.full_name,grade:l.grade,homework,progress,timetable};}));
      const notices=await q('SELECT id,title,body,created_at FROM notices WHERE published=TRUE ORDER BY created_at DESC LIMIT 20');
      return response(200,{role:'parent',csrf:u.csrf,learners:result,notices});
    }
    if (path==='/api/admin/summary' && method==='GET') {
      const u=await auth(event);if(!u||u.role!=='admin')return fail(403,'Administrator access required.');
      const [enquiries,applications,bookings,parents,learners,counts]=await Promise.all([
        q('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 100'),q('SELECT * FROM applications ORDER BY created_at DESC LIMIT 100'),q('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 100'),
        q("SELECT id,email,full_name,phone FROM users WHERE role='parent' ORDER BY created_at DESC"),
        q('SELECT l.id,l.full_name,l.grade,u.email parent_email FROM learners l JOIN users u ON u.id=l.parent_user_id ORDER BY l.created_at DESC'),
        q("SELECT (SELECT COUNT(*)::int FROM enquiries) enquiries,(SELECT COUNT(*)::int FROM applications) applications,(SELECT COUNT(*)::int FROM bookings) bookings,(SELECT COUNT(*)::int FROM users WHERE role='parent') parents,(SELECT COUNT(*)::int FROM learners) learners")]);
      return response(200,{csrf:u.csrf,counts:counts[0],enquiries,applications,bookings,parents,learners});
    }
    if (path==='/api/admin/learner' && method==='POST') {
      const u=await auth(event),d=body(event);if(!u||u.role!=='admin')return fail(403,'Administrator access required.');if(!d||!csrfOk(event,u,d))return fail(403,'Session check failed.');
      const p=await q("SELECT id FROM users WHERE email=$1 AND role='parent'",[clean(d.parentEmail,254).toLowerCase()]);if(!p.length)return fail(404,'Parent account not found. Ask the parent to create an account first.');
      const learnerId=id();await q('INSERT INTO learners (id,parent_user_id,full_name,grade,created_at) VALUES ($1,$2,$3,$4,$5)',[learnerId,p[0].id,clean(d.name,120),clean(d.grade,30),now()]);return response(201,{ok:true,id:learnerId});
    }
    if (path==='/api/admin/record' && method==='POST') {
      const u=await auth(event),d=body(event);if(!u||u.role!=='admin')return fail(403,'Administrator access required.');if(!d||!csrfOk(event,u,d))return fail(403,'Session check failed.');
      const type=clean(d.type,20),learner=await q('SELECT id FROM learners WHERE id=$1',[clean(d.learnerId,60)]);if(!learner.length)return fail(404,'Learner not found.');const rid=id();
      if(type==='homework'){if(!clean(d.title,160)||!clean(d.subject,80)||!clean(d.details,3000))return fail(400,'Homework title, subject and details are required.');await q('INSERT INTO homework (id,learner_id,title,subject,due_date,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[rid,learner[0].id,clean(d.title,160),clean(d.subject,80),clean(d.dueDate,10)||null,clean(d.details,3000),now()]);}
      else if(type==='progress'){if(!clean(d.subject,80)||!clean(d.period,80)||!clean(d.summary,3000))return fail(400,'Progress subject, period and summary are required.');await q('INSERT INTO progress (id,learner_id,subject,period,summary,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[rid,learner[0].id,clean(d.subject,80),clean(d.period,80),clean(d.summary,3000),now()]);}
      else if(type==='timetable'){if(!clean(d.day,20)||!clean(d.time,20)||!clean(d.subject,80))return fail(400,'Timetable day, time and subject are required.');await q('INSERT INTO timetable (id,learner_id,day,time,subject,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[rid,learner[0].id,clean(d.day,20),clean(d.time,20),clean(d.subject,80),now()]);}
      else return fail(400,'Unknown record type.');return response(201,{ok:true,id:rid});
    }
    if (['/api/admin/notice','/api/admin/news','/api/admin/resource','/api/admin/gallery','/api/admin/testimonial'].includes(path) && method==='POST') {
      const u=await auth(event),d=body(event);if(!u||u.role!=='admin')return fail(403,'Administrator access required.');if(!d||!csrfOk(event,u,d))return fail(403,'Session check failed.');
      if(path.endsWith('/notice')||path.endsWith('/news')){const title=clean(d.title,160),content=clean(d.body,path.endsWith('/news')?5000:3000);if(!title||!content)return fail(400,'Title and text are required.');if(path.endsWith('/notice'))await q('INSERT INTO notices (id,title,body,published,created_at) VALUES ($1,$2,$3,$4,$5)',[id(),title,content,d.published!==false,now()]);else await q('INSERT INTO news (id,title,body,published,created_at) VALUES ($1,$2,$3,$4,$5)',[id(),title,content,d.published!==false,now()]);}
      if(path.endsWith('/resource')){const title=clean(d.title,160),grade=clean(d.grade,30),subject=clean(d.subject,80),description=clean(d.description,1000),fileUrl=clean(d.fileUrl,500);if(!title||!grade||!subject||!description||!(/^(https:\/\/|\/)/.test(fileUrl)))return fail(400,'Complete the fields and use a secure https or site-relative resource link.');await q('INSERT INTO resources (id,title,grade,subject,description,file_url,published,created_at) VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7)',[id(),title,grade,subject,description,fileUrl,now()]);}
      if(path.endsWith('/gallery')){const title=clean(d.title,160),imageUrl=clean(d.imageUrl,500),alt=clean(d.altText,250);if(!title||!alt||!(/^(https:\/\/|\/)/.test(imageUrl))||d.permissionConfirmed!==true)return fail(400,'A valid image URL, alt text and confirmed publication permission are required.');await q('INSERT INTO gallery (id,title,image_url,alt_text,permission_confirmed,published) VALUES ($1,$2,$3,$4,TRUE,TRUE)',[id(),title,imageUrl,alt]);}
      if(path.endsWith('/testimonial')){const name=clean(d.displayName,100),quote=clean(d.quote,1200);if(!name||!quote||d.permissionConfirmed!==true)return fail(400,'Display name, testimonial and confirmed publication permission are required.');await q('INSERT INTO testimonials (id,display_name,quote,permission_confirmed,published) VALUES ($1,$2,$3,TRUE,TRUE)',[id(),name,quote]);}
      return response(201,{ok:true});
    }
    return fail(404,'API route not found.');
  } catch (error) {
    console.error('EduAxis API error:',error);
    const message=String(error?.message||'');
    if(message.includes('DATABASE_URL')||message.includes('ADMIN_EMAIL'))return response(503,{error:message});
    return fail(500,'An unexpected server error occurred. Check the Netlify function logs.');
  }
};
