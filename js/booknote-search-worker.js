const normalize = (value, options) => {
  let result = value.normalize('NFC');
  if (!options.matchDiacritics) {
    result = result.normalize('NFD').replace(/\p{Mark}/gu, '');
  }
  return options.matchCase ? result : result.toLocaleLowerCase();
};

const MAX_FUZZY_QUERY_LENGTH = 256;

const segmentGraphemes = (text, options) => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), ({ segment, index }) => ({
    text: segment,
    start: index,
    end: index + segment.length,
    key: normalize(segment, options),
    looseKey: normalize(segment, { matchCase: false, matchDiacritics: false }),
  }));
};

const getTypoBudget = (length) => {
  if (length <= 2) return 0;
  if (length <= 5) return 1;
  return 2;
};

const buildLcsTable = (query, source, sourceStart, sourceLength, table, width) => {
  table.fill(0);
  for (let queryIndex = 1; queryIndex <= query.length; queryIndex++) {
    const row = queryIndex * width;
    const previousRow = row - width;
    for (let sourceIndex = 1; sourceIndex <= sourceLength; sourceIndex++) {
      table[row + sourceIndex] =
        query[queryIndex - 1].key === source[sourceStart + sourceIndex - 1].key
          ? table[previousRow + sourceIndex - 1] + 1
          : Math.max(table[previousRow + sourceIndex], table[row + sourceIndex - 1]);
    }
  }
};

const traceAlignment = (table, query, source, sourceStart, sourceLength, width) => {
  const positions = [];
  let queryIndex = query.length;
  let sourceIndex = sourceLength;
  while (queryIndex > 0 && sourceIndex > 0) {
    const row = queryIndex * width;
    const previousRow = row - width;
    if (
      query[queryIndex - 1].key === source[sourceStart + sourceIndex - 1].key &&
      table[row + sourceIndex] === table[previousRow + sourceIndex - 1] + 1
    ) {
      positions.push(sourceIndex - 1);
      queryIndex--;
      sourceIndex--;
    } else if (table[previousRow + sourceIndex] >= table[row + sourceIndex - 1]) {
      queryIndex--;
    } else {
      sourceIndex--;
    }
  }
  return positions.reverse();
};

const makeRuns = (source, positions) => {
  const runs = [];
  for (const position of positions) {
    const grapheme = source[position];
    const previous = runs.at(-1);
    if (previous?.end === grapheme.start) previous.end = grapheme.end;
    else runs.push({ start: grapheme.start, end: grapheme.end });
  }
  return runs;
};

const conflictsWithStrictOptions = (query, source, start, end, options) => {
  if (!options.matchCase && !options.matchDiacritics) return false;
  const queryLoose = query.map(({ looseKey }) => looseKey).join('');
  const queryKey = query.map(({ key }) => key).join('');
  const firstWindow = Math.max(0, start - getTypoBudget(query.length));
  const lastWindow = Math.min(start, source.length - query.length);
  for (let windowStart = firstWindow; windowStart <= lastWindow; windowStart++) {
    const windowEnd = windowStart + query.length - 1;
    if (windowEnd < end) continue;
    const sourceSlice = source.slice(windowStart, windowEnd + 1);
    if (
      sourceSlice.map(({ looseKey }) => looseKey).join('') === queryLoose &&
      sourceSlice.map(({ key }) => key).join('') !== queryKey
    ) {
      return true;
    }
  }
  return false;
};

