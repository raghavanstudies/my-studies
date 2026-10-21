// Shared data and helpers for the Peppynose site tests.

const PAGES = ['index.html', 'products.html', 'about.html', 'faq.html', 'contact.html',
  'shipping.html', 'returns.html', 'privacy.html', 'terms.html'];
const POLICY_PAGES = ['shipping.html', 'returns.html', 'privacy.html', 'terms.html'];
const SITE = 'https://www.peppynose.com/';

// Buy links that must be on the Shop page (from the Peppynose catalogue, minus unavailable items)
const AMAZON_ASINS = ['B0GP6XP68R', 'B0H2QVVDRX', 'B0GVZFQ2Y5', 'B0H8FF5D9M', 'B0H8FFYVTG', 'B0H8FGM8R3',
  'B0H6SN9GGM', 'B0H6SFL34Q', 'B0H6SSTPH3', 'B0H6SVQ5JL', 'B0H757K755', 'B0H6SNM4ZR', 'B0H6SMPC3J',
  'B0H6SH8ZVQ', 'B0H6SSPWSR', 'B0DJKLV73B', 'B0DJRKW3T9', 'B0DK17XHX3'];
const REMOVED_ASINS = ['B0H2QZDKN7', 'B0H2R147K2', 'B0DJKQ6NJT'];
const FLIPKART_PIDS = ['CSKHMN38K2PKU5HZ', 'CSKHRUTAZSWZJGWS', 'CSKHRM5DRQMEJKVE', 'TSOHRUVTHASV6DWJ', 'TSOHRUVVFP3F6WMH',
  'TSOHRUVWQN5HEWYG', 'BNPHRUYF9WQQNTSM', 'BNPHRUYFVHK8F7HZ', 'BNPHRUYFGBRBG9ZD', 'BNPHRUYFN7CCEAB4', 'BNPHRUYFVV4VSYPM',
  'BNPHRUYHVEGTVF3Q', 'BNPHRUYGJHYMAQKG', 'BNPHRUYJCAVBNDET', 'BNPHRUYKZPGK93DQ'];

// Keep tests offline and deterministic: block everything that is not the local server.
// Remote photos (Pexels) then exercise their local fallback images.
async function blockExternal(page) {
  await page.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith('http://127.0.0.1') ? route.continue() : route.abort();
  });
}

// Open a page, collecting JS errors (not failed external requests, which are blocked on purpose).
async function open(page, path) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await blockExternal(page);
  const res = await page.goto('/' + path, { waitUntil: 'load' });
  return { res, errors };
}

// V3 "Scan to buy" chooser pages (buy/<slug>.html in each language)
const BUY_SLUGS = ['baby-on-board-sign', 'mom-on-board-sign', 'teether-gift-set', 'teether-fish-bird', 'teether-car-cloud',
  'knee-pads-blue-smiley', 'knee-pads-yellow-smiley', 'knee-pads-mint-dotted', 'knee-pads-gray-dotted', 'knee-pads-black-dotted',
  'wooden-kitchen-set', 'foam-mat', 'lcd-tablet-blue'];

module.exports = { PAGES, BUY_SLUGS, POLICY_PAGES, SITE, AMAZON_ASINS, REMOVED_ASINS, FLIPKART_PIDS, blockExternal, open };
