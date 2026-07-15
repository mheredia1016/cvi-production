import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";

const app=express();
const PORT=process.env.PORT||3000;
const ROOT=process.cwd();
const USE_MOCK=String(process.env.USE_MOCK_DATA||"true").toLowerCase()==="true";
const SOURCE_TAG=process.env.SHIPSTATION_SOURCE_TAG||"In Production";
const WRITE_ENABLED=String(process.env.SHIPSTATION_WRITE_ENABLED||"false").toLowerCase()==="true";
const BASE="https://ssapi.shipstation.com";
const TYPES=["White Ink, Back","DTG Light, Back","White Ink","DTG Light","EPT","Embroidery To Order","Embroidery","Poster/Sticker","Sublimation","Pre-Stock","DTF"];

let enabledStoreIds=new Set((process.env.SHIPSTATION_ENABLED_STORE_IDS||"101").split(",").map(x=>Number(x.trim())).filter(Boolean));
let importedOrders=[];
let pieces=[];
let pieceCounter=14540600;
let printHistory=[];

app.use(express.json());
app.use(express.static("public"));

const mock=()=>JSON.parse(fs.readFileSync(path.join(ROOT,"mock-data.json"),"utf8"));
const auth=()=> "Basic "+Buffer.from(`${process.env.SHIPSTATION_API_KEY||""}:${process.env.SHIPSTATION_API_SECRET||""}`).toString("base64");

