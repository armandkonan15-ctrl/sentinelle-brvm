// Sentinelle BRVM : moteur d'analyse partagé par le collecteur (Node.js) et le tableau de bord (navigateur).
// Aucune dépendance. Toutes les décisions viennent de ce fichier : modifie-le pour ajuster la stratégie.
"use strict";
const nf0=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0});
const fmt=(x,d=0)=>isFinite(x)?x.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const fcfa=x=>isFinite(x)?nf0.format(Math.round(x))+' F':'—';
const pct=(x,d=1)=>isFinite(x)?(x>0?'+':x<0?'−':'')+fmt(Math.abs(x*100),d)+' %':'—';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dstr=t=>{const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();};
const MONTHS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const isoDay=t=>new Date(t).toISOString().slice(0,10);
const dayT=s=>{const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN;};

/* ---------- Référentiel BRVM ---------- */
const SECTORS={
 'Services financiers':['BBGC','BICB','BICC','BOAB','BOABF','BOAC','BOAM','BOAN','BOAS','CBIBF','ECOC','ETIT','NSBC','ORGT','SAFC','SGBC','SIBC'],
 'Télécommunications':['ONTBF','ORAC','SNTS'],
 'Consommation de base':['NTLC','PALC','SCRC','SICC','SLBC','SOGC','SPHC','STBC','UNLC'],
 'Consommation discrétionnaire':['ABJC','BNBC','CFAC','LNBB','NEIC','PRSC','UNXC'],
 'Industriels':['CABC','FTSC','SDSC','SEMC','SIVC','STAC','SVOC'],
 'Énergie':['SHEC','SMBC','TTLC','TTLS'],
 'Services publics':['CIEC','SDCC']
};
const SECTOR_OF={};for(const[s,l]of Object.entries(SECTORS))for(const t of l)SECTOR_OF[t]=s;
const ALL=Object.keys(SECTOR_OF).sort();

