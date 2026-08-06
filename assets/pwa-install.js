/* pwa-install.js pitch — custom install prompt, hoops parity, 44px AAA */
(function(){
  var LS_KEY='vectorPitch.installPromptDismissedAt';
  var deferredPrompt=null;
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferredPrompt=e; maybeShow(); });
  function shouldShow(){
    try{
      var dismissed=localStorage.getItem(LS_KEY);
      if(dismissed && (Date.now()-parseInt(dismissed,10)<14*86400000)) return false;
      var visitsRaw=localStorage.getItem('vectorPitch.visits');
      var visits=visitsRaw?JSON.parse(visitsRaw):[];
      var hasPlayed=false; try{ hasPlayed=!!localStorage.getItem('vp.streak'); }catch(e){}
      return visits.length>=2||hasPlayed;
    }catch(e){ return false; }
  }
  function maybeShow(){
    if(!shouldShow()) return;
    if(document.getElementById('pwa-install-banner')) return;
    if(!deferredPrompt && !('standalone' in navigator||window.matchMedia('(display-mode: standalone)').matches)){
      var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
      if(isIOS) showIOS();
      return;
    }
    showBanner();
  }
  function showBanner(){
    var banner=document.createElement('div'); banner.id='pwa-install-banner';
    banner.style.cssText='position:fixed; left:50%; bottom:calc(14px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:75; background:#FFFEF7; color:#111; border:2px solid #111; border-radius:16px; box-shadow:6px 6px 0 #111; padding:12px 14px; display:flex; gap:12px; align-items:center; max-width:min(92vw,420px); width:92vw; box-sizing:border-box; font-family:ui-monospace,monospace;';
    banner.innerHTML='<div style="flex:0 0 40px;height:40px;background:#111;color:#F0E442;border-radius:10px;display:grid;place-items:center;font-weight:950;font-size:18px;">VP</div><div style="flex:1;min-width:0;"><div style="font-weight:900;font-size:13px;line-height:1.2;">Add to Home Screen</div><div style="font-size:11px;opacity:.8;line-height:1.35;margin-top:2px;">Offline, instant, no app store. 633 WC cached.</div></div><div style="display:flex;flex-direction:column;gap:6px;"><button id="pwa-install-go" style="min-height:36px;border:2px solid #111;background:#F0E442;border-radius:999px;font-weight:900;font-size:12px;padding:0 14px;cursor:pointer;box-shadow:2px 2px 0 #111;">Install</button><button id="pwa-install-no" style="min-height:28px;border:1px solid #111;background:transparent;border-radius:999px;font-size:10px;padding:0 10px;cursor:pointer;">Not now</button></div>';
    document.body.appendChild(banner);
    document.getElementById('pwa-install-go').addEventListener('click', function(){
      if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.then(function(){ try{ localStorage.setItem(LS_KEY,String(Date.now())); }catch(e){} banner.remove(); deferredPrompt=null; }); } else banner.remove();
    });
    document.getElementById('pwa-install-no').addEventListener('click', function(){ try{ localStorage.setItem(LS_KEY,String(Date.now())); }catch(e){} banner.remove(); });
  }
  function showIOS(){
    var b=document.createElement('div'); b.id='pwa-install-banner'; b.style.cssText='position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:75;background:#FFFEF7;color:#111;border:2px solid #111;border-radius:16px;box-shadow:6px 6px 0 #111;padding:12px 14px;display:flex;gap:12px;align-items:center;max-width:92vw;width:92vw;font-family:ui-monospace,monospace;';
    b.innerHTML='<div style="flex:1;font-size:12px;"><b>Add to Home Screen</b> — tap <span style="border:1px solid #111;padding:1px 5px;border-radius:6px;">Share</span> → <b>Add to Home Screen</b> for offline, instant launch.</div><button id="pwa-install-no" style="min-height:32px;border:1px solid #111;border-radius:999px;padding:0 10px;">OK</button>';
    document.body.appendChild(b); document.getElementById('pwa-install-no').addEventListener('click',function(){ try{localStorage.setItem(LS_KEY,String(Date.now()));}catch(e){} b.remove(); });
  }
  // visits counter
  try{ var v=JSON.parse(localStorage.getItem('vectorPitch.visits')||'[]'); v.push(Date.now()); if(v.length>20) v=v.slice(-20); localStorage.setItem('vectorPitch.visits',JSON.stringify(v)); }catch(e){}
  // auto maybe show after 2s
  setTimeout(maybeShow, 2200);
})();
