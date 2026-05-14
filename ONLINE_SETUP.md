# Online Friends Mode Setup

This fork adds:

- online room creation and invite links
- 4-player classic online play
- Teams 2v2 mode: Team A = Red + Blue, Team B = Green + Yellow
- browser voice chat using WebRTC mesh connections
- single-player mode against simple bots
- Vercel deployment configuration

## 1. Create Firebase Realtime Database

Create a Firebase project, enable Realtime Database, and copy the database URL. It looks like:

```text
https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
```

For quick friend testing, use the rules in `firebase-realtime-database.rules.json`.

Important: these rules are open for testing. Before making a public production game, replace them with authenticated/user-scoped rules.

## 2. Local environment

Create `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```text
REACT_APP_FIREBASE_DATABASE_URL=https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
```

## 3. Run locally

Use Node 16 for the old Create React App/Webpack stack:

```bash
nvm install 16
nvm use 16
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
yarn dev
```

Open:

```text
http://localhost:3000
```

## 4. Play online

1. Enter your name.
2. Click `Create Classic Room` or `Create Teams 2v2 Room`.
3. Copy the invite link.
4. Send the link to friends.
5. Each friend opens the link and clicks `Join Room`.
6. Click `Voice On` inside the online room panel.

## 5. Deploy to Vercel

Set this environment variable in Vercel Project Settings:

```text
REACT_APP_FIREBASE_DATABASE_URL=https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
```

Deploy:

```bash
npm i -g vercel
vercel
vercel --prod
```

The included `vercel.json` uses:

```text
NODE_OPTIONS=--openssl-legacy-provider yarn build
```

This is needed because the project uses an old Webpack stack.

## Notes

Voice chat uses direct WebRTC peer connections with public STUN servers. It works for most home/mobile networks, especially on HTTPS via Vercel. Some strict office/NAT networks may need a TURN server for reliable audio.
