/* BookNote TXT Canonical Adapter v1.0
 * Raw decoded TXT text remains authoritative. Navigation is a sidecar.
 * The adapter only normalizes chapter ranges; it never mutates the source text.
 */
(function(root){
  'use strict';
  function s(v){return String(v==null?'':v);}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function normalize(documentLike){
    var d=documentLike||{}, text=s(d.text), total=text.length;
    var chapters=Array.isArray(d.chapters)?d.chapters:[];
    if(!chapters.length){
      return [{index:0,label:s(d.title)||'正文',href:'',fragment:'',textStart:0,textEnd:total,text:text,html:s(d.html),headingLevel:0,isNavigation:false}];
    }
    var sorted=chapters.map(function(c,i){
      var start=Math.max(0,Math.min(total,n(c&&c.textStart,0)));
      var end=Math.max(start,Math.min(total,n(c&&c.textEnd,start+s(c&&c.text).length)));
      return {src:c||{},originalIndex:i,start:start,end:end};
    }).sort(function(a,b){return a.start-b.start||a.originalIndex-b.originalIndex;});
    var out=[],cursor=0;
    sorted.forEach(function(item){
      var c=item.src, start=item.start, end=item.end;
      if(start>cursor){
        /* Fill only a structural gap with source text; never drop raw TXT. */
        out.push({index:out.length,label:'正文',href:'',fragment:'',textStart:cursor,textEnd:start,text:text.slice(cursor,start),html:'',headingLevel:0,isNavigation:false});
      }
      start=Math.max(cursor,start); end=Math.max(start,end);
      var sourceText=text.slice(start,end);
      out.push({index:out.length,label:s(c.label)||'正文',href:s(c.href),fragment:s(c.fragment),textStart:start,textEnd:end,text:sourceText,html:s(c.html),headingLevel:n(c.headingLevel,0),isNavigation:c.isNavigation!==false});
      cursor=end;
    });
    if(cursor<total){out.push({index:out.length,label:'正文',href:'',fragment:'',textStart:cursor,textEnd:total,text:text.slice(cursor),html:'',headingLevel:0,isNavigation:false});}
    return out.length?out:[{index:0,label:s(d.title)||'正文',href:'',fragment:'',textStart:0,textEnd:total,text:text,html:s(d.html),headingLevel:0,isNavigation:false}];
  }
  function validate(chapters,total){
    var errors=[], list=Array.isArray(chapters)?chapters:[], nTotal=n(total,0), cursor=0;
    list.forEach(function(c,i){
      var st=n(c&&c.textStart,0),en=n(c&&c.textEnd,st);
      if(st!==cursor)errors.push('gap/overlap at '+i+': expected '+cursor+', got '+st);
      if(en<st)errors.push('negative range at '+i);
      cursor=en;
    });
    if(cursor!==nTotal)errors.push('final end '+cursor+' != '+nTotal);
    return {ok:errors.length===0,errors:errors};
  }
  root.BookNoteTxtCanonical={version:'1.0.0',normalize:normalize,validate:validate};
})(typeof window!=='undefined'?window:self);
