---
author: Joseph Ward
pubDatetime: 2026-05-03T19:10:00Z
title: "Kiosk Watchdog: A Tiny Chrome Extension for Abandoned Kiosk Sessions"
slug: kiosk-watchdog-chrome-extension
featured: true
draft: false
tags:
  - chrome-extension
  - kiosk
  - manifest-v3
  - homelab
  - project
ogImage: ../../assets/images/kiosk-watchdog-promo.png
description: A small Manifest V3 Chrome extension that returns a kiosk browser to its home URL when someone abandons a transaction mid-login. The whole story, plus how it works.
---

We run a few self-service kiosks in our teaching labs. The flow is straightforward: a student walks up, swipes their card, gets bounced through SSO and MFA, and lands back on a kiosk page that lets them check out a hot plate or sign up for a lab section.

The flow breaks in one specific way that drove me crazy: a user starts the transaction, gets redirected to the SSO login page, realizes they don't have their phone for the multi-factor prompt, and **walks away.** The browser is now stuck on a half-completed login screen tied to *their* university account. The next person who walks up sees that screen.

That is bad.

I went looking for an off-the-shelf fix. Existing kiosk-mode tools (Windows Assigned Access, Chrome's kiosk flag, etc.) are great at locking *down* a browser, but none of them solve "the user got pulled out of the kiosk URL by an SSO redirect, and now we need to bounce them back home if they don't finish in time." That's a much narrower problem, and the answer turned out to be a tiny browser extension.

## What it does

[Kiosk Watchdog](https://github.com/team-ward-labs/kiosk-watchdog) is a ~150-line Manifest V3 Chrome extension. It does exactly one thing:

| Event | Action |
|---|---|
| Tab is on a URL **starting with** the configured kiosk URL | Cancel any pending reset for that tab |
| Tab navigates **off** the kiosk URL (e.g. an SSO login page) | Start a per-tab timer |
| Timer fires and the tab is still off-kiosk | Navigate the tab back to the kiosk home URL |
| Tab returns to the kiosk URL before the timer fires | Cancel the timer |
| Tab closes | Clear its pending timer |

Two settings, both stored in `chrome.storage.sync` so they travel with a managed Google profile if you want them to:

- **Kiosk URL** — treated as a prefix. `https://kiosk.example.org/app/` covers `…/app/auth`, `…/app/scan`, anything else under that path. Anything outside the prefix (your IdP, MFA provider, errant ad domain, whatever) counts as "off."
- **Timeout (seconds)** — how long off-kiosk we'll tolerate before yanking the session back home.

That's it. Two inputs, one output.

## How it works under the hood

The whole thing is a service worker that listens to three Chrome APIs:

```js
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    evaluateTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(/* ... */);
chrome.tabs.onRemoved.addListener(/* ... */);
```

When `evaluateTab` decides a tab is off-kiosk, it schedules a `chrome.alarms` alarm named after the tab ID:

```js
const alarmName = (tabId) => `kiosk-reset-${tabId}`;

await chrome.alarms.create(alarmName(tabId), { delayInMinutes: timeoutSeconds / 60 });
```

When the alarm fires, the listener double-checks the tab is **still** off-kiosk (the user might have completed login since the alarm was set) and then redirects:

```js
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // ...
  const tab = await chrome.tabs.get(tabId);
  if (!isOnKiosk(tab.url, kioskUrl)) {
    await chrome.tabs.update(tabId, { url: kioskUrl });
  }
});
```

A few things matter here:

- **`chrome.alarms` instead of `setTimeout`.** Manifest V3 service workers can be killed by Chrome at any time. Alarms persist across kills. Timers don't.
- **Per-tab alarms, keyed on `tabId`.** Avoids one tab's timer cancelling another's. Most kiosks run one tab, but I want the extension to be correct on the day someone opens a second.
- **Re-check before yank.** Race: alarm scheduled at T0, user finishes login at T+45s, alarm fires at T+60s. We check the *current* URL, not the URL we saw when scheduling, so completed logins don't get bumped.
- **Continuous off-kiosk time.** When the user clicks through SSO → MFA → consent screen, each navigation is "off-kiosk" but `chrome.alarms.create` with the same name **replaces** the existing alarm. That means the timer counts continuous time off-kiosk, not per-page-load time. Tune your timeout to the worst-case real login (45–90 s for our flows).

## Installation

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/kiosk-watchdog/dpjkmdmdcngfgpeoknnhkigdlpleohje), or load it unpacked from the [GitHub repo](https://github.com/team-ward-labs/kiosk-watchdog) — both options are documented in the README.

For a lab fleet, the right move is Chrome Enterprise policy. The README has the recipe:

- `ExtensionInstallForcelist` to push the extension and pin its ID
- `ExtensionSettings` managed storage to pre-seed `kioskUrl` and `timeoutSeconds` so kiosks self-configure on first boot

## Try it without a real kiosk

If you want to see it work before deploying, the README has a 4-step demo using `example.com` (which is IANA-reserved for exactly this kind of thing — RFC 2606). Set the kiosk URL to `https://example.com/`, set the timeout to 15 seconds, navigate the tab anywhere else, wait. The tab snaps back. No infrastructure, no test environment.

## Source and license

- **Repo:** [team-ward-labs/kiosk-watchdog](https://github.com/team-ward-labs/kiosk-watchdog)
- **License:** MIT
- **Manifest:** V3 (the current standard; required for new submissions to the Chrome Web Store as of 2024)

If you run kiosks and have hit this same problem, give it a try. Issues and PRs welcome.
