(function(){"use strict";
var Bridge={
  version:"readest-bridge-v2",
  async openBook(bookId){if(!bookId)throw new Error("Missing bookId");await BookLibraryDB.ensure();var meta=await BookLibraryDB.getMeta(String(bookId));if(!meta)throw new Error("Book not found: "+bookId);return {meta:meta,content:await BookLibraryDB.getContent(String(bookId)),source:await BookLibraryDB.getSource(String(bookId))};},
  async saveProgress(bookId,state){var id=String(bookId||"");var key="booknoteReadingState:"+id;var next=Object.assign({updatedAt:Date.now()},state||{});var o={};o[key]=next;await browser.storage.local.set(o);try{var meta=await BookLibraryDB.getMeta(id);if(meta){var p=Math.max(0,Math.min(1,Number(next.progress)||0)),status=p>=0.995?"finished":p>0.005?"reading":String(meta.readingStatus||"")||"unread";if(meta.readingStatus!==status){meta.readingStatus=status;await BookLibraryDB.putMeta(meta);}}}catch(e){console.warn("BookNote reader progress meta sync skipped",e)}return next;},
  async loadProgress(bookId){var key="booknoteReadingState:"+String(bookId||"");var r=await browser.storage.local.get(key);return r[key]||{progress:0,locator:{}};},
  async search(query){query=String(query||"").trim();if(!query)return [];await BookLibraryDB.ensure();await BookNoteSearchIndex.ensure(await BookLibraryDB.listMeta());return BookNoteSearchIndex.search(query);},
  async listAnnotations(bookId,type){if(!globalThis.BookNoteAnnotations)throw new Error("Annotation service unavailable");return BookNoteAnnotations.list(String(bookId||""),type||null);},
  async saveAnnotation(annotation){if(!globalThis.BookNoteAnnotations)throw new Error("Annotation service unavailable");return BookNoteAnnotations.upsert(annotation);},
  async removeAnnotation(id){if(!globalThis.BookNoteAnnotations)throw new Error("Annotation service unavailable");return BookNoteAnnotations.remove(id);},
  async getReaderSettings(){var r=await browser.storage.local.get("booknoteReaderSettings");return Object.assign({fontScale:100,lineHeight:1.85,theme:"light",width:"medium",layout:"double"},r.booknoteReaderSettings||{});},
  async saveReaderSettings(settings){var v=Object.assign({},settings||{});return browser.storage.local.set({booknoteReaderSettings:v});},
  async navigate(bookId,locator){return {bookId:String(bookId||""),locator:locator||{}}}
};
globalThis.BookNoteReadestBridge=Bridge;
})();
