/* BookNote Unified TOC Adapter v1.0.0.
 * Format-specific navigation is normalized into the Canonical TOC Tree.
 * This layer is additive: it does not mutate chapters or reader rendering.
 */
(function(root){
  'use strict';
  var C=root.BookNoteCanonicalToc;
  function s(v){return String(v==null?'':v).trim();}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function pickLabel(x){return s(x&& (x.label!=null?x.label:(x.title!=null?x.title:(x.text!=null?x.text:x.name))));}
  function mapNode(x,i,parentLevel,format){
    x=x||{}; var level=Math.max(1,Math.min(6,n(x.headingLevel!=null?x.headingLevel:(x.level!=null?x.level:parentLevel||1),parentLevel||1)));
    var children=Array.isArray(x.children)?x.children.map(function(c,j){return mapNode(c,j,level+1,format);}):[];
    var href=s(x.href!=null?x.href:x.url), fragment=s(x.fragment!=null?x.fragment:x.anchor);
    return {id:s(x.id||x.uid||('toc-'+format+'-'+i+'-'+n(x.index,-1))),label:pickLabel(x),index:n(x.index!=null?x.index:x.chapterIndex,-1),headingLevel:level,href:href,fragment:fragment,children:children};
  }
  function normalizeRaw(raw,format){
    if(!Array.isArray(raw)) return [];
    return raw.map(function(x,i){return mapNode(x,i,1,format);});
  }
  function fromNative(format,raw,chapters){
    var tree=normalizeRaw(raw,format);
    if(tree.length) return tree;
    return C?C.fromChapters(chapters||[]):[];
  }
  function adapt(opts){
    opts=opts||{};
    var format=s(opts.format||opts.sourceFormat||'unknown').toLowerCase();
    var chapters=Array.isArray(opts.chapters)?opts.chapters:[];
    var raw=opts.raw||opts.toc||opts.navigation||opts.outline||[];
    var tree=fromNative(format,raw,chapters);
    var result=C?C.sanitize(tree,chapters.length):{ok:true,errors:[],tree:tree};
    return {version:'1.0.0',format:format,tree:result.tree,ok:result.ok,errors:result.errors};
  }
  function adaptDocument(doc){
    doc=doc||{};
    var r=adapt({format:doc.source&&doc.source.format||doc.format,raw:doc.toc||doc.navigation||doc.outline,chapters:doc.chapters});
    return Object.assign({},r,{document:doc});
  }
  root.BookNoteCanonicalTocAdapter={version:'1.0.0',normalizeRaw:normalizeRaw,adapt:adapt,adaptDocument:adaptDocument};
})(typeof window!=='undefined'?window:self);