/* ---------- Indicateurs ---------- */
const arr=n=>new Array(n).fill(NaN);
function sma(a,n){const o=arr(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)o[i]=s/n;}return o;}
function ema(a,n){const o=arr(a.length);const k=2/(n+1);let p=null,c=0;for(let i=0;i<a.length;i++){const x=a[i];if(!isFinite(x))continue;p=p===null?x:x*k+p*(1-k);c++;if(c>=n)o[i]=p;}return o;}
function rstd(a,n){const o=arr(a.length);for(let i=n-1;i<a.length;i++){let m=0;for(let j=i-n+1;j<=i;j++)m+=a[j];m/=n;let v=0;for(let j=i-n+1;j<=i;j++)v+=(a[j]-m)**2;o[i]=Math.sqrt(v/n);}return o;}
function rmax(a,n,lag){const o=arr(a.length);for(let i=n-1+lag;i<a.length;i++){let m=-Infinity;for(let j=i-n+1-lag;j<=i-lag;j++)m=Math.max(m,a[j]);o[i]=m;}return o;}
function rmin(a,n,lag){const o=arr(a.length);for(let i=n-1+lag;i<a.length;i++){let m=Infinity;for(let j=i-n+1-lag;j<=i-lag;j++)m=Math.min(m,a[j]);o[i]=m;}return o;}
function rsiCalc(c,n){const o=arr(c.length);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],up=Math.max(d,0),dn=Math.max(-d,0);if(i<=n){g+=up;l+=dn;if(i===n){g/=n;l/=n;o[i]=l===0?100:100-100/(1+g/l);}}else{g=(g*(n-1)+up)/n;l=(l*(n-1)+dn)/n;o[i]=l===0?100:100-100/(1+g/l);}}return o;}
function indicators(D){
  const n=D.length,c=D.map(d=>d.c);
  const hasHL=D.filter(d=>isFinite(d.h)&&isFinite(d.l)&&d.h>=d.l&&d.h>0).length>n*0.8;
  const hasVol=D.filter(d=>isFinite(d.v)).length>n*0.8;
  const v=D.map(d=>isFinite(d.v)?d.v:0);
  const tr=arr(n);tr[0]=0;
  for(let i=1;i<n;i++){const pc=c[i-1],d=D[i];tr[i]=hasHL&&isFinite(d.h)&&isFinite(d.l)&&d.h>0?Math.max(d.h-d.l,Math.abs(d.h-pc),Math.abs(d.l-pc)):Math.abs(c[i]-pc)*1.25;}
  const atr=arr(n);let a=0;for(let i=1;i<n;i++){if(i<=14){a+=tr[i];if(i===14){a/=14;atr[i]=a;}}else{a=(a*13+tr[i])/14;atr[i]=a;}}
  const sma20=sma(c,20),sd20=rstd(c,20);
  const bbU=sma20.map((m,i)=>m+2*sd20[i]),bbL=sma20.map((m,i)=>m-2*sd20[i]);
  const pctB=c.map((x,i)=>(bbU[i]-bbL[i])>0?(x-bbL[i])/(bbU[i]-bbL[i]):0.5);
  const bw=sma20.map((m,i)=>m>0?(bbU[i]-bbL[i])/m:NaN);
  const e12=ema(c,12),e26=ema(c,26),macd=c.map((_,i)=>e12[i]-e26[i]),sig=ema(macd,9),hist=macd.map((m,i)=>m-sig[i]);
  const lr=c.map((x,i)=>i?Math.log(x/c[i-1]):0);
  const zero60=arr(n);const zw=Math.min(60,n);for(let i=zw-1;i<n;i++){let z=0;for(let j=i-zw+1;j<=i;j++)if(v[j]<=0)z++;zero60[i]=z/zw;}
  const W=Math.min(252,n);
  return {n,c,v,hasHL,hasVol,atr,sma20,sma50:sma(c,50),sma100:sma(c,100),sma200:sma(c,200),bbU,bbL,pctB,bw,macd,sig,hist,rsi:rsiCalc(c,14),
    vol20:rstd(lr,20).map(x=>x*Math.sqrt(252)),vma5:sma(v,5),vma20:sma(v,20),hh20:rmax(c,20,1),ll20:rmin(c,20,1),hh252:rmax(c,W,0),ll252:rmin(c,W,0),zero60};
}

