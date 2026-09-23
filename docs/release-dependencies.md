# Redesign dependency review — 24 September 2026

No deployment performed. This release covers the websites and browser applications, not the log viewer's Electron desktop installer.

- **Nanawing:** runtime audit was zero; no dependency changes required.
- **Nanawing 2:** updated Wrangler and its matching Workers types, Vite, and compatible locked transitive dependencies. `npm audit` after Vite 8.3.0 installation reported zero vulnerabilities, including development tooling. Installed dependencies in the isolated worktree; removed only its node_modules junction before installation so the original checkout was untouched.
- **Log viewer:** compatible dependency refresh plus Vite 6.4.3 removes every production-dependency advisory. Parser suite remains 44/44. Older Electron packaging tooling still has development-only advisories; it is not invoked or shipped in this web release. A desktop release needs a separate Electron/tooling upgrade and installer test pass.
- **Website:** compatible lock refresh fixes ip-address. Three affected-package entries remain for one dependency chain: @cloudflare/puppeteer → @puppeteer/browsers → extract-zip. The Worker uses Cloudflare's remote Browser binding, not local browser download/archive installation. The final dry-run Worker bundle contains none of extract-zip, unpackArchive or @puppeteer/browsers. This is a scoped non-runtime exception, not a claim that the package is fixed. Do not use that package chain to extract untrusted archives or download local browsers. Recheck upstream before a future dependency update.

The reviewed [extract-zip symlink advisory](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) and [arbitrary-write advisory](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) have no patched extract-zip release listed. npm's proposed force fix downgrades the Cloudflare browser API to 0.0.11; that breaking downgrade was deliberately not applied.

Evidence: main `.wrangler/fixes-dependency-audit.json` and `.wrangler/fixes-bundle.log`; app `theme-dependency-audit-after.json`, `theme-vite-update.log`, `theme-release-tests.log`. Re-run audits against the locked release build before an authorized deployment.
