#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function read(p){ return fs.readFileSync(p,'utf8'); }
function must(ok,msg){ if(!ok) throw new Error(msg); }

const runtime = read('reader/readest-runtime.js');
const reader = read('reader/reader.js');
const annotations = read('js/booknote-annotations.js');
const epub = read('reader/epub-unified-locator.js');

new vm.Script(runtime, {filename:'reader/readest-runtime.js'});
new vm.Script(reader, {filename:'reader/reader.js'});
new vm.Script(annotations, {filename:'js/booknote-annotations.js'});

must(runtime.includes('txtCanonicalToDom(index,start,end,quote)'), 'TXT canonical->DOM baseline missing');
must(runtime.includes('txtDomRangeToCanonical(index,range,options)'), 'TXT DOM->canonical baseline missing');
must(runtime.includes("confidence:'txt-source-annotated-exact'"), 'TXT exact confidence missing');

must(runtime.includes('installOdtSourceAnchors'), 'ODT installer missing');
must(runtime.includes('odtSourceAnchoredToDom'), 'ODT restore path missing');
must(runtime.includes('odtDomRangeToCanonical'), 'ODT reverse path missing');
must(runtime.includes("confidence:'odt-source-anchor-exact'"), 'ODT exact confidence missing');
must(runtime.includes('data-odt-source-start'), 'ODT source namespace missing');

must(runtime.includes('installDocxSourceAnchors'), 'DOCX installer missing');
must(runtime.includes('docxSourceAnchoredToDom'), 'DOCX restore path missing');
must(runtime.includes('docxDomRangeToCanonical'), 'DOCX reverse path missing');
must(runtime.includes("confidence:'docx-source-anchor-exact'"), 'DOCX exact confidence missing');
must(runtime.includes('data-docx-source-start'), 'DOCX source namespace missing');

must(!runtime.includes('installSourceAnchors(index,doc)'), 'shared source-anchor installer still reachable');
must(!runtime.includes('officeDomRangeToCanonical'), 'shared Office reverse mapper still reachable');
must(!runtime.includes('data-bn-source-start'), 'ODT/DOCX still coupled to shared data-bn source namespace');

must(reader.includes("mapped.confidence!=='odt-source-anchor-exact'"), 'Reader does not accept ODT exact locator');
must(reader.includes("mapped.confidence!=='docx-source-anchor-exact'"), 'Reader does not accept DOCX exact locator');
must(reader.includes('position:buildIndependentPosition(s)'), 'active annotation writers must persist position');
must(annotations.includes('a.position=') && annotations.includes('a.positionVersion'), 'annotation DB normalize must retain position');

must(!epub.includes('odt-source-anchor') && !epub.includes('docx-source-anchor'), 'EPUB locator contaminated by Office logic');

console.log('FORMAT_LOCATOR_ISOLATION_V71880_PASS');
