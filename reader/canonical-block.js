/* BookNote Canonical Block Model v1.0.
 * Phase 4: additive structural model. It does not alter parser/rendering/search behavior.
 * Blocks are logical document units; DOM nodes are never persisted.
 */
(function(root){
  'use strict';
  var TYPES={heading:1,paragraph:1,list:1,listItem:1,table:1,image:1,quote:1,pageBreak:1,text:1};
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function s(v){return String(v==null?'':v);}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function typeOf(tag){
    tag=s(tag).toLowerCase();
    if(/^h[1-6]$/.test(tag))return 'heading';
    if(tag==='p'||tag==='div'||tag==='section'||tag==='article'||tag==='pre')return 'paragraph';
    if(tag==='ul'||tag==='ol')return 'list';
    if(tag==='li')return 'listItem';
    if(tag==='table'||tag==='tbody'||tag==='thead'||tag==='tfoot'||tag==='tr'||tag==='td'||tag==='th')return 'table';
    if(tag==='blockquote')return 'quote';
    if(tag==='img'||tag==='figure'||tag==='svg'||tag==='picture')return 'image';
    if(tag==='hr'||tag==='br')return 'pageBreak';
    return 'text';
  }
  function normalizeBlock(x,i){
    x=x||{};
    var start=Math.max(0,n(x.textStart,0)),end=Math.max(start,n(x.textEnd,start+s(x.text).length));
    return {id:s(x.id||('block-'+i)),index:i,type:TYPES[x.type]?x.type:'text',chapterIndex:Math.max(0,n(x.chapterIndex,0)),textStart:start,textEnd:end,text:s(x.text),html:s(x.html),headingLevel:Math.max(0,n(x.headingLevel,0)),children:Array.isArray(x.children)?x.children.slice():[]};
  }
  function normalizeBlocks(blocks){return Array.isArray(blocks)?blocks.map(normalizeBlock):[];}
  function headingLevelFor(el){var m=/^h([1-6])$/i.exec(s(el&&el.tagName));return m?Number(m[1]):0;}
  function textContentOf(el){return s(el&&el.textContent).replace(/\r\n?/g,'\n');}
  function directElements(html){
    if(typeof DOMParser==='undefined')return [];
    try{
      var doc=new DOMParser().parseFromString(s(html),'text/html'),rootEl=doc.body||doc.documentElement;
      return Array.prototype.slice.call(rootEl.children||[]);
    }catch(_){return []}
  }
  function findText(text,needle,cursor){
    if(!needle)return cursor;
    var p=text.indexOf(needle,cursor);
    if(p>=0)return p;
    var norm=function(v){return s(v).replace(/[\\t\\r ]+/g,' ').replace(/\\n+/g,'\\n').trim()};
    var nt=norm(text.slice(cursor)),nn=norm(needle);if(!nn)return cursor;
    var q=nt.indexOf(nn);return q<0?-1:cursor+q;
  }
  function blocksFromChapter(chapter,chapterIndex){
    chapter=chapter||{};var text=s(chapter.text),html=s(chapter.html),base=n(chapter.textStart,0),end=Math.max(base,n(chapter.textEnd,base+text.length));
    var els=directElements(html),out=[],cursor=0;
    if(!els.length){return [{id:'chapter-'+chapterIndex+'-block-0',index:0,type:'text',chapterIndex:chapterIndex,textStart:base,textEnd:end,text:text,html:html,headingLevel:0,children:[]}];}
    var found=[];
    for(var i=0;i<els.length;i++){var t=textContentOf(els[i]),p=findText(text,t,cursor);if(p<0){found=[];break;}found.push({el:els[i],start:p,text:t});cursor=p+t.length;}
    if(!found.length){return [{id:'chapter-'+chapterIndex+'-block-0',index:0,type:'text',chapterIndex:chapterIndex,textStart:base,textEnd:end,text:text,html:html,headingLevel:0,children:[]}];}
    for(var j=0;j<found.length;j++){
      var f=found[j],next=j+1<found.length?found[j+1].start:text.length,st=base+Math.max(0,f.start),en=base+Math.max(f.start,next),el=f.el,typ=typeOf(el.tagName);
      out.push(normalizeBlock({id:'chapter-'+chapterIndex+'-block-'+j,index:j,type:typ,chapterIndex:chapterIndex,textStart:st,textEnd:Math.max(st,en),text:text.slice(f.start,next),html:el.outerHTML||'',headingLevel:headingLevelFor(el),children:[]} ,j));
    }
    if(out.length&&out[0].textStart>base)out[0].textStart=base,out[0].text=text.slice(0,out[0].textEnd-base)+out[0].text;
    if(out.length)out[out.length-1].textEnd=end;
    return out;
  }
  function buildBlocks(chapters){
    var list=Array.isArray(chapters)?chapters:[],out=[];
    list.forEach(function(c,i){blocksFromChapter(c,i).forEach(function(b){b.index=out.length;out.push(b);});});
    return out;
  }
  function validateBlocks(blocks,chapters,totalLength){
    var b=normalizeBlocks(blocks),c=Array.isArray(chapters)?chapters:[],errors=[],warnings=[];
    if(!b.length)return {ok:true,errors:errors,warnings:['no blocks'],blocks:b};
    var total=n(totalLength,c.length?c[c.length-1].textEnd:0),cursor=0;
    for(var i=0;i<b.length;i++){
      var x=b[i];
      if(!TYPES[x.type])errors.push({code:'BLOCK_TYPE_INVALID',index:i,type:x.type});
      if(x.textStart<0||x.textEnd<x.textStart)errors.push({code:'BLOCK_RANGE_INVALID',index:i,start:x.textStart,end:x.textEnd});
      if(x.textEnd>total)errors.push({code:'BLOCK_END_OUT_OF_BOUNDS',index:i,end:x.textEnd,total:total});
      if(i===0&&x.textStart!==0)errors.push({code:'BLOCK_START_NOT_ZERO',actual:x.textStart});
      if(i>0&&x.textStart!==cursor)errors.push({code:x.textStart>cursor?'BLOCK_GAP':'BLOCK_OVERLAP',index:i,previousEnd:cursor,start:x.textStart});
      if(x.chapterIndex<0||x.chapterIndex>=c.length)errors.push({code:'BLOCK_CHAPTER_INVALID',index:i,chapterIndex:x.chapterIndex});
      if(x.type==='heading'&&(x.headingLevel<1||x.headingLevel>6))errors.push({code:'BLOCK_HEADING_LEVEL_INVALID',index:i,level:x.headingLevel});
      cursor=x.textEnd;
    }
    if(cursor!==total)errors.push({code:'BLOCK_END_NOT_TOTAL',actual:cursor,expected:total});
    return {ok:errors.length===0,errors:errors,warnings:warnings,blocks:b,totalLength:total};
  }
  function createDocument(opts){
    opts=opts||{};var chapters=Array.isArray(opts.chapters)?opts.chapters:[],text=s(opts.text),blocks=normalizeBlocks(opts.blocks||buildBlocks(chapters));
    return {version:'1.0.0',metadata:opts.metadata||{},source:opts.source||{},text:text,blocks:blocks,chapters:chapters,toc:Array.isArray(opts.toc)?opts.toc:[],locators:opts.locators||{}};
  }
  function validateDocument(doc){
    doc=doc||{};var blocks=validateBlocks(doc.blocks,doc.chapters,s(doc.text).length);return {ok:blocks.ok,errors:blocks.errors,warnings:blocks.warnings,blocks:blocks.blocks};
  }
  root.BookNoteCanonicalBlocks={version:'1.0.0',types:Object.keys(TYPES),normalizeBlock:normalizeBlock,normalizeBlocks:normalizeBlocks,buildBlocks:buildBlocks,validateBlocks:validateBlocks,createDocument:createDocument,validateDocument:validateDocument};
})(typeof window!=='undefined'?window:self);
