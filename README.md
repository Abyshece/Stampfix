# Stampify

Digital loyalty cards in Google Wallet. Merchants create a campaign, customers scan a QR code to join, and stamps are tracked in a real database with proper auth.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind (CDN)
- **Backend**: Supabase (Postgres + Auth + Edge Functions)
- **Wallet**: Google Wallet API (signed JWT flow)

## Project layout

```
src/
  App.tsx                          Top-level routing (auth + URL params)
  components/
    LandingPage.tsx                Marketing site + login modal
    MerchantApp.tsx                Wraps the dashboard, owns the data loading
    MerchantOnboarding.tsx         Signup + campaign creation flow
    MerchantDashboard.tsx          Scanner, customers, analytics, settings, etc.
    CustomerApp.tsx                Magic-link signup + wallet view
    WalletCard.tsx                 The card UI + "Save to Google Wallet" button
  lib/
    supabase.ts                    Singleton Supabase client
    auth.ts                        useAuth hook + signup/login/magic-link helpers
    db.ts                          Typed data access layer (camelCase API)
  services/
    googleWallet.ts                Calls the Edge Function for the save URL
  types/
    index.ts                       Domain types (Campaign, UserCard, ActivityItem)
supabase/
  migrations/
    20260527000000_initial_schema.sql    Tables, RLS, triggers
  functions/
    generate-wallet-jwt/index.ts          Edge Function that signs the Wallet JWT
```

## Setup checklist

### 1. Apply the database schema

Open the SQL editor for your project:
- https://supabase.com/dashboard/project/odmqifttnhbqfvzjzrwg/sql/new

Paste the contents of `supabase/migrations/20260527000000_initial_schema.sql` and run it.

### 2. (Optional) Disable email confirmation for faster testing

For development, you may want to skip email confirmation so signup → dashboard is instant:
- https://supabase.com/dashboard/project/odmqifttnhbqfvzjzrwg/auth/providers → Email → toggle off "Confirm email"

If you leave it on, the signup flow shows a "check your email" screen and creates the campaign once you confirm and sign in. Both paths work; off is just faster.

### 3. Set the Site URL and redirect URLs

- https://supabase.com/dashboard/project/odmqifttnhbqfvzjzrwg/auth/url-configuration
- Site URL: `http://localhost:3000` (for dev)
- Add to "Redirect URLs": `http://localhost:3000/**` (and your production URL when deploying)

### 4. Run the frontend

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The `.env.local` file is already populated with your Supabase project credentials.

### 5. Set up Google Wallet (parallel)

You can use the entire merchant + customer flow without this — only the "Save to Google Wallet" button needs it. When you're ready:

**a) Create a Google Cloud project and enable the Wallet API**
- https://console.cloud.google.com/ → New Project → name it `stampify-wallet`
- APIs & Services → Library → search "Google Wallet API" → Enable

**b) Create a service account**
- IAM & Admin → Service Accounts → Create Service Account
- Name: `stampify-wallet-issuer`
- Grant no project-level roles (we'll authorize it inside the Wallet console)
- After creation: open the account → Keys → Add Key → Create new key → JSON → download

**c) Apply for a Wallet Issuer account**
- https://pay.google.com/business/console → Sign up → Loyalty / Gift / Generic passes
- For development you can request a temporary issuer ID instantly
- Once approved, note your **Issuer ID** (a long number like `3388000000022xxxxxx`)
- In the Wallet console → Users → Add user → paste the service account email (from the JSON, the `client_email` field) → grant "Developer" access

**d) Deploy the Edge Function**

Install the Supabase CLI (one-time):
```bash
brew install supabase/tap/supabase     # macOS
# or:  npm install -g supabase
```

Log in and link the project:
```bash
supabase login
supabase link --project-ref odmqifttnhbqfvzjzrwg
```

Set the secrets:
```bash
supabase secrets set GOOGLE_WALLET_ISSUER_ID=3388000000022xxxxxx
supabase secrets set GOOGLE_WALLET_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
supabase secrets set PUBLIC_APP_ORIGIN=http://localhost:3000
```

Deploy:
```bash
supabase functions deploy generate-wallet-jwt
```

That's it — the "Save to Google Wallet" button will start working immediately. Until you do this, clicking it shows a friendly error.

## How the auth flows work

**Merchant signup**
1. Fill form on `MerchantOnboarding`
2. `signUp()` creates the auth user with `role: 'merchant'` metadata
3. DB trigger `on_auth_user_created` auto-inserts a row in `merchants`
4. App creates the campaign for the new merchant
5. If email confirmation is on, form values are stashed in `sessionStorage` and the campaign is created after the user confirms and signs in

**Customer signup**
1. Customer scans QR → lands at `/?campaign=<uuid>`
2. Fills name + email → form values stashed in `sessionStorage`
3. We call `signInWithOtp` (magic link). Supabase sends them an email
4. They click the link → back to `/?campaign=<uuid>`, now authenticated
5. App auto-creates a `cards` row owned by their user id with the stashed name

**Wallet pass generation**
1. User clicks "Save to Google Wallet" on `WalletCard`
2. Frontend calls Edge Function with `{ cardId, campaignId }` and the user's JWT
3. Function authenticates the caller, loads card + campaign through the user's RLS context (so they can only get a pass for cards they're authorized to see)
4. Function exchanges service account JWT for an OAuth access token
5. Function upserts a `LoyaltyClass` (template) and `LoyaltyObject` (per-card instance)
6. Function signs a "skinny" JWT referencing the object ID
7. Frontend opens `https://pay.google.com/gp/v/save/<jwt>` → Android opens Google Wallet

## Updating wallet passes after stamp changes

Currently the LoyaltyObject is upserted with the latest stamp count whenever the user requests a save URL. To push real-time updates to a customer's existing Wallet pass (lock-screen notifications when their count changes), call the same upsert from a Supabase database trigger or a scheduled function. Not implemented in v1 — listed in the followups below.

## Followups / known gaps

- **Wallet pass updates**: today, stamping a customer's card only reflects in their Wallet pass on next save. To push live updates, deploy a "sync-wallet-object" function and call it from the stamp/redeem actions, or use a Postgres webhook on the `cards` table.
- **Real QR scanning**: the camera scanner currently calls `handleSimulateQRScan` which picks a random customer. Wiring it to a QR decoder library (e.g., `jsqr`) is straightforward but not in this build.
- **Customer-side activity history**: customers can only see their card, not their stamp history. Easy to add — the RLS policy already permits it.
- **Multiple campaigns per merchant**: schema supports it; UI assumes one.
- **Apple Wallet**: not in v1. The same Edge Function pattern works for `.pkpass` files but requires Apple Developer credentials.

## Deploying to production

When you deploy to Vercel:
1. Add the env vars from `.env.local` to Vercel
2. Add your production URL to Supabase's Redirect URLs and Site URL
3. Update the Edge Function secret: `supabase secrets set PUBLIC_APP_ORIGIN=https://your-domain.com`
4. In the Google Wallet console, add your production domain to the allowed origins
