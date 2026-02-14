# MutualWink

MutualWink is a trust-first X-login app for private attraction signals with reveal-on-match logic, consent gating, and safety controls.

## Live URLs

- https://mutualwink.com
- https://secret-admirer-app.web.app (legacy redirect)

## Features

- Login only with X (`twitter.com` via Firebase Auth)
- Username-based identity with profile sync after login
- Send up to 5 private signals
- Reveal names only on two-way match
- Privacy Policy and Terms pages (`/privacy`, `/terms`)
- Required consent capture (18+ + policy acceptance)
- Report user flow with retention metadata (`reports.purgeAt`)
- Block/unblock tooling (blocked users cannot interact)
- Immediate self-serve account/data deletion

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

## Compliance defaults in this build

- Legal owner: Shivam Kumar
- Contact/support/privacy/abuse/deletion email: `shivam7@outlook.in`
- Governing location: Bihar, India
- Policy effective/version baseline: February 14, 2026
- Minimum age: 18+
- Abuse report retention: 180 days

## Moderation and deletion behavior

- Blocking is bidirectional for interaction enforcement: blocked users cannot send signals to each other.
- Dashboard hides matches/sent entries for users blocked in either direction.
- Account deletion removes user-linked profile/graph data and auth account.
- Reports filed by deleting users are deleted.
- Reports received against deleting users are anonymized for safety/audit continuity.

## Firestore TTL setup (required)

Create a TTL policy in Firestore for collection `reports` using field `purgeAt`.

Console path:
- Firestore Database -> TTL policies -> Add policy
- Collection group: `reports`
- Timestamp field: `purgeAt`

This enables automatic cleanup for expired abuse reports.

## Deploy

Deploy functions first, then hosting/rules:

- Functions:
  - `firebase deploy --only functions`
- Hosting + Firestore rules:
  - `firebase deploy --only firestore:rules,hosting:app,hosting:www,hosting:legacy`

> Note: Callable functions enforce Firebase App Check in production.