const findFuzzyMatches = (text, rawQuery, options, limit = Infinity, state) => {
  const queryText = rawQuery.trim();
  if (!queryText) return [];

  const query = segmentGraphemes(queryText, options);
  if (query.length > MAX_FUZZY_QUERY_LENGTH) {
    const error = new Error(
      `Fuzzy search query cannot exceed ${MAX_FUZZY_QUERY_LENGTH} characters`,
    );
    Object.assign(error, { code: 'FUZZY_QUERY_TOO_LONG' });
    throw error;
  }
  if (limit <= 0) return [];
  const source = segmentGraphemes(text, options);
  const typoBudget = getTypoBudget(query.length);
  const minimumMatches = query.length - typoBudget;
  const maximumSpan = query.length * 3;
  const tableWidth = maximumSpan + 1;
  const lcsTable = new Uint16Array((query.length + 1) * tableWidth);
  const candidates = new Map();
  const candidateLimit = Number.isFinite(limit)
    ? Math.min(16_000, Math.max(1, Math.floor(limit)) * Math.min(maximumSpan, 32))
    : Infinity;
  const possibleStartKeys = new Set(query.slice(0, typoBudget + 1).map(({ key }) => key));
  const queryCounts = new Map();
  for (const { key } of query) queryCounts.set(key, (queryCounts.get(key) ?? 0) + 1);
  const windowCounts = new Map();
  let availableMatches = 0;
  const adjustWindowCount = (key, delta) => {
    const required = queryCounts.get(key);
    if (!required) return;
    const previous = windowCounts.get(key) ?? 0;
    const next = previous + delta;
    availableMatches += Math.min(next, required) - Math.min(previous, required);
    if (next) windowCounts.set(key, next);
    else windowCounts.delete(key);
  };
  for (let index = 0; index < Math.min(maximumSpan, source.length); index++) {
    adjustWindowCount(source[index].key, 1);
  }

  candidateStarts: for (let start = 0; start < source.length; start++) {
    const windowLength = Math.min(maximumSpan, source.length - start);
    const isCandidate =
      possibleStartKeys.has(source[start].key) && availableMatches >= minimumMatches;
    if (isCandidate) {
      buildLcsTable(query, source, start, windowLength, lcsTable, tableWidth);
      for (let length = minimumMatches; length <= windowLength; length++) {
        const matchCount = lcsTable[query.length * tableWidth + length];
        if (matchCount < minimumMatches) continue;
        const localPositions = traceAlignment(lcsTable, query, source, start, length, tableWidth);
        if (localPositions[0] !== 0) continue;

        const positions = localPositions.map((position) => start + position);
        const last = positions.at(-1);
        const span = last - start + 1;
        const typoCount = query.length - positions.length;
        const minimumDensity = typoCount === 0 ? 0.45 : 0.65;
        const gapRuns = makeRuns(source, positions).length - 1;
        const score = positions.length * 12 - typoCount * 6;
        if (
          typoCount > typoBudget ||
          span > maximumSpan ||
          positions.length / span < minimumDensity ||
          gapRuns > Math.max(Math.floor(query.length / 3), 2) ||
          score < query.length * 6 ||
          conflictsWithStrictOptions(query, source, start, last, options)
        ) {
          continue;
        }

        const runs = makeRuns(source, positions);
        const candidate = {
          start: source[start].start,
          end: source[last].end,
          runs,
          typoCount,
          score,
        };
        const key = runs.map(({ start: runStart, end }) => `${runStart}:${end}`).join(',');
        const existing = candidates.get(key);
        if (!existing || candidate.score > existing.score) candidates.set(key, candidate);
        if (candidates.size >= candidateLimit) {
          if (state) state.truncated = true;
          break candidateStarts;
        }
      }
    }

    adjustWindowCount(source[start].key, -1);
    const nextIndex = start + maximumSpan;
    if (nextIndex < source.length) adjustWindowCount(source[nextIndex].key, 1);
  }

  const ranked = [...candidates.values()].sort(
    (a, b) =>
      a.typoCount - b.typoCount ||
      b.score - a.score ||
      a.end - a.start - (b.end - b.start) ||
      a.start - b.start,
  );
  const selected = [];
  for (const candidate of ranked) {
    if (selected.some(({ start, end }) => candidate.start < end && candidate.end > start)) continue;
    selected.push(candidate);
    if (selected.length >= limit) {
      if (state) state.truncated = true;
      break;
    }
  }

  return selected
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, runs, typoCount }) => ({ start, end, runs, typoCount }));
};

const getSensitivity = ({ matchCase, matchDiacritics }) =>
  matchDiacritics && matchCase
    ? 'variant'
    : matchDiacritics
      ? 'accent'
      : matchCase
        ? 'case'
        : 'base';

const createSegmenter = (locale) => {
  try {
    return new Intl.Segmenter(locale, { granularity: 'word' });
  } catch {
    return new Intl.Segmenter('en', { granularity: 'word' });
  }
};

