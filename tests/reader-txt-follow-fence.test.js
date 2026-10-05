/* V7.17.43 TXT Follow Fence regression.
 * Uses the production readerSpeechTxtWordRange implementation directly.
 * Frozen contract:
 *   - CJK / high-frequency CJK / punctuation => current occurrence, with a
 *     declared multi-character word allowed to expand only forward inside the Fence.
 *   - ordinary/non-CJK => current Speech char through the next punctuation.
 *   - no candidate may cross the unified punctuation Fence.
 */
const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync(require.resolve('../reader/reader.js'),'utf8');
function extract(name){
  const marker='function '+name+'(';
  const s=src.indexOf(marker); if(s<0) throw new Error('missing '+name);
  let i=src.indexOf('{',s),depth=0,inStr=null,esc=false;
  for(;i<src.length;i++){
    const c=src[i];
    if(inStr){ if(esc){esc=false;continue;} if(c==='\\'){esc=true;continue;} if(c===inStr)inStr=null; continue; }
    if(c==='"'||c==="'"||c==='`'){inStr=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return src.slice(s,i+1);
  }
  throw new Error('unclosed '+name);
}
const sandbox={state:null,readerSpeechState:{currentWordAbsEnd:-1,currentWordAbsStart:-1},console};
vm.createContext(sandbox);
vm.runInContext(extract('readerSpeechBuildTxtCanonicalChars'),sandbox);
vm.runInContext(extract('readerSpeechTxtVisualPhrase'),sandbox);
vm.runInContext(extract('readerSpeechTxtWordRange'),sandbox);
function assert(c,m){if(!c)throw new Error(m);}
function fakeDoc(){
  return {
    createRange(){
      return {
        collapsed:false,
        _token:'',
        setStart(){},setEnd(){},
        toString(){return this._token;}
      };
    }
  };
}
function setup(source){
  const doc=fakeDoc();
  sandbox.readerSpeechState.currentWordAbsEnd=-1;
  sandbox.readerSpeechState.currentWordAbsStart=-1;
  sandbox.state={chapters:[{text:source}],runtime:{canonicalToDom(section,start,end,token){return {start:{node:{},offset:start},end:{node:{},offset:end},token};}}};
  const item={sectionIndex:0,start:0,end:source.length,txtCanonicalChars:sandbox.readerSpeechBuildTxtCanonicalChars(0,source)};
  /* Patch createRange so the production validation sees the canonical token. */
  doc.createRange=function(){
    return {collapsed:false,_token:'',setStart(n,o){this.s=o},setEnd(n,o){this.e=o},toString(){return source.slice(this.s,this.e)}};
  };
  return {doc,item};
}
{
  const source='甲乙丙，abc def，丁戊己。';
  const {doc,item}=setup(source);
  let r=sandbox.readerSpeechTxtWordRange(item,source,0,2,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='甲乙','CJK word must expand forward from the current occurrence');
  r=sandbox.readerSpeechTxtWordRange(item,source,3,1,doc);
  assert(r.absoluteStart===3 && r.absoluteEnd===4,'punctuation must be exact one occurrence');
  r=sandbox.readerSpeechTxtWordRange(item,source,4,1,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='abc def','ordinary text must extend up to, but not include, the next punctuation');
  r=sandbox.readerSpeechTxtWordRange(item,source,8,1,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='def','ordinary text from an interior char must extend to the same Fence boundary');
  r=sandbox.readerSpeechTxtWordRange(item,source,11,1,doc);
  assert(r.absoluteStart===11 && r.absoluteEnd===12,'second punctuation must be exact');
}
{
  const source='重复重复，后面。';
  const {doc,item}=setup(source);
  let r=sandbox.readerSpeechTxtWordRange(item,source,0,1,doc);
  assert(r.absoluteStart===0 && r.absoluteEnd===2,'first repeated CJK phrase must stay anchored at its own occurrence');
  r=sandbox.readerSpeechTxtWordRange(item,source,2,1,doc);
  assert(r.absoluteStart===2 && r.absoluteEnd===4,'second repeated CJK phrase must use its own occurrence');
}
{
  const source='真理；你们，跳出范围不允许。';
  const {doc,item}=setup(source);
  let r=sandbox.readerSpeechTxtWordRange(item,source,0,2,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='真理','真理 must combine as one forward word');
  r=sandbox.readerSpeechTxtWordRange(item,source,3,2,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='你们','你们 must combine without leaving its Fence');
  r=sandbox.readerSpeechTxtWordRange(item,source,3,4,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='你们','declared length must be clamped before punctuation');
}
{
  const source='你们，后面真理。';
  const {doc,item}=setup(source);
  let r=sandbox.readerSpeechTxtWordRange(item,source,0,4,doc);
  assert(source.slice(r.absoluteStart,r.absoluteEnd)==='你们','word expansion must never cross punctuation');
}

{
  const source='这事我不说也可能你们不太清楚，但是当我说出这个过程的时候你们也可能就清楚了，因为好多人已经经历到这事了。';
  const {doc,item}=setup(source);
  const first=source.indexOf('你们');
  const second=source.indexOf('你们',first+2);
  let r=sandbox.readerSpeechTxtWordRange(item,source,first,2,doc);
  assert(r && r.absoluteStart===first && r.absoluteEnd===first+2,'first 你们 must stay at its exact source occurrence');
  r=sandbox.readerSpeechTxtWordRange(item,source,second,2,doc);
  assert(r && r.absoluteStart===second && r.absoluteEnd===second+2,'second 你们 must stay at its exact source occurrence');
}
{
  const source='真理；你们，后面。';
  const {doc,item}=setup(source);
  sandbox.readerSpeechState.currentWordAbsStart=0;
  sandbox.readerSpeechState.currentWordAbsEnd=2;
  let r=sandbox.readerSpeechTxtWordRange(item,source,0,2,doc,false);
  assert(r===null,'a committed occurrence must not be selected again by a normal stale boundary');
  r=sandbox.readerSpeechTxtWordRange(item,source,0,2,doc,true);
  assert(r && r.absoluteStart===0 && r.absoluteEnd===2,'forceCurrent may repaint only the exact committed occurrence');
}
{
  const source='真理；你们，后面。';
  const {doc,item}=setup(source);
  let r=sandbox.readerSpeechTxtWordRange(item,source,1,1,doc,false);
  assert(r && r.absoluteStart>=1 && r.absoluteEnd<=2,'word-internal advance must stay inside the same punctuation Fence');
  assert(source.slice(r.absoluteStart,r.absoluteEnd).indexOf('；')===-1,'word-internal advance must never consume the Fence punctuation');
}
console.log('reader-txt-follow-fence: PASS');
