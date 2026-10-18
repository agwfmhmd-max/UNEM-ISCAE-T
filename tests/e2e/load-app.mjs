// تحميل app.html الحقيقية (أو أي نسخة منها) في متصفح مع محاكيات للمكتبات الخارجية وSupabase. للمقارنة والاختبار.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, newPage } from './helpers.mjs';

const SUPABASE_STUB = `
(function(){
  function proxy(){ const f=function(){return proxy()};
    return new Proxy(f,{get(t,k){ if(k==='then')return (res,rej)=>Promise.resolve({data:[],error:null,count:0}).then(res,rej);
      if(k==='rpc')return (name)=>Promise.resolve((window.__rpc&&window.__rpc[name])||{data:[],error:null,count:0});
      if(k==='auth')return {getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({data:null,error:{message:'stub'}}),signOut:async()=>({})};
      if(k==='storage')return {from:()=>({list:async()=>({data:[],error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})};
      if(k===Symbol.toPrimitive)return ()=>'';return proxy()},apply(){return proxy()}}); }
  window.supabase={createClient:()=>proxy()};
})();`;

export async function loadApp(html, { extraRoutes, initScript } = {}) {
  const pg = await newPage({ viewport: { width: 390, height: 844 } });
  if (initScript) await pg.addInitScript(initScript);
  pg.console = []; pg.failed = []; pg.loaded = [];
  pg.on('console', (m) => { if (m.type() === 'error') pg.console.push(m.text()); });
  await pg.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (extraRoutes) { const x = await extraRoutes(r, u); if (x) return; }
    if (u.href.includes('@supabase/supabase-js')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    if (u.host === 'cdn.jsdelivr.net' || u.host.includes('googletagmanager')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart=window.Chart||function(){};window.gtag=window.gtag||function(){};' });
    if (u.host === 'localhost') {
      if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      const f = path.join(ROOT, 'public', u.pathname);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) { pg.loaded.push(u.pathname); const t = u.pathname.endsWith('.js') ? 'application/javascript' : u.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream'; return r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) }); }
      pg.failed.push(u.pathname); return r.fulfill({ status: 404, body: '' });
    }
    if (u.pathname.includes('/rest/v1/') || u.pathname.includes('/auth/v1/')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
    return r.abort();
  });
  await pg.goto('http://localhost/', { waitUntil: 'load' });
  await pg.waitForTimeout(2500);
  return pg;
}

export async function snapshot(pg) {
  return pg.evaluate(() => ({
    bodyLen: (() => { const c = document.body.cloneNode(true); c.querySelectorAll('script').forEach((s) => s.remove()); return c.innerHTML.length; })(),
    ids: [...document.querySelectorAll('[id]')].map((e) => e.id).sort().join(',').length,
    buttons: document.querySelectorAll('button').length,
    cards: document.querySelectorAll('#main-menu *').length,
    globals: Object.getOwnPropertyNames(window).filter((k) => !/^on/.test(k)).length,
    fnCount: Object.getOwnPropertyNames(window).filter((k) => typeof window[k] === 'function').length,
    title: document.title,
  }));
}
