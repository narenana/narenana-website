-- Register manufacturers added after the original batch and keep the manual
-- FMS source from being reported as a failed production harvest.
INSERT INTO manufacturer (
  brand, domain, platform, strategy, status, updated_at,
  last_harvest_status, last_harvest_note
) VALUES
  ('E-flite', 'horizonhobby.com', 'html', 'jsonld', 'active', strftime('%s','now') * 1000,
   'pending', 'Awaiting first manufacturer harvest'),
  ('Hangar 9', 'horizonhobby.com', 'html', 'jsonld', 'active', strftime('%s','now') * 1000,
   'pending', 'Awaiting first manufacturer harvest')
ON CONFLICT(brand) DO UPDATE SET
  domain=excluded.domain,
  platform=excluded.platform,
  strategy=excluded.strategy,
  status='active',
  updated_at=excluded.updated_at;

UPDATE manufacturer
SET domain='fmshobby.com',
    platform='protected',
    strategy='manual',
    last_harvest_status='manual',
    last_harvest_note='Cloudflare-protected source; refresh with the local browser workflow',
    updated_at=strftime('%s','now') * 1000
WHERE brand='FMS';
