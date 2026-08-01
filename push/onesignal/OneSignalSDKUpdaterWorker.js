/* Legacy companion to OneSignalSDKWorker.js. The v16 SDK does not use it, but the dashboard
   still has a filename field for it and older browsers may request it — a 404 here looks like
   a broken push setup, so it exists and points at the same SDK worker. */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
