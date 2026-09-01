# Trademark policy

The **code** in this repository is licensed under the Apache License 2.0. The **name**
"OpenMasq", the OpenMasq logo, and the associated domain names are not — they are
trademarks of the project, and the licence explicitly does not grant rights to them
(Apache-2.0, section 6).

This is the usual arrangement for a security product, and the reason is practical rather
than proprietary: a user who downloads something called "OpenMasq" is trusting a claim
about where their data goes. That claim can only be verified against builds this project
actually produces.

## What you may do without asking

- Use, modify, and redistribute the code, under Apache-2.0.
- Say that your product **is based on**, **is derived from**, or **is a fork of**
  OpenMasq — factual, descriptive references are welcome and need no permission.
- Keep the trademarks in unmodified source files and in the `NOTICE` file. You are not
  required to strip them, and you should not.
- Refer to the project by name in documentation, articles, talks and comparisons.

## What needs a different name

If you distribute a **modified build**, please release it under your own name and icon.
Concretely, change these before publishing:

- `packages/branding/branding.json` — the name, slug, domains, URL scheme and bundle
  identifier all derive from this one file.
- The application icon and any artwork carrying the mark.

A fork that ships under the OpenMasq name would make it impossible for anyone to tell
whose redaction engine, and whose build, they are running.

## What is not allowed

- Presenting a modified build as official, endorsed by, or affiliated with the project.
- Using the name or logo in a way that suggests the project vouches for your security
  claims, audits, or availability.
- Registering domains, app-store listings, package names or social accounts that could
  reasonably be mistaken for the project's own.

## Questions

Uses this document does not cover — a conference, a course, a comparison, a distribution
channel — are usually fine. Ask first at the address in [`SECURITY.md`](SECURITY.md); a
short description of what you intend is enough.
