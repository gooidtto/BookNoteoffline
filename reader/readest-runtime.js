(function(){
'use strict';

/*
 * BookNote Readest Runtime Adapter v0.1
 *
 * This adapter follows the same runtime boundary used by Readest/Foliate:
 * source Blob -> book sections -> TOC -> renderer -> relocate events.
 * It is deliberately independent of BookNote search. Search remains in
 * BookNoteSearchIndex and only supplies exact global offsets.
 */

function u16(a,o){return a[o]|(a[o+1]<<8)}
function u32(a,o){return (a[o]|(a[o+1]<<8)|(a[o+2]<<16)|(a[o+3]<<24))>>>0}
function textDecode(bytes){return new TextDecoder('utf-8').decode(bytes)}
function normPath(p){var out=[];String(p||'').split('/').forEach(function(x){if(!x||x==='.')return;if(x==='..')out.pop();else out.push(x)});return out.join('/')}
function dirname(p){var i=String(p||'').lastIndexOf('/');return i<0?'':p.slice(0,i+1)}
function resolvePath(base,rel){if(/^https?:|^data:|^blob:/.test(rel))return rel;return normPath(dirname(base)+String(rel||''))}
function esc(s){return String(s||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\\':'\\','"':'&quot;'}[c]||c})}
function stripTags(html){var d=document.createElement('div');d.innerHTML=String(html||'');d.querySelectorAll('script,style,noscript').forEach(function(n){n.remove()});return d.textContent||''}
function readerProjectText(text){
  text=String(text||'');var norm=[],starts=[],ends=[],i=0;
  while(i<text.length){var c=text.charAt(i);if(/\s/.test(c)){var j=i+1;while(j<text.length&&/\s/.test(text.charAt(j)))j++;norm.push(' ');starts.push(i);ends.push(j);i=j;}else{norm.push(c);starts.push(i);ends.push(i+1);i++;}}
  return {text:norm.join(''),starts:starts,ends:ends};
}
function readerNormIndexAt(proj,raw){
  raw=Math.max(0,Math.min(Number(raw)||0,proj.starts.length?proj.ends[proj.ends.length-1]:0));
  var lo=0,hi=proj.starts.length-1,ans=proj.starts.length;
  while(lo<=hi){var mid=(lo+hi)>>1;if(proj.ends[mid]>raw){ans=mid;hi=mid-1;}else lo=mid+1;}
  return ans===proj.starts.length?Math.max(0,proj.starts.length-1):ans;
}
function readerFindAll(text,q,max){var out=[],from=0,limit=max||100000;q=String(q||'');if(!q)return out;while(from<=text.length&&out.length<limit){var i=text.indexOf(q,from);if(i<0)break;out.push(i);from=i+Math.max(1,q.length);}return out;}
function sanitizeHTML(html){var d=document.implementation.createHTMLDocument('book');d.body.innerHTML=String(html||'');d.querySelectorAll('script,iframe,object,embed,form,link[rel=\"script\"]').forEach(function(n){n.remove()});d.querySelectorAll('*').forEach(function(n){Array.from(n.attributes).forEach(function(a){if(/^on/i.test(a.name)||a.name==='srcdoc')n.removeAttribute(a.name)});});if(globalThis.BookNoteEpubSemanticLayout&&typeof globalThis.BookNoteEpubSemanticLayout.normalize==='function')globalThis.BookNoteEpubSemanticLayout.normalize(d.body);return d.body.innerHTML}

async function inflateRaw(bytes){
  if(typeof DecompressionStream!=='function') throw new Error('浏览器不支持 DecompressionStream，无法读取压缩 EPUB');
  var ds=new DecompressionStream('deflate-raw');
  var stream=new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class ZipArchive{
  constructor(blob){this.blob=blob;this.entries=new Map()}
  async init(){
    var size=this.blob.size, tailSize=Math.min(size,65557), tail=new Uint8Array(await this.blob.slice(size-tailSize).arrayBuffer());
    var sig=[0x50,0x4b,0x05,0x06],eocd=-1;
    for(var i=tail.length-22;i>=0;i--){if(tail[i]===sig[0]&&tail[i+1]===sig[1]&&tail[i+2]===sig[2]&&tail[i+3]===sig[3]){eocd=i;break}}
    if(eocd<0)throw new Error('不是有效 ZIP/EPUB 文件');
    var count=u16(tail,eocd+10),cdSize=u32(tail,eocd+12),cdOff=u32(tail,eocd+16),cd=new Uint8Array(await this.blob.slice(cdOff,cdOff+cdSize).arrayBuffer()),p=0;
    for(var n=0;n<count&&p+46<=cd.length;n++){
      if(u32(cd,p)!==0x02014b50)break;
      var method=u16(cd,p+10),crc=u32(cd,p+16),cs=u32(cd,p+20),us=u32(cd,p+24),nl=u16(cd,p+28),xl=u16(cd,p+30),cl=u16(cd,p+32),off=u32(cd,p+42),name=textDecode(cd.slice(p+46,p+46+nl));
      this.entries.set(name,{name:name,method:method,crc:crc,compressedSize:cs,size:us,offset:off});p+=46+nl+xl+cl;
    }
    return this;
  }
  async read(name){
    var e=this.entries.get(name);if(!e)throw new Error('EPUB 文件缺失：'+name);
    var h=new Uint8Array(await this.blob.slice(e.offset,e.offset+30).arrayBuffer()),nl=u16(h,26),xl=u16(h,28),raw=new Uint8Array(await this.blob.slice(e.offset+30+nl+xl,e.offset+30+nl+xl+e.compressedSize).arrayBuffer());
    if(e.method===0)return raw;
    if(e.method===8)return inflateRaw(raw);
    throw new Error('暂不支持 ZIP 压缩方法：'+e.method);
  }
  async text(name){return textDecode(await this.read(name))}
  async blobOf(name,type){return new Blob([await this.read(name)],{type:type||'application/octet-stream'})}
}

function parseXML(s){return new DOMParser().parseFromString(String(s||''),'application/xml')}
function localName(el){return el&&String(el.localName||el.nodeName||'').split(':').pop()}
function findAll(root,name){return Array.from(root.getElementsByTagName('*')).filter(function(e){return localName(e)===name})}
function findOne(root,name){return findAll(root,name)[0]||null}

class ReadestBook{
  constructor(blob,meta){this.blob=blob;this.meta=meta||{};this.sections=[];this.toc=[];this.archive=null;this.base='';this._blobUrls=new Set()}
  async open(){
    try{
      var fmt=String(this.meta.documentFormat||this.meta.documentFileName||'').toLowerCase();
      if(fmt.indexOf('epub')>=0||this.blob.type==='application/epub+zip'||/\.epub$/i.test(this.meta.documentFileName||''))return await this.openEPUB();
      if(fmt==='txt'||fmt==='text/plain')return await this.openText();
      if(fmt==='md'||fmt==='markdown')return await this.openText(true);
      return await this.openHTMLContent();
    }catch(e){
      this.releaseAssets();
      throw e;
    }
  }
  async openText(markdown){
    var text=new TextDecoder().decode(await this.blob.arrayBuffer());
    if(!markdown){
      var html='<p class="txt-runtime-paragraph">'+esc(text)+'</p>';
      this.sections=[{index:0,href:'',label:this.meta.documentTitle||this.meta.name||'正文',text:text,html:'<article>'+html+'</article>',textStart:0,textEnd:text.length,headingLevel:0,isNavigation:false}];
      this.toc=[];return this;
    }
    /* DM v7.18.07: Markdown is its own structural language. Keep the exact raw
       Markdown slice as the canonical section text, while hiding syntax tokens
       visually. This keeps search/selection offsets identical to the source. */
    var lines=text.split('\n'),starts=[],cursor=0;
    for(var li=0;li<lines.length;li++){starts.push(cursor);cursor+=lines[li].length+(li<lines.length-1?1:0);}
    var headings=[];
    for(var hi=0;hi<lines.length;hi++){
      var hm=/^( {0,3})(#{1,6})[ \t]+(.+?)\s*$/.exec(lines[hi]);
      if(hm)headings.push({line:hi,start:starts[hi],level:hm[2].length,label:hm[3].trim()});
    }
    var cuts=[0].concat(headings.map(function(h){return h.start;})).filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return a-b;});
    var boundaries=[];
    for(var ci=0;ci<cuts.length;ci++){var st=cuts[ci],en=ci+1<cuts.length?cuts[ci+1]:text.length;if(en<=st)continue;var h=headings.find(function(x){return x.start===st;});boundaries.push({start:st,end:en,heading:h||null});}
    if(!boundaries.length)boundaries=[{start:0,end:text.length,heading:null}];
    function dmHtml(raw){
      var out='',pos=0,parts=raw.split(/(\n)/),lineNo=0;
      parts.forEach(function(part){
        if(part==='\n'){out+='\n';return;}
        var m=/^( {0,3})(#{1,6})[ \t]+(.+?)\s*$/.exec(part);
        if(m){out+='<h'+m[2].length+' class="dm-heading dm-heading-level-'+m[2].length+'"><span class="dm-syntax" aria-hidden="true">'+esc(m[1]+m[2]+' ')+'</span>'+esc(m[3])+'</h'+m[2].length+'>';lineNo++;return;}
        if(part){out+='<p class="dm-paragraph">'+esc(part)+'</p>';lineNo++;}
      });
      return out;
    }
    this.sections=boundaries.map(function(b,i){var raw=text.slice(b.start,b.end),h=b.heading;return {index:i,href:'',label:h?h.label:(i===0?(this.meta.documentTitle||this.meta.name||'正文'):'正文'),headingLevel:h?h.level:0,isNavigation:!!h,text:raw,html:'<article>'+dmHtml(raw)+'</article>',textStart:b.start,textEnd:b.end};},this);
    this.toc=this.sections.filter(function(s){return s.isNavigation;}).map(function(s){return {label:s.label,index:s.index,headingLevel:s.headingLevel,offset:0};});
    if(!this.toc.length&&this.sections.length===1)this.toc=[{label:this.sections[0].label,index:0,headingLevel:1}];
    return this;
  }
  async openHTMLContent(){
    var c=await BookNoteReadestBridge.openBook(this.meta.id),text=String(c.content&&c.content.text||''),html=String(c.content&&c.content.html||'');
    var rawSections=c.content&&Array.isArray(c.content.chapters)&&c.content.chapters.length?c.content.chapters:[{index:0,label:this.meta.documentTitle||this.meta.name||'正文',html:html,text:text,textStart:0,textEnd:text.length}];
    function normalizeHtmlFragment(src){
      var d=document.implementation.createHTMLDocument('html-import');d.body.innerHTML=String(src||'');
      Array.prototype.forEach.call(d.body.querySelectorAll('p'),function(el){el.classList.add('booknote-html-paragraph');});
      Array.prototype.forEach.call(d.body.querySelectorAll('h1,h2,h3,h4,h5,h6'),function(el){el.classList.add('booknote-html-heading');});
      return d.body.innerHTML;
    }
    this.sections=rawSections.map(function(x,i){
      var h=String(x.html||'');
      var probe=document.implementation.createHTMLDocument('html-toc');probe.body.innerHTML=h;
      var first=probe.querySelector('h1,h2,h3,h4,h5,h6');
      var level=first?Number(first.tagName.slice(1)):Number(x.headingLevel)||0;
      var label=first?String(first.textContent||'').replace(/\s+/g,' ').trim():String(x.label||('第 '+(i+1)+' 节')).trim();
      return {index:i,href:x.href||'',label:label||String(x.label||('第 '+(i+1)+' 节')),headingLevel:level,isNavigation:!!first||x.isNavigation!==false,html:normalizeHtmlFragment(h||'<p>'+esc(x.text||'')+'</p>'),text:String(x.text||''),textStart:Number(x.textStart)||0,textEnd:Number(x.textEnd)!=null?Number(x.textEnd):((Number(x.textStart)||0)+String(x.text||'').length)};
    });
    this.toc=this.sections.filter(function(s){return s.isNavigation!==false&&s.headingLevel>0;}).map(function(s){return {label:s.label,index:s.index,headingLevel:s.headingLevel,offset:0};});
    if(!this.toc.length&&this.sections.length===1)this.toc=[{label:this.sections[0].label,index:0,headingLevel:1}];
    return this;
  }
  async assetDataUrl(path,media){
    try{
      var blob=await this.archive.blobOf(path,media||'application/octet-stream');
      var url=URL.createObjectURL(blob);
      this._blobUrls.add(url);
      return url;
    }catch(_){return ''}
  }
  releaseAssets(){
    if(!this._blobUrls)return;
    this._blobUrls.forEach(function(url){try{URL.revokeObjectURL(url)}catch(_){}});
    this._blobUrls.clear();
  }
  async prepareSection(html,baseHref,manifest){
    var d=document.implementation.createHTMLDocument('section');d.body.innerHTML=html;var full=d.querySelector('html');if(full){var body=full.querySelector('body');if(body)d.body.innerHTML=body.innerHTML;}
    var imgs=Array.from(d.querySelectorAll('img[src]'));
    for(var i=0;i<imgs.length;i++){
      var src=imgs[i].getAttribute('src')||'';
      if(/^(data:|blob:|https?:)/i.test(src))continue;
      var path=resolvePath(baseHref,src.split('#')[0]);
      var item=manifest.get(path),url=await this.assetDataUrl(path,item&&item.media);
      if(url)imgs[i].setAttribute('src',url);
    }
    return d.body.innerHTML;
  }
  async openEPUB(){
    this.archive=await new ZipArchive(this.blob).init();
    var container=parseXML(await this.archive.text('META-INF/container.xml')),rootfile=findOne(container,'rootfile');
    var opfPath=rootfile&&rootfile.getAttribute('full-path');if(!opfPath)throw new Error('EPUB 缺少 OPF');this.base=dirname(opfPath);
    var opf=parseXML(await this.archive.text(opfPath)),manifest=new Map(),spine=[];
    findAll(opf,'item').forEach(function(i){manifest.set(i.getAttribute('id'),{href:resolvePath(opfPath,i.getAttribute('href')||''),media:i.getAttribute('media-type')||'',props:i.getAttribute('properties')||''})});
    findAll(opf,'itemref').forEach(function(i){var id=i.getAttribute('idref'),m=manifest.get(id);if(m&&i.getAttribute('linear')!=='no')spine.push({id:id,href:m.href,media:m.media,props:m.props})});
    var navItem=Array.from(manifest.values()).find(function(x){return /nav\b/.test(x.props)}),toc=[];
    if(navItem){try{var nav=parseXML(await this.archive.text(navItem.href));findAll(nav,'a').forEach(function(a){var href=a.getAttribute('href')||'';if(href)return toc.push({label:(a.textContent||'').trim(),href:resolvePath(navItem.href,href)});});}catch(_){} }
    for(var i=0;i<spine.length;i++){
      var s=spine[i],raw=await this.archive.text(s.href),html=sanitizeHTML(raw);
      html=await this.prepareSection(html,s.href,manifest);
      var text=stripTags(html);
      var sec={index:i,id:s.id,href:s.href,label:(toc.find(function(t){return t.href.split('#')[0]===s.href.split('#')[0]})||{}).label||('第 '+(i+1)+' 节'),html:html,text:text,textStart:0,textEnd:text.length};
      if(globalThis.BookNoteEpubMultiModule){
        var tmp=document.implementation.createHTMLDocument('epub-section');tmp.body.innerHTML=html;
        sec.model=BookNoteEpubMultiModule.buildSection(sec,tmp);
        // The EPUB model's TextNode index is the single canonical text source.
        // Do not keep a second stripTags() character space that can drift from the
        // DOM model when XHTML contains entities, whitespace, or nested markup.
        sec.text=String(sec.model.textIndex&&sec.model.textIndex.text||'');
        sec.textStart=0;
        sec.textEnd=sec.text.length;
      }
      this.sections.push(sec);
    }
    var cursor=0;this.sections.forEach(function(s){s.textStart=cursor;cursor+=s.text.length;s.textEnd=cursor});
    if(globalThis.BookNoteEpubMultiModule){
      this.epubModel=new BookNoteEpubMultiModule.EpubMultiModuleModel({opfPath:opfPath,spine:spine,toc:toc},this.sections);
      this.sections.forEach(function(s){if(s.model&&s.model.chapters){s.model.chapters.forEach(function(c){c.globalStart=s.textStart+c.start;c.globalEnd=s.textStart+c.end;});}});
      this.epubModel.rebuildIndexes();
    }
    this.toc=this.sections.map(function(s,i){return {label:s.label,index:i}});return this;
  }
}

class ReadestRuntime extends EventTarget{
  constructor(opts){super();opts=opts||{};this.viewport=opts.viewport;this.content=opts.content;this.toc=opts.toc;this.currentIndex=0;this.currentOffset=0;this.initialIndex=0;this.initialOffset=0;this._scrollSectionTransition=false;this.book=null;this.iframe=null;this.canonicalSections=[];this._positionCache=new WeakMap();this.theme={name:opts.themeName||"everforest",mode:opts.themeMode==="night"?"night":"day"};this.displayMode=opts.displayMode==="single"?"single":"double";this.themeName=this.theme.name;this.themeMode=this.theme.mode;this._wheelAccum=0;this._wheelLock=false;this._showSeq=0}
  async open(source,meta){this.close();if(!source||!source.blob)throw new Error('没有可读取的书籍源文件');this.book=await new ReadestBook(source.blob,meta).open();this.renderTOC();await this.show(this.initialIndex||0,this.initialOffset||0);this.dispatchEvent(new CustomEvent('ready',{detail:{book:this.book}}));return this.book}
  async   openContent(content,meta){this.close();var c=content||{},text=String(c.text||''),html=String(c.html||'');var chapters=Array.isArray(c.chapters)&&c.chapters.length?c.chapters:[{index:0,label:(meta&&(meta.documentTitle||meta.name))||'正文',href:'',text:text,html:html,textStart:0,textEnd:text.length}];this.book={meta:meta||{},sections:chapters.map(function(x,i){return {index:i,href:x.href||'',fragment:x.fragment||'',label:x.label||('第 '+(i+1)+' 节'),headingLevel:Number(x.headingLevel)||1,isNavigation:x.isNavigation!==false,html:String(x.html||'<p>'+esc(x.text||'')+'</p>'),text:String(x.text||''),textStart:Number(x.textStart)||0,textEnd:Number(x.textEnd)!=null?Number(x.textEnd):((Number(x.textStart)||0)+String(x.text||'').length),paragraphs:Array.isArray(x.paragraphs)?x.paragraphs.map(function(p){return {start:Number(p&&p.start)||0,end:Number(p&&p.end)||0};}):[],paragraphSourceHash:String(x.paragraphSourceHash||'')}}),toc:chapters.filter(function(x){return x.isNavigation!==false;}).map(function(x){return {label:x.label||('第 '+(x.index+1)+' 节'),index:x.index,headingLevel:Number(x.headingLevel)||1}})};this.renderTOC();await this.show(this.initialIndex||0,this.initialOffset||0);this.dispatchEvent(new CustomEvent('ready',{detail:{book:this.book}}));return this.book}
  setCanonicalSections(sections){this.canonicalSections=Array.isArray(sections)?sections.map(function(x,i){return {index:i,label:String(x&&x.label||''),href:String(x&&x.href||''),fragment:String(x&&x.fragment||''),text:String(x&&x.text||''),textStart:Number(x&&x.textStart)||0,textEnd:Number(x&&x.textEnd)!=null?Number(x&&x.textEnd):((Number(x&&x.textStart)||0)+String(x&&x.text||'').length)};}):[];this._positionCache=new WeakMap();if(typeof BookNoteCanonical!=='undefined'&&this.canonicalSections.length){var vr=BookNoteCanonical.validateCoverage(this.canonicalSections,this.canonicalSections[this.canonicalSections.length-1].textEnd);if(!vr.ok)console.warn('[BookNote Canonical] chapter coverage validation failed',vr.errors);}return this.canonicalSections;}
  canonicalSection(index){var i=Math.max(0,Math.min((this.canonicalSections.length||this.book&&this.book.sections.length||1)-1,Number(index)||0));return this.canonicalSections[i]||this.book&&this.book.sections[i]||{index:i,text:'',textStart:0,textEnd:0};}
  invalidatePositionMap(doc){if(doc)this._positionCache.delete(doc);}
  positionNodes(doc){var cached=this._positionCache.get(doc);if(cached)return cached;var root=doc.getElementById('source')||doc.body,walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],n,total=0;while((n=walker.nextNode())){var p=n.parentElement;if(p&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(p.tagName))continue;var len=(n.nodeValue||'').length;if(!len)continue;nodes.push({n:n,s:total,e:total+len});total+=len;}var raw=nodes.map(function(x){return x.n.nodeValue||''}).join(''),proj=readerProjectText(raw);cached={nodes:nodes,raw:raw,proj:proj};this._positionCache.set(doc,cached);return cached;}
  domPointAt(info,raw){raw=Math.max(0,Math.min(Number(raw)||0,info.raw.length));var nodes=info.nodes;if(!nodes.length)return null;var lo=0,hi=nodes.length-1,idx=nodes.length-1;while(lo<=hi){var mid=(lo+hi)>>1;if(raw<=nodes[mid].e){idx=mid;hi=mid-1;}else lo=mid+1;}var x=nodes[idx];return {node:x.n,offset:Math.max(0,Math.min((x.n.nodeValue||'').length,raw-x.s))};}
  isEpubMulti(){return !!(this.book&&this.book.epubModel);}
  epubFindHits(query){if(!this.isEpubMulti())return [];return this.book.epubModel.findAll(query).map(function(h){var s=this.book.sections[h.sectionIndex],base=Number(s&&s.textStart)||0;return Object.assign({},h,{start:base+h.start,end:base+h.end,localStart:h.start,localEnd:h.end,chapterIndex:h.sectionIndex,sectionIndex:h.sectionIndex,epubLocator:h.locator});},this);}
  epubResolveHit(hit){
    if(!this.isEpubMulti()||!this.iframe||!hit)return null;
    var loc=hit.epubLocator||hit.locator||{};
    var sectionIndex=loc.sectionIndex!=null?Number(loc.sectionIndex):(loc.spineIndex!=null?Number(loc.spineIndex):Number(hit.sectionIndex!=null?hit.sectionIndex:hit.chapterIndex));
    if(!Number.isFinite(sectionIndex))sectionIndex=0;
    sectionIndex=Math.max(0,Math.floor(sectionIndex));
    var s=this.book.sections[sectionIndex],doc=this.iframe.contentDocument;
    if(!s||!doc||!globalThis.BookNoteEpubMultiModule)return null;
    // The live DOM is mutable: annotation/search <mark> nodes can split and later
    // merge TextNodes. Never reuse a cached TextNode map across DOM mutations.
    var model=BookNoteEpubMultiModule.buildSection(s,doc);
    var base=Number(s.textStart)||0;
    var localStart=loc.start!=null?Number(loc.start):(hit.localStart!=null?Number(hit.localStart):((Number(hit.start)||0)-base));
    var localEnd=loc.end!=null?Number(loc.end):(hit.localEnd!=null?Number(hit.localEnd):((Number(hit.end)!=null?Number(hit.end):Number(hit.start)||0)-base));
    localStart=Math.max(0,Number.isFinite(localStart)?localStart:0);
    localEnd=Math.max(localStart,Number.isFinite(localEnd)?localEnd:localStart);
    var liveHit=Object.assign({},hit,{
      sectionIndex:s.index,
      localStart:localStart,
      localEnd:localEnd,
      start:localStart,
      end:localEnd,
      logicalChapterIndex:hit.logicalChapterIndex!=null?hit.logicalChapterIndex:loc.logicalChapterIndex,
      blockId:hit.blockId||loc.blockId||'',
      sentenceId:hit.sentenceId||loc.sentenceId||'',
      query:String(hit.query||hit.text||loc.textQuote&&loc.textQuote.exact||'')
    });
    var wrapper=new BookNoteEpubMultiModule.EpubMultiModuleModel({},[{index:s.index,id:s.id,href:s.href,label:s.label,model:model}]);
    var resolved=wrapper.resolveHit(liveHit,doc);
    if(!resolved||!resolved.range)return null;
    return {range:resolved.range,locator:loc&&loc.type==='epub'?loc:null,sectionIndex:s.index,logicalChapterIndex:liveHit.logicalChapterIndex,blockId:liveHit.blockId,sentenceId:liveHit.sentenceId};
  }
  epubLocateAndHighlight(hit){
    if(!this.isEpubMulti()||!this.iframe||!globalThis.BookNoteEpubUnifiedLocator)return null;
    var doc=this.iframe.contentDocument;if(!doc)return null;
    return globalThis.BookNoteEpubUnifiedLocator.locateAndHighlight(doc,hit);
  }
  epubAnchorFromRange(range,selectedText){if(!this.isEpubMulti()||!this.iframe||!range||!globalThis.BookNoteEpubUnifiedLocator)return null;var doc=this.iframe.contentDocument;if(!doc)return null;var s=this.book&&this.book.sections&&this.book.sections[Number(this.currentIndex)||0];if(!s)return null;return globalThis.BookNoteEpubUnifiedLocator.anchorFromRange(doc,s,range,selectedText);}
  epubResolveAnnotation(annotation){if(!this.isEpubMulti()||!this.iframe||!annotation||!globalThis.BookNoteEpubUnifiedLocator)return null;var doc=this.iframe.contentDocument;if(!doc)return null;var loc=annotation.epubLocator||annotation.locator||{};var idx=loc.sectionIndex!=null?Number(loc.sectionIndex):(loc.spineIndex!=null?Number(loc.spineIndex):Number(annotation.chapterIndex)||0);var s=this.book&&this.book.sections&&this.book.sections[idx];if(!s)return null;return globalThis.BookNoteEpubUnifiedLocator.resolveAnnotation(doc,s,annotation);}
  epubResolveSentence(sentenceId,query,queryOffset,sectionIndex){if(!this.isEpubMulti()||!this.iframe||!globalThis.BookNoteEpubUnifiedLocator)return null;var doc=this.iframe.contentDocument;if(!doc)return null;var idx=sectionIndex!=null?Number(sectionIndex):Number(this.currentIndex)||0,s=this.book&&this.book.sections&&this.book.sections[idx];if(!s)return null;return globalThis.BookNoteEpubUnifiedLocator.resolveSentence(doc,s,sentenceId,query,queryOffset);}

  epubResolveLiveHit(hit){
    if(!this.isEpubMulti()||!this.iframe||!hit)return null;
    var doc=this.iframe.contentDocument;
    if(!doc)return null;
    var root=doc.getElementById('source')||doc.body;
    if(!root)return null;
    var walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],n,total=0;
    while((n=walker.nextNode())){
      var p=n.parentElement;
      if(p&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(p.tagName))continue;
      var text=String(n.nodeValue||'');
      if(!text)continue;
      nodes.push({node:n,start:total,end:total+text.length});
      total+=text.length;
    }
    if(!nodes.length)return null;
    var raw=nodes.map(function(x){return x.node.nodeValue||'';}).join('');
    var query=String(hit.quote||hit.text||hit.query||'');
    if(!query)return null;
    function norm(x){return String(x||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
    function normalizedMap(text){
      var out='',starts=[],ends=[],i=0;
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
    function point(rawOffset){
      var lo=0,hi=nodes.length-1;
      while(lo<=hi){var mid=(lo+hi)>>1,x=nodes[mid];if(rawOffset<x.start)hi=mid-1;else if(rawOffset>x.end)lo=mid+1;else return {node:x.node,offset:Math.max(0,Math.min((x.node.nodeValue||'').length,rawOffset-x.start))};}
      var last=nodes[nodes.length-1];return {node:last.node,offset:(last.node.nodeValue||'').length};
    }
    function makeRange(start,end){var a=point(start),b=point(end);if(!a||!b)return null;var r=doc.createRange();try{r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);}catch(_){return null;}return r;}
    var occurrence=Number.isFinite(Number(hit.occurrenceInSection))?Number(hit.occurrenceInSection):null;
    var exact=query,matchStart=-1,matchEnd=-1,matchOcc=0,from=0;
    while(from<=raw.length){
      var p=raw.indexOf(exact,from);if(p<0)break;
      if(occurrence==null||matchOcc===occurrence){matchStart=p;matchEnd=p+exact.length;break;}
      matchOcc++;from=p+Math.max(1,exact.length);
    }
    if(matchStart<0){
      var rm=normalizedMap(raw),q=norm(query),fromN=0,occN=0;
      while(fromN<=rm.text.length){
        var np=rm.text.indexOf(q,fromN);if(np<0)break;
        if(occurrence==null||occN===occurrence){
          matchStart=rm.starts[np];
          matchEnd=rm.ends[np+q.length-1];
          break;
        }
        occN++;fromN=np+Math.max(1,q.length);
      }
    }
    if(matchStart<0||matchEnd<=matchStart)return null;
    var range=makeRange(matchStart,matchEnd);if(!range||range.collapsed)return null;
    if(norm(range.toString())!==norm(query))return null;
    return {range:range,start:matchStart,end:matchEnd,sectionIndex:this.currentIndex,occurrence:occurrence};
  }

  epubSentenceRange(item){
    if(!this.isEpubMulti()||!this.iframe)return null;
    var s=this.book.sections[Number(item.sectionIndex)||0],doc=this.iframe.contentDocument;if(!s||!doc)return null;
    var model=BookNoteEpubMultiModule.buildSection(s,doc);
    var sentence=(model.sentences||[]).find(function(x){return x.id===item.sentenceId;});
    if(!sentence)return null;
    var r=BookNoteEpubMultiModule.rangeFromSpans(model.textIndex,sentence.nodeSpans);
    if(!r)return null;
    return {startContainer:r.start.node,startOffset:r.start.offset,endContainer:r.end.node,endOffset:r.end.offset,text:sentence.text,sentenceId:sentence.id};
  }
  epubSentenceQueue(startSection,startOffset){if(!this.isEpubMulti())return [];var out=[],model=this.book.epubModel;for(var i=Math.max(0,Number(startSection)||0);i<model.sections.length;i++){var sec=model.sections[i],from=i===Number(startSection)?Number(startOffset)||0:0;(sec.model.sentences||[]).forEach(function(x){if(x.end>from){var block=(sec.model.blocks||[]).find(function(b){return (b.sentences||[]).some(function(z){return z.id===x.id})})||null;var chapter=(sec.model.chapters||[]).find(function(c){return x.start>=c.start&&x.start<c.end;})||null;out.push({sectionIndex:i,start:x.start,end:x.end,text:x.text,sentenceId:x.id,blockId:block&&block.id||'',logicalChapterId:chapter&&chapter.id||'',logicalChapterIndex:chapter&&chapter.globalIndex!=null?chapter.globalIndex:(chapter&&chapter.index!=null?chapter.index:0),epubLocator:{type:'epub',format:'epub',spineIndex:i,sectionIndex:i,sectionId:String(sec.id||''),href:String(sec.href||''),logicalChapterId:chapter&&chapter.id||'',logicalChapterIndex:chapter&&chapter.globalIndex!=null?chapter.globalIndex:(chapter&&chapter.index!=null?chapter.index:0),blockId:block&&block.id||'',sentenceId:x.id,start:x.start,end:x.end,textQuote:{exact:String(x.text||''),sentence:String(x.text||'').slice(0,240)}}});}});}return out;}
  epubHighlightSentence(item){
    var r=this.epubSentenceRange(item);if(!r)return null;
    var range=this.iframe.contentDocument.createRange();
    try{range.setStart(r.startContainer,r.startOffset);range.setEnd(r.endContainer,r.endOffset);}catch(_){return null;}
    return range;
  }
  txtCanonicalToDom(index,start,end,quote){
    var doc=this.iframe&&this.iframe.contentDocument;if(!doc)return null;
    if(!doc.body||!doc.body.classList||!doc.body.classList.contains('reader-format-txt'))return null;
    var canon=this.canonicalSection(index),ct=String(canon.text||'');
    var s=Math.max(0,Math.min(Number(start)||0,ct.length)),e=Math.max(s,Math.min(Number(end)!=null?Number(end):s,ct.length));
    var root=doc.getElementById('source')||doc.body,els=Array.prototype.slice.call(root.querySelectorAll('[data-txt-source-start][data-txt-source-end]'));
    if(!els.length)return null;
    els=els.map(function(el){return {el:el,s:Number(el.getAttribute('data-txt-source-start')),e:Number(el.getAttribute('data-txt-source-end'))};}).filter(function(x){return Number.isFinite(x.s)&&Number.isFinite(x.e)&&x.e>x.s;}).sort(function(a,b){return a.s-b.s;});
    function mapPoint(item,pos,isEnd){
      var es=item.s,ee=item.e,src=ct.slice(es,ee),local=Math.max(0,Math.min(src.length,pos-es));
      var sp=readerProjectText(src),el=item.el,NF=(doc.defaultView&&doc.defaultView.NodeFilter)||NodeFilter,w=doc.createTreeWalker(el,NF.SHOW_TEXT),nodes=[],n,raw='';
      while((n=w.nextNode())){var p=n.parentElement;if(p&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(p.tagName))continue;var t=String(n.nodeValue||'');if(!t)continue;nodes.push({n:n,s:raw.length,e:raw.length+t.length});raw+=t;}
      if(sp.text===readerProjectText(raw).text){var dp=readerProjectText(raw),ni;if(local>=src.length)ni=dp.starts.length;else ni=readerNormIndexAt(sp,local);var ri=ni>=dp.starts.length?raw.length:dp.starts[Math.max(0,ni)]||0;return this.domPointAt({nodes:nodes,raw:raw},ri);}
      /* TXT safe absolute mapping: if source/render projections differ,
         do not search for quote text. Repeated words must never resolve to a
         later occurrence. The caller may fail closed instead. */
      return null;
    }
    function findAt(pos,preferEnd){
      for(var i=0;i<els.length;i++){var x=els[i];if(pos>=x.s&&pos<=x.e)return x;}
      if(preferEnd){for(var j=els.length-1;j>=0;j--)if(pos>=els[j].s)return els[j];}
      return els[0]||null;
    }
    var a=findAt(s,false),b=findAt(e,true);if(!a||!b)return null;
    var ap=mapPoint.call(this,a,s,false),bp=mapPoint.call(this,b,e,true);if(!ap||!bp)return null;
    try{var r=doc.createRange();r.setStart(ap.node,ap.offset);r.setEnd(bp.node,bp.offset);if(r.collapsed)return null;var expected=readerProjectText(ct.slice(s,e)).text,actual=readerProjectText(r.toString()).text;if(expected!==actual)return null;return {start:ap,end:bp,confidence:'txt-source-annotated-exact',range:r};}catch(_){return null;}
  }

  /* v7.18.56 — source-anchor layer for TXT/ODT/DOCX/MD/HTML.
   * DOM is rebuilt on every show(); source ranges survive because they are
   * attached to the imported chapter's immutable text space, not DOM nodes.
   */
  installOdtSourceAnchors(index,doc){
    if(!doc||this.isEpubMulti()||this.formatKind()!=='odt')return [];
    var sec=this.canonicalSection(index),ct=String(sec.text||''),root=doc.getElementById('source')||doc.body;
    if(!root||!ct||!doc.body.classList.contains('reader-format-odt'))return [];
    var existing=Array.prototype.slice.call(root.querySelectorAll('[data-odt-source-start][data-odt-source-end]')).filter(function(el){
      var a=Number(el.getAttribute('data-odt-source-start')),b=Number(el.getAttribute('data-odt-source-end'));
      return Number.isFinite(a)&&Number.isFinite(b)&&b>a;
    });
    if(existing.length)return existing;
    var blocks=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,dt,dd'));
    if(!blocks.length)blocks=Array.prototype.slice.call(root.children||[]);
    function fold(v){var x=String(v||'').replace(/\u00a0/g,' ').replace(/\r\n|\r/g,'\n').replace(/\s+/g,' ').trim();try{x=x.normalize('NFKC')}catch(_){}return x;}
    var folded=fold(ct),map=[],fi=0,i,j,ch,nx,cursor=0;
    for(i=0;i<ct.length&&fi<folded.length;i++){
      ch=ct.charAt(i);
      if(/\s/.test(ch)){
        while(i+1<ct.length&&/\s/.test(ct.charAt(i+1)))i++;
        if(fi<folded.length&&folded.charAt(fi)===' ')map[fi++]=i;
        continue;
      }
      nx=ch;try{nx=nx.normalize('NFKC')}catch(_){}
      for(j=0;j<nx.length&&fi<folded.length;j++)map[fi++]=i;
    }
    blocks.forEach(function(el){
      var needle=fold(el.textContent||'');if(!needle)return;
      var at=folded.indexOf(needle,cursor);if(at<0)return;
      var endFold=at+needle.length-1,start=map[at],end=endFold<map.length?map[endFold]+1:ct.length;
      if(start==null||end<=start)return;
      el.setAttribute('data-odt-source-start',String(start));
      el.setAttribute('data-odt-source-end',String(end));
      el.setAttribute('data-odt-source-version','1');
      cursor=endFold+1;
    });
    return Array.prototype.slice.call(root.querySelectorAll('[data-odt-source-start][data-odt-source-end]'));
  }
  odtSourceAnchorItems(doc,index){
    if(!doc||this.formatKind()!=='odt')return [];
    var root=doc.getElementById('source')||doc.body;if(!root)return [];
    this.installOdtSourceAnchors(index,doc);
    return Array.prototype.slice.call(root.querySelectorAll('[data-odt-source-start][data-odt-source-end]')).map(function(el){
      return {el:el,s:Number(el.getAttribute('data-odt-source-start')),e:Number(el.getAttribute('data-odt-source-end'))};
    }).filter(function(x){return Number.isFinite(x.s)&&Number.isFinite(x.e)&&x.e>x.s;}).sort(function(a,b){return a.s-b.s;});
  }
  odtSourceAnchorPoint(doc,item,pos,sourceText){
    if(!doc||!item)return null;
    var local=Math.max(0,Math.min(String(sourceText||'').length,Number(pos)||0)-item.s),slice=String(sourceText||'').slice(item.s,item.e);
    var walker=doc.createTreeWalker(item.el,NodeFilter.SHOW_TEXT),nodes=[],n,raw='';
    while((n=walker.nextNode())){var p=n.parentElement;if(p&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(p.tagName))continue;var t=String(n.nodeValue||'');if(!t)continue;nodes.push({n:n,s:raw.length,e:raw.length+t.length});raw+=t;}
    if(!nodes.length)return null;
    var sp=readerProjectText(slice),dp=readerProjectText(raw),ri=0;
    if(sp.text!==dp.text)return null;
    if(local>=slice.length)ri=raw.length;else{var ni=readerNormIndexAt(sp,local);ri=ni>=dp.starts.length?raw.length:(dp.starts[ni]||0);}
    return this.domPointAt({nodes:nodes,raw:raw},ri);
  }
  odtSourceAnchoredToDom(index,start,end){
    var doc=this.iframe&&this.iframe.contentDocument;if(!doc||this.isEpubMulti()||this.formatKind()!=='odt')return null;
    var sec=this.canonicalSection(index),ct=String(sec.text||''),items=this.odtSourceAnchorItems(doc,index);if(!items.length)return null;
    var s=Math.max(0,Math.min(Number(start)||0,ct.length)),e=Math.max(s,Math.min(Number(end)!=null?Number(end):s,ct.length));
    function startItem(){for(var i=0;i<items.length;i++){if(s>=items[i].s&&s<items[i].e)return items[i];}for(var j=items.length-1;j>=0;j--)if(s===items[j].e)return items[j];return null;}
    function endItem(){if(e===s)return startItem();for(var i=items.length-1;i>=0;i--){if(e>items[i].s&&e<=items[i].e)return items[i];}for(var j=0;j<items.length;j++)if(e===items[j].s)return j>0?items[j-1]:items[j];return null;}
    var a=startItem(),b=endItem();if(!a||!b)return null;
    var ap=this.odtSourceAnchorPoint(doc,a,s,ct),bp=this.odtSourceAnchorPoint(doc,b,e,ct);if(!ap||!bp)return null;
    try{var rr=doc.createRange();rr.setStart(ap.node,ap.offset);rr.setEnd(bp.node,bp.offset);var expected=readerProjectText(ct.slice(s,e)).text,actual=readerProjectText(rr.toString()).text;if(expected!==actual)return null;return {start:ap,end:bp,range:rr,confidence:'odt-source-anchor-exact'};}catch(_){return null;}
  }
  odtDomRangeToCanonical(index,range,options){
    if(this.formatKind()!=='odt')return null;
    options=options||{};var doc=this.iframe&&this.iframe.contentDocument;if(!doc||!range||!doc.body.classList.contains('reader-format-odt'))return null;
    var ct=String(this.canonicalSection(index).text||''),root=doc.getElementById('source')||doc.body;this.installOdtSourceAnchors(index,doc);
    function anchorFor(node){var el=node&&node.nodeType===1?node:node&&node.parentElement;while(el&&el!==root){if(el.hasAttribute&&el.hasAttribute('data-odt-source-start')&&el.hasAttribute('data-odt-source-end'))return {el:el,s:Number(el.getAttribute('data-odt-source-start')),e:Number(el.getAttribute('data-odt-source-end'))};el=el.parentElement;}if(node===root)return {el:root,s:0,e:ct.length,rootBoundary:true};return null;}
    function sourcePoint(item,node,off){if(!item||!Number.isFinite(item.s)||!Number.isFinite(item.e))return null;if(item.rootBoundary&&node===root)return Number(off)<=0?0:ct.length;var pre=doc.createRange();try{pre.selectNodeContents(item.el);pre.setEnd(node,off);}catch(_){return null;}var prefix=String(pre.toString()||''),whole=String(item.el.textContent||''),src=ct.slice(item.s,item.e),sp=readerProjectText(src),wp=readerProjectText(whole),pp=readerProjectText(prefix);if(sp.text!==wp.text)return null;var norm=Math.min(sp.text.length,pp.text.length),raw=norm>=sp.text.length?src.length:(sp.starts[Math.max(0,norm)]||0);return item.s+raw;}
    var sa=anchorFor(range.startContainer),ea=anchorFor(range.endContainer);if(!sa||!ea)return null;var ss=sourcePoint(sa,range.startContainer,range.startOffset),ee=sourcePoint(ea,range.endContainer,range.endOffset);if(ss==null||ee==null||ee<ss)return null;var selected=String(range.toString()||''),expected=readerProjectText(ct.slice(ss,ee)).text;if(readerProjectText(selected).text!==expected)return null;return {start:ss,end:ee,text:selected,confidence:'odt-source-anchor-exact'};
  }
  odtCanonicalToDom(index,start,end,quote,options){if(this.formatKind()!=='odt')return null;return this.odtSourceAnchoredToDom(index,start,end);}

  docxDomRangeToCanonical(index,range,options){
    if(this.formatKind()!=='docx')return null;
    options=options||{};var doc=this.iframe&&this.iframe.contentDocument;if(!doc||!range||!doc.body.classList.contains('reader-format-docx'))return null;
    var ct=String(this.canonicalSection(index).text||''),root=doc.getElementById('source')||doc.body;this.installDocxSourceAnchors(index,doc);
    function anchorFor(node){var el=node&&node.nodeType===1?node:node&&node.parentElement;while(el&&el!==root){if(el.hasAttribute&&el.hasAttribute('data-docx-source-start')&&el.hasAttribute('data-docx-source-end'))return {el:el,s:Number(el.getAttribute('data-docx-source-start')),e:Number(el.getAttribute('data-docx-source-end'))};el=el.parentElement;}if(node===root)return {el:root,s:0,e:ct.length,rootBoundary:true};return null;}
    function sourcePoint(item,node,off){if(!item||!Number.isFinite(item.s)||!Number.isFinite(item.e))return null;if(item.rootBoundary&&node===root)return Number(off)<=0?0:ct.length;var pre=doc.createRange();try{pre.selectNodeContents(item.el);pre.setEnd(node,off);}catch(_){return null;}var prefix=String(pre.toString()||''),whole=String(item.el.textContent||''),src=ct.slice(item.s,item.e),sp=readerProjectText(src),wp=readerProjectText(whole),pp=readerProjectText(prefix);if(sp.text!==wp.text)return null;var norm=Math.min(sp.text.length,pp.text.length),raw=norm>=sp.text.length?src.length:(sp.starts[Math.max(0,norm)]||0);return item.s+raw;}
    var sa=anchorFor(range.startContainer),ea=anchorFor(range.endContainer);if(!sa||!ea)return null;var ss=sourcePoint(sa,range.startContainer,range.startOffset),ee=sourcePoint(ea,range.endContainer,range.endOffset);if(ss==null||ee==null||ee<ss)return null;var selected=String(range.toString()||''),expected=readerProjectText(ct.slice(ss,ee)).text;if(readerProjectText(selected).text!==expected)return null;return {start:ss,end:ee,text:selected,confidence:'docx-source-anchor-exact'};
  }
  docxCanonicalToDom(index,start,end,quote,options){if(this.formatKind()!=='docx')return null;return this.docxSourceAnchoredToDom(index,start,end);}
    domRangeToCanonical(index,range,options){
    options=options||{};
    var annotationMode=options.annotation===true;
    var kind=this.formatKind();
    if(kind==="txt")return this.txtDomRangeToCanonical(index,range,options);
    if(kind==="odt")return this.odtDomRangeToCanonical(index,range,options);
    if(kind==="docx")return this.docxDomRangeToCanonical(index,range,options);
    if(kind==="epub")return null;
    var doc=this.iframe&&this.iframe.contentDocument;if(!doc||!range)return null;var canon=this.canonicalSection(index),ct=String(canon.text||''),root=doc.getElementById('source')||doc.body;
    if(!this.isEpubMulti()&&root){
      this.installGenericSourceAnchors(index,doc);
      function anchorFor(node){
        var el=node&&node.nodeType===1?node:node&&node.parentElement;
        while(el&&el!==root){if(el.hasAttribute&&el.hasAttribute('data-bn-source-start')&&el.hasAttribute('data-bn-source-end'))return {el:el,s:Number(el.getAttribute('data-bn-source-start')),e:Number(el.getAttribute('data-bn-source-end'))};el=el.parentElement;}
        /* Full-document selections can use the source root itself as a boundary
           container. The root has no source attributes, but its offsets are
           deterministic and must not be rejected. */
        if(node===root)return {el:root,s:0,e:ct.length,rootBoundary:true};
        return null;
      }
      function sourcePoint(item,node,off){
        if(!item||!Number.isFinite(item.s)||!Number.isFinite(item.e))return null;
        if(item.rootBoundary&&node===root)return Number(off)<=0?0:ct.length;
        var pre=doc.createRange();try{pre.selectNodeContents(item.el);pre.setEnd(node,off);}catch(_){return null;}
        var prefix=String(pre.toString()||''),whole=String(item.el.textContent||''),src=ct.slice(item.s,item.e),sp=readerProjectText(src),wp=readerProjectText(whole),pp=readerProjectText(prefix);
        if(sp.text!==wp.text)return null;
        var norm=Math.min(sp.text.length,pp.text.length),raw=norm>=sp.text.length?src.length:(sp.starts[Math.max(0,norm)]||0);
        return item.s+raw;
      }
      var sa=anchorFor(range.startContainer),ea=anchorFor(range.endContainer);
      if(sa&&ea){
        var ss=sourcePoint(sa,range.startContainer,range.startOffset),ee=sourcePoint(ea,range.endContainer,range.endOffset);
        if(ss!=null&&ee!=null&&ee>=ss){
          var selected=String(range.toString()||''),expected=readerProjectText(ct.slice(ss,ee)).text;
          if(readerProjectText(selected).text===expected)return {start:ss,end:ee,text:selected,confidence:'source-anchor-exact'};
        }
      }
    }
    var info=this.positionNodes(doc),cp=readerProjectText(ct),pre=doc.createRange();pre.selectNodeContents(doc.getElementById('source')||doc.body);try{pre.setEnd(range.startContainer,range.startOffset);}catch(_){return null}var rawStart=pre.toString().length,rawEnd=rawStart+String(range.toString()||'').length;if(cp.text===info.proj.text){var ni=rawStart>=info.raw.length?cp.starts.length:readerNormIndexAt(info.proj,rawStart),nj=rawEnd<=rawStart?ni:readerNormIndexAt(info.proj,Math.max(0,rawEnd-1));var cs=ni<cp.starts.length&&cp.starts[ni]!=null?cp.starts[ni]:ct.length,ce=rawEnd<=rawStart?cs:(nj<cp.ends.length?cp.ends[nj]:ct.length);return {start:Math.max(0,Math.min(ct.length,cs)),end:Math.max(Math.max(0,Math.min(ct.length,cs)),Math.min(ct.length,ce)),text:String(range.toString()||''),confidence:'normalized-exact'};}
    /* Annotation mode remains fail-closed for ambiguous/repeated text, but a
       projected quote with exactly one occurrence in both canonical text and
       live DOM is deterministic enough to persist. This keeps the selection
       toolbar usable when only formatting whitespace differs. */
    var selected=String(range.toString()||''),nq=readerProjectText(selected).text;
    if(annotationMode&&nq){
      var canonicalHits=readerFindAll(cp.text,nq,100000),domHits=readerFindAll(info.proj.text,nq,100000);
      if(canonicalHits.length===1&&domHits.length===1){
        var onlyStart=cp.starts[canonicalHits[0]]||0,onlyEnd=cp.ends[Math.min(cp.ends.length-1,canonicalHits[0]+nq.length-1)]||onlyStart;
        return {start:Math.max(0,Math.min(ct.length,onlyStart)),end:Math.max(onlyStart,Math.min(ct.length,onlyEnd)),text:selected,confidence:'unique-quote-exact'};
      }
      return null;
    }if(nq){var pos=readerFindAll(info.proj.text,nq,100000),target=info.proj.text.slice(0,readerNormIndexAt(info.proj,rawStart)),ord=readerFindAll(target,nq,100000).length,canonPos=readerFindAll(cp.text,nq,100000);if(canonPos.length){var p=canonPos[Math.min(ord,canonPos.length-1)],cs=cp.starts[p]||0,ce=cp.ends[Math.min(cp.ends.length-1,p+nq.length-1)]||cs;return {start:cs,end:Math.max(cs,ce),text:selected,confidence:'quote-ordinal'};}}var ratio=info.raw.length?rawStart/info.raw.length:0,cs=Math.round(ct.length*Math.max(0,Math.min(1,ratio)));return {start:cs,end:Math.min(ct.length,cs+selected.length),text:selected};
  }
  canonicalLocalToDomOffset(index,offset,quote){var r=this.canonicalToDom(index,offset,offset,quote);if(!r||!r.start)return 0;var info=this.positionNodes(this.iframe.contentDocument),base=0;for(var i=0;i<info.nodes.length;i++){if(info.nodes[i].n===r.start.node)return info.nodes[i].s+r.start.offset;}return 0;}
  renderTOC(){var self=this;this.toc.innerHTML=this.book.toc.map(function(x){return '<button type="button" data-i="'+Number(x.index||0)+'">'+esc(x.label)+'</button>'}).join('');this.toc.querySelectorAll('[data-i]').forEach(function(b){b.onclick=function(){self.show(Number(b.dataset.i),0)}})}
  themeMap(){return {
    'day-nord':['#eceff4','#f8f9fb','#eef1f5','#2e3440','#697586','#c9d0da','#5e81ac'],
    'day-atom':['#f3f4f6','#ffffff','#f7f8fa','#30343b','#737b88','#d4d8de','#3b82c4'],
    'day-everforest':['#f3f1e5','#faf9ee','#f0f1e4','#343f44','#7a847e','#cbd2bf','#7f9b67'],
    'day-onehalf':['#f5f5f5','#ffffff','#f7f7f7','#30343b','#777f89','#d3d5d8','#4d8cc8'],
    'day-dracula':['#f1eff5','#fbfaff','#f3f0f7','#34313e','#7b7488','#d4cfe0','#8a68bd'],
    'night-nord':['#242933','#3b4252','#2e3440','#eceff4','#9da8b8','#4c566a','#88c0d0'],
    'night-atom':['#1e2127','#282c34','#242830','#abb2bf','#7f8796','#3b4048','#61afef'],
    'night-everforest':['#202724','#343f44','#2d353b','#d3c6aa','#859289','#4b565c','#a7c080'],
    'night-onehalf':['#181a1f','#282c34','#22252c','#d8dee9','#8d96a7','#454b57','#61afef'],
    'night-dracula':['#100f14','#282a36','#21222c','#f8f8f2','#9a9bad','#44475a','#bd93f9']
  }}
  themeCss(){var a=this.themeMap()[(this.themeMode||'day')+'-'+(this.themeName||'everforest')]||this.themeMap()['day-everforest'];return ':root{color-scheme:'+(this.themeMode==='night'?'dark':'light')+';--reader-bg:'+a[0]+';--reader-surface:'+a[1]+';--reader-text:'+a[3]+';--reader-muted:'+a[4]+';--reader-border:'+a[5]+';--reader-accent:'+a[6]+'}'}
  async show(index,offset){
    if(!this.book||!this.book.sections.length)return;
    index=Math.max(0,Math.min(this.book.sections.length-1,Number(index)||0));
    this.currentIndex=index;
    this.currentOffset=Math.max(0,Number(offset)||0);
    var showSeq=++this._showSeq;
    var oldFrame=this.iframe;
    var s=this.book.sections[index],frame=document.createElement('iframe');
    frame.className='readest-frame readest-frame-enter';
    frame.setAttribute('sandbox','allow-same-origin');
    frame.setAttribute('referrerpolicy','no-referrer');
    frame.style.opacity='0';
    frame.style.zIndex='2';
    var style=this.themeCss()+`html,body{width:100%;min-height:100%;margin:0;padding:0;background:var(--reader-bg);color:var(--reader-text);font:18px/1.9 "Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif}*{box-sizing:border-box}body{overflow-y:auto;overflow-x:hidden;padding:48px 7vw 120px;scroll-behavior:auto}body.reader-body{max-width:var(--booknote-reading-width,900px);margin:0 auto}.booknote-book-content{display:block;width:100%;max-width:var(--booknote-reading-width,900px);margin:0 auto}.booknote-book-content > :first-child{margin-top:0}.booknote-book-content p{margin:0 0 1em;text-indent:2em;line-height:1.9}.booknote-book-content p + p{margin-top:0}.booknote-book-content .booknote-normal-block{margin:0 0 1em;text-align:left!important;text-indent:2em;line-height:1.9}.reader-format-txt .booknote-book-content p,.reader-format-txt .booknote-book-content .booknote-normal-block{margin:0!important;text-indent:2em!important;line-height:1.9;white-space:normal!important;padding-left:0!important;margin-left:0!important;margin-right:0!important}.reader-format-txt .booknote-book-content p + p{margin-top:0}.reader-format-txt .booknote-book-content .booknote-normal-block{padding-left:0!important;margin-left:0!important;margin-right:0!important}.reader-format-txt .booknote-book-content .txt-blank{display:none!important}.reader-format-txt .booknote-book-content p.txt-paragraph{ text-indent:0 !important; white-space:pre-wrap !important; }.reader-format-txt .booknote-book-content h1,.reader-format-txt .booknote-book-content h2,.reader-format-txt .booknote-book-content h3,.reader-format-txt .booknote-book-content h4,.reader-format-txt .booknote-book-content h5,.reader-format-txt .booknote-book-content h6,.reader-format-txt .booknote-book-content blockquote,.reader-format-txt .booknote-book-content pre{ text-indent:0!important}.reader-format-txt .booknote-book-content h1,.reader-format-txt .booknote-book-content h2,.reader-format-txt .booknote-book-content h3,.reader-format-txt .booknote-book-content h4,.reader-format-txt .booknote-book-content h5,.reader-format-txt .booknote-book-content h6{font-size:1em!important;text-align:left!important;font-weight:700!important;line-height:1.35!important;margin:0!important}.reader-format-txt .booknote-book-content h1[data-txt-nav-level="1"]{font-size:1.1em!important;font-weight:700!important;line-height:1.35!important;text-align:left!important;margin:0!important}.reader-format-txt .booknote-book-content .txt-numbered-label{display:block!important;text-align:left!important;text-indent:0!important;font-size:1em!important;font-weight:600!important;line-height:1.35!important;margin:0!important;padding:0!important}.reader-format-txt .booknote-book-content p.txt-paragraph{display:block!important;text-align:left!important;text-indent:0!important;line-height:1.9!important;margin:0!important;padding:0!important}.reader-format-office .booknote-book-content p{margin:0!important;padding:0!important;text-indent:2em!important;line-height:1.9!important;margin-left:0!important;margin-right:0!important}.reader-format-office .booknote-book-content p,.reader-format-office .booknote-book-content .booknote-normal-block{margin:0 0 1.9em!important;padding-left:0!important;padding-right:0!important;margin-left:0!important;margin-right:0!important;text-indent:2em!important;line-height:1.9!important;white-space:normal!important}.reader-format-office .booknote-book-content .booknote-document-title{margin:1.2em 0 .8em!important;padding:0!important;text-indent:0!important;text-align:center!important;font-size:1.35em!important;font-weight:600!important;line-height:1.45!important}.reader-format-office .booknote-book-content .txt-reply-inline{margin:0!important;text-indent:2em!important;padding:0!important}.reader-format-office .booknote-book-content .txt-semantic-label{display:inline;font-weight:600;text-indent:0!important}.reader-format-office .booknote-book-content h1,.reader-format-office .booknote-book-content h2,.reader-format-office .booknote-book-content h3,.reader-format-office .booknote-book-content h4,.reader-format-office .booknote-book-content h5,.reader-format-office .booknote-book-content h6{padding-left:0!important;padding-right:0!important}.reader-format-office .booknote-book-content li{white-space:normal!important}
.reader-format-office .booknote-book-content li,.reader-format-office .booknote-book-content li>p{padding:0!important;text-indent:0!important;margin-left:0!important;margin-right:0!important;line-height:1.8!important}.reader-format-office .booknote-book-content h1,.reader-format-office .booknote-book-content h2,.reader-format-office .booknote-book-content h3,.reader-format-office .booknote-book-content h4,.reader-format-office .booknote-book-content h5,.reader-format-office .booknote-book-content h6{font-family:"Microsoft YaHei","PingFang SC","Segoe UI",system-ui,sans-serif!important;font-weight:700!important;text-indent:0!important;margin-left:0!important;margin-right:0!important;line-height:1.35!important}.reader-format-office .booknote-book-content h1,.reader-format-office .booknote-book-content h2,.reader-format-office .booknote-book-content h3,.reader-format-office .booknote-book-content h4,.reader-format-office .booknote-book-content h5,.reader-format-office .booknote-book-content h6{font-size:1em!important;text-align:left!important;margin:0!important}.reader-format-office .booknote-book-content .booknote-document-title{font-size:1.35em!important;text-align:center!important;margin:1.2em 0 .8em!important}.reader-format-office .booknote-book-content blockquote{margin:1em 2em!important;text-indent:0!important;line-height:1.8!important}.reader-format-office .booknote-book-content table p{margin:0!important;text-indent:0!important}.reader-format-office .booknote-book-content img{max-width:100%!important;height:auto!important}.reader-format-office .booknote-book-content ul,.reader-format-office .booknote-book-content ol{margin:.5em 0 1em 1.5em!important;padding-left:1.5em!important}.reader-format-office .booknote-book-content ul p,.reader-format-office .booknote-book-content ol p{margin:0!important;text-indent:0!important} .booknote-epub-noindent{text-indent:0!important}.booknote-book-content .booknote-epub-attribution{text-indent:0!important;text-align:right!important}.booknote-book-content .booknote-epub-centered-special{text-indent:0!important;text-align:center!important}.booknote-book-content .booknote-epub-section{display:block}.booknote-book-content .booknote-epub-heading,.booknote-book-content .booknote-epub-part,.booknote-book-content .booknote-epub-chapter{font-weight:700;text-indent:0;text-align:center!important;line-height:1.35;margin:1.35em 0 .7em}.booknote-book-content .booknote-epub-part{font-size:1.7em;margin:1.6em 0 .9em}.booknote-book-content .booknote-epub-chapter{font-size:1.5em;margin:1.5em 0 .8em}.booknote-book-content .booknote-epub-heading{font-size:1.3em;margin:1.25em 0 .65em}.booknote-book-content .booknote-epub-title{font-weight:700;text-indent:0;text-align:center!important;line-height:1.25;margin:1.5em 0 .8em;font-size:1.8em}.booknote-book-content .booknote-epub-subtitle{font-weight:600;text-indent:0;text-align:center!important;line-height:1.35;margin:.5em 0 1em;font-size:1.15em}.booknote-book-content .booknote-epub-epigraph,.booknote-book-content .booknote-epub-quote{margin:1em 2em;text-indent:0;text-align:left!important;line-height:1.8}.booknote-book-content .booknote-epub-verse{margin:1em 2em;text-indent:0;text-align:left!important;white-space:pre-wrap;line-height:1.8}.booknote-book-content .booknote-epub-caption{margin:.6em 0;text-indent:0;text-align:center!important;line-height:1.5;font-size:.92em}.booknote-book-content h1,.booknote-book-content h2,.booknote-book-content h3,.booknote-book-content h4,.booknote-book-content h5,.booknote-book-content h6{line-height:1.35;text-indent:0;font-weight:700;margin-top:1.35em;margin-bottom:.7em;color:var(--reader-text)!important;opacity:1!important;-webkit-text-fill-color:currentColor!important;text-shadow:none!important;filter:none!important}.booknote-book-content h1 *,.booknote-book-content h2 *,.booknote-book-content h3 *,.booknote-book-content h4 *,.booknote-book-content h5 *,.booknote-book-content h6 *{color:inherit!important;-webkit-text-fill-color:currentColor!important;opacity:1!important;text-shadow:none!important;filter:none!important}.txt-nav-prefix{display:none!important}.booknote-book-content h1{font-size:1.34em;text-align:center;font-weight:600;line-height:1.45;margin:1.55em 0 .9em}.booknote-book-content h2{font-size:1.10em;text-align:left;font-weight:600;line-height:1.55;margin:1.15em 0 .55em}.booknote-book-content h3{font-size:1.02em;text-align:left;font-weight:600;line-height:1.55;margin:1em 0 .45em}.booknote-book-content h4{font-size:1em;text-align:left;font-weight:600;line-height:1.55;margin:.9em 0 .4em}.booknote-book-content h5,.booknote-book-content h6{font-size:1em;text-align:left;font-weight:600;line-height:1.55;margin:.8em 0 .35em}.reader-format-txt .booknote-book-content h1,.reader-format-txt .booknote-book-content h2,.reader-format-txt .booknote-book-content h3,.reader-format-txt .booknote-book-content h4,.reader-format-txt .booknote-book-content h5,.reader-format-txt .booknote-book-content h6{font-size:1em!important;text-align:left!important;font-weight:700!important;line-height:1.35!important;margin:0!important}.reader-format-txt .booknote-book-content .booknote-document-title,.reader-format-office .booknote-book-content .booknote-document-title{font-size:1.35em!important;text-align:center!important;font-weight:600!important;line-height:1.45!important;margin:1.2em 0 .8em!important}.booknote-book-content .txt-semantic-label{font-weight:600;text-indent:0}.booknote-book-content .txt-semantic-label{display:inline}.booknote-book-content p{orphans:3;widows:3}.booknote-book-content ul,.booknote-book-content ol{margin:1em 0;padding-left:2em}.booknote-book-content li{margin:.35em 0}.booknote-book-content blockquote{margin:1em 0;padding-left:1em;border-left:3px solid var(--reader-border);text-indent:0}.booknote-book-content pre{white-space:pre-wrap;overflow:auto;text-indent:0}.booknote-book-content table{max-width:100%;overflow:auto;border-collapse:collapse}.booknote-book-content img{display:block;max-width:100%;height:auto;margin:1.2em auto}.booknote-book-content a{color:var(--reader-accent)}body[data-mode="night"] .booknote-book-content,body[data-mode="night"] .booknote-book-content *{color:var(--reader-text)!important;-webkit-text-fill-color:currentColor!important;text-shadow:none!important;filter:none!important;opacity:1!important}body[data-mode="night"] .booknote-book-content a{color:var(--reader-accent)!important}body[data-mode="night"] .booknote-book-content mark.reader-highlight{color:inherit!important}`;
    /* v7.14.53 Office body presentation gate: imported ODT/DOCX inline
       alignment must not override the Reader semantic layout. Only the single
       document title is centered; structural headings and body paragraphs are
       left-aligned. This is presentation-only and does not alter source text,
       chapters, Search, or Locator data. */
    if(/(?:reader-format-office)/.test(frameFormatClass)){
      style += `.reader-format-office .booknote-book-content p,
.reader-format-office .booknote-book-content .booknote-normal-block,
.reader-format-office .booknote-book-content .txt-reply-inline{
  text-align:left !important;
}
.reader-format-office .booknote-book-content h1,
.reader-format-office .booknote-book-content h2,
.reader-format-office .booknote-book-content h3,
.reader-format-office .booknote-book-content h4,
.reader-format-office .booknote-book-content h5,
.reader-format-office .booknote-book-content h6{
  text-align:left !important;
}
.reader-format-office .booknote-book-content .booknote-document-title{
  text-align:center !important;
}
.reader-format-office .booknote-book-content h1,
.reader-format-office .booknote-book-content h2,
.reader-format-office .booknote-book-content h3,
.reader-format-office .booknote-book-content h4,
.reader-format-office .booknote-book-content h5,
.reader-format-office .booknote-book-content h6{
  break-after:avoid-page;
  page-break-after:avoid;
}
`;
    }
    /* v7.17.13 TXT paragraph contract: a blank source line is the paragraph boundary.
       Consecutive non-empty source lines are one visual paragraph and may reflow.
       The source-line spans remain inline so they never become artificial visual blocks.
       Office rules below intentionally remain unchanged. */
    style += `.reader-format-txt .booknote-book-content h1[data-txt-nav-level="1"]{
  display:block !important;
  margin:1.25em 0 .65em !important;
  padding:0 !important;
  text-align:left !important;
  text-indent:0 !important;
  line-height:1.4 !important;
}
.reader-format-txt .booknote-book-content .txt-numbered-label{
  display:block !important;
  margin:0 0 .75em !important;
  padding:0 !important;
  text-align:left !important;
  text-indent:0 !important;
  font-size:1em !important;
  font-weight:600 !important;
  line-height:1.45 !important;
}
.reader-format-txt .booknote-book-content .txt-numbered-heading[data-txt-heading-level="2"]{
  font-size:1.18em !important;
  font-weight:700 !important;
  line-height:1.45 !important;
  margin:1.15em 0 .5em !important;
}
.reader-format-txt .booknote-book-content .txt-numbered-heading[data-txt-heading-level="3"]{
  font-size:1.05em !important;
  font-weight:700 !important;
  line-height:1.45 !important;
  margin:.95em 0 .45em !important;
}
.reader-format-txt .booknote-book-content .txt-numbered-heading[data-txt-heading-level="4"],
.reader-format-txt .booknote-book-content .txt-numbered-heading[data-txt-heading-level="5"],
.reader-format-txt .booknote-book-content .txt-numbered-heading[data-txt-heading-level="6"]{
  font-size:1em !important;
  font-weight:700 !important;
  line-height:1.45 !important;
  margin:.8em 0 .35em !important;
}
.reader-format-txt .booknote-book-content p.txt-paragraph{
  display:block !important;
  margin:0 0 1em !important;
  padding:0 !important;
  text-align:left !important;
  text-indent:2em !important;
  line-height:1.9 !important;
  white-space:normal !important;
  overflow-wrap:anywhere !important;
  word-break:normal !important;
}
.reader-format-txt .booknote-book-content p.txt-paragraph.txt-paragraph-source-indented{
  text-indent:0 !important;
}
.reader-format-txt .booknote-book-content p.txt-paragraph .txt-source-line{
  display:inline !important;
  white-space:normal !important;
}
.reader-format-txt .booknote-book-content .txt-blank{display:none !important;}
.reader-format-txt .booknote-book-content h1,
.reader-format-txt .booknote-book-content h2,
.reader-format-txt .booknote-book-content h3,
.reader-format-txt .booknote-book-content h4,
.reader-format-txt .booknote-book-content h5,
.reader-format-txt .booknote-book-content h6{
  display:block !important;
  padding:0 !important;
  text-align:left !important;
  text-indent:0 !important;
  font-weight:700 !important;
  line-height:1.45 !important;
}
.reader-format-txt .booknote-book-content h1{font-size:1.35em !important;margin:1.35em 0 .65em !important;}
.reader-format-txt .booknote-book-content h2{font-size:1.18em !important;margin:1.15em 0 .5em !important;}
.reader-format-txt .booknote-book-content h3,
.reader-format-txt .booknote-book-content h4,
.reader-format-txt .booknote-book-content h5,
.reader-format-txt .booknote-book-content h6{font-size:1.05em !important;margin:.95em 0 .45em !important;}
.reader-format-txt .booknote-book-content .txt-heading-inline-content{
  margin:.15em 0 1em !important;
  text-indent:0 !important;
}
.reader-format-office .booknote-book-content p,
.reader-format-office .booknote-book-content .booknote-normal-block{
  display:block !important;
  margin:0 !important;
  padding:0 !important;
  text-align:left !important;
  text-indent:2em !important;
  line-height:1.9 !important;
}
.reader-format-office .booknote-book-content .txt-blank,
.reader-format-office .booknote-book-content p:empty,
.reader-format-office .booknote-book-content div:empty{
  display:none !important;
}
.reader-format-office .booknote-book-content h1,
.reader-format-office .booknote-book-content h2,
.reader-format-office .booknote-book-content h3,
.reader-format-office .booknote-book-content h4,
.reader-format-office .booknote-book-content h5,
.reader-format-office .booknote-book-content h6{
  display:block !important;
  margin:0 !important;
  padding:0 !important;
  text-align:left !important;
  text-indent:0 !important;
  line-height:1.35 !important;
}
`;
    var highlightCss=`
:root{
  --reader-hl-yellow-bg:#FFE58A;--reader-hl-yellow-fg:#20252B;
  --reader-hl-red-bg:#F6B4B4;--reader-hl-red-fg:#2B1717;
  --reader-hl-pink-bg:#F5C2DA;--reader-hl-pink-fg:#351421;
  --reader-hl-green-bg:#BFE3C5;--reader-hl-green-fg:#132318;
  --reader-hl-blue-bg:#B9DCF0;--reader-hl-blue-fg:#10212A;
  --reader-hl-purple-bg:#D7BEEB;--reader-hl-purple-fg:#24162D;
  --reader-search-bg:color-mix(in srgb,var(--reader-accent) 30%,var(--reader-surface));--reader-search-fg:var(--reader-text);--reader-search-border:var(--reader-accent);
}
body[data-mode="night"]{
  --reader-hl-yellow-bg:#8F7A22;--reader-hl-yellow-fg:#FFF8D7;
  --reader-hl-red-bg:#7A4247;--reader-hl-red-fg:#FFF0F0;
  --reader-hl-pink-bg:#7A465F;--reader-hl-pink-fg:#FFF0F7;
  --reader-hl-green-bg:#45664D;--reader-hl-green-fg:#F0FFF3;
  --reader-hl-blue-bg:#405E70;--reader-hl-blue-fg:#F0FAFF;
  --reader-hl-purple-bg:#5B476C;--reader-hl-purple-fg:#F8F0FF;
  --reader-search-bg:color-mix(in srgb,var(--reader-accent) 42%,var(--reader-surface));--reader-search-fg:var(--reader-text);--reader-search-border:var(--reader-accent);
}
mark.reader-highlight{border-radius:3px;padding:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone;font-weight:inherit;text-shadow:none!important;-webkit-text-fill-color:currentColor!important}
mark.reader-highlight[data-color="yellow"]{background:var(--reader-hl-yellow-bg)!important;color:var(--reader-hl-yellow-fg)!important}
mark.reader-highlight[data-color="red"]{background:var(--reader-hl-red-bg)!important;color:var(--reader-hl-red-fg)!important}
mark.reader-highlight[data-color="pink"]{background:var(--reader-hl-pink-bg)!important;color:var(--reader-hl-pink-fg)!important}
mark.reader-highlight[data-color="green"]{background:var(--reader-hl-green-bg)!important;color:var(--reader-hl-green-fg)!important}
mark.reader-highlight[data-color="blue"]{background:var(--reader-hl-blue-bg)!important;color:var(--reader-hl-blue-fg)!important}
mark.reader-highlight[data-color="purple"]{background:var(--reader-hl-purple-bg)!important;color:var(--reader-hl-purple-fg)!important}
mark.reader-search-hit{background:var(--reader-search-bg)!important;color:var(--reader-search-fg)!important;-webkit-text-fill-color:var(--reader-search-fg)!important;border-radius:3px;padding:0 2px;box-decoration-break:clone;-webkit-box-decoration-break:clone;font-weight:700;text-shadow:none!important}
mark.reader-search-hit.active{outline:2px solid var(--reader-search-border)!important;outline-offset:1px;box-shadow:0 0 0 2px color-mix(in srgb,var(--reader-search-border) 24%,transparent)!important}
mark.reader-search-hit mark.reader-highlight,mark.reader-highlight mark.reader-search-hit{background:var(--reader-search-bg)!important;color:var(--reader-search-fg)!important;-webkit-text-fill-color:var(--reader-search-fg)!important}
html:focus-within{scroll-behavior:auto}`;style+=highlightCss;
    var frameFormat=String(this.book&&this.book.meta&&this.book.meta.documentFormat||this.book&&this.book.meta&&this.book.meta.documentFileName||'').toLowerCase();
    var renderedHtml=String(s.html||'');
    /* Presentation-only title promotion: frozen source structure is untouched. */
    if(/^(?:txt|text\/plain|odt|application\/vnd\.oasis\.opendocument\.text|docx|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(frameFormat)||/\.(?:txt|odt|docx)$/i.test(frameFormat)){
      try{
        var titleSource=String(this.book&&this.book.meta&&(this.book.meta.documentTitle||this.book.meta.name||this.book.meta.documentFileName)||'');
        var normTitle=function(v){return String(v||'').replace(/\.[^.]+$/,'').replace(/[（(]\d+[）)]/g,'').replace(/[“”‘’「」『』]/g,'').replace(/\s+/g,'').trim().toLowerCase();};
        titleSource=normTitle(titleSource);
        if(titleSource){
          var td=new DOMParser().parseFromString('<div id="__bn_title_probe">'+renderedHtml+'</div>','text/html'),tr=td.getElementById('__bn_title_probe');
          if(tr){var first=null,kids=Array.prototype.slice.call(tr.children);for(var ki=0;ki<kids.length;ki++){var cand=kids[ki];if(/^P$/.test(cand.tagName)&&!String(cand.textContent||'').trim())continue;if(/^H[1-6]$/.test(cand.tagName)){first=cand;}break;}if(first&&!first.classList.contains('booknote-document-title')&&/^H[1-6]$/.test(first.tagName)&&normTitle(first.textContent||'')===titleSource){first.classList.add('booknote-document-title');first.setAttribute('data-document-title','1');renderedHtml=tr.innerHTML;}}
        }
      }catch(_){}
    }
    var frameFormatClass=(frameFormat==='txt'||frameFormat==='text/plain'||/\.txt$/i.test(frameFormat))?' reader-format-txt':((frameFormat==='odt'||frameFormat==='application/vnd.oasis.opendocument.text'||/\.odt$/i.test(frameFormat))?' reader-format-office reader-format-odt':((frameFormat==='docx'||frameFormat==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'||/\.docx$/i.test(frameFormat))?' reader-format-office reader-format-docx':((frameFormat==='epub'||frameFormat==='application/epub+zip'||/\.epub$/i.test(frameFormat))?' reader-format-epub':((frameFormat==='html'||frameFormat==='text/html'||/\.html?$/i.test(frameFormat))?' reader-format-html':((frameFormat==='md'||frameFormat==='markdown'||frameFormat==='text/markdown'||/\.md$/i.test(frameFormat))?' reader-format-dm':'')))));
    /* v7.18.02: HTML and DM are deliberately isolated from TXT/Office/EPUB/PDF.
       Their paragraph CSS is scoped to their own reader-format class only. */
    /* HTML paragraph rules are injected once below, after format isolation is known. */
    /* DM has no paragraph-specific CSS gate. Its change in this release is TOC
       recognition only; Markdown paragraph presentation remains untouched. */
    /* v7.14.66 EPUB Paragraph Contract: presentation-only. The EPUB semantic
       layer has already classified the DOM blocks. This gate applies the
       final visual paragraph contract without touching TextNodes, sentence
       boundaries, DOM block identity, or any locator data. */
    if(/(?:reader-format-html)/.test(frameFormatClass)){
      style += `.reader-format-html .booknote-book-content p.booknote-html-paragraph{margin:0 0 1em!important;line-height:1.9!important;white-space:normal!important;padding:0!important;text-indent:0!important;}
.reader-format-html .booknote-book-content p:not(.booknote-html-paragraph){margin:0 0 1em!important;line-height:1.9!important;white-space:normal!important;padding:0!important;text-indent:0!important;}
.reader-format-html .booknote-book-content h1,.reader-format-html .booknote-book-content h2,.reader-format-html .booknote-book-content h3,.reader-format-html .booknote-book-content h4,.reader-format-html .booknote-book-content h5,.reader-format-html .booknote-book-content h6{margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important;text-indent:0!important;}
`;
    }
    if(/(?:reader-format-dm)/.test(frameFormatClass)){
      style += `.reader-format-dm .dm-syntax{display:none!important;}
.reader-format-dm .dm-paragraph{white-space:pre-wrap!important;}
.reader-format-dm .dm-heading{white-space:pre-wrap!important;text-indent:0!important;margin:1.1em 0 .55em!important;line-height:1.45!important;font-weight:700!important;}
.reader-format-dm .dm-heading-level-1{font-size:1.34em!important;}
.reader-format-dm .dm-heading-level-2{font-size:1.15em!important;}
.reader-format-dm .dm-heading-level-3{font-size:1.06em!important;}
`;
    }
    if(/(?:reader-format-epub)/.test(frameFormatClass)){
      style += `.reader-format-epub .booknote-book-content .booknote-normal-block{
  display:block !important;
  margin-top:0 !important;
  margin-bottom:0 !important;
  margin-left:0 !important;
  margin-right:0 !important;
  padding-top:0 !important;
  padding-bottom:0 !important;
  padding-left:0 !important;
  padding-right:0 !important;
  text-align:left !important;
  text-indent:calc(2em - var(--booknote-source-indent-em, 0em)) !important;
  line-height:1.9 !important;
}
.reader-format-epub .booknote-book-content .booknote-epub-indent-2em{
  text-indent:calc(2em - var(--booknote-source-indent-em, 0em)) !important;
}
.reader-format-epub .booknote-book-content .booknote-epub-noindent,
.reader-format-epub .booknote-book-content .booknote-epub-attribution,
.reader-format-epub .booknote-book-content .booknote-epub-centered-special,
.reader-format-epub .booknote-book-content .booknote-epub-heading,
.reader-format-epub .booknote-book-content .booknote-epub-part,
.reader-format-epub .booknote-book-content .booknote-epub-chapter,
.reader-format-epub .booknote-book-content .booknote-epub-title,
.reader-format-epub .booknote-book-content .booknote-epub-subtitle{
  display:block !important;
  margin:0 !important;
  padding:0 !important;
  text-indent:0 !important;
  text-align:left !important;
  font-size:1em !important;
  font-weight:600 !important;
  line-height:1.35 !important;
}
.reader-format-epub .booknote-book-content h1,
.reader-format-epub .booknote-book-content h2,
.reader-format-epub .booknote-book-content h3,
.reader-format-epub .booknote-book-content h4,
.reader-format-epub .booknote-book-content h5,
.reader-format-epub .booknote-book-content h6{
  display:block !important;
  margin:0 !important;
  padding:0 !important;
  text-indent:0 !important;
  text-align:left !important;
  font-size:1em !important;
  font-weight:600 !important;
  line-height:1.35 !important;
}
.reader-format-epub .booknote-book-content .booknote-epub-epigraph,
.reader-format-epub .booknote-book-content .booknote-epub-quote,
.reader-format-epub .booknote-book-content .booknote-epub-verse,
.reader-format-epub .booknote-book-content .booknote-epub-caption{
  text-indent:0 !important;
}
.reader-format-epub .booknote-book-content .booknote-epub-attribution{
  text-align:right !important;
}
.reader-format-epub .booknote-book-content .booknote-epub-centered-special{
  text-align:center !important;
}
`;
    }
    frame.srcdoc='<!doctype html><html lang="'+esc(this.book.meta.documentLanguage||'zh-CN')+'"><head><meta charset="utf-8"><style>'+style+'</style></head><body class="reader-body'+frameFormatClass+'"><div id="source" class="booknote-book-content">'+renderedHtml+'</div></body></html>';
    this.content.hidden=false;this.content.classList.add('runtime-active');
    this.content.appendChild(frame);
    this.iframe=frame;
    var self=this;
    await new Promise(function(resolve){frame.onload=function(){
      try{
        if(showSeq!==self._showSeq){frame.remove();resolve();return}
        var doc=frame.contentDocument;if(!doc||!doc.body){resolve();return}
        self.applyFrameTheme();
        var fs=(Number(self._fontScale)||100)/100;doc.body.style.fontSize=(18*fs)+'px';doc.body.style.lineHeight=String(self._lineHeight||1.9);
        var width=self._readingWidth||960;doc.documentElement.style.setProperty('--booknote-reading-width',width+'px');
        doc.body.style.maxWidth=(width+160)+'px';
        doc.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(a)e.preventDefault()});
        doc.addEventListener('scroll',function(){self.updateScrollState();},{passive:true});
        self.bindMousePaging(doc);
        var fk=self.formatKind();
        if(fk==='odt')try{self.installOdtSourceAnchors(index,doc);}catch(_){ }
        else if(fk==='docx')try{self.installDocxSourceAnchors(index,doc);}catch(_){ }
        if(self.isEpubMulti()&&self.book.sections[index]&&globalThis.BookNoteEpubMultiModule){
          try{self.book.sections[index]._liveModel=BookNoteEpubMultiModule.buildSection(self.book.sections[index],doc);self.book.sections[index]._liveDoc=doc;}catch(e){console.warn('[EPUB locator] live section model build failed',e);}
        }
        self.scrollToTextOffset(self.currentOffset);
        self.dispatchEvent(new CustomEvent('frame-ready',{detail:{index:index,offset:self.currentOffset,section:s,frame:frame,document:doc}})); var __currentLocator=null;try{var __cur=self.getCurrent&&self.getCurrent();__currentLocator=__cur&&__cur.locator||null;}catch(__e){} if(!__currentLocator)__currentLocator=(globalThis.BookNoteLocator?globalThis.BookNoteLocator.reflow({chapterIndex:index,start:self.currentOffset,end:self.currentOffset,href:s.href,fragment:s.fragment}):null); self.dispatchEvent(new CustomEvent('relocate',{detail:{index:index,offset:self.currentOffset,section:s,ratio:self.getScrollState().ratio,locator:__currentLocator}}));
        requestAnimationFrame(function(){
          if(showSeq!==self._showSeq||self.iframe!==frame){resolve();return}
          frame.style.transition='opacity 120ms ease-out';
          frame.style.opacity='1';
          if(oldFrame&&oldFrame!==frame){
            oldFrame.style.transition='opacity 120ms ease-out';
            oldFrame.style.opacity='0';
            setTimeout(function(){if(oldFrame&&oldFrame.parentNode&&self.iframe===frame)oldFrame.remove();},150);
          }
        });
      }catch(e){console.error('Reader scroll render failed',e)}
      resolve();
    }});
  }
  bindMousePaging(doc){
    if(!doc||doc.__booknoteMousePaging)return;
    doc.__booknoteMousePaging=true;
    var self=this;
    doc.addEventListener('wheel',function(e){
      /* v7.12.59: section continuation is strictly scoped to the Reader
       * iframe's own vertical scroll container. It never listens on the
       * Reader shell, sidebar, toolbar, or outer document. A new section is
       * entered only when the current section was already at its edge before
       * the continued wheel gesture. This preserves ordinary scrolling and
       * prevents a single large wheel delta from unexpectedly skipping a
       * section. */
      var root=doc.scrollingElement||doc.documentElement;
      var max=Math.max(0,(root&&root.scrollHeight||0)-(root&&root.clientHeight||0));
      var top=Number(root&&root.scrollTop)||0;
      var delta=Number(e&&e.deltaY)||0;
      var edgeEps=2;
      var atTop=top<=edgeEps;
      var atBottom=top>=Math.max(0,max-edgeEps);
      var transitioning=false;
      if(delta>0&&atBottom&&self.currentIndex<((self.book&&self.book.sections&&self.book.sections.length)||1)-1){
        transitioning=true;
        self.continueScrollToSection(1);
      }else if(delta<0&&atTop&&self.currentIndex>0){
        transitioning=true;
        self.continueScrollToSection(-1);
      }
      if(!transitioning){
        requestAnimationFrame(function(){self.updateScrollState()});
      }
    },{passive:true});
  }
  async continueScrollToSection(direction){
    if(this._scrollSectionTransition)return;
    var sections=this.book&&this.book.sections||[];
    if(!sections.length)return;
    var dir=Number(direction)>=0?1:-1;
    var next=this.currentIndex+dir;
    if(next<0||next>=sections.length)return;
    this._scrollSectionTransition=true;
    try{
      /* Downward continuation enters the next section at its beginning.
       * Upward continuation enters the previous section at its end so the
       * gesture remains continuous in both directions. */
      var targetOffset=dir>0?0:String(sections[next].text||'').length;
      await this.show(next,targetOffset);
    }catch(e){
      console.warn('[Reader scroll] section continuation failed',e);
    }finally{
      var self=this;
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){self._scrollSectionTransition=false;});
      });
    }
  }
  scrollToTextOffset(offset){
    var doc=this.iframe&&this.iframe.contentDocument;if(!doc||!doc.body)return;
    var target=Math.max(0,Number(offset)||0),walker=doc.createTreeWalker(doc.getElementById('source')||doc.body,NodeFilter.SHOW_TEXT),n,total=0;
    while((n=walker.nextNode())){var len=(n.nodeValue||'').length;if(target<=total+len){try{var r=doc.createRange();r.setStart(n,Math.max(0,target-total));r.collapse(true);var rect=r.getBoundingClientRect();doc.documentElement.scrollTop=Math.max(0,doc.documentElement.scrollTop+rect.top-90)}catch(_){}break}total+=len}
    this.updateScrollState();
  }
  updateScrollState(){
    var doc=this.iframe&&this.iframe.contentDocument;if(!doc||!doc.documentElement)return;
    var root=doc.scrollingElement||doc.documentElement,max=Math.max(1,root.scrollHeight-root.clientHeight),ratio=Math.max(0,Math.min(1,root.scrollTop/max));
    this.currentOffset=this.offsetAtScrollTop(root.scrollTop);this.currentRatio=ratio;
    this.dispatchEvent(new CustomEvent('scrollstate',{detail:{ratio:ratio,offset:this.currentOffset,index:this.currentIndex}}));
  }
  offsetAtScrollTop(scrollTop){var doc=this.iframe&&this.iframe.contentDocument;if(!doc)return this.currentOffset||0;var source=doc.getElementById('source')||doc.body,walker=doc.createTreeWalker(source,NodeFilter.SHOW_TEXT),n,total=0;while((n=walker.nextNode())){var len=(n.nodeValue||'').length;if(len){var r=doc.createRange();r.selectNodeContents(n);var rect=r.getBoundingClientRect();var top=rect.top+(doc.scrollingElement||doc.documentElement).scrollTop;if(top+rect.height>=scrollTop+90){var local=total+Math.max(0,Math.min(len,Math.round((scrollTop+90-top)/Math.max(1,rect.height)*len)));var info=this.positionNodes(doc),p=this.domPointAt(info,local),fake=p?doc.createRange():null;if(fake){fake.setStart(p.node,p.offset);fake.collapse(true);var mapped=this.domRangeToCanonical(this.currentIndex,fake);if(mapped)return mapped.start;}return this.currentOffset||0;} }total+=len;}return this.canonicalSection(this.currentIndex).text.length||0;}
  getScrollState(){var doc=this.iframe&&this.iframe.contentDocument;if(!doc||!doc.documentElement)return {ratio:0,offset:this.currentOffset||0};var root=doc.scrollingElement||doc.documentElement,max=Math.max(1,root.scrollHeight-root.clientHeight);return {ratio:Math.max(0,Math.min(1,root.scrollTop/max)),offset:this.currentOffset||0};}
  setScrollRatio(ratio){var doc=this.iframe&&this.iframe.contentDocument;if(!doc)return;var root=doc.scrollingElement||doc.documentElement,r=Math.max(0,Math.min(1,Number(ratio)||0));root.scrollTop=r*Math.max(0,root.scrollHeight-root.clientHeight);this.updateScrollState();}
  scrollToEdge(edge){var doc=this.iframe&&this.iframe.contentDocument;if(!doc)return;var root=doc.scrollingElement||doc.documentElement,target=String(edge)==='bottom'?Math.max(0,root.scrollHeight-root.clientHeight):0;root.scrollTo({top:target,behavior:'smooth'});requestAnimationFrame(()=>this.updateScrollState());}
  async scrollByPage(dir){
    var doc=this.iframe&&this.iframe.contentDocument;if(!doc)return;
    var root=doc.scrollingElement||doc.documentElement;if(!root)return;
    var d=Number(dir)>=0?1:-1,top=Number(root.scrollTop)||0,client=Number(root.clientHeight)||0,scrollHeight=Number(root.scrollHeight)||0,max=Math.max(0,scrollHeight-client),eps=3;
    /* v7.14.53: page navigation is bounded by the actual Office section.
       If the section has no further scrollable content, continue to the next
       canonical Part section instead of presenting an empty Reader page. */
    if(d>0 && top>=Math.max(0,max-eps)){
      await this.continueScrollToSection(1);
      return;
    }
    if(d<0 && top<=eps){
      await this.continueScrollToSection(-1);
      return;
    }
    /* v7.14.54 Office/TXT page navigation: use the actual scrollable
       range and re-check after the smooth scroll. This avoids landing in an
       apparent blank viewport when an imported Office section contains large
       inline/block spacing. It does not change section boundaries, source
       offsets, Search, or Locator data. */
    var amount=Math.max(240,Math.floor(client*0.86));
    var target=Math.max(0,Math.min(max,top+d*amount));
    root.scrollTo({top:target,behavior:'smooth'});
    setTimeout(()=>{
      try{
        var nowRoot=doc.scrollingElement||doc.documentElement;
        var nowTop=Number(nowRoot&&nowRoot.scrollTop)||0;
        var nowMax=Math.max(0,(nowRoot&&nowRoot.scrollHeight||0)-(nowRoot&&nowRoot.clientHeight||0));
        if(d>0 && nowTop<target-8 && nowMax>nowTop){nowRoot.scrollTop=Math.min(nowMax,target);}
        else if(d<0 && nowTop>target+8){nowRoot.scrollTop=Math.max(0,target);}
      }catch(_){}
      this.updateScrollState();
    },180);
  }
  prevPage(){this.scrollByPage(-1)}
  nextPage(){this.scrollByPage(1)}
  turnPage(dir){this.scrollByPage(dir);return Promise.resolve()}
  setDisplayMode(){this.displayMode='scroll';this.currentRatio=this.currentRatio||0;}
  setTheme(theme){var t=typeof theme==='string'?{name:'everforest',mode:theme==='dark'?'night':'day'}:(theme||{});this.themeName=t.name||'everforest';this.themeMode=t.mode==='night'?'night':'day';this.applyFrameTheme()}
  applyFrameTheme(){if(!this.iframe)return;try{var doc=this.iframe.contentDocument;if(!doc||!doc.body)return;doc.body.dataset.mode=this.themeMode||"day";var a=this.themeMap()[(this.themeMode||'day')+'-'+(this.themeName||'everforest')]||this.themeMap()['day-everforest'];doc.documentElement.style.setProperty('--reader-bg',a[0]);doc.documentElement.style.setProperty('--reader-surface',a[1]);doc.documentElement.style.setProperty('--reader-text',a[3]);doc.documentElement.style.setProperty('--reader-muted',a[4]);doc.documentElement.style.setProperty('--reader-border',a[5]);doc.documentElement.style.setProperty('--reader-accent',a[6]);doc.documentElement.style.colorScheme=this.themeMode==='night'?'dark':'light';doc.body.classList.toggle('theme-dark',this.themeMode==='night');doc.body.dataset.theme=this.themeName;doc.body.dataset.mode=this.themeMode}catch(_){} }
  jumpGlobal(position,quote){var p=Math.max(0,Number(position)||0),secs=this.canonicalSections.length?this.canonicalSections:this.book.sections,idx=secs.length-1;for(var i=0;i<secs.length;i++){if(p>=Number(secs[i].textStart||0)&&p<=Number(secs[i].textEnd!=null?secs[i].textEnd:secs[i].textStart+String(secs[i].text||'').length)){idx=i;break}}return this.show(idx,p-Number(secs[idx].textStart||0),quote)}
  resolveLocator(locator,options){var L=globalThis.BookNoteLocator;if(!L||!locator)return null;var a=L.resolve(locator,this.canonicalSections.length?this.canonicalSections:(this.book&&this.book.sections)||[]);if(!a)return null;var o=options||{};return {locator:locator,chapterIndex:a.chapterIndex,start:a.offset,end:a.end-a.start,absoluteStart:a.start,absoluteEnd:a.end,quote:(locator.textQuote&&locator.textQuote.exact)||'',strict:!!o.strict};}
  async showLocator(locator,options){var r=this.resolveLocator(locator,options);if(!r)return false;await this.show(r.chapterIndex,r.start,r.quote);return r;}
  getCurrent(){
    var sec=this.book&&this.book.sections[this.currentIndex];
    if(this.isEpubMulti&&this.isEpubMulti()&&this.iframe&&this.iframe.contentDocument&&globalThis.BookNoteEpubUnifiedLocator){
      try{
        var doc=this.iframe.contentDocument,root=doc.scrollingElement||doc.documentElement;
        var y=Math.max(8,Math.min((root&&root.clientHeight||doc.documentElement.clientHeight||800)-24,(root&&root.scrollTop||0)+32));
        var x=Math.max(8,Math.min((root&&root.clientWidth||doc.documentElement.clientWidth||800)/2,Math.max(8,(root&&root.clientWidth||800)-8)));
        var r=null;
        if(doc.caretRangeFromPoint)r=doc.caretRangeFromPoint(x,y);
        else if(doc.caretPositionFromPoint){var cp=doc.caretPositionFromPoint(x,y);if(cp){r=doc.createRange();r.setStart(cp.offsetNode,cp.offset);r.collapse(true);}}
        if(r&&r.startContainer&&doc.body.contains(r.startContainer)){
          var a=globalThis.BookNoteEpubUnifiedLocator.anchorFromCaret?globalThis.BookNoteEpubUnifiedLocator.anchorFromCaret(doc,sec,r):null;
          if(a){
            a.type='epub';a.format='epub';
            return {index:this.currentIndex,offset:Number(a.start)||0,section:sec,locator:a};
          }
        }
      }catch(e){/* fall through to the generic locator */}
    }
    var loc=globalThis.BookNoteLocator&&globalThis.BookNoteLocator.reflow({chapterIndex:this.currentIndex,start:this.currentOffset,end:this.currentOffset,documentStart:Number(sec&&sec.textStart||0)+Number(this.currentOffset||0),documentEnd:Number(sec&&sec.textStart||0)+Number(this.currentOffset||0),href:sec&&sec.href,fragment:sec&&sec.fragment});
    return {index:this.currentIndex,offset:this.currentOffset,section:sec,locator:loc}
  }
  close(){this._showSeq++;if(this.content)this.content.querySelectorAll('.readest-frame').forEach(function(f){f.remove()});if(this.book&&typeof this.book.releaseAssets==='function')this.book.releaseAssets();this.iframe=null;this.book=null;if(this.content)this.content.classList.remove('runtime-active')}
}

globalThis.BookNoteReadestRuntime={ReadestRuntime:ReadestRuntime,ReadestBook:ReadestBook};
})();
