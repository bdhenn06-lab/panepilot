# Whiteline free preview

Keep `NEXT_PUBLIC_BILLING_ENABLED=false`. No Stripe account, card, or paid subscription is needed for this release. Never install the local `supabase/seed.sql` in production: it contains public development passwords.

## Release order

1. Back up the existing database. Confirm migrations 0001–0007 are already present and inspect for mismatched tenant/parcel references. Do not delete customer records to force a migration through.
2. Build and test the release branch: `npm ci`, `npm test`, `npm run test:database`, `npm run lint`, `npm run build`.
3. Deploy a preview from the release branch. Current Vercel preview settings share the production Supabase project; do not run destructive smoke tests there.
4. In a short coordinated rollout, apply 0008 and 0009, then promote the matching application deployment. Old application versions use direct writes that these migrations deliberately disallow. A frontend-only rollback is insufficient after the permission upgrade.
5. Confirm `NEXT_PUBLIC_SUPABASE_URL` and the publishable key target the existing PanePilot project. Keep billing false. Set `APP_URL=https://panepilot.vercel.app`.
6. In Supabase Auth, set the site URL to the production URL and allow `/auth/callback` for production and the specific test preview URL. Preserve email confirmation for real users.
7. Use real individual accounts and a Whiteline workspace. Set company identity and territory in Settings. Invite links work without Resend, and must be accepted by the invited email address. Do not share development passwords.

## Acceptance walkthrough

- Sign up or sign in; create/reach the correct workspace, and verify a second workspace switches correctly.
- Import a representative CSV or Hamilton CAGIS source. Review column mapping and missing-data warnings first.
- Open a prospect, add a note, change its status, and reload. Confirm persistence.
- Re-import a file with matching parcel IDs. Confirm the same prospect retains its note/status.
- On two accounts, change different fields. A stale note edit must show a conflict rather than overwrite a teammate's note.
- Add map/route stops, open the directions link, and generate a proposal.
- Verify free-preview wording and disabled payment endpoints.
- Ask Whiteline which rankings make sense, how estimates compare to actual quotes, what data is missing, and which steps they would use weekly.

## Verification boundaries

`test:database` uses embedded PostgreSQL to apply every migration and exercise RLS, import rollback, notes conflicts, billing permissions and event handling. It does not replace a hosted Supabase auth/realtime check. `npm run smoke` is for a disposable local Supabase stack only; it creates a scratch workspace.

Pricing and crew-time figures are estimates from parcel records and assumptions. Validate them with Whiteline before using them as customer quotes. Map markers are capped at 600 and routing is a nearest-neighbor heuristic.

## Future paid launch

Before enabling billing, configure and test Stripe prices, portal, webhook signature secret, and service-role access; exercise first purchase, retry, plan change, delinquency, cancellation, and resubscription. Decide support contact, customer terms and refund policy. The free preview intentionally does not require these integrations.
