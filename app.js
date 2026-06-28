// Shared app utilities: websocket helper and basic log
let ws=null;
function wsConnect(url, onOpen, onMessage, onClose){
  if(ws){ try{ ws.close(); }catch(e){} ws=null }
  ws=new WebSocket(url);
  ws.onopen = ()=>{ onOpen && onOpen(); };
  ws.onmessage = (m)=>{ onMessage && onMessage(m.data); };
  ws.onclose = ()=>{ onClose && onClose(); };
  ws.onerror = ()=>{ console.warn('WS error'); };
}

function wsSend(obj){ if(!ws||ws.readyState!==WebSocket.OPEN) return false; ws.send(JSON.stringify(obj)); return true }

function log(id,msg){ const el=document.getElementById(id); if(!el) return; const now=new Date().toLocaleTimeString(); const div=document.createElement('div'); div.textContent=`[${now}] ${msg}`; el.appendChild(div); el.scrollTop = el.scrollHeight; }
