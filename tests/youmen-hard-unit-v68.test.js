const fs=require('fs'); const vm=require('vm');
const src=fs.readFileSync(require.resolve('../reader/reader.js'),'utf8');
function extract(name){const marker='function '+name+'(';const s=src.indexOf(marker);if(s<0)throw Error('missing '+name);let i=src.indexOf('{',s),d=0,str=null,esc=false;for(;i<src.length;i++){const c=src[i];if(str){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===str)str=null;continue}if(c==='"'||c==="'"||c==='`'){str=c;continue}if(c==='{')d++;else if(c==='}'&&--d===0)return src.slice(s,i+1)}throw Error('unclosed')}
const sb={state:null,readerSpeechState:{currentWordAbsEnd:-1,currentWordAbsStart:-1},console};vm.createContext(sb);vm.runInContext(extract('readerSpeechBuildTxtCanonicalChars'),sb);vm.runInContext(extract('readerSpeechTxtVisualPhrase'),sb);vm.runInContext(extract('readerSpeechTxtWordRange'),sb);
function assert(c,m){if(!c)throw Error(m)}
function setup(source){sb.state={chapters:[{text:source}],runtime:{canonicalToDom(section,start,end,token){return {start:{node:{},offset:start},end:{node:{},offset:end}}}}};sb.readerSpeechState.currentWordAbsEnd=-1;sb.readerSpeechState.currentWordAbsStart=-1;const item={sectionIndex:0,start:0,end:source.length,txtCanonicalChars:sb.readerSpeechBuildTxtCanonicalChars(0,source)};const doc={createRange(){return{collapsed:false,setStart(n,o){this.s=o},setEnd(n,o){this.e=o},toString(){return source.slice(this.s,this.e)}}}};return {item,doc}}
{
 const source='你们正在这里，你们也在这里。'; const {item,doc}=setup(source);
 let a=source.indexOf('你们'), b=source.indexOf('你们',a+2);
 let r=sb.readerSpeechTxtWordRange(item,source,a,1,doc,false); assert(r&&r.absoluteStart===a&&r.absoluteEnd===a+1,'one-char 你 must remain only 你');
 r=sb.readerSpeechTxtWordRange(item,source,a,2,doc,false); assert(r&&r.absoluteStart===a&&r.absoluteEnd===a+2,'explicit 你们 must stay exact first occurrence');
 r=sb.readerSpeechTxtWordRange(item,source,b,1,doc,false); assert(r&&r.absoluteStart===b&&r.absoluteEnd===b+1,'second one-char 你 must remain at second occurrence');
 r=sb.readerSpeechTxtWordRange(item,source,b,2,doc,false); assert(r&&r.absoluteStart===b&&r.absoluteEnd===b+2,'second explicit 你们 must stay exact occurrence');
}
{
 const source='你们高兴得跳了起来。'; const {item,doc}=setup(source); const a=0;
 let r=sb.readerSpeechTxtWordRange(item,source,a,1,doc,false); assert(r&&source.slice(r.absoluteStart,r.absoluteEnd)==='你','你们 hard unit must block B/C expansion on one-char boundary');
 r=sb.readerSpeechTxtWordRange(item,source,a,2,doc,false); assert(r&&source.slice(r.absoluteStart,r.absoluteEnd)==='你们','explicit 你们 may paint only the exact pair');
}
console.log('youmen-hard-unit-v68: PASS');
