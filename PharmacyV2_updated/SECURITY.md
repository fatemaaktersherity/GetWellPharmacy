# JWT signing secret — setup

`JwtSettings:SecretKey` used to be committed in plain text in `appsettings.json`.
That has been removed. Anyone who could read the source (or the git history)
could forge a valid Admin token, so the key must never live in a file that
gets committed. It now has to be supplied out-of-band:

- **Local development** → `dotnet user-secrets` (stored outside the repo, at
  `~/.microsoft/usersecrets/<UserSecretsId>/secrets.json` on your own
  machine — never checked into git).
- **Staging / Production** → the `JwtSettings__SecretKey` environment
  variable (note the double underscore — that's how ASP.NET Core's
  configuration system maps an env var to the nested `JwtSettings:SecretKey`
  key), or your platform's secret manager (Azure Key Vault, AWS Secrets
  Manager, etc.) wired in as a configuration provider.

The app checks this at startup, not just when a token is issued: it fails
fast with a clear error if the key is missing, shorter than 32 bytes (HS256
needs at least 256 bits), or still set to the old placeholder value.

## One-time local setup

From the `PharmacyV2_updated` project folder (the one with the `.csproj`):

```bash
# 1. Generate a strong random key (any of these work — 32+ bytes):
openssl rand -base64 48
# or, without openssl:
# python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# 2. Store it in user-secrets (NOT in appsettings.json):
dotnet user-secrets set "JwtSettings:SecretKey" "<paste the generated value here>"
```

`dotnet user-secrets` reads the `<UserSecretsId>` already present in
`PharmacyV2.csproj`, so no extra init step is needed. Every developer on the
team generates and sets their own key this way — it does not need to match
anyone else's, and it never needs to be shared or committed.

Run `dotnet user-secrets list` at any point to confirm the value is set.

## Production / staging

Set the environment variable before the app starts, e.g.:

```bash
export JwtSettings__SecretKey="$(openssl rand -base64 48)"
```

or configure it through your hosting platform's secret store and expose it
to the process as `JwtSettings__SecretKey`. Use a different key per
environment, and treat rotating it the same as rotating a database password
— it invalidates every previously-issued token, so users will need to log
in again after a rotation.

## What NOT to do

- Do not put the real key back in `appsettings.json` or
  `appsettings.Development.json` — both are committed to source control.
- Do not reuse the old placeholder value
  (`YourSuperSecretKeyForPharmacyV2MustBeAtLeast32Chars!`); the app now
  refuses to start with it.
- Do not share one key across environments (dev/staging/prod) or commit a
  key to a shared `.env` file inside the repo.
