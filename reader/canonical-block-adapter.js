/* BookNote Canonical Block/Chapter Adapter v1.0.
 * Phase 4b: connects existing TXT/EPUB chapter adapters to the additive
 * Canonical Block Model. It normalizes structure only; rendering/search/open
 * behavior remains unchanged.
 */
(function(root){
  'use strict';
  function s(v){return String(v==null?'':v);}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function fmt(src){return s(src&&src.format).toLowerCase().replace(/^application\//,'').split(/[+\/;]/)[0];}
  function cloneChapter(c,i){
    c=c||{};
    return {index:i,label:s(c.label)||'正文',href:s(c.href),fragment:s(c.fragment),textStart:n(c.textStart,0),textEnd:n(c.textEnd,n(c.textStart,0)+s(c.text).length),text:s(c.text),html:s(c.html),headingLevel:n(c.headingLevel,0),isNavigation:c.isNavigation!==false};
  }
  function normalize(opts){
    opts=opts||{}; var source=opts.source||{}, content=opts.content||{}, format=fmt(source)||fmt(content);
    var chapters=Array.isArray(opts.chapters)?opts.chapters:[];
    var text=s(opts.text);
    if(format==='txt' && root.BookNoteTxtCanonical){
      chapters=root.BookNoteTxtCanonical.normalize({title:s(opts.title),text:text,chapters:chapters});
    } else {
      chapters=chapters.map(cloneChapter);
      if(!chapters.length){chapters=[cloneChapter({index:0,label:s(opts.title)||'正文',textStart:0,textEnd:text.length,text:text,isNavigation:false},0)];}
    }
    chapters.forEach(function(c,i){c.index=i;});
    return {format:format||'reflow',chapters:chapters,text:text};
  }
  function build(opts){
    opts=opts||{};
    var normalized=normalize(opts);
    var blocks=root.BookNoteCanonicalBlocks?root.BookNoteCanonicalBlocks.buildBlocks(normalized.chapters):[];
    var toc=root.BookNoteCanonicalToc?root.BookNoteCanonicalToc.build({chapters:normalized.chapters,toc:opts.toc||[]}).tree:(opts.toc||[]);
    var doc=root.BookNoteCanonicalBlocks?root.BookNoteCanonicalBlocks.createDocument({metadata:opts.metadata||{},source:Object.assign({},opts.source||{},{format:normalized.format}),text:normalized.text,chapters:normalized.chapters,blocks:blocks,toc:toc,locators:opts.locators||{}}):null;
    return {format:normalized.format,chapters:normalized.chapters,blocks:blocks,toc:toc,document:doc};
  }
  root.BookNoteCanonicalBlockAdapter={version:'1.0.0',normalize:normalize,build:build};
})(typeof window!=='undefined'?window:self);
