/* Static regression gates for the annotation locator contract. */
const fs = require('fs');
const runtime = fs.readFileSync(require('path').join(__dirname,'..','reader','readest-runtime.js'),'utf8');
const reader = fs.readFileSync(require('path').join(__dirname,'..','reader','reader.js'),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
assert(runtime.includes('annotationMode=options.annotation===true'), 'runtime annotation mode missing');
assert(runtime.includes('if(annotationMode)return null;'), 'runtime fail-closed gate missing');
assert(reader.includes('domRangeToCanonical(currentIndex,range,{annotation:true})'), 'selection must use annotation mapping');
assert(reader.includes('canonicalToDom(idx,start-base,end-base,query,{annotation:true})'), 'restore must use annotation mapping');
assert(reader.includes('version:3,type:\'reflow\''), 'new reflow position version missing');
assert(reader.includes('sourceAnchor:{chapterIndex:'), 'source anchor persistence missing');
console.log('reflow annotation stability static gates: PASS');
