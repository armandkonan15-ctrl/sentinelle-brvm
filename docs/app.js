import {nf0,fmt,fcfa,pct,esc,clamp,dstr,MONTHS,isoDay,dayT,SECTORS,SECTOR_OF,ALL,NAMES,DEC,tick,
  indicators,makePlan,monthPlan,backtest,analyseTicker} from './engine.js';
const $=s=>document.querySelector(s);

/* ---------- État ---------- */
const S={quotes:{},news:[],status:null,config:{watchlist:[]},brief:null,signals:{},hist:{},local:{},pf:{positions:[]}};
let SEL=null,RANGE=252,SORT={k:'comp',dir:-1},VAL=null;
const LS=(k,v)=>{try{if(v===undefined){const x=localStorage.getItem('sentinelle.'+k);return x?JSON.parse(x):null;}localStorage.setItem('sentinelle.'+k,JSON.stringify(v));}catch(e){return null;}};
SEL=LS('sel');S.pf=LS('pf')||{positions:[]};S.local=LS('local')||{};
function params(){
  const g=id=>parseFloat($('#'+id).value);
  return {mode:$('#mode-swing').checked?'swing':'invest',capital:Math.max(0,g('capital')||0),monthly:Math.max(0,g('monthly')||0),risk:clamp((g('risk')||1.5)/100,0.001,0.05),fee:clamp((g('fee')||0)/100,0,0.05),
    thrIn:isFinite(g('thrIn'))?g('thrIn'):20,thrOut:isFinite(g('thrOut'))?g('thrOut'):-20,atrk:clamp(g('atrk')||3,1,6),maxline:clamp((g('maxline')||25)/100,0.05,1)};
}
const PKEYS=['capital','monthly','risk','fee','thrIn','thrOut','atrk','maxline'];
(function(){const p=LS('params');if(!p)return;for(const k of PKEYS)if(p[k]!=null)$('#'+k).value=p[k];if(p.mode)$('#mode-'+p.mode).checked=true;})();
function saveParams(){const o={mode:$('#mode-swing').checked?'swing':'invest'};for(const k of PKEYS)o[k]=$('#'+k).value;LS('params',o);}
const nameOf=t=>(S.quotes[t]&&S.quotes[t].n)||NAMES[t]||t;
function banner(t,kind){const el=$('#banner');el.hidden=!t;el.textContent=t||'';el.className='msg '+(kind||'warn');}

