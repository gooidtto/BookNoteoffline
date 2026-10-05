/* Static regression gates for EPUB highlight restore and TXT selection UI. */
const fs = require('fs');
const path = require('path');
const reader = fs.readFileSync(path.join(__dirname,'..','reader','reader.js'),'utf8');
const runtime = fs.readFileSync(path.join(__dirname,'..','reader','readest-runtime.js'),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
assert(reader.includes('var currentIndex=Number(state.runtime.currentIndex)'), 'selection must use live runtime section');
assert(reader.includes('domRangeToCanonical(currentIndex,range,{annotation:true})'), 'selection must use deterministic annotation mapping');
assert(reader.includes("addEventListener('pointerup',function(){dragging=false;scheduleUpdate(0);},true)"), 'selection toolbar must react to pointer selection completion');
assert(reader.includes('for(var retry=0;retry<4&&!applied;retry++)'), 'highlight restore must retry transient EPUB locator failures');
assert(reader.includes('findHighlightMarksById(doc,a.id)'), 'highlight reconciliation must preserve already restored marks');
assert(reader.includes('Split-and-wrap instead of Range.surroundContents()'), 'highlight wrapping must tolerate overlapping/crossing marks');
assert(runtime.includes('rootBoundary:true'), 'TXT root-boundary selections must be represented deterministically');
assert(runtime.includes("if(item.rootBoundary&&node===root)return Number(off)<=0?0:ct.length;"), 'TXT root-boundary offsets must map to canonical boundaries');
assert(runtime.includes("canonicalHits.length===1&&domHits.length===1"), 'TXT annotation mapping may use a unique exact quote when whitespace differs');
assert(runtime.includes("confidence:'unique-quote-exact'"), 'unique TXT quote fallback must be marked as exact');
assert(reader.includes("mapped.confidence!=='source-anchor-exact'"), 'reflow source-anchor positions must pass location validation');
assert(reader.includes("mapped.confidence!=='txt-source-annotated-exact'"), 'TXT annotated positions must pass location validation');
assert(reader.includes("mapped.confidence!=='unique-quote-exact'"), 'unique exact fallback must pass location validation');
console.log('v7.18.73 reader annotation/selection regression gates: PASS');
