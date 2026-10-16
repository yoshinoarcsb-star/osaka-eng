/* 授業の講師画面用：学習アプリ(app.js)と同じ英文の表示（主語・動詞の枠、空所、解答の根拠の黄色、一文ごとの訳）
   app.js の英文表示(tokens / wordMap / mt / enHTML / passageHTML)の写しです。app.js の表示を直したら、ここも合わせてください。 */
(function(){
"use strict";
const D = window.OSAKA_DATA || {exams:{},grammar:{}};
const Q = {}, S = {}, V = {}, DAI = {};
for (const e of Object.values(D.exams)){
  for (const q of e.questions) Q[q.id] = Object.assign(q,{exam:e.id});
  for (const [id,s] of Object.entries(e.sentences)) S[id] = Object.assign(s,{id,exam:e.id});
  for (const [id,v] of Object.entries(e.vocab)) V[id] = Object.assign(v,{id,exam:e.id});
  for (const d of e.dai){
    d.exam = e.id; DAI[d.id] = d;
    for (const p of d.parts) for (const qid of p.questions) if (Q[qid]) Q[qid].partObj = p;
  }
}
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RD = {sv:false, svOn:()=>false, slOn:()=>false, Q, S, V, DAI, esc};
/* スラッシュ分割（app.js と同じ。語番号は完成文のもの）。入れるかどうかは RD.slOn(文ID) で決める */
const slashHTML = t => { const m = t.match(/^([\s\S]*?)(\s*)([“"‘(\[']*)$/);
  return esc(m[1]) + "\u00a0<span class=\"sl\" aria-hidden=\"true\">/</span> " + esc(m[3]); };
function slashSet(sl, map){
  const out = new Set();
  for (const i of sl){
    if (!map){ out.add(i); continue; }
    const j = map[i]; if (j==null || (i>0 && map[i-1]===j)) continue; out.add(j);
  }
  return out;
}
const svBtn = (sid, on) => `<button class="slbtn svbtn ${on?"on":""}" data-act="svs" data-sid="${sid}" aria-pressed="${on}" title="主語・動詞の枠を出す・消す">S/V</button>`;
const slBtn = (sid, on) => `<button class="slbtn ${on?"on":""}" data-act="sl" data-sid="${sid}" aria-pressed="${on}" title="スラッシュ分割（/）を入れる・消す">/</button>`;
const WORD_RE = /[A-Za-z0-9]+(?=n['’]t\b)|n['’]t\b|['’](?:[sSmMdD]|re|ve|ll|RE|VE|LL)\b|[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*/g;
function tokens(text, off){
  const out=[]; let last=0, m; WORD_RE.lastIndex=0;
  while ((m=WORD_RE.exec(text))){
    if (m.index>last) out.push({t:text.slice(last,m.index), s:off+last});
    out.push({t:m[0], s:off+m.index, w:true}); last = m.index+m[0].length;
  }
  if (last<text.length) out.push({t:text.slice(last), s:off+last});
  return out;
}
const wordsOf = t => (t||"").match(WORD_RE)||[];
const wkey = w => w.toLowerCase().replace(/’/g,"'");
// 文法の該当箇所（データの span）を語番号に直す。間に語が挟まる形（was really interested in）も拾う
// 空所のある文の並び（語と空所）。空所は mt() でも1つの番号を持つ
const BLANK_RE = /(\[[^\]]{1,6}\])/;
const BLANK = "\u0000";
const rawSeq = text => text.split(BLANK_RE).flatMap((p,k)=> k%2 ? [BLANK] : wordsOf(p));
// 完成文の語番号 → 空所のある文の番号（範囲は完成文で持っているため）。
// 空所に入った語（答え）は、その空所に対応させる
function wordMap(from, to){
  const a=from.map(wkey), b=to.map(w=>w===BLANK? w : wkey(w)), n=a.length, m=b.length;
  const L = Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--) L[i][j] = a[i]===b[j] ? L[i+1][j+1]+1 : Math.max(L[i+1][j], L[i][j+1]);
  const map=[]; let i=0, j=0;
  while (i<n && j<m){ if (a[i]===b[j]){ map[i]=j; i++; j++; } else if (L[i+1][j]>=L[i][j+1]) i++; else j++; }
  const anc = map.slice();
  for (let i=0;i<n;i++){
    if (anc[i]!=null) continue;
    let p=i-1; while (p>=0 && anc[p]==null) p--;
    let q=i+1; while (q<n && anc[q]==null) q++;
    const lo = p>=0 ? anc[p]+1 : 0, hi = q<n ? anc[q]-1 : m-1;
    for (let j=lo;j<=hi;j++) if (b[j]===BLANK){ map[i]=j; break; }
  }
  return map;
}
function mapRange(r, map){
  if (!map) return [[r[0], r[1]]];
  const out=[];
  for (let i=r[0]; i<=r[1]; i++){ const j=map[i]; if (j==null) continue;
    const last=out[out.length-1]; if (last && j>=last[0] && j<=last[1]) continue; if (last && last[1]===j-1) last[1]=j; else out.push([j,j]); }
  return out;
}
const MTMAP = {};
function mt(key, text, o){
  o = o||{};
  const toks = []; let off = 0;
  (o.blanks ? text.split(BLANK_RE) : [text]).forEach((p,k)=>{
    if (k%2) toks.push({t:p, s:off, blank:true}); else toks.push(...tokens(p, off));
    off += p.length;
  });
  // 語と空所に番号を付ける（空所にも枠が付くように）
  let wi=0; for (const x of toks) if (x.w || x.blank) x.i = wi++;
  let pw=-1; for (const x of toks){ if (x.i!=null) pw=x.i; else x.p=pw; }
  let nw=wi; for (let k=toks.length-1;k>=0;k--){ const x=toks[k]; if (x.i!=null) nw=x.i; else x.n=nw; }
  MTMAP[key] = o.map||null;
  // 囲み：問題の下線、主語（オレンジ枠）、動詞（ピンク枠）
  const R = [];
  for (const u of o.unders||[]){
    const ws = toks.filter(x=>x.w && x.s<u.e && x.s+x.t.length>u.s);
    if (ws.length) R.push({a:ws[0].i, b:ws[ws.length-1].i, open:`<u class="mk">`, close:"</u>", label:u.label, ord:0});
  }
  // 空所は答えの手がかりになるので枠を付けない（枠は空所の前後で分ける）
  const isBlank = new Set(toks.filter(x=>x.blank).map(x=>x.i));
  const noBlank = rs => rs.flatMap(([a,b])=>{ const out=[]; let st=null;
    for (let i=a;i<=b+1;i++){ if (i<=b && !isBlank.has(i)){ if (st==null) st=i; } else if (st!=null){ out.push([st,i-1]); st=null; } }
    return out; });
  (o.sv||[]).forEach((c,ci)=>{
    for (const typ of ["S","V"]) for (const r of c[typ]||[]) for (const [a,b] of noBlank(mapRange(r, o.map)))
      R.push({a, b, open:`<span class="sv sv-${typ.toLowerCase()}" title="${typ==="S"?"主語":"動詞"}${o.sv.length>1? "（節"+(ci+1)+"）":""}">`, close:"</span>", ord:1});
  });
  R.sort((x,y)=> x.a-y.a || y.b-x.b || x.ord-y.ord);
  const gcls = () => "", gapCls = () => "";
  const covers = (r,x)=> x.i!=null ? r.a<=x.i && x.i<=r.b : r.a<=x.p && x.n<=r.b;
  const stack=[]; let h="";
  toks.forEach((x,k)=>{
    const want = R.filter(r=>covers(r,x));
    let c=0; while (c<stack.length && c<want.length && stack[c]===want[c]) c++;
    while (stack.length>c) h += stack.pop().close;
    for (const r of want.slice(c)){ h += r.open; if (r.label && !r.labeled){ h += `<sup>${esc(r.label)}</sup>`; r.labeled=true; } stack.push(r); }
    if (x.w) h += `<span class="w${gcls(x.i)}" data-i="${x.i}">${esc(x.t)}</span>`;
    else if (x.blank) h += `<span class="blank" data-i="${x.i}">${esc(x.t.slice(1,-1))}</span>`;
    else if (/^\s+$/.test(x.t) && toks[k-1] && toks[k-1].w && toks[k+1] && toks[k+1].w)
      h += `<span class="gap${gapCls(x.p,x.n)}" data-a="${x.p}" data-b="${x.n}">${o.slash && o.slash.has(x.n) ? slashHTML(x.t) : esc(x.t)}</span>`;
    else h += o.slash && x.p>=0 && o.slash.has(x.n) ? slashHTML(x.t) : esc(x.t);
  });
  while (stack.length) h += stack.pop().close;
  return `<span class="mt" data-mk="${esc(key)}">${h}</span>`;
}
/* 本文の1文。useFilled なら完成文（空所に正答を入れた文）、o.gram で文法の該当箇所に下線 */
function enHTML(s, useFilled, o){
  o = o||{};
  const full = s.filled || s.en;
  const filled = useFilled && s.filled;
  const text = filled ? s.filled : s.en;
  const same = text===full;
  const map = same ? null : (s._map || (s._map = wordMap(wordsOf(full), filled ? wordsOf(text) : rawSeq(text))));
  const unders = [];
  for (const mk of s.marks||[]){
    if (mk.kind!=="underline" || !mk.target) continue;
    const i = text.indexOf(mk.target); if (i>=0) unders.push({s:i, e:i+mk.target.length, label:mk.label});
  }
  const slash = s.slash && RD.slOn(s.id) ? slashSet(s.slash, map) : null;
  let h = mt(same? s.id : s.id+"~q", text, {blanks:!filled, unders, map, gram:o.gram, focus:o.focus, slash, sv: RD.svOn(s.id) && o.sv!==false ? s.sv : null});
  if (!filled) for (const mk of s.marks||[]) if (mk.kind==="insert_point") h += ` <span class="blank">${esc(mk.label)}</span>`;
  return h;
}

/* 黄色（解答の根拠）。正解を公開したあとの設問だけ出す */
let YEL = {};
RD.setYellow = function(qids){
  YEL = {};
  for (const id of qids){ const q=Q[id]; if (!q) continue;
    for (const [k,a,b] of q.key||[]) (YEL[k]||(YEL[k]=[])).push([a,b]); }
};
function yellowSet(key){
  const base = key.replace(/~q$/,""), set = new Set();
  for (const r of YEL[base]||[]) for (const [a,b] of mapRange(r, MTMAP[key])) for (let i=a;i<=b;i++) set.add(i);
  return set;
}
RD.paintAll = function(root){
  (root||document).querySelectorAll(".mt").forEach(el=>{
    const y = yellowSet(el.dataset.mk);
    el.querySelectorAll(".w").forEach(w=>w.classList.toggle("y", y.has(+w.dataset.i)));
    el.querySelectorAll(".gap").forEach(g=>g.classList.toggle("y", y.has(+g.dataset.a) && y.has(+g.dataset.b)));
  });
};
const partSentences = p => p.passages.flatMap(x=>x.sentences);
/* 本文（パート単位） */
function passageHTML(dai, part, opt){
  opt = opt||{};
  let h = "";
  for (const ps of part.passages){
    if (ps.genre==="item_set") continue;
    for (const f of ps.figures||[]) h += `<div class="figure">［図］${esc(f.description_ja||"")}${f.caption_en? `<br><span class="en">${esc(f.caption_en)}</span>`:""}</div>`;
    // 問題の形では、正答を本文に戻した文（挿入文など）は出さない
    const ss = ps.sentences.map(id=>S[id]).filter(s=>opt.filled || !s.fill);
    const dialog = ss.some(s=>s.speaker);
    let groups = [];
    for (const s of ss){
      const k = dialog ? (s.speaker||"") : s.para;
      const last = groups[groups.length-1];
      if (last && last.k===k) last.ss.push(s); else groups.push({k, ss:[s]});
    }
    for (const g of groups){
      h += `<p>${dialog && g.k? `<span class="speaker">${esc(g.k)}:</span>`:""}`+
           g.ss.map(s=> opt.practice
             ? `<span class="sw"><span class="s en" data-sid="${s.id}">${enHTML(s, opt.filled)}</span> <button class="trbtn" data-act="tr" data-sid="${s.id}" aria-pressed="false">訳</button>${svBtn(s.id, RD.svOn(s.id))}${s.slash? slBtn(s.id, RD.slOn(s.id)):""}<span class="ja trja" data-sid="${s.id}" hidden></span><button class="trbtn gvbtn" data-sid="${s.id}" aria-pressed="false" hidden>文法・語彙</button><span class="gvbox" data-sid="${s.id}" hidden></span></span>`
             : `<span class="s en" data-sid="${s.id}">${enHTML(s, opt.filled)}</span>${svBtn(s.id, RD.svOn(s.id))}${s.slash? slBtn(s.id, RD.slOn(s.id)):""}`).join(" ")+`</p>`;
    }
  }
  // （注）：原問題に載っている注だけ
  const sids = new Set(partSentences(part));
  const isLast = dai.parts[dai.parts.length-1]===part;
  const notes = Object.values(V).filter(v=>v.kind==="注語彙" && v.dai===dai.id && (sids.has(v.s) || (!v.s && isLast)));
  if (notes.length) h += `<div class="notes">（注）${notes.map(v=>esc(v.note||(v.word+"　"+v.ja))).join("　")}</div>`;
  return h ? `<div class="passage">${h}</div>` : "";
}

/* 1文の文法事項と語彙・熟語（講師の「文法・語彙」ボタン用） */
RD.gvHTML = function(sid){
  const s = S[sid]; if (!s) return "";
  const gs = (s.grammar||[]).map(g=>`<div class="gv-g"><b>${esc(g.name)}</b>${g.span?`　<span class="gv-span">${esc(g.span)}</span>`:""}<div class="gv-exp">${esc(g.exp||"")}</div></div>`).join("");
  const vs = (s.vocab||[]).map(id=>V[id]).filter(Boolean).map(v=>`<div class="gv-v"><b>${esc(v.word)}</b>${v.pos?`<span class="gv-pos">${esc(v.pos)}</span>`:""}　${esc(v.ja||v.note||"")}</div>`).join("");
  return (gs?`<div class="gv-h">文法事項</div>${gs}`:"")+(vs?`<div class="gv-h">語彙・熟語</div>${vs}`:"") || `<div class="gv-exp">この文に、文法事項・語彙の登録はありません。</div>`;
};
RD.enHTML = enHTML; RD.passageHTML = passageHTML; RD.mt = mt;
window.Reading = RD;
})();
