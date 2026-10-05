(function () {
  "use strict";
  if (window.top !== window) return;
  if (window.__BOOKNOTE_FLOATING_V116__) return;
  window.__BOOKNOTE_FLOATING_V112__ = true;

  // v7.12.94: remove the legacy bottom-corner radial launcher.
  // The selection toolbar is the only web-page action UI.  This cleanup also
  // removes an already-injected radial host when an extension update lands on
  // an existing tab, without touching page-owned controls.
  (function removeLegacyRadialUI(){
    try {
      var legacy = document.getElementById("booknote-floating-ui-v2-host");
      if (legacy) legacy.remove();
      document.querySelectorAll("[data-booknote-radial],[data-radial-level],[data-radial-l3]").forEach(function(el){
        try { el.remove(); } catch (_) {}
      });
    } catch (_) {}
  })();

  var browser = globalThis.browser;
  function bnIcon(name, cls) { return '<img class="bn-content-icon ' + (cls || '') + '" src="' + browser.runtime.getURL("img/ui/" + name + ".png") + '" alt="" aria-hidden="true">'; }
  var toolbar = null;
  var editor = null;
  var currentInfo = null;
  var observer = null;

  // The web selection toolbar follows the same global theme state as Home /
  // Shelf / Reader.  Keep the toolbar self-contained because it is injected
  // into arbitrary web pages and must not inherit the host page CSS.
  var SELECTION_TOOLBAR_THEMES = {
    nord: {
      day:   {bg:"#e5e9f0", fg:"#2e3440", button:"#f8f9fb", border:"#c9d0da", hover:"#dfe5ed", accent:"#5e81ac"},
      night: {bg:"#2e3440", fg:"#eceff4", button:"#3b4252", border:"#4c566a", hover:"#434c5e", accent:"#88c0d0"}
    },
    atom: {
      day:   {bg:"#eef0f3", fg:"#30343b", button:"#ffffff", border:"#d4d8de", hover:"#e9edf1", accent:"#3b82c4"},
      night: {bg:"#21252b", fg:"#abb2bf", button:"#282c34", border:"#3b4048", hover:"#343a44", accent:"#61afef"}
    },
    everforest: {
      day:   {bg:"#edf0df", fg:"#343f44", button:"#faf9ee", border:"#cbd2bf", hover:"#e3e8d9", accent:"#7f9b67"},
      night: {bg:"#272e33", fg:"#d3c6aa", button:"#343f44", border:"#4b565c", hover:"#3b474b", accent:"#a7c080"}
    },
    onehalf: {
      day:   {bg:"#eeeeee", fg:"#30343b", button:"#ffffff", border:"#d3d5d8", hover:"#e9eaec", accent:"#4d8cc8"},
      night: {bg:"#202228", fg:"#d8dee9", button:"#282c34", border:"#454b57", hover:"#383e49", accent:"#61afef"}
    },
    dracula: {
      day:   {bg:"#ebe8f0", fg:"#34313e", button:"#fbfaff", border:"#d4cfe0", hover:"#e9e5ef", accent:"#8a68bd"},
      night: {bg:"#1d1e26", fg:"#f8f8f2", button:"#282a36", border:"#44475a", hover:"#3a3d4f", accent:"#bd93f9"}
    }
  };

  function applySelectionToolbarTheme(){
    if(!toolbar) return;
    var fallback={themeName:"everforest",themeMode:"day"};
    var apply=function(st){
      st=st&&typeof st==="object"?st:fallback;
      var name=SELECTION_TOOLBAR_THEMES[st.themeName]?st.themeName:"everforest";
      var mode=st.themeMode==="night"?"night":"day";
      var t=SELECTION_TOOLBAR_THEMES[name][mode];
      toolbar.setAttribute("data-booknote-theme",name+"-"+mode);
      toolbar.style.setProperty("--bn-sel-bg",t.bg,"important");
      toolbar.style.setProperty("--bn-sel-fg",t.fg,"important");
      toolbar.style.setProperty("--bn-sel-button",t.button,"important");
      toolbar.style.setProperty("--bn-sel-border",t.border,"important");
      toolbar.style.setProperty("--bn-sel-hover",t.hover,"important");
      toolbar.style.setProperty("--bn-sel-accent",t.accent,"important");
      toolbar.style.setProperty("background",t.bg,"important");
      toolbar.style.setProperty("color",t.fg,"important");
      toolbar.querySelectorAll("button").forEach(function(b){
        b.style.setProperty("background",t.button,"important");
        b.style.setProperty("color",t.fg,"important");
        b.style.setProperty("border","1px solid "+t.border,"important");
      });
    };
    try {
      if(globalThis.BookNoteGlobalTheme && BookNoteGlobalTheme.get){
        BookNoteGlobalTheme.get().then(apply).catch(function(){apply(fallback);});
      }else{
        browser.storage.local.get("booknotePanelState").then(function(r){apply(r.booknotePanelState||fallback);}).catch(function(){apply(fallback);});
      }
    } catch (_) { apply(fallback); }
  }

  try {
    browser.storage.onChanged.addListener(function(changes,area){
      if(area!=="local" || !changes.booknotePanelState || !toolbar) return;
      applySelectionToolbarTheme();
    });
  } catch (_) {}

  function host() {
    return document.body || document.documentElement;
  }

  function removeToolbar() {
    if (toolbar) {
      try { toolbar.remove(); } catch (_) {}
      toolbar = null;
    }
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function normalizeNoteText(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sameNoteSource(a, info) {
    return a &&
      normalizeNoteText(a.selectedText) === normalizeNoteText(info.selectionText) &&
      String(a.pageUrl || "") === String(info.pageUrl || "");
  }

  function getBookNoteCategories() {
    return browser.storage.local.get("booknoteCategories").then(function(r) {
      var cats = Array.isArray(r.booknoteCategories) ? r.booknoteCategories.slice() : [];
      if (!cats.length) cats = ["未分类"];
      if (cats.indexOf("未分类") < 0) cats.unshift("未分类");
      return cats;
    });
  }

  function toast(message) {
    var el = document.createElement("div");
    el.textContent = message;
    el.setAttribute("data-booknote-ui", "toast");
    el.style.cssText =
      "all:initial!important;" +
      "position:fixed!important;z-index:2147483647!important;" +
      "right:18px!important;bottom:18px!important;" +
      "display:block!important;padding:9px 13px!important;" +
      "border-radius:8px!important;background:#2f2925!important;color:#fff!important;" +
      "font-family:system-ui,'Microsoft YaHei',sans-serif!important;" +
      "font-size:13px!important;line-height:1.4!important;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.25)!important;" +
      "pointer-events:none!important;";
    host().appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (_) {} }, 1700);
  }

  function getSelectionInfo() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;

    var text = sel.toString().trim();
    if (!text) return null;

    var range = sel.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    return {
      selectionText: text,
      pageUrl: location.href,
      pageTitle: document.title || location.href,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      isEmbeddedFrame: window !== window.top
    };
  }

  function saveNote(action, info) {
    if (action === "note" || action === "summary-note") {
      // Reopen an existing record when the same text on the same page
      // was already saved. This prevents duplicate notes.
      browser.storage.local.get("booknoteNotes").then(function(r){
        var notes=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];
        var existing=null;
        for(var i=notes.length-1;i>=0;i--){
          var n=notes[i];
          if (sameNoteSource(n, info)) {
            existing=n;
            break;
          }
        }
        openEditor(info,existing);
      }).catch(function(){
        openEditor(info,null);
      });
      return;
    }

    // Direct-save action used by the floating "添加到BookNote" button.
    // It records the selected text immediately, without opening the editor.
    if (action === "add") {
      // “网上加入”：把当前网页选区直接保存到 BookNote，避免“打开管理器但没有新增内容”的重复动作。
      browser.storage.local.get("booknoteNotes").then(function(r){
        var notes=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];
        var now=new Date().toISOString();
        var existing=notes.find(function(n){
          return sameNoteSource(n,info);
        });
        if(existing){
          existing.updatedAt=now;
          existing.mode="note";
          return browser.storage.local.set({booknoteNotes:notes}).then(function(){
            toast("🌐 已在 BookNote 中找到相同内容");
          });
        }
        notes.push({
          id:Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),
          selectedText:info.selectionText,
          pageUrl:info.pageUrl,
          pageTitle:info.pageTitle,
          noteText:"",
          category:"网上加入",
          mode:"note",
          favorite:false,
          pinned:false,
          tags:["web"],
          createdAt:now,
          updatedAt:now
        });
        return browser.storage.local.set({booknoteNotes:notes}).then(function(){
          toast("🌐 已加入 BookNote");
        });
      }).catch(function(){toast("网上加入失败");});
      return;
    }

    if (action === "highlight") {
      try {
        var sel = window.getSelection();
        if (sel && sel.rangeCount) {
          var mark = document.createElement("mark");
          mark.className = "booknote-highlight";
          mark.setAttribute("data-booknote", "highlight");
          mark.style.setProperty("background", "#ffe36e", "important");
          sel.getRangeAt(0).surroundContents(mark);
        }
      } catch (_) {}
    }

    browser.storage.local.get("booknoteNotes").then(function (r) {
      var notes = Array.isArray(r.booknoteNotes) ? r.booknoteNotes : [];
      var now = new Date().toISOString();

      notes.push({
        id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
        selectedText: info.selectionText,
        pageUrl: info.pageUrl,
        pageTitle: info.pageTitle,
        noteText: "",
        mode: action,
        favorite: action === "favorite",
        pinned: action === "pin",
        tags: [],
        createdAt: now,
        updatedAt: now
      });

      return browser.storage.local.set({ booknoteNotes: notes });
    }).then(function () {
      toast(
        action === "favorite" ? "⭐ 已收藏并保存" :
        action === "pin" ? "📌 已点赞并保存" :
        "🟡 已高亮并保存"
      );
    }).catch(function () {
      toast("BookNote 保存失败");
    });
  }

  function openEditor(info, existing) {
    removeToolbar();
    if (editor) { try { editor.remove(); } catch (_) {} }

    editor=document.createElement("div");
    editor.setAttribute("data-booknote-ui","editor");
    editor.style.cssText="all:initial!important;position:fixed!important;z-index:2147483647!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:min(580px,calc(100vw - 32px))!important;display:block!important;box-sizing:border-box!important;background:#faf9ee!important;color:#343f44!important;border:1px solid #cbd2bf!important;border-radius:12px!important;padding:16px!important;box-shadow:0 12px 40px rgba(44,53,47,.22)!important;font-family:system-ui,'Microsoft YaHei',sans-serif!important;font-size:14px!important;";
    editor.setAttribute("data-booknote-theme","everforest-day");

    var editing=!!existing;
    var oldCategory=existing && existing.category ? existing.category : "未分类";

    editor.innerHTML=
      "<div style='font-size:17px;font-weight:700;margin-bottom:10px;color:#343f44!important'>"+(editing?"✏️ 编辑 BookNote 摘要笔记":"📝 BookNote 摘要笔记")+"</div>"+
      (editing?"<div style='font-size:12px;color:#7a847e!important;margin-bottom:8px'>已找到之前保存的笔记，将继续编辑，不会新建重复记录。</div>":"")+
      "<div style='font-size:12px;color:#7a847e!important;margin-bottom:5px'>原文摘录（只读）</div>"+
      "<div style='padding:9px;background:#f0f1e4!important;border-left:4px solid #7f9b67!important;border-radius:6px;white-space:pre-wrap;max-height:180px;overflow:auto;color:#4a575b!important'>"+escapeHtml(info.selectionText)+"</div>"+
      "<div style='display:flex;align-items:center;gap:8px;margin:12px 0 7px'>" +
        "<label style='font-size:12px;color:#7a847e!important'>分类管理</label>" +
        "<select id='bn-category' style='font:inherit;font-size:13px;padding:6px 8px;border:1px solid #cbd2bf!important;border-radius:7px;background:#faf9ee!important;color:#343f44!important;min-width:180px'></select>" +
        "<button id='bn-new-category' type='button' style='padding:5px 8px;border:1px solid #cbd2bf!important;border-radius:7px;background:#f0f1e4!important;color:#343f44!important'>＋ 📁 新建分类</button>" +
      "</div>"+
      "<div style='font-size:12px;color:#7a847e!important;margin-bottom:5px'>摘要笔记（可编辑）</div>"+
      "<textarea id='bn-editor-text' placeholder='输入或修改你的笔记……' style='all:initial;display:block!important;width:100%!important;box-sizing:border-box!important;min-height:130px!important;padding:9px!important;border:1px solid #cbd2bf!important;border-radius:8px!important;resize:vertical!important;font-family:system-ui,'Microsoft YaHei',sans-serif!important;font-size:14px!important;color:#343f44!important;background:#faf9ee!important'></textarea>"+
      "<div style='text-align:right;margin-top:10px'><button id='bn-cancel' type='button' style='padding:7px 12px;border:1px solid #cbd2bf!important;border-radius:7px;background:#faf9ee!important;color:#343f44!important'>取消</button>"+
      "<button id='bn-save' type='button' style='padding:7px 12px;border:1px solid #7f9b67!important;border-radius:7px;background:#e3e8d9!important;color:#343f44!important;margin-left:6px'>"+(editing?"💾 保存修改":"💾 保存笔记")+"</button></div>";

    host().appendChild(editor);
    editor.querySelector("#bn-editor-text").value=editing?(existing.noteText||""):"";

    var categorySelect=editor.querySelector("#bn-category");
    function loadCategories(selected){
      return getBookNoteCategories().then(function(cats){
        categorySelect.innerHTML=cats.map(function(c){
          return "<option value='"+escapeHtml(c)+"'>"+escapeHtml(c)+"</option>";
        }).join("");
        var wanted=selected || "未分类";
        if(cats.indexOf(wanted)<0) {
          var opt=document.createElement("option");
          opt.value=wanted; opt.textContent=wanted;
          categorySelect.appendChild(opt);
        }
        categorySelect.value=wanted;
      });
    }
    loadCategories(oldCategory);

    editor.querySelector("#bn-new-category").onclick=function(){
      var name=window.prompt("新建分类名称：");
      if(name===null)return;
      name=name.trim();
      if(!name)return;
      getBookNoteCategories().then(function(cats){
        if(cats.indexOf(name)>=0){categorySelect.value=name;toast("已选择已有分类");return;}
        cats.push(name);
        return browser.storage.local.set({booknoteCategories:cats}).then(function(){
          return loadCategories(name);
        });
      }).catch(function(){toast("分类创建失败");});
    };

    editor.querySelector("#bn-cancel").onclick=function(){
      try{editor.remove();}catch(_){}
      editor=null;
    };

    editor.querySelector("#bn-save").onclick=function(){
      var noteText=editor.querySelector("#bn-editor-text").value;
      var category=categorySelect.value || "未分类";

      browser.storage.local.get("booknoteNotes").then(function(r){
        var notes=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];
        var now=new Date().toISOString();

        if(editing){
          var target=notes.find(function(n){return n.id===existing.id;});
          if(target){
            target.noteText=noteText;
            target.category=category;
            target.mode="note";
            target.categoryType="summary";
            target.sourceType="selection-summary";
            target.summaryMode="selection";
            target.updatedAt=now;
          }else{
            notes.push({
              id:existing.id,
              selectedText:info.selectionText,
              pageUrl:info.pageUrl,
              pageTitle:info.pageTitle,
              noteText:noteText,
              category:category,
              mode:"note",
              categoryType:"summary",
              sourceType:"selection-summary",
              summaryMode:"selection",
              favorite:!!existing.favorite,
              pinned:!!existing.pinned,
              tags:Array.isArray(existing.tags)?existing.tags:[],
              createdAt:existing.createdAt||now,
              updatedAt:now
            });
          }
        }else{
          notes.push({
            id:Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),
            selectedText:info.selectionText,
            pageUrl:info.pageUrl,
            pageTitle:info.pageTitle,
            noteText:noteText,
            category:category,
            mode:"note",
            categoryType:"summary",
            sourceType:"selection-summary",
            summaryMode:"selection",
            favorite:false,
            pinned:false,
            tags:[],
            createdAt:now,
            updatedAt:now
          });
        }
        return browser.storage.local.set({booknoteNotes:notes});
      }).then(function(){
        try{editor.remove();}catch(_){}
        editor=null;
        toast(editing?"💾 笔记修改已保存":"📝 笔记已保存");
      }).catch(function(){toast("BookNote 保存失败");});
    };
  }

  function openPendingBookNote() {
    var hash = String(location.hash || "");
    var marker = "#booknote-edit=";
    var pos = hash.indexOf(marker);
    if (pos !== 0) return;

    var tail = hash.slice(marker.length);
    var directive = tail.indexOf(":~:");
    var idText = directive >= 0 ? tail.slice(0, directive) : tail;
    if (!idText) return;

    var id;
    try { id = decodeURIComponent(idText); } catch (_) { id = idText; }

    browser.storage.local.get("booknoteNotes").then(function (r) {
      var notes = Array.isArray(r.booknoteNotes) ? r.booknoteNotes : [];
      var existing = notes.find(function (n) { return n && String(n.id) === String(id); });
      if (!existing) return;

      // Wait briefly for the document to render before opening the editor.
      setTimeout(function () {
        openEditor({
          selectionText: existing.selectedText || "",
          pageUrl: existing.pageUrl || location.href,
          pageTitle: existing.pageTitle || document.title || location.href
        }, existing);
      }, 250);
    }).catch(function () {});
  }

  function updateReadButtons(status) {
    if (!toolbar) return;
    var toggle=toolbar.querySelector('[data-action="read-toggle"]');
    var stop=toolbar.querySelector('[data-action="read-stop"]');
    if (toggle) toggle.textContent = status === "paused" ? "▶ 继续" : "⏸ 暂停";
    if (stop) stop.disabled = !(status === "speaking" || status === "paused");
  }

  function showToolbar(info) {
    // EPUB 阅读器通常把正文放在 iframe / blob frame。
    // iframe 内渲染浮标容易被阅读器层遮挡，因此把选区交给顶层 Jellyfin 页面渲染。
    if (window !== window.top) {
      try {
        window.top.postMessage({
          type: "booknote-selection",
          info: info,
          frameRect: (function () {
            try {
              if (window.frameElement) {
                var r = window.frameElement.getBoundingClientRect();
                return {left:r.left, top:r.top};
              }
            } catch (_) {}
            return null;
          })()
        }, "*");
      } catch (_) {}
      return;
    }

    removeToolbar();
    currentInfo = info;

    toolbar = document.createElement("div");
    toolbar.setAttribute("data-booknote-ui", "toolbar");
    toolbar.setAttribute("role", "toolbar");

    toolbar.style.cssText =
      "all:initial!important;position:fixed!important;z-index:2147483647!important;" +
      "display:flex!important;align-items:center!important;gap:4px!important;" +
      "padding:6px!important;box-sizing:border-box!important;" +
      "background:var(--bn-sel-bg,#edf0df)!important;color:var(--bn-sel-fg,#343f44)!important;border:1px solid var(--bn-sel-border,#cbd2bf)!important;border-radius:9px!important;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.30)!important;" +
      "font-family:system-ui,'Microsoft YaHei',sans-serif!important;" +
      "font-size:12px!important;line-height:1!important;white-space:nowrap!important;" +
      "pointer-events:auto!important;";

    [
      ["open-booknote",bnIcon("reader")+" 打开 BookNote"],
      ["summary-note",bnIcon("booknote")+" BookNote"],
      ["pin",bnIcon("bookmark")+" 点赞"],
      ["voice-settings",bnIcon("settings")+" 语音设置"],
      ["read-home",bnIcon("reader")+" 从首页朗读所有"],
      ["read-current",bnIcon("reader")+" 从选中位置朗读所有"],
      ["read-selection",bnIcon("reader")+" 朗读所选内容"],
      ["read-toggle",bnIcon("reader")+" 暂停"],
      ["read-stop",bnIcon("reader")+" 停止朗读"]
    ].forEach(function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = item[1];
      b.setAttribute("data-action", item[0]);
      b.style.cssText =
        "all:initial!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;box-sizing:border-box!important;" +
        "border:1px solid var(--bn-sel-border,#cbd2bf)!important;border-radius:7px!important;padding:7px 9px!important;" +
        "cursor:pointer!important;background:var(--bn-sel-button,#faf9ee)!important;color:var(--bn-sel-fg,#343f44)!important;" +
        "font-family:system-ui,'Microsoft YaHei',sans-serif!important;" +
        "font-size:12px!important;line-height:1.2!important;height:32px!important;min-height:32px!important;" +
        "white-space:nowrap!important;margin:0!important;";
      var bi=b.querySelector("img");
      if(bi){bi.style.cssText="width:20px!important;height:20px!important;display:block!important;flex:0 0 20px!important;object-fit:contain!important;";}

      b.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
      }, true);

      b.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
      }, true);

      b.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        var action = b.getAttribute("data-action");

        if (action === "open-booknote") {
          browser.runtime.sendMessage({
            type: "booknote-open-panel",
            selectionText: String(currentInfo && currentInfo.selectionText || ""),
            pageUrl: String(currentInfo && currentInfo.pageUrl || location.href),
            pageTitle: String(currentInfo && currentInfo.pageTitle || document.title || location.href)
          }).catch(function () {
            toast("无法打开 BookNote");
          });
          return;
        }

        if (action === "voice-settings") {
          browser.runtime.sendMessage({type:"booknote-open-voice-settings"}).catch(function () {
            toast("无法打开语音朗读设置");
          });
          return;
        }

        if (action === "read-toggle" || action === "read-stop" ||
            action === "read-home" || action === "read-current" ||
            action === "read-selection") {
          try {
            var synth=window.speechSynthesis;
            if(!synth){toast("系统语音不可用");return;}

            var state=window.__booknoteSpeechState;

            if(action==="read-stop"){
              if(state) state.cancelled=true;
              synth.cancel();
              window.__booknoteSpeechState=null;
              updateReadButtons("idle");
              return;
            }

            if(action==="read-toggle"){
              if(!state || !state.utterance){
                toast("当前没有朗读任务"); return;
              }
              if(state.status==="speaking"){
                synth.pause();
                state.status="paused";
                updateReadButtons("paused");
              }else if(state.status==="paused"){
                synth.resume();
                state.status="speaking";
                updateReadButtons("speaking");
              }
              return;
            }

            if(state) state.cancelled=true;
            synth.cancel();
            window.__booknoteSpeechState=null;

            var selectedText=String(currentInfo&&currentInfo.selectionText||"").trim();
            var sourceFrame=window.__booknoteSelectionFrame||window;

            if((action==="read-selection"||action==="read-current")&&!selectedText){
              toast("请先选中内容"); return;
            }

            function getReadableRoot(win){
              try{
                var d=win&&win.document;
                return d&&(d.body||d.documentElement)||null;
              }catch(_){return null;}
            }

            function stripNonContent(root){
              try{
                root.querySelectorAll(
                  "script,style,noscript,svg,button,input,textarea,"+
                  "[data-booknote-ui],[data-booknote-toolbar],nav,header,footer"
                ).forEach(function(el){el.remove();});
              }catch(_){ }
              return root;
            }

            function normalizeReadText(text){
              return String(text||"").replace(/\s+/g," ").trim();
            }

            function getPageText(win){
              try{
                var root=getReadableRoot(win);
                if(!root)return "";
                var c=root.cloneNode(true);
                stripNonContent(c);
                return normalizeReadText(c.innerText||c.textContent||"");
              }catch(_){return "";}
            }

            // 当前页的正文必须是“当前阅读视口中实际显示的文字”，
            // 不能直接读取整个 EPUB iframe 的 body：epub.js 分页模式下，
            // body 往往包含整章/整篇，而阅读器只是通过 viewport/columns 显示其中一页。
            // 仅供 read-home 使用，避免改变其它朗读模式的原有范围逻辑。
            function getVisiblePageText(win){
              try{
                var d=win&&win.document, root=getReadableRoot(win);
                if(!d||!root)return "";
                var docEl=d.documentElement, body=d.body;
                var vw=(win.innerWidth||docEl.clientWidth||body&&body.clientWidth||0);
                var vh=(win.innerHeight||docEl.clientHeight||body&&body.clientHeight||0);
                if(!vw||!vh)return getPageText(win);

                var walker=d.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                  acceptNode:function(node){
                    try{
                      if(!node.nodeValue||!node.nodeValue.trim())return NodeFilter.FILTER_REJECT;
                      var el=node.parentElement;
                      if(!el)return NodeFilter.FILTER_REJECT;
                      if(el.closest("script,style,noscript,svg,button,input,textarea,[data-booknote-ui],[data-booknote-toolbar],nav,header,footer"))return NodeFilter.FILTER_REJECT;
                      var cs=win.getComputedStyle(el);
                      if(cs.display==="none"||cs.visibility==="hidden")return NodeFilter.FILTER_REJECT;
                      return NodeFilter.FILTER_ACCEPT;
                    }catch(_){return NodeFilter.FILTER_REJECT;}
                  }
                });

                var parts=[];
                var node;
                while((node=walker.nextNode())){
                  var r=d.createRange();
                  r.selectNodeContents(node);
                  var rects=r.getClientRects();
                  var visible=false;
                  for(var i=0;i<rects.length;i++){
                    var x=rects[i];
                    if(x.right>0&&x.bottom>0&&x.left<vw&&x.top<vh){visible=true;break;}
                  }
                  if(visible)parts.push(node.nodeValue);
                }

                var text=normalizeReadText(parts.join(" "));
                return text;
              }catch(_){
                return "";
              }
            }

            function getSelectionOffset(win){
              try{
                var d=win&&win.document;
                var sel=d&&d.getSelection?d.getSelection():null;
                if(!sel||!sel.rangeCount||sel.isCollapsed)return -1;

                var r=sel.getRangeAt(0);
                var root=getReadableRoot(win);
                if(!root||!root.contains(r.startContainer))return -1;

                // 关键：起点必须来自当前阅读 iframe 的真实 DOM Range，
                // 并使用与 getPageText() 完全相同的“去 UI + 空白归一化”规则。
                // 这样导航、按钮、工具栏等非正文节点不会污染偏移量。
                var prefixRange=d.createRange();
                prefixRange.selectNodeContents(root);
                prefixRange.setEnd(r.startContainer,r.startOffset);

                var c=d.createElement("div");
                c.appendChild(prefixRange.cloneContents());
                stripNonContent(c);

                return normalizeReadText(c.innerText||c.textContent||"").length;
              }catch(_){return -1;}
            }

            function resolveReaderFrame(preferred){
              // 先保留当前选区所在 frame；如果阅读器翻页时替换了 iframe，
              // 则从 #bookPlayer 中重新找到当前实际承载正文的 iframe。
              try{
                if(preferred&&preferred.document&&preferred.document.body){
                  var fe=null;
                  try{fe=preferred.frameElement;}catch(_){ }
                  if(!fe||fe.isConnected!==false)return preferred;
                }
              }catch(_){ }

              try{
                var root=document.querySelector("#bookPlayer")||document;
                var frames=root.querySelectorAll("iframe,frame");
                for(var i=frames.length-1;i>=0;i--){
                  try{
                    var w=frames[i].contentWindow;
                    if(w&&w.document&&w.document.body&&getPageText(w))return w;
                  }catch(_){ }
                }
              }catch(_){ }
              return preferred||window;
            }

            function getPageKey(win){
              try{
                var d=win&&win.document;
                var href=(d&&d.location&&d.location.href)||"";
                var frame=win&&win.frameElement;
                var src="";
                try{src=frame&&frame.getAttribute("src")||"";}catch(_){ }
                return href+"|"+src;
              }catch(_){return "";}
            }

            function isUsableNextControl(el){
              try{
                if(!el)return false;
                if(el.disabled||el.hidden)return false;
                if(el.getAttribute("disabled")!==null)return false;
                if(el.getAttribute("aria-disabled")==="true")return false;
                var cs=el.ownerDocument&&el.ownerDocument.defaultView?
                  el.ownerDocument.defaultView.getComputedStyle(el):null;
                if(cs&&(cs.display==="none"||cs.visibility==="hidden"||cs.pointerEvents==="none"))return false;
                var rect=el.getBoundingClientRect();
                if(rect&&rect.width===0&&rect.height===0)return false;
                return true;
              }catch(_){return false;}
            }

            function findFirstPageControl(frameWin){
              // “从首页朗读所有”必须先回到当前阅读内容可识别的首页。
              // 优先接受明确标记的首页/第一页控制，避免误点普通正文按钮。
              var selectors=[
                "button[aria-label='First Page']",
                "button[aria-label='First page']",
                "[role='button'][aria-label='First Page']",
                "[role='button'][aria-label='First page']",
                "button[title='First Page']",
                "button[title='First page']",
                "[role='button'][title='First Page']",
                "[role='button'][title='First page']",
                "button[aria-label*='第一页']",
                "[role='button'][aria-label*='第一页']",
                "button[title*='第一页']",
                "[role='button'][title*='第一页']",
                "button[aria-label*='first page' i]",
                "[role='button'][aria-label*='first page' i]",
                "button[title*='first page' i]",
                "[role='button'][title*='first page' i]",
                "button[data-action='first-page']",
                "button[data-action='first']",
                "[role='button'][data-action='first-page']",
                "[role='button'][data-action='first']",
                "button.first-page",
                "button.firstPage",
                "[role='button'].first-page",
                "[role='button'].firstPage"
              ];

              function findIn(doc,scope){
                if(!doc)return null;
                scope=scope||doc;
                for(var i=0;i<selectors.length;i++){
                  try{
                    var el=scope.querySelector(selectors[i]);
                    if(el && !el.hidden && el.getAttribute('aria-disabled')!=='true')return el;
                  }catch(_){ }
                }
                try{
                  var candidates=scope.querySelectorAll(
                    "button[class*='first' i],button[id*='first' i],"+
                    "[role='button'][class*='first' i],[role='button'][id*='first' i],"+
                    "button[aria-label*='第一页'],[role='button'][aria-label*='第一页'],"+
                    "button[title*='第一页'],[role='button'][title*='第一页']"
                  );
                  for(var j=0;j<candidates.length;j++){
                    var el2=candidates[j];
                    if(!el2 || el2.hidden || el2.getAttribute('aria-disabled')==='true')continue;
                    var label=((el2.getAttribute('aria-label')||'')+' '+(el2.getAttribute('title')||'')+' '+(el2.textContent||'')).trim();
                    // class/id 中含 first 但实际显示“Home/首页”的控件可能是退出阅读器的书库入口。
                    if(/^(home|首页|书库|library)$/i.test(label))continue;
                    if(/首页/.test(label) && !/第一页/.test(label))continue;
                    return el2;
                  }
                }catch(_){ }
                return null;
              }

              try{
                var topDoc=document;
                var topFirst=findIn(topDoc,topDoc);
                if(topFirst)return topFirst;
              }catch(_){ }

              try{
                var frameFirst=findIn(frameWin&&frameWin.document);
                if(frameFirst)return frameFirst;
              }catch(_){ }
              return null;
            }

            function isFirstPageControlDisabled(frameWin){
              var selectors=[
                "button[aria-label='First Page']","button[aria-label='First page']",
                "[role='button'][aria-label='First Page']","[role='button'][aria-label='First page']",
                "button[title='First Page']","button[title='First page']",
                "[role='button'][title='First Page']","[role='button'][title='First page']",
                "button[aria-label*='首页']","[role='button'][aria-label*='首页']",
                "button[title*='首页']","[role='button'][title*='首页']",
                "button.first-page","button.firstPage","[role='button'].first-page","[role='button'].firstPage"
              ];
              function findDisabled(doc,scope){
                if(!doc)return false;
                scope=scope||doc;
                for(var i=0;i<selectors.length;i++){
                  try{
                    var el=scope.querySelector(selectors[i]);
                    if(el && (el.disabled || el.getAttribute('disabled')!==null || el.getAttribute('aria-disabled')==='true'))return true;
                  }catch(_){ }
                }
                return false;
              }
              try{
                if(findDisabled(document,document))return true;
              }catch(_){ }
              try{return findDisabled(frameWin&&frameWin.document);}catch(_){return false;}
            }

            function findPreviousPageControl(frameWin){
              // 首页按钮不是必须存在：如果只有“上一页”控制，则逐页回退，
              // 直到上一页明确不可用，从而严格抵达第一页，而不是猜测其它控件。
              var selectors=[
                "button[aria-label='Previous Page']","button[aria-label='Previous page']",
                "[role='button'][aria-label='Previous Page']","[role='button'][aria-label='Previous page']",
                "button[title='Previous Page']","button[title='Previous page']",
                "[role='button'][title='Previous Page']","[role='button'][title='Previous page']",
                "button[aria-label*='上一页']","[role='button'][aria-label*='上一页']",
                "button[title*='上一页']","[role='button'][title*='上一页']",
                "button[data-action='previous-page']","button[data-action='previous']",
                "[role='button'][data-action='previous-page']","[role='button'][data-action='previous']",
                "button.prev-page","button.prevPage","[role='button'].prev-page","[role='button'].prevPage"
              ];
              function findIn(doc,scope){
                if(!doc)return null; scope=scope||doc;
                for(var i=0;i<selectors.length;i++){
                  try{var el=scope.querySelector(selectors[i]);if(isUsableNextControl(el))return el;}catch(_){ }
                }
                try{
                  var c=scope.querySelectorAll(
                    "button[class*='prev' i],button[id*='prev' i],[role='button'][class*='prev' i],[role='button'][id*='prev' i],"+
                    "button[aria-label*='Previous' i],[role='button'][aria-label*='Previous' i],"+
                    "button[title*='Previous' i],[role='button'][title*='Previous' i],"+
                    "button[aria-label*='上一页'],[role='button'][aria-label*='上一页'],button[title*='上一页'],[role='button'][title*='上一页']");
                  for(var j=0;j<c.length;j++)if(isUsableNextControl(c[j]))return c[j];
                }catch(_){ }
                return null;
              }
              try{
                var bp=document.querySelector('#bookPlayer');
                var el=findIn(document,bp||document); if(el)return el;
                if(bp)return null;
              }catch(_){ }
              try{return findIn(frameWin&&frameWin.document);}catch(_){return null;}
            }

            function isPreviousPageControlDisabled(frameWin){
              var selectors=[
                "button[aria-label='Previous Page']","button[aria-label='Previous page']",
                "[role='button'][aria-label='Previous Page']","[role='button'][aria-label='Previous page']",
                "button[title='Previous Page']","button[title='Previous page']",
                "[role='button'][title='Previous Page']","[role='button'][title='Previous page']",
                "button[aria-label*='上一页']","[role='button'][aria-label*='上一页']",
                "button[title*='上一页']","[role='button'][title*='上一页']",
                "button.prev-page","button.prevPage","[role='button'].prev-page","[role='button'].prevPage"
              ];
              function find(doc,scope){
                if(!doc)return false; scope=scope||doc;
                for(var i=0;i<selectors.length;i++)try{
                  var el=scope.querySelector(selectors[i]);
                  if(el)return !!(el.disabled||el.getAttribute('disabled')!==null||el.getAttribute('aria-disabled')==='true');
                }catch(_){ }
                return false;
              }
              try{var bp=document.querySelector('#bookPlayer');if(find(document,bp||document))return true;if(bp)return false;}catch(_){ }
              try{return find(frameWin&&frameWin.document);}catch(_){return false;}
            }

            function findNextPageControl(frameWin){
              // 只允许“明确的下一页控制”。优先找阅读器顶层控制，
              // 再找当前 iframe 内明确标记的控制；不把普通正文链接当成翻页按钮。
              var selectors=[
                "button[aria-label='Next Page']",
                "button[aria-label='Next page']",
                "[role='button'][aria-label='Next Page']",
                "[role='button'][aria-label='Next page']",
                "button[title='Next Page']",
                "button[title='Next page']",
                "[role='button'][title='Next Page']",
                "[role='button'][title='Next page']",
                "button[aria-label*='下一页']",
                "[role='button'][aria-label*='下一页']",
                "button[title*='下一页']",
                "[role='button'][title*='下一页']",
                "button[data-action='next-page']",
                "button[data-action='next']",
                "[role='button'][data-action='next-page']",
                "[role='button'][data-action='next']",
                "button.next-page",
                "button.nextPage",
                "[role='button'].next-page",
                "[role='button'].nextPage"
              ];

              function findIn(doc,scope){
                if(!doc)return null;
                scope=scope||doc;
                for(var i=0;i<selectors.length;i++){
                  try{
                    var el=scope.querySelector(selectors[i]);
                    if(isUsableNextControl(el))return el;
                  }catch(_){ }
                }

                // 部分阅读界面的按钮可能只有 next 类名。
                // 仅接受 button / role=button，避免误点正文中的“next”链接。
                try{
                  var candidates=scope.querySelectorAll(
                    "button[class*='next'],"+
                    "button[id*='next'],"+
                    "[role='button'][class*='next'],"+
                    "[role='button'][id*='next'],"+
                    "button[aria-label*='Next' i],"+
                    "[role='button'][aria-label*='Next' i],"+
                    "button[title*='Next' i],"+
                    "[role='button'][title*='Next' i],"+
                    "button[aria-label*='下一页'],"+
                    "[role='button'][aria-label*='下一页'],"+
                    "button[title*='下一页'],"+
                    "[role='button'][title*='下一页']"
                  );
                  for(var j=0;j<candidates.length;j++){
                    if(isUsableNextControl(candidates[j]))return candidates[j];
                  }
                }catch(_){ }
                return null;
              }

              // 优先检查明确的阅读控制容器；没有时再检查页面本身。
              // 若该容器存在，只在它里面寻找下一页，绝不误触其它页面的 Next。
              try{
                var topDoc=document;
                var topNext=findIn(topDoc,topDoc);
                if(topNext)return topNext;
              }catch(_){ }

              // 某些阅读界面把明确的翻页控制放在当前内容 frame 内。
              try{
                var frameNext=findIn(frameWin&&frameWin.document);
                if(frameNext)return frameNext;
              }catch(_){ }

              return null;
            }

            function makeUtterance(text,win,settings) {
              var u=new SpeechSynthesisUtterance(text);
              settings=settings||{};
              var vs=synth.getVoices?synth.getVoices():[],lang="";
              try{lang=(win.document.documentElement&&win.document.documentElement.lang)||"";}catch(_){ }
              if(lang)u.lang=lang;

              var selected=settings.voiceName||"";
              var chosen=null;
              if(selected){
                chosen=vs.find(function(v){
                  return v && (
                    String(v.voiceName||"")===selected ||
                    String(v.name||"")===selected
                  );
                });
              }
              if(!chosen && lang){
                chosen=vs.find(function(v){
                  return v && String(v.lang||"").toLowerCase()
                    .indexOf(String(lang).toLowerCase())===0 &&
                    v.localService;
                });
              }
              if(!chosen) chosen=vs.find(function(v){return v&&v.localService;});
              if(chosen)u.voice=chosen;

              var rate=Number(settings.rate);
              var pitch=Number(settings.pitch);
              var volume=Number(settings.volume);
              if(isFinite(rate) && rate>0)u.rate=rate;
              if(isFinite(pitch) && pitch>=0)u.pitch=pitch;
              if(isFinite(volume) && volume>=0)u.volume=Math.min(1,volume);
              return u;
            }

            
