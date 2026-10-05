const fs=require('fs');
const html=fs.readFileSync('book-library.html','utf8');
if(!/\.main\.search-mode \.search-results\{position:fixed;/.test(html)) throw new Error('search result modal layer missing');
if(!/#toast\.toast\{z-index:1000!important/.test(html)) throw new Error('toast layer must be above search result modal');
if(!/\.search-results-close/.test(html)) throw new Error('search result close button missing');
const js=fs.readFileSync('book-library.js','utf8');
if(!/function showToast\(s\)/.test(js)) throw new Error('showToast missing');
for(const x of ['showToast("搜索内容已置顶")','showToast((delta<0?"上一个":"下一个")+"书籍：','function closeSearchResults()']){if(!js.includes(x)) throw new Error('action toast/close missing: '+x)}
console.log('shelf-search-action-toast-layer-v71279 PASS');
