// Per-domain HTML parsers for manufacturers with no Shopify/JSON-LD. Each was
// reverse-engineered from the live site (parallel research workflow) and tested;
// all are self-contained (global fetch + regex only) → Worker-safe. Each
// default-exports async fetchProducts() → [{ext_id, title, url, body_text,
// image_urls}]. mfr-strategies.js adds span + does aircraft filtering.
import seagullmodels from './mfr-domains/seagullmodels.mjs'
import rcfactory from './mfr-domains/rcfactory.mjs'
import multiplexrc from './mfr-domains/multiplexrc.mjs'
import pilotrc from './mfr-domains/pilotrc.mjs'
import kyosho from './mfr-domains/kyosho.mjs'
import xflymodel from './mfr-domains/xflymodel.mjs'

export const HTML_PARSERS = {
  'seagullmodels.com': seagullmodels,
  'rc-factory.eu': rcfactory,
  'multiplex-rc.de': multiplexrc,
  'pilot-rc.com': pilotrc,
  'kyosho.com': kyosho,
  'xflymodel.com': xflymodel,
}
