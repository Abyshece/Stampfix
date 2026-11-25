// Runs in Instagram pages, but only does something inside the Stampfix Phone
// (an Instagram frame whose outer page is an extension page): there it tells
// Instagram's own code it is on a phone, matching the mobile site the phone
// asks for. Normal Instagram tabs are not touched.
(() => {
  try {
    const anc = location.ancestorOrigins;
    if (!anc || !anc.length || !String(anc[anc.length - 1]).startsWith('chrome-extension://')) return;
    const major = (/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] || '140';
    const ua = `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`;
    const N = Navigator.prototype;
    const def = (key, value) => { try { Object.defineProperty(N, key, { get: () => value, configurable: true }); } catch { /* keep the real one */ } };
    def('userAgent', ua);
    def('appVersion', ua.slice('Mozilla/'.length));
    def('platform', 'Linux armv81');
    def('maxTouchPoints', 5);
    const real = navigator.userAgentData;
    if (real) {
      const low = { brands: real.brands, mobile: true, platform: 'Android' };
      def('userAgentData', {
        ...low,
        toJSON: () => low,
        getHighEntropyValues: (hints) => real.getHighEntropyValues(hints).then((v) => ({ ...v, mobile: true, platform: 'Android', platformVersion: '10.0.0', model: 'K', architecture: '', bitness: '' })),
      });
    }
  } catch { /* leave the page as it is */ }
})();
