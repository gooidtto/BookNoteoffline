
var activeDoc;
var playbackError = null;
var silenceLoop = new Audio("sound/silence.opus");
silenceLoop.loop = true;
const pdfViewerCheckIn$ = new rxjs.Subject()

const audioPlayer = immediate(() => {
  let current
  return {
    play(src, opts) {
      if (current) current.playback.unsubscribe()
      const isBlob = src instanceof Blob
      const url = isBlob ? URL.createObjectURL(src) : src
      const playbackState$ = new rxjs.BehaviorSubject("resumed")
      return new Promise((fulfill, reject) => {
        current = {
          playbackState$,
          playback: playAudio(Promise.resolve(url), opts, playbackState$).subscribe({
            complete: fulfill,
            error: reject
          })
        }
        if (isBlob) current.playback.add(() => URL.revokeObjectURL(url))
      })
    },
    pause() {
      if (current) current.playbackState$.next("paused")
    },
    resume() {
      if (current) current.playbackState$.next("resumed")
    }
  }
})

installContextMenus()


/**
 * Piper
 */
const piperHost = immediate(() => {
  const tabSubject = new rxjs.BehaviorSubject(null)
  return {
    setTab(tab) {
      tabSubject.next(tab)
    },
    async ready({requestFocus}) {
      if (requestFocus) {
        const windows = brapi.extension.getViews({type: "popup"})
        for (const w of windows) w.close()
      }
      try {
        const tab = tabSubject.getValue()
        if (!tab) throw "Absent"
        const status = await this.sendRequest("areYouThere")
        if (status != true) throw "Absent"
        if (requestFocus) {
          await Promise.all([
            chrome.windows.update(tab.windowId, {focused: true}),
            chrome.tabs.update(tab.id, {active: true})
          ])
        }
      }
      catch (err) {
        tabSubject.next(null)
        await brapi.tabs.create({url: "https://piper.ttstool.com/", pinned: true, active: requestFocus})
        await rxjs.firstValueFrom(tabSubject.pipe(rxjs.filter(x => x)))
      }
    },
    async sendRequest(method, args) {
      const tab = tabSubject.getValue()
      const {error, result} = await brapi.tabs.sendMessage(tab.id, {
        to: "piper-host",
        type: "request",
        id: String(Math.random()),
        method,
        args
      })
      return error ? Promise.reject(error) : result
    },
    eventSubject: new rxjs.Subject()
  }
})


/**
 * Supertonic
 */
const supertonicHost = immediate(() => {
  const tabSubject = new rxjs.BehaviorSubject(null)
  return {
    setTab(tab) {
      tabSubject.next(tab)
    },
    async ready({requestFocus}) {
      if (requestFocus) {
        const windows = brapi.extension.getViews({type: "popup"})
        for (const w of windows) w.close()
      }
      try {
        const tab = tabSubject.getValue()
        if (!tab) throw "Absent"
        const status = await this.sendRequest("areYouThere")
        if (status != true) throw "Absent"
        if (requestFocus) {
          await Promise.all([
            chrome.windows.update(tab.windowId, {focused: true}),
            chrome.tabs.update(tab.id, {active: true})
          ])
        }
      }
      catch (err) {
        tabSubject.next(null)
        await brapi.tabs.create({url: "https://supertonic.ttstool.com/", pinned: true, active: requestFocus})
        await rxjs.firstValueFrom(tabSubject.pipe(rxjs.filter(x => x)))
      }
    },
    async sendRequest(method, args) {
      const tab = tabSubject.getValue()
      const {error, result} = await brapi.tabs.sendMessage(tab.id, {
        to: "supertonic-host",
        type: "request",
        id: String(Math.random()),
        method,
        args
      })
      return error ? Promise.reject(error) : result
    },
    eventSubject: new rxjs.Subject()
  }
})


/**
 * Document / Reader playback controller
 *
 * v7.10.55 had the IPC table wired to playText/playTab/stop/pause/etc. but
 * those controller functions were missing from the merged background file.
 * That made the background TTS bridge fail at handler construction time.
 * Keep one active Doc so popup, shortcuts and Reader all share the same
 * Speech -> engine -> host pipeline.
 */
function closeActiveDoc() {
  var doc = activeDoc;
  activeDoc = null;
  if (!doc) return Promise.resolve();
  return Promise.resolve(doc.close()).catch(function() {});
}

function playText(text) {
  var value = String(text || '').trim();
  if (!value) return Promise.reject(new Error('No text to read'));
  return closeActiveDoc().then(function() {
    activeDoc = new Doc(new SimpleSource([value]), function(err) {
      if (err) console.error('[BookNote][TTS]', err);
      if (activeDoc === doc) activeDoc = null;
    });
    var doc = activeDoc;
    return doc.play();
  });
}

