

const PDF_THEME_COLORS = {
  "day-nord":      {bg:"#eceff4", surface:"#f8f9fb"},
  "day-atom":      {bg:"#f3f4f6", surface:"#ffffff"},
  "day-everforest":{bg:"#f3f1e5", surface:"#faf9ee"},
  "day-onehalf":   {bg:"#f5f5f5", surface:"#ffffff"},
  "day-dracula":   {bg:"#f1eff5", surface:"#fbfaff"},
  "night-nord":      {bg:"#242933", surface:"#3b4252"},
  "night-atom":      {bg:"#1e2127", surface:"#282c34"},
  "night-everforest":{bg:"#202724", surface:"#343f44"},
  "night-onehalf":   {bg:"#181a1f", surface:"#282c34"},
  "night-dracula":   {bg:"#100f14", surface:"#282a36"}
}

function applyPdfShellTheme(st) {
  st = (st && typeof st === "object") ? st : {};
  const theme = PDF_THEME_COLORS[(st.themeMode === "night" ? "night" : "day") + "-" + (st.themeName || "everforest")] || PDF_THEME_COLORS["day-everforest"];
  document.documentElement.style.setProperty("--pdf-shell-bg", theme.bg);
  document.documentElement.style.setProperty("--pdf-shell-surface", theme.surface);
  document.documentElement.style.colorScheme = st.themeMode === "night" ? "dark" : "light";
  document.body.dataset.theme = st.themeName || "everforest";
  document.body.dataset.mode = st.themeMode === "night" ? "night" : "day";
  const frame = document.getElementById("viewer-frame");
  if (frame) {
    frame.style.background = theme.bg;
    if (frame.contentWindow) {
      try {
        const viewerOrigin = new URL(config.pdfViewerUrl).origin;
        frame.contentWindow.postMessage({type:"booknote-pdf-theme",state:st}, viewerOrigin);
      } catch (_) {}
    }
  }
}

function bindPdfThemeSync() {
  const fallback = {themeName:"everforest", themeMode:"day"};
  if (globalThis.BookNoteGlobalTheme && globalThis.BookNoteGlobalTheme.get) {
    globalThis.BookNoteGlobalTheme.get().then(applyPdfShellTheme).catch(() => applyPdfShellTheme(fallback));
  } else {
    browser.storage.local.get("booknotePanelState").then(function(r){
      const st = r.booknotePanelState || fallback;
      applyPdfShellTheme(st);
    }).catch(() => applyPdfShellTheme(fallback));
  }
  browser.storage.onChanged.addListener(function(changes, area){
    if (area !== "local" || !changes.booknotePanelState) return;
    applyPdfShellTheme(changes.booknotePanelState.newValue || fallback);
  });
}

bindPdfThemeSync()

const ready = new Promise(f => document.addEventListener("DOMContentLoaded", f))
  .then(loadViewer)
  .then(loadDocument)

registerMessageListener("pdfViewer", {
  getDocumentInfo: function() {
    return {
      url: location.href,
      title: document.title,
    }
  },
  getCurrentIndex: async function() {
    const queue = await ready
    const res = await queue.send({method: "getCurrentIndex"})
    return res.value
  },
  getTexts: async function(index, quietly) {
    const queue = await ready
    const res = await queue.send({method: "getTexts", index: index, quietly: quietly})
    return res.value
  }
})

bgPageInvoke("pdfViewerCheckIn")
  .catch(console.error)



async function loadViewer() {
  const viewerUrl = new URL(config.pdfViewerUrl + "?embedded")
  const frame = document.getElementById("viewer-frame")
  frame.src = viewerUrl.href
  var queue
  await new Promise(f => queue = new MessageQueue(frame.contentWindow, viewerUrl.origin, {viewerReady: f}))
  try {
    const st = await (globalThis.BookNoteGlobalTheme && globalThis.BookNoteGlobalTheme.get ? globalThis.BookNoteGlobalTheme.get() : Promise.resolve({themeName:"everforest",themeMode:"day"}));
    frame.contentWindow.postMessage({type:"booknote-pdf-theme",state:st}, viewerUrl.origin);
  } catch (_) {}
  return queue
}

async function loadDocument(queue) {
  const query = getQueryString()
  const res = await fetch(query.url)
  const buffer = await res.arrayBuffer()
  await queue.send({method: "loadDocument", buffer: buffer}, [buffer])
  return queue
}

function MessageQueue(targetWindow, targetOrigin, handlers) {
  const pending = {}
  window.addEventListener("message", event => {
    if (event.origin == targetOrigin) {
      if (handlers[event.data.method]) handlers[event.data.method](event.data)
      else if (pending[event.data.id]) pending[event.data.id](event.data)
      else console.error("Unhandled", event)
    }
  })
  this.send = function(message, transfer) {
    message.id = Math.random()
    targetWindow.postMessage(message, targetOrigin, transfer)
    return new Promise(f => pending[message.id] = f)
      .finally(() => delete pending[message.id])
  }
}
