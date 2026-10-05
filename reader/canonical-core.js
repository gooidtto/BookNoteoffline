/* BookNote Canonical Model v1.1 core.
 * Phase 1: schema normalization + chapter coverage/TOC validation.
 * Intentionally behavior-preserving: validation never rewrites reader data.
 */
(function(root){
  'use strict';
  function num(v,d){var n=Number(v);return Number.isFinite(n)?n:d;}
  function textOf(x){return String(x==null?'':x);}
  function normalizeChapter(x,i){
    x=x||{};
    var start=Math.max(0,num(x.textStart,0));
    var text=textOf(x.text);
    var end=num(x.textEnd,start+text.length);
    return {
      index:i,
      id:textOf(x.id||('chapter-'+i)),
      label:textOf(x.label||''),
      headingLevel:Math.max(1,num(x.headingLevel,1)),
      textStart:start,
      textEnd:end,
      href:textOf(x.href||''),
      fragment:textOf(x.fragment||''),
      text:text,
      html:textOf(x.html||''),
      isNavigation:x.isNavigation!==false
    };
  }
  function normalizeChapters(chapters){
    return Array.isArray(chapters)?chapters.map(normalizeChapter):[];
  }
  function validateCoverage(chapters,totalLength){
    var c=normalizeChapters(chapters), errors=[], warnings=[];
    if(!c.length){
      warnings.push('no chapters');
      return {ok:true,errors:errors,warnings:warnings,chapters:c,totalLength:num(totalLength,0)};
    }
    var total=num(totalLength,c[c.length-1].textEnd);
    if(Math.abs(c[0].textStart)>0) errors.push({code:'CHAPTER_START_NOT_ZERO',index:0,actual:c[0].textStart,expected:0});
    for(var i=0;i<c.length;i++){
      var x=c[i];
      if(x.textStart<0) errors.push({code:'NEGATIVE_START',index:i,value:x.textStart});
      if(x.textEnd<x.textStart) errors.push({code:'NEGATIVE_RANGE',index:i,start:x.textStart,end:x.textEnd});
      if(x.textEnd>total) errors.push({code:'END_OUT_OF_BOUNDS',index:i,end:x.textEnd,total:total});
      if(i>0){
        var p=c[i-1];
        if(x.textStart>p.textEnd) errors.push({code:'CHAPTER_GAP',index:i,previousEnd:p.textEnd,start:x.textStart,gap:x.textStart-p.textEnd});
        if(x.textStart<p.textEnd) errors.push({code:'CHAPTER_OVERLAP',index:i,previousEnd:p.textEnd,start:x.textStart,overlap:p.textEnd-x.textStart});
        if(x.index!==i) warnings.push({code:'NON_CANONICAL_INDEX',index:i,actual:x.index,expected:i});
      }
    }
    var last=c[c.length-1];
    if(Math.abs(last.textEnd-total)>0) errors.push({code:'CHAPTER_END_NOT_TOTAL',index:c.length-1,actual:last.textEnd,expected:total});
    return {ok:errors.length===0,errors:errors,warnings:warnings,chapters:c,totalLength:total};
  }
  function validateToc(toc,chapters){
    var errors=[],warnings=[],nodes=Array.isArray(toc)?toc:[];
    var max=Array.isArray(chapters)?chapters.length:0;
    function walk(list,parentLevel){
      list.forEach(function(n,i){
        if(!n||typeof n!=='object'){errors.push({code:'TOC_NODE_INVALID',path:String(i)});return;}
        var idx=num(n.chapterIndex!=null?n.chapterIndex:n.index,-1);
        if(idx<0||idx>=max) errors.push({code:'TOC_CHAPTER_INDEX_INVALID',index:idx});
        var level=Math.max(1,num(n.level!=null?n.level:n.headingLevel,1));
        if(level<parentLevel) warnings.push({code:'TOC_LEVEL_DECREASE',level:level,parentLevel:parentLevel});
        if(Array.isArray(n.children)) walk(n.children,level);
      });
    }
    walk(nodes,1);
    return {ok:errors.length===0,errors:errors,warnings:warnings};
  }
  function validateDocument(doc){
    doc=doc||{};
    var chapters=normalizeChapters(doc.chapters), text=textOf(doc.text), coverage=validateCoverage(chapters,text.length), toc=validateToc(doc.toc,chapters);
    var errors=coverage.errors.concat(toc.errors), warnings=coverage.warnings.concat(toc.warnings);
    return {ok:errors.length===0,errors:errors,warnings:warnings,totalLength:text.length,chapters:chapters,toc:Array.isArray(doc.toc)?doc.toc:[]};
  }
  function assertDocument(doc){
    var r=validateDocument(doc);
    if(!r.ok){var e=new Error('Invalid CanonicalDocument: '+r.errors.map(function(x){return x.code;}).join(', '));e.validation=r;throw e;}
    return r;
  }
  root.BookNoteCanonical={version:'1.1.0',normalizeChapter:normalizeChapter,normalizeChapters:normalizeChapters,validateCoverage:validateCoverage,validateToc:validateToc,validateDocument:validateDocument,assertDocument:assertDocument};
})(typeof window!=='undefined'?window:self);
