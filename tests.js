// Same assertions in test.html and Node: node -e "...runAnalysisTests(require('./analysis.js'))".
'use strict';
function runAnalysisTests(A) {
  const results = [];
  const assert = (condition,message='Resultado inesperado') => { if (!condition) throw new Error(message); };
  const close = (a,b,tolerance=1e-8) => assert(Math.abs(a-b)<tolerance,`${a} ≠ ${b}`);
  const test = (name,fn) => { try { fn(); results.push({name,pass:true}); } catch(e) { results.push({name,pass:false,error:e.message}); } };
  const words = ['alegría','entusiasmo','calma','miedo','tristeza'];
  const toy = [
    [['alegría','entusiasmo'],['calma'],['miedo','tristeza']],
    [['alegría','entusiasmo','calma'],['miedo','tristeza']],
    [['alegría','calma'],['entusiasmo','miedo'],['tristeza']],
    [['alegría','entusiasmo'],['calma','tristeza'],['miedo']],
  ].map(groups=>({groups,n_groups:groups.length}));
  const P = A.coOccurrence(toy,words);
  test('Ejemplo de cuatro participantes y cinco palabras',()=> {
    close(P[0][1],0.75); close(P[0][2],0.5); close(P[3][4],0.5); close(P[1][3],0.25); close(P[0][3],0);
    for (let i=0;i<5;i++) { close(P[i][i],1); for(let j=0;j<5;j++) close(P[i][j],P[j][i]); }
  });
  test('Autovalores y vectores de una matriz simétrica conocida',()=> {
    // Eigenpairs of [[2,1,0],[1,2,0],[0,0,5]]: 5→(0,0,1), 3→(1,1,0)/√2, 1→(1,-1,0)/√2.
    const matrix = [[2,1,0],[1,2,0],[0,0,5]];
    const {values,vectors} = A.jacobiEigen(matrix);
    const reference = [[0,0,1],[Math.SQRT1_2,Math.SQRT1_2,0],[Math.SQRT1_2,-Math.SQRT1_2,0]];
    [5,3,1].forEach((v,k)=> {
      close(values[k],v);
      const column = vectors.map(row=>row[k]);
      close(Math.abs(column.reduce((s,x,i)=>s+x*reference[k][i],0)),1);
      for (let i=0;i<3;i++) close(matrix[i].reduce((s,x,j)=>s+x*column[j],0),values[k]*column[i]);
    });
  });
  test('Recuperación de distancias de puntos conocidos en dos ejes',()=> {
    const points = [[0,0],[1,0],[0,2],[2,3],[-1,1],[3,-2],[0.4,-0.2]];
    const D = points.map(a=>points.map(b=>Math.hypot(a[0]-b[0],a[1]-b[1])));
    const output = A.classicalMDS(D,2), original=[], recovered=[];
    points.forEach((_,i)=>points.forEach((_,j)=> { if(j>i) {
      original.push(D[i][j]); recovered.push(Math.hypot(...output.coordinates[i].map((x,k)=>x-output.coordinates[j][k])));
    } }));
    const average = a=>a.reduce((s,x)=>s+x,0)/a.length;
    const mx=average(original), my=average(recovered);
    const corr = original.reduce((s,x,i)=>s+(x-mx)*(recovered[i]-my),0)/Math.sqrt(
      original.reduce((s,x)=>s+(x-mx)**2,0)*recovered.reduce((s,x)=>s+(x-my)**2,0));
    assert(corr>0.999); assert(output.shares[0]+output.shares[1]>=0.99);
    original.forEach((d,i)=>close(d,recovered[i])); close(output.negativeMassShare,0);
  });
  test('Tres bloques recuperados exactamente al elegir tres familias',()=> {
    const D = Array.from({length:9},(_,i)=>Array.from({length:9},(_,j)=>i===j?0:Math.floor(i/3)===Math.floor(j/3)?0.1:0.9));
    const merges=A.hclustAverage(D), labels=A.cutTree(merges,3);
    for(let i=0;i<9;i++) for(let j=0;j<9;j++) assert((labels[i]===labels[j])===(Math.floor(i/3)===Math.floor(j/3)));
    assert(merges.every((m,i)=>i===0||m.height>=merges[i-1].height-1e-12));
  });
  test('Rechazo de palabra faltante, duplicada y más de seis grupos',()=> {
    const valid={groups:[A.CONFIG.words.slice(0,8),A.CONFIG.words.slice(8)],n_groups:2};
    assert(A.validateResponse(valid));
    assert(!A.validateResponse({groups:[A.CONFIG.words.slice(0,8),A.CONFIG.words.slice(9)]}));
    assert(!A.validateResponse({groups:[A.CONFIG.words.slice(0,8),[...A.CONFIG.words.slice(8),'alegría']]}));
    assert(!A.validateResponse({groups:[...A.CONFIG.words.slice(0,6).map(w=>[w]),A.CONFIG.words.slice(6)]}));
    assert(!A.validateResponse({groups:[[],A.CONFIG.words]}));
    assert(!A.validateResponse({...valid,n_groups:3}));
  });
  test('Promedio entre todas las palabras de cada familia',()=> {
    // After merging 0 and 1, linkage to 2 must be (0.4+0.8)/2 = 0.6.
    const merges=A.hclustAverage([[0,0.1,0.4],[0.1,0,0.8],[0.4,0.8,0]]);
    close(merges[1].height,0.6);
  });
  test('Perfiles ordenados, sin la propia palabra',()=> {
    const profile=A.profile(P,'alegría',words);
    assert(profile.length===4 && profile[0].word==='entusiasmo'); close(profile[0].value,0.75);
    assert(profile.every((p,i)=>p.word!=='alegría'&&(i===0||profile[i-1].value>=p.value)));
  });
  test('Masa negativa y proporciones de ejes informadas por separado',()=> {
    const output=A.classicalMDS([[0,1,1],[1,0,3],[1,3,0]],2);
    assert(output.negativeMassShare>0 && output.negativeMassShare<1);
    close(output.shares.reduce((a,b)=>a+b,0),1);
    assert(output.coordinates.flat().every(Number.isFinite));
  });
  test('Casos de distancias nulas, empates y cortes de 2 a 12',()=> {
    const D=A.CONFIG.words.map(()=>A.CONFIG.words.map(()=>0));
    const output=A.classicalMDS(D,2), merges=A.hclustAverage(D);
    assert(output.coordinates.flat().every(x=>x===0)); assert(output.shares.every(x=>x===0));
    for(let k=2;k<=12;k++) { const labels=A.cutTree(merges,k); assert(new Set(labels).size===k); assert(labels.length===17); }
    assert(JSON.stringify(merges)===JSON.stringify(A.hclustAverage(D)));
  });
  test('Ancla positiva y orientación sin mutar los datos originales',()=> {
    const points=[[-2,-1],[3,-4]], output=A.orientCoordinates(points,['alegría','calma']);
    assert(output[0][0]>0 && output[0][1]>0); assert(points[0][0]===-2); close(Math.hypot(...points[0]),Math.hypot(...output[0]));
  });
  test('Cuarenta respuestas simuladas completas y válidas',()=> {
    let seed=123456;
    const random=()=> { seed=(1664525*seed+1013904223)>>>0; return seed/4294967296; };
    const demo=A.simulateResponses(40,random);
    assert(demo.length===40 && demo.every(row=>A.validateResponse(row)&&row.n_groups>=3&&row.n_groups<=6));
    assert(demo.every(row=>row.word_order.length===17));
    const output=A.classicalMDS(A.distances(A.coOccurrence(demo)),2);
    assert(output.coordinates.flat().every(Number.isFinite));
    assert(output.shares[0]+output.shares[1]>0.5);
  });
  test('Validación del envío completo y orden inicial',()=> {
    const payload={session_code:'prueba',participant_id:'12345678-1234-4234-8234-123456789012',
      groups:[A.CONFIG.words.slice(0,8),A.CONFIG.words.slice(8)],n_groups:2,
      word_order:[...A.CONFIG.words],criterio:'Por parecido',duration_ms:12345};
    assert(A.validatePayload(payload)); assert(!A.validatePayload({...payload,criterio:' '}));
    assert(!A.validatePayload({...payload,word_order:Array(17).fill('alegría')}));
    assert(!A.validatePayload({...payload,duration_ms:-1}));
  });
  return results;
}
if (typeof module !== 'undefined' && module.exports) module.exports = {runAnalysisTests};
