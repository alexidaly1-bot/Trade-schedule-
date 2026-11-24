# ButtMate (Trade schedule)

Private planner for meet-ups, prep time and a partner "I'm good to go" button. Built from the FlowMate handoff in `docs/handoff/`.

## Run it

Any static web server works:

```
python3 -m http.server 8000
# open http://localhost:8000
```

Install it from the browser ("Add to Home Screen") on iPhone/Android, or "Install app" on desktop. One codebase covers all four platforms.

Tests: `npm test` (scheduling, prep, clash, sharing privacy, screenshot reading).

## How it works

- **Everything stays on the device.** Records in localStorage, images in IndexedDB. No server, no account.
- **App lock**: PIN (hashed). Re-locks after 5 min in the background.
- **Screenshots** are read on the device (Tesseract.js, downloaded once). Nothing is saved until you check it.
- **Prep time** is blocked before every meet-up and only shown to you. Saving checks for clashes and suggests the next free slot.
- **Share links** carry a snapshot of free/busy times inside the link. No names, meet-ups, totals, profiles or avatars.
- **Partner replies** ("I'm good to go", "Request a time") come back as a link the partner sends you. Opening it updates the app.
- **Alerts** are plain ("Plans updated", "Time to get ready").
- **Avatars** are drawn on the device and always clothed. "Cover private areas" is a manual cover/blur tool. The original photo is never changed.

## Limits in this version (no backend)

- "Stop sharing" ignores replies from that link straight away. A copy someone already has still shows its old snapshot until it expires.
- Prep reminders fire only while the app is open (no push server).
- AI avatar help and AI custom features aren't connected. Custom features are added as labels.

## Open questions from the handoff — how they were resolved

- Partner/shared viewer never see Home, Roster or the owner "All set"/"Something went wrong" buttons. They get their own confirm screens.
- Cancelling a meet-up now asks "Are you sure?".
