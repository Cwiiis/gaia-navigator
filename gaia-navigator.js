
// Host code. Prefix: gnh

// Whether the current transition is going backwards
var gnhBackwards = false;

// History tracking (TODO: Title tracking)
var gnhNavHistory = {
  urls: [],
  position: -1
};

// If the url given is the same as the current url, this will modify the URL's
// query string slightly so that the iframe will load. Otherwise, loading the
// current URL in an iframe will not work.
function gnh_normaliseUrl(url) {
  if (url === location.href) {
    if (url.indexOf('?') === -1) {
      url = url + '?gaia-navigator=1';
    } else {
      url = url + '&gaia-navigator=1';
    }
  }

  return url;
}

// Initiate a navigation to a url string
function gnh_navigate(url) {
  // TODO: Handle if a transition starts during another transition?

  var newFrame = document.createElement('iframe');
  newFrame.className = 'gaia-navigator-iframe';

  newFrame.style.visibility = 'hidden';
  newFrame.style.position = 'fixed';
  newFrame.style.top = '0';
  newFrame.style.left = '0';
  newFrame.style.border = '0';
  newFrame.style.width = '100%';
  newFrame.style.height = '100%';

  document.body.appendChild(newFrame);
  newFrame.src = gnh_normaliseUrl(url);
}

// Start a transition
function gnh_transition() {
  var frames = document.getElementsByClassName('gaia-navigator-iframe');
  if (frames.length > 2) {
    console.error('More than two iframes at transition start');
  }
  if (frames.length < 1) {
    console.log('No frames to transition');
    return;
  }

  var oldFrame, oldWindow, newFrame, newWindow;
  if (frames.length === 1) {
    oldFrame = document.body;
    oldWindow = window;
    newFrame = frames[0];
    newWindow = newFrame.contentWindow;
  } else {
    oldFrame = frames[0];
    oldWindow = oldFrame.contentWindow;
    newFrame = frames[1];
    newWindow = newFrame.contentWindow;
  }

  var name;
  name = gnhBackwards ? 'transition-enter' : 'transition-exit';
  oldWindow.postMessage({ type: 'client-transition-from',
                          name: name,
                          backwards: gnhBackwards }, '*');
  if (gnhBackwards) {
    oldFrame.style.zIndex = '1';
  }

  name = gnhBackwards ? 'transition-exit' : 'transition-enter';
  newWindow.postMessage({ type: 'client-transition-to',
                          name: name,
                          backwards: gnhBackwards,
                          historyLength: gnhNavHistory.urls.length }, '*');
  if (!gnhBackwards) {
    newFrame.style.zIndex = '1';
  }
}

// Implement history.go. Does nothing if given an out-of-range delta
function gnh_go(delta) {
  var newPosition = gnhNavHistory.position + delta;
  if (!delta || newPosition < 0 || newPosition >= gnhNavHistory.urls.length) {
    return;
  }

  gnhBackwards = newPosition < gnhNavHistory.position;
  gnhNavHistory.position = newPosition;
  gnh_navigate(gnhNavHistory.urls[newPosition]);
}

window.addEventListener('message',
  function gnh_hostMessageHandler(e) {
    console.log('Host received message', e.data);

    switch (e.data.type) {
    case 'host-navigate':
      gnhBackwards = false;

      // Alter history
      if (gnhNavHistory.position >= 0) {
        gnhNavHistory.urls =
          gnhNavHistory.urls.slice(0, gnhNavHistory.position + 1);
      }
      gnhNavHistory.urls.push(e.data.url);
      gnhNavHistory.position ++;

      gnh_navigate(e.data.url);
      break;

    case 'host-go':
      gnh_go(e.data.delta);
      break;

    case 'host-loaded':
      var iframes = document.getElementsByClassName('gaia-navigator-iframe');
      if (gnhNavHistory.position === -1) {
        var url = iframes.length ? iframes[0].src : location.href;
        gnhNavHistory.urls.push(url);
        gnhNavHistory.position = 0;
      }

      if (iframes.length &&
          iframes[iframes.length - 1].style.visibility === 'hidden') {
        gnh_transition();
      }
      break;

    case 'host-transition-start':
      window.requestAnimationFrame(function() {
        // Unhide the new frame now it's finished loading and the transition
        // has started.
        var frames = document.getElementsByClassName('gaia-navigator-iframe');
        var newFrame = frames[frames.length - 1];
        newFrame.style.visibility = '';

        // Remove the old frame from the document after the transition finishes
        window.setTimeout(function() {
          while (document.body.childElementCount > 1) {
            if (document.body.firstElementChild !== newFrame) {
              document.body.removeChild(document.body.firstElementChild);
            } else {
              document.body.removeChild(document.body.children[1]);
            }
          }
          newFrame.style.zIndex = '';

          // We are now a dedicated host, so disconnect the client.
          window.postMessage({ type: 'client-disconnect' });
        }, e.data.duration);
      });
      break;
    }
  });

