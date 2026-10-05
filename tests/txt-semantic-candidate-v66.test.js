const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'txt-semantic-candidate-v65.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const a = ctx.BookNoteTxtSemanticCandidateV65.analyze;
function eq(actual, expected, name) {
  const got = JSON.stringify(actual);
  const want = JSON.stringify(expected);
  if (got !== want) throw new Error(name + ': ' + got + ' != ' + want);
}
eq(a('他高兴得跳了起来', 1, 4), {start:1,end:4,text:'高兴得',reason:'state+得'}, '高兴得');
eq(a('他高兴得跳了起来', 4, 4), {start:4,end:8,text:'跳了起来',reason:'X了起来'}, '跳了起来');
eq(a('他们今天到了', 0, 4), null, 'no forced grouping');
console.log('txt-semantic-candidate-v66: PASS');
