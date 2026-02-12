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
- Cloud Functions (planned deployment once Blaze plan enabled)

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
4. Set authorized domain(s) for local + production
   - Example local domain: `localhost`
5. Install deps:
   - `npm install`
   - `cd functions && npm install`
6. Run app:
   - `npm run dev`

## Deploy

- Hosting + Firestore rules:
  - `firebase deploy --only firestore:rules,hosting`
- Functions:
  - `firebase deploy --only functions`

> Note: Cloud Functions deployment currently requires Blaze plan for this Firebase project.
