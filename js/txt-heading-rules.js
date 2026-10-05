/* BookNote TXT Heading Rules v3.7
 * Rule: prove it is a structural heading; otherwise keep it as body text.
 * Raw TXT remains authoritative. This module only produces navigation metadata.
 */
(function(root){
  'use strict';
  var EXPLICIT=/^\[NAV-(\d+)\]\s*(.+)$/i;
  var CHAPTER=/^第\s*(\d+|[一二三四五六七八九十百千万零〇两]+)\s*(章|节|篇|部|卷|回|集|册|辑|单元|课|讲|幕|场|款)\s*(.*)$/i;
  var BARE_HUI=/^回\s*[^。！？；：:]{4,100}$/i;
  var VOLUME=/^卷\s*(\d+|[一二三四五六七八九十百千万零〇两]+)(?:\s*[:：.、\-]\s*.*)?$/;
  var EN_CHAPTER=/^Chapter\s+\d+(?:\s*[:.\-、]\s*.*)?$/i;
  var EN_PART=/^Part\s+(?:\d+|[IVXLCDM]+)(?:\s*[:.\-、]\s*.*)?$/i;
  var TITLE_DATE_SUFFIX=/^.{1,80}\s+\d{4}年\d{1,2}月\d{1,2}日$/;
  var QUESTION_LINE=/^问题\s*(?:\d+|[一二三四五六七八九十百千万零〇两]+)(?:\s*[:：.、\-]\s*.*)?$/;
  var REPLY_LINE=/^(?:回复|答复|回答|答案)\s*[:：]/i;
  var INLINE_SEMANTIC=/^(?:明显|重点|注意|问题|说明|结论|原因|目的|方法|结果|分析|总结|定义|概念|背景|步骤|提示|警告|示例|案例|补充|备注)\s*[:：]\s*.+$/i;
  var SINGLE_NUMBER=/^\d+[\.、]\s*.+$/;
  var CHINESE_NUMBER=/^[一二三四五六七八九十百千万零〇两]+、\s*[^。！？；：:，,、]+$/;
  var PAREN_NUMBER=/^(?:（[一二三四五六七八九十百千万零〇两]+）|\([一二三四五六七八九十百千万零〇两]+\))\s*[^。！？；：:，,、]+$/;
  var QUOTED=/^(?:《[^》]{1,80}》|【[^】]{1,80}】)$/;
  /* Standalone book-title quotation lines are source content, not TOC headings.
   * This includes 《……》 and ——《……》 (with optional trailing punctuation). */
  var QUOTED_TITLE_LINE=/^(?:[-—–]{1,4}\s*)?《[^》]{1,80}》[\s，,、。！？!?；;：:]*$/;
  var KNOWN_STANDALONE=/^(?:序章|序言|序幕|楔子|引子|前言|后记|跋|尾声|终章|结语|附录|附言|编者按|导言|前章|卷首|卷末)$/;
  var COMMON_SEMANTIC=/^(?:总结|结论|摘要|概述|方法|结果|讨论|案例|参考文献|主要技術領域|核心層級與包含關係|主要领域|核心层级|包含关系|技术领域|应用领域|发展趋势|基本原理|核心技术|应用场景|背景|目的|范围|架构|设计|方案|流程|步骤|特点|特征|功能|能力|风险|建议|附录|序言|前言|后记|明显|重点|注意|问题|答复|回复|回答|答案|说明|原因|定义|概念|提示|警告|示例|补充|备注)$/i;
  var SEMANTIC_LABEL=/^(?:明显|重点|注意|问题|说明|结论|原因|目的|方法|结果|分析|总结|定义|概念|背景|步骤|提示|警告|示例|案例|补充|备注)\s*[:：]\s*$/i;
  var FIELD=/^(?:书名|作者|副标题|ISBN|语言|分类|标签|标签\/分类|出版信息|日期|版本|封面|说明|作者介绍|参考资料|文件名|文件格式|文件大小|编码|出版社|出版日期)\s*[:：]/;
  var STANDALONE_METADATA=/^(?:元数据|书籍元数据|Metadata|Front Matter|Back Matter|插图目录|表格目录|索引|术语表)$/i;
  function s(v){return String(v==null?'':v);}
  function indentOf(raw){var m=s(raw).match(/^[ \t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]*/);return m?m[0].replace(/\t/g,'    ').length:0;}
  function nonblank(lines,i,step){for(var j=i+step;j>=0&&j<lines.length;j+=step)if(s(lines[j]).trim())return {index:j,raw:s(lines[j]),text:s(lines[j]).trim()};return null;}
  function isDateOnly(t){return /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/.test(t);}
  function isCopyright(t){return /^(?:©|\(c\)|copyright\b)/i.test(t);}
  function hasSentencePunctuation(t){return /[。！？；：:，,、]$/.test(t);}
  /* TOPIC_HEADING: an unnumbered, top-aligned nominal/topic phrase that
   * introduces a substantial following passage. This is semantic evidence,
   * not a short-line heuristic: length alone never promotes a line. */
  var TOPIC_NOMINAL=/^(?:主要|核心|关键|基本|真正|关于|对于|在人心中|围绕|面向|阅读|理解|结局|问题|内容|结构|关系|意义|影响|方向|领域|层级|原理|方法|作用|特征|背景|目标|过程|结果|选择|变化|发展|技术|应用|主题|人物|故事|命运|思想|时间|空间|语言|情感|价值|原因|目的|条件|特点|能力|风险|方案|设计|架构|功能|分类|范围|章节|正文|前言|结语|总结|结论|说明|分析|讨论|案例|实践|经验|认识|领会|分量|所在|关键点|核心问题)/;
  /* CONTEXT_TOPIC_HEADING (TXT Contract):
   * A top-aligned standalone line of <=30 characters is a TOC topic heading
   * when the immediately surrounding nonblank blocks prove a heading/body
   * boundary: the previous block is indented prose AND the next block is
   * indented prose. Punctuation on the topic line is allowed. This is the
   * explicit TXT rule for cases such as:
   *   [indented body]
   *   在人心中结局的分量
   *   [indented body]
   * The rule is contextual, not a generic short-line heuristic. Metadata,
   * dates, fields, decimal labels, questions/replies and separators remain
   * excluded. Raw source text is never changed.
   */
  function looksLikeContextTopicHeading(lines,i,t,prev,next){
    var raw=s(lines[i]),text=s(t).trim();
    if(indentOf(raw)!==0)return false;
    if(text.length<2||text.length>30)return false;
    if(/^[-_=*~·•]{3,}$/.test(text))return false;
    if(FIELD.test(text)||isDateOnly(text)||isCopyright(text)||STANDALONE_METADATA.test(text)||QUOTED_TITLE_LINE.test(text))return false;
    if(QUESTION_LINE.test(text)||REPLY_LINE.test(text)||INLINE_SEMANTIC.test(text))return false;
    if(/^\d+(?:\.\d+)+(?:\s+.*)?$/.test(text))return false;
    if(!prev||!next)return false;
    var prevRaw=s(prev.raw),nextRaw=s(next.raw);
    if(indentOf(prevRaw)<=0||indentOf(nextRaw)<=0)return false;
    var prevText=prev.text,nextText=next.text;
    if(prevText.length<12||nextText.length<12)return false;
    if(isFieldLike(prevText)||isFieldLike(nextText)||isDateOnly(prevText)||isDateOnly(nextText)||isCopyright(prevText)||isCopyright(nextText))return false;
    return true;
  }

  function looksLikeTopicHeading(lines,i,t,prev,next){
    if(looksLikeContextTopicHeading(lines,i,t,prev,next))return true;
    var raw=s(lines[i]),text=s(t).trim();
    if(indentOf(raw)!==0)return false;
    if(text.length<4||text.length>60)return false;
    if(hasSentencePunctuation(text))return false;
    if(isFieldLike(text)||isDateOnly(text)||isCopyright(text)||STANDALONE_METADATA.test(text)||QUOTED_TITLE_LINE.test(text))return false;
    if(QUESTION_LINE.test(text)||REPLY_LINE.test(text)||INLINE_SEMANTIC.test(text))return false;
    var nextText=next&&next.text||'';
    if(!next||nextText.length<12||isFieldLike(nextText)||isDateOnly(nextText)||isCopyright(nextText))return false;
    var prevText=prev&&prev.text||'';
    var separated=!prev||i-prev.index>1;
    var nominal=TOPIC_NOMINAL.test(text)||/(?:分量|关系|领域|方向|层级|原理|作用|影响|意义|目标|背景|结构|内容|过程|结果|特点|特征|能力|风险|方案|设计|架构|功能|价值|原因|目的|条件|变化|发展|趋势|方法|问题|认识|领会|主题|故事|命运|思想|情感|理解)$/.test(text);
    var bodyBoundary=separated||hasSentencePunctuation(prevText);
    return nominal&&bodyBoundary;
  }
  function isFieldLike(t){var x=s(t);if(FIELD.test(x))return true;var m=x.match(/^([^\s:：]{1,16})\s*[:：]\s*(.+)$/);if(!m)return false;var label=m[1],value=m[2];if(/[，,。！？；;“”"‘’]/.test(label))return false;if(value.length>80)return false;if(/^[\u3000-\u303f\uff00-\uffef]/.test(value))return false;return true;}
  function fieldRunAfter(lines,i){var count=0,j=i+1,seen=0;for(;j<lines.length&&seen<8;j++,seen++){var t=s(lines[j]).trim();if(!t)continue;if(isFieldLike(t))count++;else if(count>=1)break;}return count;}
  function looksLikeMetadataBlock(lines,i){var t=s(lines[i]).trim();if(STANDALONE_METADATA.test(t))return fieldRunAfter(lines,i)>=1;return fieldRunAfter(lines,i)>=2;}
  function hasProseAfter(lines,i){var n=nonblank(lines,i,1);if(!n)return false;var text=n.text;return text.length>=12&&!isFieldLike(text)&&!isDateOnly(text)&&!isCopyright(text);}
  function isIndentedProseAfter(lines,i){var cur=indentOf(lines[i]),n=nonblank(lines,i,1);if(!n)return false;return indentOf(n.raw)>cur&&n.text.length>=12&&!isFieldLike(n.text);}
  function familyCount(lines,i){var count=0;for(var j=Math.max(0,i-80);j<Math.min(lines.length,i+81);j++){if(j===i)continue;var t=s(lines[j]).trim();if(!t||t.length>60||hasSentencePunctuation(t)||isFieldLike(t)||isDateOnly(t)||isCopyright(t))continue;var n=nonblank(lines,j,1);if(!n)continue;if(isIndentedProseAfter(lines,j)||n.text.length>=40)count++;}return count;}
  function nxtLong(lines,i){var n=nonblank(lines,i,1);return !!(n&&n.text.length>=80&&!isFieldLike(n.text)&&!isDateOnly(n.text)&&!isCopyright(n.text));}
  function analyze(text,opts){
    opts=opts||{};var source=s(text).replace(/\r\n?|\r/g,'\n'),lines=source.split('\n'),title=s(opts.title).trim(),heads=[];
    var metadataSection=false,currentSectionNumber='';
    var METADATA_SECTION_HEADING=/^(?:第\s*[一二三四五六七八九十百千万零〇两\d]+\s*部\s*.*(?:书籍)?元数据.*|(?:书籍)?元数据(?:\s+Metadata)?|Metadata)$/i;
    function isMetadataSectionHeading(t){return METADATA_SECTION_HEADING.test(s(t).trim());}
    function chinesePartNumber(t){var m=s(t).trim().match(/^第\s*([一二三四五六七八九十百千万零〇两\d]+)\s*部/);if(!m)return '';var v=m[1];if(/^\d+$/.test(v))return v;var map={零:0,〇:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,百:100,千:1000,万:10000};if(v==='十')return '10';if(v.length===2&&v[0]==='十')return String(10+map[v[1]]);if(v.length===2&&v[1]==='十')return String(map[v[0]]*10);if(v.length===3&&v[1]==='十')return String(map[v[0]]*10+map[v[2]]);return map[v]!=null?String(map[v]):'';}
    function isMetadataChildNumbered(t){return /^\d+(?:\.\d+)+(?:\s*(?:[、.\-:]\s*)?.*)?$/.test(s(t).trim());}
    function push(i,level,label,explicit,type,inlineText){
      var lv=Math.max(1,Math.min(6,Number(level)||1)),lab=s(label||lines[i]).trim();
      heads.push({line:i,level:lv,label:lab,explicit:!!explicit,type:type||'structural-heading',inlineText:inlineText==null?'':s(inlineText)});
      if(lv===1){metadataSection=isMetadataSectionHeading(lab);currentSectionNumber=chinesePartNumber(lab);if(!currentSectionNumber){var pm=lab.match(/^(?:Part|PART)\s+(\d+)/);currentSectionNumber=pm?pm[1]:'';}}
    }
    for(var i=0;i<lines.length;i++){
      var raw=s(lines[i]),t=raw.trim();if(!t)continue;
      var oversizedStructural=QUESTION_LINE.test(t)||INLINE_SEMANTIC.test(t)||TITLE_DATE_SUFFIX.test(t);
      if(t.length>100&&!oversizedStructural)continue;
      var prev=nonblank(lines,i,-1),next=nonblank(lines,i,1),prevBlank=i===0||!prev||i-prev.index>1,nextBlank=i===lines.length-1||!next||next.index-i>1;
      var m=t.match(EXPLICIT);
      if(m){push(i,Number(m[1])||1,m[2],true,'explicit');continue;}
      if(isDateOnly(t)||isCopyright(t)||QUOTED_TITLE_LINE.test(t))continue;
      if(TITLE_DATE_SUFFIX.test(t)){push(i,1,t,false,'title-date');continue;}
      if(QUESTION_LINE.test(t)){push(i,2,t,false,'numbered');continue;}
      /* Response labels are semantic inline markers, not headings and never TOC nodes. */
      if(REPLY_LINE.test(t))continue;
      /* Context-proven TXT topic headings are evaluated before generic field-like
       * filtering so punctuation such as ':' is allowed. Known metadata fields
       * are still rejected inside looksLikeContextTopicHeading(). */
      if(looksLikeContextTopicHeading(lines,i,t,prev,next)){push(i,1,t,false,'topic-heading');continue;}
      if(INLINE_SEMANTIC.test(t)){var sm=t.match(/^((?:明显|重点|注意|问题|答复|回复|回答|答案|说明|结论|原因|目的|方法|结果|分析|总结|定义|概念|背景|步骤|提示|警告|示例|案例|补充|备注)\s*[:：])\s*(.*)$/i),semanticLabelText=sm?sm[1]:t,semanticKey=String(semanticLabelText).replace(/[：:]$/,'').trim();push(i,/^(?:回复|答复|回答|答案)$/i.test(semanticKey)?3:2,semanticLabelText,false,'semantic-label',sm?sm[2]:'');continue;}
      if(isFieldLike(t))continue;
      if(looksLikeMetadataBlock(lines,i))continue;
      if(BARE_HUI.test(t)){push(i,1,t,true,'explicit');continue;}
      m=t.match(CHAPTER);if(m){push(i,/^(节|款|课|讲|幕|场)$/.test(m[2])?2:1,t,true,'explicit');continue;}
      if(VOLUME.test(t)){push(i,1,t,true,'explicit');continue;}
      if(KNOWN_STANDALONE.test(t)){push(i,1,t,false,'semantic-explicit');continue;}
      if(EN_CHAPTER.test(t)){push(i,1,t,true,'explicit');continue;}
      if(EN_PART.test(t)){push(i,1,t,true,'explicit');continue;}
      /* Metadata section boundary is a hard semantic scope. Its child fields
       * remain readable body content but never become TXT TOC nodes. */
      if(metadataSection && (isMetadataChildNumbered(t)||FIELD.test(t)||STANDALONE_METADATA.test(t))){continue;}
      /* Decimal section labels are body structure, never TXT TOC nodes.
       * This is a cross-format contract: 1.1 / 2.2 / 3.3 / 4.1.1 may remain
       * visible as numbered semantic labels, but decimal numbering alone must
       * never create a navigation node. Structural TOC nodes use explicit Part/
       * Chapter/Question/Topic semantics instead. Metadata children are covered
       * by the same rule. */
      var dm=t.match(/^(\d+)(?:\.(\d+))+(?:\s*(?:[、.\-:]\s*)?.*)?$/);
      if(dm)continue;
      /* Proven unnumbered topic heading: an independent, top-aligned nominal
       * phrase introducing substantial prose. This is a TOC node even without
       * chapter numbering or a fixed semantic label. */
      if(looksLikeTopicHeading(lines,i,t,prev,next)){push(i,1,t,false,'topic-heading');continue;}
      if(SINGLE_NUMBER.test(t)){var titlePart=t.replace(/^\d+[\.、]\s*/,'').trim();if(titlePart.length<=60&&(prevBlank||nextBlank||/\d+[\.、]/.test((prev&&prev.text)||'')||/\d+[\.、]/.test((next&&next.text)||'')))push(i,1,t,false,'numbered');continue;}
      if(CHINESE_NUMBER.test(t)){if(prevBlank||nextBlank)push(i,1,t,false,'numbered');continue;}
      if(PAREN_NUMBER.test(t)){if(prevBlank||nextBlank)push(i,2,t,false,'numbered');continue;}
      if(QUOTED.test(t)){continue;}
      /* Semantic labels such as 明显：/问题：/答复： are structural even though they end with a colon. */
      if(SEMANTIC_LABEL.test(t)){
        var labelNext=nonblank(lines,i,1),labelBody=!!(labelNext&&!isFieldLike(labelNext.text)&&!isDateOnly(labelNext.text)&&!isCopyright(labelNext.text));
        if(labelBody&&!looksLikeMetadataBlock(lines,i))push(i,2,t,false,'semantic-label');
        continue;
      }
      /* Strict unnumbered semantic/short-subheading rule.
       * A top-level short line (<30 chars) can be a real subheading even without
       * numbering, but only when context proves a structural boundary. The rule
       * deliberately rejects ordinary short prose.
       */
      var titleLike=!hasSentencePunctuation(t)&&t.length>=2&&t.length<=60;
      if(titleLike){
        var indented=isIndentedProseAfter(lines,i),longBody=hasProseAfter(lines,i),family=familyCount(lines,i);
        var semanticName=COMMON_SEMANTIC.test(t),semanticLabel=SEMANTIC_LABEL.test(t);
        if(REPLY_LINE.test(t))continue;
        var shortTopLevel=t.length<30&&indentOf(raw)===0;
        var prevIsNumberedField=!!(prev&&/^\d+(?:\.\d+)+\s+/.test(prev.text));
        var frontMatterLine=i===0;
        var separated=prevBlank||nextBlank;
        var nextText=next&&next.text||'';
        var nextLooksBody=!!(next&&!isFieldLike(nextText)&&!isDateOnly(nextText)&&!isCopyright(nextText)&&nextText.length>=12);
        var shortSubheadingEvidence=shortTopLevel&&prevBlank&&nextLooksBody&&!hasSentencePunctuation(t)&&!prevIsNumberedField&&!frontMatterLine;
        var strongBody=(indented&&longBody)||(nxtLong(lines,i));
        var structural=(indented&&longBody)||(semanticName&&strongBody)||(semanticLabel&&longBody)||shortSubheadingEvidence;
        if(structural){
          /* A field/index/glossary-like block is never promoted. */
          if(!looksLikeMetadataBlock(lines,i)&&!STANDALONE_METADATA.test(t))push(i,semanticLabel?2:1,t,false,semanticLabel?'semantic-label':(shortSubheadingEvidence?'short-subheading':'semantic'));
          else if(COMMON_SEMANTIC.test(t)&&fieldRunAfter(lines,i)===0)push(i,1,t,false,'semantic');
        }
      }
    }
    /* Never discard a structurally proven heading merely because it is the only one.
     * TOC detection is conservative, but a proven single heading is still a heading. */
    return {version:'3.7.2',lines:lines,headings:heads,hasReliableStructure:heads.length>0,source:source};
  }
  function toHtml(text,title,esc){
    var rawSource=s(text).replace(/\r\n?|\r/g,'\n');
    var a=analyze(rawSource,{title:title}),by={};a.headings.forEach(function(h){by[h.line]=h;});
    function e(v){return esc?esc(v):s(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
    var out=[],para=[],lineStarts=[];
    function joiner(a,b){
      var l=s(a).replace(/\s+$/,'').slice(-1),r=s(b).replace(/^\s+/,'').charAt(0);
      if(!l||!r)return '';
      var la=/[A-Za-z0-9]/.test(l),ra=/[A-Za-z0-9]/.test(r);
      return (la||ra)?' ':'';
    }
    (function(){var pos=0;for(var i=0;i<a.lines.length;i++){lineStarts[i]=pos;pos+=s(a.lines[i]).length+(i<a.lines.length-1?1:0);}})();
    function attrRange(st,en){return ' data-txt-source-start="'+Math.max(0,Number(st)||0)+'" data-txt-source-end="'+Math.max(Math.max(0,Number(st)||0),Number(en)||0)+'"';}
    function lineHtml(x){
      var rawLine=s(x.text),start=lineStarts[x.line]||0,end=start+rawLine.length;
      var q=rawLine,m=q.match(/^(\s*)(回复|答复|回答|答案)(\s*[:：])/i),body;
      if(m)body=e(m[1])+'<span class="txt-semantic-label">'+e(m[2]+m[3])+'</span>'+e(q.slice(m[0].length));
      else body=e(q);
      return '<span class="txt-source-line"'+attrRange(start,end)+'>'+body+'</span>';
    }
    function flush(){
      if(!para.length)return;
      var first=s(para[0].text),hasIndent=/^(?:[\u3000\u00a0]{1,}|[ \t]{2,})/.test(first);
      var cls='txt-paragraph'+(hasIndent?' txt-paragraph-source-indented':'');
      /*
       * TXT paragraph contract v7.17.14:
       *   1) Blank lines are paragraph boundaries.
       *   2) An explicit source indentation at the start of a non-empty line
       *      is also a paragraph boundary. This is authoritative for TXT files
       *      such as novels where every paragraph is written with two full-width
       *      spaces and there are intentionally no blank separator lines.
       *   3) Only consecutive NON-indented continuation lines may be joined.
       *   4) Never synthesize a 2em indent; the source indentation is rendered
       *      exactly once by the source text itself.
       *   5) Every source line retains its own absolute source interval so the
       *      Speech/high-frequency locator remains unchanged.
       */
      out.push('<p class="'+cls+'">'+para.map(function(x,i){return (i?' ':'')+lineHtml(x);}).join('')+'</p>');
      para=[];
    }
    a.lines.forEach(function(line,i){
      var h=by[i],trimmed=s(line).trim();
      if(h){
        flush();
        var original=trimmed,m=original.match(EXPLICIT),prefix=m?m[0].slice(0,m[0].indexOf(m[1])):'';
        var hs=lineStarts[i]||0,he=hs+s(line).length;
        out.push('<h'+h.level+attrRange(hs,he)+' data-txt-nav="1" data-txt-nav-level="'+h.level+'">'+(prefix?'<span class="txt-nav-prefix" aria-hidden="true">'+e(prefix)+'</span>':'')+e(h.label)+'</h'+h.level+'>');
        if(h.inlineText){
          var inlinePos=s(line).indexOf(s(h.inlineText)),is=inlinePos>=0?hs+inlinePos:hs,ie=is+s(h.inlineText).length;
          out.push('<p class="txt-paragraph txt-heading-inline-content"'+attrRange(is,ie)+'>'+e(h.inlineText)+'</p>');
        }
        return;
      }
      if(/^\d+(?:\.\d+)+\s*(?:[、.\-:]\s*)?.+$/.test(trimmed)){
        flush();var ds=lineStarts[i]||0,de=ds+s(line).length,dm=trimmed.match(/^(\d+(?:\.\d+)+)/),depth=dm?dm[1].split('.').length:2,visualLevel=Math.max(2,Math.min(6,depth));
        out.push('<div class="txt-numbered-label txt-numbered-heading" data-toc="0" data-txt-heading-level="'+visualLevel+'"'+attrRange(ds,de)+'>'+e(trimmed)+'</div>');return;
      }
      if(line===''){flush();return;}
      /* A leading full-width space / explicit indentation in the source is a
       * real TXT paragraph marker. Do not merge such a line with the previous
       * paragraph merely because the file has no blank separator line. */
      if(para.length && /^(?:[\u3000\u00a0]{1,}|[ \t]{2,})/.test(line)){
        flush();
      }
      para.push({text:line,line:i});
    });
    flush();
    return out.join('');
  }
  root.BookNoteTxtHeadingRules={version:'3.9.0',analyze:analyze,toHtml:toHtml};
})(typeof window!=='undefined'?window:self);
