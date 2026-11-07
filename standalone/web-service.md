# The Push 3 local web service

Push 3 runs a small web service on your local network. Live uses it when you browse or send files to the Push from Live's browser. Measured on one Push 3 (web service release 2.4.15, firmware package 1.5.4) from a Mac on the same Wi-Fi; nothing installed on the Push.

This interface is undocumented and private to Ableton. It can change with any update. To send devices, presets and samples to the Push, use Live's browser (below): it is the supported route.

## How it works

Think of it as a reception desk inside the Push. Before it answers, it asks you to prove you are standing next to the Push: it shows a six-digit code on the Push's screen, and you read it back. In exchange you get a visitor badge (a token) that you show with every later request. The desk only works while the Push is in Standalone Mode; tethered, it is there but cannot hand out badges.

## Getting devices onto the Push (documented route)

With the Push in Standalone Mode on the same Wi-Fi as the computer, the Push appears in Live's browser under Places. Click Connect, enter the six-digit code shown on the Push, then drag a whole Project folder (a Set with its devices, after Collect All and Save) onto Projects, or presets and samples onto User Library. Freeze a Max for Live device first, so its scripts, gen~ files and externals travel inside the `.amxd`.

## What was measured

- **Address:** the Push announces itself as `push.local` (mDNS), web service on port 80. It answers on port 80 even while tethered.
- **Pairing:** `POST /api/v1/challenge` (body `{}`) makes the Push show a six-digit code; `POST /api/v1/challenge-response` with `{"secret":"<code>"}` returns a 64-character token. Send it as the header `Ableton-Challenge-Response-Token` on every later request; other header names are ignored. Wrong codes are rate limited. The token stays valid for 30 days.
- **Standalone Mode only:** tethered, every request answers `401 Unset credentials`, and the challenge fails with a `500` error, because pairing is relayed to the Push's own program, which only listens in Standalone Mode.
- **Read-only routes that answer after pairing:** `system/version` (`{"release":"2.4.15"}`), the system log (`syslog`, `syslog/current`, `syslog/zip`), `bundle-logs` (a zip with Live's log, the Push program's log, the web service log and preferences), and `files/` (a listing of Sets, Factory Packs, Live Recordings, User Library and crash reports).
- **CPU without looking at the screen:** `bundle-logs` contains `launcher.log`, with one line per minute giving Live's and the Push program's CPU use (idle Live: 3 to 8 %).
- **No screenshots:** the Push's own screenshot page asks the service for a picture, and the service answers `404` on a production Push.
- **Speed:** downloads from the Push run at about 21 MB/s over Wi-Fi. Uploads are slower: each request costs about 1.3 s, then about 2 MB/s, so a device of a few MB arrives in a few seconds. Live's own transfers go through the same file routes, and the files land in `User Library` on the Push.

## Not covered here

This page doesn't describe how to write, move or delete files on the Push through this service, or how to change system settings. Those routes exist, but mistakes there can lose your Sets and samples. Use Live's browser.
