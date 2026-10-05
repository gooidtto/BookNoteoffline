/*
 * TXT C visual layer — reads B semantic candidate only after A has locked the
 * occurrence. C can narrow the visual range, but it can never relocate it.
 * Contract:
 *   A = Queue/Fence/charIndex/absolute occurrence (already locked by caller)
 *   B = semantic candidate in queue-relative character coordinates
 *   C = validate + clamp B inside A, otherwise return null for A fallback
 */
(function (root) {
  'use strict';

  function isPunctuation(ch) {
    return !!ch && /[。！？!?；：;:，、,.“”‘’「」『』（）\[\]【】《》〈〉…．·•—–－～~＿]/.test(ch);
  }

  function isValidCandidate(candidate, text, index, lockStart, lockEnd, cmap) {
    if (!candidate || !Array.isArray(cmap)) return null;
    var start = Number(candidate.start);
    var end = Number(candidate.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
    if (start < 0 || end > text.length) return null;
    if (!(index >= start && index < end)) return null;
    if (start > index) return null;
    if (isPunctuation(text.charAt(index))) return null;

    /* B may describe a phrase, but C must prove the whole phrase stays in A. */
    var absStart = Number(cmap[start] && cmap[start].sourceStart);
    var absEnd = Number(cmap[end - 1] && cmap[end - 1].sourceEnd);
    var anchor = Number(cmap[index] && cmap[index].sourceStart);
    var anchorEnd = Number(cmap[index] && cmap[index].sourceEnd);
    if (!Number.isFinite(absStart) || !Number.isFinite(absEnd) ||
        !Number.isFinite(anchor) || !Number.isFinite(anchorEnd)) return null;
    if (absStart < lockStart || absEnd > lockEnd || absEnd <= absStart) return null;
    if (anchor < lockStart || anchorEnd > lockEnd) return null;

    /* Never let a semantic candidate cross a punctuation boundary itself. */
    for (var i = start; i < end; i++) {
      if (isPunctuation(text.charAt(i))) return null;
    }

    return {
      start: absStart,
      end: absEnd,
      charStart: start,
      charEnd: end,
      text: text.slice(start, end),
      reason: String(candidate.reason || 'semantic'),
      semantic: true
    };
  }

  function select(text, index, lockStart, lockEnd, cmap, analyzer) {
    text = String(text == null ? '' : text);
    index = Math.max(0, Math.floor(Number(index) || 0));
    lockStart = Number(lockStart);
    lockEnd = Number(lockEnd);
    if (!text || index >= text.length || !Number.isFinite(lockStart) || !Number.isFinite(lockEnd) || lockEnd <= lockStart) return null;
    var b = analyzer && typeof analyzer.analyze === 'function' ? analyzer.analyze(text, index, 4) : null;
    return isValidCandidate(b, text, index, lockStart, lockEnd, cmap);
  }

  root.BookNoteTxtSemanticVisualV67 = {
    select: select,
    validate: isValidCandidate,
    isPunctuation: isPunctuation
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
