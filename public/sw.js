// Service Worker - Minimal implementation
// This prevents 404 errors from PWA-related requests

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // For now, just pass through all requests to the network
  event.respondWith(fetch(event.request));
});
