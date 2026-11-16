import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
function trustedFile(file,privateOnly){
 if(!file||!path.isAbsolute(file)||path.normalize(file)!==file)return false
 try{let current=path.parse(file).root;for(const part of file.slice(current.length).split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())return false}const s=fs.lstatSync(file);return s.isFile()&&s.uid===process.getuid?.()&&!(s.mode&(privateOnly?0o077:0o022))&&s.size<=4*1024*1024}catch{return false}
}
// Consume a reviewed request by an atomic rename; a crash leaves a claimed
// file for manual review rather than silently retrying the request.
export function claimShadowRequest(env=process.env){
 if(env.STOCK_TOSS_SHADOW_ENABLED!=='1'||!env.STOCK_TOSS_SHADOW_REQUEST_FILE)return {status:'absent'}
 const file=env.STOCK_TOSS_SHADOW_REQUEST_FILE,parent=path.dirname(file)
 try{
  if(!path.isAbsolute(file)||path.normalize(file)!==file)return {status:'invalid_configuration'}
  if(!fs.existsSync(file))return {status:'absent'}
  if(!trustedFile(file,true)||!trustedFile(env.STOCK_TOSS_SHADOW_CONFIG,true))return {status:'invalid_configuration'}
  const dir=fs.lstatSync(parent);if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid?.()||(dir.mode&0o077))return {status:'invalid_configuration'}
  const priorStat=fs.lstatSync(file),requestBytes=fs.readFileSync(file),request=JSON.parse(requestBytes.toString('utf8')),configSha=createHash('sha256').update(fs.readFileSync(env.STOCK_TOSS_SHADOW_CONFIG)).digest('hex')
  const expires=typeof request.expiresAt==='string'?Date.parse(request.expiresAt):NaN,now=Date.now()
  if(!Number.isFinite(expires)||expires<=now||expires>now+24*3600000||request.schemaVersion!==1||request.from!==env.STOCK_TOSS_SHADOW_FROM||request.to!==env.STOCK_TOSS_SHADOW_TO||request.maxPages!==env.STOCK_TOSS_SHADOW_MAX_PAGES||request.cliSha256!==env.STOCK_TOSS_SHADOW_CLI_SHA256||request.configSha256!==configSha||request.configSha256!==env.STOCK_TOSS_SHADOW_CONFIG_SHA256)return {status:'invalid_configuration'}
  const claimedPath=file+'.claimed-'+randomUUID();try{fs.renameSync(file,claimedPath)}catch(e){if(e?.code==='ENOENT')return {status:'absent'};throw e}const claimedStat=fs.lstatSync(claimedPath),claimedBytes=fs.readFileSync(claimedPath);if(claimedStat.dev!==priorStat.dev||claimedStat.ino!==priorStat.ino||!claimedBytes.equals(requestBytes)||expires<=Date.now())return {status:'invalid_configuration',claimedPath};return {status:'claimed',claimedPath}
 }catch{return {status:'invalid_configuration'}}
}
export function recordShadowResult(claimedPath,status){
 if(!['success','failed','timeout','invalid_configuration','disabled'].includes(status)||!trustedFile(claimedPath,true))return {status:'failed'}
 let fd;try{fd=fs.openSync(claimedPath+'.result.json','wx',0o600);fs.writeFileSync(fd,JSON.stringify({schemaVersion:1,status,completedAt:new Date().toISOString()})+'\n');fs.fsyncSync(fd);return {status:'recorded'}}catch{return {status:'failed'}}finally{if(fd!==undefined)try{fs.closeSync(fd)}catch{}}
}
// Best-effort observational sidecar: never echo or persist the bearer token.
export async function runShadowHandoff(token, env=process.env, spawnFn=spawn) {
 if (env.STOCK_TOSS_SHADOW_ENABLED !== '1') return {status:'disabled'}
 const cli=env.STOCK_TOSS_SHADOW_CLI, config=env.STOCK_TOSS_SHADOW_CONFIG, digest=env.STOCK_TOSS_SHADOW_CLI_SHA256, from=env.STOCK_TOSS_SHADOW_FROM, to=env.STOCK_TOSS_SHADOW_TO, pages=env.STOCK_TOSS_SHADOW_MAX_PAGES
 let cliDigest,configDigest;try{if(trustedFile(cli,false))cliDigest=createHash('sha256').update(fs.readFileSync(cli)).digest('hex');if(trustedFile(config,true))configDigest=createHash('sha256').update(fs.readFileSync(config)).digest('hex')}catch{return {status:'invalid_configuration'}}
 if(typeof token!=='string'||!token||!cliDigest||!configDigest||configDigest!==env.STOCK_TOSS_SHADOW_CONFIG_SHA256||! /^[a-f0-9]{64}$/.test(digest??'')||cliDigest!==digest||!/^\d{4}-\d{2}-\d{2}$/.test(from??'')||!/^\d{4}-\d{2}-\d{2}$/.test(to??'')||!/^([1-9]|1\d|20)$/.test(pages??''))return {status:'invalid_configuration'}
 const args=[cli,'tossinvest','collect','--config',config,'--config-sha256',configDigest,'--token-stdin','--from',from,'--to',to,'--max-pages',pages]
 return await new Promise(resolve=>{
  let child,done=false,timer
  const finish=status=>{if(done)return;done=true;if(timer)clearTimeout(timer);if(status!=='success'&&child){try{child.kill('SIGKILL')}catch{}try{child.stdin.destroy?.()}catch{}try{child.unref?.()}catch{}}resolve({status})}
  try{child=spawnFn(process.execPath,args,{stdio:['pipe','ignore','ignore'],env:{}});child.once('error',()=>finish('failed'));child.once('close',(code,signal)=>finish(code===0&&!signal?'success':'failed'));child.stdin.on('error',()=>finish('failed'));timer=setTimeout(()=>finish('timeout'),90000);child.stdin.end(token+'\n')}catch{finish('failed')}
 })
}
