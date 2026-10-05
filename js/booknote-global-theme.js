/* BookNote global theme state — single source of truth shared by Home, Shelf and Reader. */
(function(g){
  "use strict";
  var browser=g.browser;
  if(!browser||!browser.storage||!browser.storage.local)return;
  var KEY="booknotePanelState";
  var THEMES={nord:1,atom:1,everforest:1,onehalf:1,dracula:1};
  function normalize(st){
    st=(st&&typeof st==="object")?st:{};
    return {
      themeName:THEMES[st.themeName]?st.themeName:"everforest",
      themeMode:st.themeMode==="night"?"night":"day"
    };
  }
  function getState(){
    return browser.storage.local.get(KEY).then(function(r){return normalize(r[KEY]);});
  }
  function update(patch){
    patch=patch||{};
    return browser.storage.local.get(KEY).then(function(r){
      var st=(r[KEY]&&typeof r[KEY]==="object")?Object.assign({},r[KEY]):{};
      var cur=normalize(st);
      if(patch.themeName!==undefined)st.themeName=THEMES[patch.themeName]?patch.themeName:cur.themeName;
      if(patch.themeMode!==undefined)st.themeMode=patch.themeMode==="night"?"night":"day";
      else if(!THEMES[st.themeName])st.themeName=cur.themeName;
      if(st.themeMode!=="night"&&st.themeMode!=="day")st.themeMode=cur.themeMode;
      return browser.storage.local.set((function(){var o={};o[KEY]=st;return o;})()).then(function(){return normalize(st);});
    });
  }
  function toggleMode(){return getState().then(function(st){return update({themeMode:st.themeMode==="night"?"day":"night"});});}
  function setMode(mode){return update({themeMode:mode});}
  function setTheme(name){return update({themeName:name});}
  g.BookNoteGlobalTheme={key:KEY,normalize:normalize,get:getState,update:update,toggleMode:toggleMode,setMode:setMode,setTheme:setTheme};
})(globalThis);
