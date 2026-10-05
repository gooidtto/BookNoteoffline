/* BookNote P0 document-provider registry.
 * This is intentionally dependency-free so Firefox can load it before the UI refactor.
 * Provider implementations will move format-specific logic out of panel.js incrementally.
 */
(function(global){
  "use strict";
  var formats={
    epub:{id:"epub",mime:"application/epub+zip",extensions:["epub"],stage:"P0-provider"},
    pdf:{id:"pdf",mime:"application/pdf",extensions:["pdf"],stage:"P0-provider"},
    txt:{id:"txt",mime:"text/plain",extensions:["txt"],stage:"P0-provider",encodings:["utf-8","utf-16le","utf-16be","gb18030","gbk","big5"]},
    odt:{id:"odt",mime:"application/vnd.oasis.opendocument.text",extensions:["odt"],stage:"legacy-parser-extract"},
    docx:{id:"docx",mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",extensions:["docx"],stage:"legacy-parser-extract"},
    md:{id:"md",mime:"text/markdown",extensions:["md","markdown"],stage:"P0-provider",encodings:["utf-8","utf-16le","utf-16be","gb18030","gbk","big5"]}
  };
  function identify(file){
    var name=String(file&&file.name||file||""),ext=(name.split(".").pop()||"").toLowerCase();
    return formats[ext]||null;
  }
  global.BookNoteDocumentProviders={
    version:1,
    formats:formats,
    identify:identify,
    list:function(){return Object.keys(formats).map(function(k){return formats[k];});}
  };
})(typeof globalThis!=="undefined"?globalThis:this);
