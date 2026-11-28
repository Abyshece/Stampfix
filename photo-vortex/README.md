# Photo Vortex

Sign in with Google, pick your photos, and fall through them in 3D. There are two worlds to compare:

- **Tornado**: one continuous, slowly spinning cylinder wall of your photos, packed edge to edge in a spiral. Newest photos are at the top and each year opens with its own year card. The wall keeps going as you descend: after your oldest photo it starts again from the newest. Click any photo and the camera flies up to it, with its neighbours still around it. Step inside to stand by the glowing pole of years, with the wall all around you.
- **Time Tunnel**: fly through a winding tunnel lined with your photos, from your first picture to today. Each year is a glowing gate you pass through.

In both worlds, any photo opens full screen, where you can zoom and pan. Zoom all the way out to fly back.

## Run it

Needs Node 18 or newer. There is nothing to install.

```bash
cd photo-vortex
npm start
```

Open http://localhost:8080. **Try it with sample photos** works straight away.

## Connect Google Photos

Since 31 March 2025, Google no longer lets apps read a person's whole Google Photos library. Instead, the [Google Photos Picker API](https://developers.google.com/photos/picker/guides/get-started-picker) opens Google's own picker window. There the person chooses photos (up to 2,000 per pick), and the app can read only those.

One-time setup in [Google Cloud console](https://console.cloud.google.com/):

1. Create a project, or pick an existing one.
2. **APIs & Services → Library**: search for **Photos Picker API** and enable it.
3. **Google Auth Platform → Branding / Audience**: set up the consent screen as *External*. While it is in *Testing*, add your own Google account under **Test users**.
4. **Data access**: add the scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
5. **Clients → Create client → Web application**. Under **Authorized JavaScript origins**, add `http://localhost:8080` and the address where you deploy the site.
6. Paste the client ID into `src/config.js` as `googleClientId`, then reload.

Then **Connect Google Photos** signs you in, opens the Google Photos picker, and builds your vortex from the photos you pick.

To open this up to everyone, not just test users, Google has to verify the app first. That is a review of the consent screen and privacy policy, done from the same console.

### Why there is a small server

Picked photos are served from Google's photo servers. Those servers need your access token and don't allow web pages to read the image data directly. So `api/google.js` is a tiny relay: the page sends it a request with your token, and it forwards the request to Google and passes the answer back. It only talks to `photospicker.googleapis.com` and `*.googleusercontent.com`, and it stores nothing. `server.js` runs it locally. On Vercel it runs as a serverless function.

## Deploy

- **Vercel**: create a project from this repository and set **Root Directory** to `photo-vortex`. The static files and `api/google.js` deploy as they are. Add the Vercel address to the OAuth client's JavaScript origins.
- **Any Node host**: run `npm start`. The `PORT` environment variable sets the port.

## Controls

| | Tornado (wall) | Time Tunnel |
|---|---|---|
| Scroll / swipe | Descend or climb through the years | Fly faster or back up |
| Drag | Circle the wall (look around when inside) | Steer |
| Pinch / Ctrl+scroll | Zoom toward the wall | |
| Click a photo | Fly up to it; click again to open it | Open it |
| Arrow keys (close-up) | Move along the wall | |
| Scroll in / out (close-up) | Open the photo / step back | |
| Year rail on the right | Jump to a year | Warp to a year |
| `1` / `2` | Switch worlds | Switch worlds |

## How it is built

Plain ES modules and [three.js](https://threejs.org/) from a CDN, with no build step.

- `src/worlds/tornado.js`: the wall. All tiles are drawn in one GPU call, and only the stretch near the camera is drawn, which is how it keeps going. Clicks are matched to tiles with cylinder maths rather than one mesh per photo.
- `src/worlds/tunnel.js`: the time tunnel, year gates and speed streaks.
- `src/photos.js`: loads each photo once. It keeps a 128px square crop in shared atlas textures for the wall, plus a small cache of sharper prints for close-ups and the tunnel.
- `src/google.js`: Google sign-in, the picker session, and fetching photos through the relay.
- `src/viewer.js`: the full-screen photo viewer.
- `src/audio.js`: optional wind and drone ambience, generated in the browser.

Up to 2,000 photos go into the world on a computer and 700 on a phone (see `src/config.js`).

## Credits

Sample photos are from [Lorem Picsum](https://picsum.photos/), which serves photos from Unsplash.
