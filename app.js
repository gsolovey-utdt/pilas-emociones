// CONFIG is shared from the top of analysis.js; do not duplicate it here.
'use strict';
(() => {
  const A = PilasAnalysis;
  const el = id => document.getElementById(id);
  const sessionCode = (new URLSearchParams(location.search).get('s') || '').trim();
  const prefix = `pilas:${sessionCode}:`;
  let db = null, participantId, draft, selected = null, sending = false;
  let viewedGroup = null, renderedSource = null, wasCompact = null;
  let storageOK = true;
  const storage = {
    get(name) { try { return JSON.parse(localStorage.getItem(prefix+name)); } catch (_) { return null; } },
    set(name, value) {
      try { localStorage.setItem(prefix+name,JSON.stringify(value)); return true; }
      catch (_) { storageOK = false; el('storage-note').hidden = false; return false; }
    },
    remove(name) { try { localStorage.removeItem(prefix+name); } catch (_) { /* Saved on server. */ } },
  };
  function client() {
    if (!db && globalThis.supabase) db = supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    if (!db) throw new Error('Sin conexión.');
    return db;
  }
  function showScreen(name) {
    document.querySelectorAll('.student-screen').forEach(s => { s.hidden = s.id !== `screen-${name}`; });
    document.documentElement.classList.toggle('sort-open',name === 'sort');
    document.body.classList.toggle('is-sorting',name === 'sort');
    window.scrollTo(0,0);
  }
  const persist = () => storage.set('draft',draft);
  function markSaved(already = false) {
    storage.set('submitted',true);
    storage.remove('pending'); storage.remove('draft');
    showScreen('sent');
    el('sent-title').textContent = already ? 'Ya enviaste tu respuesta. Mirá el proyector.' : '¡Listo! Mirá el proyector.';
    el('sent-icon').textContent = '✓';
    el('send-note').textContent = '';
    el('btn-retry').hidden = true;
  }
  async function hasSubmitted() {
    const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),5000);
    try {
      const {data,error} = await client().from('pilas_responses').select('id')
        .eq('session_code',sessionCode).eq('participant_id',participantId).limit(1).abortSignal(controller.signal);
      if (error) throw error;
      return data.length > 0;
    } finally { clearTimeout(timeout); }
  }
  function freshDraft() {
    return {order:A.shuffle(CONFIG.words), groups:[{id:1,words:[]},{id:2,words:[]}],
      nextId:3, startedAt:null, criterio:'', screen:'welcome'};
  }
  function validDraft(value) {
    if (!value || !Array.isArray(value.order) || !Array.isArray(value.groups)) return false;
    if (value.order.length !== CONFIG.words.length || new Set(value.order).size !== CONFIG.words.length ||
      !value.order.every(w=>CONFIG.words.includes(w))) return false;
    if (value.groups.length > 6 ||
      value.groups.some(g=>!Number.isInteger(g.id) || !Array.isArray(g.words))) return false;
    const placed = value.groups.flatMap(g=>g.words);
    return new Set(placed).size === placed.length && placed.every(w=>CONFIG.words.includes(w)) &&
      new Set(value.groups.map(g=>g.id)).size === value.groups.length && Number.isInteger(value.nextId) &&
      value.nextId > Math.max(0,...value.groups.map(g=>g.id));
  }
  function wordButton(word) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'word-card'; button.textContent = word;
    button.classList.toggle('selected',selected === word);
    button.setAttribute('aria-pressed',String(selected === word));
    button.addEventListener('click',e => {
      e.stopPropagation(); selected = selected === word ? null : word; renderSort();
      [...document.querySelectorAll('.word-card')].find(b=>b.textContent===word)?.focus({preventScroll:true});
    });
    return button;
  }
  function moveTo(id) {
    if (!selected) return;
    const word = selected;
    draft.groups.forEach(g=> { g.words = g.words.filter(w=>w!==word); });
    if (id !== null) draft.groups.find(g=>g.id===id).words.push(word);
    selected = null; persist(); renderSort();
  }
  function renderSort() {
    const compact = matchMedia('(max-width: 700px)').matches;
    if (wasCompact !== null && compact !== wasCompact && compact && selected) {
      viewedGroup = draft.groups.find(g=>g.words.includes(selected))?.id ?? null;
    }
    wasCompact = compact;
    if (!compact || !draft.groups.some(g=>g.id===viewedGroup)) viewedGroup = null;
    const placed = new Set(draft.groups.flatMap(g=>g.words));
    const pool = draft.order.filter(w=>!placed.has(w));
    const sourceGroup = compact ? draft.groups.find(g=>g.id===viewedGroup) : null;
    const sourceKey = sourceGroup ? `group:${sourceGroup.id}` : 'pool';
    const sourceWords = sourceGroup ? sourceGroup.words : pool;
    const sourceScroll = el('word-pool').scrollTop;
    el('word-pool').replaceChildren(...sourceWords.map(wordButton));
    if (!sourceWords.length) {
      const note = document.createElement('p'); note.className = 'pool-empty';
      note.textContent = sourceGroup ? 'Este grupo está vacío.' : '¡Ya ubicaste todas!';
      el('word-pool').append(note);
    }
    el('word-pool').scrollTop = sourceKey === renderedSource ? sourceScroll : 0;
    renderedSource = sourceKey;
    el('pool-title').textContent = sourceGroup ? `Grupo ${draft.groups.indexOf(sourceGroup)+1}` : 'Emociones por ubicar';
    el('pool-count').textContent = sourceGroup ? `${sourceWords.length} ${sourceWords.length === 1 ? 'emoción' : 'emociones'}` : `${pool.length} / ${CONFIG.words.length}`;
    const columns = compact ? (draft.groups.length === 3 || draft.groups.length >= 5 ? 3 : 2) : (innerWidth >= 1100 && draft.groups.length >= 3 ? 3 : 2);
    el('groups').style.setProperty('--group-columns',columns);
    el('groups').style.setProperty('--group-rows',Math.max(1,Math.ceil(draft.groups.length / columns)));
    const oldScroll = new Map([...el('groups').querySelectorAll('.group-zone')].map(zone=>[zone.dataset.groupId,zone.querySelector('.word-list')?.scrollTop || 0]));
    el('groups').replaceChildren();
    draft.groups.forEach((group,index) => {
      const section = document.createElement('section'); section.className = 'group-zone';
      section.dataset.groupId = String(group.id);
      section.classList.toggle('viewed',compact && viewedGroup === group.id);
      section.style.setProperty('--group-color',A.PALETTE[index]);
      const header = document.createElement('div'); header.className = 'group-header';
      const target = document.createElement('button'); target.className = 'group-target'; target.type = 'button';
      const name = document.createElement('span'); name.className = 'group-name';
      const prefix = document.createElement('span'); prefix.className = 'group-prefix'; prefix.textContent = 'Grupo ';
      name.append(prefix,String(index+1));
      const count = document.createElement('span'); count.className = 'group-count'; count.textContent = String(group.words.length);
      target.append(name,count);
      const chooseGroup = () => {
        if (selected) moveTo(group.id);
        else if (compact) { viewedGroup = group.id; renderSort(); }
      };
      target.addEventListener('click',e=> { e.stopPropagation(); chooseGroup(); });
      target.setAttribute('aria-label', selected ? `Poner ${selected} en el grupo ${index+1}` : compact ? `Ver grupo ${index+1}, ${group.words.length} ${group.words.length === 1 ? 'emoción' : 'emociones'}` : `Grupo ${index+1}`);
      header.append(target);
      if (!group.words.length) {
        const remove = document.createElement('button'); remove.className = 'remove-group'; remove.textContent = '✕';
        remove.type = 'button'; remove.setAttribute('aria-label',`Quitar grupo ${index+1}`);
        remove.addEventListener('click',e=> {
          e.stopPropagation(); draft.groups = draft.groups.filter(g=>g.id!==group.id);
          if (viewedGroup === group.id) viewedGroup = null;
          persist(); renderSort();
        });
        header.append(remove);
      }
      if (compact) {
        const preview = document.createElement('p'); preview.className = 'group-preview';
        preview.textContent = group.words.length ? group.words.join(' · ') : 'Vacío';
        section.append(header,preview);
      } else {
        const list = document.createElement('div'); list.className = 'word-list';
        list.append(...group.words.map(wordButton));
        if (!group.words.length) {
          const hint = document.createElement('span'); hint.className = 'drop-hint'; hint.textContent = 'Tocá acá para ubicarla'; list.append(hint);
        }
        section.append(header,list);
        list.scrollTop = oldScroll.get(String(group.id)) || 0;
      }
      section.addEventListener('click',chooseGroup);
      el('groups').append(section);
    });
    el('remaining').textContent = pool.length ? pool.length === 1 ? 'Te falta 1 emoción' : `Te faltan ${pool.length} emociones` : '¡Ya ubicaste todas!';
    el('selection-status').textContent = selected ? `«${selected}»: tocá un grupo.` : sourceGroup ? `Grupo ${draft.groups.indexOf(sourceGroup)+1}: tocá una emoción.` : compact ? 'Tocá un grupo para ver sus emociones.' : 'Tocá una emoción para seleccionarla.';
    el('btn-to-pool').disabled = selected ? !placed.has(selected) : !sourceGroup;
    el('btn-add').disabled = draft.groups.length >= CONFIG.maxGroups;
    el('btn-done').disabled = pool.length > 0 || draft.groups.filter(g=>g.words.length).length < CONFIG.minGroups;
    el('screen-sort').classList.toggle('has-selection',!!selected);
  }
  async function sendPending() {
    if (sending) return;
    const pending = storage.get('pending');
    if (!A.validatePayload(pending) || pending.session_code !== sessionCode || pending.participant_id !== participantId) return;
    sending = true; showScreen('sent');
    el('sent-title').textContent = 'Enviando…'; el('sent-icon').textContent = '…';
    el('send-note').textContent = ''; el('btn-retry').hidden = true;
    const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),12000);
    try {
      const {error} = await client().from('pilas_responses').insert(pending).abortSignal(controller.signal);
      if (error) {
        // Another tab, or a successful request whose reply was lost: verify the unique row.
        if (error.code !== '23505' || !await hasSubmitted()) throw error;
      }
      markSaved();
    } catch (_) {
      el('sent-title').textContent = 'No se pudo enviar.'; el('sent-icon').textContent = '↻';
      el('send-note').textContent = 'Tu respuesta quedó guardada en este dispositivo. Revisá la conexión y reintentá.';
      el('btn-retry').hidden = false;
    } finally { clearTimeout(timeout); sending = false; }
  }
  el('btn-start').addEventListener('click',()=> {
    draft.startedAt = Date.now(); draft.screen = 'sort'; persist(); renderSort(); showScreen('sort');
  });
  el('btn-add').addEventListener('click',()=> {
    if (draft.groups.length >= CONFIG.maxGroups) return;
    draft.groups.push({id:draft.nextId++,words:[]}); persist(); renderSort();
  });
  el('btn-to-pool').addEventListener('click',()=> {
    if (selected) { viewedGroup = null; moveTo(null); }
    else { viewedGroup = null; renderSort(); }
  });
  let resizeTimer;
  window.addEventListener('resize',()=> {
    if (!draft || el('screen-sort').hidden) return;
    clearTimeout(resizeTimer); resizeTimer = setTimeout(renderSort,100);
  });
  el('btn-done').addEventListener('click',()=> {
    if (el('btn-done').disabled) return;
    draft.screen = 'criterion'; persist(); showScreen('criterion'); el('criterion').focus();
  });
  el('btn-back').addEventListener('click',()=> {
    draft.screen = 'sort'; persist(); renderSort(); showScreen('sort');
  });
  el('criterion').addEventListener('input',()=> {
    draft.criterio = el('criterion').value; persist();
    el('btn-send').disabled = draft.criterio.trim().length < 2;
  });
  el('criterion-form').addEventListener('submit',e=> {
    e.preventDefault(); if (sending) return;
    const groups = draft.groups.map(g=>g.words.slice()).filter(g=>g.length);
    const payload = {session_code:sessionCode, participant_id:participantId, groups, n_groups:groups.length,
      word_order:draft.order.slice(), criterio:el('criterion').value.trim(),
      duration_ms:Math.min(2147483647,Math.max(0,Date.now()-draft.startedAt))};
    if (!A.validatePayload(payload)) return;
    // Persist BEFORE the request so reloads and connection failures never discard a response.
    if (!storage.set('pending',payload)) return;
    sendPending();
  });
  el('btn-retry').addEventListener('click',sendPending);
  window.addEventListener('storage',e=> {
    if (e.key === prefix+'submitted' && storage.get('submitted')) markSaved(true);
  });
  async function init() {
    if (!sessionCode) { showScreen('missing'); return; }
    showScreen('loading');
    participantId = storage.get('participant');
    if (!/^[0-9a-f-]{36}$/i.test(participantId || '')) {
      participantId = crypto.randomUUID(); storage.set('participant',participantId);
    }
    if (storage.get('submitted')) { markSaved(true); return; }
    try { if (await hasSubmitted()) { markSaved(true); return; } } catch (_) { /* Allow an offline draft. */ }
    const pending = storage.get('pending');
    if (pending && A.validatePayload(pending)) { await sendPending(); return; }
    const saved = storage.get('draft'); draft = validDraft(saved) ? saved : freshDraft();
    if (!storageOK) el('btn-start').disabled = true;
    el('criterion').value = draft.criterio || '';
    el('btn-send').disabled = el('criterion').value.trim().length < 2;
    renderSort(); showScreen(['sort','criterion'].includes(draft.screen) ? draft.screen : 'welcome');
  }
  init();
})();
