/* 学習アプリ v7: サーバー連携の部品（通信・ログイン情報・ID）。config.js が空なら無効。 */
(function(){
"use strict";
const CFG = window.OSAKA_CONFIG || {};
const AUTH_KEY = "osaka-eng-auth";
const S = { enabled: !!(CFG.apiUrl && CFG.apiKey), auth: null };
try { S.auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch(e){}
if (S.auth && !(S.auth.token && S.auth.student && S.auth.student.number)) S.auth = null;
S.setAuth = a => { S.auth = a; try { a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY); } catch(e){} };
S.api = async function(body){
  const ac = new AbortController(), tm = setTimeout(()=>ac.abort(), 12000);
  try {
    const r = await fetch(CFG.apiUrl, {method:"POST", headers:{"Content-Type":"application/json", apikey:CFG.apiKey, Authorization:"Bearer "+CFG.apiKey}, body:JSON.stringify(body), signal:ac.signal});
    clearTimeout(tm);
    if (r.status >= 500) return {result:"error", message:"network"};
    return await r.json();
  } catch(e){ clearTimeout(tm); return {result:"error", message:"network"}; }
};
S.uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{ const r = Math.random()*16|0; return (c==="x"? r : (r&3|8)).toString(16); });
// 同じ入力からいつも同じIDを作る（v6 の記録を取り込むとき、2回送っても二重にならない）
function cyrb128(str){
  let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762;
  for (let i=0,k;i<str.length;i++){ k=str.charCodeAt(i); h1=h2^Math.imul(h1^k,597399067); h2=h3^Math.imul(h2^k,2869860233); h3=h4^Math.imul(h3^k,951274213); h4=h1^Math.imul(h4^k,2716044179); }
  h1=Math.imul(h3^(h1>>>18),597399067); h2=Math.imul(h4^(h2>>>22),2869860233); h3=Math.imul(h1^(h3>>>17),951274213); h4=Math.imul(h2^(h4>>>19),2716044179);
  h1^=(h2^h3^h4); h2^=h1; h3^=h1; h4^=h1;
  return [h1>>>0,h2>>>0,h3>>>0,h4>>>0];
}
S.detUuid = str => {
  const hx = cyrb128(String(str)).map(n=>n.toString(16).padStart(8,"0")).join("");
  return hx.slice(0,8)+"-"+hx.slice(8,12)+"-4"+hx.slice(13,16)+"-"+"89ab"[parseInt(hx[16],16)&3]+hx.slice(17,20)+"-"+hx.slice(20,32);
};
window.OSAKA_SYNC = S;
})();