/* ---------- Chargement des données publiées ---------- */
const J=async p=>{const r=await fetch(p+(p.includes('?')?'&':'?')+'v='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(p+' : '+r.status);return r.json();};
async function loadAll(){
  const [q,n,st,cf,br,sg]=await Promise.allSettled([J('data/quotes.json'),J('data/news.json'),J('data/status.json'),J('data/config.json'),J('data/brief.json'),J('data/signals.json')]);
  if(q.status==='fulfilled')S.quotes=q.value;else{banner("Impossible de lire les données. Ouvre la page depuis son adresse GitHub Pages ou un serveur local (voir le guide).",'err');}
  if(n.status==='fulfilled')S.news=n.value;
  if(st.status==='fulfilled')S.status=st.value;
  if(cf.status==='fulfilled')S.config=Object.assign({watchlist:[]},cf.value);
  if(br.status==='fulfilled')S.brief=br.value;
  if(sg.status==='fulfilled')S.signals=sg.value.s||{};
  S.hist={};CACHE.clear();
}
async function history(t){
  if(!S.hist[t]){try{S.hist[t]=(await J(`data/history/${t}.json`)).rows||[];}catch(e){S.hist[t]=[];}}
  const loc=S.local[t];if(!loc||!loc.length)return S.hist[t];
  const m=new Map(S.hist[t].map(r=>[r[0],r]));for(const r of loc)if(!m.has(r[0]))m.set(r[0],r);
  return [...m.values()].sort((a,b)=>a[0]<b[0]?-1:1);
}
const CACHE=new Map();
async function analyse(t,P){
  const rows=await history(t);const key=t+'|'+rows.length+'|'+P.mode+'|'+(S.quotes[t]?.c)+'|'+S.news.length;
  if(CACHE.has(key))return CACHE.get(key);
  const a=analyseTicker(t,rows,S.quotes[t],S.news,P.mode);CACHE.set(key,a);return a;
}

/* ---------- Statut ---------- */
function marketOpen(){const d=new Date(),wd=d.getUTCDay(),m=d.getUTCHours()*60+d.getUTCMinutes();return wd>=1&&wd<=5&&m>=9*60&&m<15*60+30;}
function ago(iso){const t=Date.parse(iso);if(!isFinite(t))return '';const m=Math.round((Date.now()-t)/60000);if(m<1)return "à l'instant";if(m<60)return `il y a ${m} min`;const h=Math.round(m/60);if(h<24)return `il y a ${h} h`;return `le ${dstr(t)}`;}
function renderStatus(){
  const st=S.status,open=marketOpen();
  $('#live').classList.toggle('on',open);
  $('#livetxt').textContent=open?'Séance ouverte':'Séance fermée';
  $('#lastrun').textContent=st&&st.lastRun?`Dernière collecte ${ago(st.lastRun)}`:'';
  $('#lastrun').title=st?(st.note||'')+(st.errors&&st.errors.length?'\nÀ vérifier : '+st.errors.join(' ; '):''):'';
}
// Lien vers la collecte manuelle (GitHub Actions) quand la page est servie par GitHub Pages
(function(){const m=location.hostname.match(/^([^.]+)\.github\.io$/);const repo=location.pathname.split('/').filter(Boolean)[0];
  if(m&&repo){const a=$('#refresh');a.href=`https://github.com/${m[1]}/${repo}/actions/workflows/sentinelle.yml`;a.hidden=false;
    $('#wledit').innerHTML=`<a href="https://github.com/${m[1]}/${repo}/edit/main/docs/data/config.json" target="_blank" rel="noopener">Modifier la liste sur GitHub</a>`;}})();

/* ---------- Marché ---------- */
async function renderMarket(){
  const qs=ALL.map(t=>S.quotes[t]).filter(Boolean);
  const up=qs.filter(q=>q.var>0).length,dn=qs.filter(q=>q.var<0).length,eq=qs.length-up-dn;
  const val=qs.reduce((s,q)=>s+(+q.val||(+q.v||0)*(+q.c||0)),0);
  const lastAs=qs.map(q=>String(q.asOf||'').slice(0,10)).filter(Boolean).sort().pop();
  $('#mktdate').textContent=lastAs?`Cours au ${dstr(dayT(lastAs))}${marketOpen()&&qs.some(q=>q.intraday&&String(q.asOf).slice(0,10)===isoDay(Date.now()))?' · séance en cours, différé 15 min':''}`:'';
  $('#breadth').innerHTML=[['En hausse',up,'up'],['En baisse',dn,'down'],['Inchangées',eq,''],['Montant échangé',fcfa(val),'']].map(([k,v,c])=>`<div><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`).join('');
  const tot=Math.max(1,qs.length);
  $('#breadthbar').innerHTML=`<span style="width:${up/tot*100}%;background:var(--buy)"></span><span style="width:${eq/tot*100}%;background:var(--line)"></span><span style="width:${dn/tot*100}%;background:var(--sell)"></span>`;
  const sorted=[...qs].filter(q=>isFinite(q.var)).sort((a,b)=>b.var-a.var);
  const li=q=>`<li data-t="${esc(q.t)}"><span>${esc(q.t)} <span class="hint">${esc(nameOf(q.t).slice(0,22))}</span></span><span class="mono ${q.var>0?'up':q.var<0?'down':''}">${pct(q.var/100,2)}</span></li>`;
  $('#gainers').innerHTML=sorted.slice(0,5).map(li).join('')||'<li class="hint">—</li>';
  $('#losers').innerHTML=sorted.slice(-5).reverse().map(li).join('')||'<li class="hint">—</li>';
  const fs=$('#fsector').value,fg=$('#fsig').value,mine=new Set([...(S.config.watchlist||[]),...(S.pf.positions||[]).map(p=>p.t)]);
  const rows=[];let analysed=0;
  for(const t of ALL){
    const q=S.quotes[t]||{},s=S.signals[t]||{short:true,n:0};
    if(fs!=='all'&&SECTOR_OF[t]!==fs)continue;
    const r={t,n:nameOf(t),c:+q.c,var:+q.var,val:+q.val||(+q.v||0)*(+q.c||0),comp:s.short?-999:s.comp,key:s.short?-9:s.key,rsi:s.short?NaN:s.rsi,news:s.short?0:s.news,short:s.short,n2:s.n||0};
    if(!s.short)analysed++;
    if(fg==='buy'&&!(r.key>=1))continue;if(fg==='sell'&&!(r.key<=-1&&r.key>-9))continue;if(fg==='mine'&&!mine.has(t))continue;
    rows.push(r);
  }
  rows.sort((a,b)=>{const x=a[SORT.k],y=b[SORT.k];if(typeof x==='string')return SORT.dir*x.localeCompare(y);return SORT.dir*((isFinite(x)?x:-1e12)-(isFinite(y)?y:-1e12));});
  $('#scan').innerHTML=rows.map(r=>{const d=r.short?null:DEC[r.key],w=r.short?0:Math.abs(r.comp)/2;
    return `<tr class="click" data-t="${r.t}"><td><b>${r.t}</b><span class="nm">${esc(r.n)}</span></td><td class="mono">${isFinite(r.c)?nf0.format(r.c):'—'}</td><td class="mono ${r.var>0?'pos':r.var<0?'neg':''}">${isFinite(r.var)?pct(r.var/100,2):'—'}</td><td class="mono">${r.val?fmt(r.val/1e6,1)+' M':'—'}</td>
    <td class="mono">${r.short?'—':(r.comp>0?'+':'')+r.comp}${r.short?'':`<span class="scorebar"><b style="${r.comp>=0?'left:50%':'right:50%'};width:${w}%;background:${r.comp>=0?'var(--buy)':'var(--sell)'}"></b></span>`}</td>
    <td>${r.short?`<span class="chip">Historique ${r.n2}/45</span>`:`<span class="chip ${d.chip}">${d.w}</span>`}</td><td class="mono">${isFinite(r.rsi)?fmt(r.rsi,0):'—'}</td><td class="mono ${r.news>0?'pos':r.news<0?'neg':''}">${r.news?((r.news>0?'+':'')+fmt(r.news,1)):'·'}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">Aucune valeur ne correspond à ce filtre.</td></tr>';
  $('#scanhint').textContent=`${analysed} valeurs sur ${ALL.length} ont assez d'historique (45 séances). Scores calculés à chaque collecte avec le profil investisseur et les réglages standard ; l'onglet Valeur applique tes propres réglages.`;
  for(const th of document.querySelectorAll('th[data-sort]')){if(th.dataset.sort===SORT.k)th.setAttribute('aria-sort',SORT.dir>0?'ascending':'descending');else th.removeAttribute('aria-sort');}
  const opps=ALL.filter(t=>{const s=S.signals[t];return s&&!s.short&&s.key>=1&&!s.illiquid;}).sort((a,b)=>S.signals[b].comp-S.signals[a].comp).slice(0,5);
  $('#opps').innerHTML=opps.length?opps.map(t=>{const s=S.signals[t];return `<div class="model" style="cursor:pointer" data-t="${t}"><h3>${t} <small>${esc(nameOf(t))}</small></h3><span class="chip buy">${DEC[s.key].w} · ${s.comp}</span><p>Achat limite ${fcfa(s.entry)}, stop ${fcfa(s.stop)}, objectif ${fcfa(s.t1)}. ${esc((s.top||'').split('. ')[0])}.</p></div>`;}).join(''):'<p class="hint">Aucun signal d\'achat franc sur les valeurs analysées. Le robot reste patient.</p>';
  const b=S.brief;
  $('#brief').innerHTML='<h2>Note du robot</h2>'+(b&&b.text?`<p class="hint" style="margin-bottom:8px">${esc(b.title||'')} · ${b.at?ago(b.at):''}</p>`+mdLite(b.text):'<p class="hint">La note de marché s\'affiche après la collecte de clôture.</p>');
}
$('#fsector').innerHTML='<option value="all">Tous les secteurs</option>'+Object.keys(SECTORS).map(s=>`<option>${s}</option>`).join('');
$('#fsector').addEventListener('change',renderMarket);$('#fsig').addEventListener('change',renderMarket);
document.querySelector('#tab-marche thead').addEventListener('click',e=>{const th=e.target.closest('th[data-sort]');if(!th)return;const k=th.dataset.sort;SORT=SORT.k===k?{k,dir:-SORT.dir}:{k,dir:k==='t'?1:-1};renderMarket();});
document.querySelector('#tab-marche').addEventListener('click',e=>{const el=e.target.closest('[data-t]');if(!el)return;select(el.dataset.t);location.hash='#valeur';});

/* ---------- Valeur ---------- */
function select(t){SEL=t;LS('sel',t);$('#vsel').value=t;}
function cell(k,v,s,cls){return `<div><div class="k">${k}</div><div class="v ${cls||''}">${v}</div>${s?`<div class="s">${s}</div>`:''}</div>`;}
function dots(s){let h='';for(let k=-2;k<=2;k++){if(k===0){h+='<i class="mid"></i>';continue;}const on=(k<0&&s<=k)||(k>0&&s>=k);h+=`<i class="${on?(k<0?'n':'p'):''}"></i>`;}return `<div class="dots" aria-label="Score ${s}">${h}</div>`;}
async function renderValue(){
  if(!SEL||!SECTOR_OF[SEL])SEL=(S.config.watchlist&&S.config.watchlist[0])||'SIBC';
  $('#vsel').value=SEL;
  const P=params(),a=await analyse(SEL,P),q=S.quotes[SEL]||{};
  if(a.short){$('#vbody').hidden=true;$('#vempty').hidden=false;$('#vempty').innerHTML=`<p><b>${esc(nameOf(SEL))}</b> : ${a.n} séance${a.n>1?'s':''} disponibles, il en faut 45 pour l'analyse complète.</p><p class="hint">Le collecteur télécharge l'historique à sa prochaine exécution. Tu peux aussi coller un historique ci-dessous.</p>`;VAL=null;return;}
  $('#vbody').hidden=false;$('#vempty').hidden=true;
  const {D,I,ev,live}=a;const n=I.n,i=n-1,dec=DEC[ev.key],chg=I.c[i]/I.c[i-1]-1;
  const bt=backtest(D,I,P),plan=makePlan(I,ev,P),mp=monthPlan(I,ev,P,P.monthly);
  VAL={a,bt};
  $('#verdict').style.setProperty('--vcol',dec.c);
  $('#vname').textContent=`${SEL} · ${nameOf(SEL)} · profil ${P.mode==='swing'?'trader swing':'investisseur'}`;
  $('#vword').textContent=dec.w;
  $('#vstats').innerHTML=`<div>Cours${live?' (séance)':''}<b>${fcfa(I.c[i])}</b></div><div>Variation<b class="${chg>0?'up':chg<0?'down':''}">${pct(chg,2)}</b></div><div>Score<b>${ev.comp>0?'+':''}${ev.comp}</b></div>`;
  $('#mk').style.left=((ev.comp+100)/2)+'%';
  $('#vsub').textContent=dec.s+` ${ev.agree} module${ev.agree>1?'s':''} sur ${ev.models.length} vont dans le sens du score.`+(q.asOf?` Données ${q.intraday?'de la séance en cours':'de clôture'} du ${dstr(dayT(q.asOf))}.`:'');
  const fl=[];
  if(live)fl.push('<span class="chip acc">Séance en cours, différé 15 min</span>');
  if(ev.flags.limitUp)fl.push('<span class="chip warn">Plafond +7,5 % touché</span>');
  if(ev.flags.limitDown)fl.push('<span class="chip sell">Plancher −7,5 % touché</span>');
  if(ev.flags.illiquid)fl.push('<span class="chip sell">Titre illiquide</span>');
  if(ev.flags.squeeze)fl.push('<span class="chip warn">Compression de volatilité</span>');
  if(ev.flags.short)fl.push(`<span class="chip warn">Historique de ${n} séances</span>`);
  if(!I.hasHL)fl.push('<span class="chip">ATR estimé sur clôtures</span>');
  fl.push(`<span class="chip ${ev.trendUp?'buy':ev.trendDown?'sell':''}">Tendance ${ev.trendUp?'haussière':ev.trendDown?'baissière':'neutre'}</span>`);
  $('#flags').innerHTML=fl.join('');
  const buy=ev.key>=1;
  $('#plan').innerHTML=cell(buy?"Prix d'achat":"Zone d'intérêt",fcfa(plan.entry),plan.how)+cell('Stop (clôture)',fcfa(plan.stop),`${pct(plan.stop/plan.entry-1)} · ${fmt(P.atrk,1)} ATR`,'sell')+
    cell('Objectif 1',fcfa(plan.t1),`${pct(plan.t1/plan.entry-1)} · 1,5 fois le risque`,'buy')+cell('Objectif 2',fcfa(plan.t2),`${pct(plan.t2/plan.entry-1)} · 3 fois le risque`,'buy')+
    cell('Quantité',nf0.format(plan.q)+' titres',plan.q===plan.qCap&&plan.qCap<plan.qRisk?`plafonnée à ${fmt(P.maxline*100,0)} % du capital`:`risque limité à ${fmt(P.risk*100,1)} % du capital`)+
    cell('Montant engagé',fcfa(plan.cost),'frais inclus')+cell('Perte si stop',fcfa(-plan.loss),'frais inclus','sell')+cell('Gain obj. 1 / 2',fcfa(plan.g1)+' / '+fcfa(plan.g2),'nets de frais','buy')+
    cell('Point mort',fcfa(plan.be),'revente couvrant les frais')+cell('Exécution',isFinite(plan.sessions)?plan.sessions+' séance'+(plan.sessions>1?'s':''):'—',isFinite(plan.maxDay)?`max ${nf0.format(plan.maxDay)} titres par séance`:'');
  $('#plannote').textContent=buy?`Ordre à cours limité à ${fcfa(plan.entry)}. Après l'achat, surveille la clôture : sous ${fcfa(plan.stop)}, vends le lendemain. À l'objectif 1, vends la moitié et remonte le stop au prix d'achat ; laisse courir le reste vers ${fcfa(plan.t2)}.`:
    ev.key===0?`Pas d'achat aujourd'hui. Déclencheurs : repli vers ${fcfa(plan.entry)} avec un RSI au-dessus de 40, ou clôture au-dessus de ${fcfa(I.hh20[i])} avec des volumes en hausse.`:
    `Pas d'achat. Si tu détiens le titre, ${ev.key===-2?'le robot sort':'allège la position'} avec une limite proche de ${fcfa(tick(I.c[i]))}. Retour possible après une clôture au-dessus de la moyenne ${ev.Llab} (${fcfa(ev.L)}).`;
  $('#models').innerHTML=ev.models.map(m=>`<div class="model"><h3>${m.name}<small>poids ${fmt(m.w,1)}</small></h3>${dots(m.score)}<p>${esc(m.text)}</p></div>`).join('');
  const lf=s=>s.charAt(0).toLowerCase()+s.slice(1);
  const so=[...ev.models].sort((x,y)=>y.score*y.w-x.score*x.w),pos=so.filter(m=>m.score>0).slice(0,2),neg=so.filter(m=>m.score<0).reverse().slice(0,2);
  const constat=`${nameOf(SEL)} cote ${fcfa(I.c[i])} (${pct(chg,2)}${live?' en séance':' à la clôture'}). Sur 20 séances : ${pct(ev.roc20)}${isFinite(ev.roc60)?', sur 60 : '+pct(ev.roc60):''}. Écart à la moyenne ${ev.Llab} : ${pct(I.c[i]/ev.L-1)} ; recul depuis le plus haut de la période : ${pct(ev.dd)}.`;
  let an='';
  if(pos.length)an+=`Pour le titre : ${pos.map(m=>lf(m.name)+' ('+lf(m.text.split('. ')[0].replace(/\.$/,''))+')').join(' ; ')}. `;
  if(neg.length)an+=`Contre : ${neg.map(m=>lf(m.name)+' ('+lf(m.text.split('. ')[0].replace(/\.$/,''))+')').join(' ; ')}. `;
  an+=`Score pondéré ${ev.comp>0?'+':''}${ev.comp}/100, ${ev.agree} modules sur ${ev.models.length} alignés. `;
  if(bt.trades.length>=3){const better=bt.total>bt.bhTot,safer=bt.mdd>bt.bmdd;an+=`Sur l'historique disponible, la méthode fait ${pct(bt.total)} contre ${pct(bt.bhTot)} en conservation, creux maximal ${pct(bt.mdd)} contre ${pct(bt.bmdd)}. `+(better&&safer?"Le timing apporte de la valeur sur ce titre.":better?"Plus de rendement, au prix de creux plus profonds.":safer?"Moins de rendement mais meilleure protection du capital.":"Ici, conserver a mieux marché : le robot sert surtout à choisir le moment d'entrée.");}
  else an+="Pas encore assez de transactions simulées pour juger la méthode sur ce titre.";
  const concl=buy?`${dec.w}. Achat limite ${fcfa(plan.entry)}, ${nf0.format(plan.q)} titres pour ${fcfa(plan.cost)}. Invalidation sous ${fcfa(plan.stop)} (perte ${fcfa(plan.loss)}, soit ${fmt(P.risk*100,1)} % du capital).`:ev.key===0?`Attendre. Le robot ne paie pas pour un signal flou.`:`${dec.w}. Pas d'achat tant que la tendance n'est pas réparée.`;
  $('#expert').innerHTML=`<section><div class="eyebrow">Constat</div><p>${esc(constat)}</p></section><section><div class="eyebrow">Analyse</div><p>${esc(an)}</p></section><section><div class="eyebrow">Décision</div><p>${esc(concl+' Versement mensuel : '+lf(mp.note))}</p></section>`;
  const pc=x=>x>0?'var(--buy)':x<0?'var(--sell)':'inherit';
  $('#kpis').innerHTML=[['Robot',pct(bt.total),pc(bt.total)],['Conserver',pct(bt.bhTot),pc(bt.bhTot)],['Rendement annuel',pct(bt.cagr),pc(bt.cagr)],['Baisse maximale',pct(bt.mdd),'var(--sell)'],['Transactions',bt.trades.length+(bt.open?' + 1':''),''],['Réussite',isFinite(bt.win)?fmt(bt.win*100,0)+' %':'—',''],['Facteur de profit',isFinite(bt.pf)?fmt(bt.pf,2):(bt.pf===Infinity?'∞':'—'),''],['Temps investi',fmt(bt.expo*100,0)+' %','']].map(([k,v,c])=>`<div><span class="k">${k}</span><span class="v" style="color:${c||'inherit'}">${v}</span></div>`).join('');
  $('#btnote').textContent=`Test sur ${bt.eq.length} séances depuis le ${dstr(D[bt.start].t)}, exécution à la clôture suivant le signal, frais de ${fmt(P.fee*100,2)} % par ordre, stop suiveur ${fmt(P.atrk,1)} ATR. Le module Actualité n'entre pas dans le backtest.`;
  const rows=bt.trades.slice(-15).reverse().map(t=>`<tr><td>${dstr(D[t.a].t)}</td><td class="mono">${nf0.format(t.pa)}</td><td>${dstr(D[t.b].t)}</td><td class="mono">${nf0.format(t.pb)}</td><td>${t.b-t.a}</td><td class="mono ${t.ret>0?'pos':'neg'}">${pct(t.ret)}</td><td>${t.why}</td></tr>`);
  if(bt.open)rows.unshift(`<tr><td>${dstr(D[bt.open.a].t)}</td><td class="mono">${nf0.format(bt.open.pa)}</td><td>en cours</td><td class="mono">${nf0.format(I.c[i])}</td><td>${i-bt.open.a}</td><td class="mono ${bt.open.ret>0?'pos':'neg'}">${pct(bt.open.ret)}</td><td>Position ouverte</td></tr>`);
  $('#trades').innerHTML=rows.join('')||'<tr><td colspan="7">Aucune transaction simulée sur cet historique.</td></tr>';
  redraw();
}
$('#vsel').innerHTML=ALL.map(t=>`<option value="${t}">${t} · ${esc(NAMES[t]||'')}</option>`).join('');
$('#vsel').addEventListener('change',e=>{select(e.target.value);renderValue();});
for(const r of document.querySelectorAll('input[name=mode]'))r.addEventListener('change',()=>{$('#atrk').value=$('#mode-swing').checked?2:3;saveParams();renderAll();});
$('#rangebar').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;RANGE=+b.dataset.r;for(const x of $('#rangebar').children)x.setAttribute('aria-pressed',x===b?'true':'false');drawPrice();});

/* import CSV local */
function parseNum(s){if(s==null)return NaN;s=String(s).trim().replace(/[\s  ']/g,'');if(s===''||s==='-')return NaN;if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(s.includes(','))s=s.replace(',','.');return parseFloat(s.replace(/[^0-9.\-]/g,''));}
function parseDate(s){if(!s)return NaN;s=String(s).trim();let m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);if(m){let y=+m[3];if(y<100)y+=2000;return Date.UTC(y,+m[2]-1,+m[1]);}return NaN;}
function parseCSV(text){
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);if(lines.length<2)throw new Error("Pas assez de lignes.");
  const delim=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';const split=l=>l.split(delim).map(s=>s.trim().replace(/^"|"$/g,''));
  const head=split(lines[0]),hasHeader=isNaN(parseDate(head[0]))&&/[a-zA-Zé]/.test(head.join(''));let idx={};
  if(hasHeader){head.forEach((h,j)=>{const x=h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    if(idx.date==null&&/date|jour|seance/.test(x))idx.date=j;else if(idx.open==null&&/ouv|open/.test(x))idx.open=j;else if(idx.high==null&&/haut|high|\bmax/.test(x))idx.high=j;else if(idx.low==null&&/\bbas\b|low|\bmin/.test(x))idx.low=j;else if(idx.vol==null&&/vol|quantit|titres/.test(x))idx.vol=j;else if(idx.close==null&&/clot|close|cours|dernier|last|prix|ferm/.test(x))idx.close=j;});
    if(idx.date==null)idx.date=0;if(idx.close==null)throw new Error("Colonne de clôture introuvable.");}
  else{const nc=head.length;idx=nc===2?{date:0,close:1}:nc<=4?{date:0,close:1,vol:2}:nc===5?{date:0,open:1,high:2,low:3,close:4}:{date:0,open:1,high:2,low:3,close:4,vol:5};}
  const out=[];for(let k=hasHeader?1:0;k<lines.length;k++){const c=split(lines[k]),t=parseDate(c[idx.date]),cl=parseNum(c[idx.close]);if(!isFinite(t)||!(cl>0))continue;
    const g=j=>j==null?null:(isFinite(parseNum(c[j]))?parseNum(c[j]):null);out.push([isoDay(t),g(idx.open),g(idx.high),g(idx.low),cl,g(idx.vol)]);}
  if(!out.length)throw new Error("Aucune ligne lisible.");return out;
}
$('#importbtn').addEventListener('click',()=>{
  try{const rows=parseCSV($('#paste').value);S.local[SEL]=rows.slice(-1500);LS('local',S.local);CACHE.clear();
    $('#importmsg').textContent=`${rows.length} séances importées sur cet appareil.`;$('#paste').value='';renderAll();}
  catch(e){$('#importmsg').textContent='Erreur : '+(e.message||e);}
});

/* ---------- Graphiques ---------- */
function tok(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
function setup(cv){const r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;cv.width=Math.max(1,Math.round(r.width*dpr));cv.height=Math.max(1,Math.round(r.height*dpr));const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);return {ctx,W:r.width,H:r.height};}
function niceTicks(lo,hi,k){const span=hi-lo||1,raw=span/k,mag=Math.pow(10,Math.floor(Math.log10(raw)));const st=[1,2,2.5,5,10].map(x=>x*mag).find(x=>span/x<=k)||raw;const out=[];for(let v=Math.ceil(lo/st)*st;v<=hi+1e-9;v+=st)out.push(v);return out;}
function monthTicks(D,a,b){const out=[];let last=-1;const span=b-a,every=span>400?3:span>180?2:1;for(let i=a;i<=b;i++){const d=new Date(D[i].t),m=d.getUTCMonth();if(m!==last){if(last!==-1&&m%every===0)out.push({i,label:MONTHS[m]+(m===0?' '+String(d.getUTCFullYear()).slice(2):'')});last=m;}}return out;}
function drawPrice(){
  if(!VAL||$('#tab-valeur').hidden)return;const {D,I}=VAL.a,bt=VAL.bt,cv=$('#cPrice');const {ctx,W,H}=setup(cv);if(W<10)return;
  const n=I.n,a=RANGE&&n>RANGE?n-RANGE:0,b=n-1,padL=8,padR=58,top=10,mainH=Math.round(H*0.70)-top,rsiTop=top+mainH+22,rsiH=H-rsiTop-22;
  const xs=i=>padL+(i-a)/Math.max(1,b-a)*(W-padL-padR);let lo=Infinity,hi=-Infinity;
  const LM=isFinite(I.sma200[b])?I.sma200:I.sma100;
  for(let i=a;i<=b;i++)for(const v of [I.c[i],I.bbU[i],I.bbL[i],I.sma50[i],LM[i]])if(isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}
  const pad=(hi-lo)*0.06||hi*0.02;lo-=pad;hi+=pad;const ys=v=>top+(hi-v)/(hi-lo)*mainH;
  const grid=tok('--grid'),muted=tok('--muted'),mono=tok('--f-mono')||'monospace';ctx.font='11px '+mono;ctx.textBaseline='middle';
  for(const v of niceTicks(lo,hi,5)){const y=ys(v);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();ctx.fillStyle=muted;ctx.textAlign='left';ctx.fillText(nf0.format(v),W-padR+6,y);}
  ctx.fillStyle=tok('--band');ctx.beginPath();let st=false;for(let i=a;i<=b;i++){if(!isFinite(I.bbU[i]))continue;const x=xs(i),y=ys(I.bbU[i]);if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);}
  for(let i=b;i>=a;i--){if(!isFinite(I.bbL[i]))continue;ctx.lineTo(xs(i),ys(I.bbL[i]));}ctx.closePath();ctx.fill();
  const line=(A,col,w)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();let s=false;for(let i=a;i<=b;i++){const v=A[i];if(!isFinite(v)){s=false;continue;}const x=xs(i),y=ys(v);if(!s){ctx.moveTo(x,y);s=true;}else ctx.lineTo(x,y);}ctx.stroke();};
  line(LM,tok('--ma200'),1.6);line(I.sma50,tok('--ma50'),1.6);line(I.c,tok('--price'),1.7);
  for(const s of bt.signals){if(s.i<a||s.i>b)continue;const x=xs(s.i),y=ys(I.c[s.i]);ctx.fillStyle=s.type==='buy'?tok('--buy'):tok('--sell');ctx.beginPath();if(s.type==='buy'){ctx.moveTo(x,y+7);ctx.lineTo(x-6,y+17);ctx.lineTo(x+6,y+17);}else{ctx.moveTo(x,y-7);ctx.lineTo(x-6,y-17);ctx.lineTo(x+6,y-17);}ctx.closePath();ctx.fill();}
  const ly=ys(I.c[b]);ctx.fillStyle=tok('--accent');ctx.fillRect(W-padR+2,ly-9,padR-2,18);ctx.fillStyle=tok('--accent-ink');ctx.textAlign='left';ctx.fillText(nf0.format(I.c[b]),W-padR+6,ly);
  const yr=v=>rsiTop+(100-v)/100*rsiH;ctx.fillStyle=tok('--band');ctx.fillRect(padL,yr(70),W-padL-padR,yr(30)-yr(70));
  for(const v of [30,70]){ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(padL,yr(v));ctx.lineTo(W-padR,yr(v));ctx.stroke();ctx.fillStyle=muted;ctx.fillText(String(v),W-padR+6,yr(v));}
  ctx.strokeStyle=tok('--accent');ctx.lineWidth=1.4;ctx.beginPath();let s2=false;for(let i=a;i<=b;i++){const v=I.rsi[i];if(!isFinite(v))continue;const x=xs(i),y=yr(v);if(!s2){ctx.moveTo(x,y);s2=true;}else ctx.lineTo(x,y);}ctx.stroke();
  ctx.fillStyle=muted;ctx.textAlign='center';ctx.textBaseline='alphabetic';for(const m of monthTicks(D,a,b)){const x=xs(m.i);if(x<padL+14||x>W-padR-14)continue;ctx.fillText(m.label,x,H-6);}
}
function drawEq(){
  if(!VAL||$('#tab-valeur').hidden)return;const {D}=VAL.a,bt=VAL.bt,cv=$('#cEq');const {ctx,W,H}=setup(cv);if(W<10||bt.eq.length<2)return;
  const padL=8,padR=52,top=10,h=H-top-24,a=bt.eq[0].i,b=bt.eq[bt.eq.length-1].i,xs=i=>padL+(i-a)/Math.max(1,b-a)*(W-padL-padR);
  let lo=Infinity,hi=-Infinity;for(const s of [bt.eq,bt.bh])for(const e of s){lo=Math.min(lo,e.v);hi=Math.max(hi,e.v);}const pd=(hi-lo)*0.08||0.05;lo-=pd;hi+=pd;const ys=v=>top+(hi-v)/(hi-lo)*h;
  const grid=tok('--grid'),muted=tok('--muted');ctx.font='11px '+(tok('--f-mono')||'monospace');ctx.textBaseline='middle';
  for(const v of niceTicks(lo*100,hi*100,4)){const y=ys(v/100);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();ctx.fillStyle=muted;ctx.textAlign='left';ctx.fillText(fmt(v,0),W-padR+6,y);}
  const path=s=>{ctx.beginPath();s.forEach((e,k)=>{const x=xs(e.i),y=ys(e.v);k?ctx.lineTo(x,y):ctx.moveTo(x,y);});};
  path(bt.eq);ctx.lineTo(xs(b),top+h);ctx.lineTo(xs(a),top+h);ctx.closePath();ctx.fillStyle=tok('--band');ctx.fill();
  path(bt.bh);ctx.strokeStyle=muted;ctx.lineWidth=1.3;ctx.stroke();path(bt.eq);ctx.strokeStyle=tok('--accent');ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=muted;ctx.textAlign='center';ctx.textBaseline='alphabetic';for(const m of monthTicks(D,a,b)){const x=xs(m.i);if(x<padL+14||x>W-padR-14)continue;ctx.fillText(m.label,x,H-6);}
}
function redraw(){drawPrice();drawEq();}

