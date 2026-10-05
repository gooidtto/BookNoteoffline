/* BookNote Canonical Document Validator v1.0.0.
 * Phase 453: unified structural validation only; never rewrites reader data.
 */
(function(root){
  'use strict';
  var TYPES={heading:1,paragraph:1,list:1,listItem:1,table:1,image:1,quote:1,pageBreak:1,text:1};
  function s(v){return String(v==null?'':v);}
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function issue(code,extra){var x={code:code}; if(extra)Object.keys(extra).forEach(function(k){x[k]=extra[k];}); return x;}
  function validateBlocks(blocks,chapters,total){
    var errors=[],warnings=[],list=Array.isArray(blocks)?blocks:[], ch=Array.isArray(chapters)?chapters:[], seen={};
    list.forEach(function(b,i){
      if(!b||typeof b!=='object'){errors.push(issue('BLOCK_INVALID',{index:i}));return;}
      if(seen[b.id]) errors.push(issue('BLOCK_DUPLICATE_ID',{index:i,id:s(b.id)}));
      seen[b.id]=1;
      if(!TYPES[b.type]) errors.push(issue('BLOCK_TYPE_INVALID',{index:i,type:s(b.type)}));
      var ci=n(b.chapterIndex,-1);
      if(ci<0||ci>=ch.length) errors.push(issue('BLOCK_CHAPTER_INVALID',{index:i,chapterIndex:ci}));
      var start=n(b.textStart,0), end=n(b.textEnd,start+s(b.text).length), totalLen=n(total,0);
      if(start<0||end<start) errors.push(issue('BLOCK_RANGE_INVALID',{index:i,start:start,end:end}));
      if(totalLen>0&&end>totalLen) errors.push(issue('BLOCK_RANGE_OUT_OF_BOUNDS',{index:i,end:end,total:totalLen}));
      if(b.type==='heading' && (n(b.headingLevel,0)<1||n(b.headingLevel,0)>6)) warnings.push(issue('BLOCK_HEADING_LEVEL',{index:i,level:b.headingLevel}));
    });
    return {ok:errors.length===0,errors:errors,warnings:warnings};
  }
  function validateToc(toc,chapters){
    if(root.BookNoteCanonical&&root.BookNoteCanonical.validateToc) return root.BookNoteCanonical.validateToc(toc,chapters);
    return {ok:true,errors:[],warnings:[]};
  }
  function validatePdf(doc){
    if(!doc||doc.format!=='pdf') return {ok:true,errors:[],warnings:[]};
    if(root.BookNoteCanonicalPdfBlocks&&root.BookNoteCanonicalPdfBlocks.validate) return root.BookNoteCanonicalPdfBlocks.validate(doc.pdfBlocks||doc);
    return {ok:true,errors:[],warnings:[]};
  }
  function validate(doc){
    doc=doc||{};
    var text=s(doc.text), chapters=Array.isArray(doc.chapters)?doc.chapters:[], blocks=Array.isArray(doc.blocks)?doc.blocks:[];
    var errors=[],warnings=[];
    var core=root.BookNoteCanonical&&root.BookNoteCanonical.validateDocument?root.BookNoteCanonical.validateDocument({text:text,chapters:chapters,toc:doc.toc||[]}):{ok:true,errors:[],warnings:[]};
    errors=errors.concat(core.errors||[]); warnings=warnings.concat(core.warnings||[]);
    var br=validateBlocks(blocks,chapters,text.length); errors=errors.concat(br.errors); warnings=warnings.concat(br.warnings);
    var tr=validateToc(doc.toc||[],chapters); errors=errors.concat(tr.errors||[]); warnings=warnings.concat(tr.warnings||[]);
    var pr=validatePdf(doc); errors=errors.concat(pr.errors||[]); warnings=warnings.concat(pr.warnings||[]);
    if(doc.source&&doc.source.format==='pdf'&&doc.layoutType&&doc.layoutType!=='fixed') warnings.push(issue('PDF_LAYOUT_NOT_FIXED',{layoutType:doc.layoutType}));
    return {version:'1.0.0',ok:errors.length===0,errors:errors,warnings:warnings,summary:{textLength:text.length,chapterCount:chapters.length,blockCount:blocks.length,tocCount:Array.isArray(doc.toc)?doc.toc.length:0,format:s(doc.source&&doc.source.format||doc.format)}};
  }
  function assert(doc){var r=validate(doc);if(!r.ok){var e=new Error('CanonicalDocument validation failed: '+r.errors.map(function(x){return x.code;}).join(', '));e.validation=r;throw e;}return r;}
  root.BookNoteCanonicalDocumentValidator={version:'1.0.0',validate:validate,assert:assert,validateBlocks:validateBlocks};
})(typeof window!=='undefined'?window:self);
