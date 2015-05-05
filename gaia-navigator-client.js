
var gncHistoryLength = 1;

/**
 * Retrieves all anchor tags that point to a new url in the document and
 * rewrites them to be navigation-transition friendly.
 */
function gnc_on_load() {
  window.removeEventListener('load', gnc_on_load);

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
}

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

// Rewrite links on document load
window.addEventListener('load', gnc_on_load);

window.addEventListener('message',
  function(e) {
    console.log('Client received message', e.data);

    var to = false;
    switch (e.data.type) {
    case 'client-transition-to':
      to = true;
      gncHistoryLength = e.data.historyLength;
    case 'client-transition-from':
      var duration = gnc_transition(e.data.name, e.data.backwards, to);
      window.parent.postMessage({type: 'host-transition-start', duration: duration}, '*');
      break;
    }
  });
