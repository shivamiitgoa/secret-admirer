# Secret Admirer (Phase 1)

X-login-only admirer app with reveal-on-match logic.

## Live URL

- https://secret-admirer-app.web.app

## Phase 1 features

- Username-based identity (no email in UX)
- Login only with X (`twitter.com` via Firebase Auth)
- Auto-sync X username after login
- Add up to 5 secret admirers
- Reveal only if there is a two-way match
- Dashboard with incoming count, sent count, and matches

## Tech

- React + Vite
- Firebase Hosting
- Firestore
- Cloud Functions (2nd gen)
- Firebase App Check (reCAPTCHA Enterprise)

## Local setup

1. Copy env:
   - `cp .env.example .env`
2. Fill Firebase web app keys in `.env`
3. In Firebase Console, enable Auth provider:
   - Authentication -> Sign-in method -> `Twitter` provider
   - Add your X API key + API secret
   - In your X developer app, set callback URL to:
     - `https://<your-auth-domain>/__/auth/handler`
     - Example: `https://secret-admirer-app.firebaseapp.com/__/auth/handler`
4. Configure App Check for your web app:
   - App Check -> select web app -> reCAPTCHA Enterprise
   - Copy site key into `.env` as `VITE_FIREBASE_APPCHECK_SITE_KEY`
   - Add allowed domains including your Hosting domains and `localhost`
5. Set authorized domain(s) for local + production
   - Example local domain: `localhost`
6. Install deps:
   - `npm install`
   - `cd functions && npm install`
7. Run app:
   - `npm run dev`

## Deploy

- Hosting + Firestore rules:
  - `firebase deploy --only firestore:rules,hosting`
- Functions:
  - `firebase deploy --only functions`

> Note: Callable functions enforce Firebase App Check in production.
