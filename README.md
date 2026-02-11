# Secret Admirer (Phase 1)

Username-first anonymous admirer app with reveal-on-match logic.

## Live URL

- https://secret-admirer-app.web.app

## Phase 1 features

- Username-based identity (no email in UX)
- Anonymous auth session for MVP
- Claim unique username
- Add up to 5 secret admirers
- Optional secret message (up to 300 chars)
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
3. Install deps:
   - `npm install`
   - `cd functions && npm install`
4. Run app:
   - `npm run dev`

## Deploy

- Hosting + Firestore rules:
  - `firebase deploy --only firestore:rules,hosting`
- Functions:
  - `firebase deploy --only functions`

> Note: Cloud Functions deployment currently requires Blaze plan for this Firebase project.
