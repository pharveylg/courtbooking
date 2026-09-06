# White Kitchen — Pickleball Court Booking App

A responsive, single-file web app for managing court reservations at **White Kitchen Pickleball Court**. Built with pure HTML, CSS, and JavaScript — no backend required. Data is stored in `localStorage` for persistence across reloads.

---

## 📁 Project Structure

```
pickleball-booking/
├── public/
│   └── index.html          ← Deploy target (copy from root)
├── index.html               ← Source (single-file app)
├── package.json              ← npm scripts for dev/deploy
├── firebase.json             ← Firebase Hosting config
├── .firebaserc               ← Firebase project link
├── .gitignore                ← Git ignore rules
├── copy-to-public.sh         ← Helper script to copy to public/
└── README.md                 ← This file
```

---

## 🚀 Quick Start (Local)

```bash
# 1. Copy app to public/ folder
chmod +x copy-to-public.sh && ./copy-to-public.sh
# — OR manually —
mkdir -p public && cp index.html public/index.html

# 2. Serve locally
npx serve public -l 3000

# 3. Open http://localhost:3000
```

---

## 🔥 Deploy to Firebase Hosting

### First-Time Setup

```bash
# 1. Install Firebase CLI
npm i -g firebase-tools

# 2. Login to Firebase
firebase login

# 3. Create a Firebase project at https://console.firebase.google.com
#    — Name it something like: white-kitchen-pickleball

# 4. Update .firebaserc with your project ID
#    Replace YOUR_FIREBASE_PROJECT_ID with your actual project ID
```

Edit `.firebaserc`:
```json
{
  "projects": {
    "default": "white-kitchen-pickleball"
  }
}
```

### Deploy

```bash
# 1. Copy app to public/
mkdir -p public && cp index.html public/index.html

# 2. Deploy to Firebase
firebase deploy

# Your site is live at:
# https://white-kitchen-pickleball.web.app
# https://white-kitchen-pickleball.firebaseapp.com
```

### Custom Domain on Firebase

1. Go to Firebase Console → Hosting → Custom domain
2. Add `book.whitekitchenpickleball.com`
3. Follow DNS verification steps (add TXT + A records)
4. Free SSL auto-provisioned

---

## 🐙 Deploy to GitHub Pages

### Setup

```bash
# 1. Create repo on GitHub
# 2. Push your code
git init
git add .
git commit -m "Initial commit — WK Pickleball Booking App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pickleball-booking.git
git push -u origin main
```

### Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)`
4. Click **Save**

> **Note:** GitHub Pages serves from root by default. Since `index.html` is in the root, it works immediately at:
> `https://YOUR_USERNAME.github.io/pickleball-booking/`

### Custom Domain on GitHub Pages

1. In repo Settings → Pages → Custom domain
2. Enter `book.whitekitchenpickleball.com`
3. Add a `CNAME` file to your repo root:
   ```
   book.whitekitchenpickleball.com
   ```
4. Point DNS: CNAME → `YOUR_USERNAME.github.io`

---

## 🔄 Workflow: Make Changes → Re-Deploy

### Firebase (manual)
```bash
cp index.html public/index.html
firebase deploy
```

### GitHub Pages (auto)
```bash
git add . && git commit -m "update" && git push
# GitHub Pages auto-deploys on push ✅
```

---

## 🔐 Admin Access

- **Default PIN:** `1234` (change in Admin → Security after login)
- **Public users** see only: **Book** + **Payment** tabs
- **Admin** sees all tabs: Book, Payment, Bookings, Admin Console
- Click the 🔒 **Staff** button in the header to unlock admin

---

## ⚙️ Technical Details

| Feature | Detail |
|---------|--------|
| **Stack** | Pure HTML5, CSS3, JavaScript (ES6+) |
| **Styling** | Tailwind CSS v4 (browser CDN) |
| **Data** | `localStorage` (persists per browser) |
| **Backend** | None — fully client-side |
| **Responsive** | Mobile-first, optimized for all screens |
| **Payment QR** | Admin uploads per channel (GCash / Maya / BPI) |
| **File size** | Single `index.html` ~85KB |

---

## 📋 Schedule

| Time | Type | Rate |
|------|------|------|
| 7:00 AM – 12:00 PM | Walk-in / Queue | ₱100 / head |
| 1:00 PM – 10:00 PM | Reservation | ₱300 / hour |
| Tue/Thu/Sat/Sun 5–10 PM | Staff Reserved | Not bookable |

---

## 📝 License

MIT — Free to use and modify.
