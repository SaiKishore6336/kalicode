# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |

## Reporting a vulnerability

Please report security issues privately through GitHub's
[security advisories](../../security/advisories/new) rather than opening a
public issue.

Include:

- A description of the issue and its impact
- Steps to reproduce or a proof of concept
- Affected version and platform
- Any suggested fix

You can expect an acknowledgement within a few days. Please allow time for a
fix to be prepared before disclosing the issue publicly.

## Scope

KaliCode runs with the privileges of the user who launches it and executes
workspace code only when the user explicitly runs a file or task. Reports about
the renderer sandbox, the `window.kali` preload bridge, the custom `app://`
protocol, and the PTY bridge are especially relevant.
