/* 大阪府公立高校入試 英語 学習アプリ（試作）
   データ: data/data.js（dataset/tools/to_app.py で生成）
   学習記録: この端末のブラウザ（localStorage）に保存。config.js にサーバーを設定すると、ログインして記録をサーバーにも送る（v7） */
(function(){
"use strict";
const D = window.OSAKA_DATA || {exams:{},grammar:{}};
const $app = document.getElementById("app");

/* ---------- 索引 ---------- */
const EXAMS = Object.values(D.exams).sort((a,b)=> b.year-a.year || a.form.localeCompare(b.form));
const Q = {}, S = {}, V = {}, DAI = {};
for (const e of EXAMS){
  for (const q of e.questions) Q[q.id] = Object.assign(q,{exam:e.id});
  for (const [id,s] of Object.entries(e.sentences)) S[id] = Object.assign(s,{id,exam:e.id});
  for (const [id,v] of Object.entries(e.vocab)) V[id] = Object.assign(v,{id,exam:e.id});
  for (const d of e.dai){
    d.exam = e.id; DAI[d.id] = d;
    for (const p of d.parts) for (const qid of p.questions) if (Q[qid]) Q[qid].partObj = p;
  }
}
const GR = D.grammar;
const QORDER = Object.keys(Q);

/* ---------- 保存 ---------- */
// サーバー連携(config.js)が無効なら v6 と同じ。有効ならログインした生徒ごとに端末内へ保存し、サーバーにも送る
const SYNC = window.OSAKA_SYNC || {enabled:false, auth:null};
const LEGACY_KEY = "osaka-eng-v1";
const storeKey = ()=> SYNC.enabled ? (SYNC.auth ? "osaka-eng-v2_"+SYNC.auth.student.number : null) : LEGACY_KEY;
function blankStore(){
  return {user:{id:"local-"+Math.random().toString(36).slice(2,10),name:""},attempts:[],sessions:[],reading:{},vocab:{},settings:{fs:17,theme:"auto",readAll:false,sv:true,keyRead:false},out:{a:[],v:[],e:[]},dead:[]};
}
let KEY = storeKey(), ST;
function loadStore(prevSettings){
  KEY = storeKey(); let st = null;
  if (KEY){ try { st = JSON.parse(localStorage.getItem(KEY)); } catch(e){ st = null; } }
  ST = Object.assign(blankStore(), st || {});
  ST.settings = Object.assign(blankStore().settings, prevSettings || {}, (st && st.settings) || {});
  ST.out = Object.assign({a:[],v:[],e:[]}, ST.out || {});
  if (SYNC.enabled && SYNC.auth) ST.user = {id:SYNC.auth.student.number, name:SYNC.auth.student.name};
}
let legacySettings = null;
try { legacySettings = (JSON.parse(localStorage.getItem(LEGACY_KEY)) || {}).settings || null; } catch(e){}
loadStore(legacySettings);
let saveWarned = false;
function save(){
  if (!KEY) return;
  try { localStorage.setItem(KEY, JSON.stringify(ST)); }
  catch(e){ if(!saveWarned){ saveWarned=true; alert("この端末では学習記録を保存できません（プライベートモードなど）。記録はページを閉じると消えます。"); } }
}

/* ---------- 表示設定 ---------- */
function applySettings(){
  document.documentElement.style.setProperty("--fs", ST.settings.fs+"px");
  const t = ST.settings.theme;
  if (t==="auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
applySettings();
document.getElementById("fontUp").onclick = ()=>{ ST.settings.fs=Math.min(24,ST.settings.fs+1); applySettings(); save(); };
document.getElementById("fontDown").onclick = ()=>{ ST.settings.fs=Math.max(14,ST.settings.fs-1); applySettings(); save(); };
document.getElementById("themeBtn").onclick = ()=>{
  const order=["auto","light","dark"]; ST.settings.theme=order[(order.indexOf(ST.settings.theme)+1)%3]; applySettings(); save();
};
document.getElementById("backBtn").onclick = ()=>{ if (location.hash && location.hash!=="#/") history.back(); };

/* ---------- 小道具 ---------- */
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hasJa = s => /[ぁ-んァ-ヶ一-龠]/.test(s||"");
const pct = (a,b)=> b? Math.round(a*100/b) : 0;
const fmtTime = ms => { const s=Math.round(ms/1000); return s<60? s+"秒" : Math.floor(s/60)+"分"+(s%60? (s%60)+"秒":""); };
const examLabel = id => { const e=D.exams[id]; return e? `${e.year}年度 ${e.form}問題` : id; };
const daiLabel = d => `${examLabel(d.exam)} 大問${d.no}`;
const gname = c => (GR[c]&&GR[c].name) || c;
function setTitle(t){ document.getElementById("topTitle").textContent = t; document.title = t + "｜大阪府公立高校入試 英語"; }
function go(h){ location.hash = h; }
const FACTOR = [1, .8, .6];

/* ---------- 英文の表示 ----------
   英文は語ごとに <span class="w"> に分け、主語・動詞の枠と解答の根拠（黄色）を付ける。
   語の分け方は dataset 側（主語・動詞・根拠の範囲を語番号で持っている）と同じにすること */
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
function spanIdx(wl, span){
  const sw = wordsOf(span).map(wkey); if (!sw.length) return [];
  const reach = /[~～…]|\.\.\./.test(span) ? 10 : 3;
  let best = null;
  for (let p=0; p<wl.length; p++){
    if (wl[p]!==sw[0]) continue;
    const idx=[p]; let j=p, gap=0, ok=true;
    for (let k=1; k<sw.length; k++){
      let f=-1; for (let q=j+1; q<=Math.min(wl.length-1, j+1+reach); q++) if (wl[q]===sw[k]){ f=q; break; }
      if (f<0){ ok=false; break; } gap += f-j-1; j=f; idx.push(f);
    }
    if (ok && (!best || gap<best.gap)) best = {idx, gap};
    if (best && !best.gap) break;
  }
  return best ? best.idx : [];
}
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
/* 文法の色分け：大分類を4色＋その他にまとめる */
const GGROUP = {"文の種類":1,"文型":1,"比較":1,"仮定法":1,"時制":2,"助動詞":2,"態":2,"不定詞":3,"動名詞":3,"分詞":3,"関係代名詞":4,"接続詞":4};
const GLEG = {1:"文の形",2:"動詞の形",3:"to・ing・分詞",4:"関係代名詞・接続詞",5:"その他"};
const gGroup = cat => GGROUP[cat] || 5;
const legendHTML = grps => `<div class="glegend">`+[...new Set(grps)].sort().map(g=>`<span><i class="gc${g}"></i>${GLEG[g]}</span>`).join("")+`</div>`;
/* 用語ミニ辞典：解説文の中の文法用語に点線を付け、タップで意味を出す */
const TERMS = {
  "関係代名詞":"who / which / that など。前の名詞をくわしく説明する言葉",
  "現在完了進行形":"have been ＋ ing の形。ずっと続いている動作を表す",
  "現在完了":"have / has ＋ 過去分詞の形。経験・完了・継続を表す",
  "過去分詞":"done, made, played のように、受け身や現在完了に使う動詞の形（3番目の形）",
  "現在分詞":"playing のように ing がついた形。進行形や、名詞を説明するときに使う",
  "助動詞":"can, will, must など。動詞に意味をつけたす言葉",
  "不定詞":"to ＋ 動詞のもとの形（to play）。「～すること」「～するために」など",
  "動名詞":"動詞に ing をつけた形。「～すること」を表す",
  "接触節":"that / which を省いた、名詞を後ろから説明するまとまり",
  "先行詞":"関係代名詞の直前にあって、あとの説明を受ける名詞",
  "形式主語":"文の最初の It。本当の主語（to ～ など）は後ろにある",
  "後置修飾":"名詞のあとに説明を置くこと（the girl playing tennis）",
  "前置修飾":"名詞の前に説明を置くこと（a sleeping baby）",
  "間接疑問":"疑問文が文の一部になった形（I know where he lives.）",
  "受動態":"「～される」の形（be動詞 ＋ 過去分詞）。受け身",
  "仮定法":"事実と違うことを想像して言う形（If I were ～）",
  "名詞節":"文の中で名詞の働きをする、主語と動詞を含むまとまり",
  "原形":"s や ed がつかない、辞書にのっているもとの形（play, go）",
  "目的語":"動詞の動作を受ける言葉。「～を」「～に」にあたる（I like tennis. の tennis）",
  "補語":"主語や目的語を説明する言葉（She is happy. の happy）",
  "主語":"文の「だれが・なにが」にあたる言葉",
  "代名詞":"he, it, them など、名詞の代わりに使う言葉",
  "形容詞":"名詞を説明する言葉（big, happy）",
  "副詞":"動詞や形容詞を説明する言葉（quickly, very）",
  "前置詞":"in, on, at, for など。名詞の前に置く言葉",
  "接続詞":"and, but, because, when など。語や文をつなぐ言葉",
};
const TERM_RE = new RegExp(Object.keys(TERMS).sort((a,b)=>b.length-a.length).join("|"),"g");
/* 文章（エスケープ前）→ HTML。同じ用語は最初の1回だけ点線にする */
function tw(text){
  const seen = new Set(); let out="", last=0; text = String(text==null? "" : text);
  for (const m of text.matchAll(TERM_RE)){
    out += esc(text.slice(last, m.index)); last = m.index + m[0].length;
    out += seen.has(m[0]) ? esc(m[0]) : (seen.add(m[0]), `<span class="term" data-term="${esc(m[0])}" tabindex="0" role="button">${esc(m[0])}</span>`);
  }
  return out + esc(text.slice(last));
}
const chipName = g => String(g.name).replace(/（.*$/,"");
const MTMAP = {};   // 表示中の英文ごとの語番号の対応（null なら完成文と同じ）
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
  const gw = new Map(); const wl = toks.filter(x=>x.i!=null).map(x=>x.w? wkey(x.t) : BLANK);
  (o.gram||[]).forEach((g,gi)=>{ const ent={grp:gGroup(g.cat), dim:o.focus!=null && o.focus!==gi};
    for (const part of String(g.span||"").split(/\s*[/／・]\s*/)) for (const i of spanIdx(wl, part)){ const a=gw.get(i)||[]; if (!a.some(e=>e.grp===ent.grp&&e.dim===ent.dim)) a.push(ent); gw.set(i,a); } });
  for (const a of gw.values()) a.sort((x,y)=>x.dim-y.dim);
  const gcls = i => { const a=gw.get(i); if (!a) return ""; return " g g"+a[0].grp+(a[0].dim?" gd":"")+(a[1]? " h2 k"+a[1].grp+(a[1].dim?" gd2":""):""); };
  const gapCls = (p,n) => { const a=gw.get(p), b=gw.get(n); return a && b && a[0].grp===b[0].grp && a[0].dim===b[0].dim ? " g g"+a[0].grp+(a[0].dim?" gd":"") : ""; };
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
      h += `<span class="gap${gapCls(x.p,x.n)}" data-a="${x.p}" data-b="${x.n}">${esc(x.t)}</span>`;
    else h += esc(x.t);
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
  let h = mt(same? s.id : s.id+"~q", text, {blanks:!filled, unders, map, gram:o.gram, focus:o.focus, sv: ST.settings.sv && o.sv!==false ? s.sv : null});
  if (!filled) for (const mk of s.marks||[]) if (mk.kind==="insert_point") h += ` <span class="blank">${esc(mk.label)}</span>`;
  return h;
}
/* 設問の英文（問題文・並べかえの英文・選択肢） */
// 設問の英文の範囲は、空所の中の番号（[(4)] の 4）も1語として数えてある。空所に対応させて枠から外す
const QMAP = {};
const qtextHTML = (key, text, sv) => mt(key, text, {blanks:true, sv: ST.settings.sv ? sv : null,
  map: QMAP[key] || (QMAP[key] = wordMap(wordsOf(text), rawSeq(text)))});

/* 黄色（解答の根拠）の塗り分け。描画後に paintAll() で付け直す */
let YEL = {};   // 文ID（または 設問ID:stem など） → 完成文の語番号の範囲
function setYellow(qids){
  YEL = {};
  for (const id of qids){ const q=Q[id]; if (!q) continue;
    for (const [k,a,b] of q.key||[]) (YEL[k]||(YEL[k]=[])).push([a,b]); }
}
function yellowSet(key){
  const base = key.replace(/~q$/,""), set = new Set();
  for (const r of YEL[base]||[]) for (const [a,b] of mapRange(r, MTMAP[key])) for (let i=a;i<=b;i++) set.add(i);
  return set;
}
function paintEl(el){
  const y = yellowSet(el.dataset.mk);
  el.querySelectorAll(".w").forEach(w=>w.classList.toggle("y", y.has(+w.dataset.i)));
  el.querySelectorAll(".gap").forEach(g=>g.classList.toggle("y", y.has(+g.dataset.a) && y.has(+g.dataset.b)));
}
function paintAll(){ document.querySelectorAll(".mt").forEach(paintEl); }
function partSentences(p){ return p.passages.flatMap(x=>x.sentences); }
function isItemSet(p){ return p.passages.length && p.passages.every(x=>x.genre==="item_set"); }

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
             ? `<span class="sw"><span class="s en" data-sid="${s.id}">${enHTML(s, opt.filled)}</span> <button class="trbtn" data-act="tr" data-sid="${s.id}" aria-pressed="false">訳</button><span class="ja trja" data-sid="${s.id}" hidden></span></span>`
             : `<span class="s en" data-sid="${s.id}">${enHTML(s, opt.filled)}</span>`).join(" ")+`</p>`;
    }
  }
  // （注）：原問題に載っている注だけ
  const sids = new Set(partSentences(part));
  const isLast = dai.parts[dai.parts.length-1]===part;
  const notes = Object.values(V).filter(v=>v.kind==="注語彙" && v.dai===dai.id && (sids.has(v.s) || (!v.s && isLast)));
  if (notes.length) h += `<div class="notes">（注）${notes.map(v=>esc(v.note||(v.word+"　"+v.ja))).join("　")}</div>`;
  return h ? `<div class="passage">${h}</div>` : "";
}

