/*
 * TXT semantic candidate analysis only.
 * This module is intentionally independent from reader/reader.js.
 * It proposes a natural visual grouping but never selects a DOM/source occurrence.
 */
(function (root) {
  'use strict';

  function isCjk(ch) {
    return !!ch && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch);
  }

  function isPunctuation(ch) {
    return !!ch && /[，。！？；：、,.!?;:\u3000\s]/.test(ch);
  }

  function analyze(text, index, maxLen) {
    text = String(text == null ? '' : text);
    index = Math.max(0, Number(index) || 0);
    maxLen = Math.max(2, Math.min(4, Number(maxLen) || 4));
    if (index >= text.length || !isCjk(text.charAt(index))) return null;

    var rest = text.slice(index, index + maxLen);
    if (!rest) return null;

    // Conservative constructions whose local syntax is comparatively stable.
    if (rest.slice(0, 3) === '高兴得') {
      return { start: index, end: index + 3, text: '高兴得', reason: 'state+得' };
    }
    if (rest.length >= 3 && rest.charAt(2) === '得' && isCjk(rest.charAt(0)) && isCjk(rest.charAt(1))) {
      return { start: index, end: index + 3, text: rest.slice(0, 3), reason: 'two-cjk+得' };
    }
    if (rest.length >= 3 && rest.charAt(1) === '了' && rest.slice(2, 4) === '起来') {
      return { start: index, end: index + 4, text: rest.slice(0, 4), reason: 'X了起来' };
    }
    if (rest.length >= 3 && rest.slice(1, 3) === '起来') {
      return { start: index, end: index + 3, text: rest.slice(0, 3), reason: 'X起来' };
    }

    // Do not manufacture a grouping merely to reach 2–4 characters.
    // A caller can safely fall back to the locked occurrence range.
    return null;
  }

  root.BookNoteTxtSemanticCandidateV65 = { analyze: analyze, isCjk: isCjk, isPunctuation: isPunctuation };
})(typeof globalThis !== 'undefined' ? globalThis : this);
