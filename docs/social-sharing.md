# Social sharing — local implementation

All canonical public pages have a persistent orange Share button at the bottom right, on desktop and mobile. Catalog pages also retain an inline Share action near the title/navigation. Both open the same accessible modal with Copy link, WhatsApp, Facebook, LinkedIn, X, email and native More apps when supported.

The dialog uses a public HTTPS canonical URL and page-specific Open Graph title/description. It never includes preview hosts, tracking/filter parameters or uploaded flight-log contents. There are no third-party sharing SDKs or background social requests. Opening a share destination lets the visitor complete their own post. Private/no-canonical pages and 404s intentionally do not advertise sharing.

Keyboard focus is contained by the native dialog; Escape closes it and returns focus. Clipboard failures expose a selectable link and useful status message. Native-share cancellation is silent; unsupported/blocked sharing falls back to the visible choices. Social link previews use server-rendered OG data, with large-image Twitter cards, rather than client-injected metadata.

Shared source: site/assets/family/share.js and share.css, loaded by the existing family entry script. Standalone copies live in each app's public/assets/family; simulator offline builds include these same-origin resources. The catalog's previous separate sharing code was replaced so it cannot leak localhost URLs.

Verified: homepage copy confirmation, mobile product dialog and clean product canonical; sitemap audit checks OG title, description, image, URL and Twitter card. Platform-side cache refresh and actual live unfurl appearance require deployment; nothing was posted to social accounts or deployed.

Implementation references: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share and https://ogp.me/ .
