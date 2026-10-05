/* BookNote Canonical TOC Tree v1.0.0.
 * Navigation is a reference tree: it never owns/copies document body text.
 */
(function(root){
  'use strict';
  function s(v){return String(v==null?'':v).trim();}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function normalizeNode(x,i,parentLevel){
    x=x||{}; var level=Math.max(1,Math.min(6,n(x.headingLevel,parentLevel||1)));
    var children=Array.isArray(x.children)?x.children.map(function(c,j){return normalizeNode(c,j,level+1);}):[];
    return {id:s(x.id||('toc-'+i+'-'+n(x.index,-1))),label:s(x.label),index:n(x.index,-1),headingLevel:level,href:s(x.href),fragment:s(x.fragment),offset:n(x.offset,0),children:children};
  }
  function normalizeTree(tree){return Array.isArray(tree)?tree.map(function(x,i){return normalizeNode(x,i,1);}):[];}
  function fromChapters(chapters){
    var list=Array.isArray(chapters)?chapters:[],root=[],stack=[];
    list.filter(function(c){return c&&c.isNavigation!==false;}).forEach(function(c,i){
      var level=Math.max(1,Math.min(6,n(c.headingLevel,1))),node=normalizeNode({id:'toc-chapter-'+n(c.index,i),label:c.label,index:n(c.index,i),headingLevel:level,href:c.href,fragment:c.fragment,offset:n(c.tocOffset,0),children:[]},i,level);
      while(stack.length&&stack[stack.length-1].headingLevel>=level)stack.pop();
      if(stack.length)stack[stack.length-1].children.push(node);else root.push(node);
      stack.push(node);
    });
    return root;
  }
  function hierarchyFromFlat(raw,chapters){
    var nodes=Array.isArray(raw)?raw:[],list=Array.isArray(chapters)?chapters:[];
    if(!nodes.length)return fromChapters(list);
    var usable=nodes.every(function(x){return !(x&&Array.isArray(x.children)&&x.children.length);});
    if(!usable)return nodes;
    var mapped=nodes.map(function(x,i){var idx=n(x&&x.index,i),c=list[idx]||{},level=Math.max(1,Math.min(6,n(x&&x.headingLevel,c.headingLevel||1)));return normalizeNode({id:x&&x.id,label:x&&x.label,index:idx,headingLevel:level,href:x&&x.href||c.href,fragment:x&&x.fragment||c.fragment,offset:x&&x.offset!=null?x.offset:c.tocOffset,children:[]},i,level);});
    var root=[],stack=[];mapped.forEach(function(node){while(stack.length&&stack[stack.length-1].headingLevel>=node.headingLevel)stack.pop();if(stack.length)stack[stack.length-1].children.push(node);else root.push(node);stack.push(node);});return root;
  }
  function sanitize(tree,chapterCount){
    var errors=[],seen={};
    function walk(nodes,parentLevel){return (nodes||[]).map(function(x,i){
      var q=normalizeNode(x,i,parentLevel),idx=q.index;
      if(idx<0||idx>=chapterCount) errors.push({code:'TOC_CHAPTER_INVALID',id:q.id,index:idx});
      if(!q.label) errors.push({code:'TOC_LABEL_EMPTY',id:q.id,index:idx});
      if(seen[idx]) errors.push({code:'TOC_DUPLICATE_CHAPTER',id:q.id,index:idx}); else if(idx>=0) seen[idx]=1;
      q.children=walk(q.children,q.headingLevel+1); return q;
    });}
    var out=walk(tree,1); return {ok:errors.length===0,errors:errors,tree:out};
  }
  function build(opts){
    opts=opts||{};var chapters=Array.isArray(opts.chapters)?opts.chapters:[],raw=Array.isArray(opts.toc)&&opts.toc.length?hierarchyFromFlat(opts.toc,chapters):fromChapters(chapters),vr=sanitize(raw,chapters.length);
    return {version:'1.0.0',tree:vr.tree,ok:vr.ok,errors:vr.errors};
  }
  root.BookNoteCanonicalToc={version:'1.0.0',normalizeNode:normalizeNode,normalizeTree:normalizeTree,fromChapters:fromChapters,sanitize:sanitize,build:build};
})(typeof window!=='undefined'?window:self);
