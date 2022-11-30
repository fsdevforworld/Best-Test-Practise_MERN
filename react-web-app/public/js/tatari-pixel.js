/* eslint-disable */

/* 
Tatari Pixel - Advertising analytics to track conversion
Set-up: https://www.tatari.tv/reference/tracker
*/

!(function() {
  try {
    !(function(t, n) {
      if (!n.version) {
        (window.tatari = n),
          (n.init = function(t, e) {
            var i = function(t, e) {
              n[e] = function() {
                t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
              };
            };
            'track pageview identify'.split(' ').forEach(function(t) {
              i(n, t);
            }),
              (n._i = t),
              n.pageview();
          }),
          (n.version = 'latest');
        var e = t.createElement('script');
        (e.type = 'text/javascript'),
          (e.async = !0),
          (e.src = 'https://d2hrivdxn8ekm8.cloudfront.net/tracker-latest.min.js');
        var i = t.getElementsByTagName('script')[0];
        i.parentNode.insertBefore(e, i);
      }
    })(document, window.tatari || []);
  } catch (t) {
    console.log(t);
  }
})();
tatari.init('4975ac5f-2855-40ae-96c8-db4e8e903ad3');
