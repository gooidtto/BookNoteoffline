/* BookNote Canonical TOC Resolver v1.1.0.
 * TOC -> Chapter -> Canonical Locator. Pure resolver: no DOM mutation.
 */
(function(root){
  'use strict';
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function s(v){return String(v==null?'':v).trim();}
  function chaptersOf(chapters){return Array.isArray(chapters)?chapters:[];}
  function resolve(node, chapters){
    node=node||{}; chapters=chaptersOf(chapters);
    var raw=node.index!=null?node.index:node.chapterIndex;
    var idx=Math.floor(n(raw,NaN));
    if(!Number.isFinite(idx)||idx<0||idx>=chapters.length)return null;
    var c=chapters[idx]||{};
    var base=n(c.textStart,0);
    var textLen=s(c.text).length;
    var end=n(c.textEnd,base+textLen);
    if(end<base)end=base;
    var local=n(node.start!=null?node.start:(node.offset!=null?node.offset:c.tocOffset),0);
    var absolute=node.absolute===true;
    var start=absolute?local:base+Math.max(0,local);
    start=Math.max(base,Math.min(end,start));
    var localStart=start-base;
    var href=s(node.href!=null?node.href:c.href);
    var fragment=s(node.fragment!=null?node.fragment:c.fragment);
    var locator=root.BookNoteLocator&&typeof root.BookNoteLocator.reflow==='function'
      ? root.BookNoteLocator.reflow({chapterIndex:idx,start:localStart,end:localStart,href:href,fragment:fragment})
      : {type:'reflow',format:'reflow',chapterIndex:idx,start:localStart,end:localStart,href:href,fragment:fragment};
    return {node:node,chapterIndex:idx,start:start,end:start,localStart:localStart,locator:locator,href:href,fragment:fragment,label:s(node.label!=null?node.label:c.label)};
  }
  function resolveById(id,tree,chapters){
    var target=s(id),found=null;
    function walk(nodes){return (nodes||[]).some(function(x){if(s(x.id)===target){found=x;return true;}return walk(x&&x.children);});}
    walk(tree);return found?resolve(found,chapters):null;
  }
  function resolveToReader(node, chapters, runtime){
    var r=resolve(node,chapters);
    if(!r)return null;
    return {locator:r.locator,chapterIndex:r.chapterIndex,localStart:r.localStart,absoluteStart:r.start,
      show:function(){return runtime&&typeof runtime.show==='function'?runtime.show(r.chapterIndex,r.localStart,''):Promise.resolve(false);}};
  }
  root.BookNoteCanonicalTocResolver={version:'1.1.0',resolve:resolve,resolveById:resolveById,resolveToReader:resolveToReader};
})(typeof window!=='undefined'?window:self);
