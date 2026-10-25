// A previously installed service worker can serve an older app bundle during
// its own update. Reload once when the new worker takes control of this page.
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.() && navigator.serviceWorker.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
