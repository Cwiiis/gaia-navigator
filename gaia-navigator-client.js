
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

    var style = document.createElement('link');
    style.type = 'text/css';
    style.media = 'all';
    style.rel = 'stylesheet';
    style.href = link.href;
    newStyles.push(style);

    if (duration.indexOf('ms') !== -1) {
      // Milliseconds
      duration = parseInt(duration);
    } else {
      // Seconds
      duration = parseFloat(duration) * 1000;
    }

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
          console.log('Switched direction of rule', rule);
        }
      }
    }

    // Fire transition-start signal
    if (to) {
      window.dispatchEvent(new Event('navigation-transition-start'));
    }

    window.requestAnimationFrame(
      function () {
        window.setTimeout(function () {
          for (i = 0, iLen = newStyles.length; i < iLen; i++) {
            document.head.removeChild(newStyles[i]);
          }

          // Fire transition-end signal
          if (to) {
            window.dispatchEvent(new Event('navigation-transition-end'));
          }
        }, longestDuration);
      });
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
window.onload = gnc_rewrite_links;

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