document.addEventListener("selectionchange",function(){
  try{
    var roots=document.querySelectorAll(".note.imported-document-card .imported-document-text, .note.imported-document-card [contenteditable='true']");
    for(var i=0;i<roots.length;i++){
      var root=roots[i], snap=booknoteImportedRangeSnapshot(root);
      if(snap){
        var card=root.closest(".imported-document-card");
        if(card) card.__booknoteImportedRange=snap;
      }
    }
  }catch(e){}
},true);


/* V7.9.80 TRUE DOM RANGE
 * 导入文档选区的唯一坐标来源：真实 DOM Range。
 */
function booknoteImportedRangeSnapshot(root){
  if(!root) return null;
  var sel=null;
  try{
    var d=root.ownerDocument||document;
    sel=d.getSelection?d.getSelection():null;
  }catch(e){}
  if((!sel||!sel.rangeCount)&&window.__booknoteSelectionFrame){
    try{
      var f=window.__booknoteSelectionFrame;
      var d2=f.contentDocument||(f.contentWindow&&f.contentWindow.document);
      if(d2&&d2.getSelection) sel=d2.getSelection();
    }catch(e){}
  }
  if(!sel||!sel.rangeCount) return null;
  var r;
  try{r=sel.getRangeAt(0).cloneRange();}catch(e){return null;}
  if(!root.contains(r.startContainer)||!root.contains(r.endContainer)) return null;
  var a=root.ownerDocument.createRange(), b=root.ownerDocument.createRange();
  var start=0,end=0;
  try{
    a.selectNodeContents(root); a.setEnd(r.startContainer,r.startOffset);
    start=a.toString().length;
    b.selectNodeContents(root); b.setEnd(r.endContainer,r.endOffset);
    end=b.toString().length;
  }catch(e){return null;}
  if(end<start){var t=start;start=end;end=t;}
  return {range:r,startOffset:start,endOffset:end,text:r.toString()};
}