const createCollator = (locale, sensitivity) => {
  try {
    return new Intl.Collator(locale, { sensitivity });
  } catch {
    return new Intl.Collator('en', { sensitivity });
  }
};

const CJK_SEGMENT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

const segmentNearbyWords = (text, locale) => {
  const words = [];
  let unitIndex = 0;
  for (const segment of createSegmenter(locale).segment(text)) {
    if (!segment.isWordLike) continue;
    words.push({
      text: segment.segment,
      wordIndex: unitIndex,
      start: segment.index,
      end: segment.index + segment.segment.length,
    });
    // CJK tokenization is dictionary-dependent and mostly per-character, so
    // token-counted distance is erratic. Count CJK segments by grapheme
    // cluster instead: nearbyWords reads as characters for CJK text and
    // stays one-per-word for other scripts.
    unitIndex += CJK_SEGMENT_RE.test(segment.segment) ? Array.from(segment.segment).length : 1;
  }
  return words;
};

const findNearbyMatches = (
  text,
  rawQuery,
  options,
  words = segmentNearbyWords(text, options.locale),
  limit = Infinity,
  state,
) => {
  const collator = createCollator(options.locale, getSensitivity(options));
  const queryWords = [];
  for (const word of rawQuery.split(/\s+/).filter(Boolean)) {
    if (!queryWords.some((existing) => collator.compare(existing, word) === 0)) {
      queryWords.push(word);
    }
  }
  if (queryWords.length < 2) {
    const error = new Error('Nearby words search needs at least two words');
    Object.assign(error, { code: 'NEARBY_NEEDS_TWO_WORDS' });
    throw error;
  }
  if (limit <= 0) return [];

  const occurrences = [];
  const termHasWordMatch = new Uint8Array(queryWords.length);
  for (const word of words) {
    const queryIndex = queryWords.findIndex(
      (queryWord) => collator.compare(queryWord, word.text) === 0,
    );
    if (queryIndex >= 0) {
      termHasWordMatch[queryIndex] = 1;
      occurrences.push({ ...word, queryIndex });
    }
  }
  // Word segmenters split names and compounds (CJK especially: 黄仁勋 ->
  // 黄/仁/勋, 训练芯片 -> ... 芯/片), so collator equality against segmented
  // words can miss a term entirely. For terms with zero word-equality
  // occurrences, fall back to substring positions mapped onto word indices,
  // keeping the word-distance semantics of the sliding window.
  if (words.length && termHasWordMatch.includes(0)) {
    const fold = (value) =>
      options.matchCase ? value : value.toLocaleLowerCase(options.locale ?? undefined);
    const haystack = fold(text);
    const wordIndexAt = (position) => {
      let low = 0;
      let high = words.length - 1;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (words[middle].start <= position) low = middle;
        else high = middle - 1;
      }
      return low;
    };
    for (const [queryIndex, queryWord] of queryWords.entries()) {
      if (termHasWordMatch[queryIndex]) continue;
      const needle = fold(queryWord);
      if (!needle) continue;
      let index = haystack.indexOf(needle);
      while (index >= 0) {
        occurrences.push({
          text: queryWord,
          wordIndex: words[wordIndexAt(index)].wordIndex,
          start: index,
          end: index + queryWord.length,
          queryIndex,
        });
        index = haystack.indexOf(needle, index + 1);
      }
    }
    occurrences.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  const counts = new Uint32Array(queryWords.length);
  const matches = [];
  let distinct = 0;
  let low = 0;
  let lastHigh = -1;
  for (let high = 0; high < occurrences.length; high++) {
    const highQueryIndex = occurrences[high].queryIndex;
    if (counts[highQueryIndex] === 0) distinct++;
    counts[highQueryIndex] = counts[highQueryIndex] + 1;
    let window = null;
    while (distinct === queryWords.length) {
      window = { low, high };
      const lowQueryIndex = occurrences[low].queryIndex;
      counts[lowQueryIndex] = counts[lowQueryIndex] - 1;
      if (counts[lowQueryIndex] === 0) distinct--;
      low++;
    }
    if (
      !window ||
      window.low <= lastHigh ||
      occurrences[window.high].wordIndex - occurrences[window.low].wordIndex > options.nearbyWords
    ) {
      continue;
    }

    lastHigh = window.high;
    const selected = occurrences.slice(window.low, window.high + 1);
    matches.push({
      start: selected[0].start,
      end: selected.at(-1).end,
      runs: selected.map(({ start, end }) => ({ start, end })),
    });
    if (matches.length >= limit) {
      if (state) state.truncated = true;
      break;
    }
  }
  return matches;
};


