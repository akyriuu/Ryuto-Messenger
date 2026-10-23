# Ryuto Messenger — Browser Extension

Chrome and Firefox extensions for the Ryuto Messenger NestJS backend. Both browser packages share the same interface, account, and production backend; only the browser manifest and sidebar integration differ.

## Build

From this directory:

```bash
npm install
npm run build
```

This creates `dist-chrome/` and `dist-firefox/`. To build just one browser, run `npm run build:chrome` or `npm run build:firefox`.

The extension defaults to `https://ryuto-messenger.onrender.com`. To use another server, set `VITE_API_URL` and `VITE_SOCKET_URL` before building, then add that server to `host_permissions` in the matching `manifest.*.json`.

The extension uses the same username/password authentication, friend-request routes, message-history route, and Socket.IO events as the web frontend.

## Install in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `extension/dist-chrome/`.
3. After rebuilding, click Reload on the extension card.

## Install in Firefox

1. Build with `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `extension/dist-firefox/manifest.json`.
4. After rebuilding, load the add-on again. Temporary add-ons are removed when Firefox closes; permanent distribution requires signing through addons.mozilla.org.

The toolbar button opens Chrome's side panel or Firefox's sidebar. JWTs are saved in the browser's extension storage. The backend gateway authenticates realtime connections using `auth: { token }`.
