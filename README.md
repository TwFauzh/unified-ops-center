# Unified Ops Center

Angular UI from the new LLS server, with Ops Center functionality wired to a new Firebase backend.

## What is included
- Firebase Auth login
- Pterodactyl key binding + test
- Server status + power controls
- Maintenance mode controls
- Discord announcements + preview
- Command execution panel

## Frontend setup
1. Update Firebase config:
   - Edit `src/config/firebase.config.ts` with your new Firebase project values.
2. Update API base URL if needed:
   - Edit `src/config/app.config.ts` (default `http://localhost:3001`).
3. Install dependencies and start:
   - `npm install`
   - `npm run dev`

## Backend setup
1. Create `api/.env` from `api/.env.example`.
2. Add your Firebase Admin service account key:
   - Save as `api/serviceAccountKey.json`.
3. Install dependencies and start:
   - `cd api`
   - `npm install`
   - `npm run dev`

## Notes
- `api/.env` and `api/serviceAccountKey.json` are ignored by git.
- After changing `package.json`, run `npm install` to update `package-lock.json`.
