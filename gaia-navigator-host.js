
var backwards = false;
var navHistory = {
  urls: [],
  position: -1
};

function navigate(url) {
  // TODO: Tidy up old transitions

  console.log('Navigating to ' + url);

  var frames = document.getElementsByTagName('iframe');
  var oldFrame = frames.length ? frames[0] : null;

  if (oldFrame) {
    oldFrame.classList.add('from');
  }

  var newFrame = document.createElement('iframe');
  newFrame.classList.add('loading');
  newFrame.classList.add('to');

  document.body.appendChild(newFrame);
  newFrame.src = url;
}

function transition() {
  console.log('Document loaded, initiating transition');

  var frames = document.getElementsByTagName('iframe');
  if (frames.length > 2) {
    console.error('More than two iframes at transition start');
  }
  if (frames.length < 1) {
    console.error('No frames to transition');
    return;
  }

  var oldFrame, newFrame;
  if (frames.length === 1) {
    oldFrame = null;
    newFrame = frames[0];
  } else {
    oldFrame = frames[0];
    newFrame = frames[1];
  }

  var name;
  if (oldFrame) {
    name = backwards ? 'transition-enter' : 'transition-exit';
    oldFrame.contentWindow.postMessage({type: 'transition-from',
                                        name: name,
                                        backwards: backwards}, '*');
    if (backwards) {
      oldFrame.classList.add('above');
    }
  }

  name = backwards ? 'transition-exit' : 'transition-enter';
  newFrame.contentWindow.postMessage({type: 'transition-to',
                                      name: name,
                                      backwards: backwards}, '*');
  if (!backwards) {
    newFrame.classList.add('above');
  }
}

window.addEventListener('message',
  function(e) {
    console.log('Host received message', e.data);

    switch (e.data.type) {
    case 'navigate':
      backwards = false;
      var url = e.data.url;

      // Alter history
      if (navHistory.position >= 0) {
        navHistory.urls = navHistory.urls.slice(0, navHistory.position + 1);
      }
      navHistory.urls.push(url);
      navHistory.position ++;

      navigate(url);
      break;

    case 'back':
      if (navHistory.position < 1) {
        break;
      }

      backwards = true;
      navigate(navHistory.urls[--navHistory.position]);
      break;

    case 'loaded':
      if (navHistory.position === -1) {
        navHistory.urls.push(document.getElementsByTagName('iframe')[0].src);
        navHistory.position = 0;
      }

      transition();
      break;

    case 'transition-start':
      window.setTimeout(function() {
        window.requestAnimationFrame(function() {
          // Remove the loading style to unhide the new frame
          var frames = document.getElementsByTagName('iframe');
          var newFrame = frames[frames.length - 1];
          newFrame.classList.remove('loading');

          // Remove the old frame from the document after the transition finishes
          window.setTimeout(function() {
            if (frames.length > 1) {
              document.body.removeChild(document.getElementsByTagName('iframe')[0]);
            }
            newFrame.classList.remove('to');
            newFrame.classList.remove('above');
          }, e.data.duration);
        });
      }, 0);
      break;
    }
  });
