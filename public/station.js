scanInput.addEventListener('keydown',e=>{if(e.key==='Enter')loadOrder();});
async function loadOrder(){
 const code=scanInput.value.trim();
 const r=await fetch('/api/order/'+encodeURIComponent(code));
 if(!r.ok){orderPanel.innerHTML='<div class="error">Order not found. Import Ready For Production first.</div>';return;}
 const o=await r.json();
 orderPanel.innerHTML=`<h2>Order #${o.orderNumber} ${o.rush?'<span class="rush">RUSH</span>':''}</h2><p class="muted">${o.customer} • ${o.store} • ${o.productionStatus}</p>`+
 o.items.map(i=>`<div class="item"><div class="art"><img src="${i.artworkUrl}"></div><div><h3>${i.location} Print <span class="pill">${i.status}</span></h3><p>${i.title}</p><p>${i.garment} • ${i.color} • ${i.size} • Qty ${i.qty}</p><p class="muted">${i.path} • Pretreat: ${i.pretreat} • ${i.cure}</p><p class="muted">SKU: ${i.sku}</p><button onclick="sendPrint('${o.barcode}','${i.id}')">Send to Graphics Lab</button><button class="ok" onclick="markStatus('${o.barcode}','${i.id}','printed')">Mark Printed</button></div></div>`).join('');
}
async function sendPrint(barcode,itemId){
 const r=await fetch('/api/print-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({barcode,itemId,printer:'Printer 1'})});
 const d=await r.json(); activity.innerHTML=r.ok?'<div class="success">✓ '+d.message+'</div>':'<div class="error">'+d.error+'</div>';
}
async function markStatus(barcode,itemId,status){
 const r=await fetch('/api/items/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({barcode,itemId,status})});
 const d=await r.json(); activity.innerHTML=r.ok?'<div class="success">✓ Marked '+status+'</div>':'<div class="error">'+d.error+'</div>'; loadOrder();
}