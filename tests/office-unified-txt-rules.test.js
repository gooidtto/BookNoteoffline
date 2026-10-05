/* Office -> TXT Structure Rules regression test.
 * This test never changes TXT rules; it verifies the frozen classifier is the
 * single structural authority used by ODT/DOCX synthetic paragraph streams.
 */
const fs=require('fs');
global.self=global;
require('../js/txt-heading-rules.js');
const R=global.BookNoteTxtHeadingRules;
function assert(cond,msg){if(!cond)throw new Error(msg);}
function labels(lines){return R.analyze(lines.join('\n'),{}).headings.map(h=>({level:h.level,label:h.label}));}
let book=labels([
  '',
  '  离线阅读、文档管理、朗读与径向控制器架构说明',
  '  2026-09-06',
  '第一部分 项目定位与版本范围',
  '  1.1 文档目的',
  '  本说明介绍当前架构、主要能力与操作方式。',
  '第二部分 书籍元数据 Metadata',
  '  2.1 书名',
  '  BookNote说明和操作简介',
  '第四部分 正文 Body',
  '  4.1 Part A：Radial Ring UI 控制层',
  '  Radial Ring Lab v1.1.8 是配置驱动的单 Root 径向 UI 原型。'
]);
assert(book.map(x=>x.label).join('|')==='第一部分 项目定位与版本范围|第二部分 书籍元数据 Metadata|第四部分 正文 Body','Office structure diverged from frozen TXT rules');
assert(book.every(x=>x.level===1),'Unexpected Office heading level');
let snow=labels([
  '北凉王府 2025年3月19日',
  '  问题1：游行归来，看时辰也约莫进城了，你不出去看看？',
  '  回复：小王爷猛地抬头。',
  '  正文继续。',
  '  问题2：小二上酒。',
  '  回复：最高纪录是……'
]);
assert(snow.length===3,'Question/reply structure mismatch');
assert(snow[0].level===1 && snow[1].level===2 && snow[2].level===2,'Question levels mismatch');
assert(!snow.some(x=>/^回复：?$/.test(x.label)),'Reply must never be a TOC heading');
console.log('office-unified-txt-rules: PASS');
