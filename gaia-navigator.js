
/* Host code. Prefix: gnh
 * Host code is essentially private, none of these functions should be called
 * outside of this script.
 */

// Whether the current transition is going backwards
var gnhBackwards = false;

// History tracking (TODO: Title tracking)
var gnhNavHistory = {
  entries: [],
  position: -1
};

var gnhOldFrame = null;
var gnhOldWindow = null;
var gnhOldHasTransitions = false;

var gnhNewFrame = null;
var gnhNewWindow = window;
var gnhNewHasTransitions = false;

var gnhTransitionToDuration = -1;

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
function gnh_navigate(url, prepend) {
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

  gnhOldFrame = gnhNewFrame ? gnhNewFrame : document.body;
  gnhOldWindow = gnhNewWindow;
  gnhOldHasTransitions = gnhNewHasTransitions;

  prepend ?
    document.body.insertBefore(newFrame, document.body.firstChild) :
    document.body.appendChild(newFrame);

  gnhNewFrame = newFrame;
  gnhNewWindow = newFrame.contentWindow;
  gnhNewHasTransitions = false;

  newFrame.src = gnh_normaliseUrl(url);
}

// Start a transition
function gnh_transition() {
  if (!gnhOldFrame) {
    console.log('No frame to transition from');
    return;
  }

  var name;
  name = gnhBackwards ? 'enter' : 'exit';
  gnhOldWindow.postMessage(
    { type: 'client-transition-from',
      name: name,
      backwards: gnhBackwards }, '*');

  name = gnhBackwards ? 'exit' : 'enter';
  gnhNewFrame.contentWindow.postMessage(
    { type: 'client-transition-to',
      name: name,
      backwards: gnhBackwards,
      historyLength: gnhNavHistory.entries.length }, '*');
}

window.addEventListener('popstate',
  function gnh_hostPopState(e) {
    if (e.state && e.state.position === -1) {
      // We've hit a user push/replace state, tell the client to fake a
      // popstate event on the subframe
      gnhNewWindow.postMessage({ type: 'client-popstate',
                                 state: e.state.state }, '*');
      return;
    }

    var delta = (e.state ? e.state.position : 0) - gnhNavHistory.position;
    var newPosition = gnhNavHistory.position + delta;

    if (!delta || newPosition < 0 ||
        newPosition >= gnhNavHistory.entries.length) {
      return;
    }

    gnhBackwards = newPosition < gnhNavHistory.position;
    gnhNavHistory.position = newPosition;
    gnh_navigate(gnhNavHistory.entries[newPosition].url, gnhBackwards);
  });

