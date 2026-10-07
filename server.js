// Oybek Osh — сервер (Node.js 18+, ташқи пакетсиз). Маълумот: Upstash Redis (бепул) ёки data/kv.json
const crypto=require("crypto"),http=require("http"),fs=require("fs"),path=require("path");
const clean=(v,k)=>{v=String(v||"").trim();if(k&&v.toUpperCase().startsWith(k+"="))v=v.slice(k.length+1);return v.replace(/^[\s"']+|[\s"']+$/g,"")};
console.log("Oybek Osh сервер v3");
const E=Object.fromEntries(Object.entries(process.env).map(([k,v])=>[k,clean(v,k)])),PORT=+E.PORT||3000,PASS=E.ADMIN_PASSWORD||"admin123",BOT=E.BOT_TOKEN||"",
  CHATS=(E.ADMIN_CHAT_ID||"").split(",").map(x=>x.trim()).filter(Boolean),FEE=+E.DELIVERY_FEE||12000;
const PUBURL=(E.PUBLIC_URL||E.RENDER_EXTERNAL_URL||"").replace(/\/$/,""),HOOK=BOT?crypto.createHash("sha256").update(BOT).digest("hex").slice(0,32):"x";
const rawEnv=k=>String(process.env[k]||"");
const UR=(/https?:\/\/[^\s"']+/.exec(rawEnv("UPSTASH_REDIS_REST_URL"))||[""])[0];
const UT=(()=>{const v=rawEnv("UPSTASH_REDIS_REST_TOKEN"),m=/UPSTASH_REDIS_REST_TOKEN\s*=\s*["']?([^"'\s]+)/.exec(v);return m?m[1]:clean(v,"UPSTASH_REDIS_REST_TOKEN")})();
if(UR&&!/^https?:\/\/[^\s]+$/.test(UR)){console.error("UPSTASH_REDIS_REST_URL нотўғри. Керак: https://....upstash.io  Ҳозир: "+UR.slice(0,40));process.exit(1)}
if(UR&&!UT){console.error("UPSTASH_REDIS_REST_TOKEN киритилмаган");process.exit(1)}
const DIR=path.join(__dirname,"data"),KV=path.join(DIR,"kv.json"),PUB=fs.existsSync(path.join(__dirname,"public"))?path.join(__dirname,"public"):__dirname;
fs.mkdirSync(DIR,{recursive:true});
const D="/dish.webp",SEED=[
[1,"Ош","Оддий ош","Гуруч, мол гўшти, сабзи, нўхат",38000,D],[2,"Ош","Тўй оши","Қази ва қарта билан, катта порция",55000,D],
[3,"Ош","Бедана тухумли ош","Беш дона бедана тухуми билан",48000,D],[4,"Ош","Оилавий ош, 1 кг","3–4 кишига, идишда",150000,D],
[5,"Салат","Аччиқ-чучук","Помидор, пиёз, кўкат",12000],[6,"Салат","Янги салат","Бодринг, помидор, укроп",14000],
[7,"Нон","Тандир самса","Гўштли, 1 дона",9000],[8,"Нон","Патир нон","Тандирда, иссиқ",8000],
[9,"Ичимлик","Кўк чой","Чойнак, 0.8 л",6000],[10,"Ичимлик","Айрон","Совуқ, 0.5 л",8000],[11,"Ичимлик","Coca-Cola 0.5","Совуқ",9000]
].map(([id,c,n,d,p,img])=>({id,c,n,d,p,img:img||"",out:false}));
/* ---- сақлаш қатлами ---- */
let mem={};try{mem=JSON.parse(fs.readFileSync(KV,"utf8"))}catch(e){}
async function rq(c){const r=await fetch(UR,{method:"POST",headers:{Authorization:"Bearer "+UT,"Content-Type":"application/json"},body:JSON.stringify(c)}),j=await r.json();if(j.error)throw new Error(j.error);return j}
const store={async get(k){if(UR)return(await rq(["GET",k])).result;return mem[k]===undefined?null:mem[k]},
 async set(k,v){if(UR){await rq(["SET",k,v])}else{mem[k]=v;fs.writeFileSync(KV+".tmp",JSON.stringify(mem));fs.renameSync(KV+".tmp",KV)}}};
let menu=SEED,orders=[],users=[],seq=1000,imgs={},days=new Set(),loaded=new Set(),chain=Promise.resolve();
const day=t=>new Date(t).toISOString().slice(0,10);
const put=(k,f)=>{chain=chain.then(()=>store.set(k,f())).catch(()=>store.set(k,f())).catch(e=>console.error("САҚЛАНМАДИ",k,e.message))};
const pMenu=()=>put("menu",()=>JSON.stringify(menu)),pUsers=()=>put("users",()=>JSON.stringify(users)),pSeq=()=>put("seq",()=>String(seq)),pImg=id=>put("img:"+id,()=>imgs[id]);
const pDay=d=>{put("o:"+d,()=>JSON.stringify(orders.filter(o=>day(o.t)===d)));if(!days.has(d)){days.add(d);loaded.add(d);put("days",()=>JSON.stringify([...days]))}};
async function loadDay(d){if(loaded.has(d)||!days.has(d))return;loaded.add(d);const v=await store.get("o:"+d);if(v)orders.push(...JSON.parse(v))}
async function load(){const J=async k=>{const v=await store.get(k);return v?JSON.parse(v):null};
 menu=(await J("menu"))||SEED;users=(await J("users"))||[];days=new Set((await J("days"))||[]);
 await Promise.all([...days].sort().slice(-45).map(loadDay));
 await Promise.all(menu.filter(m=>m.img.startsWith("/img/")).map(async m=>{const v=await store.get("img:"+m.id);if(v)imgs[m.id]=v}));
 seq=Math.max(+(await store.get("seq"))||1000,...orders.map(o=>o.id))}
const ST=["Қабул қилинди","Тайёрланмоқда","Етказилмоқда","Етказиб берилди","Бекор қилинди"],EM=["✅","👨‍🍳","🛵","🏠","❌"];
const fmt=n=>String(n).replace(/\B(?=(\d{3})+$)/g," ")+" сўм";
async function tg(m,b){if(!BOT)return;try{return await(await fetch(`${E.TG_API||"https://api.telegram.org"}/bot${BOT}/${m}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)})).json()}catch(e){}}
const kb=id=>({inline_keyboard:[[{text:"👨‍🍳 Тайёрланмоқда",callback_data:`s:${id}:1`},{text:"🛵 Йўлда",callback_data:`s:${id}:2`}],[{text:"🏠 Етказилди",callback_data:`s:${id}:3`},{text:"❌ Бекор",callback_data:`s:${id}:4`}]]});
const otext=o=>`🛵 Буюртма №${o.id}\n`+o.items.map(i=>`• ${i.n} × ${i.q} — ${fmt(i.p*i.q)}`).join("\n")+`\nЕтказиш: ${fmt(o.fee)}\n💰 Жами: ${fmt(o.total)}\n\n👤 ${o.name}\n📞 ${o.phone}\n📍 ${o.address}`+(o.landmark?`\n🧭 ${o.landmark}`:"")+`\n\nҲолат: ${EM[o.s]} ${ST[o.s]}`;
function setStatus(o,s){o.s=s;o.ts=o.ts||{};o.ts[s]=Date.now();pDay(day(o.t))}
async function onUpdate(u){const q=u.callback_query;if(!q)return;
  if(!CHATS.includes(String(q.from.id))&&!CHATS.includes(String(q.message&&q.message.chat.id)))return;
  const m=/^s:(\d+):(\d)$/.exec(q.data||"");if(!m)return;const o=orders.find(x=>x.id==m[1]);if(!o)return;
  setStatus(o,+m[2]);await chain;await tg("answerCallbackQuery",{callback_query_id:q.id,text:EM[o.s]+" "+ST[o.s]});
  await tg("editMessageText",{chat_id:q.message.chat.id,message_id:q.message.message_id,text:otext(o),reply_markup:o.s>=3?undefined:kb(o.id)})}
const bad=new Map(),rate=new Map();
const hit=(m,k,max,ms)=>{const n=Date.now(),a=(m.get(k)||[]).filter(t=>n-t<ms);a.push(n);m.set(k,a);return a.length>max};
const body=req=>new Promise((ok,no)=>{let b="",n=0;req.on("data",c=>{n+=c.length;if(n>25e6){no();req.destroy()}else b+=c});req.on("end",()=>{try{ok(JSON.parse(b||"{}"))}catch(e){no(e)}})});
const send=(res,c,o)=>{res.writeHead(c,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(o))};
const MIME={".html":"text/html;charset=utf-8",".webp":"image/webp",".js":"text/javascript",".png":"image/png",".jpg":"image/jpeg",".ico":"image/x-icon"};
const srv=http.createServer(async(req,res)=>{
 const u=new URL(req.url,"http://x"),p=u.pathname,ip=req.socket.remoteAddress;
 try{
  if(p==="/api/menu")return send(res,200,menu);
  if(p==="/api/status"){const o=orders.find(x=>x.id==u.searchParams.get("id"));return send(res,o?200:404,{s:o?o.s:0})}
  if(p==="/healthz"){res.writeHead(200);return res.end("ok")}
  if(p==="/tg/"+HOOK&&req.method==="POST"){const u2=await body(req);await onUpdate(u2);res.writeHead(200);return res.end("ok")}
  if(p.startsWith("/img/")){const v=imgs[p.slice(5)],m=v&&/^data:([^;]+);base64,(.*)$/.exec(v);if(!m){res.writeHead(404);return res.end()}res.writeHead(200,{"Content-Type":m[1],"Cache-Control":"public,max-age=31536000,immutable"});return res.end(Buffer.from(m[2],"base64"))}
  if(p==="/api/register"&&req.method==="POST"){
   if(hit(rate,"r"+ip,10,6e4))return send(res,429,{e:"Кўп сўров"});
   const b=await body(req),name=String(b.name||"").trim().slice(0,60),phone=String(b.phone||"").slice(0,20);
   if(name.length<2||phone.replace(/\D/g,"").length!==12)return send(res,400,{e:"Исм ва телефонни тўғри киритинг"});
   const k=phone.replace(/\D/g,"");let c=users.find(x=>x.k===k);
   if(c){c.name=name}else{c={k,phone,name,tok:crypto.randomBytes(16).toString("hex"),t:Date.now()};users.push(c)}
   pUsers();await chain;return send(res,200,{tok:c.tok})}
  if(p==="/api/order"&&req.method==="POST"){
   if(hit(rate,ip,6,6e4))return send(res,429,{e:"Кўп сўров, бироздан кейин уриниб кўринг"});
   const b=await body(req);if(!b.tok||!users.some(x=>x.tok===b.tok))return send(res,401,{e:"Рўйхатдан ўтинг"});
   const name=String(b.name||"").trim().slice(0,60),phone=String(b.phone||"").slice(0,20),address=String(b.address||"").trim().slice(0,200),landmark=String(b.landmark||"").trim().slice(0,200);
   if(name.length<2||phone.replace(/\D/g,"").length!==12||address.length<5||!Array.isArray(b.items)||!b.items.length||b.items.length>40)return send(res,400,{e:"Маълумотлар нотўғри"});
   const items=[];for(const it of b.items){const m=menu.find(x=>x.id===it.id),q=Math.floor(it.q);
    if(!m||!(q>=1&&q<=50))return send(res,400,{e:"Таом топилмади"});if(m.out)return send(res,400,{e:`«${m.n}» тугаган`});items.push({id:m.id,n:m.n,p:m.p,q})}
   const sum=items.reduce((a,i)=>a+i.p*i.q,0),o={id:++seq,t:Date.now(),name,phone,address,landmark,items,sum,fee:FEE,total:sum+FEE,s:0,ts:{0:Date.now()}};
   orders.push(o);pDay(day(o.t));pSeq();await chain;
   for(const c of CHATS){tg("sendMessage",{chat_id:c,text:otext(o),reply_markup:kb(o.id)})}
   return send(res,200,{id:o.id,total:o.total})}
  if(p.startsWith("/api/admin/")){
   if(req.headers["x-admin"]!==PASS){if(hit(bad,ip,10,6e5))return send(res,429,{e:"Кўп уриниш"});return send(res,401,{e:"Парол нотўғри"})}
   if(p==="/api/admin/ping")return send(res,200,{ok:1});
   if(p==="/api/admin/orders"){const f=+u.searchParams.get("from")||0,t=+u.searchParams.get("to")||9e15;await Promise.all([...days].filter(d=>d>=day(f)&&d<=day(Math.min(t,Date.now()))).map(loadDay));return send(res,200,orders.filter(o=>o.t>=f&&o.t<=t).sort((a,b)=>b.t-a.t))}
   if(p==="/api/admin/users")return send(res,200,users.map(({k,tok,...x})=>({...x,n:orders.filter(o=>o.phone.replace(/\D/g,"")===k).length})).reverse());
   if(p==="/api/admin/status"&&req.method==="POST"){const b=await body(req),o=orders.find(x=>x.id==b.id);if(!o||!(b.s>=0&&b.s<=4))return send(res,400,{e:"Хато"});setStatus(o,b.s|0);await chain;return send(res,200,{ok:1})}
   if(p==="/api/admin/menu"&&req.method==="POST"){const b=await body(req);if(!Array.isArray(b)||!b.length)return send(res,400,{e:"Хато"});
    if(b.some(x=>String(x.img||"").startsWith("data:")&&String(x.img).length>900000))return send(res,400,{e:"Расм жуда катта"});
    menu=b.map((x,i)=>{const id=+x.id||i+1;let img=String(x.img||"");if(img.startsWith("data:")){imgs[id]=img;img="/img/"+id+"?v="+Date.now();pImg(id)}
     return{id,c:String(x.c||"Бошқа").slice(0,30),n:String(x.n||"").slice(0,80),d:String(x.d||"").slice(0,160),p:Math.max(0,Math.round(+x.p||0)),img:img.slice(0,300),out:!!x.out}});
    pMenu();await chain;return send(res,200,{ok:1})}
   return send(res,404,{e:"yo'q"})}
  let f=p==="/"?"/index.html":p==="/admin"?"/admin.html":p;f=path.normalize(path.join(PUB,f));
  if(PUB===__dirname&&!["index.html","admin.html","dish.webp"].includes(path.basename(f))){res.writeHead(404);return res.end("404")}
  if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end("404")}
  res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream","Cache-Control":f.endsWith(".html")?"no-cache":"public,max-age=86400"});fs.createReadStream(f).pipe(res);
 }catch(e){send(res,500,{e:"Сервер хатоси"})}
});
load().then(()=>srv.listen(PORT,async()=>{console.log("Ишга тушди: порт "+PORT+(UR?" · база: Upstash":" · база: файл"));
 if(BOT&&PUBURL){const r=await tg("setWebhook",{url:PUBURL+"/tg/"+HOOK,allowed_updates:["callback_query"]});console.log("Telegram webhook:",r&&r.ok?"уланди":JSON.stringify(r))}else if(BOT)console.log("PUBLIC_URL берилмаган: бот тугмалари ишламайди")})).catch(e=>{console.error("База очилмади:",e.message);process.exit(1)});
