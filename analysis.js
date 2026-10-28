// Shared configuration: loaded before app.js / admin.js. No DOM or external libraries.
'use strict';
const CONFIG = Object.freeze({
  words: Object.freeze(['alegría','entusiasmo','orgullo','calma','alivio','cariño','miedo','ansiedad',
    'enojo','asco','tristeza','aburrimiento','culpa','vergüenza','celos','sorpresa','nostalgia']),
  minGroups: 2, maxGroups: 6, minNWarning: 25, pollMs: 5000, defaultK: 5,
  orientationAnchor: 'alegría',
});

const PilasAnalysis = (() => {
  // Okabe–Ito (lighter orange/green on dark), then high-contrast extensions.
  // Family numbers accompany colors in the legend and tree.
  const PALETTE = Object.freeze(['#E69F00','#56B4E9','#39C6A1','#F0E442',
    '#CC79A7','#F08A64','#9AAEFF','#F5F5F5','#C3A6ED','#A6D96A','#F5A9CF','#A8C6C9']);
  const DEMO_LATENT = Object.freeze({
    'alegría':[0.9,0.5,0], 'entusiasmo':[0.8,0.8,0], 'orgullo':[0.7,0.4,1],
    'calma':[0.6,-0.7,0], 'alivio':[0.6,-0.4,0], 'cariño':[0.8,-0.1,1],
    'miedo':[-0.8,0.7,0], 'ansiedad':[-0.7,0.6,0], 'enojo':[-0.8,0.8,0],
    'asco':[-0.7,0.3,0], 'tristeza':[-0.8,-0.6,0], 'aburrimiento':[-0.4,-0.8,0],
    'culpa':[-0.6,0.1,1], 'vergüenza':[-0.6,0.4,1], 'celos':[-0.6,0.5,1],
    'sorpresa':[0,0.8,0], 'nostalgia':[0,-0.4,0],
  });
  const matrix = (n, value = 0) => Array.from({length:n}, () => Array(n).fill(value));
  const shuffle = (items, random = Math.random) => {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  function validateResponse(response, words = CONFIG.words) {
    if (!response || !Array.isArray(response.groups)) return false;
    const groups = response.groups;
    if (groups.length < CONFIG.minGroups || groups.length > CONFIG.maxGroups) return false;
    if (response.n_groups !== undefined && response.n_groups !== groups.length) return false;
    if (groups.some(group => !Array.isArray(group) || group.length === 0)) return false;
    const flat = groups.flat();
    return flat.length === words.length && new Set(flat).size === words.length &&
      flat.every(word => words.includes(word));
  }

  function validatePayload(response) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return validateResponse(response) && typeof response.session_code === 'string' &&
      response.session_code.trim().length > 0 && uuid.test(response.participant_id) &&
      Array.isArray(response.word_order) && response.word_order.length === CONFIG.words.length &&
      new Set(response.word_order).size === CONFIG.words.length &&
      response.word_order.every(word => CONFIG.words.includes(word)) &&
      typeof response.criterio === 'string' && response.criterio.trim().length >= 2 &&
      response.criterio.trim().length <= 120 && !/[\r\n]/.test(response.criterio) &&
      Number.isInteger(response.duration_ms) && response.duration_ms >= 0 && response.duration_ms <= 2147483647;
  }

  function coOccurrence(responses, words = CONFIG.words) {
    const valid = responses.filter(response => validateResponse(response, words));
    const P = matrix(words.length);
    const index = new Map(words.map((word, i) => [word, i]));
    for (const {groups} of valid) for (const group of groups) {
      for (const a of group) for (const b of group) P[index.get(a)][index.get(b)]++;
    }
    return P.map((row, i) => row.map((count, j) => i === j ? 1 : valid.length ? count / valid.length : 0));
  }
  const distances = P => P.map((row, i) => row.map((value, j) => i === j ? 0 : 1 - value));

  function jacobiEigen(A, tolerance = 1e-12, maxIterations = 100 * A.length * A.length) {
    const n = A.length;
    if (!n || A.some(row => row.length !== n || row.some(x => !Number.isFinite(x)))) {
      throw new Error('Matriz inválida.');
    }
    const a = A.map(row => row.slice());
    const vectors = matrix(n);
    for (let i = 0; i < n; i++) {
      vectors[i][i] = 1;
      for (let j = 0; j < n; j++) if (Math.abs(a[i][j] - a[j][i]) > 1e-10) {
        throw new Error('La matriz debe ser simétrica.');
      }
    }
    const scale = Math.max(1, ...a.flat().map(Math.abs));
    let converged = n === 1;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let p = 0, q = 0, largest = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[i][j]) > largest) { largest = Math.abs(a[i][j]); p = i; q = j; }
      }
      if (largest < tolerance * scale) { converged = true; break; }
      const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(theta), s = Math.sin(theta);
      const app = a[p][p], aqq = a[q][q], apq = a[p][q];
      a[p][p] = c*c*app - 2*s*c*apq + s*s*aqq;
      a[q][q] = s*s*app + 2*s*c*apq + c*c*aqq;
      a[p][q] = a[q][p] = 0;
      for (let i = 0; i < n; i++) {
        if (i !== p && i !== q) {
          const aip = a[i][p], aiq = a[i][q];
          a[i][p] = a[p][i] = c*aip - s*aiq;
          a[i][q] = a[q][i] = s*aip + c*aiq;
        }
        const vip = vectors[i][p], viq = vectors[i][q];
        vectors[i][p] = c*vip - s*viq;
        vectors[i][q] = s*vip + c*viq;
      }
    }
    if (!converged) throw new Error('El cálculo no convergió.');
    const order = Array.from({length:n}, (_, i) => i).sort((i,j) => a[j][j] - a[i][i] || i-j);
    return {values: order.map(i => a[i][i]), vectors: vectors.map(row => order.map(i => row[i]))};
  }

  function classicalMDS(D, dims = 2) {
    const n = D.length;
    const squares = D.map(row => row.map(x => x*x));
    const means = squares.map(row => row.reduce((a,b) => a+b, 0) / n);
    const grand = means.reduce((a,b) => a+b, 0) / n;
    const B = squares.map((row,i) => row.map((v,j) => -0.5*(v-means[i]-means[j]+grand)));
    const eig = jacobiEigen(B);
    const epsilon = Math.max(1, ...eig.values.map(Math.abs)) * 1e-10;
    const eigenvalues = eig.values.map(v => Math.abs(v) < epsilon ? 0 : v);
    const positiveMass = eigenvalues.reduce((s,v) => s + Math.max(0,v), 0);
    const negativeMass = eigenvalues.reduce((s,v) => s + Math.max(0,-v), 0);
    return {
      coordinates: eig.vectors.map(row => Array.from({length:dims}, (_,k) =>
        (row[k] || 0) * Math.sqrt(Math.max(eigenvalues[k] || 0, 0)))),
      eigenvalues,
      shares: Array.from({length:5}, (_,k) => positiveMass ? Math.max(0,eigenvalues[k] || 0)/positiveMass : 0),
      negativeMassShare: positiveMass + negativeMass ? negativeMass/(positiveMass+negativeMass) : 0,
    };
  }

  function orientCoordinates(coordinates, words = CONFIG.words, anchor = CONFIG.orientationAnchor) {
    const index = words.indexOf(anchor);
    // When an anchor is numerically zero, use the first nonzero word deterministically.
    const signs = (coordinates[0] || []).map((_, k) => {
      let value = coordinates[index]?.[k] || 0;
      if (Math.abs(value) < 1e-10) value = coordinates.find(row => Math.abs(row[k]) > 1e-10)?.[k] || 0;
      return value < 0 ? -1 : 1;
    });
    return coordinates.map(row => row.map((v,k) => v*signs[k]));
  }

  function hclustAverage(D) {
    const n = D.length;
    let clusters = Array.from({length:n}, (_, i) => ({id:i, leaves:[i]}));
    const merges = [];
    while (clusters.length > 1) {
      let best = Infinity, ai = 0, bi = 1;
      for (let a = 0; a < clusters.length; a++) for (let b = a+1; b < clusters.length; b++) {
        let sum = 0;
        for (const i of clusters[a].leaves) for (const j of clusters[b].leaves) sum += D[i][j];
        const height = sum/(clusters[a].leaves.length*clusters[b].leaves.length);
        if (height < best - 1e-12) { best = height; ai = a; bi = b; }
      }
      let left = clusters[ai], right = clusters[bi];
      if (Math.min(...left.leaves) > Math.min(...right.leaves)) [left,right] = [right,left];
      const leaves = [...left.leaves,...right.leaves];
      const id = n + merges.length;
      merges.push({id, left:left.id, right:right.id, height:best, size:leaves.length});
      clusters = clusters.filter((_,i) => i !== ai && i !== bi);
      clusters.push({id,leaves});
      clusters.sort((a,b) => Math.min(...a.leaves)-Math.min(...b.leaves));
    }
    return merges;
  }

  function treeLeaves(merges) {
    const n = merges.length+1;
    const visit = id => id < n ? [id] : [...visit(merges[id-n].left), ...visit(merges[id-n].right)];
    return visit(2*n-2);
  }
  function cutTree(merges, k) {
    const n = merges.length+1;
    k = Math.max(1, Math.min(n, Math.round(k)));
    const nodes = new Map(Array.from({length:n}, (_,i) => [i,[i]]));
    for (const merge of merges.slice(0,n-k)) {
      nodes.set(merge.id, [...nodes.get(merge.left), ...nodes.get(merge.right)]);
      nodes.delete(merge.left); nodes.delete(merge.right);
    }
    const order = treeLeaves(merges);
    const rank = new Map(order.map((leaf,i) => [leaf,i]));
    const families = [...nodes.values()].sort((a,b) => Math.min(...a.map(x=>rank.get(x)))-Math.min(...b.map(x=>rank.get(x))));
    const labels = Array(n);
    families.forEach((leaves,i) => leaves.forEach(leaf => { labels[leaf] = i; }));
    return labels;
  }
  function profile(P, word, words = CONFIG.words) {
    const index = typeof word === 'number' ? word : words.indexOf(word);
    if (!P[index]) return [];
    return P[index].map((value,i) => ({word:words[i], value, index:i})).filter(x => x.index !== index)
      .sort((a,b) => b.value-a.value || a.index-b.index);
  }

  function kmeans(points, k, random = Math.random) {
    const sq = (a,b) => a.reduce((s,v,i) => s+(v-b[i])**2,0);
    const centers = [points[Math.floor(random()*points.length)].slice()];
    while (centers.length < k) {
      const next = points.map((point,i) => ({i,d:Math.min(...centers.map(c=>sq(point,c)))}))
        .sort((a,b) => b.d-a.d || a.i-b.i)[0].i;
      centers.push(points[next].slice());
    }
    let labels = Array(points.length).fill(-1);
    for (let iteration = 0; iteration < 80; iteration++) {
      const next = points.map(p => centers.map((c,i) => ({i,d:sq(p,c)})).sort((a,b)=>a.d-b.d||a.i-b.i)[0].i);
      if (next.every((v,i)=>v===labels[i])) break;
      labels = next;
      for (let j = 0; j < k; j++) {
        const members = points.filter((_,i)=>labels[i]===j);
        if (members.length) centers[j] = points[0].map((_,d)=>members.reduce((s,p)=>s+p[d],0)/members.length);
      }
    }
    return labels;
  }
  function simulateResponses(count = 40, random = Math.random) {
    const gaussian = () => Math.sqrt(-2*Math.log(Math.max(Number.EPSILON,random()))) * Math.cos(2*Math.PI*random());
    const criteria = ['Por cómo se sienten en el cuerpo','Por situaciones que me las hacen sentir',
      'Por cuánto se parecen entre sí','Por las ganas de acercarme o alejarme','Por lo que me pasa con otras personas'];
    return Array.from({length:count}, (_,participant) => {
      const points = CONFIG.words.map(word => DEMO_LATENT[word].map((v,i) => {
        if (i === 0 && (word === 'nostalgia' || word === 'sorpresa')) v = random()<0.5 ? -0.5 : 0.5;
        return (v+0.25*gaussian()) * (i === 2 ? 0.6 : 1);
      }));
      const k = 3+Math.floor(random()*4);
      const labels = kmeans(points,k,random);
      const groups = Array.from({length:k}, (_,i)=>CONFIG.words.filter((_,j)=>labels[j]===i)).filter(g=>g.length);
      return {participant_id:`demo-${participant+1}`, created_at:'', groups, n_groups:groups.length,
        word_order:shuffle(CONFIG.words,random), criterio:criteria[participant%criteria.length], duration_ms:90000+participant*1321};
    });
  }
  return Object.freeze({CONFIG, PALETTE, DEMO_LATENT, shuffle, validateResponse, validatePayload,
    coOccurrence, distances, jacobiEigen, classicalMDS, orientCoordinates,
    hclustAverage, treeLeaves, cutTree, profile, kmeans, simulateResponses});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PilasAnalysis;
