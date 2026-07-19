# Wings admin — manual UI checklist

The automated suite (`npm run wings:test`) covers pages, auth, proxy, data
shape and the decide lifecycle. This checklist covers what only a human in a
real browser can judge. Run it after UI changes, against
`http://127.0.0.1:8787/wings/admin` (token in `.dev.vars`) or the deployed
admin.

## Gate
- [ ] Fresh browser (or after clearing the `wingsAdminToken` localStorage key): token gate shows, no flash of admin content
- [ ] Wrong token → "Wrong token." message, still gated
- [ ] Correct token → panel loads; reload keeps you signed in (token persisted)
- [ ] With no `WINGS_ADMIN_TOKEN` secret set on the Worker: panel says "Admin not configured" (production-safety default)

## Header & filters
- [ ] Stats show live / likely-wings counts matching the data
- [ ] Status group: New / Accepted / Rejected buttons carry counts; exactly one active
- [ ] Default state: New + Likely wings + In stock
- [ ] Switching to Accepted or Rejected dims + disables the likely/stock controls (they only shape the New queue)
- [ ] Seller chips: counts sum to the visible pool; clicking filters rows; "All sellers" resets
- [ ] In stock / Not in stock / Any: rows and chip counts change consistently; "quote only" and "stock unverified" items never appear under In stock

## Queue rows
- [ ] Thumbnails render for most rows (feed image); rows without any resolvable image show "no image", not a broken img icon
- [ ] Titles are human product names (not URL slugs) for Zoho items
- [ ] Price shows ₹ formatted; stock badge matches the seller page when spot-checked (open seller page ↗)
- [ ] "likely wing" vs "unsure" tags look sane on a sample
- [ ] Show more paginates without losing filter state

## Approve flow
- [ ] Approve with empty brand/name/slug → blocked with alert (client) — and the API also rejects it (covered by suite)
- [ ] Approve with empty span → blocked with span-specific alert
- [ ] Happy path: fill fields, Approve → row animates out; Accepted count +1; live count +1
- [ ] The approved kit appears on /wings/ immediately (reload the shop) and its kit page loads
- [ ] Approving a second candidate with the same slug → clear error alert (409)

## History views
- [ ] Accepted: rows show approval date, "view live page ↗" opens the live kit page, Un-approve asks for confirmation, then removes from live (shop reload confirms) and moves the row to New
- [ ] Rejected: Restore moves the row back to New
- [ ] Rejected items do NOT resurface as new candidates after Run discovery

## Discovery
- [ ] Run discovery → log line per source with product/new counts; errors (e.g. unreachable seller) surface as ✗ lines rather than silence
- [ ] New candidates appear without a reload after the run completes

## Console hygiene
- [ ] No JS errors in the browser console across all of the above
