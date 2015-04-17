
/**
 * Retrieves all anchor tags that point to a new url in the document and
 * rewrites them to be navigation-transition friendly.
 */
function gnc_rewrite_links() {
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
          gnc_navigate(url);
        }
      }(a.href));
    a.href = '';
  }

  window.parent.postMessage({type: 'loaded'}, '*');
}

function gnc_navigate(url) {
  console.log('Client requesting navigation to ' + url);
  window.parent.postMessage({type: 'navigate', url: url}, '*');
}

function gnc_back() {
  console.log('Client requesting to go back');
  window.parent.postMessage({type: 'back'}, '*');
}

function gnc_getDuration(timeText) {
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
      var style = document.createElement('link');
      style.type = 'text/css';
      style.media = 'all';
      style.rel = 'stylesheet';
      style.href = link.href;
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

  // Accessing the rules immediately after adding results in an exception in
  // Firefox (works fine in Chrome), so do this in a timeout.
  window.setTimeout(function() {
    // Alter the CSS rules to reverse animations when backwards is true
    if (backwards) {
      var nSheets = document.styleSheets.length;
      for (var i = nSheets - 1; i >= nSheets - newStyles.length; i--) {
        console.log('Reversing animation direction of rules');
        var styleSheet = document.styleSheets[i];
        var length = styleSheet.cssRules.length;
        for (var j = 0; j < length; j++) {
          var rule = styleSheet.cssRules[j].style;
          if (!rule || rule['animation-name'] === '') {
            continue;
          }

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

          // Modify animation-delay
          var animDuration = gnc_getDuration(rule['animation-duration']);
          var animDelay = gnc_getDuration(rule['animation-delay']);
          var newDelay =
            Math.max(0, (longestDuration - animDuration) - animDelay);
          console.log('Longest duration, animation duration, old delay, new delay', longestDuration, animDuration, animDelay, newDelay);
          rule['animation-delay'] = newDelay + 'ms';

          console.log('Switched direction of rule', rule);
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
  }, 0);

  return longestDuration;
}

/**
 * Returns a replacement history object
 */
function gnc_get_history() {
  // TODO: Shim history
  return history;
}

// Rewrite links on document load
window.addEventListener('load', gnc_rewrite_links);

window.addEventListener('message',
  function(e) {
    console.log('Client received message', e.data);

    var to = false;
    switch (e.data.type) {
    case 'transition-to':
      to = true;
    case 'transition-from':
      var duration = gnc_transition(e.data.name, e.data.backwards, to);
      window.parent.postMessage({type: 'transition-start', duration: duration}, '*');
      break;
    }
  });
