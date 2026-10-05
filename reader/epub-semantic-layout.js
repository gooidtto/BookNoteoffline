(function(global){
'use strict';

/*
 * BookNote EPUB Semantic Layout Normalization v1.3
 *
 * Purpose:
 *   Normalize EPUB presentation without changing the DOM hierarchy or text
 *   nodes used by the existing five-level locator:
 *   Spine Section -> Logical Chapter -> DOM Block -> Sentence -> TextNode.
 *
 * This module only adds semantic classes/data attributes and normalizes
 * presentation declarations on ordinary prose blocks. It never replaces,
 * unwraps, reorders, or merges content elements. Text nodes, sentence
 * boundaries, and the five-level locator chain are intentionally untouched.
 */

var BLOCK_RE=/^(P|DIV|LI|BLOCKQUOTE|PRE|FIGCAPTION|DT|DD|SECTION|ARTICLE|ASIDE|CENTER)$/i;
var HEADING_RE=/^H[1-6]$/i;
var LEGACY_CHAPTER_RE=/^第[一二三四五六七八九十百千万〇零○0-9]+[回章節节卷部](?:[\s\u3000:：.．、\-—]|$)/;
var LEGACY_EPIGRAPH_RE=/^(?:詞曰|詩曰|诗曰|詞云|诗云)[：:]?$/;

var SPECIAL={
  part:'part',chapter:'chapter',subchapter:'chapter',
  title:'title',fulltitle:'title',halftitle:'title',
  subtitle:'subtitle',subhead:'subtitle',subheadc:'subtitle',
  epigraph:'epigraph',quote:'quote',blockquote:'quote',
  verse:'verse',poem:'verse',poetry:'verse',stanza:'verse',
  caption:'caption',
  bridgehead:'heading',heading:'heading',division:'heading',
  noindent:'noindent',right:'attribution',center:'centered-special',
  'center-container':'centered-special'
};

function tokens(el){
  var out=[];
  ['epub:type','role','class','id'].forEach(function(name){
    var v=el.getAttribute&&el.getAttribute(name);
    if(v)String(v).toLowerCase().split(/[\s,]+/).forEach(function(x){if(x)out.push(x.replace(/^.*:/,''));});
  });
  return out;
}
function elementText(el){return String(el&&el.textContent||'').replace(/\r/g,'');}
function legacyRole(el){
  var tag=String(el&&el.tagName||'').toUpperCase();
  if(tag!=='P'&&tag!=='DIV'&&tag!=='SECTION'&&tag!=='ARTICLE')return '';
  var t=elementText(el).replace(/^[\s]+/,'').replace(/[\s]+$/,'');
  if(!t||t.length>180)return '';
  if(LEGACY_CHAPTER_RE.test(t))return 'chapter';
  if(LEGACY_EPIGRAPH_RE.test(t))return 'epigraph';
  return '';
}
function sourceIndentInfo(el){
  var t=elementText(el);
  if(!t)return {kind:'',count:0};
  /* Ignore XHTML formatting whitespace; inspect only the publication-style
     leading indentation. Never mutate the underlying TextNode. */
  var m=t.match(/^(?:[\r\n\t ]*)(\u3000+|\u00a0{1,})/);
  if(!m)return {kind:'',count:0};
  var token=m[1];
  if(token.charAt(0)==='\u3000' && /^[\u3000]+$/.test(token))return {kind:'ideographic',count:token.length};
  if(token.charAt(0)==='\u00a0' && /^[\u00a0]+$/.test(token))return {kind:'nbsp',count:token.length};
  return {kind:'',count:0};
}
function sourceIndentCount(el){return sourceIndentInfo(el).count;}
function hasSourceIndent(el){return sourceIndentCount(el)>0;}
function isVerseLike(el){
  var t=elementText(el).replace(/^[\s\u3000]+|[\s\u3000]+$/g,'');
  if(!t||t.length>240)return false;
  if(/^(?:詞曰|詩曰|诗曰|詞云|诗云)[：:]?$/.test(t))return false;
  var lines=t.split(/\r?\n/).map(function(x){return x.replace(/^[\s\u3000]+|[\s\u3000]+$/g,'');}).filter(Boolean);
  return lines.length>=2;
}
function markFollowingVerse(marker){
  if(!marker||!marker.parentElement)return;
  var siblings=Array.from(marker.parentElement.children||[]),idx=siblings.indexOf(marker);
  if(idx<0)return;
  var candidates=[],i=idx+1;
  while(i<siblings.length){
    var sib=siblings[i],tag=String(sib.tagName||'').toUpperCase();
    if(!/^(P|DIV|BLOCKQUOTE|PRE)$/.test(tag))break;
    var txt=elementText(sib).replace(/^[\s\u3000]+|[\s\u3000]+$/g,'');
    if(!txt)break;
    if(semanticRole(sib)==='chapter'||semanticRole(sib)==='part'||HEADING_RE.test(tag))break;
    if(!isVerseLike(sib))break;
    candidates.push(sib);i++;
  }
  /* Require a genuinely line-structured verse block, or a run of at least
     two short verse blocks. This avoids converting ordinary prose after a
     single 詞曰 marker into poetry. */
  if(candidates.length===1 && !/\r?\n/.test(elementText(candidates[0])))return;
  candidates.forEach(function(el){setRole(el,'verse');});
}
function semanticRole(el){
  var ts=tokens(el),role='';
  ts.some(function(t){if(SPECIAL[t]){role=SPECIAL[t];return true;}return false;});
  if(role)return role;
  var legacy=legacyRole(el);
  if(legacy)return legacy;
  if(HEADING_RE.test(el.tagName||''))return 'heading';
  return '';
}
function hasBlockDescendant(el){
  return !!el.querySelector&&!!el.querySelector('h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,table,figure');
}
function firstHeading(el){
  if(!el.querySelector)return null;
  return el.querySelector('h1,h2,h3,h4,h5,h6,[epub\\:type~="title"],[epub\\:type~="subtitle"]');
}
function addClass(el,c){if(el.classList&&!el.classList.contains(c))el.classList.add(c);}
function setRole(el,role){
  if(!role)return;
  addClass(el,'booknote-epub-'+role);
  el.setAttribute('data-booknote-role',role);
}
function removeAlign(el){
  var style=el.getAttribute('style');
  if(!style)return;
  var kept=[];
  style.split(';').forEach(function(part){
    var i=part.indexOf(':');if(i<0)return;
    var prop=part.slice(0,i).trim().toLowerCase();
    if(prop!=='text-align')kept.push(part.trim());
  });
  if(kept.length)el.setAttribute('style',kept.join('; '));else el.removeAttribute('style');
}
function removeLayoutMargins(el){
  var style=el.getAttribute('style');
  if(!style)return;
  var kept=[];
  style.split(';').forEach(function(part){
    var i=part.indexOf(':');if(i<0)return;
    var prop=part.slice(0,i).trim().toLowerCase();
    if(!/^margin(?:-(top|right|bottom|left))?$/.test(prop))kept.push(part.trim());
  });
  if(kept.length)el.setAttribute('style',kept.join('; '));else el.removeAttribute('style');
}
function removeParagraphPresentation(el){
  var style=el.getAttribute('style');
  if(!style)return;
  var kept=[];
  style.split(';').forEach(function(part){
    var i=part.indexOf(':');if(i<0)return;
    var prop=part.slice(0,i).trim().toLowerCase();
    /* Ordinary EPUB prose must not inherit publication-specific paragraph
       indentation, margins, padding, or alignment. The final Reader CSS
       supplies the BookNote Paragraph Contract. */
    if(/^text-indent$/.test(prop)||/^text-align$/.test(prop)||/^margin(?:-(top|right|bottom|left))?$/.test(prop)||/^padding(?:-(top|right|bottom|left))?$/.test(prop))return;
    kept.push(part.trim());
  });
  if(kept.length)el.setAttribute('style',kept.join('; '));else el.removeAttribute('style');
}

function linePatternCount(all,re){
  var n=0;
  all.forEach(function(el){
    var tag=String(el.tagName||'').toUpperCase();
    if(!/^(P|DIV|H[1-6]|SECTION|ARTICLE|BLOCKQUOTE|LI)$/.test(tag))return;
    var txt=elementText(el).replace(/\r/g,'').trim();
    if(!txt)return;
    var lines=txt.split(/\n+/).map(function(x){return x.replace(/^[\s\u3000]+|[\s\u3000]+$/g,'');}).filter(Boolean);
    lines.forEach(function(line){if(re.test(line))n++;});
  });
  return n;
}
function detectParagraphIndentMode(all){
  /* Final EPUB Paragraph Contract: every ordinary prose paragraph uses 2em.
     Chapter/section naming patterns such as 第1节/第2节 are TOC/semantic
     evidence only; they must never change paragraph indentation. This is
     presentation-only and never changes DOM blocks, sentence boundaries,
     TextNodes, or locator coordinates. */
  return '2em';
}

function normalize(root){
  if(!root)return root;
  var all=Array.from(root.querySelectorAll('*'));
  var paragraphIndentMode=detectParagraphIndentMode(all);
  root.setAttribute('data-booknote-paragraph-indent',paragraphIndentMode);

  /* First classify explicit semantic containers. */
  all.forEach(function(el){
    var role=semanticRole(el);
    if(!role)return;
    if(BLOCK_RE.test(el.tagName||'')&&!HEADING_RE.test(el.tagName||'')&&hasBlockDescendant(el)){
      var h=firstHeading(el);
      if(h)setRole(h,role);
      addClass(el,'booknote-epub-section');
      el.setAttribute('data-booknote-section-role',role);
    }else{
      setRole(el,role);
    }
  });

  /* Native heading hierarchy remains authoritative. */
  all.forEach(function(el){
    if(!HEADING_RE.test(el.tagName||''))return;
    setRole(el,el.getAttribute('data-booknote-role')||'heading');
    el.setAttribute('data-booknote-heading-level',String(el.tagName.slice(1)));
  });

  /* Ordinary prose gets a stable BookNote paragraph class. */
  all.forEach(function(el){
    var tag=String(el.tagName||'').toUpperCase();
    if(!/^(P|DIV|ARTICLE|SECTION|CENTER)$/.test(tag))return;
    var role=el.getAttribute('data-booknote-role')||'';
    var sectionRole=el.getAttribute('data-booknote-section-role')||'';
    var special=(role==='noindent' || role==='attribution' || role==='centered-special') ? '' : (role||sectionRole);
    if(!special){
      addClass(el,'booknote-normal-block');
      addClass(el,'booknote-epub-indent-2em');
      if(role==='noindent')addClass(el,'booknote-epub-noindent');
      if(role==='attribution')addClass(el,'booknote-epub-attribution');
      if(role==='centered-special')addClass(el,'booknote-epub-centered-special');
      var indentInfo=sourceIndentInfo(el),indentCount=indentInfo.count;
      if(indentCount){
        addClass(el,'booknote-source-indent');
        addClass(el,'booknote-source-indent-'+indentInfo.kind+'-'+Math.min(indentCount,6));
        /* Keep the previous generic marker for compatibility with v7.14.16. */
        addClass(el,'booknote-source-indent-'+Math.min(indentCount,4));
        el.setAttribute('data-booknote-source-indent-count',String(indentCount));
        el.setAttribute('data-booknote-source-indent-kind',indentInfo.kind);
      }
      /* Remove publication-specific paragraph presentation first. */
      removeParagraphPresentation(el);
      /* Some EPUBs encode the same visual indentation twice: leading U+3000 /
         NBSP characters in the TextNode plus the Reader's 2em first-line rule.
         Do NOT trim or rewrite the TextNode because that would change locator
         offsets. Instead compensate presentation-only with a CSS variable so
         the visible first-line indent is exactly 2em while source text remains
         byte/character-identical for Search, Locator, Speech, and Follow. */
      if(indentCount){
        var sourceIndentEm=indentInfo.kind==='ideographic' ? indentCount : (indentCount*0.5);
        el.style.setProperty('--booknote-source-indent-em',String(sourceIndentEm)+'em');
      }else{
        el.style.setProperty('--booknote-source-indent-em','0em');
      }
    }
  });

  /* Legacy marker blocks promote the following short, line-structured block
     into verse without changing its element or text node. */
  all.forEach(function(el){
    if(el.getAttribute('data-booknote-role')==='epigraph')markFollowingVerse(el);
  });

  /* Semantic blocks get explicit classes; their alignment is controlled by
     BookNote's reading CSS rather than arbitrary source text-align rules. */
  all.forEach(function(el){
    var role=el.getAttribute('data-booknote-role');
    if(!role)return;
    if(/^(heading|title|subtitle|chapter|part|epigraph|quote|verse|caption)$/.test(role)){
      removeAlign(el);
      removeLayoutMargins(el);
    }
  });
  return root;
}

global.BookNoteEpubSemanticLayout={version:'1.7.0',normalize:normalize};
})(globalThis);
