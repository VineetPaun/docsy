// Tells Convex which JWT issuer to trust, so `ctx.auth.getUserIdentity()`
// resolves for requests carrying a Clerk token.
//
// CLERK_JWT_ISSUER_DOMAIN must be set on the *Convex deployment*, not in
// .env.local — `bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev`.
// The value is the "Issuer" shown on Clerk Dashboard → JWT Templates → convex.
//
// `applicationID` must match the token's `aud` claim, which Clerk's built-in
// "convex" JWT template sets to "convex". If you renamed that template, this
// has to match the new name or every request reads as anonymous.
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
