# SMV Logistics Console (PWA) — OTP Login with Check-User

**What’s inside**
- OTP login flow with **check-user → send-otp → verify-otp**
- Protected routes via middleware (httpOnly cookie `smv_token`)
- Passport OCR (client-side, camera/upload) + search by passport/order
- Status update actions
- PWA enabled (next-pwa)
- Server-side proxy to SMV APIs (avoids CORS, keeps secrets safe)

## Configure
Copy `.env.example` → `.env.local` and set:
```
SMV_API_BASE=https://api.live.stampmyvisa.com
SMV_CHECK_USER_PATH=/v1/auth/check-user
SMV_SEND_OTP_PATH=/v1/auth/send-login-otp
SMV_VERIFY_OTP_PATH=/v1/auth/verify-login-otp
# Optional auth fallback if verify doesn’t return access_token:
# SMV_API_BEARER=...
# or SMV_API_KEY_HEADER=x-api-key / SMV_API_KEY=...
# Optional:
# SMV_UPDATE_STATUS_PATH=/v1/logistics/update-status
# NEXT_PUBLIC_BASE_URL=https://yourapp.onrender.com
```

## Run
```bash
npm i
npm run dev
# open http://localhost:3000/login
```

## Deploy to Render (Web Service)
- Build: `npm install && npm run build`
- Start: `npm start`
- Health: `/api/health`
- Set env vars as above

## Auth UX
1) User types **email or phone**
2) App calls `/api/auth/check-user?method=EMAIL|PHONE&identifier=...`
3) If OK → `POST /api/auth/send-otp` (server proxies to SMV)
4) User enters **OTP** → `POST /api/auth/verify-otp`
5) Server stores `access_token` as httpOnly cookie → user redirected to `/`

## Logistics APIs (server-proxied)
- `POST /api/smv/search-passport` → `/v1/logistics/search` with `{ passport_number }`
- `POST /api/smv/search-order` → `/v1/logistics/search-on-order-level` with `{ order_id }`
- `POST /api/smv/status-update` → `/v1/logistics/update-status` with `{ order_id, status, note, at }`

> Adjust payloads if your backend differs — code is isolated per route for easy edits.


---
## One‑click deploy with Render Blueprint
1. Push this repo to GitHub (use `scripts/init_repo.sh` for convenience).
2. In Render: **New → Blueprint** → select your repo → confirm.
3. Render will read `render.yaml`, set env vars, build, and start the web service.
4. Open the URL → `/login` to sign in via OTP.

> If you prefer Web Service (not Blueprint): New → Web Service, then copy the build/start commands and env vars from `render.yaml`.
