/* GASEO anonymous industry survey engine - extracted from index.html for caching */
/* ── GASEO: Anonymous Industry Survey Engine ── */
const CORS_PROXIES = ['/proxy?url='];
const SITE_LABELS = ['Site A', 'Site B', 'Site C', 'Site D', 'Site E', 'Site F'];
const COLORS = ['#6c5ce7','#00cec9','#f57c00','#1565c0','#c62828','#00838f'];
const DIM_COLORS = {SEO:'#1565c0',AEO:'#c62828',GEO:'#2e7d32',Entity:'#e65100',Crawler:'#00838f',Structure:'#6c5ce7',Citation:'#f57c00'};
const MAX_PER_DIM = {SEO:55,AEO:55,GEO:55,Entity:55,Structure:55,Citation:50,Crawler:55};

function scrollToAudit(){document.getElementById('siteUrl1').scrollIntoView({behavior:'smooth'});document.getElementById('siteUrl1').focus();}
function normUrl(r){let u=r.trim();if(!/^https?:\/\//i.test(u))u='https://'+u;try{return new URL(u).href.replace(/\/$/,'')}catch(e){return null}}

async function fetchPage(url){for(const p of CORS_PROXIES){try{const r=await fetch(p+encodeURIComponent(url),{signal:AbortSignal.timeout(10000)});if(r.ok)return await r.text()}catch(e){continue}}return null}

/* Analyzers */
function analyzeSEO(h,u){let s=0,f=[],x=[];
const t=/<title[^>]*>([^<]+)<\/title>/i.exec(h);if(t){s+=15;f.push('Title present')}else x.push('Missing title tag');
const d=/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)/i.exec(h);if(d){s+=15;f.push('Meta description present')}else x.push('Missing meta description');
if(/<h1[^>]*>/i.test(h)){s+=10;f.push('H1 found')}else x.push('Missing H1 heading');
if(/<link[^>]+rel=["']canonical["']/i.test(h)){s+=5;f.push('Canonical URL set')}else x.push('Missing canonical link');
const imgs=(h.match(/<img[^>]*>/gi)||[]).length,alts=(h.match(/alt=["'][^"']*["']/gi)||[]).length;
if(imgs===0){s+=5;f.push('No images')}else if(alts>=imgs*0.8){s+=5;f.push(imgs+' images with alt text')}else x.push('Alt text missing on '+(imgs-alts)+' images');
if(u.startsWith('https://')){s+=5;f.push('HTTPS')}else x.push('Not HTTPS');
return{score:Math.min(s,55),findings:f,fixes:x}}

function analyzeAEO(h){let s=0,f=[],x=[];
if(/"@type"\s*:\s*"FAQPage"/i.test(h)){s+=20;f.push('FAQPage schema')}else x.push('Missing FAQPage schema');
if(/"@type"\s*:\s*"HowTo"/i.test(h)){s+=15;f.push('HowTo schema')};
if(/"@type"\s*:\s*"Article"/i.test(h)||/<article[^>]*>/i.test(h)){s+=10;f.push('Article structure')}else x.push('Missing Article structure');
if(/"@type"\s*:\s*"BreadcrumbList"/i.test(h)){s+=10;f.push('BreadcrumbList')}else x.push('Missing BreadcrumbList');
const ps=(h.match(/<\/p>/gi)||[]).length;if(ps>=5){s+=5;f.push(ps+' paragraphs')}else x.push('Few paragraphs (<5)');
return{score:Math.min(s,55),findings:f,fixes:x}}

function analyzeGEO(h,u){let s=0,f=[],x=[];
if(/og:title/i.test(h)&&/og:description/i.test(h)){s+=15;f.push('Open Graph tags')}else x.push('Missing Open Graph tags');
if(/application\/ld\+json/i.test(h)){s+=15;f.push('JSON-LD present')}else x.push('Missing JSON-LD');
if(/"@type"\s*:\s*"Organization"/i.test(h)){s+=10;f.push('Organization schema')}else x.push('Missing Organization schema');
const wc=(h.replace(/<[^>]*>/g,'').match(/\b\w+\b/g)||[]).length;
if(wc>500){s+=10;f.push(wc+' words')}else if(wc>150){s+=5;f.push(wc+' words (borderline)')}else x.push('Low word count ('+wc+')');
if(/dateModified|datePublished|"datePublished"/i.test(h)){s+=5;f.push('Date signals')}else x.push('No date signals');
return{score:Math.min(s,55),findings:f,fixes:x}}

function analyzeEntity(h){let s=0,f=[],x=[];
if(/sameAs/i.test(h)){s+=25;f.push('sameAs links')}else x.push('Missing sameAs links');
if(/"@type"\s*:\s*"Organization"/i.test(h)){s+=20;f.push('Organization entity')}else x.push('Missing Organization entity');
if(/"@type"\s*:\s*"PostalAddress"/i.test(h)||/address/i.test(h)){s+=10;f.push('Address signals')};
return{score:Math.min(s,55),findings:f,fixes:x}}

function analyzeStructure(h){let s=0,f=[],x=[];
const h2s=(h.match(/<h2[^>]*>/gi)||[]).length;if(h2s>=3){s+=20;f.push(h2s+' H2 headings')}else if(h2s>=1){s+=10;f.push(h2s+' H2(s)')}else x.push('Missing H2 headings');
if(/<[ou]l[^>]*>/i.test(h)){s+=15;f.push('Lists present')}else x.push('No lists');
if(/viewport/i.test(h)){s+=10;f.push('Mobile viewport')}else x.push('Missing viewport');
if(/html[^>]+lang=["']/i.test(h)){s+=10;f.push('Lang declared')}else x.push('Missing lang attribute');
return{score:Math.min(s,55),findings:f,fixes:x}}

function analyzeCitation(h){let s=0,f=[],x=[];
if(/author/i.test(h)||/"@type"\s*:\s*"Person"/i.test(h)){s+=20;f.push('Author signals')}else x.push('Missing author');
const el=(h.match(/href=["']https?:\/\/(?!.*proofposts\.com)/gi)||[]).length;
if(el>=3){s+=15;f.push(el+' external links')}else if(el>=1){s+=8;f.push(el+' external link(s)')}else x.push('No external links');
if(/<blockquote/i.test(h)||/<q[^>]*>/i.test(h)){s+=10;f.push('Citation markup')};
if(/<title[^>]*>[^<]{15,}/i.test(h)){s+=5;f.push('Descriptive title')}else x.push('Short title');
return{score:Math.min(s,50),findings:f,fixes:x}}

function analyzeCrawler(h){let s=0,f=[],x=[];
if(/<meta[^>]+name=["']robots["']/i.test(h)){s+=15;f.push('Robots meta')};
const _robotsMeta=(h.match(/<meta[^>]+name=["']robots["'][^>]*>/i)||[''])[0];if(!/noindex/i.test(_robotsMeta)){s+=20;f.push('Indexable')}else x.push('noindex detected');
if(/sitemap/i.test(h)){s+=10;f.push('Sitemap ref')};
const tr=h.replace(/<[^>]*>/g,'').length/Math.max(h.length,1);
if(tr>0.15){s+=10;f.push('Good text ratio ('+Math.round(tr*100)+'%)')}else x.push('Low text ratio');
return{score:Math.min(s,55),findings:f,fixes:x}}

async function analyzeUrl(url){
  const html=await fetchPage(url);if(!html)return null;
  const raw=[
    {name:'SEO',...analyzeSEO(html,url)},{name:'AEO',...analyzeAEO(html)},
    {name:'GEO',...analyzeGEO(html,url)},{name:'Entity',...analyzeEntity(html)},
    {name:'Crawler',...analyzeCrawler(html)},{name:'Structure',...analyzeStructure(html)},
    {name:'Citation',...analyzeCitation(html)}
  ];
  raw.forEach(d=>{d.pct=Math.round((d.score/MAX_PER_DIM[d.name])*100)});
  return{url,overall:Math.round(raw.reduce((s,d)=>s+d.pct,0)/raw.length),dims:raw}}

/* Auto-find competitors via web search */
async function autoFindCompetitors(){
  const industry=document.getElementById('industry').value.trim();
  if(!industry){alert('Enter an industry or keyword first (e.g., "Singapore SaaS")');return}
  const status=document.getElementById('autoFindStatus');status.style.display='block';status.textContent='Searching for competitors…';
  
  // Check how many competitor slots are empty (sites 2-5)
  const emptySlots=[];
  for(let i=2;i<=5;i++){const v=document.getElementById('siteUrl'+i).value.trim();if(!v)emptySlots.push(i)}
  if(emptySlots.length===0){status.textContent='All competitor slots are already filled.';return}
  
  const needed=Math.min(emptySlots.length,4);
  const query=encodeURIComponent(industry+' company website');
  // Bing returns real result markup through these CORS proxies; Google answers with a
  // JavaScript challenge page (no extractable URLs), so Bing is the search engine here.
  const SEARCH_BLOCK=/(bing|bingj|microsoft|live|msn|yahoo|google|youtube|facebook|wikipedia|duckduckgo|schema|w3|proofposts)\./i;
  const BLOCKED_TLD=/^(bing|bingj|microsoft|live|msn|yahoo|google|youtube|facebook|wikipedia|duckduckgo|schema|w3|proofposts)$/i;
  function extractDomains(html){
    let list=[];
    const cites=html.match(/<cite[^>]*>[\s\S]*?<\/cite>/gi)||[];
    cites.forEach(function(c){const t=c.replace(/<[^>]*>/g,' ');const m=t.match(/https?:\/\/[^›<]+/i);if(m)list.push(m[0].replace(/\s+/g,''))});
    if(!list.length){list=html.match(/https?:\/\/(?:www\.)?[\w.-]+\.[a-z]{2,}(?:\/[^\s"'<]*)?/gi)||[]}
    return [...new Set(list.map(function(u){try{return new URL(u).origin}catch(e){return null}}).filter(Boolean))]
      .filter(function(u){try{const h=new URL(u).hostname;const tld=h.split('.').pop();
        if(!/^[a-z]{2,24}$/.test(tld))return false;
        return !BLOCKED_TLD.test(tld)&&!SEARCH_BLOCK.test(h);}catch(e){return false}});
  }
  let urls=[];
  for(const proxy of CORS_PROXIES){
    try{
      const r=await fetch(proxy+'https://www.bing.com/search?q='+query+'&count='+(needed+6),{signal:AbortSignal.timeout(9000)});
      if(!r.ok)continue;
      // Merge across proxies: a later proxy returning fewer or zero domains must not
      // wipe out a good result from an earlier one (corsproxy=401, allorigins=0 yield).
      urls=[...new Set(urls.concat(extractDomains(await r.text())))];
      if(urls.length>=needed)break;
    }catch(e){continue}
  }
  
  if(urls.length===0){
    status.textContent='Could not find competitors automatically. Please enter URLs manually.';
    return;
  }
  
  // Fill empty slots
  for(let j=0;j<needed&&j<urls.length;j++){
    document.getElementById('siteUrl'+emptySlots[j]).value=urls[j];
  }
  status.textContent='Found '+Math.min(needed,urls.length)+' competitor(s). Review and edit if needed.';
}

/* Main survey */
async function runSurvey(){
  const urls=[];
  for(let i=1;i<=5;i++){const v=document.getElementById('siteUrl'+i).value.trim();if(v)urls.push(v)}
  
  const email=document.getElementById('auditEmail').value.trim();if(!email||!email.includes('@')){alert('Please enter your email to receive the full report.');return}
  if(urls.length<1){alert('Enter at least your website URL.');return}
  if(urls.length<4){alert('Please enter at least 4 websites total (your site + 3 competitors) for a meaningful survey. Use "Find Competitors" above if needed.');return}
  
  const validUrls=urls.map(normUrl).filter(Boolean);
  if(validUrls.length<4){alert('Some URLs appear invalid. Please check them.');return}
  
  const result=document.getElementById('auditResult');result.classList.add('show');
  result.innerHTML='<div style="text-align:center;padding:30px"><div class="score-circle" style="animation:pulse 1.5s infinite;font-size:1.2em">⚡</div><p>Analyzing '+validUrls.length+' websites across 7 dimensions…<br><small>Fetching pages, running audits</small></p></div>';
  
  const allData=[];
  for(const u of validUrls){const d=await analyzeUrl(u);if(d)allData.push(d)}
  
  if(allData.length<2){result.innerHTML='<div style="text-align:center;padding:20px">Could not reach enough sites. Most sites block automated checks. <a href="pricing.html">Paid plans include manual audits →</a></div>';return}
  
  // Sort by score descending
  allData.sort((a,b)=>b.overall-a.overall);
  
  // Find which rank the client's site got (first URL entered = client)
  const clientUrl=validUrls[0];
  const clientRank=allData.findIndex(d=>d.url===clientUrl);
  const clientData=clientRank>=0?allData[clientRank]:null;
  
  // Persist this audit to localStorage so the checkout flow can capture day-0 scores (report cadence)
  try{
    localStorage.setItem('gaseoLastAudit', JSON.stringify({
      site: clientUrl,
      competitors: validUrls.filter(u=>u!==clientUrl),
      overall: clientData?clientData.overall:null,
      dims: clientData?clientData.dims.map(d=>({name:d.name,pct:d.pct})):[],
      industry: (document.getElementById('industry').value||'').trim(),
      ts: Date.now()
    }));
  }catch(e){}
  
  // Assign labels deterministically by rank (not shuffled — client needs to know theirs)
  // Client sees "Your Site → Site X" privately on their screen
  const labels=SITE_LABELS.slice(0,allData.length);
  
  // League table rows
  let rows='';
  allData.forEach((d,i)=>{
    const label=labels[i];
    const isClient=d.url===clientUrl;
    const rankBadge=i===0?'rank-1st':i===1?'rank-2nd':i===2?'rank-3rd':'rank-other';
    const sc=d.overall>=70?'score-high':d.overall>=45?'score-mid':'score-low';
    const clr=COLORS[i%COLORS.length];
    let dimBars='';
    d.dims.forEach(dd=>{dimBars+='<span style="display:inline-block;width:13%;margin-right:1%;font-size:.7em;text-align:center"><span style="color:'+DIM_COLORS[dd.name]+'">'+dd.name[0]+'</span> <div class="dim-bar-wrap"><div class="dim-bar" style="width:'+dd.pct+'%;background:'+DIM_COLORS[dd.name]+'"></div></div></span>'});
    const suffix=isClient?' <span style="font-size:.75em;background:'+COLORS[i%COLORS.length]+';color:white;padding:2px 8px;border-radius:10px">Your Site</span>':'';
    rows+='<tr'+(isClient?' style="background:#f0f4ff"':'')+'><td><span class="rank-badge '+rankBadge+'">'+(i+1)+'</span></td><td style="font-weight:600"><span style="color:'+clr+'">'+label+'</span>'+suffix+'</td><td><strong>'+d.overall+'/100</strong></td><td>'+dimBars+'</td></tr>';
  });
  
  // Dimension detail table
  let dimDetail='<table style="width:100%;border-collapse:collapse;font-size:.85em;margin-top:16px;background:white;border-radius:8px;overflow:hidden"><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">Dimension</th>';
  allData.forEach((d,i)=>{dimDetail+='<th style="padding:8px;text-align:center;color:'+COLORS[i%COLORS.length]+'">'+labels[i]+'</th>'});
  dimDetail+='<th style="padding:8px;text-align:center">Avg</th></tr>';
  ['SEO','AEO','GEO','Entity','Crawler','Structure','Citation'].forEach(dn=>{
    dimDetail+='<tr><td style="padding:8px;font-weight:600;color:'+DIM_COLORS[dn]+'">'+dn+'</td>';
    let sum=0;
    allData.forEach(d=>{const dd=d.dims.find(dd=>dd.name===dn);const p=dd?dd.pct:0;sum+=p;dimDetail+='<td style="padding:8px;text-align:center">'+p+'%</td>'});
    dimDetail+='<td style="padding:8px;text-align:center;font-weight:600">'+Math.round(sum/allData.length)+'%</td></tr>';
  });
  dimDetail+='</table>';
  
  // Industry insights
  const avgScore=Math.round(allData.reduce((s,d)=>s+d.overall,0)/allData.length);
  const topScore=allData[0].overall,bottomScore=allData[allData.length-1].overall;
  const gap=topScore-bottomScore;
  
  // Dimension explanations + upgrade CTAs (shown when client has a gap there)
  const DIM_EXPLANATIONS={
    SEO:{what:'Search Engine Optimization — the fundamentals that help search engines find and understand your pages.',impact:'Without proper titles, meta descriptions, and HTTPS, search engines cannot reliably read or display your content. This is table stakes — if basic SEO is broken, nothing else you do matters because nobody can find you in the first place.',cta:'Missing basics like a meta description or canonical URL? Our <strong>Starter plan ($99/mo)</strong> includes a plain-English fix checklist that walks you through every missing element.'},
    AEO:{what:'Answer Engine Optimization — structuring your content so voice assistants, featured snippets, and "People Also Ask" boxes can pull direct answers from your site.',impact:'Over 60% of Google searches now show AI-generated answers before organic links. Sites with FAQPage and HowTo schema appear in these prime positions. Without AEO markup, your content is invisible to the answer layer — even if you rank #1 in traditional search.',cta:'Missing FAQPage or Article schema? Our <strong>Pro plan ($243/mo)</strong> includes ready-to-paste schema templates that fix this for you — no developer needed.'},
    GEO:{what:'Generative Engine Optimization — the signals AI models like ChatGPT, Perplexity, and Google AI Overviews use to decide whether to cite your content in their answers.',impact:'AI models use completely different signals than Google. They look for Open Graph tags, JSON-LD structured data, Organization schema, and content depth. Without these, ChatGPT simply doesn\'t know your business exists when a prospect asks "what\'s the best [your product]?" in your industry.',cta:'Missing JSON-LD or Organization schema? Our <strong>Pro plan ($243/mo)</strong> generates AI-ready structured data for your site in minutes.'},
    Entity:{what:'Entity Signals — how AI models verify that your brand is a real, legitimate organization rather than a content farm or spam site.',impact:'AI models build a knowledge graph of trusted brands. sameAs links (your LinkedIn, Wikipedia, social profiles) and Organization schema are the strongest trust signals. Anonymous sites without entity verification get skipped by AI-generated answers almost every time — the AI simply doesn\'t know who you are.',cta:'Missing sameAs links? Our <strong>Starter plan ($99/mo)</strong> shows you exactly which profiles to link and provides the schema code to paste — takes 5 minutes.'},
    Crawler:{what:'Crawler Accessibility — whether search engine bots and AI crawlers can actually access and read your content.',impact:'A noindex tag accidentally left on your site blocks ALL search engines — Google, ChatGPT, everything. A low text-to-code ratio means bots see mostly JavaScript, not your actual content. If crawlers can\'t read your page, your visibility score in every other dimension drops to zero.',cta:'Found a noindex tag or low text ratio? These are quick configuration fixes. Our <strong>Starter plan ($99/mo)</strong> includes a crawler health check that flags every accessibility issue.'},
    Structure:{what:'Content Structure — how well-organized your page is with headings, lists, and semantic HTML that AI models can parse and excerpt.',impact:'AI models extract content by reading heading hierarchy (H1 → H2 → H3) and pulling from structured elements like bulleted lists. Walls of unbroken text are nearly impossible for AI to excerpt cleanly. Well-structured pages get cited 3x more often by AI models than unstructured ones.',cta:'Missing H2 headings or bulleted lists? These are the fastest fixes in the industry. Our <strong>Starter plan ($99/mo)</strong> gives you a heading structure template specific to your page type.'},
    Citation:{what:'Citation Trustworthiness — signals that tell AI models your content is credible, attributable, and part of a legitimate information ecosystem.',impact:'AI models heavily weight authorship signals and external citation patterns. Content that links to authoritative sources and has clear author bylines gets cited. Anonymous, unlinked content gets ignored — regardless of how good your writing is.',cta:'Missing author signals or external links? Our <strong>Pro plan ($243/mo)</strong> identifies the 3-5 highest-impact external sources to cite for your industry.'},
  };
  
  // Build per-dimension insights for the client specifically
  let clientInsights='';
  if(clientData){
    clientInsights='<div style="margin-top:20px;padding:20px;background:white;border-radius:12px;border:2px solid '+COLORS[clientRank%COLORS.length]+'"><h3 style="margin-bottom:4px">📋 Your Site: '+labels[clientRank]+' ('+clientData.overall+'/100)</h3><p style="color:#666;font-size:.9em;margin-bottom:16px">Here\'s what each dimension means for your specific situation — and how to fix it.</p>';
    
    clientData.dims.forEach(d=>{
      const exp=DIM_EXPLANATIONS[d.name];
      const hasGaps=d.fixes.length>0;
      const statusIcon=hasGaps?'⚠️':'✅';
      const statusColor=hasGaps?'#856404':'#155724';
      const statusBg=hasGaps?'#fff3cd':'#d4edda';
      
      clientInsights+='<div style="margin-bottom:16px;padding:14px;background:'+statusBg+';border-radius:8px;border-left:3px solid '+DIM_COLORS[d.name]+'">';
      clientInsights+='<strong style="color:'+DIM_COLORS[d.name]+';font-size:1.05em">'+statusIcon+' '+d.name+' — '+d.pct+'%</strong>';
      clientInsights+='<p style="font-size:.85em;margin:6px 0;color:#555"><strong>What it is:</strong> '+exp.what+'</p>';
      clientInsights+='<p style="font-size:.85em;margin:6px 0;color:#555"><strong>Why it matters:</strong> '+exp.impact+'</p>';
      if(hasGaps){
        clientInsights+='<p style="font-size:.85em;margin:6px 0;color:#c62828"><strong>Your gaps:</strong> '+d.fixes.join('; ')+'</p>';
        clientInsights+='<p style="font-size:.85em;margin:6px 0"><strong>🔧 Fix:</strong> '+exp.cta+'</p>';
      }else{
        clientInsights+='<p style="font-size:.85em;margin:6px 0;color:#155724">Your site passes this dimension. Maintain what you\'re doing.</p>';
      }
      clientInsights+='</div>';
    });
    clientInsights+='</div>';
  }
  
  // Most common fixes across all sites
  const fixCounts={};
  allData.forEach(d=>{d.dims.forEach(dd=>{dd.fixes.forEach(fx=>{const k=dd.name+': '+fx;fixCounts[k]=(fixCounts[k]||0)+1})})});
  const topFixes=Object.entries(fixCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  
  result.innerHTML='<h3 style="text-align:center;margin-bottom:4px">🏭 Industry Survey Results</h3><p style="text-align:center;color:#666;font-size:.9em;margin-bottom:16px">'+allData.length+' websites analyzed · '+new Date().toLocaleDateString()+' · <a href="how-to-read-scores.html" class="explanation-link">Detailed score guide →</a></p>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px">'+
    '<div style="text-align:center;padding:12px;background:white;border-radius:8px"><strong style="font-size:1.4em;color:'+COLORS[0]+'">'+avgScore+'</strong><br><small>Industry Average</small></div>'+
    '<div style="text-align:center;padding:12px;background:white;border-radius:8px"><strong style="font-size:1.4em;color:#155724">'+topScore+'</strong><br><small>Top Score</small></div>'+
    '<div style="text-align:center;padding:12px;background:white;border-radius:8px"><strong style="font-size:1.4em;color:#c62828">'+bottomScore+'</strong><br><small>Lowest Score</small></div>'+
    '<div style="text-align:center;padding:12px;background:white;border-radius:8px"><strong style="font-size:1.4em;color:'+COLORS[3]+'">'+gap+' pts</strong><br><small>Gap</small></div>'+
    '</div>'+
    '<div style="overflow-x:auto"><table class="league-table"><thead><tr><th>#</th><th>Site</th><th>Score</th><th>7-Dimension Breakdown</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    dimDetail+
    clientInsights+
    '<div style="margin-top:16px;padding:16px;background:#f8f9fa;border-radius:8px"><h4 style="margin-bottom:8px">Most Common Gaps Across the Industry</h4><ol style="font-size:.9em">'+topFixes.map(([k,c])=>'<li><strong>'+c+'/'+allData.length+' sites:</strong> '+k+'</li>').join('')+'</ol></div>'+
    '<div class="reminder-box">🔒 <strong>Private view:</strong>Your site is identified as <strong>'+labels[clientRank]+'</strong> above. If you share these results with competitors, they will <em>not</em> see your label — all they receive is the anonymous league table without any "Your Site" indicator. <a href="how-to-read-scores.html">Learn what each score means →</a></div>'+
    '<div style="text-align:center;margin-top:20px"><button id="aiRecBtn" onclick="showUpgradePrompt()" style="background:#6c5ce7;color:white;border:none;padding:14px 32px;border-radius:10px;font-size:1.05em;cursor:pointer;font-weight:600">🤖 Get AI Recommendations</button></div><div id="aiRecResult" style="margin-top:16px;display:none"></div><p style="text-align:center;margin-top:14px;font-size:.85em;color:#666">Ready to fix your gaps? <a href="pricing.html"><strong>Starter plan ($99/mo)</strong></a> gives you a plain-English fix checklist. 30-day free trial. | <a href="pricing.html">See all plans →</a></p>';
  
  // Email capture — store for follow-up
  if(email&&email.includes('@')&&email.includes('.')){
    // Store the lead in our OWN database first, and independently of the n8n webhooks
    // below. Those have answered HTTP 200 while storing nothing, so they must never be
    // the only path a lead can take. This call is deliberately outside the Promise.all
    // so an n8n timeout cannot stop the lead being saved.
    fetch('/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,url:validUrls[0],name:document.getElementById('industry').value.trim()||'',industry:document.getElementById('industry').value.trim()||'',score:clientData?clientData.overall:null,campaign:'organic'}),signal:AbortSignal.timeout(8000)}).then(function(r){return r.json()}).then(function(j){if(!j||!j.ok){console.error('lead NOT stored:',j)}}).catch(function(e){console.error('lead store request failed:',e)});
    try{
      await Promise.all([
  fetch('https://gaseo-n8n.linkfly.site/webhook/kylygaseo-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:validUrls[0],email:email,name:document.getElementById('industry').value.trim()||'Lead',country:'SG',status:'Free Audit Completed',score:clientData?clientData.overall:null}),signal:AbortSignal.timeout(5000)}),
  fetch('https://gaseo-n8n.linkfly.site/webhook/rankgas-welcome-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,name:document.getElementById('industry').value.trim()||'there'}),signal:AbortSignal.timeout(5000)})
]).catch(function(){try{var _r=document.getElementById('auditResult');if(_r&&!_r.querySelector('.reportEmailNotice')){var _n=document.createElement('div');_n.className='reportEmailNotice';_n.style.cssText='margin-top:18px;padding:14px 16px;border-radius:10px;background:#fff8e1;border:1px solid #f0c36d;font-size:.92em;color:#5a4300;line-height:1.5';_n.innerHTML='<strong>One thing to know:</strong> we could not send your report email automatically just now. Your full results are on this page &mdash; please screenshot or print it to keep them. If no email arrives, write to <a href="mailto:support@proofposts.com">support@proofposts.com</a> and we will send your report manually.';_r.appendChild(_n);}}catch(e){}});
    }catch(e){console.log('Sheet logging skipped (not configured)')}
  }
}

/* ── Upgrade prompt ── */
function showUpgradePrompt() {
  document.getElementById('aiRecResult').style.display = 'block';
  document.getElementById('aiRecResult').innerHTML = '<div style="padding:24px;background:white;border-radius:12px;border:2px solid #6c5ce7;text-align:center"><h3 style="color:#6c5ce7;margin-bottom:12px">🤖 AI-Powered Audit Report</h3><p style="font-size:.95em;color:#555;margin-bottom:16px">Upgrade to <strong>Pro ($243/mo)</strong> and Claude will write a personalized action plan: what to fix first, exactly how, and why it matters for your specific industry.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><a href="https://pay.airwallex.com/sghlyikyl36x" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;background:#6c5ce7;color:white;border-radius:10px;font-weight:700;text-decoration:none;font-size:1em">Subscribe Pro $243/mo</a><a href="pricing.html" style="display:inline-block;padding:14px 28px;background:#f0f4ff;color:#6c5ce7;border-radius:10px;font-weight:700;text-decoration:none;font-size:1em">See All Plans</a></div><p style="font-size:.8em;color:#999;margin-top:8px">30-day free trial · Cancel anytime</p></div>';
}