/* ---------- Comité des experts ---------- */
const WEIGHTS={
  invest:{trend:1.6,mom:0.8,rsi:0.9,boll:0.6,vol:0.8,struct:0.9,risk:1.2,liq:0.8,news:1.0},
  swing:{trend:1.0,mom:1.3,rsi:1.0,boll:0.9,vol:1.2,struct:1.1,risk:0.8,liq:0.7,news:0.9}
};
function evaluate(I,i,mode,ctx){
  const c=I.c,p=c[i],W=WEIGHTS[mode];
  let L,Llab,M;
  if(isFinite(I.sma200[i])){L=I.sma200[i];Llab='200 séances';M=I.sma50[i];}
  else if(isFinite(I.sma100[i])){L=I.sma100[i];Llab='100 séances';M=I.sma50[i];}
  else{L=I.sma50[i];Llab='50 séances';M=I.sma20[i];}
  const Mser=Llab==='50 séances'?I.sma20:I.sma50;
  const slope=isFinite(Mser[i-10])?(M-Mser[i-10])/Mser[i-10]:NaN;
  const models=[],flags={};
  if(Llab!=='200 séances')flags.short=true;
  const add=(key,name,s,text)=>models.push({key,name,score:clamp(Math.round(s),-2,2),w:W[key],text});
  let s=0,t;
  if(!isFinite(L)||!isFinite(M))t="Historique trop court pour juger la tendance de fond.";
  else if(p>L&&M>L&&slope>0){s=2;t=`Cours au-dessus de la moyenne ${Llab}, moyenne courte au-dessus et en pente montante (${pct(slope)} sur 10 séances). Tendance haussière installée.`;}
  else if(p>L&&(M>L||slope>0)){s=1;t=`Cours au-dessus de la moyenne ${Llab}, sans confirmation complète de la moyenne courte. Tendance haussière naissante ou fatiguée.`;}
  else if(p<L&&M<L&&slope<0){s=-2;t=`Cours sous la moyenne ${Llab}, moyenne courte en dessous et en baisse. Tendance baissière : chaque rebond est vendu.`;}
  else if(p<L){s=-1;t=`Cours sous la moyenne ${Llab}. Tant qu'il ne la reprend pas, le titre reste en zone de faiblesse.`;}
  else t="Cours collé à sa moyenne longue : pas de tendance exploitable.";
  add('trend','Tendance de fond',s,t);
  const trendUp=s>0,trendDown=s<0;
  s=0;const h=I.hist[i],h1=I.hist[i-1],m=I.macd[i];
  if(h>0)s++;else if(h<0)s--;
  if(h>h1&&h>0&&m>0)s++;else if(h<h1&&h<0&&m<0)s--;
  let cross='';for(let k=0;k<5;k++){if(Math.sign(I.hist[i-k])!==Math.sign(I.hist[i-k-1])&&isFinite(I.hist[i-k-1])){cross=I.hist[i-k]>0?` Croisement haussier du MACD il y a ${k} séance${k>1?'s':''}.`:` Croisement baissier du MACD il y a ${k} séance${k>1?'s':''}.`;break;}}
  const roc20=c[i]/c[Math.max(0,i-20)]-1,roc60=i>=60?c[i]/c[i-60]-1:NaN;
  t=(!isFinite(h)?"MACD pas encore calculable.":h>0?(h>h1?"L'accélération haussière se renforce.":"Momentum positif mais qui s'essouffle."):(h<h1?"Le momentum baissier s'accentue.":"Momentum négatif mais la pression vendeuse diminue."))+cross+` Variation : ${pct(roc20)} sur 20 séances${isFinite(roc60)?', '+pct(roc60)+' sur 60':''}.`;
  add('mom','Momentum (MACD)',s,t);
  const r=I.rsi[i];s=0;
  if(r>=80){s=-2;t=`RSI ${fmt(r,0)} : surchauffe extrême, un repli est probable.`;}
  else if(r>=70){s=trendUp?0:-1;t=`RSI ${fmt(r,0)} : surachat. ${trendUp?"En tendance haussière c'est de la force, mais le point d'entrée est cher.":"Sans tendance porteuse, c'est un excès à ne pas suivre."}`;}
  else if(r>=55){s=1;t=`RSI ${fmt(r,0)} : force saine, les acheteurs contrôlent sans excès.`;}
  else if(r>=45){s=0;t=`RSI ${fmt(r,0)} : équilibre entre acheteurs et vendeurs.`;}
  else if(r>=30){s=trendUp?1:-1;t=`RSI ${fmt(r,0)} : ${trendUp?"repli dans une tendance haussière, zone où les professionnels renforcent.":"faiblesse confirmée, les vendeurs dominent."}`;}
  else{s=trendUp?2:-1;t=`RSI ${fmt(r,0)} : survente. ${trendUp?"Dans une tendance haussière, c'est une opportunité rare.":"En tendance baissière, c'est un couteau qui tombe : on attend un plancher."}`;}
  add('rsi','RSI et surchauffe',s,t);
  const pb=I.pctB[i];s=0;
  const win=I.bw.slice(Math.max(0,i-119),i+1).filter(isFinite).sort((a,b)=>a-b);
  const squeeze=win.length>40&&I.bw[i]<=win[Math.floor(win.length*0.2)];
  if(pb>1){s=trendUp?1:-1;t=trendUp?"Clôture au-dessus de la bande haute : cassure de volatilité dans le sens de la tendance.":"Clôture au-dessus de la bande haute sans tendance porteuse : extension fragile.";}
  else if(pb>0.8)t="Cours dans le haut des bandes : titre tendu à court terme.";
  else if(pb<0){s=trendUp?1:-1;t=trendUp?"Cours sous la bande basse alors que la tendance monte : excès de baisse à racheter.":"Cours sous la bande basse en tendance baissière : la pression vendeuse domine.";}
  else if(pb<0.2){s=trendUp?1:0;t="Cours dans le bas des bandes"+(trendUp?" : zone de rachat dans la tendance.":" : pas de signal tant que la tendance ne se retourne pas.");}
  else t="Cours au milieu des bandes : pas d'excès.";
  if(squeeze){t+=" Bandes resserrées au plus bas de 6 mois : un mouvement fort se prépare.";flags.squeeze=true;}
  add('boll','Bandes de Bollinger',s,t);
  s=0;
  if(!I.hasVol)t="Volumes absents : module neutralisé.";
  else{const vr=I.vma20[i]>0?I.vma5[i]/I.vma20[i]:NaN,dir=c[i]-c[i-5];
    if(!isFinite(vr))t="Volumes trop faibles pour être interprétés.";
    else if(dir>0&&vr>=1.3){s=2;t=`Hausse sur 5 séances avec des volumes ${fmt(vr,1)} fois la moyenne : de l'argent sérieux entre sur le titre.`;}
    else if(dir>0&&vr>=0.9){s=1;t=`Hausse accompagnée de volumes normaux (${fmt(vr,1)}×) : mouvement crédible.`;}
    else if(dir>0)t=`Hausse sur volumes faibles (${fmt(vr,1)}×) : peu d'acheteurs derrière, mouvement fragile.`;
    else if(dir<0&&vr>=1.3){s=-2;t=`Baisse avec des volumes ${fmt(vr,1)} fois la moyenne : distribution, des détenteurs importants vendent.`;}
    else if(dir<0&&vr>=0.9){s=-1;t=`Baisse sur volumes normaux (${fmt(vr,1)}×) : les vendeurs ont la main.`;}
    else if(dir<0)t=`Repli sur faibles volumes (${fmt(vr,1)}×) : simple prise de bénéfices.`;
    else t="Cours stable sur 5 séances.";}
  add('vol','Volumes et conviction',s,t);
  s=0;const parts=[];
  if(p>I.hh20[i]){s++;parts.push("nouveau plus haut sur 20 séances (cassure)");}
  if(p<I.ll20[i]){s--;parts.push("nouveau plus bas sur 20 séances");}
  const dd=p/I.hh252[i]-1;
  if(dd>-0.05&&trendUp){s++;parts.push(`à ${pct(dd)} du plus haut de la période, signe de force relative`);}
  if(p<=I.ll252[i]*1.03){s--;parts.push("au contact du plus bas de la période");}
  if(i>=39){const lowA=Math.min(...c.slice(i-19,i+1)),lowB=Math.min(...c.slice(i-39,i-19)),hiA=Math.max(...c.slice(i-19,i+1)),hiB=Math.max(...c.slice(i-39,i-19));
    if(lowA>lowB&&hiA>hiB){s++;parts.push("creux et sommets ascendants");}else if(lowA<lowB&&hiA<hiB){s--;parts.push("creux et sommets descendants");}}
  t=parts.length?"Cours "+parts.join(", ")+".":"Pas de cassure ni de structure marquée : le titre évolue dans un range.";
  add('struct','Structure de prix',s,t);
  s=0;const pr=[];const vol=I.vol20[i],chg=c[i]/c[i-1]-1;
  if(vol<0.22){s++;pr.push(`volatilité annualisée contenue (${pct(vol,0)})`);}
  else if(vol>0.45){s--;pr.push(`volatilité élevée (${pct(vol,0)})`);}
  else pr.push(`volatilité annualisée de ${pct(vol,0)}`);
  if(dd<-0.35){s--;pr.push(`le titre a perdu ${pct(-dd,0)} depuis son plus haut`);}
  if(chg>=0.07){s--;flags.limitUp=true;pr.push("dernière séance au plafond de +7,5 % : pas d'achat au marché");}
  if(chg<=-0.07){flags.limitDown=true;pr.push("dernière séance au plancher de −7,5 % : vérifie un éventuel détachement de dividende");}
  t=pr.join(" ; ").replace(/^./,x=>x.toUpperCase())+".";
  add('risk','Risque et volatilité',s,t);
  s=0;
  if(!I.hasVol)t="Volumes absents : liquidité non vérifiable.";
  else{const val=I.vma20[i]*p,z=I.zero60[i];
    const desc=`Volume moyen ${fmt(I.vma20[i],0)} titres par séance, soit ${fcfa(val)} échangés${isFinite(z)?' ; '+fmt(z*100,0)+' % de séances sans échange':''}`;
    if((isFinite(z)&&z>0.4)||val<2e6){s=-2;flags.illiquid=true;t=desc+". Titre très illiquide : sortir au prix voulu sera difficile.";}
    else if((isFinite(z)&&z>0.2)||val<1e7){s=-1;t=desc+". Liquidité moyenne : fractionne tes ordres.";}
    else if(val>5e7){s=1;t=desc+". Bonne liquidité pour la BRVM.";}
    else t=desc+". Liquidité correcte.";}
  add('liq','Liquidité',s,t);
  if(ctx){
    s=0;const bits=[];let imp=0,cnt=0;
    for(const nw of ctx.news||[]){const age=(I.lastT-dayT(nw.date))/864e5;if(!(age>=-2&&age<=20))continue;imp+=(+nw.impact||0)*(age<=5?1:0.5);cnt++;}
    if(cnt){s=Math.round(clamp(imp,-2,2));bits.push(`${cnt} actualité${cnt>1?'s':''} récente${cnt>1?'s':''}, impact cumulé ${imp>0?'+':''}${fmt(imp,1)}`);}
    const q=ctx.quote;
    if(q&&Array.isArray(q.div)&&q.div.length){const last=q.div[0],y=(+last[1])/p;if(isFinite(y)){bits.push(`dernier dividende ${fmt(+last[1],1)} F (exercice ${last[0]}), soit un rendement de ${fmt(y*100,1)} % au cours actuel`);if(y>=0.07)s=Math.min(2,s+1);else if(y<0.03)s=Math.max(-2,s-0);}}
    t=bits.length?bits.join(' ; ').replace(/^./,x=>x.toUpperCase())+'.':"Aucune actualité récente sur la société ; dividende non renseigné.";
    add('news','Actualité et dividende',s,t);
  }
  let num=0,den=0;for(const mo of models){num+=mo.score*mo.w;den+=2*mo.w;}
  const comp=Math.round(num/den*100);
  const sign=Math.sign(comp);
  const agree=models.filter(mo=>Math.sign(mo.score)===sign&&sign!==0).length;
  let key=comp>=45?2:comp>=20?1:comp>-20?0:comp>-45?-1:-2;
  if(key===2&&(flags.illiquid||flags.limitUp))key=1;
  return {i,comp,key,models,flags,agree,trendUp,trendDown,L,Llab,roc20,roc60,dd,r};
}
const DEC={
  2:{w:'Achat fort',c:'var(--buy)',chip:'buy',s:"Les signaux convergent. Le robot entre en position selon le plan."},
  1:{w:'Achat',c:'var(--buy)',chip:'buy',s:"Contexte favorable. Le robot entre en fractionnant l'achat."},
  0:{w:'Attendre',c:'var(--muted)',chip:'',s:"Pas d'avantage net. Le robot garde le capital disponible et surveille les niveaux clés."},
  '-1':{w:'Alléger',c:'var(--warn)',chip:'warn',s:"La dynamique se dégrade. Le robot n'achète pas et réduit une position existante."},
  '-2':{w:'Sortir',c:'var(--sell)',chip:'sell',s:"Signaux négatifs majoritaires. Le robot vend sa position et reste à l'écart."}
};
const tick=x=>x>=1000?Math.round(x/5)*5:Math.round(x);
function makePlan(I,ev,P){
  const i=ev.i,p=I.c[i],atr=I.atr[i],fee=P.fee;
  const breakout=p>I.hh20[i];
  let entry,how;
  if(ev.flags.limitUp){entry=tick(p-0.5*atr);how="limite sous le dernier cours, on laisse retomber l'excès";}
  else if(ev.key>=1&&breakout){entry=tick(p);how="limite au dernier cours, la cassure doit être suivie";}
  else if(ev.key>=1){entry=tick(p-0.25*atr);how="limite légèrement sous le dernier cours";}
  else{entry=tick(p-atr);how="niveau d'intérêt : achat seulement sur repli";}
  let stop=tick(entry-P.atrk*atr);if(!(stop>0))stop=tick(entry*0.8);
  const R=entry-stop,t1=tick(entry+1.5*R),t2=tick(entry+3*R);
  const perShare=entry*(1+fee)-stop*(1-fee);
  const qRisk=Math.floor(P.capital*P.risk/perShare),qCap=Math.floor(P.capital*P.maxline/(entry*(1+fee)));
  const q=Math.max(0,Math.min(qRisk,qCap));
  const maxDay=I.hasVol?Math.max(1,Math.floor(0.2*I.vma20[i])):NaN;
  return {entry,how,stop,t1,t2,q,qRisk,qCap,cost:q*entry*(1+fee),loss:q*perShare,g1:q*(t1*(1-fee)-entry*(1+fee)),g2:q*(t2*(1-fee)-entry*(1+fee)),
    be:entry*(1+fee)/(1-fee),maxDay,sessions:isFinite(maxDay)&&q>0?Math.ceil(q/maxDay):NaN};
}
function monthPlan(I,ev,P,budget){
  const i=ev.i,p=I.c[i],atr=I.atr[i],fee=P.fee,hot=ev.flags.limitUp||ev.r>75||(isFinite(ev.L)&&p/ev.L-1>0.25);
  let a1,a2,note;const pull=tick(p-atr);
  if(ev.key<=-1){a1=0;a2=0;note="Pas d'achat sur cette valeur ce mois-ci.";}
  else if(hot){a1=0;a2=0.3;note=`Titre en surchauffe : 30 % du montant en ordre limité à ${fcfa(pull)}, le reste attend un repli.`;}
  else if(ev.key===2){a1=1;a2=0;note=`Signal fort : tout le montant en ordre limité au dernier cours (${fcfa(tick(p))}).`;}
  else if(ev.key===1){a1=0.6;a2=0.4;note=`60 % au dernier cours, 40 % en ordre limité à ${fcfa(pull)} pour profiter d'un repli.`;}
  else{a1=0;a2=0.5;note=`Pas de signal net : 50 % en ordre limité à ${fcfa(pull)}, le reste en réserve.`;}
  const q1=Math.floor(budget*a1/(p*(1+fee))),q2=Math.floor(budget*a2/(pull*(1+fee)));
  return {q1,q2,p:tick(p),pull,used:q1*p*(1+fee)+q2*pull*(1+fee),note};
}
function backtest(D,I,P){
  const n=I.n,c=I.c,fee=P.fee;
  const start=Math.min(n-2,n>=320?200:n>=160?100:40);
  let cash=1,sh=0,inPos=false,entryPx=0,entryI=0,stop=0,hiSince=0,pending=null,reason='',days=0;
  const eq=[],trades=[],signals=[];
  for(let i=start;i<n;i++){
    if(pending==='buy'){entryPx=c[i];sh=cash/(c[i]*(1+fee));cash=0;inPos=true;entryI=i;hiSince=c[i];stop=c[i]-P.atrk*I.atr[i];signals.push({i,type:'buy'});}
    else if(pending==='sell'){cash=sh*c[i]*(1-fee);trades.push({a:entryI,b:i,pa:entryPx,pb:c[i],ret:(c[i]*(1-fee))/(entryPx*(1+fee))-1,why:reason});sh=0;inPos=false;signals.push({i,type:'sell'});}
    pending=null;eq.push({i,v:cash+sh*c[i]});if(inPos)days++;
    if(i===n-1)break;
    const ev=evaluate(I,i,P.mode,null);
    if(!inPos){if(ev.comp>=P.thrIn&&!ev.flags.limitUp)pending='buy';}
    else{if(c[i]<stop){pending='sell';reason='Stop suiveur';}else if(ev.comp<=P.thrOut){pending='sell';reason='Signal de sortie';}
      hiSince=Math.max(hiSince,c[i]);stop=Math.max(stop,hiSince-P.atrk*I.atr[i]);}
  }
  const open=inPos?{a:entryI,pa:entryPx,ret:(c[n-1]*(1-fee))/(entryPx*(1+fee))-1}:null;
  let pk=0,mdd=0;for(const e of eq){pk=Math.max(pk,e.v);mdd=Math.min(mdd,e.v/pk-1);}
  let bp=0,bmdd=0;const bh=eq.map(e=>{const v=(c[e.i]*(1-fee))/(c[start]*(1+fee));bp=Math.max(bp,v);bmdd=Math.min(bmdd,v/bp-1);return {i:e.i,v};});
  const years=(D[n-1].t-D[start].t)/(365.25*864e5),total=eq[eq.length-1].v-1,bhTot=bh[bh.length-1].v-1;
  const wins=trades.filter(t=>t.ret>0),losses=trades.filter(t=>t.ret<=0),gw=wins.reduce((s,t)=>s+t.ret,0),gl=-losses.reduce((s,t)=>s+t.ret,0);
  return {start,eq,bh,trades,open,signals,total,bhTot,mdd,bmdd,years,cagr:years>0.5?Math.pow(1+total,1/years)-1:NaN,
    win:trades.length?wins.length/trades.length:NaN,pf:gl>0?gw/gl:(gw>0?Infinity:NaN),avgW:wins.length?gw/wins.length:NaN,avgL:losses.length?-gl/losses.length:NaN,expo:days/eq.length};
}


