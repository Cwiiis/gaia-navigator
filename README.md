# gaia-navigator

Gaia Navigator is a partial implementation of a specification proposal, outlined below.

## Limitations

* The first page must include, [gaia-navigator-host.css](gaia-navigator-host.css), [gaia-navigator-host.js](gaia-navigator-host.js) and [gaia-navigator-client.js](gaia-navigator-client.js). Each subsequent page need only include [gaia-navigator-client.js](gaia-navigator-client.js).
* Alternatively, a 'wrapper' page can be used that contains a single iframe in the body of the document and need only include the host script and style. The iframe can have its source set to the page you would like to load initially.
* For reverse animations to work correctly, CSS property animation-delay must always be specified together with animation-duration.
* Direct manipulation of the history and location objects will have unexpected results, instead use the shim objects available via gnc_getHistory and gnc_getLocation.

## TODO

* Support title tag in non-host documents
* Support history pushState and replaceState

---

# Navigation Transitions specification proposal

## Abstract

An API will be suggested that will allow transitions to be performed between page navigations, requiring only CSS. It is intended for the API to be flexible enough to allow for animations on different pages to be performed in synchronisation, and for particular transition state to be selected on without it being necessary to interject with JavaScript.

## Proposed API

Navigation transitions will be specified within a specialised stylesheet. These stylesheets will be included in the document as new link rel types. Transitions can be specified for entering and exiting the document. When the document is ready to transition, these stylesheets will be applied for the specified duration, after which they will stop applying.

Example syntax;
```html
<link rel="transition-enter" duration="0.25s" href="URI" />
<link rel="transition-exit" duration="0.25s" href="URI" />
```

When navigating to a new page, the current page's transition-exit stylesheet will be referenced, and the new page's transition-enter stylesheet will be referenced.

When navigation is operating in a backwards direction, by the user pressing the back button in browser chrome, or when initiated from JavaScript via history.back() or history.go(-1), animations will be run in reverse. That is, the current page's transition-enter stylesheet will be referenced, and animations will run in reverse, and the old page's transition-exit stylesheet will be referenced, and those animations also run in reverse.

## Transitioning

When a navigation is initiated, the old page will stay at its current position and the new page will be overlaid over the old page, but hidden. Once the new page has finished loading it will be unhidden, the old page's 'transition-exit' stylesheet will be applied and the new page's 'transition-enter' stylesheet will be applied, for the specified durations of each stylesheet.

When navigating backwards, the CSS animations timeline will be reversed. This will have the effect of modifying the meaning of animation-direction like so;

| Forwards          | Backwards         |
| ----------------- | ----------------- |
| normal            | reverse           |
| reverse           | normal            |
| alternate         | alternate-reverse |
| alternate-reverse | alternate         |

and this will also alter the start time of the animation, depending on the declared total duration of the transition. For example, if a navigation stylesheet is declared to last 0.5s and an animation has a duration of 0.25s, when navigating backwards, that animation will effectively have an animation-delay of 0.25s. Similarly, if it already had an animation-delay of 0.1s, the animation-delay going backwards would become 0.15s, to reflect the time when the animation would have ended.

Layer ordering will also be reversed, that is, the page being navigated from will appear on top of the page being navigated backwards to.

## Signals

When a transition starts, a 'navigation-transition-start' NavigationTransitionEvent will be fired on the destination page. When this event is fired, the document will have had the applicable stylesheet applied and it will be visible, but will not yet have been painted on the screen since the stylesheet was applied. When the navigation transition duration is met, a 'navigation-transition-end' will be fired on the destination page. These signals can be used, amongst other things, to tidy up state and to initialise state. They can also be used to modify the DOM before the transition begins, allowing for customising the transition based on request data.

JavaScript execution could potentially cause a navigation transition to run indefinitely, it is left to the user agent's general purpose JavaScript hang detection to mitigate this circumstance.

## Considerations and limitations

Navigation transitions will not be applied if the new page does not finish loading within 1.5 seconds of its first paint. This can be mitigated by pre-loading documents, or by the use of service workers.

Stylesheet application duration will be timed from the first render after the stylesheets are applied. This should either synchronise exactly with CSS animation/transition timing, or it should be longer, but it should never be shorter.

Authors should be aware that using transitions will temporarily increase the memory footprint of their application during transitions. This can be mitigated by clear separation of UI and data, and/or by using JavaScript to manipulate the document and state when navigating to avoid keeping unused resources alive.

Navigation transitions will only be applied if both the navigating document has an exit transition and the target document has an enter transition. Similarly, when navigating backwards, the navigating document must have an enter transition and the target document must have an exit transition. Both documents must be on the same origin, or transitions will not apply. The exception to these rules is the first document load of the navigator. In this case, the enter transition will apply if all prior considerations are met.

## Default transitions

It is possible for the user agent to specify default transitions, so that navigation within a particular origin will always include navigation transitions unless they are explicitly disabled by that origin. This can be done by specifying navigation transition stylesheets with no href attribute, or that are empty.

Note that specifying default transitions in all situations may not be desirable due to the differing loading characteristics of pages on the web at large.

It is suggested that default transition stylesheets may be specified by extending the iframe element with custom 'default-transition-enter' and 'default-transition-exit' attributes.

## Examples

Simple slide between two pages:

[page-1.html]
```html
<head>
  <link rel="transition-exit" duration="0.25s" href="page-1-exit.css" />
  <style>
    body {
      border: 0;
      height: 100%;
    }

    #bg {
      width: 100%;
      height: 100%;
      background-color: red;
    }
  </style>
</head>
<body>
  <div id="bg" onclick="window.location='page-2.html'"></div>
</body>
```

[page-1-exit.css]
```css
#bg {
  animation-name: slide-left;
  animation-duration: 0.25s;
}

@keyframes slide-left {
  from {}
  to { transform: translateX(-100%); }
}
```

[page-2.html]
```html
<head>
  <link rel="transition-enter" duration="0.25s" href="page-2-enter.css" />
  <style>
    body {
      border: 0;
      height: 100%;
    }

    #bg {
      width: 100%;
      height: 100%;
      background-color: green;
    }
  </style>
</head>
<body>
  <div id="bg" onclick="history.back()"></div>
</body>
```

[page-2-enter.css]
```css
#bg {
  animation-name: slide-from-left;
  animation-duration: 0.25s;
}

@keyframes slide-from-left {
  from { transform: translateX(100%) }
  to {}
}
```
