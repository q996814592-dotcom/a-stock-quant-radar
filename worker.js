const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json; charset=utf-8", ...CORS}
});

function sid(code) {
  code = String(code).replace(/\D/g,"").padStart(6,"0");
  return (/^(6|68|9)/.test(code)) ? `1.${code}` : `0.${code}`;
}
function num(x){ const n=Number(x); return Number.isFinite(n)?n:null; }
function pct(x){ const n=num(x); return n; }

function ema(values, p){
  const out=[]; const k=2/(p+1); let e=null;
  for(const v of values){ if(!Number.isFinite(v)){out.push(null);continue;}
    e=e===null?v:v*k+e*(1-k); out.push(e);
  } return out;
}
function indicators(rows){
  const close=rows.map(r=>num(r.close));
  const sma=(p)=>rows.map((_,i)=>{
    if(i<p-1)return null; let s=0;
    for(let j=i-p+1;j<=i;j++)s+=close[j]??0;
    return s/p;
  });
  const ma5=sma(5), ma10=sma(10), ma20=sma(20), ma60=sma(60);
  const e12=ema(close,12), e26=ema(close,26);
  const dif=close.map((_,i)=>e12[i]!==null&&e26[i]!==null?e12[i]-e26[i]:null);
  const dea=ema(dif.map(x=>x??NaN),9);
  const macd=dif.map((x,i)=>x!==null&&dea[i]!==null?(x-dea[i])*2:null);
  const rsi=rows.map((_,i)=>{
    if(i<13)return null; let gain=0,loss=0;
    for(let j=i-13;j<=i;j++){const d=close[j]-close[j-1]; if(!Number.isFinite(d))continue; if(d>0)gain+=d; else loss-=d;}
    return loss===0?100:100-(100/(1+gain/loss));
  });
  return rows.map((r,i)=>({...r,ma5:ma5[i],ma10:ma10[i],ma20:ma20[i],ma60:ma60[i],dif:dif[i],dea:dea[i],macd:macd[i],rsi:rsi[i]}));
}
function score(q, k){
  let s=50, reasons=[];
  const ma5=k.at(-1)?.ma5, ma20=k.at(-1)?.ma20, ma60=k.at(-1)?.ma60;
  const rsi=k.at(-1)?.rsi, dif=k.at(-1)?.dif, dea=k.at(-1)?.dea;
  if(ma5&&ma20){ if(ma5>ma20){s+=12;reasons.push("MA5在MA20上方")}else{s-=10;reasons.push("MA5在MA20下方")}}
  if(ma20&&ma60){ if(ma20>ma60){s+=10;reasons.push("MA20在MA60上方")}else{s-=8;reasons.push("MA20在MA60下方")}}
  if(dif!=null&&dea!=null){ if(dif>dea){s+=10;reasons.push("MACD金叉结构")}else{s-=8;reasons.push("MACD弱势结构")}}
  if(rsi!=null){ if(rsi>=50&&rsi<=70){s+=8;reasons.push("RSI处于偏强区间")} if(rsi>75){s-=5;reasons.push("RSI偏高")}}
  if(q?.pct!=null){ if(q.pct>5){s+=5;reasons.push("当日涨幅明显")} if(q.pct<-5){s-=5;reasons.push("当日跌幅明显")}}
  s=Math.max(0,Math.min(100,Math.round(s)));
  const level=s>=75?"强势":s>=60?"偏强":s<=35?"偏弱":"震荡";
  return {score:s,level,reasons};
}

async function em(url, env, ttl=15){
  const key=new Request(url);
  const cache=caches.default;
  const hit=await cache.match(key);
  if(hit) return hit.json();
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 AStockRadar/3.0"}});
  if(!r.ok) throw new Error("上游行情接口异常");
  const d=await r.json();
  const resp=new Response(JSON.stringify(d),{headers:{"Content-Type":"application/json","Cache-Control":`public,max-age=${ttl}`}});
  await cache.put(key,resp.clone());
  return d;
}

