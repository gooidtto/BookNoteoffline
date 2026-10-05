/* BookNote Canonical Import Model v1.0.0.
 * Phase 6/7: validated Canonical JSON -> persistent BookLibraryDB content.
 * Import never reparses the original source format. It restores the canonical
 * document, annotations and reading position as the new book's authoritative model.
 */
(function(root){
  'use strict';
  function s(v){return String(v==null?'':v);}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function clone(v){
    if(v==null)return v;
    if(Array.isArray(v))return v.map(clone);
    if(typeof v==='object'){
      var o={};Object.keys(v).forEach(function(k){var x=v[k];if(typeof x==='function'||typeof x==='undefined')return;o[k]=clone(x);});return o;
    }
    return v;
  }
  function base64ToBlob(data,mime){
    if(!data||typeof atob!=='function')return null;
    var bin=atob(String(data)),parts=[];
    for(var i=0;i<bin.length;i+=0x8000){var len=Math.min(0x8000,bin.length-i),u=new Uint8Array(len);for(var j=0;j<len;j++)u[j]=bin.charCodeAt(i+j);parts.push(u);}
    return typeof Blob!=='undefined'?new Blob(parts,{type:s(mime||'application/octet-stream')}):null;
  }
  function cleanSource(source){
    source=source&&typeof source==='object'?source:{};var out={};
    Object.keys(source).forEach(function(k){var v=source[k],lk=String(k).toLowerCase();
      if(typeof v==='function'||typeof v==='undefined'||v instanceof ArrayBuffer)return;
      if(typeof Blob!=='undefined'&&v instanceof Blob)return;
      if(/blob|objecturl|arraybuffer|buffer|bytes|binary|dataurl/.test(lk))return;
      if(v&&typeof v==='object'&&v.nodeType)return;
      try{out[k]=clone(v);}catch(_){ }
    });return out;
  }
  function validatePayload(payload){
    var errors=[],p=payload||{},d=p.document;
    if(p.schema!=='booknote.canonical.export')errors.push({code:'IMPORT_SCHEMA_INVALID',actual:p.schema});
    if(p.schemaVersion!=='1.0.0')errors.push({code:'IMPORT_SCHEMA_VERSION_INVALID',actual:p.schemaVersion});
    if(!d||typeof d!=='object')errors.push({code:'IMPORT_DOCUMENT_MISSING'});
    if(!Array.isArray(d&&d.chapters))errors.push({code:'IMPORT_CHAPTERS_MISSING'});
    if(!Array.isArray(d&&d.blocks))errors.push({code:'IMPORT_BLOCKS_MISSING'});
    if(!Array.isArray(d&&d.toc))errors.push({code:'IMPORT_TOC_MISSING'});
    if(!Array.isArray(p.annotations))errors.push({code:'IMPORT_ANNOTATIONS_MISSING'});
    if(errors.length)return {ok:false,errors:errors};
    var fmt=s((d.source&& (d.source.format||d.source.documentFormat))||d.format||'').toLowerCase(), fixed=fmt==='pdf'||d.type==='fixed';
    if(!fixed&&root.BookNoteCanonical&&typeof BookNoteCanonical.validateDocument==='function'){
      var cv=BookNoteCanonical.validateDocument(d);errors=errors.concat(cv.errors||[]);
    }
    if(!fixed&&root.BookNoteCanonicalBlocks&&typeof BookNoteCanonicalBlocks.validateDocument==='function'){
      var bv=BookNoteCanonicalBlocks.validateDocument(d);errors=errors.concat(bv.errors||[]);
    }
    if(fixed&&root.BookNoteCanonicalPdfBlocks&&typeof BookNoteCanonicalPdfBlocks.validate==='function'){
      var pv=BookNoteCanonicalPdfBlocks.validate(d);errors=errors.concat((pv.errors||[]).map(function(x){return {code:'PDF_'+String(x).replace(/\s+/g,'_').toUpperCase()};}));
    }
    return {ok:errors.length===0,errors:errors};
  }
  function normalizeDocument(payload){
    var d=payload.document||{},text=s(d.text),chapters=root.BookNoteCanonical&&BookNoteCanonical.normalizeChapters?BookNoteCanonical.normalizeChapters(d.chapters):clone(d.chapters||[]);
    chapters=chapters.map(function(c,i){var x=Object.assign({},c);x.index=i;x.textStart=n(x.textStart,0);x.textEnd=n(x.textEnd,x.textStart+s(x.text).length);x.text=text.slice(x.textStart,x.textEnd);if(!x.html)x.html='<p>'+escapeHtml(x.text).replace(/\n/g,'</p><p>')+'</p>';return x;});
    var fmt=s(d.format||((d.source||{}).format||'')).toLowerCase(), fixed=fmt==='pdf'||d.type==='fixed';
    var blocks;
    if(fixed){
      blocks=(Array.isArray(d.blocks)?d.blocks:[]).map(function(b,i){b=b||{};var r=b.rect||{},q=b.textQuote||{};return {id:s(b.id||('pdf-block-'+i)),index:i,type:b.type==='image'?'image':'text',chapterIndex:Math.max(0,n(b.chapterIndex,0)),textStart:n(b.textStart,0),textEnd:n(b.textEnd,s(b.text).length),text:s(b.text),html:s(b.html),headingLevel:Math.max(0,n(b.headingLevel,0)),page:Math.max(0,Math.floor(n(b.page,0))),rect:{x:n(r.x,0),y:n(r.y,0),width:Math.max(0,n(r.width,0)),height:Math.max(0,n(r.height,0))},textQuote:{exact:s(q.exact||b.text),prefix:s(q.prefix),suffix:s(q.suffix)},locator:clone(b.locator||{})};});
    }else blocks=root.BookNoteCanonicalBlocks&&BookNoteCanonicalBlocks.normalizeBlocks?BookNoteCanonicalBlocks.normalizeBlocks(d.blocks):clone(d.blocks||[]);
    return {version:s(d.version||'1.0.0'),type:s(d.type||''),format:fmt,metadata:clone(d.metadata||{}),source:cleanSource(d.source||{}),text:text,blocks:blocks,chapters:chapters,toc:clone(d.toc||[]),locators:clone(d.locators||{}),pages:clone(d.pages||[])};
  }
  function escapeHtml(v){return s(v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\\':'&#92;','"':'&quot;'}[c];});}
  function buildContent(doc){
    var html=doc.chapters.map(function(c){return s(c.html)||('<p>'+escapeHtml(c.text)+'</p>');}).join('');
    return {bookId:'',text:doc.text,html:html,chapters:doc.chapters,canonicalDocument:doc,canonicalSource:'booknote.canonical.import',paragraphBoundaryVersion:1,updatedAt:new Date().toISOString()};
  }
  function buildBookRecord(doc,payload,options){
    options=options||{};var md=doc.metadata||{},src=doc.source||{},title=s(md.title||md.documentTitle||options.title||'Canonical Imported Book')||'Canonical Imported Book';
    var originalId=s(options.bookId||'');
    var id=originalId||('canonical-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));
    var fmt=s(src.format||src.documentFormat||md.format||'canonical').toLowerCase()||'canonical';
    var now=new Date().toISOString();
    var meta={id:id,name:title,pageTitle:title,pageUrl:'',documentTitle:title,documentAuthor:s(md.author||md.documentAuthor||''),documentPublisher:s(md.publisher||md.documentPublisher||''),documentLanguage:s(md.language||md.documentLanguage||''),documentDescription:s(md.description||md.documentDescription||''),documentFormat:fmt==='pdf'?'pdf':'canonical',documentFileName:title+'.booknote.json',documentMime:'application/json',documentFileSize:0,category:s(options.category||'未分类'),categoryType:'document',sourceType:'imported-document',createdAt:now,updatedAt:now,documentModified:false,favorite:false,pinned:false,documentEditable:true,documentEncoding:'utf-8',documentEncodingBom:false,legacy:false,canonicalImported:true,canonicalSchemaVersion:s(payload.schemaVersion)};
    return {id:id,meta:meta,content:buildContent(doc)};
  }
  async function persist(payload,options){
    options=options||{};var vr=validatePayload(payload);if(!vr.ok){var e=new Error('Invalid Canonical Import: '+vr.errors.map(function(x){return x.code;}).join(', '));e.validation=vr;throw e;}
    var doc=normalizeDocument(payload),bundle=buildBookRecord(doc,payload,options),content=bundle.content;content.bookId=bundle.id;
    if(!root.BookLibraryDB)throw new Error('BookLibraryDB unavailable');
    await root.BookLibraryDB.ensure();
    var importedSource=null, archive=doc.source&&doc.source.archive;
    var fmt=s(doc.source&& (doc.source.format||doc.source.documentFormat) || doc.format || 'canonical').toLowerCase();
    if(archive&&String(archive.encoding||'').toLowerCase()==='base64'&&fmt==='pdf') importedSource=base64ToBlob(archive.data,archive.mime||'application/pdf');
    await new Promise(function(resolve,reject){
      var dbPromise=root.BookLibraryDB.open();dbPromise.then(function(db){var stores=importedSource?['books_meta','books_content','books_source']:['books_meta','books_content'];var t=db.transaction(stores,'readwrite'),metaStore=t.objectStore('books_meta'),contentStore=t.objectStore('books_content');metaStore.put(bundle.meta);contentStore.put(content);if(importedSource)t.objectStore('books_source').put({bookId:bundle.id,blob:importedSource,mime:String(archive.mime||'application/pdf'),fileName:String(archive.fileName||bundle.meta.documentFileName),size:Number(archive.size)||importedSource.size||0,updatedAt:new Date().toISOString()});t.oncomplete=function(){resolve();};t.onerror=function(){reject(t.error||new Error('Canonical content import failed'));};t.onabort=function(){reject(t.error||new Error('Canonical content import aborted'));};}).catch(reject);
    });
    if(root.BookNoteAnnotations&&Array.isArray(payload.annotations)){
      for(var i=0;i<payload.annotations.length;i++){
        var a=clone(payload.annotations[i]);a.bookId=bundle.id;a.id='import-'+bundle.id+'-'+String(a.id||i);if(root.BookNoteLocator&&a.locator&&a.locator.type==='reflow')a.locator=clone(a.locator);await root.BookNoteAnnotations.upsert(a);
      }
    }
    if(root.browser&&root.browser.storage&&payload.readingPosition){
      var rp=clone(payload.readingPosition);if(rp.locator){var key='booknoteReadingState:'+bundle.id,o={};o[key]=Object.assign({updatedAt:Date.now()},rp);await root.browser.storage.local.set(o);}
    }
    return {id:bundle.id,meta:bundle.meta,document:doc,annotationsImported:Array.isArray(payload.annotations)?payload.annotations.length:0,readingPositionImported:!!payload.readingPosition};
  }
  function parseText(text){var p;try{p=JSON.parse(s(text));}catch(e){var x=new Error('Canonical JSON 解析失败');x.cause=e;throw x;}return p;}
  root.BookNoteCanonicalImport={version:'1.1.0',validate:validatePayload,normalizeDocument:normalizeDocument,buildContent:buildContent,buildBookRecord:buildBookRecord,parseText:parseText,base64ToBlob:base64ToBlob,persist:persist};
})(typeof window!=='undefined'?window:self);
