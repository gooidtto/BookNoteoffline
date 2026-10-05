/* BookNote Canonical PDF Adapter v1.1.
 * Fixed-layout documents use page + rectangle coordinates; they never reuse
 * reflow chapter offsets as a visual locator.
 */
(function(root){
  'use strict';
  var Locator=root.BookNoteLocator;
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function s(v){return String(v==null?'':v);}
  function rect(r){r=r||{};return {x:n(r.x,0),y:n(r.y,0),width:Math.max(0,n(r.width,0)),height:Math.max(0,n(r.height,0))};}
  function quote(q,text){
    if(Locator&&Locator.normalizeQuote)return Locator.normalizeQuote(q||{exact:s(text||''),prefix:'',suffix:''});
    q=q||{};return {exact:s(q.exact||text||''),prefix:s(q.prefix||''),suffix:s(q.suffix||'')};
  }
  function locator(o){o=o||{};var base={type:'fixed',page:Math.max(0,Math.floor(n(o.page,0))),rect:rect(o.rect),textQuote:quote(o.textQuote||o.quote,o.text)};return Locator&&Locator.fixed?Locator.fixed(base):base;}
  function fromSelection(page,box,text){return locator({page:page,rect:box,textQuote:{exact:s(text),prefix:'',suffix:''}});}
  function normalizePage(page){return Math.max(0,Math.floor(n(page,0)));}
  function normalizeDocument(meta){meta=meta||{};return {type:'fixed',format:'pdf',pageCount:Math.max(0,Math.floor(n(meta.pageCount,0))),locatorType:'page-rect',native:true};}
  function normalizeHit(hit){hit=hit||{};return {page:normalizePage(hit.page),rect:rect(hit.rect),text: s(hit.text||hit.quote||''),locator:locator(hit.locator||hit)};}
  function normalizeHits(hits){return Array.isArray(hits)?hits.map(normalizeHit):[];}
  root.BookNotePdfAdapter={version:'1.1.0',locator:locator,fromSelection:fromSelection,normalizePage:normalizePage,normalizeDocument:normalizeDocument,normalizeHit:normalizeHit,normalizeHits:normalizeHits};
})(typeof window!=='undefined'?window:self);