// Client code. Prefix: gnc

// History length, as sent by the host which keeps track of history.
var gncHistoryLength = 1;

/**
 * Pre-loads all transition styles. Currently also rewrites anchor links to
 * use the gaia-navigator location shim.
 */
window.addEventListener('load',
  function gnc_onLoad() {
    window.removeEventListener('load', gnc_onLoad);

    console.log('Rewriting links');
    var anchors = document.getElementsByTagName('a');
    for (var i = 0, iLen = anchors.length; i < iLen; i++) {
      var a = anchors[i];
      if (!a.href || !a.href.length || a.href[0] === '#' || a.onclick ||
          a.download || a.target || a.href.indexOf('javascript:') === 0) {
        continue;
      }

      a.addEventListener('click', function handleClick(url) {
          return function(e) {
            e.preventDefault();
            window.parent.postMessage({ type: 'host-navigate', url: url }, '*');
          }
        }(a.href));
      a.href = '';
    }

    console.log('Checking for transition styles');
    var styles = document.head.getElementsByTagName('link');

    var nRequests = 0;
    for (var i = 0, iLen = styles.length; i < iLen; i++) {
      var link = styles[i];
      var duration = link.getAttribute('duration');
      if (((link.rel !== 'transition-enter') &&
           (link.rel !== 'transition-exit')) ||
          !duration || !link.href || !link.href.length) {
        continue;
      }

      console.log('Pre-loading transition stylesheet at ' + link.href);
      nRequests ++;
      var request = new XMLHttpRequest();
      request.open('GET', link.href);
      request.overrideMimeType('text/css');
      request.onreadystatechange = function(elem) {
        return function () {
          elem.styleData = this.responseText;
          if (--nRequests === 0) {
            window.parent.postMessage({ type: 'host-loaded' }, '*');
          }
        }
      }(link);
      request.send();
    }

    if (nRequests === 0) {
      window.parent.postMessage({ type: 'host-loaded' }, '*');
    }
  });

/**
 * Given some CSS duration text (e.g. '100ms', '1s'), and returns that time
 * in milliseconds.
 */
function gnc_getDuration(timeText) {
  if (!timeText) {
    return 0;
  }

  var duration;
  if (timeText.indexOf('ms') !== -1) {
    duration = parseInt(timeText);
  } else {
    duration = Math.round(parseFloat(timeText) * 1000.0);
  }
  return isNaN(duration) ? 0 : duration;
}

/**
 * Start a navigation transition. Name is 'transition-enter' or
 * 'transition-exit'.
 */