/* ---------- Portefeuille ---------- */
async function renderPortfolio(){
  const P=params(),pos=S.pf.positions||[];let tv=0,tc=0;
  const rows=[];
  for(const [k,p] of pos.entries()){const q=S.quotes[p.t]||{},a=await analyse(p.t,P),c=+q.c||NaN,v=p.q*c,cost=p.q*p.pru;tv+=isFinite(v)?v:0;tc+=cost;
    let trail='—',alert='';if(!a.short){const I=a.I,i=I.n-1,hi=Math.max(...I.c.slice(Math.max(0,i-21)));const ts=tick(hi-P.atrk*I.atr[i]);trail=fcfa(ts);if(c<ts)alert=' <span class="chip sell">Sous le stop</span>';}
    rows.push({p,k,a,c,v,cost,trail,alert});}
  $('#pos').innerHTML=rows.length?rows.map(r=>{const pl=r.v-r.cost,d=r.a.short?null:DEC[r.a.ev.key];
    return `<tr><td><b>${r.p.t}</b><span class="nm">${esc(nameOf(r.p.t))}</span></td><td class="mono">${nf0.format(r.p.q)}</td><td class="mono">${nf0.format(r.p.pru)}</td><td class="mono">${isFinite(r.c)?nf0.format(r.c):'—'}</td><td class="mono">${fcfa(r.v)}</td><td class="mono ${pl>0?'pos':pl<0?'neg':''}">${fcfa(pl)}<br><span class="hint">${pct(r.v/r.cost-1)}</span></td><td class="mono">${tv?fmt(r.v/tv*100,0)+' %':'—'}</td><td>${d?`<span class="chip ${d.chip}">${d.w}</span>`:'<span class="chip">En attente</span>'}${r.alert}</td><td class="mono">${r.trail}</td><td><button class="sm" data-del="${r.k}" aria-label="Retirer ${r.p.t}">Retirer</button></td></tr>`;}).join(''):
    '<tr><td colspan="10" class="empty">Aucune position enregistrée. Ajoute tes lignes pour que le robot les surveille. Elles restent sur cet appareil.</td></tr>';
  $('#pftotal').textContent=rows.length?`Valeur ${fcfa(tv)} · investi ${fcfa(tc)} · ${pct(tv/tc-1)}`:'';
  const held=new Set(pos.map(p=>p.t)),wl=new Set(S.config.watchlist||[]);
  const bonus=t=>held.has(t)||wl.has(t)?5:0;
  const cands=ALL.filter(t=>{const s=S.signals[t];return s&&!s.short&&s.key>=1&&!s.illiquid;}).sort((a,b)=>(S.signals[b].comp+bonus(b))-(S.signals[a].comp+bonus(a))).slice(0,2);
  const budget=P.monthly;let html='',note='',used=0;
  if(!cands.length){html=cell('Montant en réserve',fcfa(budget),'aucun signal d\'achat franc')+cell('Lignes à renforcer','—','');note="Aucune valeur ne présente un signal d'achat solide et liquide aujourd'hui. Garde le versement en réserve : il sera déployé dès qu'un signal apparaîtra.";}
  else{const shares=cands.length===1?[1]:[0.6,0.4];
    for(const [k,t] of cands.entries()){const a=await analyse(t,P);if(a.short)continue;const mp=monthPlan(a.I,a.ev,P,budget*shares[k]);used+=mp.used;html+=cell(`${t} · ${fmt(shares[k]*100,0)} %`,(mp.q1+mp.q2)+' titres',`${mp.q1?mp.q1+' à '+fcfa(mp.p):''}${mp.q1&&mp.q2?' · ':''}${mp.q2?mp.q2+' à '+fcfa(mp.pull):''}`,'buy');note+=`${t} (${DEC[a.ev.key].w}, score ${a.ev.comp}) : ${mp.note} `;}
    html+=cell('Engagé',fcfa(used),'frais inclus')+cell('Réserve',fcfa(budget-used),'reportée');
    note+="Les deux meilleurs signaux liquides se partagent le versement, avec une préférence pour tes lignes et valeurs suivies.";}
  $('#mplan').innerHTML=html;$('#mnote').textContent=note;
  $('#wl').innerHTML=(S.config.watchlist||[]).map(t=>`<span class="chip acc">${t}</span>`).join('')||'<span class="hint">Aucune valeur suivie.</span>';
}
const opts=ALL.map(t=>`<option value="${t}">${t}</option>`).join('');$('#addt').innerHTML=opts;
function savePf(){LS('pf',S.pf);}
$('#addbtn').addEventListener('click',()=>{const t=$('#addt').value,q=Math.floor(+$('#addq').value),p=+$('#addp').value;if(!(q>0)||!(p>0)){banner('Indique une quantité et un prix moyen d\'achat.','warn');return;}
  const pos=S.pf.positions||[];const ex=pos.find(x=>x.t===t);if(ex){const tq=ex.q+q;ex.pru=Math.round((ex.pru*ex.q+p*q)/tq);ex.q=tq;}else pos.push({t,q,pru:p});S.pf.positions=pos;$('#addq').value='';$('#addp').value='';banner('','');savePf();renderAll();});
