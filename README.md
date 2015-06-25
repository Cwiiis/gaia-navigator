# gaia-navigator

Gaia Navigator is a partial implementation of a specification proposal for [CSS navigation transitions](http://cwiiis.github.io/gaia-navigator).

## Limitations

* Each page must include [gaia-navigator.js](gaia-navigator.js). After the first navigation, each subsequent page will be wrapped in an iframe.
* The first page must take care to remove event listeners that may continue to fire after navigation. Attaching to the `navigationtransitionend` event may aid in this.
* For reverse animations to work correctly, CSS property `animation-delay` must always be specified together with `animation-duration`.
* Direct manipulation of the history and location objects will have unexpected results, instead use the shim objects available via `gnc_getHistory` and `gnc_getLocation`.
* The CSSOM for this specification is not available using this shim.

## TODO

* Support `navigation-transition-z-index` property
* Support `navigation-transition-start` property
* Support a preload spec

---

## Examples

Simple slide between two pages:

[page-1.html]
```html
<head>
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

    @navigation-transition exit 0.25s {
      #bg {
        animation-name: slide-left;
        animation-duration: 0.25s;
      }
    }

    @keyframes slide-left {
      from {}
      to { transform: translateX(-100%); }
    }
  </style>
</head>
<body>
  <div id="bg" onclick="window.location='page-2.html'"></div>
</body>
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

    @navigation-transition enter 0.25s {
      #bg {
        animation-name: slide-from-left;
        animation-duration: 0.25s;
      }
    }

    @keyframes slide-from-left {
      from { transform: translateX(100%) }
    }
  </style>
</head>
<body>
  <div id="bg" onclick="history.back()"></div>
</body>
```

