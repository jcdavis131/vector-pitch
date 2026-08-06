/* viral-share.js pitch v1 — hoops parity battle cards & sharing */
(function(){
  'use strict';
  function roundedRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function drawPitchCard(opts){
    var W=1080,H=1350; var c=document.createElement('canvas'); c.width=W; c.height=H; var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='#0A1510'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#0A1510'; ctx.fillRect(0,0,W,96); ctx.fillStyle='#fff'; ctx.font='900 28px ui-monospace,monospace'; ctx.fillText('VECTOR PITCH · GUESS THE PLAYER',28,36);
    ctx.font='700 20px ui-monospace,monospace'; ctx.fillStyle='#F0E442'; ctx.fillText('P#'+(opts.puzzleNum||'?')+' · '+opts.dayKey+' · 633 WC 24-d',28,68);
    ctx.fillStyle='#111'; ctx.font='950 54px ui-sans-serif'; ctx.fillText((opts.targetName||'?').slice(0,28),36,170);
    ctx.font='800 22px ui-monospace'; ctx.fillStyle='#555'; ctx.fillText('Mystery WC Player — can you guess?',36,205);
    var y=250; ctx.font='800 20px ui-monospace';
    (opts.guesses||[]).forEach(function(g){
      var simPct=Math.round((g.sim||0)*100);
      var barW=Math.max(18, simPct*5.2);
      ctx.fillStyle=g.rank===0?'#e8f5e9':(simPct>80?'#FFFEF7':'#fafaf8'); roundedRect(ctx,36,y,W-72,64,14); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.stroke();
      ctx.fillStyle='#111'; ctx.font='700 22px ui-monospace'; var status=g.rank===0?'🟩':g.rank<=2?'🟨':g.rank<=5?'🟧':'⬜'; ctx.fillText((opts.guesses.indexOf(g)+1)+'. '+status+' '+(g.name||'???').slice(0,18)+' '+(g.tourney||''),48,y+24);
      ctx.fillStyle=g.rank===0?'#009E73':'#0072B2'; ctx.fillRect(48,y+32,barW,10); ctx.fillStyle='#111'; ctx.font='700 16px ui-monospace'; ctx.fillText(simPct+'% #'+(g.rank+1||'?'),48+barW+12,y+40); y+=78;
    });
    if(y<520) y=520;
    ctx.fillStyle='#111'; ctx.font='900 26px ui-sans-serif';
    if(opts.won) ctx.fillText('Solved '+opts.guesses.length+'/6 → '+(opts.answerName||opts.targetName),36,y+30);
    else if(opts.revealed) ctx.fillText('Answer: '+(opts.answerName||opts.targetName)+' '+(opts.answerSim?Math.round(opts.answerSim*100)+'%':''),36,y+30);
    else ctx.fillText('Can you find the WC twin?',36,y+30);
    ctx.font='700 22px ui-monospace'; ctx.fillStyle='#666'; ctx.fillText('pitch.dumbmodel.com — StatsBomb Open Data — 633 player-tournaments',36,H-80);
    return c;
  }
  function drawPackCard(opts){
    var W=1080,H=1080; var c=document.createElement('canvas'); c.width=W; c.height=H; var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='#0A1510'; ctx.lineWidth=14; ctx.strokeRect(8,8,W-16,H-16);
    ctx.fillStyle='#F0E442'; ctx.fillRect(0,0,W,84); ctx.fillStyle='#0A1510'; ctx.font='900 26px ui-monospace,monospace'; ctx.fillText('VECTOR PITCH PACK — '+opts.size+' PACK — '+opts.solved+'/'+opts.size+' solved',18,50);
    var y=120; (opts.entries||[]).slice(0,5).forEach(function(e,i){
      ctx.fillStyle=i%2?'#f7f5ee':'#FFFEF7'; ctx.fillRect(12,y,W-24,76);
      ctx.fillStyle='#0A1510'; ctx.font='800 22px ui-sans-serif'; ctx.fillText((i+1)+'. '+(e.n||e.name||'?')+' '+(e.s||'').slice(0,6),22,y+32);
      var r=(opts.results||[])[i]; if(r){ ctx.font='700 18px ui-monospace'; ctx.fillText((r.won?'✅ ':'❌ ')+r.guesses.length+'/6',22,y+58); }
      y+=84;
    });
    ctx.font='800 20px ui-monospace'; ctx.fillText('Code '+(opts.packCode||'').slice(0,36),18,H-46);
    return c;
  }
  async function shareImage(canvas, filename){
    try{
      if(navigator.share && canvas.toBlob){
        const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
        const file=new File([blob], filename||'vector-pitch.png',{type:'image/png'});
        if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({title:'Vector Pitch',text:'Can you beat me?',files:[file]}); return 'shared'; }
      }
      const url=canvas.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download=filename||'vector-pitch.png'; a.click(); return 'downloaded';
    }catch(e){ try{ const url=canvas.toDataURL('image/png'); await navigator.clipboard.writeText(url.slice(0,120)); }catch{} return 'copied'; }
  }
  window.VPShare={
    shareSingle:function(opts){ var c=drawPitchCard(opts); return shareImage(c,'vector-pitch-'+(opts.dayKey||'daily')+'.png'); },
    sharePack:function(opts){ var c=drawPackCard(opts); return shareImage(c,'vector-pitch-pack-'+opts.size+'.png'); },
    packShareUrl:function(ids, scores){
      var base=location.origin+'/play?pack='+ids.join('-');
      if(scores&&scores.length) base+='&s='+scores.join('-');
      return base;
    },
    generatePackUrl:function(n){
      // generate n random ids from 0..632 deterministic fallback
      var ids=[]; for(var i=0;i<n;i++) ids.push(Math.floor(Math.random()*633));
      return VPShare.packShareUrl(ids);
    }
  };
})();