function booknoteImportedReadPayload(root,mode){
  var snap=booknoteImportedRangeSnapshot(root);
  var full=root.innerText!=null?root.innerText:root.textContent||"";
  if(!snap) return null;
  if(mode==="selection"){
    return {text:snap.text,startOffset:snap.startOffset,endOffset:snap.endOffset,range:snap.range};
  }
  return {text:full.slice(snap.startOffset),startOffset:snap.startOffset,endOffset:full.length,range:snap.range};
}

function readSettings() {
              return browser.storage.local.get(["voiceName","rate","pitch","volume"]).then(function(r){
                return {
                  voiceName:r.voiceName||"",
                  rate:Number(r.rate)||1,
                  pitch:typeof r.pitch==="number"?r.pitch:1,
                  volume:typeof r.volume==="number"?r.volume:1
                };
              });
            }

            // 朗读范围定义：
            // read-home    = 自动识别首页，从首页正文开头开始，逐页朗读到最后一页。
            // read-current = 从当前选中位置开始，先读当前页剩余内容，再逐页到最后。
            // read-selection = 仅朗读当前选区，绝不翻页。
            // 朗读只读取当前内容页面的正文 DOM；不读取父页面导航/UI。
            function begin(mode,detectedFrame){
              var frame=detectedFrame||window.__booknoteSelectionFrame||sourceFrame||window;
              var pagedHome=false;
              if(mode==="read-home"){
                // 只有确认存在明确“下一页”控制时，才按分页视口读取；
                // 没有分页时直接读取当前内容正文全文，避免只读首屏。
                pagedHome=!!findNextPageControl(frame);
              }
              var text=(mode==="read-home"&&pagedHome)?getVisiblePageText(frame):getPageText(frame);
              if(mode==="read-home"&&!text)text=getPageText(frame);
              if(!text){
                toast("无法识别当前正文内容，已停止朗读");return;
              }

              if(mode==="read-selection"){
                if(!selectedText){toast("请先选中内容");return;}
                text=selectedText;
              }

              if(mode==="read-current"){
                if(!selectedText){toast("请先选中内容");return;}
                var pos=getSelectionOffset(frame);
                if(pos<0||pos>text.length){
                  toast("无法确认选中位置，已拒绝朗读");return;
                }
                // 严格从当前选中位置开始；当前页之前的正文绝不朗读。
                text=text.slice(pos).trim();
                if(!text){
                  toast("选中位置之后没有可朗读正文");return;
                }
              }

              var st={
                mode:mode,
                sourceFrame:frame,
                selectionText:selectedText,
                status:"speaking",
                cancelled:false,
                utterance:null,
              };
              window.__booknoteSpeechState=st;

              function reset(){
                if(window.__booknoteSpeechState===st)window.__booknoteSpeechState=null;
                updateReadButtons("idle");
              }

              function speakPage(pageText,pageFrame){
                var cur=window.__booknoteSpeechState;
                if(!cur||cur.cancelled)return;

                readSettings().then(function(settings){
                  var live=window.__booknoteSpeechState;
                  if(!live||live!==cur||live.cancelled)return;

                  if(!synth){
                    reset();
                    toast("系统语音不可用");
                    return;
                  }

                  var u=makeUtterance(pageText,pageFrame,settings);
                  cur.utterance=u;
                  cur.sourceFrame=pageFrame;
                  cur.status="speaking";
                  updateReadButtons("speaking");

                  u.onend=nextPage;
                  u.onerror=reset;
                  synth.speak(u);
                }).catch(function(){reset();});
              }

              function nextPage(){
                var cur=window.__booknoteSpeechState;
                if(!cur||cur.cancelled)return;

                // “朗读所选内容”是封闭范围：完成当前 utterance 后立即结束。
                if(cur.mode==="read-selection"){reset();return;}

                var frameBefore=cur.sourceFrame||frame||window;
                var beforeText=getPageText(frameBefore);
                var beforeKey=getPageKey(frameBefore);
                var next=findNextPageControl(frameBefore);

                // 到达最后一页时阅读器通常会把“下一页”置为 disabled。
                // 此时立即结束，不再点击空导航或等待超时。
                if(!next || next.disabled ||
                   next.getAttribute("disabled")!==null ||
                   next.getAttribute("aria-disabled")==="true"){
                  reset();return;
                }

                // 点击前记录当前阅读 frame / document。翻页后必须确认阅读内容
                // 或 frame 身份真正发生变化，才能开始下一页，避免重复朗读上一页。
                var beforeDoc=null;
                try{beforeDoc=frameBefore&&frameBefore.document||null;}catch(_){ }

                try{
                  next.click();
                }catch(_){
                  reset();return;
                }

                var tries=0;
                function waitForNextPage(){
                  var live=window.__booknoteSpeechState;
                  if(!live||live!==cur||live.cancelled)return;

                  var frame2=resolveReaderFrame(window.__booknoteSelectionFrame||frameBefore);
                  var text2=(cur.mode==="read-home")?getVisiblePageText(frame2):getPageText(frame2);
                  var key2=getPageKey(frame2);
                  var doc2=null;
                  try{doc2=frame2&&frame2.document||null;}catch(_){ }

                  var changed = !!text2 && (
                    text2!==beforeText ||
                    key2!==beforeKey ||
                    doc2!==beforeDoc ||
                    frame2!==frameBefore
                  );

                  if(changed){
                    cur.sourceFrame=frame2;
                    speakPage(text2,frame2);
                    return;
                  }

                  tries++;
                  if(tries>=48){
                    // 8*0.25s 后仍无法确认新正文：宁可停止，也绝不越界朗读。
                    reset();
                    return;
                  }
                  setTimeout(waitForNextPage,250);
                }
                setTimeout(waitForNextPage,250);
              }

              speakPage(text,frame);
            }

            if(action==="read-home"){
              // “从首页朗读所有”不绑定任何特定阅读器或文档格式。
              // 优先使用当前阅读内容明确提供的“第一页”分页控制；其次使用“上一页”逐页回退；
              // 如果页面没有分页控制，则把当前内容视为唯一页面，并从正文开头开始。
              var homeFrame=resolveReaderFrame(window.__booknoteSelectionFrame||sourceFrame||window);

              function scrollContentToStart(f){
                try{
                  if(f&&typeof f.scrollTo==="function")f.scrollTo(0,0);
                  if(f&&f.document){
                    var de=f.document.documentElement, bo=f.document.body;
                    if(de)de.scrollTop=0;
                    if(bo)bo.scrollTop=0;
                  }
                }catch(_){ }
              }

              function beginDetectedHome(f){
                scrollContentToStart(f);
                setTimeout(function(){
                  var live=window.__booknoteSpeechState;
                  if(live&&live.cancelled)return;
                  var ff=resolveReaderFrame(f||homeFrame);
                  // 首页必须从正文开头开始：有分页时取首页当前视口正文，
                  // 无分页时 begin() 会使用当前内容页正文全文。
                  begin("read-home",ff);
                },80);
              }

              // 允许 begin() 接收已识别的内容 frame，但不改变其它朗读模式。
              var first=findFirstPageControl(homeFrame);
              if(first){
                var firstDisabled=false;
                try{firstDisabled=!!(first.disabled||first.getAttribute('disabled')!==null||first.getAttribute('aria-disabled')==='true');}catch(_){ }
                if(firstDisabled){beginDetectedHome(homeFrame);return;}

                var beforeDoc=null;try{beforeDoc=homeFrame.document||null;}catch(_){ }
                var beforeKey=getPageKey(homeFrame), beforeText=getVisiblePageText(homeFrame), tries=0;
                try{first.click();}catch(_){beginDetectedHome(homeFrame);return;}
                function waitForHomeButton(){
                  var live=window.__booknoteSpeechState;
                  if(live&&live.cancelled)return;
                  var f=resolveReaderFrame(homeFrame), t=getVisiblePageText(f), k=getPageKey(f), d=null;
                  try{d=f.document||null;}catch(_){ }
                  var changed=!!t&&(k!==beforeKey||d!==beforeDoc||f!==homeFrame||t!==beforeText);
                  if(changed||isFirstPageControlDisabled(f)){beginDetectedHome(f);return;}
                  if(++tries>=48){
                    // 控件点击成功但无法可靠确认变化时，不猜测页码；回退到内容起点。
                    beginDetectedHome(f);return;
                  }
                  setTimeout(waitForHomeButton,250);
                }
                setTimeout(waitForHomeButton,250);return;
              }

              // 没有首页按钮时，使用“上一页”逐页回退到第一页。
              var prev=findPreviousPageControl(homeFrame);
              if(prev){
                var backTries=0;
                function moveHomeByPrevious(){
                  var f=resolveReaderFrame(homeFrame);
                  var disabled=isPreviousPageControlDisabled(f);
                  var p=findPreviousPageControl(f);
                  if(disabled||!p){beginDetectedHome(f);return;}
                  var oldText=getVisiblePageText(f),oldKey=getPageKey(f),oldDoc=null;
                  try{oldDoc=f.document||null;}catch(_){ }
                  try{p.click();}catch(_){beginDetectedHome(f);return;}
                  var wait=0;
                  function waitBack(){
                    var ff=resolveReaderFrame(f),tt=getVisiblePageText(ff),kk=getPageKey(ff),dd=null;
                    try{dd=ff.document||null;}catch(_){ }
                    var changed=!!tt&&(tt!==oldText||kk!==oldKey||dd!==oldDoc||ff!==f);
                    if(changed){backTries=0;setTimeout(moveHomeByPrevious,50);return;}
                    if(++wait>=48){beginDetectedHome(ff);return;}
                    setTimeout(waitBack,250);
                  }
                  setTimeout(waitBack,250);
                }
                moveHomeByPrevious();return;
              }

              // 没有任何分页控制：自动把当前内容识别为单页内容，并从正文起点开始。
              beginDetectedHome(homeFrame);return;
            }

            begin(action);
          }catch(_){toast("朗读失败");}
          return;
        }

        if (action === "remove-highlight") {
          try {
            var sel = window.getSelection();
            if (sel && sel.rangeCount) {
              var node = sel.anchorNode;
              var mark = node && node.nodeType === 1 ? node.closest("mark[data-booknote='highlight']") :
                (node && node.parentElement ? node.parentElement.closest("mark[data-booknote='highlight']") : null);
              if (mark) {
                mark.replaceWith.apply(mark, Array.from(mark.childNodes));
              }
            }
          } catch (_) {}
          removeToolbar();
          return;
        }

        saveNote(action, currentInfo);
        if (action !== "note" && action !== "summary-note") removeToolbar();
      }, true);

      toolbar.appendChild(b);
    });

    toolbar.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    }, true);

    host().appendChild(toolbar);
    applySelectionToolbarTheme();

    // Force layout before positioning.
    var r = toolbar.getBoundingClientRect();
    var width = r.width || 270;
    var height = r.height || 38;
    var left = info.left + (info.right - info.left) / 2 - width / 2;
    var top = info.top - height - 8;

    if (top < 6) top = info.bottom + 8;
    if (left < 6) left = 6;
    if (left + width > window.innerWidth - 6) {
      left = Math.max(6, window.innerWidth - width - 6);
    }

    toolbar.style.setProperty("left", Math.round(left) + "px", "important");
    toolbar.style.setProperty("top", Math.round(top) + "px", "important");
  }

  function refreshToolbar() {
    if (!toolbar || !currentInfo) return;
    var info = getSelectionInfo();
    if (info) showToolbar(info);
  }

  function checkSelection() {
    if (editor) return;
    var info = getSelectionInfo();
    if (info) {
      showToolbar(info);
    }
  }


  function findSavedTextRange(target) {
    target=String(target||"").replace(/\s+/g," ").trim();
    if(!target || !document.body) return null;
    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    var nodes=[], full="", node;
    while((node=walker.nextNode())){
      if(!node.nodeValue || !node.nodeValue.trim()) continue;
      var norm=node.nodeValue.replace(/\s+/g," ");
      nodes.push({node:node,start:full.length,norm:norm});
      full+=norm;
      if(full.length>3000000) break;
    }
    var pos=full.indexOf(target);
    var needle=target;
    if(pos<0){ needle=target.slice(0,Math.min(120,target.length)); pos=full.indexOf(needle); }
    if(pos<0) return null;
    var endPos=pos+needle.length, a=null,b=null;
    for(var i=0;i<nodes.length;i++){
      var st=nodes[i].start, en=st+nodes[i].norm.length;
      if(!a && pos>=st && pos<=en) a={n:nodes[i].node,o:Math.min(nodes[i].node.nodeValue.length,Math.max(0,pos-st))};
      if(a && endPos>=st && endPos<=en){b={n:nodes[i].node,o:Math.min(nodes[i].node.nodeValue.length,Math.max(0,endPos-st))};break;}
    }
    if(!a)return null;
    if(!b)b=a;
    try{
      var r=document.createRange(); r.setStart(a.n,a.o); r.setEnd(b.n,b.o); return r;
    }catch(_){return null;}
  }

  // EPUB/Jellyfin iframe 选区桥接：
  // 子 frame 负责读取 window.getSelection()，顶层页面负责显示浮动按钮。
  if (window === window.top) {
    window.addEventListener("message", function (event) {
      var msg = event && event.data;
      if (!msg || msg.type !== "booknote-selection") return;
      if (!msg.info || !msg.info.selectionText) return;

      var info = msg.info;
      var sourceFrame = null;
      window.__booknoteSelectionFrame = event.source || null;

      try {
        var frames = document.querySelectorAll("iframe, frame");
        for (var i = 0; i < frames.length; i++) {
          if (frames[i].contentWindow === event.source) {
            sourceFrame = frames[i];
            break;
          }
        }
      } catch (_) {}

      // 选区矩形原本是相对于 iframe viewport 的；
      // 找到对应 iframe 后转换为顶层 viewport 坐标。
      if (sourceFrame) {
        try {
          var fr = sourceFrame.getBoundingClientRect();
          info.left += fr.left;
          info.right += fr.left;
          info.top += fr.top;
          info.bottom += fr.top;
        } catch (_) {}
      } else if (msg.frameRect) {
        info.left += Number(msg.frameRect.left) || 0;
        info.right += Number(msg.frameRect.left) || 0;
        info.top += Number(msg.frameRect.top) || 0;
        info.bottom += Number(msg.frameRect.top) || 0;
      }

      info.isEmbeddedFrame = true;
      showToolbar(info);
    }, true);
  }


  // V5.4：Jellyfin 的 Book Player 基于 epub.js，会动态创建/切换阅读 iframe。
  // 不再只依赖 content-script 是否成功注入子 frame；顶层直接监听可访问的 iframe。
  if (window === window.top) {
    var hookedSelectionFrames = new WeakSet();

    function selectionInfoFromDocument(doc, frameEl) {
      try {
        var sel = doc.defaultView && doc.defaultView.getSelection ?
          doc.defaultView.getSelection() : null;
        if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
        var text = String(sel.toString() || "").trim();
        if (!text) return null;
        var range = sel.getRangeAt(0);
        var rr = range.getBoundingClientRect();
        if (!rr || (rr.width === 0 && rr.height === 0)) return null;

        var fr = frameEl.getBoundingClientRect();
        return {
          selectionText: text,
          pageUrl: (doc.location && doc.location.href) || location.href,
          pageTitle: doc.title || location.href,
          left: rr.left + fr.left,
          top: rr.top + fr.top,
          right: rr.right + fr.left,
          bottom: rr.bottom + fr.top,
          isEmbeddedFrame: true
        };
      } catch (_) {
        return null;
      }
    }

    function hookSelectionFrame(frame) {
      if (!frame || hookedSelectionFrames.has(frame)) return;
      hookedSelectionFrames.add(frame);

      function attach() {
        try {
          var doc = frame.contentDocument;
          if (!doc) return;

          var check = function () {
            setTimeout(function () {
              var info = selectionInfoFromDocument(doc, frame);
              if (info) {
                window.__booknoteSelectionFrame = frame.contentWindow || null;
                showToolbar(info);
              }
              try { hookAllSelectionFrames(doc); } catch (_) {}
            }, 25);
          };

          doc.addEventListener("mouseup", check, true);
          doc.addEventListener("keyup", check, true);
          doc.addEventListener("selectionchange", check, true);
        } catch (_) {
          // Cross-origin/opaque frame: the child content script bridge remains
          // responsible when Firefox can inject it.
        }
      }

      frame.addEventListener("load", attach, true);
      attach();
    }

    function hookAllSelectionFrames(root) {
      try {
        root.querySelectorAll("iframe,frame").forEach(hookSelectionFrame);
      } catch (_) {}
    }

    hookAllSelectionFrames(document);

    try {
      var frameObserver = new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.tagName === "IFRAME" || node.tagName === "FRAME") {
              hookSelectionFrame(node);
            } else {
              try {
                if (node.querySelector && node.querySelector("iframe,frame")) hookAllSelectionFrames(node);
              } catch (_) {}
            }
          });
        });
      });
      frameObserver.observe(document.documentElement, {childList:true, subtree:true});
    } catch (_) {}
  }

  // iframe 选区取消时，通知顶层移除浮标。
  if (window !== window.top) {
    document.addEventListener("selectionchange", function () {
      setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          try {
            window.top.postMessage({type:"booknote-selection-clear"}, "*");
          } catch (_) {}
        }
      }, 100);
    }, true);
  } else {
    window.addEventListener("message", function (event) {
      if (event && event.data && event.data.type === "booknote-selection-clear") {
        if (!(window.__booknoteSpeechState && window.speechSynthesis &&
              (window.speechSynthesis.speaking || window.speechSynthesis.paused))) {
          removeToolbar();
        }
      }
    }, true);
  }

  browser.runtime.onMessage.addListener(function(msg){
    if(!msg || msg.type!=="booknote-get-page-snapshot") return;
    try{
      var body=document.body||document.documentElement;
      var source=body;
      // 优先取 article/main/正文区域，只有找不到足够文本时才回退到整个 body。
      try{
        var candidates=Array.prototype.slice.call(document.querySelectorAll("article,main,[role='main'],.article,.post,.entry-content,.article-content,.post-content,.content"));
        var best=null,bestScore=0;
        candidates.forEach(function(el){
          var t=String(el.innerText||el.textContent||"").trim();
          if(t.length>bestScore){best=el;bestScore=t.length;}
        });
        if(best&&bestScore>=500)source=best;
      }catch(_){}
      var clone=source?source.cloneNode(true):null;
      if(!clone)return Promise.reject(new Error("页面正文为空"));
      clone.querySelectorAll("script,style,noscript,iframe,object,embed,canvas,svg,button,input,textarea,select,nav,header,footer,aside,form,[data-booknote-ui]").forEach(function(el){try{el.remove();}catch(_){} });
      var title=document.title||location.href;
      var text=String(clone.innerText||clone.textContent||"").replace(/\s+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
      var html=String(clone.innerHTML||"").trim();
      if(!text) text=String(document.body&&document.body.innerText||"").replace(/\s+/g," ").trim();
      if(!text)return Promise.reject(new Error("未读取到网页正文"));
      return Promise.resolve({url:location.href,title:title,text:text,html:html});
    }catch(e){return Promise.reject(e);}
  });

  browser.runtime.onMessage.addListener(function(msg){
    if(!msg || msg.type!=="booknote-open-note-editor") return;
    var selectionText=String(msg.selectionText||"").trim();
    if(!selectionText){toast("请先选中内容");return;}
    var info={
      selectionText:selectionText,
      pageUrl:String(msg.pageUrl||location.href),
      pageTitle:String(msg.pageTitle||document.title||location.href)
    };
    return browser.storage.local.get("booknoteNotes").then(function(r){
      var notes=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];
      var existing=null;
      for(var i=notes.length-1;i>=0;i--){
        if(sameNoteSource(notes[i],info)){existing=notes[i];break;}
      }
      openEditor(info,existing);
    }).catch(function(){
      openEditor(info,null);
    });
  });

  browser.runtime.onMessage.addListener(function(msg){
    if(!msg || msg.type!=="booknote-open-existing") return;
    return browser.storage.local.get("booknoteNotes").then(function(r){
      var notes=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];
      var existing=null;
      if(msg.noteId) existing=notes.find(function(n){return n.id===msg.noteId;})||null;
      if(!existing && msg.selectedText){
        existing=notes.find(function(n){
          return String(n.pageUrl||"")===String(location.href) &&
            String(n.selectedText||"").replace(/\s+/g," ").trim()===String(msg.selectedText||"").replace(/\s+/g," ").trim();
        })||null;
      }
      var range=findSavedTextRange(msg.selectedText);
      if(range){
        try{
          var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
          var rr=range.getBoundingClientRect();
          window.scrollTo({top:Math.max(0,window.scrollY+rr.top-window.innerHeight*0.35),behavior:"smooth"});
        }catch(_){}
      }
      if(existing){
        setTimeout(function(){
          openEditor({
            selectionText:existing.selectedText,
            pageUrl:existing.pageUrl,
            pageTitle:existing.pageTitle
          },existing);
        },500);
      }else{
        toast(range?"已定位原文，但未找到对应笔记":"已打开原文，但未找到保存的文字");
      }
    });
  });

  document.addEventListener("mouseup", function (e) {
    if (toolbar && toolbar.contains(e.target)) return;
    setTimeout(checkSelection, 30);
  }, true);

  document.addEventListener("keyup", function () {
    setTimeout(checkSelection, 30);
  }, true);

  document.addEventListener("selectionchange", function () {
    setTimeout(function () {
      if (!editor) {
        var info = getSelectionInfo();
        if (info) showToolbar(info);
      }
    }, 80);
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (window !== window.top) {
      try { window.top.postMessage({type:"booknote-selection-clear"}, "*"); } catch (_) {}
    }
    if (toolbar && toolbar.contains(e.target)) return;
    if (editor && editor.contains(e.target)) return;
    if (toolbar) setTimeout(removeToolbar, 100);
  }, true);

  window.addEventListener("scroll", function () {
    if (toolbar) refreshToolbar();
  }, true);

  window.addEventListener("resize", function () {
    if (toolbar) refreshToolbar();
  }, true);

  // A BookNote "jump and continue editing" link can carry the record id
  // in the fragment. It opens the existing record instead of creating one.
  openPendingBookNote();

  // Some sites rebuild <body> after our script starts. If the toolbar is
  // removed by such a rebuild, recreate it while a selection still exists.
  try {
    observer = new MutationObserver(function (records) {
      // Do not inspect every mutation on an SPA page.  React/Vue/ads can emit
      // thousands of unrelated mutations; only a removed BookNote UI node or
      // a body replacement can require toolbar recovery.
      var shouldCheck=false;
      for(var i=0;i<records.length && !shouldCheck;i++){
        var record=records[i];
        if(record.target===document.documentElement || record.target===document.body){
          shouldCheck=true;
          break;
        }
        var removed=record.removedNodes||[];
        for(var j=0;j<removed.length;j++){
          var node=removed[j];
          if(node && node.nodeType===1){
            if(node.getAttribute && (node.getAttribute("data-booknote-ui")==="toolbar" || node.getAttribute("data-booknote-ui")==="editor")){
              shouldCheck=true;
              break;
            }
            if(node.querySelector && node.querySelector('[data-booknote-ui="toolbar"],[data-booknote-ui="editor"]')){
              shouldCheck=true;
              break;
            }
          }
        }
      }
      if(!shouldCheck || toolbar || editor) return;
      var info = getSelectionInfo();
      if (info) showToolbar(info);
    });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  } catch (_) {}
})();