/* ---------- Référentiel complémentaire ---------- */
const SYMBOLS={"SDSC": "SDSC.ci", "BOAB": "BOAB.bj", "BOABF": "BOABF.bf", "BOAC": "BOAC.ci", "BOAM": "BOAM.ml", "BOAN": "BOAN.ne", "BOAS": "BOAS.sn", "BICB": "BICB.bj", "BNBC": "BNBC.ci", "BICC": "BICC.ci", "BBGC": "BBGC.ci", "CFAC": "CFAC.ci", "CIEC": "CIEC.ci", "CBIBF": "CBIBF.bf", "SEMC": "SEMC.ci", "ECOC": "ECOC.ci", "SIVC": "SIVC.ci", "ETIT": "ETIT.tg", "FTSC": "FTSC.ci", "LNBB": "LNBB.bj", "SVOC": "SVOC.ci", "NEIC": "NEIC.ci", "NTLC": "NTLC.ci", "NSBC": "NSBC.ci", "ONTBF": "ONTBF.bf", "ORGT": "ORGT.tg", "ORAC": "ORAC.ci", "PALC": "PALC.ci", "SAFC": "SAFC.ci", "SPHC": "SPHC.ci", "ABJC": "ABJC.ci", "STAC": "STAC.ci", "SGBC": "SGBC.ci", "CABC": "CABC.ci", "SICC": "SICC.ci", "STBC": "STBC.ci", "SMBC": "SMBC.ci", "SIBC": "SIBC.ci", "SDCC": "SDCC.ci", "SOGC": "SOGC.ci", "SLBC": "SLBC.ci", "SNTS": "SNTS.sn", "SCRC": "SCRC.ci", "TTLC": "TTLC.ci", "TTLS": "TTLS.sn", "PRSC": "PRSC.ci", "UNLC": "UNLC.ci", "UNXC": "UNXC.ci", "SHEC": "SHEC.ci"};
const NAMES={"ABJC": "Servair Abidjan CI", "BBGC": "Bridge Bank Group CI", "BICB": "BIIC Bénin", "BICC": "BICI Côte d'Ivoire", "BNBC": "Bernabé CI", "BOAB": "Bank of Africa Bénin", "BOABF": "Bank of Africa Burkina Faso", "BOAC": "Bank of Africa Côte d'Ivoire", "BOAM": "Bank of Africa Mali", "BOAN": "Bank of Africa Niger", "BOAS": "Bank of Africa Sénégal", "CABC": "Sicable CI", "CBIBF": "Coris Bank International BF", "CFAC": "CFAO Motors CI", "CIEC": "CIE CI", "ECOC": "Ecobank Côte d'Ivoire", "ETIT": "Ecobank Transnational (ETI)", "FTSC": "Filtisac CI", "LNBB": "Loterie Nationale du Bénin", "NEIC": "NEI-CEDA CI", "NSBC": "NSIA Banque CI", "NTLC": "Nestlé CI", "ONTBF": "Onatel Burkina Faso", "ORAC": "Orange Côte d'Ivoire", "ORGT": "Oragroup Togo", "PALC": "Palm CI", "PRSC": "Tractafric Motors CI", "SAFC": "SAFCA CI", "SCRC": "Sucrivoire CI", "SDCC": "SODECI", "SDSC": "Africa Global Logistics CI", "SEMC": "Eviosys Packaging SIEM CI", "SGBC": "Société Générale CI", "SHEC": "Vivo Energy CI", "SIBC": "Société Ivoirienne de Banque", "SICC": "SICOR CI", "SIVC": "Erium CI", "SLBC": "Solibra CI", "SMBC": "SMB CI", "SNTS": "Sonatel Sénégal", "SOGC": "SOGB CI", "SPHC": "SAPH CI", "STAC": "SETAO CI", "STBC": "SITAB CI", "SVOC": "Movis CI", "TTLC": "TotalEnergies Marketing CI", "TTLS": "TotalEnergies Marketing Sénégal", "UNLC": "Unilever CI", "UNXC": "Uniwax CI"};

