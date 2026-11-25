# Stampfix Phone

A small Chrome extension for the Outreach → Instagram tab of the Stampfix admin
panel. It shows Instagram, logged in with your normal Instagram, in Chrome's side
panel at the right of the window, so you can paste and send outreach messages
without switching windows.

## Why an extension

Instagram can't be shown inside a website: it sends `X-Frame-Options: DENY`, and
its login cookies (no `SameSite`, so Chrome treats them as `Lax`) are never sent
to Instagram embedded in another site. Chrome does treat a site shown inside an
extension's own page as if you had opened it yourself, so the login works there.

Inside the phone only (Instagram frames in the extension's panel, which belongs
to no tab, and navigations Instagram starts inside its own frame):

- Instagram's two "don't embed me" headers are lifted, and its page requests are
  labelled as ordinary page loads (`Sec-Fetch-Dest: document`): Meta answers
  requests labelled as embedded frames with an error page.
- Instagram is asked for its mobile site (an Android Chrome user agent, and
  `mobile.js` tells Instagram's own code the same), like Chrome's device mode, so
  the phone shows Instagram's phone layout.

Normal Instagram tabs are not touched. Anywhere but the panel such a frame is
logged out, so no website can use this to act as you. The extension checks only
whether Instagram's login cookie exists (to show "Log in to Instagram"), keeps a
short list of the addresses the phone loaded ("Details", this browser session
only), sends nothing anywhere and never sends messages by itself.

## Install

1. Download `stampfix-phone.zip` from the Instagram tab (or zip this folder) and unzip it.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and choose the `stampfix-phone` folder.
4. Reload the admin panel. "Copy & open chat" opens the phone on that chat; pin
   Stampfix Phone from the puzzle icon to open it any time.
5. Not logged in? The phone shows **Log in to Instagram**, which opens Instagram's
   login in a normal tab. Once you're in, the phone opens the chat by itself.

To update: unzip the new download over the old folder, then click the reload
arrow on Stampfix Phone in `chrome://extensions`, and reload the admin panel.

## Files

- `background.js`: the frame rules, and opening the panel when the admin panel asks.
- `bridge.js`: runs on stampfix.app; marks the page and passes on "open this Instagram page".
- `mobile.js`: runs in Instagram frames inside the phone only; tells Instagram's code it's on a phone.
- `panel.html`, `panel.js`, `panel.css`: the phone, its login screen and Details.

After a change, also raise `version` in `manifest.json` and `PHONE_VERSION` in
`src/lib/outreach.ts` (the admin panel then offers the update).

After changing anything here, rebuild the download:
`cd browser-extension && rm -f ../public/stampfix-phone.zip && zip -rX ../public/stampfix-phone.zip stampfix-phone`