$('#pos').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;S.pf.positions.splice(+b.dataset.del,1);savePf();renderAll();});
for(const id of PKEYS)$('#'+id).addEventListener('input',()=>{saveParams();renderAllSoon();});

/* ---------- Actualités ---------- */
function renderNews(){
  const f=$('#nfilter').value,mine=new Set([...(S.config.watchlist||[]),...(S.pf.positions||[]).map(p=>p.t)]);
  let list=[...S.news].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(f==='listed')list=list.filter(n=>(n.tickers||[]).length);if(f==='mine')list=list.filter(n=>(n.tickers||[]).some(t=>mine.has(t)));if(f==='strong')list=list.filter(n=>Math.abs(+n.impact||0)>=2);
  $('#news').innerHTML=list.length?list.slice(0,100).map(n=>{const im=+n.impact||0;return `<article><div class="meta"><span>${n.date?dstr(dayT(n.date))+(String(n.date).length>10&&!String(n.date).endsWith('00:00')?' '+String(n.date).slice(11,16):''):''}</span>${(n.tickers||[]).map(t=>`<span class="chip acc" data-t="${esc(t)}" style="cursor:pointer">${esc(t)}</span>`).join('')}<span class="chip ${im>0?'buy':im<0?'sell':''}">Impact ${im>0?'+':''}${im}</span>${n.cat?`<span class="chip">${esc(n.cat)}</span>`:''}</div>
    <h3>${n.url?`<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>`:esc(n.title)}</h3>${n.summary?`<p>${esc(n.summary)}</p>`:''}</article>`;}).join(''):'<div class="empty">Aucune actualité pour ce filtre.</div>';
}
$('#nfilter').addEventListener('change',renderNews);
$('#news').addEventListener('click',e=>{const c=e.target.closest('[data-t]');if(!c)return;select(c.dataset.t);location.hash='#valeur';});
function mdLite(src){const lines=esc(src).split(/\n/);let out='',ul=false;const inl=s=>s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  for(const l0 of lines){const l=l0.trim();if(/^[-•*] /.test(l)){if(!ul){out+='<ul style="margin:0 0 8px;padding-left:1.2em">';ul=true;}out+='<li>'+inl(l.slice(2))+'</li>';continue;}if(ul){out+='</ul>';ul=false;}if(!l)continue;out+='<p>'+inl(l)+'</p>';}
  if(ul)out+='</ul>';return out;}

