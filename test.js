const fs=require('fs'), vm=require('vm');
const sandbox={self:{}}; vm.createContext(sandbox); vm.runInContext(fs.readFileSync('js/txt-heading-rules.js','utf8'),sandbox);
const R=sandbox.self.BookNoteTxtHeadingRules;
const samples=[
'\u3000\u3000上一段正文内容足够长，作为前文。\n《红楼梦》\n\u3000\u3000下一段正文内容足够长，作为后文。',
'\u3000\u3000上一段正文内容足够长，作为前文。\n——《红楼梦》\n\u3000\u3000下一段正文内容足够长，作为后文。',
'\u3000\u3000上一段正文内容足够长，作为前文。\n在人心中结局的分量\n\u3000\u3000下一段正文内容足够长，作为后文。',
'\u3000\u3000上一段正文内容足够长，作为前文。\n在人心中：结局的分量\n\u3000\u3000下一段正文内容足够长，作为后文。',
'第一部分 项目定位与版本范围\n1.1 文档目的\n\u3000\u3000正文内容足够长。'
];
for(const x of samples){const a=R.analyze(x); console.log(JSON.stringify(a.headings));}
