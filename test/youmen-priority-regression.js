const assert = require('assert');
const src = '这事我不说也可能你们不太清楚，但是当我说出这个过程的时候你们也可能就清楚了，因为好多人已经经历到这事了。';
const first = src.indexOf('你们');
const second = src.indexOf('你们', first + 2);
assert(first >= 0 && second > first);
// The display contract is explicit: only a 2-char Speech boundary may compose 你们.
assert.strictEqual(src.slice(first, first + 2), '你们');
assert.strictEqual(src.slice(second, second + 2), '你们');
assert.notStrictEqual(first, second);
console.log('youmen-priority-regression: PASS');
