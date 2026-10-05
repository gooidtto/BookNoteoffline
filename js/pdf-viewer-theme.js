/* BookNote PDF viewer theme bridge. Runs only inside the embedded Read Aloud PDF viewer. */
(function(){
  "use strict";
  var KEY="booknote-pdf-theme-style";
  var COLORS={
    "day-nord":      {bg:"#eceff4",surface:"#f8f9fb"},
    "day-atom":      {bg:"#f3f4f6",surface:"#ffffff"},
    "day-everforest":{bg:"#f3f1e5",surface:"#faf9ee"},
    "day-onehalf":   {bg:"#f5f5f5",surface:"#ffffff"},
    "day-dracula":   {bg:"#f1eff5",surface:"#fbfaff"},
    "night-nord":      {bg:"#242933",surface:"#3b4252"},
    "night-atom":      {bg:"#1e2127",surface:"#282c34"},
    "night-everforest":{bg:"#202724",surface:"#343f44"},
    "night-onehalf":   {bg:"#181a1f",surface:"#282c34"},
    "night-dracula":   {bg:"#100f14",surface:"#282a36"}
  };
  function normalize(st){
    st=st&&typeof st==="object"?st:{};
    var mode=st.themeMode==="night"?"night":"day";
    var name=COLORS[mode+"-"+(st.themeName||"everforest")]?String(st.themeName||"everforest"):"everforest";
    return {themeName:name,themeMode:mode};
  }
  function apply(st){
    st=normalize(st);
    var c=COLORS[st.themeMode+"-"+st.themeName]||COLORS["day-everforest"];
    document.documentElement.dataset.booknoteTheme=st.themeName;
    document.documentElement.dataset.booknoteMode=st.themeMode;
    document.documentElement.style.setProperty("--booknote-pdf-bg",c.bg);
    document.documentElement.style.setProperty("--booknote-pdf-surface",c.surface);
    document.documentElement.style.colorScheme=st.themeMode==="night"?"dark":"light";
    var style=document.getElementById(KEY);
    if(!style){style=document.createElement("style");style.id=KEY;(document.head||document.documentElement).appendChild(style);}
    /* Only the PDF viewer's surrounding/background surfaces are themed. The PDF page canvas itself is left untouched. */
    style.textContent='html,body{background:var(--booknote-pdf-bg)!important}#viewerContainer,#mainContainer,.pdfViewer{background:var(--booknote-pdf-bg)!important}';
  }
  window.addEventListener("message",function(event){
    var d=event&&event.data;
    if(!d||d.type!=="booknote-pdf-theme")return;
    try{apply(d.state||{});}catch(_){ }
  },false);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){apply({themeName:"everforest",themeMode:"day"});},{once:true});
  else apply({themeName:"everforest",themeMode:"day"});
})();
