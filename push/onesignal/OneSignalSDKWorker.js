/* OneSignal's service worker. Kept in its own folder because two service workers cannot share
   a scope — registering this at the app root would evict sw.js, and vice versa.

   The imported filename is OneSignalSDK.sw.js, not OneSignalSDKWorker.js: v16 renamed the CDN
   files and the old name 404s. Worth spelling out because the failure is invisible from the
   outside — this file still serves 200, the import inside it is what breaks, and the browser
   reports the whole thing only as "NetworkError: Load failed". */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