/* ---------- Navigation ---------- */
const TABS=['marche','valeur','portefeuille','actualites'];
function current(){const h=(location.hash||'').slice(1);return TABS.includes(h)?h:'marche';}
function route(){renderStatus();const tab=current();for(const t of TABS)$('#tab-'+t).hidden=t!==tab;
  for(const a of document.querySelectorAll('nav.tabs a'))a.setAttribute('aria-current',a.dataset.tab===tab?'page':'false');renderTab(tab);}
async function renderTab(tab){try{if(tab==='marche')await renderMarket();else if(tab==='valeur')await renderValue();else if(tab==='portefeuille')await renderPortfolio();else renderNews();}catch(e){console.error(e);banner('Erreur d\'affichage : '+e.message,'err');}}
function renderAll(){renderStatus();renderTab(current());}
let rtm;function renderAllSoon(){clearTimeout(rtm);rtm=setTimeout(renderAll,200);}
window.addEventListener('hashchange',route);
if(window.ResizeObserver){const ro=new ResizeObserver(()=>redraw());ro.observe($('#cPrice').parentElement);ro.observe($('#cEq').parentElement);}else window.addEventListener('resize',redraw);
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',redraw);}catch(e){}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(redraw);

/* ---------- Démarrage et mise à jour automatique ---------- */
await loadAll();route();
setInterval(renderStatus,30000);
setInterval(async()=>{try{const st=await J('data/status.json');if(!S.status||st.lastRun!==S.status.lastRun){await loadAll();renderAll();}}catch(e){}},180000);