/* ---------- 演習セッション ---------- */
let SES = null;   // 実行中の演習
function newSession(kind, title, qids, extra){
  SES = Object.assign({id:"S"+Date.now(), kind, title, qids, start:Date.now(), lastAt:Date.now(), st:{}, tab:"q", ret:location.hash}, extra||{});
  for (const id of qids) SES.st[id] = {hints:0, revealed:false, sel:null, text:"", first:null, last:null, retry:0, pending:false};
  return SES;
}

function norm(s){
  return String(s||"").toLowerCase().replace(/[’‘`]/g,"'").replace(/[“”]/g,'"')
    .replace(/[.,!?;:"()\[\]]/g," ").replace(/\s+/g," ").trim();
}
function acceptList(q){
  const out = [];
  if (q.correct_text && !q.correct.length) out.push(q.correct_text);
  for (const x of [].concat(q.variants||[], q.models||[], q.example? [q.example]:[])){
    String(x).split(/\s*\[|\]\s*/).forEach(y=>{ if (y.trim()) out.push(y); });
  }
  return out.map(norm);
}
const SELF_ONLY = new Set(["conditioned_writing","free_writing"]);

function record(q, st, result, isFirst){
  const score = isFirst ? (result==="ok"? q.points*FACTOR[st.hints] : result==="mid"? q.points/2 : 0) : 0;
  const now = Date.now();
  const a = {ses:SES.id, kind:SES.kind, qid:q.id, exam:q.exam, dai:q.dai, format:q.format, codes:qCodes(q),
    answer: q.answer==="choice"? st.sel : st.text, result, score:Math.round(score*10)/10, points:q.points,
    hints:st.hints, revealed:st.revealed, retry:st.retry, mode:SES.mode||"exam", ms: now-SES.lastAt, at:new Date(now).toISOString(), user:ST.user.id};
  SES.lastAt = now;
  a.cu = SYNC.uuid ? SYNC.uuid() : "";
  ST.attempts.push(a); save(); queueAttempt(a);
  if (isFirst) st.first = {result, score:a.score, ms:a.ms};
  st.last = result;
}
function qCodes(q){ return q.main_grammar ? [q.main_grammar] : (q.grammar_codes||[]).filter(c=>!["G-PRESENT","G-VERB-PAST","G-PHRASE","G-CONV"].includes(c)); }

function qCardHTML(q){
  const st = SES.st[q.id]; const done = !!st.last && !st.pending; const locked = done || st.revealed;
  let h = `<div class="qhead"><span class="qno">${esc(q.part? "［"+q.part+"］":"")}${esc(q.no)}</span>`+
          `<span class="badge">${esc(q.format||"")}</span><span class="badge">${q.points}点</span>`+
          (SES.kind!=="dai"? `<span class="muted">${esc(daiLabel(DAI[q.dai]))}</span>`:"")+
          (st.first? `<span class="badge ${st.first.result==="ok"?"ok":st.first.result==="mid"?"warn":"ng"}">${st.first.score}点</span>`:"")+`</div>`;
  if (SES.kind!=="dai"){
    const p = q.partObj, dai = DAI[q.dai];
    if (p && !isItemSet(p)) h += `<details><summary>本文を見る</summary><div class="instr">${esc(p.instruction)}</div>${passageHTML(dai,p)}</details>`;
  }
  if (q.stem_ja) h += `<div class="stem">${esc(q.stem_ja)}</div>`;
  // 単文問題は英文をその場に表示
  if (q.stem_en) h += `<div class="en stem">${qtextHTML(q.id+":stem", q.stem_en, q.sv_stem)}</div>`;
  if (q.partObj && isItemSet(q.partObj)) for (const sid of q.mark_sids||[]) h += `<div class="en stem">${enHTML(S[sid])}</div>`;
  (q.items||[]).forEach((it,k)=>{ h += `<div class="en">${esc(it.label)} ${qtextHTML(q.id+":i"+k, it.text, it.sv)}</div>`; });
  if (q.frame) h += `<div class="frame">${esc(q.frame)}</div>`;
  for (const c of q.conditions||[]) h += `<div class="cond">〈条件〉${esc(c)}</div>`;
  if (q.answer!=="choice"){
    const w = q.words? `英語${q.words}語` : q.words_approx? `${q.words_approx}語程度` : "";
    if (w) h += `<div class="cond">${w}</div>`;
  }
  // ヒント
  if (st.hints>=1 && q.hint1) h += `<div class="hint"><b>ヒント1</b>　${tw(q.hint1)}</div>`;
  if (st.hints>=2 && q.hint2) h += `<div class="hint"><b>ヒント2</b>　${tw(q.hint2)}</div>`;
  // 解答欄
  if (q.answer==="choice"){
    const enc = q.choices.some(c=>!hasJa(c[1]));
    h += `<div class="choices ${enc?"en-choices":""}">`+q.choices.map(([l,t])=>{
      let cls = st.sel===l? "sel":"";
      if (locked){ if (q.correct.includes(l)) cls="right"; else if (st.sel===l) cls="wrong"; }
            return `<button data-act="sel" data-q="${q.id}" data-l="${esc(l)}" class="${cls}" ${locked?"disabled":""}><span class="lb">${esc(l)}</span>${t!==l? `<span>${hasJa(t)? esc(t) : mt(q.id+":c:"+l, t)}</span>`:""}</button>`;
    }).join("")+`</div>`;
  } else {
    h += `<textarea data-q="${q.id}" class="ans" rows="2" placeholder="英語で書く" autocapitalize="off" autocomplete="off" spellcheck="false" ${locked||st.pending?"disabled":""}>${esc(st.text)}</textarea>`;
  }
  // ボタン
  if (!locked && !st.pending){
    h += `<div class="toolbar">`+
      `<button class="primary" data-act="submit" data-q="${q.id}">答える</button>`+
      (q.hint1 && st.hints<1? `<button data-act="hint" data-q="${q.id}">ヒント1（8割）</button>`:"")+
      (q.hint2 && st.hints===1? `<button data-act="hint" data-q="${q.id}">ヒント2（6割）</button>`:"")+
      `<button class="ghost" data-act="reveal" data-q="${q.id}">答えを見る（0点）</button></div>`;
  }
  // 自己採点
  if (st.pending){
    h += `<div class="judge mid"><div class="big">自分で採点してください</div>${answerHTML(q)}`+
      `<div class="toolbar"><button class="primary" data-act="self" data-r="ok" data-q="${q.id}">○ 合っている</button>`+
      (q.partial || SELF_ONLY.has(q.qtype)? `<button data-act="self" data-r="mid" data-q="${q.id}">△ 一部</button>`:"")+
      `<button data-act="self" data-r="ng" data-q="${q.id}">× 違う</button></div></div>`;
  }
  if (locked){
    const r = st.revealed && !st.first? "rev" : st.last;
    const lab = r==="ok"? "正解" : r==="mid"? "一部正解" : r==="rev"? "答えを確認しました" : "不正解";
    h += `<div class="judge ${r==="ok"?"ok":r==="mid"?"mid":"ng"}"><div class="big">${lab}</div>${answerHTML(q)}`+
      (q.explanation? `<div class="explain">${tw(q.explanation)}</div>`:"")+relatedHTML(q)+
      `<div class="toolbar">${r!=="ok"? `<button data-act="retry" data-q="${q.id}">もう一度考える</button>`:""}`+
      (q.related.length && SES.kind==="dai"? `<button data-act="show" data-q="${q.id}">本文で確認</button>`:"")+
      `<a class="btn" href="#/read/${q.dai}?s=${encodeURIComponent(q.related[0]||"")}">この文を精読</a></div>`+
      (st.retry? `<div class="muted">再挑戦 ${st.retry}回（得点は最初の解答で決まります）</div>`:"")+`</div>`;
  }
  return h;
}
function answerHTML(q){
  let h = "";
  if (q.answer==="choice"){
    h += `<div>正答：<b>${esc(q.correct.join("・"))}</b>　${hasJa(q.correct_text)? esc(q.correct_text) : `<span class="en">${esc(q.correct_text||"")}</span>`}</div>`;
  } else {
    if (q.correct_text) h += `<div>正答：<span class="en"><b>${esc(q.correct_text)}</b></span></div>`;
    if (q.example) h += `<div>解答例（公式）：<span class="en">${esc(q.example)}</span></div>`;
    const more = (q.models||[]).filter(m=>m!==q.example && m!==q.correct_text);
    if (more.length) h += `<div class="muted">ほかの書き方の例：<span class="en">${more.map(esc).join(" / ")}</span></div>`;
    if (q.variants && q.variants.length) h += `<div class="muted">正解として認めた別の書き方（公式解答にはない）：<span class="en">${q.variants.map(esc).join(" / ")}</span></div>`;
  }
  return h;
}
function relatedHTML(q){
  if (!q.related.length) return "";
  let h = `<details><summary>根拠の文と和訳</summary>`;
  for (const id of q.related){ const s=S[id]; if (!s) continue;
    h += `<div class="en">${s.speaker? `<span class="speaker">${esc(s.speaker)}:</span>`:""}${enHTML(s,true)}</div><div class="ja">${esc(s.ja)}</div>`; }
  if ((q.key||[]).length) h += `<div class="muted"><span class="legend y">黄色</span>は問題を解くうえで重要な箇所です。</div>`;
  if (q.main_grammar) h += `<div class="muted">主な文法：<a href="#/grammar/${q.main_grammar}">${esc(gname(q.main_grammar))}</a></div>`;
  return h+`</details>`;
}
function rerenderQ(id){
  const el = document.getElementById("q-"+id); if (!el) return;
  el.innerHTML = qCardHTML(Q[id]);
  sesYellow(); paintAll(); refreshTr();
}
// 演習では、答えた（または答えを見た）設問の根拠だけを黄色にする
function sesYellow(){ if (SES) setYellow(SES.qids.filter(id=>{ const st=SES.st[id]; return st.first || st.revealed || (st.last && !st.pending); })); }

/* 過去問練習：一文ごとの訳ボタン */
// 空所のある文は、その文に関わる設問を答える（または答えを見る）まで訳を出さない（和訳は答えを入れた文のため）
function trLocked(sid){
  const s = S[sid];
  if (!(s.marks||[]).some(m=>m.kind==="blank")) return false;
  const qs = SES.qids.filter(id=>(Q[id].related||[]).includes(sid) || (Q[id].mark_sids||[]).includes(sid));
  return qs.some(id=>!(SES.st[id].first || SES.st[id].revealed));
}
function refreshTr(){
  if (!SES || SES.mode!=="practice") return;
  document.querySelectorAll(".trbtn").forEach(b=>{
    const sid = b.dataset.sid, lock = trLocked(sid), on = !lock && !!(SES.trAll || SES.tr[sid]);
    b.disabled = lock; b.classList.toggle("on", on); b.classList.toggle("lock", lock);
    b.setAttribute("aria-pressed", on); b.textContent = on? "訳を閉じる" : "訳";
    b.title = lock? "この文は、設問に答えると訳が見られます" : "";
    const j = b.parentNode.querySelector(".trja"); j.hidden = !on; j.textContent = on? S[sid].ja : "";
    if (on){ if (!SES.trSeen[sid]) queueView(sid); SES.trSeen[sid] = true; }
  });
  const all = document.querySelector('[data-act="trAll"]');
  if (all){ all.classList.toggle("on", !!SES.trAll); all.textContent = SES.trAll? "全部の訳を隠す" : "全部の訳を出す"; }
}

/* 演習画面 */
function renderSession(){
  const s = SES; const answered = s.qids.filter(id=>s.st[id].first||s.st[id].revealed).length;
  let left = "";
  if (s.kind==="dai"){
    const dai = DAI[s.dai];
    left = (dai.instruction? `<div class="instr">${esc(dai.instruction)}</div>`:"") +
      dai.parts.filter(p=>!isItemSet(p)).map(p=>`${dai.parts.length>1? `<h3>［${esc(p.part)}］</h3>`:""}<div class="instr">${esc(p.instruction)}</div>${passageHTML(dai,p,{practice:s.mode==="practice"})}`).join("");
  }
  let right = "";
  let curPart = null;
  for (const id of s.qids){
    const q = Q[id];
    if (s.kind==="dai" && q.partObj!==curPart){
      curPart = q.partObj;
      if (isItemSet(curPart) || DAI[s.dai].parts.length===1) right += `<div class="instr">${esc(curPart.instruction)}</div>`;
      else right += `<h3>［${esc(curPart.part)}］の問い</h3>`;
    }
    right += `<div class="card q" id="q-${id}">${qCardHTML(q)}</div>`;
  }
  const hasLeft = !!left.trim();
  $app.innerHTML = `<h1>${esc(s.title)}</h1>
    <p class="muted">ヒントを使うと得点が8割・6割になり、答えを見ると0点です。答えたあとは何度でも考え直せます（得点は最初の解答）。</p>
    ${markBar(false)}
    ${s.mode==="practice"? `<div class="mkbar"><button data-act="trAll" class="tg">全部の訳を出す</button><span class="muted">本文の各文の「訳」ボタンで和訳が出ます。空所のある文は、設問に答えると見られます。</span></div>`:""}
    ${hasLeft? `<div class="tabs"><button data-act="tab" data-t="p" class="${s.tab==="p"?"on":""}">本文</button><button data-act="tab" data-t="q" class="${s.tab==="q"?"on":""}">設問</button></div>`:""}
    <div class="${hasLeft?"split":""}">
      ${hasLeft? `<div class="pane passage-pane card ${s.tab==="p"?"":"hidden"}" id="pPane">${left}</div>`:""}
      <div class="pane ${hasLeft && s.tab!=="q"?"hidden":""}" id="qPane">${right}</div>
    </div>
    <div class="sticky-foot"><span class="grow muted" id="sesInfo">${answered}/${s.qids.length}問</span>
      <button class="primary" data-act="finish">採点して終わる</button></div>`;
  sesYellow(); refreshTr();
}
function updateInfo(){
  const el = document.getElementById("sesInfo"); if (!el||!SES) return;
  const n = SES.qids.filter(id=>SES.st[id].first||SES.st[id].revealed).length;
  el.textContent = `${n}/${SES.qids.length}問・${fmtTime(Date.now()-SES.start)}`;
}
setInterval(updateInfo, 5000);

function judge(q){
  const st = SES.st[q.id];
  const first = !st.first && !st.revealed;
  if (q.answer==="choice"){
    if (!st.sel) { alert("選択肢を選んでください"); return; }
    record(q, st, q.correct.includes(st.sel)? "ok":"ng", first);
  } else {
    const ta = document.querySelector(`textarea[data-q="${q.id}"]`); st.text = ta? ta.value : st.text;
    if (!st.text.trim()) { alert("答えを書いてください"); return; }
    if (!SELF_ONLY.has(q.qtype) && acceptList(q).includes(norm(st.text))) record(q, st, "ok", first);
    else { st.pending = true; st.pendingFirst = first; }
  }
  rerenderQ(q.id); updateInfo();
}

function finishSession(){
  const s = SES; let score=0, pts=0, ok=0, n=0;
  const rows = s.qids.map(id=>{
    const q=Q[id], st=s.st[id]; pts += q.points;
    const r = st.first? st.first.result : st.revealed? "rev" : "skip";
    if (st.first){ score += st.first.score; n++; if (r==="ok") ok++; }
    return {id, r, score: st.first? st.first.score:0, points:q.points, hints:st.hints};
  });
  const sum = {id:s.id, kind:s.kind, mode:s.mode||"exam", tr:Object.keys(s.trSeen||{}), title:s.title, at:new Date().toISOString(), ms:Date.now()-s.start,
    score:Math.round(score*10)/10, points:pts, ok, answered:n, total:s.qids.length, rows, dai:s.dai||null, user:ST.user.id};
  ST.sessions.push(sum); save();
  if (sum.mode!=="practice") queueEvent("finish_solve", sum.dai||sum.id);
  SES = null;
  go("#/result/"+sum.id);
}

/* ---------- 画面 ---------- */
function home(){
  setTitle("大阪府公立高校入試 英語");
  const n = ST.attempts.filter(a=>a.retry===0 && a.mode!=="practice").length;
  $app.innerHTML = `<h1>大阪府公立高校入試 英語</h1>
  <div class="tiles">
    <a class="tile" href="#/exams"><b>過去問</b><span>演習（本番形式）と練習（一文ごとの訳ボタン付き）</span></a>
    <a class="tile" href="#/reading"><b>長文精読</b><span>1文ずつ英文・和訳・文法・語彙を確かめる</span></a>
    <a class="tile" href="#/grammar"><b>文法</b><span>文法項目ごとに例文と設問</span></a>
    <a class="tile" href="#/vocab"><b>語彙</b><span>原問題の（注）と本文の重要語彙</span></a>
    <a class="tile" href="#/random"><b>ランダム</b><span>条件を決めて問題を集める</span></a>
    ${cloud()? `<a class="tile" href="#/class"><b>授業</b><span>授業が始まったら、ここで答えます</span></a>` : ""}
    <a class="tile" href="#/records"><b>学習記録</b><span>${n? `これまでに${n}問。弱点とおすすめ`:"成績・弱点・おすすめ"}</span></a>
  </div>${accountHTML()}`;
}

function examList(){
  setTitle("過去問");
  const years = [...new Set(EXAMS.map(e=>e.year))];
  $app.innerHTML = `<h1>過去問</h1>` + years.map(y=>`<h2>${y}年度</h2><div class="list">`+
    EXAMS.filter(e=>e.year===y).map(e=>{
      const pts = e.questions.reduce((a,q)=>a+q.points,0);
      const lk = lockOf(e.id,null);
      return `<a class="item" href="#/exam/${e.id}"><div class="main"><b>${e.form}問題</b>${lk? ` <span class="lockmark">🔒 ${esc(untilText(lk))}まで利用できません</span>`:""}<div class="sub">${esc(e.era||"")}・大問${e.dai.length}・設問${e.questions.length}・${pts}点</div></div><span>›</span></a>`;
    }).join("")+`</div>`).join("");
}

function bestFor(daiId){
  const ss = ST.sessions.filter(s=>s.dai===daiId && s.mode!=="practice");
  return ss.length? ss[ss.length-1] : null;
}
function examPage(id){
  const e = D.exams[id]; if (!e) return notFound();
  setTitle(examLabel(id));
  $app.innerHTML = `<h1>${esc(examLabel(id))}</h1><p class="muted">${esc(e.title)}</p>
    <p class="muted"><b>過去問演習</b>：本番と同じ形で解く（成績が学習記録に入る）。<b>過去問練習</b>：本文の一文ごとに「訳」ボタンが付く（成績は別扱い）。</p>
    <div class="row" style="margin-bottom:12px"><button class="primary" data-act="solveExam" data-e="${id}">全大問を通して演習</button></div>
    <div class="list">`+e.dai.map(d=>{
      const last = bestFor(d.id); const pts = e.questions.filter(q=>q.dai===d.id).reduce((a,q)=>a+q.points,0);
      return `<div class="card"><div class="row"><div class="grow"><b>大問${d.no}</b>　${esc(d.title||"")}
        <div class="muted">${esc(d.type||"")}${d.theme? "・"+esc(d.theme):""}・${pts}点${d.difficulty&&d.difficulty["難易度"]? "・難易度"+d.difficulty["難易度"]:""}</div>
        ${last? `<div class="muted">前回 ${last.score}/${last.points}点（${last.at.slice(0,10)}）</div>`:""}</div></div>
        ${d.note? `<p class="muted" style="margin:.4em 0">${esc(d.note)}</p>`:""}
        ${lockOf(e.id,d.id)? `<p class="lockmark">🔒 ${esc(untilText(lockOf(e.id,d.id)))}まで利用できません</p>` : `<div class="row"><a class="btn primary" href="#/solve/${d.id}">過去問演習</a><a class="btn" href="#/practice/${d.id}">過去問練習</a><a class="btn" href="#/read/${d.id}">精読</a></div>`}</div>`;
    }).join("")+`</div>`;
}

function solve(daiId, mode){
  const d = DAI[daiId]; if (!d) return notFound();
  mode = mode||"exam";
  if (!SES || SES.kind!=="dai" || SES.dai!==daiId || (SES.mode||"exam")!==mode){
    newSession("dai", (mode==="practice"? "【練習】":"")+daiLabel(d)+(d.title? "　"+d.title:""), d.parts.flatMap(p=>p.questions),
      mode==="practice"? {dai:daiId, mode, tr:{}, trSeen:{}, trAll:false} : {dai:daiId, mode});
    queueEvent(mode==="practice"? "open_practice":"start_solve", daiId);
  }
  setTitle(daiLabel(d)); renderSession();
}
function solveSet(){
  if (!SES) return go("#/");
  setTitle(SES.title); renderSession();
}

function result(id){
  const r = ST.sessions.find(s=>s.id===id); if (!r) return notFound();
  setTitle("結果");
  const byFmt = {}, weak = {};
  for (const row of r.rows){ const q=Q[row.id]; if (!q) continue;
    const f = byFmt[q.format]||(byFmt[q.format]={n:0,ok:0}); f.n++; if (row.r==="ok") f.ok++;
    if (row.r!=="ok") for (const c of qCodes(q)) weak[c]=(weak[c]||0)+1; }
  const wrong = r.rows.filter(x=>x.r!=="ok").map(x=>x.id);
  const self = r.rows.filter(x=>x.r==="ok" && x.hints===0).length;
  $app.innerHTML = `<h1>${esc(r.title)}</h1>
   <div class="stat"><div><b>${r.score}<small>/${r.points}</small></b><span>得点</span></div>
     <div><b>${pct(r.ok,r.total)}%</b><span>正答率（${r.ok}/${r.total}問）</span></div>
     <div><b>${self}</b><span>ヒントなしで正解</span></div>
     <div><b>${fmtTime(r.ms)}</b><span>かかった時間</span></div>
     ${r.mode==="practice"? `<div><b>${(r.tr||[]).length}</b><span>訳を見た文</span></div>`:""}</div>
   ${r.mode==="practice"? `<p class="muted">過去問練習の成績は、学習記録の集計には入りません。</p>`:""}
   <h2>設問ごと</h2><div class="tblwrap"><table class="tbl"><tr><th>設問</th><th>形式</th><th>結果</th><th class="num">得点</th></tr>`+
   r.rows.map(x=>{ const q=Q[x.id]; return `<tr><td>${q? esc((SES_KIND_LABEL(q))):x.id}</td><td>${q? esc(q.format):""}</td><td>${x.r==="ok"?'<span class="badge ok">正解</span>':x.r==="mid"?'<span class="badge warn">一部</span>':x.r==="rev"?'<span class="badge ng">答えを確認</span>':x.r==="skip"?'<span class="badge">未解答</span>':'<span class="badge ng">不正解</span>'}${x.hints?` <span class="muted">ヒント${x.hints}</span>`:""}</td><td class="num">${x.score}/${x.points}</td></tr>`; }).join("")+`</table></div>
   <h2>問題形式ごと</h2><div class="tblwrap"><table class="tbl">`+Object.entries(byFmt).map(([f,v])=>`<tr><td>${esc(f)}</td><td class="num">${v.ok}/${v.n}</td><td><div class="bar"><i style="width:${pct(v.ok,v.n)}%"></i></div></td></tr>`).join("")+`</table></div>
   ${Object.keys(weak).length? `<h2>見直したい文法</h2><div class="list">`+Object.entries(weak).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c])=>`<a class="item" href="#/grammar/${c}"><div class="main">${esc(gname(c))}</div><span>›</span></a>`).join("")+`</div>`:""}
   <div class="row" style="margin-top:16px">${wrong.length? `<button class="primary" data-act="retryWrong" data-ids="${wrong.join(",")}">間違えた問題をもう一度</button>`:""}
   ${r.dai? `<a class="btn" href="#/${r.mode==="practice"?"practice":"solve"}/${r.dai}">${r.mode==="practice"?"もう一度練習":"もう一度演習"}</a><a class="btn" href="#/read/${r.dai}">この大問を精読</a>`:""}<a class="btn" href="#/records">学習記録へ</a></div>`;
}
function SES_KIND_LABEL(q){ return `大問${DAI[q.dai].no} ${q.part? "［"+q.part+"］":""}${q.no}`; }

/* 長文精読 */
const RD = {};  // 大問ごとの位置
function readingList(){
  setTitle("長文精読");
  $app.innerHTML = `<h1>長文精読</h1><p class="muted">1文ずつ、意味を考えてから和訳・文法・語彙を確かめます。</p>`+
    EXAMS.map(e=>`<h2>${esc(examLabel(e.id))}</h2><div class="list">`+e.dai.map(d=>{
      const ids = d.parts.flatMap(partSentences); const seen = ids.filter(id=>ST.reading[id]).length;
      return `<a class="item" href="#/read/${d.id}"><div class="main"><b>大問${d.no}</b>　${esc(d.title||"")}<div class="sub">${ids.length}文・読んだ文 ${seen}</div></div><span>›</span></a>`;
    }).join("")+`</div>`).join("");
}
function read(daiId, params){
  const d = DAI[daiId]; if (!d) return notFound();
  const ids = d.parts.flatMap(partSentences);
  if (!RD[daiId]){ RD[daiId] = {i:0, step:0, raw:false}; queueEvent("open_reading", daiId); }
  const R = RD[daiId];
  if (params.s && ids.includes(params.s) && R.jumped!==params.s){ R.i = ids.indexOf(params.s); R.step = 0; R.jumped = params.s; }
  const s = S[ids[R.i]];
  const all = ST.settings.readAll; const step = all? 3 : R.step;
  const part = d.parts.find(p=>partSentences(p).includes(s.id));
  setTitle("精読 "+daiLabel(d));
  const notes = s.notes.map(id=>V[id]).filter(Boolean), voc = s.vocab.map(id=>V[id]).filter(Boolean);
  const mark = ST.reading[s.id];
  const gsel = step>=2 && s.grammar.length ? s.grammar : null;
  const gfocus = step>=2 && R.gf!=null && s.grammar[R.gf] ? R.gf : null;
  let keyNote = "";
  if (ST.settings.keyRead){
    const qs = d.parts.flatMap(p=>p.questions); setYellow(qs);
    const hit = qs.filter(id=>(Q[id].key||[]).some(k=>k[0]===s.id));
    if (hit.length) keyNote = `<div class="muted"><span class="legend y">黄色</span>は ${hit.map(id=>esc((Q[id].part? "［"+Q[id].part+"］":"")+Q[id].no)).join("・")} を解くうえで重要な箇所</div>`;
  }
  $app.innerHTML = `<h1>${esc(daiLabel(d))}${part&&part.part? " ［"+esc(part.part)+"］":""}</h1>
   <div class="row"><span class="muted grow">${R.i+1} / ${ids.length} 文</span>
     <label class="muted"><input type="checkbox" data-act="readAll" ${all?"checked":""}> 最初から全部表示</label></div>
   <div class="progress"><i style="width:${pct(R.i+1,ids.length)}%"></i></div>
   ${markBar(true)}
   <div class="card readcard">
     ${s.speaker? `<div class="speaker">${esc(s.speaker)}</div>`:""}
     <div class="en">${enHTML(s, !R.raw, {gram:gsel, focus:gfocus})}</div>
     ${step>=2 && s.grammar.length? legendHTML(s.grammar.map(g=>gGroup(g.cat)))+`<div class="chips">`+s.grammar.map((g,n)=>`<button class="chip gc${gGroup(g.cat)} ${R.gf===n?"on":""}" data-act="gfocus" data-n="${n}" aria-pressed="${R.gf===n}">${esc(chipName(g))}</button>`).join("")+`</div>`:""}
     ${keyNote}
     ${s.filled && s.filled!==s.en? `<button class="ghost" data-act="raw" style="min-height:32px;padding:2px 8px;font-size:.8rem">${R.raw? "答えを入れた文にする":"問題の形（空所あり）にする"}</button>`:""}
     <div class="muted">${[s.type,s.structure,s.difficulty? "難易度"+s.difficulty:null].filter(Boolean).map(esc).join("　/　")}</div>
     ${step<1? `<div class="step"><p class="muted">まず自分で意味を考えてみましょう。</p><button class="primary" data-act="step">和訳を見る</button></div>`:
       `<div class="step"><h3>和訳</h3><div class="ja">${esc(s.ja)}</div></div>`}
     ${step===1? `<div class="step"><button class="primary" data-act="step">文法を見る</button></div>`:""}
     ${step>=2? `<div class="step"><h3>文法</h3>${s.grammar.length? `<p class="muted" style="margin:0 0 6px">英文の下線の色は、文法の種類を表します。文法（または上のボタン）をタップすると、その箇所だけが濃くなります。点線の用語はタップすると意味が出ます。</p>`+s.grammar.map((g,n)=>`<div class="gram gc${gGroup(g.cat)} ${R.gf===n?"on":""}" data-act="gfocus" data-n="${n}"><a class="nm" href="#/grammar/${g.code}">${esc(g.name)}</a> <span class="badge">${esc(g.grade||"")}</span>
        ${g.span? `<div class="sp">${esc(g.span)}</div>`:""}${g.exp? `<div class="ex">${tw(g.exp)}</div>`:""}</div>`).join("") : `<p class="muted">登録なし</p>`}</div>`:""}
     ${step===2? `<div class="step"><button class="primary" data-act="step">語彙を見る</button></div>`:""}
     ${step>=3? `<div class="step"><h3>語彙</h3>${notes.length||voc.length?
        notes.map(v=>`<div class="voc"><span class="badge warn">（注）</span><span class="w">${esc(v.word)}</span><span>${esc(v.ja)}</span></div>`).join("")+
        voc.map(v=>`<div class="voc"><span class="badge">重要</span><span class="w">${esc(v.word)}</span><span>${esc(v.ja)}</span><span class="muted">${esc(v.pos||"")}</span></div>`).join("")
        : `<p class="muted">登録なし</p>`}</div>
        <div class="step row"><span class="muted grow">この文は？</span>
          <button data-act="rmark" data-v="ok" class="${mark&&mark.ok?"primary":""}">わかった</button>
          <button data-act="rmark" data-v="ng" class="${mark&&!mark.ok?"primary":""}">あやしい</button></div>`:""}
   </div>
   <div class="sticky-foot"><button data-act="rprev" ${R.i===0?"disabled":""}>‹ 前の文</button><span class="grow"></span>
     ${R.i<ids.length-1? `<button class="primary" data-act="rnext">次の文 ›</button>` : `<a class="btn primary" href="#/solve/${d.id}">この大問を解く</a>`}</div>`;
  $app.dataset.dai = daiId;
}
function readMove(delta){
  const d = DAI[$app.dataset.dai]; const ids = d.parts.flatMap(partSentences); const R = RD[d.id];
  if (delta>0 && !ST.reading[ids[R.i]]) { ST.reading[ids[R.i]] = {ok:null, at:new Date().toISOString()}; save(); }
  R.i = Math.max(0, Math.min(ids.length-1, R.i+delta)); R.step = 0; R.gf = null; render(); window.scrollTo(0,0);
}

/* 文法 */
function grammarIndex(){
  const cnt = {};
  for (const s of Object.values(S)) for (const g of s.grammar){ const c=cnt[g.code]||(cnt[g.code]={s:0,q:0}); c.s++; }
  for (const q of Object.values(Q)) for (const c of new Set([q.main_grammar,...(q.grammar_codes||[])].filter(Boolean))){ (cnt[c]||(cnt[c]={s:0,q:0})).q++; }
  return cnt;
}
function grammarList(){
  setTitle("文法");
  const cnt = grammarIndex(); const acc = statBy(a=>a.codes);
  const cats = {};
  for (const [c,g] of Object.entries(GR)) if (cnt[c]) (cats[g.cat]||(cats[g.cat]=[])).push(c);
  $app.innerHTML = `<h1>文法</h1><p class="muted">文法項目ごとに、説明・本文の例文・関係する設問をまとめています。　<a href="#/terms">文法用語の意味</a></p>`+
    Object.entries(cats).map(([cat,cs])=>`<h2>${esc(cat)}</h2><div class="list">`+cs.map(c=>{
      const a = acc[c];
      return `<a class="item" href="#/grammar/${c}"><div class="main">${esc(GR[c].name)}<div class="sub">${esc(GR[c].grade||"")}・例文${cnt[c].s}・設問${cnt[c].q}</div></div>${a? `<span class="badge ${a.ok/a.n>=.7?"ok":"ng"}">${pct(a.ok,a.n)}%</span>`:""}<span>›</span></a>`;
    }).join("")+`</div>`).join("");
}
function grammarPage(code){
  const g = GR[code]; if (!g) return notFound();
  setTitle(g.name);
  const ex = Object.values(S).filter(s=>s.grammar.some(x=>x.code===code));
  const qs = qsForGrammar(code);
  $app.innerHTML = `<h1>${esc(g.name)}</h1><div class="muted">${esc(g.cat)}・${esc(g.grade||"")}</div>
   ${g.exp? `<div class="card" style="margin-top:12px">${tw(g.exp)}</div>`:""}
   ${qs.length? `<div class="row" style="margin:12px 0"><button class="primary" data-act="gpractice" data-c="${code}">関係する設問を解く（${qs.length}問）</button></div>`:""}
   <h2>本文の例文（${ex.length}）</h2>`+
   ex.slice(0,40).map(s=>{ const gg=s.grammar.find(x=>x.code===code);
     return `<div class="card"><div class="en">${enHTML(s,true,{gram:gg? [gg]:null})}</div>${gg&&gg.span? `<div class="muted">該当箇所：<span class="en">${esc(gg.span)}</span></div>`:""}
       <details><summary>和訳と補足</summary><div class="ja">${esc(s.ja)}</div>${gg&&gg.exp&&gg.exp!==g.exp? `<div class="explain">${tw(gg.exp.replace(g.exp,"").trim())}</div>`:""}</details>
       <div class="muted"><a href="#/read/${s.dai}?s=${s.id}">${esc(daiLabel(DAI[s.dai]))} で精読</a></div></div>`; }).join("");
}
function qsForGrammar(code){
  return Object.values(Q).filter(q=>q.main_grammar===code || (!q.main_grammar && (q.grammar_codes||[]).includes(code)))
    .sort((a,b)=>(a.difficulty||9)-(b.difficulty||9)).map(q=>q.id);
}

function termsPage(){
  setTitle("文法用語");
  $app.innerHTML = `<h1>文法用語</h1><p class="muted">解説に出てくる用語の意味です。解説の中の点線の用語をタップしても見られます。</p>
   <div class="list">`+Object.entries(TERMS).map(([w,m])=>`<div class="item"><div class="main"><b>${esc(w)}</b><div class="sub">${esc(m)}</div></div></div>`).join("")+`</div>`;
}

/* 語彙 */
const VZ = {kind:"注語彙", only:false, i:0, show:false, mode:"list"};
function vocabPage(){
  setTitle("語彙");
  let list = Object.values(V).filter(v=>VZ.kind==="all"||v.kind===VZ.kind);
  if (VZ.only) list = list.filter(v=>!(ST.vocab[v.id]&&ST.vocab[v.id].known));
  const known = list.filter(v=>ST.vocab[v.id]&&ST.vocab[v.id].known).length;
  let body = "";
  if (!list.length) body = `<p class="empty">該当する語はありません</p>`;
  else if (VZ.mode==="card"){
    VZ.i = Math.min(VZ.i, list.length-1); const v = list[VZ.i]; const s = S[v.s];
    body = `<div class="card flash"><div class="muted">${VZ.i+1} / ${list.length}　<span class="badge ${v.kind==="注語彙"?"warn":""}">${v.kind==="注語彙"?"（注）":"重要語彙"}</span></div>
      <div class="w">${esc(v.word)}</div>
      ${VZ.show? `<div class="m">${esc(v.ja)}</div><div class="muted">${esc(v.pos||"")}</div>${s? `<div class="en" style="margin-top:12px;font-size:1rem">${enHTML(s,true,{sv:false})}</div><div class="ja" style="text-align:left">${esc(s.ja)}</div>`:""}`
        : `<div style="margin-top:16px"><button class="primary" data-act="vshow">意味を見る</button></div>`}
      </div><div class="sticky-foot"><button data-act="vmark" data-v="0">まだ</button><span class="grow"></span><button class="primary" data-act="vmark" data-v="1">覚えた</button></div>`;
  } else {
    body = `<div class="card">`+list.map(v=>`<div class="voc"><span class="badge ${v.kind==="注語彙"?"warn":""}">${v.kind==="注語彙"?"（注）":"重要"}</span><span class="w">${esc(v.word)}</span><span class="grow">${esc(v.ja)}</span>${ST.vocab[v.id]&&ST.vocab[v.id].known?'<span class="badge ok">覚えた</span>':""}</div>`).join("")+`</div>`;
  }
  $app.innerHTML = `<h1>語彙</h1>
   <p class="muted">「（注）」は原問題に実際に載っている注、「重要語彙」は本文から選んだ学習用の語です（別々に管理しています）。</p>
   <div class="row" style="margin-bottom:12px">
     <div class="seg">${[["注語彙","（注）"],["重要語彙","重要語彙"],["all","すべて"]].map(([k,l])=>`<button data-act="vkind" data-k="${k}" class="${VZ.kind===k?"on":""}">${l}</button>`).join("")}</div>
     <div class="seg">${[["list","一覧"],["card","カード"]].map(([k,l])=>`<button data-act="vmode" data-k="${k}" class="${VZ.mode===k?"on":""}">${l}</button>`).join("")}</div>
     <label class="muted"><input type="checkbox" data-act="vonly" ${VZ.only?"checked":""}> まだの語だけ</label>
     <span class="muted">${list.length}語${known? `・覚えた ${known}`:""}</span></div>${body}`;
}

/* ランダム */
const RZ = {exam:"all", fmt:"all", ans:"all", diff:"all", n:10, only:"all"};
function randomPage(){
  setTitle("ランダム");
  const fmts = [...new Set(Object.values(Q).map(q=>q.format).filter(Boolean))].sort();
  const sel = (k, opts) => `<select data-rz="${k}">`+opts.map(([v,l])=>`<option value="${esc(v)}" ${String(RZ[k])===String(v)?"selected":""}>${esc(l)}</option>`).join("")+`</select>`;
  $app.innerHTML = `<h1>ランダム</h1><div class="card">
    <h3>年度・問題</h3>${sel("exam",[["all","すべて"],...EXAMS.map(e=>[e.id,examLabel(e.id)])])}
    <h3>問題形式</h3>${sel("fmt",[["all","すべて"],...fmts.map(f=>[f,f])])}
    <h3>解答方式</h3>${sel("ans",[["all","すべて"],["choice","選択"],["write","記述"]])}
    <h3>難易度</h3>${sel("diff",[["all","すべて"],["1","1（易しい）"],["2","2"],["3","3"],["4","4"],["5","5（難しい）"]])}
    <h3>出題する問題</h3>${sel("only",[["all","すべて"],["new","まだ解いていない問題"],["wrong","前回まちがえた問題"]])}
    <h3>問題数</h3>${sel("n",[["5","5問"],["10","10問"],["20","20問"]])}
    <div class="row" style="margin-top:16px"><button class="primary" data-act="rstart">始める</button><span class="muted" id="rcount"></span></div></div>`;
  rcount();
}
function randomPool(){
  const last = lastResult();
  return Object.values(Q).filter(q=>(RZ.exam==="all"||q.exam===RZ.exam)&&(RZ.fmt==="all"||q.format===RZ.fmt)&&(RZ.ans==="all"||q.answer===RZ.ans)
    &&(RZ.diff==="all"||String(q.difficulty)===RZ.diff)&&(RZ.only==="all"||(RZ.only==="new"? !last[q.id] : last[q.id]&&last[q.id]!=="ok")));
}
function rcount(){ const el=document.getElementById("rcount"); if (el) el.textContent = `条件に合う問題：${randomPool().length}問`; }
function lastResult(){ const m={}; for (const a of ST.attempts) if (a.retry===0 && a.mode!=="practice") m[a.qid]=a.result; return m; }

/* 学習記録 */
function statBy(keyFn){
  const m = {};
  for (const a of ST.attempts){ if (a.retry!==0 || a.mode==="practice") continue;
    for (const k of [].concat(keyFn(a)||[])){ const x=m[k]||(m[k]={n:0,ok:0,self:0,score:0,points:0}); x.n++; if (a.result==="ok"){x.ok++; if(!a.hints) x.self++;} x.score+=a.score; x.points+=a.points; } }
  return m;
}
function records(){
  setTitle("学習記録");
  const first = ST.attempts.filter(a=>a.retry===0 && a.mode!=="practice");
  if (!first.length){ $app.innerHTML = `<h1>学習記録</h1><p class="empty">まだ記録がありません。過去問を解くとここに成績が出ます。</p><div class="row"><a class="btn primary" href="#/exams">過去問へ</a></div>`; return; }
  const ok = first.filter(a=>a.result==="ok").length, self = first.filter(a=>a.result==="ok"&&!a.hints).length;
  const ms = first.reduce((s,a)=>s+Math.min(a.ms,15*60000),0);
  const tbl = (m, label, link) => `<div class="tblwrap"><table class="tbl"><tr><th>${label}</th><th class="num">正答</th><th>正答率</th><th class="num">自力</th></tr>`+
    Object.entries(m).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n).map(([k,v])=>`<tr><td>${link? link(k):esc(k)}</td><td class="num">${v.ok}/${v.n}</td><td><div class="bar"><i style="width:${pct(v.ok,v.n)}%"></i></div></td><td class="num">${pct(v.self,v.n)}%</td></tr>`).join("")+`</table></div>`;
  const byG = statBy(a=>a.codes), byF = statBy(a=>a.format), byE = statBy(a=>a.exam);
  // おすすめ：正答率の低い文法から、易しい設問を出す
  const weak = Object.entries(byG).filter(([,v])=>v.ok/v.n<0.7).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n).slice(0,3);
  const done = new Set(first.map(a=>a.dai)); const untouched = Object.values(DAI).filter(d=>!done.has(d.id)).slice(0,3);
  $app.innerHTML = `<h1>学習記録</h1>
   <div class="stat"><div><b>${first.length}</b><span>解いた設問</span></div><div><b>${pct(ok,first.length)}%</b><span>正答率</span></div>
     <div><b>${pct(self,first.length)}%</b><span>ヒントなしで正解</span></div><div><b>${fmtTime(ms)}</b><span>解答時間の合計</span></div></div>
   <h2>次にやること</h2><div class="list">`+
     weak.map(([c,v])=>`<button class="item" data-act="gpractice" data-c="${c}" style="text-align:left"><div class="main"><b>${esc(gname(c))}</b><div class="sub">正答率 ${pct(v.ok,v.n)}%。易しい設問から解き直す</div></div><span>›</span></button>`).join("")+
     untouched.map(d=>`<a class="item" href="#/solve/${d.id}"><div class="main"><b>${esc(daiLabel(d))}</b><div class="sub">まだ解いていない大問</div></div><span>›</span></a>`).join("")+
     (!weak.length&&!untouched.length? `<p class="muted">苦手な文法は見つかっていません。</p>`:"")+`</div>
   <h2>文法別</h2>${tbl(byG,"文法",k=>`<a href="#/grammar/${k}">${esc(gname(k))}</a>`)}
   <h2>問題形式別</h2>${tbl(byF,"形式")}
   <h2>年度・問題別</h2>${tbl(byE,"試験",k=>esc(examLabel(k)))}
   <h2>最近の演習</h2><div class="list">`+ST.sessions.slice(-10).reverse().map(s=>`<a class="item" href="#/result/${s.id}"><div class="main">${esc(s.title)}<div class="sub">${s.at.slice(0,16).replace("T"," ")}・${fmtTime(s.ms)}</div></div><b>${s.score}/${s.points}</b></a>`).join("")+`</div>
   <h2>記録の管理</h2><div class="row"><button data-act="export">記録を書き出す（JSON）</button><button data-act="wipe">記録を消す</button></div>
   <p class="muted">${SYNC.enabled? "記録はサーバーにも保存され、別の端末でログインしても引き継がれます。" : "記録はこのブラウザだけに保存されています。別の端末へは引き継がれません。"}</p>`;
}

function notFound(){ setTitle("見つかりません"); $app.innerHTML = `<p class="empty">ページが見つかりません。<a href="#/">ホームへ</a></p>`; }

/* ---------- ルーター ---------- */
function render(){
  YEL = {};
  route();
  paintAll();
}
function route(){
  const h = location.hash.replace(/^#\/?/,"");
  const [path, qs] = h.split("?"); const params = Object.fromEntries(new URLSearchParams(qs||""));
  const [a,b] = path.split("/");
  document.getElementById("backBtn").style.visibility = a? "visible":"hidden";
  if (SYNC.enabled && !SYNC.auth){ document.getElementById("backBtn").style.visibility = "hidden"; return loginScreen(); }
  if (a!=="class") stopClassPoll();
  if (!a) return home();
  if (a==="class") return classScreen();
  if (a==="exams") return examList();
  if (a==="exam") return lockOf(b,null)? lockedPage(lockOf(b,null), b) : examPage(b);
  if (a==="solve" || a==="practice" || a==="read"){ const d = DAI[b], lk = d && lockOf(d.exam, d.id); if (lk) return lockedPage(lk, d.exam, d); }
  if (a==="solve") return solve(b);
  if (a==="practice") return solve(b, "practice");
  if (a==="set") return solveSet();
  if (a==="result") return result(b);
  if (a==="reading") return readingList();
  if (a==="read") return read(b, params);
  if (a==="grammar") return b? grammarPage(b) : grammarList();
  if (a==="terms") return termsPage();
  if (a==="vocab") return vocabPage();
  if (a==="random") return randomPage();
  if (a==="records") return records();
  notFound();
}
let lastPath = null;
window.addEventListener("hashchange", ()=>{ const p=location.hash.split("?")[0]; if (p!==lastPath) window.scrollTo(0,0); lastPath=p; render(); });

function startSet(title, ids, kind){
  const open = ids.filter(id=>!(Q[id] && lockOf(Q[id].exam, Q[id].dai)));
  if (open.length < ids.length){
    if (!open.length){ alert("この問題は、いま利用できません（ロック中）。"); return; }
    alert("ロック中の問題 "+(ids.length-open.length)+"問 をのぞいて始めます。");
  }
  ids = open;
  if (!ids.length) { alert("問題がありません"); return; }
  newSession(kind||"mix", title, ids); go("#/set/"+SES.id);
}

/* ---------- 表示の切り替え ---------- */
function markBar(reading){
  const t = (act,on,label)=>`<button data-act="${act}" class="tg ${on?"on":""}" aria-pressed="${on}">${label}</button>`;
  return `<div class="mkbar">`+
    t("svToggle", ST.settings.sv, `<span class="legend s">主語</span><span class="legend v">動詞</span>`)+
    (reading? t("keyToggle", ST.settings.keyRead, `<span class="legend y">解答の根拠</span>`)
             : `<span class="muted"><span class="legend y">黄色</span>＝答えた設問の根拠</span>`)+
    `</div>`;
}
/* ---------- 操作 ---------- */
$app.addEventListener("input", e=>{
  const t = e.target;
  if (t.matches("textarea.ans") && SES){ SES.st[t.dataset.q].text = t.value; }
});
$app.addEventListener("change", e=>{
  const t = e.target;
  if (t.dataset.rz){ RZ[t.dataset.rz] = t.value; rcount(); }
  if (t.dataset.act==="readAll"){ ST.settings.readAll = t.checked; save(); render(); }
  if (t.dataset.act==="vonly"){ VZ.only = t.checked; VZ.i=0; VZ.show=false; render(); }
});
$app.addEventListener("click", e=>{
  const b = e.target.closest("[data-act]"); if (!b || b.tagName==="INPUT") return;
  const act = b.dataset.act, qid = b.dataset.q, q = qid && Q[qid], st = qid && SES && SES.st[qid];
  switch(act){
    case "sel": if (st && !st.last && !st.revealed){ st.sel = b.dataset.l; rerenderQ(qid); } else if (st && st.retrying){ st.sel=b.dataset.l; rerenderQ(qid);} break;
    case "submit": judge(q); break;
    case "hint": st.hints = Math.min(2, st.hints+1); rerenderQ(qid); break;
    case "reveal":
      if (!confirm("答えを見ると、この問題は0点になります。見ますか？")) break;
      st.revealed = true; if (!st.first) record(q, st, "rev", true); st.last = st.last||"rev"; rerenderQ(qid); updateInfo(); break;
    case "self": { const first = st.pendingFirst; st.pending = false; record(q, st, b.dataset.r, first); rerenderQ(qid); updateInfo(); break; }
    case "retry": st.retry++; st.last = null; st.revealed = false; st.sel = null; st.pending=false; rerenderQ(qid); break;
    case "show": {
      SES.tab = "p"; document.getElementById("pPane").classList.remove("hidden");
      if (window.innerWidth<960) document.getElementById("qPane").classList.add("hidden");
      document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on", x.dataset.t==="p"));
      document.querySelectorAll(".passage .s.hl").forEach(x=>x.classList.remove("hl"));
      let firstEl = null;
      for (const id of q.related){ const el=document.querySelector(`.passage .s[data-sid="${id}"]`); if (el){ el.classList.add("hl"); firstEl = firstEl||el; } }
      if (firstEl) firstEl.scrollIntoView({behavior:"smooth", block:"center"});
      break; }
    case "tab":
      SES.tab = b.dataset.t;
      document.getElementById("pPane").classList.toggle("hidden", SES.tab!=="p");
      document.getElementById("qPane").classList.toggle("hidden", SES.tab!=="q");
      document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on", x.dataset.t===SES.tab)); window.scrollTo(0,0); break;
    case "finish": {
      const left = SES.qids.filter(id=>!SES.st[id].first && !SES.st[id].revealed).length;
      if (left && !confirm(`まだ ${left} 問答えていません。採点して終わりますか？`)) break;
      finishSession(); break; }
    case "solveExam": { const ex = D.exams[b.dataset.e]; startSet(examLabel(ex.id)+" 通し", ex.dai.flatMap(d=>d.parts.flatMap(p=>p.questions)), "exam"); break; }
    case "retryWrong": startSet("間違えた問題をもう一度", b.dataset.ids.split(",")); break;
    case "gpractice": startSet(gname(b.dataset.c)+" の設問", qsForGrammar(b.dataset.c)); break;
    case "rstart": {
      let pool = randomPool();
      for (let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
      startSet("ランダム演習", pool.slice(0, +RZ.n).map(q=>q.id)); break; }
    case "step": RD[$app.dataset.dai].step++; render(); break;
    case "raw": RD[$app.dataset.dai].raw = !RD[$app.dataset.dai].raw; render(); break;
    case "rprev": readMove(-1); break;
    case "rnext": readMove(1); break;
    case "rmark": {
      const d = DAI[$app.dataset.dai]; const ids = d.parts.flatMap(partSentences); const id = ids[RD[d.id].i];
      ST.reading[id] = {ok: b.dataset.v==="ok", at:new Date().toISOString()}; save(); render(); break; }
    case "vkind": VZ.kind = b.dataset.k; VZ.i=0; VZ.show=false; render(); break;
    case "vmode": VZ.mode = b.dataset.k; VZ.show=false; render(); break;
    case "vshow": VZ.show = true; render(); break;
    case "vmark": {
      let list = Object.values(V).filter(v=>VZ.kind==="all"||v.kind===VZ.kind);
      if (VZ.only) list = list.filter(v=>!(ST.vocab[v.id]&&ST.vocab[v.id].known));
      const v = list[VZ.i]; if (!v) break;
      const r = ST.vocab[v.id] || {n:0}; r.n++; r.known = b.dataset.v==="1"; r.at = new Date().toISOString(); ST.vocab[v.id] = r; save();
      if (!(VZ.only && r.known)) VZ.i = (VZ.i+1) % list.length;
      VZ.show = false; render(); break; }
    case "export": {
      const blob = new Blob([JSON.stringify(ST,null,1)], {type:"application/json"});
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "学習記録_"+new Date().toISOString().slice(0,10)+".json"; a.click(); break; }
    case "wipe":
      if (confirm(SYNC.enabled? "この端末の学習記録を消します。サーバーに送信済みの記録は残ります。よろしいですか？" : "この端末の学習記録をすべて消します。元に戻せません。よろしいですか？")){ const keep={settings:ST.settings,user:ST.user,out:ST.out}; ST = blankStore(); Object.assign(ST, keep); save(); render(); } break;
    case "logout": logout(); break;
    case "importV1": { const n = importV1(); markImport("done"); alert(n+"件の記録を取り込みました。"); render(); break; }
    case "importLater": importHidden = true; render(); break;
    case "importNever": markImport("never"); render(); break;
    case "svToggle": ST.settings.sv = !ST.settings.sv; save(); if (SES && /^#\/(solve|practice|set)\//.test(location.hash)) { renderSession(); paintAll(); } else render(); break;
    case "tr": {
      const sid = b.dataset.sid;
      if (SES.trAll){ SES.trAll = false; document.querySelectorAll(".trbtn").forEach(x=>{ SES.tr[x.dataset.sid] = true; }); SES.tr[sid] = false; }
      else SES.tr[sid] = !SES.tr[sid];
      refreshTr(); break; }
    case "trAll": SES.trAll = !SES.trAll; if (!SES.trAll) SES.tr = {}; refreshTr(); break;
    case "keyToggle": ST.settings.keyRead = !ST.settings.keyRead; save(); render(); break;
    case "gfocus": {
      if (e.target.closest("a")) break;
      const R = RD[$app.dataset.dai], n = +b.dataset.n; R.gf = R.gf===n ? null : n; render(); break; }
  }
});
document.addEventListener("keydown", e=>{
  if (!location.hash.startsWith("#/read/") || e.target.matches("input,textarea,select,.term")) return;
  if (e.key==="ArrowRight") readMove(1); else if (e.key==="ArrowLeft") readMove(-1);
  else if (e.key===" "||e.key==="Enter"){ const R=RD[$app.dataset.dai]; if (R && R.step<3){ e.preventDefault(); R.step++; render(); } }
});

/* 用語の意味（タップで表示。もう一度タップか別の場所で閉じる） */
function closeTerm(){ const t=document.getElementById("termTip"); if (t) t.remove(); }
document.addEventListener("click", e=>{
  const t = e.target.closest(".term");
  const open = document.getElementById("termTip");
  if (!t){ if (open && !e.target.closest("#termTip")) closeTerm(); return; }
  e.preventDefault(); e.stopPropagation();
  const w = t.dataset.term; if (open && open.dataset.w===w){ closeTerm(); return; }
  closeTerm();
  const d = document.createElement("div"); d.id="termTip"; d.dataset.w=w; d.setAttribute("role","status");
  d.innerHTML = `<b>${esc(w)}</b>　${esc(TERMS[w]||"")}<button class="ghost" aria-label="閉じる">×</button>`;
  d.querySelector("button").addEventListener("click", closeTerm);
  document.body.appendChild(d);
}, true);
document.addEventListener("keydown", e=>{ if (e.key==="Escape") closeTerm(); if ((e.key==="Enter"||e.key===" ") && e.target.classList && e.target.classList.contains("term")){ e.preventDefault(); e.target.click(); } });
window.addEventListener("hashchange", closeTerm);

/* ---------- サーバー連携（v7） ---------- */
const num0 = v => (v==null || v==="" || !Number.isFinite(Number(v))) ? null : Number(v);
function toServerAttempt(a){
  const q = Q[a.qid] || {};
  return {client_uuid:a.cu, exam_id:a.exam||q.exam, section_id:a.dai||q.dai, question_id:a.qid, qtype:a.format?String(a.format).slice(0,40):null,
    grammar_codes:a.codes||[], skill_tags:[], mode:a.mode==="practice"?"practice":"solve",
    answer:a.answer==null?null:String(a.answer).slice(0,1000), is_correct:a.result==="ok", first_correct:a.retry===0 ? a.result==="ok" : null,
    score:num0(a.score), max_score:num0(a.points), self_grade:a.result?String(a.result).slice(0,10):null,
    elapsed_ms:num0(a.ms)==null?null:Math.min(Math.max(Math.round(a.ms),0),2000000000), hints_used:num0(a.hints)||0,
    revealed:!!a.revealed, retry_count:num0(a.retry)||0, answered_at:a.at};
}
const cloud = ()=> SYNC.enabled && !!SYNC.auth;
function queueAttempt(a){ if (!cloud()) return; ST.out.a.push(toServerAttempt(a)); save(); flushSoon(); }
function queueView(sid){ if (!cloud() || !S[sid]) return; ST.out.v.push({client_uuid:SYNC.uuid(), exam_id:S[sid].exam, sentence_id:sid, mode:"practice", viewed_at:new Date().toISOString()}); save(); flushSoon(); }
function queueEvent(type, ref){ if (!cloud()) return; ST.out.e.push({client_uuid:SYNC.uuid(), type, ref_id:ref?String(ref).slice(0,60):null, at:new Date().toISOString()}); save(); flushSoon(); }
const pending = ()=> ST.out.a.length + ST.out.v.length + ST.out.e.length;
let flushTimer = null, flushing = false;
function flushSoon(){ clearTimeout(flushTimer); flushTimer = setTimeout(flush, 1500); }
async function flush(){
  if (!cloud() || flushing || !pending()) return;
  flushing = true;
  try {
    for (let guard=0; guard<60 && pending() && cloud(); guard++){
      const o = ST.out, a = o.a.slice(0,200), v = o.v.slice(0,50), e = o.e.slice(0,100);
      const r = await SYNC.api({action:"submitBatch", token:SYNC.auth.token, attempts:a, views:v, events:e});
      if (r.result==="success"){ o.a.splice(0,a.length); o.v.splice(0,v.length); o.e.splice(0,e.length); save(); setLocks(r.locks); if (r.saved && r.saved.locked>0) toast("ロック中のため、一部の記録は保存されませんでした。"); }
      else if (r.message==="invalid_token"){ flushing=false; logout("ログインの有効期限が切れました。もう一度ログインしてください。"); return; }
      else if (r.message==="bad_item" || r.message==="bad_size"){ // 送れない記録が詰まらないよう、別に退避する
        ST.dead = (ST.dead||[]).concat({a,v,e,at:new Date().toISOString()}).slice(-20);
        o.a.splice(0,a.length); o.v.splice(0,v.length); o.e.splice(0,e.length); save();
      } else break; // 通信できないなど。あとで再送する
    }
  } finally { flushing = false; }
  const el = document.getElementById("pendingN"); if (el) el.textContent = pending()? "未送信 "+pending()+"件" : "送信済み";
}
async function restoreFromServer(){
  const r = await SYNC.api({action:"loadAttempts", token:SYNC.auth.token});
  if (r.result!=="success") return;
  const have = new Set(ST.attempts.map(a=>a.cu).filter(Boolean));
  for (const x of r.attempts){
    if (have.has(x.client_uuid) || !Q[x.question_id]) continue;
    ST.attempts.push({ses:"server", kind:"server", qid:x.question_id, exam:x.exam_id, dai:x.section_id, format:x.qtype||Q[x.question_id].format, codes:qCodes(Q[x.question_id]),
      answer:x.answer, result:x.self_grade || (x.is_correct?"ok":"ng"), score:x.score||0, points:x.max_score||Q[x.question_id].points, hints:x.hints_used||0,
      revealed:!!x.revealed, retry:x.retry_count||0, mode:x.mode==="practice"?"practice":"exam", ms:x.elapsed_ms||0, at:x.answered_at, user:ST.user.id, cu:x.client_uuid});
  }
  save(); render();
}
function logout(msg){
  SYNC.setAuth(null); SES = null; const s = ST.settings; loadStore(s); applySettings();
  loginMsg = msg || ""; render();
}

/* ---------- 授業(生徒): 校舎の授業が始まっていれば、ログイン後に自動で参加する。更新は15秒ごと ---------- */
const CL = {st:null, timer:null, sig:"", sigItem:"", err:"", msg:"", draft:{}, busy:false, pick:{}, showPass:true};
async function classFetch(){
  if (!cloud()) return null;
  const r = await SYNC.api({action:"classState", token:SYNC.auth.token});
  if (r.result==="success"){ CL.st = r; CL.err = ""; return r; }
  if (r.message==="invalid_token"){ logout("ログインの有効期限が切れました。もう一度ログインしてください。"); return null; }
  CL.err = r.message==="network" ? "通信できません。電波を確認してください。" : "授業の状態を取得できませんでした。";
  return null;
}
async function classAutoJoin(){
  const h = location.hash.replace(/^#\/?/,"");
  if (h && !h.startsWith("?")) return; // 別の画面を開いているときは、勝手に切り替えない
  const r = await classFetch();
  if (r && r.session && !location.hash.startsWith("#/class")) go("#/class");
}
function stopClassPoll(){ clearTimeout(CL.timer); CL.timer = null; }
function classPoll(){
  stopClassPoll();
  CL.timer = setTimeout(async ()=>{
    if (!location.hash.startsWith("#/class")) return;
    if (document.visibilityState==="visible"){ await classFetch(); renderClass(); }
    classPoll();
  }, 15000);
}
document.addEventListener("visibilitychange", async ()=>{
  if (document.visibilityState==="visible" && location.hash.startsWith("#/class") && cloud()){ await classFetch(); renderClass(); }
});
function classScreen(){
  setTitle("授業");
  CL.sig = ""; CL.sigItem = "";
  if (!CL.st) $app.innerHTML = `<h1>授業</h1><p class="muted">確認しています…</p>`;
  else renderClass(true);
  classFetch().then(()=>renderClass(true));
  classPoll();
}
function classRefresh(){ CL.msg = ""; return classFetch().then(()=>renderClass(true)); }
function renderClass(force){
  if (!location.hash.startsWith("#/class") || !cloud()) return;
  const r = CL.st, it = r && r.item, ss = r && r.session;
  const sig = JSON.stringify([ss&&ss.id, it&&it.id, it&&it.state, it&&it.myAnswer, it&&it.reveal&&it.reveal.answered, it&&it.myScore, it&&it.myComment, it&&it.questionId, CL.showPass, it&&it.id&&CL.pick[it.id], CL.err, CL.msg]);
  const ta = document.getElementById("clText");
  if (!force){
    if (sig===CL.sig) return;
    if (ta && document.activeElement===ta && it && CL.sigItem===it.id+":"+it.state) return; // 入力中は作り直さない
  }
  CL.sig = sig; CL.sigItem = it ? it.id+":"+it.state : "";
  const head = `<h1>授業</h1>${CL.err? `<p class="msg" role="alert">${esc(CL.err)}</p>`:""}`;
  const refresh = `<div class="row"><button data-act="classRefresh">表示を更新</button></div>`;
  if (!r){ $app.innerHTML = head + `<p class="muted">確認しています…</p>`; return; }
  if (!ss){ $app.innerHTML = head + `<p>いま、授業は行われていません。</p><p class="muted">授業が始まると、この画面に問題が出ます。このまま開いておいてください（15秒ごとに自動で確認します）。</p>${refresh}`; return; }
  if (!it){ $app.innerHTML = head + `<p>授業に参加しています。</p><p class="muted">先生が問題を出すまで、お待ちください。</p>${refresh}`; return; }
  const p = it.pub || {}, open = it.state==="open", mine = it.myAnswer;
  let h = head + `<div class="card"><div class="muted">第${it.seq}問${p.format? "・"+esc(p.format):""}・${it.points}点</div>`;
  if (p.stem_ja) h += `<p>${esc(p.stem_ja)}</p>`;
  if (p.stem_en) h += `<p class="clen">${esc(p.stem_en)}</p>`;
  if (p.frame) h += `<div class="frame">${esc(p.frame)}</div>`;
  if ((p.items||[]).length) h += `<ul class="clitems">${p.items.map(i=>`<li><b>${esc(i.label)}</b> ${esc(i.text)}</li>`).join("")}</ul>`;
  if (p.words && (it.kind==="text" || it.kind==="essay")) h += `<p class="muted">（${esc(p.words)}語ぐらいで書く）</p>`;
  if (it.kind==="essay" && (p.conditions||[]).length) h += `<ul class="clitems">${p.conditions.map(c=>`<li>${esc(c)}</li>`).join("")}</ul>`;
  if (it.kind==="choice"){
    h += `<div class="clchoices">` + (p.choices||[]).map(([l,t])=>{
      const on = mine===l, rv = it.reveal, good = rv && (rv.correct||[]).includes(l);
      const cls = "cbtn"+(on?" on":"")+(rv? (good?" good": on?" bad":""):"");
      const body = `<b>${esc(l)}</b>${t && t!==l? " "+esc(t):""}`;
      const dist = rv && rv.dist ? `<span class="cdist">${rv.dist[l]||0}人</span>` : "";
      return open? `<button class="${cls}" data-act="classChoice" data-l="${esc(l)}">${body}</button>` : `<div class="${cls}">${body}${dist}</div>`;
    }).join("") + `</div>`;
  } else if (it.kind==="order"){
    const tiles = p.tiles||[], pk = CL.pick[it.id]||[];
    const used = new Set(pk);
    const sent = pk.map(i=>tiles[i]).join(" ");
    if (open){
      h += `<div class="clslot">${pk.length? pk.map(i=>`<button class="otile on" data-act="classUnpick" data-i="${i}">${esc(tiles[i])}</button>`).join("") : '<span class="muted">下の語をタップして、正しい順に並べます</span>'}</div>
        <div class="cltiles">${tiles.map((t,i)=>`<button class="otile" data-act="classPick" data-i="${i}" ${used.has(i)?"disabled":""}>${esc(t)}</button>`).join("")}</div>
        <div class="row"><button data-act="classClear" ${pk.length?"":"disabled"}>やり直す</button><button class="primary" data-act="classSendOrder" ${pk.length===tiles.length?"":"disabled"}>この順で回答する</button></div>`;
    } else h += `<p>あなたの答え：<b>${mine? esc(mine):"（未回答）"}</b></p>`;
  } else if (open){
    const val = CL.draft[it.id]!==undefined ? CL.draft[it.id] : (mine||"");
    h += `<textarea id="clText" class="ans" rows="${it.kind==="essay"? 5:2}" maxlength="${it.kind==="essay"? 800:300}" placeholder="英語で答えを書く" autocapitalize="off" autocomplete="off" spellcheck="false">${esc(val)}</textarea>
      <div class="row"><button class="primary" data-act="classSend">この答えで回答する</button></div>`;
  } else {
    h += `<p>あなたの答え：<b>${mine? esc(mine):"（未回答）"}</b></p>`;
  }
  h += `</div>`;
  // 本文（長文の問題）：学習アプリの精読と同じ表示。答えの根拠の黄色は、正解の公開後だけ
  const qd = it.questionId && Q[it.questionId], part = qd && qd.partObj;
  const hasPass = !!(part && part.passages.some(p=>p.genre!=="item_set" && p.sentences.length));
  let passH = "";
  if (hasPass){
    setYellow(it.state==="revealed" ? [it.questionId] : []);
    passH = `<div class="row" style="margin:10px 0 6px"><button data-act="classPass">${CL.showPass? "本文を隠す":"本文を見る"}</button></div>`;
    if (CL.showPass) passH += passageHTML(DAI[qd.dai], part, {});
  }
  if (open) h += `<p class="${mine?"clok":"muted"}">${mine? "✅ 回答しました："+esc(mine)+"（締め切りまで、変更できます）" : "まだ回答していません。"}</p>${CL.msg? `<p class="muted">${esc(CL.msg)}</p>`:""}`;
  else if (it.state==="closed") h += `<p>締め切りました。正解の発表をお待ちください。</p>`;
  else if (it.reveal){
    const rv = it.reveal;
    if (it.kind==="essay"){
      const graded = it.myStatus==="teacher";
      h += `<div class="card"><p class="clres ${graded? (it.myCorrect? "good":"") : ""}">${mine? (graded? "採点結果："+it.myScore+"/"+it.points+"点" : "採点をお待ちください（あとで、この画面か学習状況で確認できます）") : "未回答"}</p>
        ${it.myComment? `<p>先生のコメント：${esc(it.myComment)}</p>`:""}
        ${(rv.models||[]).length? `<p>解答例：<b>${rv.models.map(esc).join(" / ")}</b></p>`:""}
        ${rv.explanation? `<p>${esc(rv.explanation)}</p>`:""}</div>`;
    } else
    h += `<div class="card"><p class="clres ${it.myCorrect? "good":"bad"}">${mine? (it.myCorrect? "○ 正解です" : "× 残念、不正解") : "未回答"}${it.myScore!=null? `　${it.myScore}/${it.points}点`:""}</p>
      <p>正解：<b>${it.kind==="choice"? esc((rv.correct||[]).join("・")) + (rv.correctText && rv.correctText!==(rv.correct||[])[0]? "　"+esc(rv.correctText):"") : esc(rv.correctText||"")}</b></p>
      ${(rv.variants||[]).length? `<p class="muted">別解：${rv.variants.map(esc).join(" / ")}</p>`:""}
      ${rv.explanation? `<p>${esc(rv.explanation)}</p>`:""}
      <p class="muted">クラス：${rv.answered}人が回答、${rv.right}人が正解</p></div>`;
  }
  $app.innerHTML = h + passH + refresh;
  if (hasPass && CL.showPass) paintAll();
}
$app.addEventListener("input", e=>{ if (e.target.id==="clText" && CL.st && CL.st.item) CL.draft[CL.st.item.id] = e.target.value; });
$app.addEventListener("click", e=>{
  const b = e.target.closest("[data-act^='class']"); if (!b) return;
  const act = b.dataset.act;
  if (act==="classRefresh") classRefresh();
  else if (act==="classPass"){ CL.showPass = !CL.showPass; renderClass(true); }
  else if (act==="classChoice") classSubmit(b.dataset.l);
  else if (act==="classPick" || act==="classUnpick" || act==="classClear" || act==="classSendOrder"){
    const it = CL.st && CL.st.item; if (!it || it.state!=="open") return;
    const pk = CL.pick[it.id] = CL.pick[it.id]||[], tiles = (it.pub||{}).tiles||[];
    if (act==="classPick"){ const i = +b.dataset.i; if (!pk.includes(i)) pk.push(i); }
    else if (act==="classUnpick"){ const i = pk.indexOf(+b.dataset.i); if (i>=0) pk.splice(i,1); }
    else if (act==="classClear") pk.length = 0;
    else if (pk.length===tiles.length){ classSubmit(pk.map(i=>tiles[i]).join(" ")); return; }
    renderClass(true);
  }
  else if (act==="classSend"){ const ta = document.getElementById("clText"); const v = ta? ta.value.trim() : ""; if (!v){ CL.msg = "答えを書いてください。"; renderClass(true); return; } classSubmit(v); }
});
async function classSubmit(ans){
  const it = CL.st && CL.st.item; if (!it || it.state!=="open" || CL.busy) return;
  CL.busy = true; CL.msg = "送信しています…"; renderClass(true);
  const r = await SYNC.api({action:"classAnswer", token:SYNC.auth.token, itemId:it.id, answer:ans});
  CL.busy = false;
  if (r.result==="success"){ it.myAnswer = r.myAnswer; CL.msg = ""; delete CL.draft[it.id]; }
  else if (r.message==="closed"){ CL.msg = "締め切られました。"; await classFetch(); }
  else if (r.message==="invalid_token"){ logout("ログインの有効期限が切れました。もう一度ログインしてください。"); return; }
  else CL.msg = r.message==="network" ? "通信できませんでした。もう一度押してください。" : "送信できませんでした。もう一度お試しください。";
  renderClass(true);
}

// ---- 校舎ごとのロック(サーバーが判定。ここは表示用) ----
function locksNow(){ const a = SYNC.auth; if (!a || !Array.isArray(a.locks)) return []; const now = Date.now(); return a.locks.filter(l=>new Date(l.until).getTime() > now); }
function lockOf(exam, dai){ return locksNow().find(l=>(!l.examId || l.examId===exam) && (!l.sectionId || l.sectionId===dai)) || null; }
function untilText(l){ return new Date(l.until).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"}); }
function setLocks(ls, repaint){
  if (!SYNC.auth || !Array.isArray(ls)) return;
  if (JSON.stringify(ls) === JSON.stringify(SYNC.auth.locks||[])) return;
  SYNC.setAuth(Object.assign({}, SYNC.auth, {locks:ls}));
  if (repaint && !/^#\/(solve|practice|set)\b/.test(location.hash)) render(); // 解答中は画面を作り直さない
}
function lockedPage(lk, exam, dai){
  setTitle("ロック中");
  const what = dai? daiLabel(dai) : lk.sectionId? "この大問" : lk.examId? examLabel(lk.examId) : "この問題";
  $app.innerHTML = `<h1>🔒 いまは利用できません</h1><p>${esc(what)}は、<b>${esc(untilText(lk))}</b>まで利用できません。</p>${lk.note? `<p class="muted">${esc(lk.note)}</p>`:""}
    <div class="row"><a class="btn primary" href="#/exams">過去問の一覧へ</a><a class="btn" href="#/">ホームへ</a></div>`;
}
function toast(t){
  const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.append(d);
  setTimeout(()=>d.remove(), 9000);
}
let loginMsg = "", importHidden = false;
const LOGIN_ERR = {bad_login:"生徒番号または合言葉が違います。", too_many_attempts:"失敗が続いたため、しばらく使えません。時間をおくか、先生に連絡してください。", network:"通信できません。電波の良い場所でやり直してください。"};
function loginScreen(){
  setTitle("ログイン");
  $app.innerHTML = `<h1>ログイン</h1><p class="muted">生徒番号と合言葉を入力してください。</p>
   <form id="loginForm" class="loginform" autocomplete="on">
    <label>生徒番号<input id="lgNum" name="username" inputmode="numeric" autocomplete="username" maxlength="6" required></label>
    <label>合言葉<input id="lgPw" name="password" type="password" inputmode="numeric" autocomplete="current-password" maxlength="64" required></label>
    <p class="msg" id="lgMsg" role="alert">${esc(loginMsg)}</p>
    <button class="primary" type="submit" id="lgBtn">ログイン</button>
   </form>`;
}
$app.addEventListener("submit", async e=>{
  if (e.target.id!=="loginForm") return;
  e.preventDefault();
  const num = document.getElementById("lgNum").value.trim(), pw = document.getElementById("lgPw").value, btn = document.getElementById("lgBtn"), msg = document.getElementById("lgMsg");
  if (!/^[1-8][0-9]{5}$/.test(num) || pw.length<4){ msg.textContent = "生徒番号（6桁）と合言葉を入力してください。"; return; }
  btn.disabled = true; msg.textContent = "確認しています…";
  const r = await SYNC.api({action:"login", number:num, passcode:pw});
  if (r.result==="success"){
    const prev = ST.settings; SYNC.setAuth({token:r.token, student:r.student, locks:r.locks||[]}); loadStore(prev); applySettings(); SES = null; loginMsg = "";
    render(); flush(); if (!ST.attempts.length && !legacyCount()) restoreFromServer(); classAutoJoin();
  } else { msg.textContent = LOGIN_ERR[r.message] || "ログインできませんでした。"; btn.disabled = false; }
});
function accountHTML(){
  if (!cloud()) return "";
  const st = SYNC.auth.student, n = legacyCount();
  return (n && !importHidden ? `<div class="banner"><b>この端末に、以前の記録が${n}件あります。</b><div class="muted">取り込むと、ログイン中の生徒の記録としてサーバーにも保存されます。別の人の記録なら取り込まないでください。</div><div class="row"><button class="primary" data-act="importV1">取り込む</button><button data-act="importLater">あとで</button><button data-act="importNever">取り込まない</button></div></div>` : "")+
    `<div class="acct"><span>${esc(st.name)}（${esc(st.number)}・${esc(st.campusName||"")}）</span><span class="muted" id="pendingN">${pending()? "未送信 "+pending()+"件" : "送信済み"}</span><button data-act="logout">ログアウト</button></div>`;
}
// v6 の記録の取り込み
function importState(){ try { return JSON.parse(localStorage.getItem("osaka-eng-v1-import")) || {done:[],never:[]}; } catch(e){ return {done:[],never:[]}; } }
function markImport(kind){ const s = importState(); s[kind] = (s[kind]||[]).concat(SYNC.auth.student.number); try { localStorage.setItem("osaka-eng-v1-import", JSON.stringify(s)); } catch(e){} }
function legacyCount(){
  if (!cloud()) return 0;
  const s = importState(), me = SYNC.auth.student.number;
  if ((s.done||[]).includes(me) || (s.never||[]).includes(me)) return 0;
  try { const old = JSON.parse(localStorage.getItem(LEGACY_KEY)); return old && old.attempts ? old.attempts.filter(a=>Q[a.qid]).length : 0; } catch(e){ return 0; }
}
function importV1(){
  let old; try { old = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch(e){}
  if (!old) return 0;
  const have = new Set(ST.attempts.map(a=>a.cu).filter(Boolean)); let n = 0;
  for (const a0 of old.attempts||[]){
    const q = Q[a0.qid]; if (!q || isNaN(+new Date(a0.at))) continue;
    const a = Object.assign({}, a0, {exam:a0.exam||q.exam, dai:a0.dai||q.dai, user:ST.user.id});
    a.cu = SYNC.detUuid([old.user&&old.user.id, a0.ses, a0.qid, a0.retry, a0.at].join("|"));
    if (have.has(a.cu)) continue;
    have.add(a.cu); ST.attempts.push(a); ST.out.a.push(toServerAttempt(a)); n++;
  }
  if (!ST.sessions.length) ST.sessions = old.sessions || [];
  ST.reading = Object.assign({}, old.reading||{}, ST.reading); ST.vocab = Object.assign({}, old.vocab||{}, ST.vocab);
  save(); flushSoon(); return n;
}
if (SYNC.enabled){
  setInterval(flush, 60000);
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="hidden") flush(); });
  if (SYNC.auth){
    flush(); classAutoJoin();
    SYNC.api({action:"me", token:SYNC.auth.token}).then(r=>{ if (r.result==="error" && r.message==="invalid_token") logout("ログインの有効期限が切れました。もう一度ログインしてください。"); else if (r.result==="success") setLocks(r.locks, true); });
  }
}

render();
})();
