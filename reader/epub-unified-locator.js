(function(global){
'use strict';

function norm(s){return String(s==null?'':s).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function nodesFor(doc){
  var root=doc&&doc.getElementById('source')||doc&&doc.body;
  if(!root)return [];
  var NF=(doc.defaultView&&doc.defaultView.NodeFilter)||global.NodeFilter;
  var w=doc.createTreeWalker(root,NF.SHOW_TEXT),out=[],n,total=0;
  while((n=w.nextNode())){
    var p=n.parentElement;
    if(p&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(p.tagName))continue;
    var text=String(n.nodeValue||'');
    if(!text)continue;
    out.push({node:n,start:total,end:total+text.length});
    total+=text.length;
  }
  return out;
}
function point(nodes,raw){
  if(!nodes.length)return null;
  raw=Math.max(0,Number(raw)||0);
  for(var i=0;i<nodes.length;i++){
    var x=nodes[i];
    if(raw<=x.end)return {node:x.node,offset:Math.max(0,Math.min((x.node.nodeValue||'').length,raw-x.start))};
  }
  var z=nodes[nodes.length-1];return {node:z.node,offset:(z.node.nodeValue||'').length};
}
function makeRange(doc,nodes,start,end){
  var a=point(nodes,start),b=point(nodes,end);if(!a||!b)return null;
  try{var r=doc.createRange();r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);return r;}catch(_){return null;}
}
function occurrenceMatches(raw,query,target,ctxBefore,ctxAfter){
  var out=[],from=0,occ=0,q=String(query||'');
  if(!q)return out;
  while(from<=raw.length){
    var p=raw.indexOf(q,from);if(p<0)break;
    var e=p+q.length,score=0;
    if(target!=null&&occ===target)score+=100000;
    if(ctxBefore){var pre=norm(raw.slice(Math.max(0,p-ctxBefore.length),p)),bp=norm(ctxBefore);if(pre===bp)score+=50000;else if(pre&&bp&&pre.slice(-Math.min(48,bp.length))===bp.slice(-Math.min(48,bp.length)))score+=1000;}
    if(ctxAfter){var post=norm(raw.slice(e,e+ctxAfter.length)),ap=norm(ctxAfter);if(post===ap)score+=50000;else if(post&&ap&&post.slice(0,Math.min(48,ap.length))===ap.slice(0,Math.min(48,ap.length)))score+=1000;}
    out.push({start:p,end:e,occurrence:occ,score:score});occ++;from=p+Math.max(1,q.length);
  }
  return out;
}
function normalizedCandidate(raw,query,target){
  var folded='',starts=[],ends=[],i=0;
  while(i<raw.length){
    var c=raw.charAt(i);
    if(/\s/.test(c)){
      var j=i+1;while(j<raw.length&&/\s/.test(raw.charAt(j)))j++;
      if(folded&&folded.charAt(folded.length-1)!==' '){folded+=' ';starts.push(i);ends.push(j);}
      i=j;continue;
    }
    folded+=c;starts.push(i);ends.push(i+1);i++;
  }
  if(folded.charAt(folded.length-1)===' '){folded=folded.slice(0,-1);starts.pop();ends.pop();}
  var q=norm(query),from=0,occ=0,out=[];
  while(q&&from<=folded.length){
    var p=folded.indexOf(q,from);if(p<0)break;
    if(target==null||occ===target)out.push({start:starts[p],end:ends[p+q.length-1],occurrence:occ,score:target!=null&&occ===target?100000:0});
    occ++;from=p+Math.max(1,q.length);
  }
  return out;
}
function locate(doc,hit){
  if(!doc||!hit)return null;
  var nodes=nodesFor(doc);if(!nodes.length)return null;
  var raw=nodes.map(function(x){return x.node.nodeValue||'';}).join('');
  var loc=hit.epubLocator||hit.locator||{};
  var query=String(hit.query||hit.quote||hit.text||loc.textQuote&&loc.textQuote.exact||'');
  if(!query)return null;
  var target=Number.isFinite(Number(hit.occurrenceInSection))?Number(hit.occurrenceInSection):(Number.isFinite(Number(loc.occurrenceInSection))?Number(loc.occurrenceInSection):null);
  var before=String(hit.contextBefore||loc.contextBefore||''),after=String(hit.contextAfter||loc.contextAfter||'');
  var candidates=occurrenceMatches(raw,query,target,before,after);
  if(!candidates.length)candidates=normalizedCandidate(raw,query,target);
  if(!candidates.length)return null;
  candidates.sort(function(a,b){return b.score-a.score||a.start-b.start;});
  var best=candidates[0],range=makeRange(doc,nodes,best.start,best.end);
  if(!range||range.collapsed||norm(range.toString())!==norm(query))return null;
  return {range:range,start:best.start,end:best.end,occurrence:best.occurrence,query:query,sectionId:String(loc.sectionId||hit.sectionId||''),sectionIndex:Number(hit.sectionIndex!=null?hit.sectionIndex:loc.sectionIndex)};
}
function clear(doc){if(!doc)return;var marks=doc.querySelectorAll('mark.reader-search-hit');for(var i=0;i<marks.length;i++){var m=marks[i],p=m.parentNode;if(!p)continue;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);}if(doc.body)doc.body.normalize();}
function wrap(doc,range){
  if(!doc||!range||range.collapsed)return false;
  var NF=(doc.defaultView&&doc.defaultView.NodeFilter)||global.NodeFilter,root=doc.getElementById('source')||doc.body;
  var walker=doc.createTreeWalker(root,NF.SHOW_TEXT),nodes=[],n;
  while((n=walker.nextNode())){if(n.parentElement&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(n.parentElement.tagName))continue;nodes.push(n);}
  var si=nodes.indexOf(range.startContainer),ei=nodes.indexOf(range.endContainer);if(si<0||ei<0||si>ei)return false;
  var parts=[];
  for(var i=si;i<=ei;i++){var t=nodes[i],len=(t.nodeValue||'').length,a=i===si?range.startOffset:0,b=i===ei?range.endOffset:len;if(b>a)parts.push({node:t,a:a,b:b});}
  if(!parts.length)return false;
  for(var j=parts.length-1;j>=0;j--){
    var p=parts[j],t=p.node;
    if(!t.parentNode)continue;
    try{
      var right=t.splitText(p.b),middle=t.splitText(p.a),mark=doc.createElement('mark');mark.className='reader-search-hit active';middle.parentNode.insertBefore(mark,middle);mark.appendChild(middle);
    }catch(_){return false;}
  }
  return !!doc.querySelector('mark.reader-search-hit.active');
}
function locateAndHighlight(doc,hit){
  clear(doc);
  var r=locate(doc,hit);if(!r)return null;
  if(!wrap(doc,r.range))return null;
  var marks=doc.querySelectorAll('mark.reader-search-hit.active');
  if(!marks.length)return null;
  var active=marks[marks.length-1];try{active.scrollIntoView({block:'center',inline:'nearest'});}catch(_){try{active.scrollIntoView();}catch(__){}}
  return {range:r.range,start:r.start,end:r.end,mark:active,sectionIndex:r.sectionIndex,occurrence:r.occurrence};
}
function boundaryOffset(doc,index,node,offset){
  if(!doc||!index||!node)return null;
  var root=doc.getElementById('source')||doc.body;
  if(!root)return null;
  try{
    var probe=doc.createRange();
    probe.selectNodeContents(root);
    probe.setEnd(node,Math.max(0,Number(offset)||0));
    return Math.max(0,Math.min(index.length,probe.toString().length));
  }catch(_){return null;}
}
function anchorFromRange(doc,section,range,selectedText){
  if(!doc||!section||!range||!global.BookNoteEpubMultiModule)return null;
  var model=global.BookNoteEpubMultiModule.buildSection(section,doc),index=model&&model.textIndex;
  if(!index||!index.nodes||!index.nodes.length)return null;
  /* Boundary points at paragraph indentation are often represented by the
     paragraph element itself (offset 0), not by its first Text node.  The old
     implementation rejected those points and selectionOffsets then fell back
     to a less precise canonical mapping, which could collapse a paragraph-start
     selection to the chapter start. Resolve BOTH text-node and element boundary
     points against the live source Range instead. */
  var start=boundaryOffset(doc,index,range.startContainer,range.startOffset);
  var end=boundaryOffset(doc,index,range.endContainer,range.endOffset);
  if(start==null||end==null)return null;
  if(end<start){var t=start;start=end;end=t;}
  var text=String(selectedText!=null?selectedText:range.toString()||'');
  var block=model.blocks.find(function(b){return start>=b.start&&start<b.end;})||null;
  var sentence=block&&block.sentences&&block.sentences.find(function(x){return start>=x.start&&start<x.end;})||null;
  var chapter=model.chapters.find(function(c){return start>=c.start&&start<c.end;})||model.chapters[0]||null;
  var sectionText=String(index.text||'');
  var before=sectionText.slice(Math.max(0,start-96),start),after=sectionText.slice(end,Math.min(sectionText.length,end+96));
  var occurrence=0,q=text;
  if(q){var from=0,pn;while((pn=sectionText.indexOf(q,from))>=0){if(pn===start)break;occurrence++;from=pn+Math.max(1,q.length);if(from>start)break;}}
  var sectionBase=Number(section.textStart)||0;
  return {type:'epub',format:'epub',spineIndex:Number(section.index)||0,sectionIndex:Number(section.index)||0,sectionId:String(section.id||''),href:String(section.href||''),
    start:start,end:end,localStart:start,localEnd:end,documentStart:sectionBase+start,documentEnd:sectionBase+end,
    occurrenceInSection:occurrence,contextBefore:before,contextAfter:after,textQuote:{exact:q,sentence:sentence&&String(sentence.text||'').slice(0,240)||''},
    logicalChapterId:chapter&&chapter.id||'',logicalChapterIndex:chapter&&chapter.globalIndex!=null?chapter.globalIndex:(chapter&&chapter.index!=null?chapter.index:0),blockId:block&&block.id||'',sentenceId:sentence&&sentence.id||''};
}
function anchorFromCaret(doc,section,range){
  if(!doc||!section||!range||!global.BookNoteEpubMultiModule)return null;
  var model=global.BookNoteEpubMultiModule.buildSection(section,doc),index=model&&model.textIndex;
  if(!index||!index.nodes||!index.nodes.length)return null;
  var si=index.nodes.findIndex(function(x){return x.node===range.startContainer;});
  if(si<0)return null;
  var start=Math.max(0,Math.min(String(index.text||'').length,index.nodes[si].start+Number(range.startOffset||0))),end=start;
  var block=model.blocks.find(function(b){return start>=b.start&&start<b.end;})||null;
  var sentence=block&&block.sentences&&block.sentences.find(function(x){return start>=x.start&&start<x.end;})||null;
  var sectionText=String(index.text||''),before=sectionText.slice(Math.max(0,start-96),start),after=sectionText.slice(start,Math.min(sectionText.length,start+96));
  var sectionBase=Number(section.textStart)||0;
  return {type:'epub',format:'epub',spineIndex:Number(section.index)||0,sectionIndex:Number(section.index)||0,sectionId:String(section.id||''),href:String(section.href||''),
    start:start,end:end,localStart:start,localEnd:end,documentStart:sectionBase+start,documentEnd:sectionBase+end,
    contextBefore:before,contextAfter:after,textQuote:{exact:'',sentence:sentence&&String(sentence.text||'').slice(0,240)||''},
    logicalChapterId:sentence&&sentence.logicalChapterId||block&&block.logicalChapterId||'',logicalChapterIndex:sentence&&sentence.logicalChapterIndex!=null?sentence.logicalChapterIndex:(block&&block.logicalChapterIndex!=null?block.logicalChapterIndex:0),blockId:block&&block.id||'',sentenceId:sentence&&sentence.id||''};
}
function resolveAnnotation(doc,section,annotation){
  if(!annotation)return null;
  var loc=annotation.epubLocator||annotation.locator||annotation;
  var nodes=nodesFor(doc);if(!nodes.length)return null;
  var raw=nodes.map(function(x){return x.node.nodeValue||'';}).join('');
  var query=String(annotation.text||annotation.quote||loc.textQuote&&loc.textQuote.exact||'');
  var targetStart=loc.start!=null?Number(loc.start):(loc.localStart!=null?Number(loc.localStart):NaN);
  var targetEnd=loc.end!=null?Number(loc.end):(loc.localEnd!=null?Number(loc.localEnd):targetStart);
  var occurrence=Number.isFinite(Number(loc.occurrenceInSection))?Number(loc.occurrenceInSection):null;
  /*
   * v7.12.61: persisted position is authoritative. logicalChapterId,
   * logicalChapterIndex, blockId and sentenceId are descriptive metadata only.
   * They must never decide the final DOM anchor.
   */
  if(Number.isFinite(targetStart)){
    targetStart=Math.max(0,Math.min(raw.length,targetStart));
    targetEnd=Number.isFinite(targetEnd)?Math.max(targetStart,Math.min(raw.length,targetEnd)):targetStart;
    var exact=makeRange(doc,nodes,targetStart,targetEnd);
    if(exact){
      var exactText=norm(exact.toString()),wanted=norm(query);
      if(!wanted||exactText===wanted){
        return {range:exact,start:targetStart,end:targetEnd,occurrence:occurrence,query:query,sectionId:String(loc.sectionId||section&&section.id||''),sectionIndex:Number(section&&section.index!=null?section.index:loc.sectionIndex)};
      }
    }
    if(query){
      var normalized=normalizedCandidate(raw,query,occurrence),best=null,bestDist=Infinity;
      for(var i=0;i<normalized.length;i++){var c=normalized[i],d=Math.abs(c.start-targetStart);if(d<bestDist){bestDist=d;best=c;}}
      if(best){var nr=makeRange(doc,nodes,best.start,best.end);if(nr&&norm(nr.toString())===norm(query)){
        return {range:nr,start:best.start,end:best.end,occurrence:best.occurrence,query:query,sectionId:String(loc.sectionId||section&&section.id||''),sectionIndex:Number(section&&section.index!=null?section.index:loc.sectionIndex)};
      }}
    }
  }
  /* Legacy records without a usable absolute section offset. This fallback
     still uses quote + occurrence/context; chapter/block/sentence are ignored. */
  var hit={query:query,quote:query,text:String(annotation.text||''),occurrenceInSection:occurrence,contextBefore:loc.contextBefore,contextAfter:loc.contextAfter,epubLocator:loc,locator:loc};
  return locate(doc,hit);
}
function resolveSentence(doc,section,sentenceId,query,queryOffset){
  if(!doc||!section||!sentenceId||!global.BookNoteEpubMultiModule)return null;
  var model=global.BookNoteEpubMultiModule.buildSection(section,doc),sentence=(model.sentences||[]).find(function(x){return String(x.id)===String(sentenceId);});
  if(!sentence)return null;
  var q=String(query||'');
  if(q){var full=textFromSpansLocal(model.textIndex,sentence.nodeSpans),p=full.indexOf(q,Math.max(0,Number(queryOffset)||0));if(p<0)p=full.indexOf(q);if(p>=0){var rs=sentence.start+p,re=rs+q.length,sp=global.BookNoteEpubMultiModule.spansForRange?global.BookNoteEpubMultiModule.spansForRange(model.textIndex,rs,re):null;if(sp&&sp.length){var rr=global.BookNoteEpubMultiModule.rangeFromSpans(model.textIndex,sp);return rr;}}}
  var rr2=global.BookNoteEpubMultiModule.rangeFromSpans(model.textIndex,sentence.nodeSpans);return rr2;
}
function textFromSpansLocal(index,spans){if(!index||!Array.isArray(spans))return '';return spans.map(function(x){var n=index.nodes[x.nodeIndex];return n?String(n.node.nodeValue||'').slice(x.startOffset,x.endOffset):'';}).join('');}
global.BookNoteEpubUnifiedLocator={version:'1.4.0',locate:locate,clear:clear,wrap:wrap,locateAndHighlight:locateAndHighlight,nodesFor:nodesFor,anchorFromRange:anchorFromRange,anchorFromCaret:anchorFromCaret,resolveAnnotation:resolveAnnotation,resolveSentence:resolveSentence};
})(globalThis);
