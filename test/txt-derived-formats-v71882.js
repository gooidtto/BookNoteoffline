#!/usr/bin/env node
'use strict';
const fs=require('fs');
const vm=require('vm');
const runtime=fs.readFileSync('reader/readest-runtime.js','utf8');
const reader=fs.readFileSync('reader/reader.js','utf8');
function must(x,m){if(!x)throw new Error(m);}
new vm.Script(runtime,{filename:'reader/readest-runtime.js'});
new vm.Script(reader,{filename:'reader/reader.js'});
must(runtime.includes("confidence:'txt-source-annotated-exact'"),'TXT v7.18.56 exact mapper missing');
must(/\n  txtDomRangeToCanonical\(index,range,options\)\{/.test(runtime),'TXT reverse selection locator is missing; selection toolbar cannot resolve a TXT Range');
must(/\n  formatKind\(\)\{/.test(runtime),'formatKind dispatch is missing; TXT/ODT/DOCX selection dispatch will throw');
must(runtime.includes("confidence:'odt-source-anchor-exact'"),'ODT selection reverse locator missing');
must(runtime.includes("confidence:'docx-source-anchor-exact'"),'DOCX selection reverse locator missing');
must(runtime.includes("readerProjectText(ct),cursor=0"),'Office source projection does not use TXT projection');
must(runtime.includes("data-odt-source-version','2'"),'ODT TXT-derived source version missing');
must(runtime.includes("data-docx-source-version','2'"),'DOCX TXT-derived source version missing');
must(!/installOdtSourceAnchors[\s\S]{0,7000}normalize\('NFKC'\)/.test(runtime),'ODT still performs NFKC source guessing');
must(!/installDocxSourceAnchors[\s\S]{0,7000}normalize\('NFKC'\)/.test(runtime),'DOCX still performs NFKC source guessing');
const save=reader.slice(reader.indexOf('async function saveAnnotation(type,color){'),reader.indexOf('if(type==="bookmark")',reader.indexOf('async function saveAnnotation(type,color){')));
must(save.includes('await renderChapterHighlights(__doc,__idx)'), 'TXT/Office first-paint flow not unified');
must(!save.includes('__isOffice'), 'Office-only first-paint branch remains');
must(!runtime.includes('officeDomRangeToCanonical'),'shared Office reverse mapper remains');
must(!runtime.includes('installSourceAnchors(index,doc)'),'shared Office installer remains');
must(!runtime.includes('data-bn-source-start'),'legacy shared source namespace remains');
console.log('TXT_DERIVED_FORMATS_V71882_PASS');