async function getKline(code){
  const u=`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${sid(code)}&klt=101&fqt=1&beg=0&end=20500101`;
  const d=await em(u,null,60);
  const kl=d?.data?.klines||[];
  const rows=kl.slice(-240).map(x=>{
    const a=x.split(",");
    return {date:a[0],open:num(a[1]),close:num(a[2]),high:num(a[3]),low:num(a[4]),volume:num(a[5]),amount:num(a[6]),amplitude:num(a[7]),pct:num(a[8]),change:num(a[9]),turnover:num(a[10])};
  });
  return indicators(rows);
}

async function market(){
  const fields="f12,f14,f2,f3,f4,f5,f6,f8";
  const u=`https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=300&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=${fields}`;
  const d=await em(u,null,20);
  return (d?.data?.diff||[]).map(x=>({code:String(x.f12||""),name:x.f14,price:num(x.f2),pct:num(x.f3),change:num(x.f4),volume:num(x.f5),amount:num(x.f6),turnover:num(x.f8)}));
}

async function quote(code){
  const fields="f57,f58,f43,f169,f170,f44,f45,f46,f47,f48,f49,f50,f51,f52,f60,f162,f167,f168,f116,f117,f58";
  const u=`https://push2.eastmoney.com/api/qt/stock/get?secid=${sid(code)}&fields=${fields}`;
  const d=await em(u,null,5), x=d?.data||{};
  return {code:x.f57,name:x.f58,price:num(x.f43),pct:num(x.f170),change:num(x.f169),high:num(x.f44),low:num(x.f45),open:num(x.f46),preClose:num(x.f60),volume:num(x.f47),amount:num(x.f48),turnover:num(x.f168),pe:num(x.f162),pb:num(x.f167),marketCap:num(x.f116),floatCap:num(x.f117),update:new Date().toISOString()};
}

async function search(q){
  const u=`https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=11111111`;
  const d=await em(u,null,60);
  const data=d?.QuotationCodeTable?.Data||d?.data||[];
  return data.slice(0,12).map(x=>({code:x.Code||x.code,name:x.Name||x.name,market:x.Market||x.market}));
}

async function snapshot(){
  const m=await market();
  const ranked=[...m].sort((a,b)=>(b.pct??-999)-(a.pct??-999));
  const top=ranked.slice(0,20).map(x=>({ ...x, tag:x.pct>=9.5?"涨停附近":x.pct>=5?"强势":x.pct<=-9.5?"跌停附近":x.pct<=-5?"弱势":"正常" }));
  return {time:new Date().toISOString(),count:m.length,top,market:m.slice(0,100)};
}

export default {
  async fetch(request, env, ctx) {
    if(request.method==="OPTIONS") return new Response(null,{headers:CORS});
    const u=new URL(request.url);
    try{
      if(u.pathname==="/api/health") return json({ok:true,version:"3.0.0",time:new Date().toISOString()});
      if(u.pathname==="/api/market") return json(await market());
      if(u.pathname==="/api/snapshot") return json(await snapshot());
      if(u.pathname.startsWith("/api/search/")) return json(await search(decodeURIComponent(u.pathname.slice(12))));
      if(u.pathname.startsWith("/api/quote/")){
        const code=u.pathname.split("/").pop();
        const q=await quote(code);
        const k=await getKline(code);
        return json({...q,indicator:k.at(-1),signal:score(q,k)});
      }
      if(u.pathname.startsWith("/api/kline/")){
        const code=u.pathname.split("/").pop();
        const k=await getKline(code);
        return json({code,rows:k,signal:score(null,k)});
      }
      if(u.pathname==="/api/cron") return json({ok:true,note:"请使用Cloudflare Cron触发scheduled()"});
      return env.ASSETS.fetch(request);
    }catch(e){
      return json({ok:false,error:e.message||"服务异常"},502);
    }
  },
  async scheduled(controller, env, ctx){
    ctx.waitUntil((async()=>{
      try{
        const m=await market();
        const strong=m.filter(x=>x.pct!=null&&x.pct>=5).slice(0,50);
        console.log("cron market",new Date().toISOString(),m.length,strong.length);
      }catch(e){console.log("cron error",e.message);}
    })());
  }
};