window.addEventListener('message',
  function gnh_hostMessageHandler(e) {
    if (e.data.type.indexOf('host-') !== 0) {
      return;
    }
    console.log('Host received message', e.data);

    switch (e.data.type) {
    case 'host-navigate':
      gnhBackwards = false;

      // Alter history
      if (gnhNavHistory.position >= 0) {
        gnhNavHistory.entries =
          gnhNavHistory.entries.slice(0, gnhNavHistory.position + 1);
      }
      gnhNavHistory.entries.push({ title: '', url: e.data.url });
      gnhNavHistory.position ++;

      gnh_navigate(e.data.url, gnhBackwards);
      history.pushState({ position: gnhNavHistory.position }, '', e.data.url);
      break;

    case 'host-go':
      history.go(e.data.delta);
      break;

    case 'host-pushstate':
      history.pushState(
        { position: -1, state: e.data.state }, e.data.title, e.data.url);
      break;

    case 'host-replacestate':
      history.replaceState(
        { position: -1, state: e.data.state }, e.data.title, e.data.url);
      break;

    case 'host-loaded':
      var iframes = document.getElementsByClassName('gaia-navigator-iframe');
      if (gnhNavHistory.position === -1) {
        var url = gnhNewWindow.location.href;
        gnhNavHistory.entries.push({ title: e.data.title, url: url });
        gnhNavHistory.position = 0;
      } else {
        gnhNavHistory.entries[gnhNavHistory.position].title = e.data.title;
      }
      document.title = e.data.title;
      gnhNewHasTransitions = e.data.hasTransitions;

      gnh_transition();
      break;

    case 'host-transition-to-start':
      window.requestAnimationFrame(function() {
        // Unhide the new frame now it's finished loading and the transition
        // has started.
        gnhNewFrame.style.visibility = 'visible';

        // If the old frame doesn't have any transitions, we'll tell it to end
        // when the new frame has finished its transition(s).
        if (!gnhOldHasTransitions || gnhNewHasTransitions) {
          window.setTimeout(function() {
            if (!gnhOldHasTransitions) {
              gnhOldWindow.postMessage({ type: 'client-transition-from-end',
                                         name: e.data.name === 'exit' ?
                                           'enter' : 'exit',
                                         backwards: gnhBackwards }, '*');
            }
            if (gnhNewHasTransitions || !gnhOldHasTransitions) {
              gnhNewWindow.postMessage({ type: 'client-transition-to-end',
                                         name: e.data.name,
                                         backwards: gnhBackwards }, '*');
            }
          }, e.data.duration);
        }
      });
      break;

    case 'host-transition-from-start':
      window.requestAnimationFrame(function() {
        if (!gnhNewHasTransitions || gnhOldHasTransitions) {
          window.setTimeout(function() {
            if (!gnhNewHasTransitions) {
              gnhNewWindow.postMessage({ type: 'client-transition-to-end',
                                         name: e.data.name === 'exit' ?
                                           'enter' : 'exit',
                                         backwards: gnhBackwards }, '*');
            }
            if (gnhOldHasTransitions || !gnhNewHasTransitions) {
              gnhOldWindow.postMessage({ type: 'client-transition-from-end',
                                         name: e.data.name,
                                         backwards: gnhBackwards }, '*');
            }

            // We are now a dedicated host, so disconnect the client.
            window.postMessage({ type: 'client-disconnect' }, '*');
          }, e.data.duration);
        }
      });
      break;

    case 'host-transition-from-end':
      // Remove the old frame/contents from the document
      while (document.body.childElementCount > 1) {
        if (document.body.firstElementChild !== gnhNewFrame) {
          document.body.removeChild(document.body.firstElementChild);
        } else {
          document.body.removeChild(document.body.children[1]);
        }
      }
      break;
    }
  });

/* Client code. Prefix: gnc
 * Only gnc_get* functions should be called outside of this script.
 */

// History length, as sent by the host which keeps track of history.
var gncHistoryLength = 1;

// Navigation transition style data. Contains arrays of objects of the
// format { type: 'enter' | 'exit', duration: <milliseconds>, style: <text> }
var gncNavTrans = [];

// Cached length of the string '@navigation-transition'
var gncRuleLength = '@navigation-transition'.length;

/**
 * Parses all transition styles. Currently also rewrites anchor links to
 * use the gaia-navigator location shim.
 */
