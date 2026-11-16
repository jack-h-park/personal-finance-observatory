import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
export const shouldRunShadow=(args,env)=>args.includes('--shadow-once')&&env.STOCK_TOSS_SHADOW_ENABLED==='1'
function trustedFile(file,privateOnly){
 if(!file||!path.isAbsolute(file)||path.normalize(file)!==file)return false
 try{let current=path.parse(file).root;for(const part of file.slice(current.length).split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())return false}const s=fs.lstatSync(file);return s.isFile()&&s.uid===process.getuid?.()&&!(s.mode&(privateOnly?0o077:0o022))&&s.size<=4*1024*1024}catch{return false}
}
// Best-effort observational sidecar: never echo or persist the bearer token.
export async function runShadowHandoff(token, env=process.env, spawnFn=spawn) {
 if (env.STOCK_TOSS_SHADOW_ENABLED !== '1') return {status:'disabled'}
 const cli=env.STOCK_TOSS_SHADOW_CLI, config=env.STOCK_TOSS_SHADOW_CONFIG, digest=env.STOCK_TOSS_SHADOW_CLI_SHA256, from=env.STOCK_TOSS_SHADOW_FROM, to=env.STOCK_TOSS_SHADOW_TO, pages=env.STOCK_TOSS_SHADOW_MAX_PAGES
 let cliDigest;try{if(trustedFile(cli,false))cliDigest=createHash('sha256').update(fs.readFileSync(cli)).digest('hex')}catch{return {status:'invalid_configuration'}}
 if(typeof token!=='string'||!token||!cliDigest||!trustedFile(config,true)||! /^[a-f0-9]{64}$/.test(digest??'')||cliDigest!==digest||!/^\d{4}-\d{2}-\d{2}$/.test(from??'')||!/^\d{4}-\d{2}-\d{2}$/.test(to??'')||!/^([1-9]|1\d|20)$/.test(pages??''))return {status:'invalid_configuration'}
 const args=[cli,'tossinvest','collect','--config',config,'--token-stdin','--from',from,'--to',to,'--max-pages',pages]
 return await new Promise(resolve=>{
  let child,done=false,timer
  const finish=status=>{if(done)return;done=true;if(timer)clearTimeout(timer);if(status!=='success'&&child){try{child.kill('SIGKILL')}catch{}try{child.stdin.destroy?.()}catch{}try{child.unref?.()}catch{}}resolve({status})}
  try{child=spawnFn(process.execPath,args,{stdio:['pipe','ignore','ignore'],env:{}});child.once('error',()=>finish('failed'));child.once('close',(code,signal)=>finish(code===0&&!signal?'success':'failed'));child.stdin.on('error',()=>finish('failed'));timer=setTimeout(()=>finish('timeout'),90000);child.stdin.end(token+'\n')}catch{finish('failed')}
 })
}
