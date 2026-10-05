(function(){
  "use strict";
  var browser=globalThis.browser;
  var DB_NAME="BookNoteAnnotationDB", DB_VERSION=1, STORE="annotations";
  var dbPromise=null;
  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(function(resolve,reject){
      var req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=function(){var db=req.result,store;if(!db.objectStoreNames.contains(STORE)){store=db.createObjectStore(STORE,{keyPath:"id"});}else store=req.transaction.objectStore(STORE);if(!store.indexNames.contains("bookId"))store.createIndex("bookId","bookId",{unique:false});if(!store.indexNames.contains("type"))store.createIndex("type","type",{unique:false});if(!store.indexNames.contains("updatedAt"))store.createIndex("updatedAt","updatedAt",{unique:false});};
      req.onsuccess=function(){resolve(req.result);};req.onerror=function(){dbPromise=null;reject(req.error||new Error("Annotation DB open failed"));};
    });return dbPromise;
  }
  function tx(mode){return openDb().then(function(db){return db.transaction(STORE,mode).objectStore(STORE);});}
  function request(req){return new Promise(function(resolve,reject){req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error||new Error("Annotation DB request failed"));};});}
  function now(){return Date.now();}
  function id(prefix){return String(prefix||"annotation")+"-"+now()+"-"+Math.random().toString(36).slice(2,9);}
  function normalize(a){
    a=Object.assign({},a||{});a.id=String(a.id||id(a.type||"annotation"));a.bookId=String(a.bookId||"");a.type=String(a.type||"note");a.text=String(a.text||a.selectedText||"");a.note=String(a.note||a.noteText||"");a.color=String(a.color||"yellow");a.tags=Array.isArray(a.tags)?a.tags.filter(Boolean).map(String):[];a.chapterIndex=Number.isFinite(Number(a.chapterIndex))?Number(a.chapterIndex):0;a.chapterLabel=String(a.chapterLabel||a.readerChapter||"");a.start=(a.start!==null&&a.start!==undefined&&a.start!==""&&Number.isFinite(Number(a.start)))?Number(a.start):null;a.end=(a.end!==null&&a.end!==undefined&&a.end!==""&&Number.isFinite(Number(a.end)))?Number(a.end):null;a.progress=Number.isFinite(Number(a.progress))?Number(a.progress):null;a.locator=a.locator&&typeof a.locator==="object"?a.locator:{};a.position=a.position&&typeof a.position==="object"?a.position:null;a.positionVersion=Number.isFinite(Number(a.positionVersion))?Number(a.positionVersion):null;a.format=String(a.format||a.position&&a.position.format||"");a.createdAt=a.createdAt||now();a.updatedAt=a.updatedAt||now();a.source=String(a.source||"reader");return a;
  }
  function upsert(annotation){var a=normalize(annotation);return tx("readwrite").then(function(s){return request(s.put(a));}).then(function(){return a;});}
  function get(idv){return tx("readonly").then(function(s){return request(s.get(String(idv||"")));});}
  function list(bookId,type){return tx("readonly").then(function(s){var idx=bookId?s.index("bookId"):s;return request(bookId?idx.getAll(String(bookId)):idx.getAll()).then(function(items){items=items||[];if(type)items=items.filter(function(a){return a.type===type;});return items.sort(function(a,b){return (Number(b.updatedAt)||0)-(Number(a.updatedAt)||0);});});});}
  function remove(idv){return tx("readwrite").then(function(s){return request(s.delete(String(idv||"")));});}
  function removeBook(bookId){bookId=String(bookId||"");if(!bookId)return Promise.resolve(0);return openDb().then(function(db){return new Promise(function(resolve,reject){var t=db.transaction(STORE,"readwrite"),idx=t.objectStore(STORE).index("bookId"),count=0,r=idx.openCursor(IDBKeyRange.only(bookId));r.onsuccess=function(){var c=r.result;if(!c)return;count++;c.delete();c.continue();};r.onerror=function(){reject(r.error||new Error("Annotation delete failed"));};t.oncomplete=function(){resolve(count);};t.onerror=function(){reject(t.error||new Error("Annotation delete failed"));};});});}
  function search(q,bookId){q=String(q||"").trim().toLocaleLowerCase();return list(bookId).then(function(items){if(!q)return items;return items.filter(function(a){return [a.text,a.note,a.chapterLabel,(a.tags||[]).join(" ")].join(" ").toLocaleLowerCase().indexOf(q)>=0;});});}
  function migrateBook(book,state,notes){
    var bookId=String(book&&book.id||"");if(!bookId)return Promise.resolve([]);return list(bookId).then(function(existing){var byId={};existing.forEach(function(a){byId[a.id]=a;});var candidates=[];
      (state&&state.highlights||[]).forEach(function(h){var aid=String(h.id||("highlight-"+bookId+"-"+h.start+"-"+h.end));if(!byId[aid])candidates.push(normalize({id:aid,bookId:bookId,type:"highlight",text:h.text||"",color:h.color||"yellow",start:h.start,end:h.end,chapterIndex:h.chapterIndex||0,chapterLabel:h.chapterLabel||"",progress:h.progress,createdAt:h.createdAt||now(),source:"reader-legacy"}));});
      (state&&state.bookmarks||[]).forEach(function(b){var aid=String(b.id||("bookmark-"+bookId+"-"+(b.chapterIndex||0)+"-"+(b.progress||0)));if(!byId[aid])candidates.push(normalize({id:aid,bookId:bookId,type:"bookmark",text:b.excerpt||"",chapterIndex:b.chapterIndex||0,chapterLabel:b.chapterLabel||"",progress:b.progress,locator:b.locator||{},createdAt:b.createdAt||now(),source:"reader-legacy"}));});
      (notes||[]).filter(function(n){return n&&n.sourceType==="book-reader"&&String(n.bookId||"")===bookId;}).forEach(function(n){var type=n.categoryType==="excerpt"?"quote":"note",aid="legacy-note-"+String(n.id||id(type));if(!byId[aid])candidates.push(normalize({id:aid,bookId:bookId,type:type,text:n.selectedText||"",note:n.noteText||"",chapterLabel:n.readerChapter||"",progress:n.readerProgress,color:"yellow",createdAt:n.createdAt||now(),updatedAt:n.updatedAt||n.createdAt||now(),source:"reader-note-legacy"}));});
      if(!candidates.length)return existing;return Promise.all(candidates.map(upsert)).then(function(added){return existing.concat(added);});
    });
  }
  function migrateAll(){
    var load=Promise.all([globalThis.BookLibraryDB?BookLibraryDB.listMeta():Promise.resolve([]),browser.storage.local.get("booknoteNotes").then(function(r){return Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];})]).then(function(x){var books=x[0]||[];var notes=x[1]||[];var by={};books.forEach(function(b){by[String(b.id)]=b;});notes.filter(function(n){return n&&n.sourceType==="imported-document"&&n.id&&!by[String(n.id)];}).forEach(function(n){by[String(n.id)]=n;});return Object.keys(by).map(function(k){return by[k];});});
    return Promise.resolve(load).then(function(books){return Promise.all((books||[]).map(function(book){return browser.storage.local.get(keyForBook(book.id)).then(function(r){return migrateBook(book,r[keyForBook(book.id)]||{},[]);});}));});
  }
  function keyForBook(id){return "booknoteReadingState:"+String(id||"");}
  function exportBook(bookId){return list(bookId).then(function(items){return {version:1,bookId:String(bookId||""),exportedAt:new Date().toISOString(),annotations:items};});}
  function exportAll(){return list().then(function(items){return {version:1,exportedAt:new Date().toISOString(),count:items.length,annotations:items};});}
  function importData(payload,options){
    options=options||{};
    var rows=payload&&Array.isArray(payload.annotations)?payload.annotations:(payload&&Array.isArray(payload.items)?payload.items:null);
    if(!rows) return Promise.reject(new Error("无效的标记导入文件：缺少 annotations/items"));
    if(payload.version!=null&&Number(payload.version)!==1) return Promise.reject(new Error("不支持的标记导出版本："+payload.version));
    var allowed=options.bookIds?new Set((options.bookIds||[]).map(String)):null;
    var skippedMissingBook=0,skippedInvalid=0,imported=0,updated=0,created=0;
    return Promise.all(rows.map(function(raw){
      if(!raw||raw.bookId==null||String(raw.bookId)===""){skippedInvalid++;return null;}
      var a=normalize(raw);
      if(allowed&&!allowed.has(String(a.bookId))){skippedMissingBook++;return null;}
      return get(a.id).then(function(existing){if(existing)updated++;else created++;return upsert(a).then(function(){imported++;});});
    })).then(function(){return {total:rows.length,imported:imported,created:created,updated:updated,skippedMissingBook:skippedMissingBook,skippedInvalid:skippedInvalid};});
  }
  function removeMany(ids){ids=(ids||[]).map(String);if(!ids.length)return Promise.resolve(0);return tx("readwrite").then(function(s){ids.forEach(function(i){s.delete(i);});return new Promise(function(resolve,reject){var db=s.transaction.db;/* transaction completion is owned by the object store's transaction */s.transaction.oncomplete=function(){resolve(ids.length);};s.transaction.onerror=function(){reject(s.transaction.error||new Error("Annotation batch delete failed"));};});});}
  globalThis.BookNoteAnnotations={open:openDb,upsert:upsert,get:get,list:list,remove:remove,removeBook:removeBook,search:search,migrateBook:migrateBook,migrateAll:migrateAll,exportBook:exportBook,exportAll:exportAll,importData:importData,removeMany:removeMany,create:function(a){return upsert(a);}};
  setTimeout(function(){migrateAll().catch(function(e){console.warn("BookNote annotations migration",e);});},0);
})();
