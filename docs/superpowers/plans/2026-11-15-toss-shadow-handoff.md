# Toss shadow token handoff

The experimental handoff reuses the token already issued within the existing Toss fetch process. It requires both an explicit one-shot command-line flag and an opt-in flag; neither is enabled by default. It sends the token only through child stdin, starts the child with an empty environment, and discards child stdout and stderr. Only a fixed status is logged. A timeout or failure does not turn a successful existing snapshot write into a failed fetch, though the process can wait up to 90 seconds.

The configured CLI and config must be owned by the operator, symlink-free and not group/world-writable; the CLI entry file additionally must match an operator-supplied SHA-256. This pins only the entry file, not its imported modules, runtime, or dependencies. Another application can still invalidate the token by issuing a new one.

**Operational hold:** Do not run `fetch-toss --shadow-once` against real credentials as a standalone pilot. It also writes the existing Observatory Toss snapshot and an extra invocation can invalidate another in-flight token. Safe one-time triggering inside the existing scheduled execution, account selection, runtime setup and review remain unresolved. This change does not set environment variables, configure a schedule, issue a live token, perform real collection, or promote economic data.

Validation uses synthetic responses, a real subprocess with synthetic input and a separate actual collector stdin error-path test; no financial APIs or private token files are touched.
