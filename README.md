# Trade Schedule

A private little app for keeping track of guys and booking them in.

- **+ Add**: drop in screenshots (profile, pics, chats) and/or paste text. It reads them and fills in his profile (name, age, height, weight, distance, position, body, tribes, HIV status, hosting, phone, etc.) and cuts his photos out of the screenshots.
- If the chat mentions a time ("tomorrow 8pm", "fri arvo"), it suggests a booking.
- **Schedule**: drag a guy from "To book" onto a time. Drag bookings to move them, drag the bottom edge to make them longer, drag back to "To book" to unbook. On a phone: press and hold, then drag.
- Tap a booking or a guy to see/edit him, rate him, add notes.
- 🙈 blurs all photos.

## Privacy

Everything stays on your device (in the browser's storage). Nothing is uploaded. Use ⋯ → Backup to save a backup file.
The text reader (Tesseract) downloads once from a CDN; your images never leave the device.

## Run it

It's plain HTML/JS, no build. Serve the folder over https (e.g. GitHub Pages) or run `python3 -m http.server` and open http://localhost:8000.
