(function(global){
'use strict';

function textNodes(root){
  var out=[],w=root.ownerDocument.createTreeWalker(root,NodeFilter.SHOW_TEXT),n;
  while((n=w.nextNode())){var p=n.parentElement;if(p&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(p.tagName))continue;if(String(n.nodeValue||''))out.push(n);}
  return out;
}
function blockFor(n){
  var p=n.parentElement;
  while(p&&p.tagName&&p.tagName!=='BODY'){
    if(/^(H[1-6]|P|LI|BLOCKQUOTE|PRE|TABLE|FIGCAPTION|DT|DD|DIV|SECTION|ARTICLE)$/i.test(p.tagName))return p;
    p=p.parentElement;
  }
  return n.parentElement||null;
}
function sentenceRanges(text){
  var out=[],start=0,i=0;
  text=String(text||'');
  while(i<text.length){
    var c=text.charAt(i),cut=false;
    if(/[。！？!?]/.test(c))cut=true;
    else if(c==='。'&&text.charAt(i+1)==='。')cut=true;
    else if(/[\n\r]/.test(c))cut=true;
    if(cut){var e=i+1;while(e<text.length&&/[”’"'）)】》」』]/.test(text.charAt(e)))e++;var s=text.slice(start,e).trim();var lead=text.slice(start,e).search(/\S/);var ls=lead<0?0:lead;var actualStart=start+ls;if(e>actualStart)out.push({start:actualStart,end:e,text:text.slice(actualStart,e)});start=e;i=e;continue;}
    i++;
  }
  if(start<text.length){var s2=text.slice(start).trim();if(s2){var l2=text.slice(start).search(/\S/);out.push({start:start+(l2<0?0:l2),end:text.length,text:s2});}}
  return out;
}
function makeTextIndex(nodes){
  var total=0,items=[];nodes.forEach(function(n){var len=String(n.nodeValue||'').length;items.push({node:n,start:total,end:total+len});total+=len;});return {nodes:items,text:items.map(function(x){return x.node.nodeValue||''}).join(''),length:total};
}
function pointAt(index,offset){offset=Math.max(0,Math.min(Number(offset)||0,index.length));if(!index.nodes.length)return null;for(var i=0;i<index.nodes.length;i++){var x=index.nodes[i];if(offset<=x.end)return {node:x.node,offset:Math.max(0,Math.min(String(x.node.nodeValue||'').length,offset-x.start))};}var z=index.nodes[index.nodes.length-1];return {node:z.node,offset:String(z.node.nodeValue||'').length};}
function rangeFor(index,start,end){var a=pointAt(index,start),b=pointAt(index,end);if(!a||!b)return null;return {start:a,end:b};}
function spansForRange(index,start,end){
  start=Math.max(0,Number(start)||0);end=Math.max(start,Number(end)||start);
  var out=[];
  for(var i=0;i<index.nodes.length;i++){
    var x=index.nodes[i],len=String(x.node.nodeValue||'').length;
    if(x.end<=start)continue;
    if(x.start>=end)break;
    var a=Math.max(start,x.start)-x.start,b=Math.min(end,x.end)-x.start;
    if(b>a)out.push({nodeIndex:i,startOffset:a,endOffset:b,node:x.node});
  }
  return out;
}
function rangeFromSpans(index,spans){
  if(!index||!Array.isArray(spans)||!spans.length)return null;
  var a=spans[0],b=spans[spans.length-1],an=index.nodes[a.nodeIndex],bn=index.nodes[b.nodeIndex];
  if(!an||!bn)return null;
  return {start:{node:an.node,offset:a.startOffset},end:{node:bn.node,offset:b.endOffset}};
}
function textFromSpans(index,spans){
  if(!index||!Array.isArray(spans)||!spans.length)return '';
  return spans.map(function(x){var n=index.nodes[x.nodeIndex];return n?String(n.node.nodeValue||'').slice(x.startOffset,x.endOffset):'';}).join('');
}
function normalizeForLocate(text){
  return String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
}
function normalizedMap(text){
  text=String(text||'');var out='',starts=[],ends=[],i=0,spacePending=false,spaceStart=0;
  while(i<text.length){
    var c=text.charAt(i);
    if(/\s/.test(c)){
      var j=i+1;while(j<text.length&&/\s/.test(text.charAt(j)))j++;
      if(out&&out.charAt(out.length-1)!==' '){out+=' ';starts.push(i);ends.push(j);}
      i=j;continue;
    }
    out+=c;starts.push(i);ends.push(i+1);i++;
  }
  if(out.charAt(out.length-1)===' '){out=out.slice(0,-1);starts.pop();ends.pop();}
  return {text:out,starts:starts,ends:ends};
}
function rangeForNormalizedQuery(index,start,query){
  if(!index||!query)return null;
  var raw=index.text,rm=normalizedMap(raw),q=normalizeForLocate(query);
  if(!q)return null;
  var target=Math.max(0,Number(start)||0),targetNorm=0;
  for(var k=0;k<rm.starts.length;k++){if(rm.starts[k]>=target){targetNorm=k;break;}targetNorm=k+1;}
  var p=rm.text.indexOf(q,Math.max(0,targetNorm));
  if(p<0&&targetNorm>0)p=rm.text.indexOf(q,Math.max(0,targetNorm-128));
  if(p<0)return null;
  var last=p+q.length-1,rs=rm.starts[p],re=rm.ends[last];
  var spans=spansForRange(index,rs,re);
  if(!spans.length||normalizeForLocate(textFromSpans(index,spans))!==q)return null;
  return {range:rangeFromSpans(index,spans),start:rs,end:re,text:textFromSpans(index,spans)};
}
function makeLocator(spine,logical,block,sentence,textStart,textEnd,sectionText){
  sectionText=String(sectionText||'');
  var qStart=Math.max(0,Number(textStart)||0),qEnd=Math.max(qStart,Number(textEnd)||qStart);
  var before=sectionText.slice(Math.max(0,qStart-96),qStart),after=sectionText.slice(qEnd,Math.min(sectionText.length,qEnd+96));
  return {type:'epub',format:'epub',spineIndex:spine.index,sectionIndex:spine.index,sectionId:spine.id||'',href:spine.href||'',logicalChapterId:logical.id,logicalChapterIndex:logical.index,blockId:block&&block.id||'',sentenceId:sentence&&sentence.id||'',start:qStart,end:qEnd,queryStart:qStart,queryEnd:qEnd,contextBefore:before,contextAfter:after,textQuote:{exact:sectionText.slice(qStart,qEnd),sentence:String(sentence&&sentence.text||'').slice(0,240)}};
}
function buildSection(section,doc){
  var nodes=textNodes(doc.body),index=makeTextIndex(nodes),blocks=[],map=new Map(),bi=0;
  nodes.forEach(function(n){var el=blockFor(n);if(!el)return;var b=map.get(el);if(!b){b={id:'b'+bi++,element:el,type:/^h[1-6]$/i.test(el.tagName)?'heading':/^li$/i.test(el.tagName)?'listItem':/^table$/i.test(el.tagName)?'table':'paragraph',text:'',start:null,end:null,nodes:[]};map.set(el,b);blocks.push(b);}var ni=index.nodes.find(function(x){return x.node===n});b.nodes.push(n);if(b.start===null)b.start=ni.start;b.end=ni.end;});
  blocks.sort(function(a,b){return a.start-b.start;});
  blocks.forEach(function(b){b.text=index.text.slice(b.start,b.end);var ss=sentenceRanges(b.text);b.sentences=ss.map(function(s,si){
    var st=b.start+s.start,en=b.start+s.end;
    return {id:b.id+'-s'+si,index:si,start:st,end:en,text:s.text,nodeSpans:spansForRange(index,st,en)};
  });
  b.nodeSpans=spansForRange(index,b.start,b.end);});
  /* Native h1-h6 remain authoritative. Semantic Layout may additionally
     promote legacy <p>/<div> chapter markers into Logical Chapter boundaries
     without changing the five-level locator model or the underlying DOM. */
  var headings=blocks.filter(function(b){
    var tag=String(b.element&&b.element.tagName||'').toUpperCase();
    var role=String(b.element&&b.element.getAttribute&&b.element.getAttribute('data-booknote-role')||'').toLowerCase();
    return (/^h[1-6]$/.test(tag)) || role==='chapter' || role==='part' || role==='heading';
  }).map(function(b){
    var tag=String(b.element&&b.element.tagName||'').toUpperCase();
    var role=String(b.element&&b.element.getAttribute&&b.element.getAttribute('data-booknote-role')||'').toLowerCase();
    var level=/^h[1-6]$/.test(tag)?Number(tag.slice(1)):(role==='part'?1:(role==='chapter'?2:3));
    return {block:b,level:level,role:role};
  });
  var chapters=[];
  if(!headings.length){chapters=[{id:'lc'+section.index+'-0',index:0,sectionIndex:section.index,label:section.label||('第 '+(section.index+1)+' 节'),headingLevel:0,start:0,end:index.length,blocks:blocks}];}
  else {headings.forEach(function(h,hi){var start=h.block.start,end=hi+1<headings.length?headings[hi+1].block.start:index.length;var bs=blocks.filter(function(b){return b.start>=start&&b.start<end});chapters.push({id:'lc'+section.index+'-'+hi,index:hi,sectionIndex:section.index,label:String(h.block.text||section.label||'').trim(),headingLevel:h.level,start:start,end:end,blocks:bs});});}
  chapters.forEach(function(ch){ch.sentences=[];ch.blocks.forEach(function(b){b.sentences.forEach(function(s){if(s.start>=ch.start&&s.start<ch.end)ch.sentences.push(s);});});});
  return {spineSection:section,blocks:blocks,chapters:chapters,textIndex:index};
}
function findQueryRangeInSentence(index,sentence,query,offset){
  if(!index||!sentence||!query)return null;
  var spans=spansForRange(index,sentence.start,sentence.end),full=textFromSpans(index,spans);
  var p=Math.max(0,Number(offset)||0),hit=full.indexOf(String(query),p);
  if(hit<0&&p>0)hit=full.indexOf(String(query),Math.max(0,p-32));
  if(hit<0)return null;
  var rs=sentence.start+hit,re=rs+String(query).length,ss=spansForRange(index,rs,re);
  if(!ss.length||textFromSpans(index,ss)!==String(query))return null;
  return {range:rangeFromSpans(index,ss),start:rs,end:re};
}
function findQueryRangeByOccurrence(index,query,occurrence){
  if(!index||!query)return null;
  var from=0,target=Math.max(0,Number(occurrence)||0),i=0;
  while(from<=index.text.length){var p=index.text.indexOf(String(query),from);if(p<0)return null;if(i===target){var e=p+String(query).length,ss=spansForRange(index,p,e);return ss.length?{range:rangeFromSpans(index,ss),start:p,end:e}:null;}i++;from=p+Math.max(1,String(query).length);}
  return null;
}
class EpubMultiModuleModel{
  constructor(publication,sections){this.version='1.3.1';this.publication=publication;this.sections=sections||[];this.logicalChapters=[];this.domBlocks=[];this.sentences=[];this.textNodes=[];this.rebuildIndexes();}
  rebuildIndexes(){var self=this;this.logicalChapters=[];this.domBlocks=[];this.sentences=[];this.textNodes=[];this.sections.forEach(function(s){s.model.sentences=[];s.model.blocks.forEach(function(b){(b.sentences||[]).forEach(function(x){s.model.sentences.push(x);});});s.model.chapters.forEach(function(c){c.globalIndex=self.logicalChapters.length;c.sectionIndex=s.index;self.logicalChapters.push(c);});s.model.blocks.forEach(function(b){self.domBlocks.push(Object.assign({sectionIndex:s.index},b));});s.model.textIndex.nodes.forEach(function(n){self.textNodes.push({sectionIndex:s.index,node:n.node,start:n.start,end:n.end});});});}
  findAll(query){
    query=String(query||'');if(!query)return [];
    var out=[],self=this;
    this.sections.forEach(function(s){
      var text=s.model.textIndex.text,from=0,occurrenceInSection=0;
      while(from<=text.length){
        var p=text.indexOf(query,from);if(p<0)break;
        var e=p+query.length;
        var lc=s.model.chapters.find(function(c){return p>=c.start&&p<=(c.end||text.length-1)})||s.model.chapters[0];
        var block=s.model.blocks.find(function(b){return p>=b.start&&p<b.end})||null;
        var sentence=block&&block.sentences.find(function(x){return p>=x.start&&p<=(x.end||p+query.length)})||null;
        var queryOffsetInSentence=sentence?Math.max(0,p-sentence.start):0;
        out.push({
          query:query,sectionIndex:s.index,sectionId:s.id||'',href:s.href||'',
          logicalChapterIndex:lc?lc.globalIndex:-1,logicalChapterId:lc&&lc.id||'',
          blockId:block&&block.id||'',blockText:block&&block.text||'',blockTag:block&&block.element&&block.element.tagName||'',
          sentenceId:sentence&&sentence.id||'',sentenceText:sentence&&sentence.text||'',queryOffsetInSentence:queryOffsetInSentence,
          occurrenceInSection:occurrenceInSection++,start:p,end:e,localStart:p,localEnd:e,text:text.slice(p,e),
          contextBefore:text.slice(Math.max(0,p-96),p),contextAfter:text.slice(e,Math.min(text.length,e+96)),
          locator:makeLocator(s.spineSection||s,lc||{id:'',index:-1},block,sentence,p,e,text)
        });
        from=p+Math.max(1,query.length);
      }
    });
    return out;
  }
  resolveHit(hit,doc){
    var targetSection=Number(hit&&hit.sectionIndex);var s=this.sections.find(function(x){return Number(x&&x.index)===targetSection;})||this.sections[targetSection];if(!s||!doc)return null;
    var idx=s.model.textIndex,query=String(hit.query||hit.text||''),qnorm=normalizeForLocate(query);if(!qnorm)return null;
    var candidates=[];
    var from=0,occ=0;
    while(from<=idx.text.length){
      var p=idx.text.indexOf(query,from);if(p<0)break;
      candidates.push({start:p,end:p+query.length,occurrence:occ++});
      from=p+Math.max(1,query.length);
    }
    // EPUB Search is built from a detached XHTML DOM, while highlighting uses
    // the live iframe DOM. Never transfer detached TextNode offsets as truth.
    // Resolve against the live DOM by exact quote + surrounding context first.
    if(!candidates.length){
      var nm=normalizedMap(idx.text),np=nm.text.indexOf(qnorm);
      while(np>=0){
        var rs=nm.starts[np],re=nm.ends[np+qnorm.length-1],sp=spansForRange(idx,rs,re);
        if(sp.length)candidates.push({start:rs,end:re,occurrence:candidates.length});
        np=nm.text.indexOf(qnorm,np+Math.max(1,qnorm.length));
      }
    }
    if(!candidates.length)return null;
    var before=String(hit.contextBefore||(hit.locator&&hit.locator.contextBefore)||'');
    var after=String(hit.contextAfter||(hit.locator&&hit.locator.contextAfter)||'');
    var targetOcc=Number.isFinite(Number(hit.occurrenceInSection))?Number(hit.occurrenceInSection):null;
    function score(c){
      var pre=idx.text.slice(Math.max(0,c.start-before.length),c.start),post=idx.text.slice(c.end,c.end+after.length),score=0;
      if(targetOcc!=null&&c.occurrence===targetOcc)score+=100000;
      if(before){var pn=normalizeForLocate(pre),bn=normalizeForLocate(before);if(pn===bn)score+=50000;else{var k=Math.min(pn.length,bn.length),same=0;while(same<k&&pn.charAt(pn.length-k+same)===bn.charAt(same))same++;score+=same*10;}}
      if(after){var an=normalizeForLocate(post),bn2=normalizeForLocate(after);if(an===bn2)score+=50000;else{var k2=Math.min(an.length,bn2.length),same2=0;while(same2<k2&&an.charAt(same2)===bn2.charAt(same2))same2++;score+=same2*10;}}
      var sentence=hit.sentenceText||'';if(sentence){var sn=normalizeForLocate(sentence),around=normalizeForLocate(idx.text.slice(Math.max(0,c.start-32),Math.min(idx.text.length,c.end+32)));if(sn&&around.indexOf(sn)>=0)score+=1000;}
      return score;
    }
    var best=candidates[0],bestScore=score(best);for(var ci=1;ci<candidates.length;ci++){var sc=score(candidates[ci]);if(sc>bestScore){best=candidates[ci];bestScore=sc;}}
    var spans=spansForRange(idx,best.start,best.end),range=rangeFromSpans(idx,spans);if(!range)return null;
    var actual='';try{var rr=doc.createRange();rr.setStart(range.start.node,range.start.offset);rr.setEnd(range.end.node,range.end.offset);actual=rr.toString();}catch(_){return null;}
    if(normalizeForLocate(actual)!==qnorm)return null;
    return {range:range,locator:hit.locator,sectionIndex:s.index,logicalChapterIndex:hit.logicalChapterIndex,blockId:hit.blockId,sentenceId:hit.sentenceId,start:best.start,end:best.end,confidence:bestScore>=100000?'context-occurrence':'context'};
  }
  
    sentencesFrom(sectionIndex,start){var s=this.sections[sectionIndex];if(!s)return [];return s.model.sentences.filter(function(x){return x.end>start;});}
}
global.BookNoteEpubMultiModule={version:'1.3.0',buildSection:buildSection,EpubMultiModuleModel:EpubMultiModuleModel,pointAt:pointAt,rangeFor:rangeFor,spansForRange:spansForRange,rangeFromSpans:rangeFromSpans,textFromSpans:textFromSpans,makeTextIndex:makeTextIndex,sentenceRanges:sentenceRanges};
})(globalThis);