async function ssGet(endpoint){
 const r=await fetch(BASE+endpoint,{headers:{Authorization:auth(),Accept:"application/json"}});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text}}
 if(!r.ok)throw new Error(`ShipStation ${r.status}: ${JSON.stringify(data).slice(0,400)}`);
 return data;
}
function option(item,name){
 return (item.options||[]).find(o=>String(o.name||"").trim().toLowerCase()===name.toLowerCase())?.value||"";
}
async function stores(){
 if(USE_MOCK)return mock().stores;
 const d=await ssGet("/stores");return Array.isArray(d)?d:d.stores||[];
}
async function tags(){
 if(USE_MOCK)return [{tagId:1,name:SOURCE_TAG}];
 const d=await ssGet("/accounts/listtags");return Array.isArray(d)?d:d.tags||[];
}
async function sourceOrders(){
 if(USE_MOCK)return mock().orders;
 const ssStores=await stores();
 const allTags=await tags();
 const tag=allTags.find(t=>String(t.name).trim().toLowerCase()===SOURCE_TAG.toLowerCase());
 if(!tag)throw new Error(`Tag not found: ${SOURCE_TAG}`);
 let page=1,orders=[];
 while(true){
   const d=await ssGet(`/orders/listbytag?orderStatus=${encodeURIComponent(process.env.SHIPSTATION_ORDER_STATUS||"awaiting_shipment")}&tagId=${tag.tagId}&page=${page}&pageSize=500`);
   orders.push(...(d.orders||[]));
   if(page>=Number(d.pages||1))break;
   page++;
 }
 return orders.map(o=>({
   orderId:o.orderId,orderNumber:o.orderNumber,storeId:Number(o.advancedOptions?.storeId||0),
   orderDate:String(o.orderDate||"").slice(0,10),customField1:o.advancedOptions?.customField1||"",
   items:(o.items||[]).map(i=>({
     orderItemId:i.orderItemId,sku:i.sku||"",oldSku:option(i,"Old SKU"),name:i.name||"",
     quantity:Number(i.quantity||1),backendProductInfo:option(i,"Backend Product Info"),
     garment:option(i,"Type of Garment"),color:option(i,"Color"),size:option(i,"Size Property")||option(i,"Size"),
     vendorSku:i.sku||""
   }))
 }));
}
function storeName(id,rows){return rows.find(s=>Number(s.storeId)===Number(id))?.storeName||`Store ${id}`}
function createPieces(order,store){
 const made=[];
 for(const item of order.items){
  for(let unit=1;unit<=item.quantity;unit++){
   made.push({
    pieceId:String(++pieceCounter),orderId:order.orderId,orderNumber:order.orderNumber,orderDate:order.orderDate,
    storeId:order.storeId,storeName:store,rush:String(order.customField1||"").toLowerCase().includes("skip the line"),
    customField1:order.customField1||"",unitNumber:unit,unitCount:item.quantity,
    sku:item.sku,oldSku:item.oldSku,name:item.name,backendProductInfo:item.backendProductInfo,
    garment:item.garment,color:item.color,size:item.size,vendorSku:item.vendorSku,
    frontArtwork:`${item.oldSku}.png`,backArtwork:String(item.backendProductInfo||"").toLowerCase().includes("back")?`${item.oldSku} BACK.png`:"",
    labelPrinted:false,labelPrintedAt:null,labelStock:null
   });
  }
 }
 return made;
}
app.get("/api/status",(req,res)=>res.json({mode:"SHADOW",sourceTag:SOURCE_TAG,writeEnabled:WRITE_ENABLED,useMock:USE_MOCK}));
app.get("/api/stores",async(req,res)=>{try{const rows=await stores();res.json(rows.map(s=>({...s,enabled:enabledStoreIds.has(Number(s.storeId))}))}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/stores",(req,res)=>{enabledStoreIds=new Set((req.body?.storeIds||[]).map(Number));res.json({success:true,storeIds:[...enabledStoreIds]})});

app.get("/api/manager/preview",async(req,res)=>{
 try{
  const date=req.query.date||"";
  const ssStores=await stores();
  let rows=await sourceOrders();
  if(date)rows=rows.filter(o=>o.orderDate===date);
  const included=rows.filter(o=>enabledStoreIds.has(Number(o.storeId))).map(o=>({...o,storeName:storeName(o.storeId,ssStores)}));
  const excluded=rows.filter(o=>!enabledStoreIds.has(Number(o.storeId))).map(o=>({...o,storeName:storeName(o.storeId,ssStores)}));
  const rush=included.filter(o=>String(o.customField1||"").toLowerCase().includes("skip the line"));
  res.json({included,excluded,rushCount:rush.length,total:rows.length});
 }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/manager/shadow-import",async(req,res)=>{
 try{
  const date=req.body?.date||"";
  const ssStores=await stores();
  let rows=await sourceOrders();
  if(date)rows=rows.filter(o=>o.orderDate===date);
  rows=rows.filter(o=>enabledStoreIds.has(Number(o.storeId)));
  let newOrders=0,newPieces=0;
  for(const order of rows){
   if(importedOrders.some(x=>x.orderId===order.orderId))continue;
   const store=storeName(order.storeId,ssStores);
   importedOrders.push({...order,storeName:store,importedAt:new Date().toISOString()});
   const made=createPieces(order,store);pieces.push(...made);newOrders++;newPieces+=made.length;
  }
  res.json({success:true,message:`Shadow imported ${newOrders} new orders and created ${newPieces} labels. ShipStation was not changed.`});
 }catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/manager/summary",(req,res)=>{
 const date=req.query.date||"";
 let rows=date?pieces.filter(p=>p.orderDate===date):pieces;
 res.json({
  total:rows.length,rush:rows.filter(p=>p.rush).length,regular:rows.filter(p=>!p.rush).length,
  unprinted:rows.filter(p=>!p.labelPrinted).length,
  byType:TYPES.map(type=>({type,count:rows.filter(p=>!p.rush&&p.backendProductInfo===type).length,unprinted:rows.filter(p=>!p.rush&&p.backendProductInfo===type&&!p.labelPrinted).length}))
 });
});
app.get("/api/manager/labels",(req,res)=>{
 let rows=[...pieces];
 if(req.query.date)rows=rows.filter(p=>p.orderDate===req.query.date);
 if(req.query.rush==="true")rows=rows.filter(p=>p.rush);
 if(req.query.rush==="false")rows=rows.filter(p=>!p.rush);
 if(req.query.type)rows=rows.filter(p=>p.backendProductInfo===req.query.type);
 if(req.query.unprinted==="true")rows=rows.filter(p=>!p.labelPrinted);
 res.json(rows);
});
app.post("/api/manager/mark-printed",(req,res)=>{
 const ids=req.body?.pieceIds||[];const now=new Date().toISOString();
 for(const id of ids){const p=pieces.find(x=>x.pieceId===String(id));if(p){p.labelPrinted=true;p.labelPrintedAt=now;p.labelStock=req.body?.labelStock||"white"}}
 printHistory.unshift({at:now,category:req.body?.category||"",labelStock:req.body?.labelStock||"white",count:ids.length,pieceIds:ids});
 res.json({success:true,message:`Marked ${ids.length} labels printed.`});
});
app.get("/api/manager/print-history",(req,res)=>res.json(printHistory));
app.get("/api/manager/garments",(req,res)=>{
 let rows=req.query.date?pieces.filter(p=>p.orderDate===req.query.date):pieces;
 const unitMap=new Map();
 for(const p of rows){const key=`${p.orderId}-${p.sku}-${p.unitNumber}`;if(!unitMap.has(key))unitMap.set(key,p)}
 const grouped=new Map();
 for(const p of unitMap.values()){const key=`${p.vendorSku}|${p.garment}|${p.color}|${p.size}`;if(!grouped.has(key))grouped.set(key,{vendorSku:p.vendorSku,garment:p.garment,color:p.color,size:p.size,qty:0});grouped.get(key).qty++}
 res.json([...grouped.values()]);
});
app.listen(PORT,()=>console.log(`Manager Daily Sample running on ${PORT}`));