window.addEventListener('load',
  function gnc_onLoad() {
    var i, iLen;
    window.removeEventListener('load', gnc_onLoad);

    // TODO: Don't do this, use a click handler to intercept?
    console.log('Rewriting links');
    var anchors = document.getElementsByTagName('a');
    for (i = 0, iLen = anchors.length; i < iLen; i++) {
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

    console.log('Checking for navigation transition rules');

    var extractNavTrans = function(css) {
      // TODO: Respect media queries
      // TODO: Don't do this character-by-character,
      //       could be much more efficient
      var i, iLen, depth;
      var navTran = { start: -1, blockStart: -1, properties: null };
      for (i = depth = 0, iLen = css.length; i < iLen; i++) {
        if (depth === 0 && css[i] === '@' &&
            css.slice(i, i + gncRuleLength + 1).search(
              /^@navigation-transition\b/) !== -1) {
          navTran.start = i + gncRuleLength;
        }

        if (css[i] === '{') {
          depth ++;
          if (navTran.start !== -1 && navTran.blockStart === -1) {
            navTran.blockStart = i + 1;
            navTran.properties = css.slice(navTran.start, i - 1);
          }
        } else if (css[i] === '}') {
          depth --;
          if (depth === 0 && navTran.blockStart !== -1) {
            // Write out the properties and rules to the global nav-trans array
            var durationMatch = navTran.properties.match(/\b0?\.?\d*m?s\b/);
            var transition = {
              type: (navTran.properties.search(/\bexit\b/) !== -1) ?
                'exit' : 'enter',
              duration: (durationMatch && durationMatch.length) ?
                gnc_getDuration(durationMatch[0]) : 0,
              style: css.slice(navTran.blockStart, i - 1)
            };
            gncNavTrans.push(transition);

            // Reset
            navTran.start = -1;
            navTran.blockStart = -1;
          }
        }
      }
    };

    var styles = document.getElementsByTagName('style');
    for (i = 0, iLen = styles.length; i < iLen; i++) {
      extractNavTrans(styles[i].textContent);
    }

    var nRequests = 0;
    var extStyles = document.getElementsByTagName('link');
    for (i = 0, iLen = extStyles.length; i < iLen; i++) {
      var link = extStyles[i];
      if (link.rel !== 'stylesheet' || !link.href || !link.href.length) {
        continue;
      }

      console.log('Checking for @navigation-transition in external ' +
                  'stylesheet at ' + link.href);

      nRequests ++;
      var request = new XMLHttpRequest();
      request.open('GET', link.href);
      request.overrideMimeType('text/css');
      request.onreadystatechange = function(elem) {
        return function () {
          extractNavTrans(this.responseText);
          if (--nRequests === 0) {
            window.parent.postMessage(
              { type: 'host-loaded',
                title: document.title,
                hasTransitions: gncNavTrans.length > 0 }, '*');
          }
        }
      }(link);
      request.send();
    }

    if (nRequests === 0) {
      window.parent.postMessage(
        { type: 'host-loaded',
          title: document.title,
          hasTransitions: gncNavTrans.length > 0 }, '*');
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
 * Start a navigation transition. type is 'enter' or 'exit'.
 */
function gnc_transition(type, backwards, to) {
  console.log('Running ' + type + ' transition');

  var newStyles = [];
  var longestDuration = 0;

  for (var i = 0, iLen = gncNavTrans.length; i < iLen; i++) {
    if (gncNavTrans[i].type !== type) {
      continue;
    }

    var transition = gncNavTrans[i];
    if (transition.duration > longestDuration) {
      longestDuration = transition.duration;
    }

    var style = document.createElement('style');
    style.appendChild(document.createTextNode(transition.style));
    newStyles.push(style);
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

  window.requestAnimationFrame(
    function () {
      window.setTimeout(function () {
        if (to) {
          // Remove transition styles
          for (i = 0, iLen = newStyles.length; i < iLen; i++) {
            document.head.removeChild(newStyles[i]);
          }
        }
      }, longestDuration);
    });

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
            url.search = '';
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

      case 'pushState':
        fakeHistory[property] = function(state, title, url) {
          window.parent.postMessage({ type: 'host-pushstate',
                                      state: state,
                                      title: title,
                                      url: url }, '*');
        };
        break;

      case 'replaceState':
        fakeHistory[property] = function(state, title, url) {
          window.parent.postMessage({ type: 'host-replacestate',
                                      state: state,
                                      title: title,
                                      url: url }, '*');
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
    if (e.data.type.indexOf('client-') !== 0) {
      return;
    }
    console.log('Client received message', e.data);

    var to = false;
    switch (e.data.type) {
    case 'client-transition-to':
      to = true;
      gncHistoryLength = e.data.historyLength;
    case 'client-transition-from':
      var duration = gnc_transition(e.data.name, e.data.backwards, to);
      window.parent.postMessage({ type: to ? 'host-transition-to-start' :
                                             'host-transition-from-start',
                                  name: e.data.name,
                                  duration: duration }, '*');
      break;

    case 'client-transition-to-end':
      to = true;
    case 'client-transition-from-end':
      window.dispatchEvent(new CustomEvent('navigation-transition-end',
                             { detail: { back: e.data.backwards }}));
      window.parent.postMessage({ type: to ? 'host-transition-to-end' :
                                             'host-transition-from-end' }, '*');
      break;

    case 'client-disconnect':
      window.removeEventListener('message', gnc_handleMessage);
      break;

    case 'client-popstate':
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: e.data.state }));
      break;
    }
  });