const foldValue = (value, options, locale) => {
  let result = String(value ?? '').normalize('NFC');
  if (!options.matchCase) {
    try { result = result.toLocaleLowerCase(locale); } catch (_) { result = result.toLowerCase(); }
  }
  if (!options.matchDiacritics) result = result.normalize('NFD').replace(/\p{Mark}/gu, '');
  return result;
};

const findContainsMatches = (text, query, options, limit = Infinity) => {
  const raw = String(text ?? ''), needle = String(query ?? '').trim();
  if (!needle || limit <= 0) return [];
  const hay = foldValue(raw, options, options.locale);
  const q = foldValue(needle, options, options.locale);
  if (!q) return [];
  const out = [];
  let p = hay.indexOf(q, 0);
  while (p >= 0 && out.length < limit) {
    out.push({start:p,end:p+q.length,runs:[{start:p,end:p+q.length}]});
    p = hay.indexOf(q, p + Math.max(1,q.length));
  }
  return out;
};

const findRegexMatches = (text, rawQuery, options, limit = Infinity) => {
  let rx;
  try { rx = new RegExp(String(rawQuery || ''), options.matchCase ? 'gu' : 'giu'); }
  catch (e) { e.code='INVALID_REGEX'; throw e; }
  const out=[];
  for (const m of String(text ?? '').matchAll(rx)) {
    if (!m[0]) continue;
    const start=m.index, end=start+m[0].length;
    out.push({start,end,runs:[{start,end}]});
    if(out.length>=limit)break;
  }
  return out;
};

const segmentWords = (text, locale) => {
  let seg;
  try { seg = new Intl.Segmenter(locale || 'en', {granularity:'word'}); }
  catch (_) { seg = new Intl.Segmenter('en', {granularity:'word'}); }
  const out=[];
  for(const x of seg.segment(String(text ?? ''))) if(x.isWordLike) out.push({text:x.segment,start:x.index,end:x.index+x.segment.length});
  return out;
};

const findWholeWordMatches = (text, query, options, limit = Infinity) => {
  const base=findContainsMatches(text,query,options,Infinity), words=segmentWords(text,options.locale);
  if(!base.length)return [];
  const starts=new Set(words.map(x=>x.start)), ends=new Set(words.map(x=>x.end));
  return base.filter(x=>starts.has(x.start)&&ends.has(x.end)).slice(0,limit);
};


