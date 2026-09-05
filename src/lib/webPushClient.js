/**
 * Client-Side Web Push Manager
 */

export async function registerServiceWorkerAndSubscribe(userEmail, role = "admin") {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { supported: false, error: "Web Push not supported in this browser." };
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // 2. Request Notification Permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { supported: true, permission: permission, error: "Notification permission denied by user." };
    }

    // 3. Check existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    // For demo/dev environments, if pushManager requires applicationServerKey, generate a standard dummy or subscribe
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
          )
        });
      } catch (subErr) {
        console.debug("Push manager subscribe notice:", subErr);
      }
    }

    // 4. Send subscription to backend if available
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription,
          userEmail: userEmail,
          role: role
        })
      }).catch(() => {});
    }

    return { supported: true, permission: permission, subscribed: !!subscription };
  } catch (err) {
    console.debug("Web Push setup error:", err);
    return { supported: true, error: err.message };
  }
}

/**
 * Directly fires a local desktop / browser Web Push notification test
 */
export async function triggerTestPushNotification(
  title = "Daily Task Missed: Ahmed ⚠️",
  body = 'Ahmed missed "LinkedIn Post" (Deadline passed at 09:00 AM).'
) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;

  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
  }

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body: body,
          icon: "/logo.jpeg",
          badge: "/favicon.ico",
          data: { url: "/dashboard/tasks" },
          tag: "missed-task-alert",
          vibrate: [200, 100, 200]
        });
        return true;
      }
    } catch (e) {
      console.debug("ServiceWorker notification error, falling back to Notification API:", e);
    }
  }

  try {
    new Notification(title, {
      body: body,
      icon: "/logo.jpeg"
    });
    return true;
  } catch (e) {
    console.debug("Notification API notice:", e);
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
