// Service Worker for Enterprise Web Push Notifications
self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Nexa Portal Alert", body: event.data.text() };
  }

  const title = data.title || "Daily Task Alert ⚠️";
  const options = {
    body: data.body || data.message || "A daily task update requires your attention.",
    icon: "/logo.jpeg",
    badge: "/favicon.ico",
    data: {
      url: data.url || "/dashboard/tasks",
      timestamp: Date.now(),
    },
    vibrate: [200, 100, 200],
    tag: data.tag || "task-alert",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard/tasks";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes("/dashboard/tasks") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
