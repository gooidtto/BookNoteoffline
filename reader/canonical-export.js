/* BookNote Canonical Export Model v1.0.0.
 * Phase 5/6: stable JSON interchange for the canonical document + user locators.
 * Export is additive: it never mutates Reader/Search/TOC/annotation behavior.
 * DOM nodes, Blob/ObjectURL and runtime objects are never serialized.
 */
(function(root){
  'use strict';
  function s(v){return String(v==null?'':v);}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function clone(v){
    if(v==null)return v;
    if(Array.isArray(v))return v.map(clone);
    if(typeof v==='object'){
      var o={};Object.keys(v).forEach(function(k){
        var x=v[k];
        if(typeof x==='function'||typeof x==='undefined')return;
        if(typeof Blob!=='undefined'&&x instanceof Blob)return;
        if(x&&typeof x==='object'&&x.nodeType)return;
        o[k]=clone(x);
      });return o;
    }
    return v;
  }
  function cleanSource(source){
    source=source&&typeof source==='object'?source:{};
    var out={};
    Object.keys(source).forEach(function(k){
      var v=source[k],lk=String(k).toLowerCase();
      if(typeof v==='function'||typeof v==='undefined'||v instanceof ArrayBuffer)return;
      if(typeof Blob!=='undefined'&&v instanceof Blob)return;
      if(/blob|objecturl|arraybuffer|buffer|bytes|binary|dataurl/.test(lk))return;
      if(v&&typeof v==='object'&&v.nodeType)return;
      try{out[k]=clone(v);}catch(_){ }
    });
    return out;
  }
  function normalizeLocator(item,chapters){
    if(!item)return null;
    var l=item.locator||null;
    if(l&&String(l.type||'')==='fixed'&&root.BookNoteLocator&&BookNoteLocator.fixed){return clone(BookNoteLocator.fixed(l));}
    if(l){
      var li=Math.max(0,n(l.chapterIndex,n(item.chapterIndex,0))),lc=(chapters||[])[li]||{},lb=n(lc.textStart,0),llen=Math.max(0,n(lc.textEnd,lb+s(lc.text).length)-lb);
      var ls=Math.max(0,Math.min(llen,n(l.start,l.offset!=null?n(l.offset,0):0))),le=Math.max(ls,Math.min(llen,n(l.end,ls)));
      var r=root.BookNoteLocator&&BookNoteLocator.reflow?BookNoteLocator.reflow(Object.assign({},l,{chapterIndex:li,start:ls,end:le,href:l.href||lc.href,fragment:l.fragment||lc.fragment})): {type:s(l.type||'reflow'),chapterIndex:li,start:ls,end:le,href:s(l.href||lc.href),fragment:s(l.fragment||lc.fragment),textQuote:clone(l.textQuote||l.quote||{})};
      r.absolute={chapterIndex:li,start:lb+ls,end:lb+le};
      return clone(r);
    }
    var idx=Math.max(0,n(item.chapterIndex,0)),c=(chapters||[])[idx]||{},base=n(c.textStart,0),start=n(item.start,base+n(item.offset,0)),end=n(item.end,start),localStart=Math.max(0,start-base),localEnd=Math.max(localStart,end-base);
    if(root.BookNoteLocator&&BookNoteLocator.reflow){
      var rr=BookNoteLocator.reflow({chapterIndex:idx,start:localStart,end:localEnd,href:c.href,fragment:c.fragment,textQuote:{exact:s(item.text||''),prefix:'',suffix:''}});
      rr.absolute={chapterIndex:idx,start:start,end:end};
      return clone(rr);
    }
    return {type:'reflow',chapterIndex:idx,start:localStart,end:localEnd,href:s(c.href),fragment:s(c.fragment),textQuote:{exact:s(item.text||''),prefix:'',suffix:''}};
  }
  function normalizeAnnotation(item,chapters){
    var out=clone(item||{});
    out.locator=normalizeLocator(item,chapters);
    return out;
  }
  async function blobToBase64(blob){
    if(!blob||typeof blob.arrayBuffer!=='function')return null;
    var ab=await blob.arrayBuffer(),u=new Uint8Array(ab),out='';
    for(var i=0;i<u.length;i+=0x8000)out+=String.fromCharCode.apply(null,u.subarray(i,Math.min(i+0x8000,u.length)));
    return btoa(out);
  }
  async function buildAsync(opts){
    opts=opts||{};
    var doc=opts.document||{}, source=cleanSource(doc.source||{}), fmt=s(source.format||source.documentFormat||'').toLowerCase();
    if(fmt==='pdf' && doc.source && doc.source.blob && typeof doc.source.blob.arrayBuffer==='function'){
      var data=await blobToBase64(doc.source.blob);
      if(data)source.archive={encoding:'base64',mime:s(doc.source.blob.type||source.mime||'application/pdf'),fileName:s(source.fileName||((doc.metadata&&doc.metadata.title)||'book')+'.pdf'),size:Number(doc.source.blob.size)||0,data:data};
    }
    var next=Object.assign({},opts,{document:Object.assign({},doc,{source:source})});
    return build(next);
  }
  function build(opts){
    opts=opts||{};
    var doc=opts.document||{},chapters=Array.isArray(doc.chapters)?doc.chapters:[],annotations=Array.isArray(opts.annotations)?opts.annotations:[];
    /* Canonicalize chapter identity before persistence so Export -> Import cannot
       introduce generated chapter ids on the first round-trip. */
    if(root.BookNoteCanonical&&typeof BookNoteCanonical.normalizeChapters==='function') chapters=BookNoteCanonical.normalizeChapters(chapters);
    var canonicalText=s(doc.text||'');
    chapters=chapters.map(function(c){var x=Object.assign({},c);x.text=canonicalText.slice(Math.max(0,n(c.textStart,0)),Math.max(Math.max(0,n(c.textStart,0)),n(c.textEnd,Math.max(0,n(c.textStart,0)))));return x;});
    var reading=opts.readingPosition||null;
    var exportBlocks=Array.isArray(doc.blocks)?doc.blocks.map(function(b,i){var x=clone(b);if(String((doc.source||{}).format||doc.format||'').toLowerCase()==='pdf')x.index=i;return x;}):[];
    var exportDoc={
      schema:'booknote.canonical.export',
      schemaVersion:'1.0.0',
      exportedAt:s(opts.exportedAt||new Date().toISOString()),
      document:{
        version:s(doc.version||'1.0.0'),
        metadata:clone(doc.metadata||{}),
        source:cleanSource(doc.source||{}),
        text:s(doc.text||''),
        chapters:clone(chapters),
        blocks:exportBlocks,
        toc:clone(Array.isArray(doc.toc)?doc.toc:[]),
        locators:clone(doc.locators||{})
      },
      annotations:annotations.map(function(a){return normalizeAnnotation(a,chapters);}),
      readingPosition:reading?clone(reading):null,
      compatibility:{legacyAnnotationFields:true,domRangesPersisted:false}
    };
    if(exportDoc.readingPosition&&exportDoc.readingPosition.locator){
      exportDoc.readingPosition.locator=normalizeLocator(exportDoc.readingPosition,chapters)||clone(exportDoc.readingPosition.locator);
    }
    return exportDoc;
  }
  function validate(payload){
    var errors=[],p=payload||{};
    if(p.schema!=='booknote.canonical.export')errors.push({code:'EXPORT_SCHEMA_INVALID'});
    if(p.schemaVersion!=='1.0.0')errors.push({code:'EXPORT_SCHEMA_VERSION_INVALID',actual:p.schemaVersion});
    if(!p.document||typeof p.document!=='object')errors.push({code:'EXPORT_DOCUMENT_MISSING'});
    if(!Array.isArray(p.document&&p.document.chapters))errors.push({code:'EXPORT_CHAPTERS_MISSING'});
    if(!Array.isArray(p.document&&p.document.blocks))errors.push({code:'EXPORT_BLOCKS_MISSING'});
    if(!Array.isArray(p.document&&p.document.toc))errors.push({code:'EXPORT_TOC_MISSING'});
    if(!Array.isArray(p.annotations))errors.push({code:'EXPORT_ANNOTATIONS_MISSING'});
    return {ok:errors.length===0,errors:errors};
  }
  root.BookNoteCanonicalExport={version:'1.0.0',build:build,buildAsync:buildAsync,blobToBase64:blobToBase64,validate:validate,normalizeLocator:normalizeLocator,normalizeAnnotation:normalizeAnnotation};
})(typeof window!=='undefined'?window:self);