function gnc_transition(name, backwards, to) {
  console.log('Searching style links for ' + name);

  var newStyles = [];
  var longestDuration = 0;
  var styles = document.head.getElementsByTagName('link');

  for (var i = 0, iLen = styles.length; i < iLen; i++) {
    var link = styles[i];
    var duration = link.getAttribute('duration');
    if (link.rel !== name || !duration) {
      continue;
    }

    console.log('Found transition style', link);

    if (link.href && link.href.length > 0) {
      var style = document.createElement('style');
      style.appendChild(document.createTextNode(link.styleData));
      newStyles.push(style);
    }

    duration = gnc_getDuration(duration);
    if (duration > longestDuration) {
      longestDuration = duration;
    }
  }

  for (i = 0, iLen = newStyles.length; i < iLen; i++) {
    document.head.appendChild(newStyles[i]);
  }

  // Alter the CSS rules to reverse animations when backwards is true
  if (backwards) {
    console.log('Reversing animation direction of rules');
    var nSheets = document.styleSheets.length;
    for (var i = nSheets - 1; i >= nSheets - newStyles.length; i--) {
      var styleSheet = document.styleSheets[i];
      var length = styleSheet.cssRules.length;
      for (var j = 0; j < length; j++) {
        var rule = styleSheet.cssRules[j].style;

        if (!rule) {
          continue;
        }

        if (rule['animation-name'] !== '' ||
            rule['animation-direction'] !== '') {
          // Switch animation-direction
          switch (rule['animation-direction']) {
          default:
          case 'normal':
            rule['animation-direction'] = 'reverse';
            break;

          case 'reverse':
            rule['animation-direction'] = 'normal';
            break;

          case 'alternate':
            rule['animation-direction'] = 'alternate-reverse';
            break;

          case 'alternate-reverse':
            rule['animation-direction'] = 'alternate';
            break;
          }
        }

        if (rule['animation-name'] !== '' ||
            rule['animation-delay'] !== '') {
          // Modify animation-delay
          var animDuration = gnc_getDuration(rule['animation-duration']);
          var animDelay = gnc_getDuration(rule['animation-delay']);
          var newDelay =
            Math.max(0, (longestDuration - animDuration) - animDelay);
          rule['animation-delay'] = newDelay + 'ms';
        }
      }
    }
  }

  // Fire transition-start signal
  window.dispatchEvent(new CustomEvent('navigation-transition-start',
                                       { detail: { back: backwards }}));

  // After the transition starts, JS execution is meant to end on the from
  // document, so only do the rest on the to document.
  if (to) {
    window.requestAnimationFrame(
      function () {
        window.setTimeout(function () {
          // Remove transition styles
          for (i = 0, iLen = newStyles.length; i < iLen; i++) {
            document.head.removeChild(newStyles[i]);
          }

          // Fire transition-end signal
          window.dispatchEvent(new CustomEvent('navigation-transition-end',
                                 { detail: { back: backwards }}));
        }, longestDuration);
      });
  }

  return longestDuration;
}

/**
 * Retrieve a shim location object.
 */
function gnc_getLocation() {
  var fakeLocation = {};
  for (property in location) {
    switch (property) {
      case 'assign':
        fakeLocation[property] = function(uri) {
          if (!uri.length) {
            return;
          }

          var url = new URL(location);
          try {
            url = new URL(uri);
          } catch(e) {
            url = new URL(location);
            url.pathname =
              location.pathname.
                slice(0, location.pathname.lastIndexOf('/') + 1) + uri;
          }

          if (url.origin !== location.origin ||
              url.pathname !== location.pathname ||
              url.port !== location.port) {
            window.parent.postMessage({ type: 'host-navigate',
                                        url: decodeURIComponent(url.href) },
                                      '*');
            return;
          }

          location.assign(uri);
        };
        break;

      case 'href':
        Object.defineProperty(fakeLocation, property, {
          enumerable: true,
          get: function() { return location.href; },
          set: function(uri) { this.assign(uri); }
        });
        break;

      default:
        fakeLocation[property] = location[property];
    }
  }

  return fakeLocation;
}

/**
 * Retrieve a shim history object.
 */
function gnc_getHistory() {
  var fakeHistory = {};
  for (property in history) {
    switch (property) {
      case 'length':
        Object.defineProperty(fakeHistory, property, {
          enumerable: true,
          get: function() { return gncHistoryLength; }
        });
        break;

      case 'go':
        fakeHistory[property] = function(delta) {
          if (!delta || delta === 0) {
            gnc_getLocation().reload();
            return;
          }

          window.parent.postMessage({ type: 'host-go', delta: delta }, '*');
        };
        break;

      case 'back':
        fakeHistory[property] = function() {
          window.parent.postMessage({ type: 'host-go', delta: -1 }, '*');
        };
        break;

      case 'forward':
        fakeHistory[property] = function() {
          window.parent.postMessage({ type: 'host-go', delta: 1 }, '*');
        };
        break;

      default:
        fakeHistory[property] = history[property];
    }
  }

  return fakeHistory;
}

window.addEventListener('message',
  function gnc_handleMessage(e) {
    console.log('Client received message', e.data);

    var to = false;
    switch (e.data.type) {
    case 'client-transition-to':
      to = true;
      gncHistoryLength = e.data.historyLength;
    case 'client-transition-from':
      var duration = gnc_transition(e.data.name, e.data.backwards, to);
      window.parent.postMessage({ type: 'host-transition-start',
                                  duration: duration }, '*');
      break;
    case 'client-disconnect':
      window.removeEventListener('message', gnc_handleMessage);
      break;
    }
  });