function playReaderText(text, options) {
  var value = String(text || '').trim();
  options = options || {};
  if (!value) return Promise.reject(new Error('No reader text to read'));
  var readerId = String(options.readerTtsId || '');
  return closeActiveDoc().then(function() {
    var source = new SimpleSource([value], {
      lang: options.lang || '',
      ttsOptions: {
        lang: options.lang || '',
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume,
        voiceName: options.voiceName || '',
        voice: options.voice || null,
      },
      ttsEventHandler: function(event) {
        try {
          brapi.runtime.sendMessage({
            type: 'booknote-reader-tts-event',
            readerTtsId: readerId,
            event: event,
          });
        } catch (e) {}
      },
    });
    var doc = new Doc(source, function(err) {
      if (err) {
        try {
          brapi.runtime.sendMessage({
            type: 'booknote-reader-tts-event',
            readerTtsId: readerId,
            event: {type: 'error', error: {message: err.message || String(err)}},
          });
        } catch (e) {}
      }
      if (activeDoc === doc) activeDoc = null;
    });
    activeDoc = doc;
    return doc.play();
  });
}

function playTab(tabId) {
  return closeActiveDoc().then(function() {
    var source = new TabSource(tabId);
    var doc = new Doc(source, function(err) {
      if (err) console.error('[BookNote][TTS]', err);
      if (activeDoc === doc) activeDoc = null;
    });
    activeDoc = doc;
    return doc.play();
  });
}

function stop() {
  return closeActiveDoc();
}

function pause() {
  return activeDoc ? activeDoc.pause() : Promise.resolve();
}

function getPlaybackState() {
  return activeDoc ? activeDoc.getState() : Promise.resolve('STOPPED');
}

function getActiveSpeech() {
  return activeDoc ? activeDoc.getActiveSpeech() : Promise.resolve(null);
}

function forward() {
  return activeDoc ? activeDoc.forward() : Promise.reject(new Error("Can't forward, not active"));
}

function rewind() {
  return activeDoc ? activeDoc.rewind() : Promise.reject(new Error("Can't rewind, not active"));
}

function seek(index) {
  return activeDoc ? activeDoc.seek(index) : Promise.reject(new Error("Can't seek, not active"));
}

function getSpeechInfo() {
  return getActiveSpeech().then(function(speech) {
    return speech && speech.getInfo();
  });
}

function getSpeechVoices() {
  return rxjs.firstValueFrom(voices$);
}

/**
 * IPC handlers
 */
var handlers = {
  playText: playText,
  playReaderText: playReaderText,
  play: playTab,
  playTab: playTab,
  stop: stop,
  pause: pause,
  getPlaybackState: getPlaybackState,
  forward: forward,
  rewind: rewind,
  seek: seek,
  reportIssue: reportIssue,
  authWavenet: authWavenet,
  ibmFetchVoices: function(apiKey, url) {
    return ibmWatsonTtsEngine.fetchVoices(apiKey, url);
  },
  getSpeechInfo: function() {
    return getActiveSpeech()
      .then(function(speech) {
        return speech && speech.getInfo();
      })
  },
  getPlaybackError: function() {
    try {
      if (playbackError) return {message: playbackError.message}
    } finally {
      playbackError = null
    }
  },
  startPairing: function() {
    return phoneTtsEngine.startPairing()
  },
  isPaired: function() {
    return phoneTtsEngine.isPaired()
  },
  managePiperVoices() {
    return piperHost.ready({requestFocus: true})
  },
  piperServiceReady: function() {
    piperHost.setTab(this.sender.tab)
  },
  onPiperEvent(event) {
    piperHost.eventSubject.next(event)
  },
  manageSupertonicVoices() {
    return supertonicHost.ready({requestFocus: true})
  },
  supertonicServiceReady() {
    supertonicHost.setTab(this.sender.tab)
  },
  onSupertonicEvent(event) {
    supertonicHost.eventSubject.next(event)
  },
  audioPlay: audioPlayer.play,
  audioPause: audioPlayer.pause,
  audioResume: audioPlayer.resume,
  pdfViewerCheckIn() {
    pdfViewerCheckIn$.next()
  },
}

brapi.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    var handler = handlers[request.method];
    if (handler) {
      Promise.resolve(handler.apply({sender}, request.args))
        .then(sendResponse)
        .catch(function(err) {
          sendResponse({error: err.message});
        })
      return true;
    }
    else {
      sendResponse({error: "BAD_METHOD"});
    }
  }
);


/**
 * Context menu installer & handlers
 */
function installContextMenus() {
  if (brapi.menus && brapi.menus.create) {
    brapi.menus.create({
      id: "options",
      title: brapi.i18n.getMessage("options_heading"),
      contexts: ["browser_action"]
    })
  }
}

brapi.menus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId == "options")
    createTab(brapi.runtime.getURL("options.html"))
})


/**
 * Shortcut keys handlers
 */
function execCommand(command) {
  if (command == "play" || command == "pause") {
    getPlaybackState()
      .then(function(state) {
        if (state == "PLAYING") return command == "pause" ? pause() : stop()
        else if (state == "STOPPED" || state == "PAUSED") return playTab()
      })
      .catch(console.error)
  }
  else if (command == "stop") stop();
  else if (command == "forward") forward();
  else if (command == "rewind") rewind();
}

if (brapi.commands)
brapi.commands.onCommand.addListener(function(command) {
  execCommand(command)
})



/**
 * METHODS
 */
