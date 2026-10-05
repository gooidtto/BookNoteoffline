/* BookNote Canonical Office Block Adapter v1.0.
 * DOCX/ODT: additive adapter over existing parsed chapters. It preserves the
 * existing Office parser/rendering/navigation output and only normalizes the
 * logical block structure for the Canonical Document Model.
 */
(function(root){
  'use strict';
  function s(v){return String(v==null?'':v);}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function fmt(v){return s(v).toLowerCase().replace(/^application\//,'').split(/[+\/;]/)[0];}
  function isOffice(format){format=fmt(format);return format==='docx'||format==='odt'||format==='openxmlformats-officedocument.wordprocessingml.document'||format==='vnd.oasis.opendocument.text';}
  function normalizeChapter(c,i){
    c=c||{};
    return {index:i,label:s(c.label)||'正文',href:s(c.href),fragment:s(c.fragment),textStart:n(c.textStart,0),textEnd:n(c.textEnd,n(c.textStart,0)+s(c.text).length),text:s(c.text),html:s(c.html),headingLevel:n(c.headingLevel,0),isNavigation:c.isNavigation!==false};
  }
  function normalize(opts){
    opts=opts||{};var format=fmt(opts.format||opts.source&&opts.source.format||opts.content&&opts.content.format);
    if(!isOffice(format))return null;
    var chapters=Array.isArray(opts.chapters)?opts.chapters.map(normalizeChapter):[];
    var text=s(opts.text);
    if(!chapters.length)chapters=[normalizeChapter({label:s(opts.title)||'正文',text:text,textStart:0,textEnd:text.length,isNavigation:false},0)];
    chapters.forEach(function(c,i){c.index=i;});
    var blocks=root.BookNoteCanonicalBlocks?root.BookNoteCanonicalBlocks.buildBlocks(chapters):[];
    return {format:format,chapters:chapters,blocks:blocks,text:text};
  }
  function build(opts){
    var x=normalize(opts);if(!x)return null;
    var toc=root.BookNoteCanonicalToc?root.BookNoteCanonicalToc.build({chapters:x.chapters,toc:opts.toc||[]}).tree:(opts.toc||[]);
    var doc=root.BookNoteCanonicalBlocks?root.BookNoteCanonicalBlocks.createDocument({metadata:opts.metadata||{},source:Object.assign({},opts.source||{},{format:x.format}),text:x.text,chapters:x.chapters,blocks:x.blocks,toc:toc,locators:opts.locators||{}}):null;
    var validation=root.BookNoteCanonicalBlocks&&doc?root.BookNoteCanonicalBlocks.validateDocument(doc):{ok:true,errors:[],warnings:[]};
    return {format:x.format,chapters:x.chapters,blocks:x.blocks,toc:toc,document:doc,validation:validation};
  }
  root.BookNoteCanonicalOfficeBlockAdapter={version:'1.0.0',isOffice:isOffice,normalize:normalize,build:build};
})(typeof window!=='undefined'?window:self);
