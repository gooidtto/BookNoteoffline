/* BookNote Canonical PDF Block Adapter v1.0.
 * PDF remains fixed-layout: blocks are page-local and carry native rectangles.
 * This adapter is additive; it does not alter the PDF open/render path.
 */
(function(root){
 'use strict';
 var Pdf=root.BookNotePdfAdapter;
 function s(v){return String(v==null?'':v)}
 function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d}
 function rect(r){r=r||{};return {x:n(r.x,0),y:n(r.y,0),width:Math.max(0,n(r.width,r.w||0)),height:Math.max(0,n(r.height,r.h||0))}}
 function block(o){o=o||{};var page=Math.max(0,Math.floor(n(o.page,0))),r=rect(o.rect),text=s(o.text);return {id:s(o.id||('pdf-p'+page+'-b'+Math.round(r.x*10)+'-'+Math.round(r.y*10))),type:o.type==='image'?'image':'text',chapterIndex:page,textStart:n(o.textStart,0),textEnd:n(o.textEnd,text.length),text:text,html:s(o.html||''),headingLevel:Math.max(0,Math.floor(n(o.headingLevel,0))),page:page,rect:r,textQuote:{exact:text,prefix:s(o.prefix),suffix:s(o.suffix)},locator:Pdf&&Pdf.locator?Pdf.locator({page:page,rect:r,text:text}):{type:'fixed',page:page,rect:r,textQuote:{exact:text,prefix:'',suffix:''}}}}
 function fromPageTextBoxes(page,boxes){return (Array.isArray(boxes)?boxes:[]).map(function(b,i){var r=rect(b),text=s(b.text||b.str||b.content);return block({id:'pdf-p'+page+'-b'+i,page:page,rect:r,text:text,type:b.type==='image'?'image':'text'})})}
 function build(o){o=o||{};var pages=Array.isArray(o.pages)?o.pages:[],blocks=[];pages.forEach(function(p,pi){var page=Math.max(0,Math.floor(n(p&&p.page,pi))),bs=Array.isArray(p&&p.blocks)?p.blocks:fromPageTextBoxes(page,p&&p.textBoxes);bs.forEach(function(b){blocks.push(block(Object.assign({},b,{page:page})))});});return {version:'1.0.0',format:'pdf',type:'fixed',blocks:blocks,pages:pages.map(function(p,i){return {page:Math.max(0,Math.floor(n(p&&p.page,i))),width:n(p&&p.width,0),height:n(p&&p.height,0),blockCount:Array.isArray(p&&p.blocks)?p.blocks.length:Array.isArray(p&&p.textBoxes)?p.textBoxes.length:0}})} }
 function validate(doc){var errors=[],seen={};(doc&&doc.blocks||[]).forEach(function(b,i){if(!b||!Number.isInteger(b.page)||b.page<0)errors.push('block['+i+'] invalid page');if(!b||!b.rect||b.rect.width<0||b.rect.height<0)errors.push('block['+i+'] invalid rect');if(b&&seen[b.id])errors.push('duplicate block id '+b.id);if(b)seen[b.id]=1});return {ok:!errors.length,errors:errors}}
 root.BookNoteCanonicalPdfBlocks={version:'1.0.0',block:block,fromPageTextBoxes:fromPageTextBoxes,build:build,validate:validate};
})(typeof window!=='undefined'?window:self);
