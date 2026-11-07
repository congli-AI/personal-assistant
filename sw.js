/* 个人助理 — Service Worker
 * 作用：离线缓存 + 后台标签页通知 + 通知点击回到 App
 * 注意：真正的「关掉页面也推送」需要服务端 Web Push，这里只做客户端能力
 */
"use strict";

var CACHE = "pa-shell-v1";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./settings.js",
  "./weather.js",
  "./schedule.js",
  "./cloud.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function (err) {
        console.warn("预缓存失败：", err);
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        });
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type !== "notify") return;
  self.registration
    .showNotification(data.title || "个人助理", {
      body: data.body || "",
      tag: data.tag || "pa-reminder",
      icon: "./icon.svg",
      badge: "./icon.svg",
    })
    .catch(function (err) {
      console.warn("显示通知失败：", err);
    });
});
