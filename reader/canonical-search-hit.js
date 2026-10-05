/* BookNote Canonical Search Hit v1.0.
 * One search occurrence = one canonical hit. Format-specific locators remain separate.
 */
(function(root){
  'use strict';
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function s(v){return String(v==null?'':v);}
  function normalize(h){
    h=h||{};
    var out={
      start:Math.max(0,n(h.start,0)),
      end:Math.max(0,n(h.end,0)),
      chapterIndex:Math.max(0,Math.floor(n(h.chapterIndex,0))),
      text:s(h.text||h.quote||''),
      quote:s(h.quote||h.text||''),
      locator:h.locator||null,
      format:s(h.format||'reflow')
    };
    if(out.end<out.start)out.end=out.start;
    // EPUB v7.11.4: preserve format-specific locator coordinates through normalization.
    var loc=h.locator||h.epubLocator||null;
    if(loc&&typeof loc==='object'){
      out.locator=loc;
      if(loc.sectionIndex!=null)out.sectionIndex=Math.max(0,Math.floor(n(loc.sectionIndex,out.chapterIndex)));
      if(loc.spineIndex!=null)out.sectionIndex=Math.max(0,Math.floor(n(loc.spineIndex,out.sectionIndex||0)));
      if(loc.logicalChapterIndex!=null)out.logicalChapterIndex=Math.max(0,Math.floor(n(loc.logicalChapterIndex,0)));
      if(loc.logicalChapterId!=null)out.logicalChapterId=s(loc.logicalChapterId);
      if(loc.sectionId!=null)out.sectionId=s(loc.sectionId);
      if(loc.href!=null)out.href=s(loc.href);
      if(loc.blockId!=null)out.blockId=s(loc.blockId);
      if(loc.sentenceId!=null)out.sentenceId=s(loc.sentenceId);
      if(loc.start!=null&&loc.end!=null){
        out.format='epub';
      }
    }
    ['sectionIndex','logicalChapterIndex','logicalChapterId','sectionId','href','blockId','blockText','blockTag','sentenceId','sentenceText','queryOffsetInSentence','occurrenceInSection','epubLocator','localStart','localEnd','contextBefore','contextAfter'].forEach(function(k){
      if(h[k]!=null&&out[k]==null)out[k]=h[k];
    });
    if(out.end<out.start)out.end=out.start;
    if(h.page!=null)out.page=Math.max(0,Math.floor(n(h.page,0)));
    if(h.rect)out.rect=h.rect;
    return out;
  }
  function fromRange(start,end,extra){return normalize(Object.assign({},extra||{},{start:start,end:end}));}
  root.BookNoteSearchHit={version:'1.0.0',normalize:normalize,fromRange:fromRange};
})(typeof window!=='undefined'?window:self);
