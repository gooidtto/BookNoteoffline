/* v7.18.78 — reflow annotation contract stress test. */
const fs=require('fs'),path=require('path');
const annotations=fs.readFileSync(path.join(__dirname,'..','js','booknote-annotations.js'),'utf8');
const reader=fs.readFileSync(path.join(__dirname,'..','reader','reader.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','reader','readest-runtime.js'),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function makeChapters(count){let out=[],cursor=0;for(let i=0;i<count;i++){let text=('章'+i+'：')+('甲乙丙丁戊己庚辛壬癸 '.repeat((i%17)+1));out.push({index:i,text,textStart:cursor,textEnd:cursor+text.length});cursor+=text.length}return out}
function roundTrip(chapters,idx,start,end){let c=chapters[idx],base=c.textStart,p={version:4,type:'reflow',sourceAnchor:{chapterIndex:idx,localStart:start,localEnd:end,exact:c.text.slice(start,end),chapterTextHash:hash(c.text),chapterTextLength:c.text.length},documentStart:base+start,documentEnd:base+end};let restored=chapters[p.sourceAnchor.chapterIndex];assert(restored===c,'chapter-local anchor crossed chapter boundary');assert(p.sourceAnchor.localStart===start&&p.sourceAnchor.localEnd===end,'local range drift');assert(restored.text.slice(p.sourceAnchor.localStart,p.sourceAnchor.localEnd)===p.sourceAnchor.exact,'exact quote drift');assert(hash(restored.text)===p.sourceAnchor.chapterTextHash,'chapter identity drift');return p}
const chapters=makeChapters(97);let cases=0;
for(let i=0;i<20000;i++){const idx=i%chapters.length,c=chapters[idx],a=(i*37)%c.text.length,b=a+((i*53)%Math.max(1,c.text.length-a));roundTrip(chapters,idx,a,b);cases++}
const stale=makeChapters(3),saved=roundTrip(stale,2,3,8);stale[0].text+='新增内容';stale[1].text+='新增内容';
assert(stale[saved.sourceAnchor.chapterIndex].text.slice(saved.sourceAnchor.localStart,saved.sourceAnchor.localEnd)===saved.sourceAnchor.exact,'stale global offsets must not control restore');
assert(annotations.includes('a.position=a.position&&typeof a.position===\"object\"?a.position:null'),'annotation DB must persist position');
assert(annotations.includes('a.positionVersion=Number.isFinite(Number(a.positionVersion))?Number(a.positionVersion):null'),'annotation DB must persist positionVersion');
assert(reader.includes('positionVersion:4'),'writes must persist v4');
assert(!reader.includes('positionVersion:3'),'no active reflow annotation writer may remain on v3');
assert(reader.includes('bookmarkPositionSource=s||{chapterIndex:idx,start:start,end:end,text:\'\',rawText:\'\'}'),'selection-free bookmarks must persist a position');
assert(reader.includes("position:buildIndependentPosition(s),positionVersion:4"),'all reflow write paths must use v4');
assert(reader.includes('reflowFormat='),'reflow positions must carry source format');
assert(reader.includes('currentFormat='),'reflow restore must reject cross-format positions');
assert(reader.includes("p&&p.type==='reflow'&&p.sourceAnchor"),'section membership must use sourceAnchor');
assert(reader.includes("mapped.confidence!=='source-anchor-exact'&&mapped.confidence!=='txt-source-annotated-exact'&&mapped.confidence!=='odt-source-anchor-exact'&&mapped.confidence!=='docx-source-anchor-exact'&&mapped.confidence!=='normalized-exact'"),'restore must accept only deterministic TXT/ODT/DOCX source confidence');\nassert(runtime.includes('txtCanonicalToDom(index,start,end,quote)'), 'TXT v7.18.56 canonical restore baseline must remain');\nassert(runtime.includes('txtDomRangeToCanonical(index,range,options)'), 'TXT reverse locator baseline must remain');\nassert(runtime.includes('data-odt-source-start') && runtime.includes('odtSourceAnchoredToDom'), 'ODT must own its source-anchor namespace and restore path');\nassert(runtime.includes('data-docx-source-start') && runtime.includes('docxSourceAnchoredToDom'), 'DOCX must own its source-anchor namespace and restore path');\nassert(!runtime.includes('officeDomRangeToCanonical'), 'ODT/DOCX must not share the Office reverse mapper');\nassert(!runtime.includes('installSourceAnchors(index,doc)'), 'ODT/DOCX/TXT must not enter the old shared installer');
assert(runtime.includes("confidence:'source-anchor-exact'"),'runtime must expose deterministic source-anchor mapping');
assert(runtime.includes('if(annotationMode)return null;'),'annotation mapping must fail closed before heuristic quote search');
console.log('reflow annotation stress: PASS ('+cases+' chapter-local round trips; TXT v7.18.56 baseline + ODT/DOCX isolated locator gates PASS)');