// BookNote Phase B exact matcher: same normalization contract as the authoritative
// BookNoteSearchIndex path, but returns only compact UTF-32 source coordinates.
const INVISIBLE_RE_EXACT=/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u206a-\u206f\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;
const exactNormalizeUnit=(s)=>String(s??'').normalize('NFKC').replace(INVISIBLE_RE_EXACT,'').toLocaleLowerCase();
const exactNormalizedWithMap=(s)=>{
  const str=String(s??'');
  let out='',pending=false,ps=-1,pe=-1;
  let map=new Uint32Array(1024),mapEnd=new Uint32Array(1024),length=0;
  const ensure=(needed)=>{
    if(needed<=map.length)return;
    let cap=map.length;
    while(cap<needed)cap*=2;
    const next=new Uint32Array(cap),nextEnd=new Uint32Array(cap);
    next.set(map);nextEnd.set(mapEnd);map=next;mapEnd=nextEnd;
  };
  const appendMapped=(text,start,end)=>{
    const n=text.length;if(!n)return;
    ensure(length+n);
    for(let j=0;j<n;j++){map[length+j]=start;mapEnd[length+j]=end;}
    length+=n;out+=text;
  };
  try{
    if(typeof Intl!=='undefined'&&Intl.Segmenter){
      const seg=new Intl.Segmenter(undefined,{granularity:'grapheme'});
      for(const x of seg.segment(str)){
        const g=x.segment,gStart=x.index,gEnd=gStart+g.length;
        const normalized=exactNormalizeUnit(g);if(!normalized)continue;
        if(/\s/.test(normalized)){
          if(out&&!pending){pending=true;ps=gStart;pe=gEnd;}
          continue;
        }
        if(pending){appendMapped(' ',ps,pe);pending=false;}
        appendMapped(normalized,gStart,gEnd);
      }
    } else {
      for(let i=0;i<str.length;){
        const cp=str.codePointAt(i),len=cp>0xffff?2:1,g=str.slice(i,i+len),gStart=i,gEnd=i+len;
        const normalized=exactNormalizeUnit(g);if(normalized){
          if(/\s/.test(normalized)){if(out&&!pending){pending=true;ps=gStart;pe=gEnd;}}
          else {if(pending){appendMapped(' ',ps,pe);pending=false;}appendMapped(normalized,gStart,gEnd);}
        }
        i+=len;
      }
    }
  }catch(_){
    // Keep the historical code-point fallback if Segmenter fails at runtime.
    out='';pending=false;ps=-1;pe=-1;length=0;map=new Uint32Array(1024);mapEnd=new Uint32Array(1024);
    for(let i=0;i<str.length;){
      const cp=str.codePointAt(i),len=cp>0xffff?2:1,g=str.slice(i,i+len),normalized=exactNormalizeUnit(g);
      if(normalized){
        if(/\s/.test(normalized)){if(out&&!pending){pending=true;ps=i;pe=i+len;}}
        else {if(pending){appendMapped(' ',ps,pe);pending=false;}appendMapped(normalized,i,i+len);}
      }
      i+=len;
    }
  }
  if(out.endsWith(' ')){out=out.slice(0,-1);length=Math.max(0,length-1);}
  return {text:out,map:map.subarray(0,length),mapEnd:mapEnd.subarray(0,length)};
};
const findExactNormalizedAll=(text,query)=>{
  const nm=exactNormalizedWithMap(text),q=exactNormalizeUnit(query).trim();
  // Query whitespace uses the same collapse rules as the corpus.
  const qnm=exactNormalizedWithMap(query),needle=qnm.text;
  const starts=[],ends=[];if(!needle)return {starts:new Uint32Array(0),ends:new Uint32Array(0),count:0};
  let from=0,p;
  while((p=nm.text.indexOf(needle,from))>=0){
    const ep=p+needle.length-1;
    starts.push(Number(nm.map[p]??0));ends.push(Number(nm.mapEnd[ep]??String(text??'').length));from=p+1;
  }
  const sa=new Uint32Array(starts.length),ea=new Uint32Array(ends.length);
  for(let i=0;i<starts.length;i++){sa[i]=starts[i]>>>0;ea[i]=ends[i]>>>0;}
  return {starts:sa,ends:ea,count:sa.length};
};

self.onmessage = (event) => {
  const data=event.data||{};
  if(data.type!=='search')return;
  const p=data.payload||{}, id=data.id;
  try {
    const text=String(p.text||''), query=String(p.query||''), mode=p.mode||'contains', limit=Math.max(1,Number(p.limit)||100);
    let matches;
    if(mode==='exact-normalized') {
      const result=findExactNormalizedAll(text,query);
      self.postMessage({type:'exact-success',id,count:result.count,starts:result.starts,ends:result.ends},[result.starts.buffer,result.ends.buffer]);
      return;
    }
    if(mode==='fuzzy') matches=findFuzzyMatches(text,query,p.options||{},limit,{});
    else if(mode==='nearby-words') matches=findNearbyMatches(text,query,p.options||{},undefined,limit,{});
    else if(mode==='regex') matches=findRegexMatches(text,query,p.options||{},limit);
    else if(mode==='whole-words') matches=findWholeWordMatches(text,query,p.options||{},limit);
    else matches=findContainsMatches(text,query,p.options||{},limit);
    self.postMessage({type:'success',id,matches:matches||[]});
  } catch(e) {
    self.postMessage({type:'error',id,message:e&&e.message||String(e),code:e&&e.code||''});
  }
};
