
var gnhBackwards = false;
var gnhNavHistory = {
  urls: [],
  position: -1
};

function gnh_navigate(url) {
  // TODO: Tidy up old transitions

  var frames = document.getElementsByClassName('gaia-navigator-iframe');
  var oldFrame = frames.length ? frames[0] : document.body;

  oldFrame.classList.add('from');

  var newFrame = document.createElement('iframe');
  newFrame.className = 'gaia-navigator-iframe loading to'

  document.body.appendChild(newFrame);
  newFrame.src = url;
}

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
    oldFrame.classList.add('above');
  }

  name = gnhBackwards ? 'transition-exit' : 'transition-enter';
  newWindow.postMessage({ type: 'client-transition-to',
                          name: name,
                          backwards: gnhBackwards }, '*');
  if (!gnhBackwards) {
    newFrame.classList.add('above');
  }
}

function gnh_normalise_url(url) {
  // You can't have nest the same URL in an iframe it seems, so make
  // some small modification
  if (url === location.href) {
    if (url.indexOf('?') !== -1) {
      url = url + '&gaia-navigator=1';
    } else {
      url = url + '?gaia-navigator=1';
    }
  }

  return url;
}

window.addEventListener('message',
  function(e) {
    console.log('Host received message', e.data);

    switch (e.data.type) {
    case 'host-navigate':
      gnhBackwards = false;
      var url = gnh_normalise_url(e.data.url);

      // Alter history
      if (gnhNavHistory.position >= 0) {
        gnhNavHistory.urls =
          gnhNavHistory.urls.slice(0, gnhNavHistory.position + 1);
      }
      gnhNavHistory.urls.push(url);
      gnhNavHistory.position ++;

      gnh_navigate(url);
      break;

    case 'host-back':
      if (gnhNavHistory.position < 1) {
        break;
      }

      gnhBackwards = true;
      gnh_navigate(gnhNavHistory.urls[--gnhNavHistory.position]);
      break;

    case 'host-loaded':
      if (gnhNavHistory.position === -1) {
        var iframes = document.getElementsByClassName('gaia-navigator-iframe');
        var url = iframes.length ? iframes[0].src : location.href;
        gnhNavHistory.urls.push(gnh_normalise_url(url));
        gnhNavHistory.position = 0;
      }

      gnh_transition();
      break;

    case 'host-transition-start':
      window.requestAnimationFrame(function() {
        // Remove the loading style to unhide the new frame
        var frames = document.getElementsByClassName('gaia-navigator-iframe');
        var newFrame = frames[frames.length - 1];
        newFrame.classList.remove('loading');

        // Remove the old frame from the document after the transition finishes
        window.setTimeout(function() {
          while (document.body.childElementCount > 1) {
            if (document.body.firstElementChild !== newFrame) {
              document.body.removeChild(document.body.firstElementChild);
            } else {
              document.body.removeChild(document.body.children[1]);
            }
          }
          newFrame.classList.remove('to');
          newFrame.classList.remove('above');
        }, e.data.duration);
      });
      break;
    }
  });
