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

The extension removes Instagram's two "don't embed me" headers only for
Instagram frames in its own panel, frames outside any tab (the side panel) and
navigations Instagram starts inside its own frame. Anywhere but the panel such a
frame is logged out, so no website can use this to act as you. It reads nothing
from Instagram, sends nothing anywhere and never sends messages by itself.

## Install

1. Download `stampfix-phone.zip` from the Instagram tab (or zip this folder) and unzip it.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and choose the `stampfix-phone` folder.
4. Reload the admin panel. "Copy & open chat" opens the phone on that chat; pin
   Stampfix Phone from the puzzle icon to open it any time.

## Files

- `background.js`: the frame rules, and opening the panel when the admin panel asks.
- `bridge.js`: runs on stampfix.app; marks the page and passes on "open this Instagram page".
- `panel.html`, `panel.js`, `panel.css`: the phone.

After changing anything here, rebuild the download:
`cd browser-extension && rm -f ../public/stampfix-phone.zip && zip -rX ../public/stampfix-phone.zip stampfix-phone`
