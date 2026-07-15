import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";

const app=express();
const PORT=process.env.PORT||3000;
const ROOT=process.cwd();
const BASE="https://ssapi.shipstation.com";
const USE_MOCK=String(process.env.USE_MOCK_DATA||"false").toLowerCase()==="true";
const WRITE_ENABLED=String(process.env.SHIPSTATION_WRITE_ENABLED||"false").toLowerCase()==="true";
const READY_TAG_NAME=process.env.SHIPSTATION_READY_TAG||"Ready For Production";
const ORDER_STATUS=process.env.SHIPSTATION_ORDER_STATUS||"awaiting_shipment";
const ENV_STORE_IDS=(process.env.SHIPSTATION_ENABLED_STORE_IDS||"").split(",").map(x=>x.trim()).filter(Boolean).map(Number);

let enabledStoreIds=new Set(ENV_STORE_IDS);
let shadowImports=[];
let pieces=[];
let pieceCounter=14540600;

app.use(express.json());
app.use(express.static("public"));

function mock(){return JSON.parse(fs.readFileSync(path.join(ROOT,"mock-data.json"),"utf8"))}
function authHeader(){
 const key=process.env.SHIPSTATION_API_KEY||"";
 const secret=process.env.SHIPSTATION_API_SECRET||"";
 return "Basic "+Buffer.from(`${key}:${secret}`).toString("base64");
}
async function ssGet(endpoint){
 const r=await fetch(BASE+endpoint,{headers:{Authorization:authHeader(),Accept:"application/json"}});
 const text=await r.text();
 let data;try{data=JSON.parse(text)}catch{data={raw:text}}
 if(!r.ok)throw new Error(`ShipStation ${r.status}: ${JSON.stringify(data).slice(0,500)}`);
 return data;
}
function option(item,name){
 const found=(item.options||[]).find(o=>String(o.name||"").trim().toLowerCase()===name.toLowerCase());
 return found?.value||"";
}
function normalizeOrder(o,stores){
 const store=stores.find(s=>Number(s.storeId)===Number(o.advancedOptions?.storeId||o.storeId));
 return {
  orderId:o.orderId,
  orderNumber:o.orderNumber,
  storeId:Number(o.advancedOptions?.storeId||o.storeId),
  storeName:store?.storeName||`Store ${o.advancedOptions?.storeId||o.storeId}`,
  orderDate:o.orderDate,
  customField1:o.advancedOptions?.customField1||"",
  rush:String(o.advancedOptions?.customField1||"").toLowerCase().includes("skip the line"),
  items:(o.items||[]).map(i=>({
    orderItemId:i.orderItemId,sku:i.sku||"",name:i.name||"",quantity:Number(i.quantity||1),
    backendProductInfo:option(i,"Backend Product Info"),
    garment:option(i,"Type of Garment"),
    color:option(i,"Color"),
    size:option(i,"Size")
  }))
 };
}
async function stores(){
 if(USE_MOCK)return mock().stores;
 const d=await ssGet("/stores");
 return Array.isArray(d)?d:d.stores||[];
}
async function tags(){
 if(USE_MOCK)return [{tagId:1,name:READY_TAG_NAME}];
 const d=await ssGet("/accounts/listtags");
 return Array.isArray(d)?d:d.tags||[];
}
async function readyOrders(){
 const ssStores=await stores();
 if(USE_MOCK)return mock().orders.map(o=>normalizeOrder(o,ssStores));
 const allTags=await tags();
 const tag=allTags.find(t=>String(t.name).trim().toLowerCase()===READY_TAG_NAME.toLowerCase());
 if(!tag)throw new Error(`ShipStation tag not found: ${READY_TAG_NAME}`);
 let page=1,orders=[];
 while(true){
   const d=await ssGet(`/orders/listbytag?orderStatus=${encodeURIComponent(ORDER_STATUS)}&tagId=${tag.tagId}&page=${page}&pageSize=500`);
   const pageOrders=d.orders||[];
   orders.push(...pageOrders);
   if(page>=Number(d.pages||1))break;
   page++;
 }
 return orders.map(o=>normalizeOrder(o,ssStores));
}
function createPieces(order){
 const made=[];
 for(const item of order.items){
  for(let unit=1;unit<=item.quantity;unit++){
   made.push({
    pieceId:String(++pieceCounter),orderNumber:order.orderNumber,orderId:order.orderId,
    storeId:order.storeId,storeName:order.storeName,rush:order.rush,
    customField1:order.customField1,unitNumber:unit,unitCount:item.quantity,
    sku:item.sku,title:item.name,backendProductInfo:item.backendProductInfo,
    garment:item.garment,color:item.color,size:item.size,status:"shadow_created"
   });
  }
 }
 return made;
}

app.get("/api/status",(req,res)=>res.json({
 mode:"SHADOW",writeEnabled:WRITE_ENABLED,useMockData:USE_MOCK,
 message:"ShipStation is read-only. Linx remains in control."
}));

app.get("/api/stores",async(req,res)=>{
 try{
  const rows=await stores();
  res.json(rows.map(s=>({...s,enabled:enabledStoreIds.has(Number(s.storeId))})));
 }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/stores/enabled",(req,res)=>{
 const ids=(req.body?.storeIds||[]).map(Number);
 enabledStoreIds=new Set(ids);
 res.json({success:true,storeIds:[...enabledStoreIds],warning:"Selection is held by this running service. Add IDs to SHIPSTATION_ENABLED_STORE_IDS in Railway for permanent configuration."});
});

app.get("/api/preview",async(req,res)=>{
 try{
  const all=await readyOrders();
  const included=all.filter(o=>enabledStoreIds.has(Number(o.storeId)));
  const excluded=all.filter(o=>!enabledStoreIds.has(Number(o.storeId)));
  res.json({total:all.length,included,excluded,enabledStoreIds:[...enabledStoreIds]});
 }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/shadow-import",async(req,res)=>{
 try{
  const all=await readyOrders();
  const included=all.filter(o=>enabledStoreIds.has(Number(o.storeId)));
  let newOrders=0,newPieces=0;
  for(const order of included){
   if(shadowImports.some(x=>x.orderId===order.orderId))continue;
   shadowImports.push({...order,importedAt:new Date().toISOString(),mode:"shadow"});
   const made=createPieces(order);pieces.push(...made);
   newOrders++;newPieces+=made.length;
  }
  res.json({success:true,message:`Shadow imported ${newOrders} orders and created ${newPieces} pieces. No ShipStation data was changed.`});
 }catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/shadow-orders",(req,res)=>res.json(shadowImports));
app.get("/api/pieces",(req,res)=>res.json(pieces));

app.listen(PORT,()=>console.log(`ProductionOS Shadow Mode running on ${PORT}`));
