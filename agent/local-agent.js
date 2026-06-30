import "dotenv/config";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "change-this-token";
const HOTFOLDER_PATH = process.env.HOTFOLDER_PATH || "C:\\GraphicsLab\\HotFolder\\Printer1";
const POLL_MS = Number(process.env.POLL_MS || 3000);

function getJson(url){return new Promise((resolve,reject)=>{const c=url.startsWith("https")?https:http;c.get(url,res=>{let d="";res.on("data",x=>d+=x);res.on("end",()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}})}).on("error",reject)})}
function postJson(url,body={}){return new Promise((resolve,reject)=>{const p=new URL(url);const c=p.protocol==="https:"?https:http;const req=c.request({hostname:p.hostname,port:p.port,path:p.pathname+p.search,method:"POST",headers:{"Content-Type":"application/json"}},res=>{let d="";res.on("data",x=>d+=x);res.on("end",()=>{try{resolve(JSON.parse(d))}catch{resolve({ok:true})}})});req.on("error",reject);req.write(JSON.stringify(body));req.end()})}
function downloadFile(url,destination){return new Promise((resolve,reject)=>{const full=new URL(url,SERVER_URL).toString();const c=full.startsWith("https")?https:http;const file=fs.createWriteStream(destination);c.get(full,response=>{response.pipe(file);file.on("finish",()=>file.close(resolve))}).on("error",reject)})}
async function poll(){try{fs.mkdirSync(HOTFOLDER_PATH,{recursive:true});const jobs=await getJson(`${SERVER_URL}/api/agent/jobs?token=${AGENT_TOKEN}`);for(const job of jobs){const safeSku=job.item.sku.replace(/[^a-z0-9_-]/gi,"_");const outputFile=path.join(HOTFOLDER_PATH,`${job.orderNumber}-${job.item.location}-${safeSku}.png`);console.log(`Sending ${job.item.sku} to ${outputFile}`);await downloadFile(job.item.artworkUrl,outputFile);await postJson(`${SERVER_URL}/api/agent/jobs/${job.id}/complete?token=${AGENT_TOKEN}`);console.log(`Completed ${job.id}`)}}catch(err){console.error("Agent error:",err.message)}}console.log("Local Graphics Lab agent started.");console.log("Server:",SERVER_URL);console.log("Hot folder:",HOTFOLDER_PATH);setInterval(poll,POLL_MS);poll();