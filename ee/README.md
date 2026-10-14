# Enterprise (`ee/`)

Source-available enterprise features for Hypothesis Atlas: SSO, role-based access control, audit logs, and data retention controls.

## License

`ee/` is **not** AGPL. It is covered by the [Widsith Enterprise License](LICENSE.md) (**draft — pending legal review**): the source is visible so security teams can audit it, but production use requires a paid Widsith Enterprise subscription and license key. Everything outside `ee/` stays AGPL-3.0 / commercial dual-license, forever.

## Architecture rules

1. **Core never imports from `ee/`.** The AGPL core must build, test, and run with `ee/` deleted.
2. **Enterprise features plug in through extension points.** `ee/` modules register hooks or providers that core calls only if present.
3. **A license key enables features at runtime.** No separate codebase, no fork — self-hosters upgrade from free to Enterprise by adding a key, not by switching codebases.
4. **Nothing customer-specific lives here.** Hosted-cloud infrastructure, deploy configs, billing, license-key signing secrets, and customer-specific connectors stay private.

## Status

Boundary documented; implementation deferred until the first enterprise design partner, so we build what buyers will actually pay for. Tracked in [#68](https://github.com/widsith-ai/hypothesis-atlas/issues/68).

## Planned modules

- `sso/` — OIDC/SAML identity providers, per-organization IdP configuration, just-in-time provisioning
- `rbac/` — roles (admin, member, viewer), API-route enforcement
- `audit-logs/` — append-only security event log, admin viewer, export
- `retention/` — configurable retention windows, scheduled hard delete, admin purge tools
