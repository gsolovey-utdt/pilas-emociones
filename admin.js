'use strict';
(() => {
  const A = PilasAnalysis, el = id => document.getElementById(id);
  const code = (new URLSearchParams(location.search).get('s') || '').trim();
  const NS = 'http://www.w3.org/2000/svg';
  let db, rows = [], liveRows = [], result = null, demo = false, frozen = false, revealed = false;
  let k = CONFIG.defaultK, currentView = 'map', selectedWord = 'nostalgia', criteriaVisible = false;
  let timer = null, request = null, epoch = 0, signature = '', shuffledCriteria = [];
  let transform = [1,0,0,1];
  const orientationKey = `pilas:${code}:orientation`;
  try {
    const saved = JSON.parse(localStorage.getItem(orientationKey));
    if (Array.isArray(saved) && saved.length === 4 && saved.every(v=>[-1,0,1].includes(v)) &&
      saved[0]**2+saved[1]**2===1 && saved[2]**2+saved[3]**2===1 && saved[0]*saved[2]+saved[1]*saved[3]===0) transform = saved;
  } catch (_) { /* Default orientation. */ }
  function svgNode(tag, attrs = {}, content) {
    const node = document.createElementNS(NS,tag);
    Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function chart(id,width,height,label) {
    const svg = svgNode('svg',{viewBox:`0 0 ${width} ${height}`,width:'100%',role:'img','aria-label':label});
    el(id).replaceChildren(svg); return svg;
  }
  const percent = v => `${(100*v).toFixed(1).replace('.',',')}%`;
  const color = family => A.PALETTE[family % A.PALETTE.length];

  function stopPolling() {
    epoch++; clearInterval(timer); timer = null;
    if (request) request.controller.abort();
    request = null;
  }
  function startPolling() {
    if (demo || frozen) return;
    poll(); clearInterval(timer); timer = setInterval(poll,CONFIG.pollMs);
  }
  async function poll() {
    if (demo || frozen || request) return;
    const active = {controller:new AbortController(),epoch}; request = active;
    const timeout = setTimeout(()=>active.controller.abort(),12000);
    try {
      if (!db) {
        if (!globalThis.supabase) throw new Error('Sin conexión.');
        db = supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
      }
      const all = []; let from = 0;
      while (true) {
        const {data,error} = await db.from('pilas_responses')
          .select('id,session_code,participant_id,created_at,groups,n_groups,word_order,criterio,duration_ms')
          .eq('session_code',code).order('created_at',{ascending:true}).order('id',{ascending:true})
          .range(from,from+999).abortSignal(active.controller.signal);
        if (error) throw error;
        all.push(...data); if (data.length < 1000) break; from += 1000;
      }
      if (active.epoch !== epoch || demo || frozen) return;
      const seen = new Set();
      liveRows = all.filter(row=> {
        if (!A.validateResponse(row) || seen.has(row.participant_id)) return false;
        seen.add(row.participant_id); return true;
      });
      el('connection-status').textContent = '';
      applyRows(liveRows);
      el('update-status').textContent = `Actualizado ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · cada 5 segundos`;
    } catch (_) {
      if (active.epoch === epoch && !demo && !frozen) {
        el('connection-status').textContent = 'No se pudieron cargar las respuestas. Revisá la conexión y la tabla de la sesión. Se va a reintentar automáticamente.';
      }
    } finally {
      clearTimeout(timeout); if (request === active) request = null;
    }
  }
  function applyRows(nextRows) {
    rows = nextRows;
    el('top-count').textContent = String(rows.length); el('waiting-count').textContent = String(rows.length);
    el('stability-warning').hidden = rows.length >= CONFIG.minNWarning;
    el('btn-export').disabled = rows.length === 0;
    const nextSignature = JSON.stringify(rows);
    if (nextSignature !== signature) {
      signature = nextSignature;
      shuffledCriteria = A.shuffle(rows.map(row=>typeof row.criterio==='string' ? row.criterio.trim() : '').filter(Boolean));
      if (rows.length >= 3) {
        const P = A.coOccurrence(rows), D = A.distances(P), mds = A.classicalMDS(D,2);
        result = {P,D,mds,coordinates:A.orientCoordinates(mds.coordinates),merges:A.hclustAverage(D)};
      } else result = null;
    }
    render();
  }
  function render() {
    el('demo-banner').hidden = !demo;
    el('btn-demo').setAttribute('aria-pressed',String(demo));
    el('btn-freeze').textContent = frozen ? 'Seguir actualizando' : 'Congelar';
    el('waiting').hidden = revealed; el('results').hidden = !revealed;
    el('btn-reveal').textContent = revealed ? 'Ocultar resultados' : 'Mostrar resultados';
    if (!revealed) return;
    el('too-few').hidden = !!result; el('analysis-views').hidden = !result;
    el('technical').hidden = !result;
    el('family-count').textContent = `${k} familias`;
    if (!result) return;
    result.families = A.cutTree(result.merges,k);
    for (const tab of document.querySelectorAll('[data-view]')) {
      const active = tab.dataset.view === currentView;
      tab.setAttribute('aria-selected',String(active)); tab.tabIndex = active ? 0 : -1;
      el(`view-${tab.dataset.view}`).hidden = !active;
    }
    if (currentView === 'map') renderMap();
    if (currentView === 'tree') renderTree();
    if (currentView === 'profile') renderProfile();
    if (currentView === 'criteria') renderCriteria();
    if (el('technical').open) renderTechnical();
  }

  // Screen-space bounding boxes, deterministic pairwise repulsion, then a free-slot pass.
  // Keep the labels inside the plot, even for identical coordinates or extreme partitions.
  function placeLabels(points,width,height) {
    const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '500 23px "DM Sans", sans-serif';
    const boxes = points.map((p,i)=>({x:p.x,y:p.y-20-(i%3)*3,px:p.x,py:p.y,
      w:Math.ceil(ctx.measureText(CONFIG.words[i]).width)+14,h:29}));
    const clamp = b=> {
      b.x = Math.max(b.w/2+12,Math.min(width-b.w/2-12,b.x));
      b.y = Math.max(24,Math.min(height-48,b.y));
    };
    for (let iteration = 0; iteration < 280; iteration++) {
      let collisions = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], dx = b.x-a.x, dy = b.y-a.y;
        const ox = (a.w+b.w)/2+7-Math.abs(dx), oy = (a.h+b.h)/2+7-Math.abs(dy);
        if (ox > 0 && oy > 0) {
          collisions++;
          if (ox < oy) { const move = (ox/2+0.2)*(dx>=0?1:-1); a.x-=move; b.x+=move; }
          else { const move = (oy/2+0.2)*(dy>=0?1:-1); a.y-=move; b.y+=move; }
        }
      }
      boxes.forEach(clamp); if (!collisions) break;
    }
    // Reserve space for the only two axis labels as well as the word labels.
    const settled = [{x:width/2+45,y:18,w:72,h:25},
      {x:width-55,y:(height-30)/2+22,w:82,h:25}];
    const overlaps = (a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+5 && Math.abs(a.y-b.y)<(a.h+b.h)/2+5;
    for (const box of boxes) {
      if (settled.some(other=>overlaps(box,other))) {
        let best = null, distance = Infinity;
        for (let y = 28; y < height-48; y+=8) for (let x=box.w/2+12; x<width-box.w/2-12; x+=12) {
          const candidate = {...box,x,y};
          const d = (x-box.px)**2+(y-box.py)**2;
          if (d < distance && !settled.some(other=>overlaps(candidate,other))) { best = candidate; distance = d; }
        }
        if (best) { box.x=best.x; box.y=best.y; }
      }
      settled.push(box);
    }
    return boxes;
  }
  function renderMap() {
    const width = Math.max(500,Math.round(el('map-chart').getBoundingClientRect().width));
    const top = el('map-chart').getBoundingClientRect().top+window.scrollY;
    const height = Math.max(340,Math.min(650,window.innerHeight-top-22));
    const svg = chart('map-chart',width,height,'Mapa de las emociones de la clase');
    const coords = result.coordinates.map(([x,y])=>[transform[0]*x+transform[1]*y, transform[2]*x+transform[3]*y]);
    const extentX = Math.max(0.05,...coords.map(p=>Math.abs(p[0]))), extentY = Math.max(0.05,...coords.map(p=>Math.abs(p[1])));
    const scale = Math.min((width-210)/(2*extentX),(height-135)/(2*extentY));
    const cx = width/2, cy = (height-30)/2;
    svg.append(svgNode('line',{x1:35,y1:cy,x2:width-25,y2:cy,class:'map-axis'}),
      svgNode('line',{x1:cx,y1:30,x2:cx,y2:height-40,class:'map-axis'}),
      svgNode('text',{x:width-18,y:cy+28,'text-anchor':'end',class:'axis-label'},'Eje 1'),
      svgNode('text',{x:cx+14,y:24,class:'axis-label'},'Eje 2'));
    const points = coords.map(([x,y])=>({x:cx+x*scale,y:cy-y*scale}));
    const labels = placeLabels(points,width,height);
    labels.forEach((b,i)=> {
      const p = points[i];
      if (Math.hypot(b.x-p.x,b.y-p.y)>15) svg.append(svgNode('line',{
        x1:p.x,y1:p.y,x2:b.x,y2:b.y,stroke:color(result.families[i]),'stroke-opacity':0.55,'stroke-width':1}));
    });
    points.forEach((p,i)=>svg.append(svgNode('circle',{cx:p.x,cy:p.y,r:4.5,fill:color(result.families[i])})));
    labels.forEach((b,i)=>svg.append(svgNode('text',{x:b.x,y:b.y,'text-anchor':'middle','dominant-baseline':'central',
      class:'emotion-label',fill:color(result.families[i]),'data-word':CONFIG.words[i]},CONFIG.words[i])));
    el('axis-shares').replaceChildren();
    result.mds.shares.forEach((share,i)=> {
      const row = document.createElement('div'); row.className = 'share-row';
      const label = document.createElement('span'); label.textContent = `Eje ${i+1}`;
      const track = document.createElement('div'); track.className = 'share-track';
      const bar = document.createElement('div'); bar.style.width = `${share*100}%`; track.append(bar);
      const value = document.createElement('span'); value.textContent = percent(share);
      row.append(label,track,value); el('axis-shares').append(row);
    });
    el('map-families').replaceChildren();
    for (let family = 0; family < k; family++) {
      const tag = document.createElement('span'); tag.className = 'family-tag';
      const dot = document.createElement('i'); dot.style.backgroundColor = color(family); tag.append(dot,`Familia ${family+1}`);
      el('map-families').append(tag);
    }
  }
  function renderTree() {
    const width = Math.max(650,Math.round(el('tree-chart').getBoundingClientRect().width));
    const top = el('tree-chart').getBoundingClientRect().top+window.scrollY;
    const height = Math.max(430,Math.min(650,window.innerHeight-top-22)), n = CONFIG.words.length, plotRight = width-220;
    const svg = chart('tree-chart',width,height,'Árbol de familias de emociones');
    const order = A.treeLeaves(result.merges), nodes = new Map();
    const maxHeight = Math.max(0.01,...result.merges.map(m=>m.height));
    const xAt = heightValue=>plotRight-(plotRight-38)*heightValue/maxHeight;
    const lower = result.merges[n-k-1]?.height || 0, upper = result.merges[n-k]?.height ?? maxHeight;
    const cutX = xAt((lower+upper)/2);
    order.forEach((leaf,i)=>nodes.set(leaf,{x:plotRight,y:30+i*(height-68)/(n-1),family:result.families[leaf]}));
    for (const merge of result.merges) {
      const left = nodes.get(merge.left), right = nodes.get(merge.right);
      const x = xAt(merge.height), y = (left.y+right.y)/2;
      const family = left.family === right.family ? left.family : -1;
      const branchColor = family === -1 ? '#7c829a' : color(family);
      svg.append(svgNode('path',{d:`M ${left.x} ${left.y} H ${x} V ${right.y} H ${right.x}`,
        fill:'none',stroke:branchColor,'stroke-width':2.5,'stroke-linejoin':'round'}));
      // A singleton family still gets a colored terminal branch below the cut.
      if (family === -1) for (const child of [left,right]) {
        if (child.family >= 0 && child.x > cutX) svg.append(svgNode('line',{
          x1:Math.max(x,cutX),y1:child.y,x2:child.x,y2:child.y,stroke:color(child.family),'stroke-width':2.5}));
      }
      nodes.set(merge.id,{x,y,family});
    }
    order.forEach(leaf=> {
      const node = nodes.get(leaf), family = node.family;
      svg.append(svgNode('circle',{cx:plotRight+12,cy:node.y,r:5,fill:color(family)}),
        svgNode('text',{x:plotRight+25,y:node.y+7,class:'tree-label',fill:color(family)},CONFIG.words[leaf]),
        svgNode('text',{x:width-12,y:node.y+6,'text-anchor':'end',class:'tree-family',fill:color(family)},String(family+1)));
    });
    svg.append(svgNode('line',{x1:cutX,y1:8,x2:cutX,y2:height-24,stroke:'#e8c547','stroke-width':2,'stroke-dasharray':'6 6'}),
      svgNode('text',{x:Math.max(60,Math.min(width-100,cutX)),y:height-5,'text-anchor':'middle',class:'cut-label'},`${k} familias`));
    el('tie-note').hidden = Math.abs(lower-upper)>1e-10;
  }
  function renderProfile() {
    el('profile-title').replaceChildren(document.createTextNode('¿Con qué agrupó la clase a '));
    const word = document.createElement('em'); word.textContent = selectedWord;
    el('profile-title').append(word,'?');
    el('profile-word').value = selectedWord;
    document.querySelectorAll('[data-word]').forEach(button=> {
      if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed',String(button.dataset.word===selectedWord));
    });
    const width = Math.max(650,Math.round(el('profile-chart').getBoundingClientRect().width));
    const height = Math.max(400,Math.min(570,window.innerHeight-320)), rowHeight = (height-42)/16;
    const svg = chart('profile-chart',width,height,`Porcentaje de la clase que agrupó cada palabra con ${selectedWord}`);
    const left = 190, right = width-80, top = 27;
    for (const pct of [0,25,50,75,100]) {
      const x = left+(right-left)*pct/100;
      svg.append(svgNode('line',{x1:x,y1:20,x2:x,y2:height-24,stroke:'#2a2d3e'}),
        svgNode('text',{x,y:15,'text-anchor':'middle',class:'profile-tick'},`${pct}%`));
    }
    A.profile(result.P,selectedWord).forEach((entry,i)=> {
      const y = top+i*rowHeight;
      svg.append(svgNode('text',{x:left-18,y:y+19,'text-anchor':'end',class:'profile-label'},entry.word),
        svgNode('rect',{x:left,y,width:Math.max(0,(right-left)*entry.value),height:Math.min(23,rowHeight-4),rx:4,fill:color(result.families[entry.index])}),
        svgNode('text',{x:Math.min(right+12,left+(right-left)*entry.value+10),y:y+19,class:'profile-value'},`${Math.round(100*entry.value)}%`));
    });
  }
  function renderCriteria() {
    el('btn-criteria').textContent = criteriaVisible ? 'Ocultar' : 'Mostrar';
    el('btn-criteria').setAttribute('aria-expanded',String(criteriaVisible)); el('criteria-list').hidden = !criteriaVisible;
    el('criteria-list').replaceChildren(...shuffledCriteria.map(text=> {
      const line = document.createElement('p'); line.textContent = text; return line;
    }));
  }
  function renderTechnical() {
    if (!result) return;
    el('technical-n').textContent = `n = ${rows.length}`;
    el('negative-mass').textContent = `Masa de autovalores negativos: ${percent(result.mds.negativeMassShare)}`;
    el('eigenvalues').textContent = `Autovalores: ${result.mds.eigenvalues.map(v=>v.toFixed(6)).join(' · ')}`;
    const table = document.createElement('table'); table.className = 'heatmap-table';
    const caption = document.createElement('caption'); caption.textContent = 'Proporción de respuestas que puso cada par en el mismo grupo'; table.append(caption);
    const header = document.createElement('tr'); header.append(document.createElement('th'));
    CONFIG.words.forEach(word=> { const th = document.createElement('th'); th.scope='col'; th.textContent=word; header.append(th); });
    const head = document.createElement('thead'); head.append(header); table.append(head);
    const body = document.createElement('tbody');
    result.P.forEach((row,i)=> {
      const tr = document.createElement('tr'), th = document.createElement('th'); th.scope='row'; th.textContent = CONFIG.words[i]; tr.append(th);
      row.forEach(value=> {
        const td = document.createElement('td'); td.textContent=value.toFixed(2); td.style.backgroundColor=`rgba(91,141,238,${0.08+0.78*value})`; tr.append(td);
      }); body.append(tr);
    }); table.append(body); el('heatmap').replaceChildren(table);
  }
  function changeOrientation(operation) {
    const [a,b,c,d] = transform;
    if (operation === 'x') transform = [-a,-b,c,d];
    if (operation === 'y') transform = [a,b,-c,-d];
    if (operation === 'rotate') transform = [-c,-d,a,b];
    try { localStorage.setItem(orientationKey,JSON.stringify(transform)); } catch (_) { /* Current tab still works. */ }
    render();
  }
  function exportCSV() {
    if (!rows.length) return;
    // Quote every field; neutralize spreadsheet formula prefixes in free text.
    const cell = value => {
      let text = String(value ?? '');
      if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const csv = data=>'\uFEFF'+data.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
    const responseData = [['participant_id','created_at','n_groups','criterio','duration_ms',...CONFIG.words],
      ...rows.map(row=>[row.participant_id,row.created_at,row.groups.length,row.criterio,row.duration_ms,
        ...CONFIG.words.map(word=>row.groups.findIndex(g=>g.includes(word))+1)])];
    const P = A.coOccurrence(rows), matrixData = [['',...CONFIG.words],...P.map((row,i)=>[CONFIG.words[i],...row])];
    const safeCode = code.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,100);
    const demoSuffix = demo ? '_demo' : '';
    // Keep two explicit links as a fallback for browsers blocking multiple downloads.
    let links = el('export-links');
    if (!links) { links = document.createElement('div'); links.id='export-links'; links.className='export-links'; el('connection-status').after(links); }
    links.querySelectorAll('a').forEach(link=>URL.revokeObjectURL(link.href)); links.replaceChildren();
    for (const [kind,data,label] of [['respuestas',responseData,'Descargar respuestas'],['matriz',matrixData,'Descargar matriz']]) {
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv(data)],{type:'text/csv;charset=utf-8;'}));
      link.download = `pilas_${safeCode}${demoSuffix}_${kind}.csv`; link.textContent = label; links.append(link); link.click();
    }
  }
  el('session-form').addEventListener('submit',e=> {
    e.preventDefault(); const value = el('session-input').value.trim();
    if (value) { const url = new URL('admin.html',location.href); url.searchParams.set('s',value); location.href=url.href; }
  });
  if (!code) { el('session-entry').hidden=false; return; }
  el('dashboard').hidden=false; el('session-code').textContent=code;
  const topbar = document.querySelector('.projector-top');
  const sizeTopbar = ()=>document.documentElement.style.setProperty('--topbar-height',`${topbar.offsetHeight}px`);
  sizeTopbar(); new ResizeObserver(sizeTopbar).observe(topbar);
  const studentURL = new URL('index.html',location.href); studentURL.searchParams.set('s',code);
  el('student-link').href=studentURL.href; el('student-link').textContent=studentURL.href;
  if (globalThis.QRCode) new QRCode(el('qrcode'),{text:studentURL.href,width:260,height:260,
    colorDark:'#0d0e12',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  else el('qrcode').textContent = 'Abrí el link para participar.';
  CONFIG.words.forEach(word=> {
    const option = document.createElement('option'); option.value=word; option.textContent=word; el('profile-word').append(option);
  });
  el('profile-word').value=selectedWord;
  el('family-k').value=String(k);
  el('family-k').addEventListener('input',()=> { k=Number(el('family-k').value); render(); });
  el('btn-freeze').addEventListener('click',()=> {
    frozen=!frozen; stopPolling();
    el('update-status').textContent=frozen ? 'Respuestas congeladas' : 'Actualizando cada 5 segundos';
    if (!frozen) startPolling(); render();
  });
  el('btn-reveal').addEventListener('click',()=> { revealed=!revealed; render(); });
  el('btn-demo').addEventListener('click',()=> {
    demo=!demo; stopPolling(); el('connection-status').textContent='';
    el('export-links')?.remove();
    applyRows(demo ? A.simulateResponses(40) : liveRows);
    el('update-status').textContent=demo ? 'Simulación local · 40 respuestas' : frozen ? 'Respuestas congeladas' : 'Actualizando cada 5 segundos';
    if (!demo) startPolling();
  });
  el('btn-export').addEventListener('click',exportCSV);
  document.querySelectorAll('[data-view]').forEach(tab=> {
    tab.addEventListener('click',()=> { currentView=tab.dataset.view; render(); });
    tab.addEventListener('keydown',e=> {
      const tabs=[...document.querySelectorAll('[data-view]')], index=tabs.indexOf(tab);
      let target;
      if (e.key==='ArrowRight') target=tabs[(index+1)%tabs.length];
      if (e.key==='ArrowLeft') target=tabs[(index+tabs.length-1)%tabs.length];
      if (e.key==='Home') target=tabs[0]; if (e.key==='End') target=tabs[tabs.length-1];
      if (target) { e.preventDefault(); target.click(); target.focus(); }
    });
  });
  el('mirror-x').addEventListener('click',()=>changeOrientation('x'));
  el('mirror-y').addEventListener('click',()=>changeOrientation('y'));
  el('rotate').addEventListener('click',()=>changeOrientation('rotate'));
  document.querySelectorAll('button[data-word]').forEach(button=>button.addEventListener('click',()=> {
    selectedWord=button.dataset.word; renderProfile();
  }));
  el('profile-word').addEventListener('change',()=> { selectedWord=el('profile-word').value; renderProfile(); });
  el('btn-criteria').addEventListener('click',()=> { criteriaVisible=!criteriaVisible; renderCriteria(); });
  el('technical').addEventListener('toggle',()=> { if (el('technical').open) renderTechnical(); });
  let resizeTimer;
  window.addEventListener('resize',()=> { clearTimeout(resizeTimer); resizeTimer=setTimeout(render,150); });
  document.fonts?.ready.then(()=>render());
  window.addEventListener('pagehide',stopPolling);
  window.addEventListener('pageshow',e=> { if (e.persisted) startPolling(); });
  applyRows([]); startPolling();
})();