/* ---------- Construction de la série d'une valeur ---------- */
// rows : [["YYYY-MM-DD", open, high, low, close, volume], ...] ; quote : dernier cours connu (facultatif)
function rowsToSeries(rows,quote){
  const D=[];
  for(const r of rows||[]){const tt=dayT(r[0]);const c=+r[4];if(!isFinite(tt)||!(c>0))continue;
    D.push({t:tt,o:r[1]==null?NaN:+r[1],h:r[2]==null?NaN:+r[2],l:r[3]==null?NaN:+r[3],c,v:r[5]==null?NaN:+r[5]});}
  D.sort((a,b)=>a.t-b.t);
  let live=false;
  if(quote&&quote.c>0&&quote.asOf){const qt=dayT(quote.asOf);
    if(isFinite(qt)&&D.length&&qt===D[D.length-1].t&&quote.intraday){live=true;}
    else if(isFinite(qt)&&(!D.length||qt>D[D.length-1].t)){D.push({t:qt,o:+quote.o||NaN,h:+quote.h||NaN,l:+quote.l||NaN,c:+quote.c,v:isFinite(+quote.v)?+quote.v:NaN});live=!!quote.intraday;}}
  return {D,live};
}
// Analyse complète d'une valeur à la dernière séance. news : [{date, tickers, impact}]
function analyseTicker(t,rows,quote,news,mode){
  const {D,live}=rowsToSeries(rows,quote);
  if(D.length<45)return {t,short:true,n:D.length};
  const I=indicators(D);I.lastT=D[D.length-1].t;
  const mine=(news||[]).filter(n=>(n.tickers||[]).includes(t));
  const ev=evaluate(I,D.length-1,mode||'invest',{news:mine,quote});
  const newsImp=mine.reduce((s,n)=>s+((I.lastT-dayT(n.date))/864e5<=10?+n.impact||0:0),0);
  return {t,D,I,ev,live,newsImp,n:D.length};
}
const DEFAULT_PARAMS={mode:'invest',capital:1000000,monthly:100000,risk:0.015,fee:0.012,thrIn:20,thrOut:-20,atrk:3,maxline:0.25};

export {nf0,fmt,fcfa,pct,esc,clamp,dstr,MONTHS,isoDay,dayT,SECTORS,SECTOR_OF,ALL,SYMBOLS,NAMES,
  sma,ema,rsiCalc,indicators,WEIGHTS,evaluate,DEC,tick,makePlan,monthPlan,backtest,rowsToSeries,analyseTicker,DEFAULT_PARAMS};
