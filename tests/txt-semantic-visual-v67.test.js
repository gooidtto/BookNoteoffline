const fs = require('fs');
const path = require('path');
const vm = require('vm');
function load(file, extra={}) { const ctx={console, ...extra}; vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx,{filename:file}); return ctx; }
const base=path.join(__dirname,'..');
const b=load(path.join(base,'js','txt-semantic-candidate-v65.js'));
const c=load(path.join(base,'js','txt-semantic-visual-v67.js'),{BookNoteTxtSemanticCandidateV65:b.BookNoteTxtSemanticCandidateV65});
function cmap(text, base=100){ return Array.from(text,(_,i)=>({sourceStart:base+i,sourceEnd:base+i+1})); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg}: ${a} !== ${b}`); }
let r=c.BookNoteTxtSemanticVisualV67.select('高兴得跳了起来',0,100,107,cmap('高兴得跳了起来'),b.BookNoteTxtSemanticCandidateV65);
eq(r.start,100,'semantic start at current occurrence'); eq(r.end,103,'semantic end'); eq(r.text,'高兴得','semantic text');
r=c.BookNoteTxtSemanticVisualV67.select('高兴得跳了起来',0,101,107,cmap('高兴得跳了起来'),b.BookNoteTxtSemanticCandidateV65);
if(r!==null) throw new Error('candidate before A lock must be rejected');
r=c.BookNoteTxtSemanticVisualV67.select('高兴得。跳了起来',0,100,103,cmap('高兴得。跳了起来'),b.BookNoteTxtSemanticCandidateV65);
eq(r.end,103,'fence-safe candidate');
r=c.BookNoteTxtSemanticVisualV67.select('高兴得跳了起来',1,102,107,cmap('高兴得跳了起来'),b.BookNoteTxtSemanticCandidateV65);
if(r!==null) throw new Error('candidate outside A lock must be rejected');
r=c.BookNoteTxtSemanticVisualV67.select('高兴得高兴得',3,100,105,cmap('高兴得高兴得'),b.BookNoteTxtSemanticCandidateV65);
if(r!==null) throw new Error('candidate beyond A lock must be rejected');
console.log('txt-semantic-visual-v67: PASS');
