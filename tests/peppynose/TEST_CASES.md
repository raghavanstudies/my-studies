# Peppynose website: test cases

Site: www.peppynose.com (files in `peppynose/`). Automated tests are in `specs/` and run every page in a real Chromium browser at two sizes: **desktop (1280 px)** and **mobile (390 px)**.

**Last run: 21 October 2026, 229 passed, 0 failed** (3 skipped by design: tests that apply to only one screen size).

## How to run

```bash
cd tests/peppynose
npm install
npx playwright test            # all tests, desktop + mobile
npx playwright show-report report   # open the HTML report
```

In the cloud workspace, Chromium is already installed: prefix the command with `CHROMIUM_PATH=/opt/pw-browsers/chromium`.

The tests start a local web server for `peppynose/` and block all outside requests (Amazon, Flipkart, Google Fonts, Pexels). That keeps them fast and repeatable, and also checks that Pexels photos fall back to Peppynose's own photos if Pexels is down. Outside links are checked for the right address, not opened.

## Automated test cases

### Every page (TC-SITE): runs on all 10 pages (including 404) × 2 screen sizes

| ID | What is checked | Expected result |
|---|---|---|
| TC-SITE-01 | Page loads | Status 200, title contains "Peppynose", no script errors |
| TC-SITE-02 | Header menu | Home, Shop, About, FAQ, Contact in order; current page underlined |
| TC-SITE-03 | Footer | Links to Shop, About, FAQ, Contact, Shipping, Returns, Privacy, Terms, Amazon store, Flipkart, Instagram (new tab); email and address shown (404 page uses site-root links) |
| TC-SITE-04 | Images | Every image loads after scrolling (no broken images) |
| TC-SITE-05 | Local links and files | Every link, stylesheet and image on the page exists (status 200) |
| TC-SITE-06 | Mobile/desktop layout | No sideways scrolling |
| TC-SITE-07 | Marketplace links | Every Amazon/Flipkart link opens in a new tab with `rel="noopener"` |
| TC-SITE-08 | Accessibility | Every image has alt text (only the decorative header logo next to the word "Peppynose" is empty) |
| TC-SITE-09 | Mobile menu (390 px) | Menu button shows; tap opens the menu; Escape closes it; tapping outside closes it; tapping the button again closes it; aria-expanded always matches; tapping Shop goes to the Shop page |
| TC-SITE-10 | Desktop menu (1280 px) | Menu always visible, no menu button |
| TC-SITE-11 | Phone tap targets (390 px) | Every footer link and "See all …" link is at least 44 px tall |

### Search engines and sharing (TC-SEO)

| ID | What is checked | Expected result |
|---|---|---|
| TC-SEO-01 | Tags on every page | canonical and og:url = the page's own www.peppynose.com address; og:type "website"; twitter:card "summary_large_image"; og:image = banner; title and description present |
| TC-SEO-02 | Unique titles | All 9 pages have different titles and descriptions |
| TC-SEO-03 | Sharing banner | images/og-banner.jpg is exactly 1200 × 630 |
| TC-SEO-04 | robots.txt | Allows all crawlers and points to sitemap.xml |
| TC-SEO-05 | sitemap.xml | Lists exactly the 9 pages, and each one loads |
| TC-SEO-06 | 404 page | Unknown address returns 404; 404 page shows "wandered off", is marked noindex, has no canonical, "Back to home" goes to the home page |

### Home page (TC-HOME)

| ID | What is checked | Expected result |
|---|---|---|
| TC-HOME-01 | Hero | Heading "With you at every little stage."; Amazon store and Flipkart buttons; "4.4/5 from 140 ratings on Amazon.in" |
| TC-HOME-02 | Hero image | Family image loads; Mom on Board card says "₹249 on Amazon.in" and links to B0GVZFQ2Y5 |
| TC-HOME-03 | Scrolling banner | Says "Verified 4★ & 5★ reviews", never "Verified 5★ reviews" |
| TC-HOME-04 | Reviews | Exactly 2: Bhaskar ★★★★★ (Amazon.in) and Pratik Kamble ★★★★☆ (Flipkart); no Ekta or Mitali |
| TC-HOME-05 | Shop by age | 5 tiles with the right links; tapping "Crawling babies" opens the Shop with 5 knee pads |
| TC-HOME-06 | Stage sections | 4 sections; Baby on Board and Mom on Board show Amazon ₹249 / Flipkart "Check price"; no Flipkart button on the home page shows a ₹ price |
| TC-HOME-07 | Best sellers | 4 products, each with an Amazon button |
| TC-HOME-08 | Thumbnails | Product thumbnails have descriptive alt text |

### Shop page (TC-SHOP)

| ID | What is checked | Expected result |
|---|---|---|
| TC-SHOP-01 | Product list | 15 products in 4 categories |
| TC-SHOP-02 | Age filter | All 15 · Pregnancy 3 · Newborn 3 · 3 months+ 3 · Knee pads 1–3 yrs 5 · Toys 1–3 yrs 4; address bar updates; category buttons hide while filtered |
| TC-SHOP-03 | Filter link | Opening `products.html?age=kids` shows 4 toys with "Toys · 1–3 yrs" selected |
| TC-SHOP-04 | Large sign | "Coming soon 🔜" badge, disabled "Coming soon 🔜" button, no links, no price |
| TC-SHOP-05 | LCD tablet multicolour | "Out of stock" badge, disabled button, no links, no price |
| TC-SHOP-06 | Buy links | All 18 Amazon products and 15 Flipkart products are linked; B0H2QZDKN7, B0H2R147K2, B0DJKQ6NJT are gone |
| TC-SHOP-07 | Prices per button | Baby on Board pack of 1: Amazon ₹249; pack of 2: Amazon ₹399; Mom on Board: Amazon ₹249; all 18 Amazon buttons show a ₹ price; all 15 Flipkart buttons say "Check price" (Flipkart prices change with offers); no shared single price |
| TC-SHOP-08 | Category buttons | "Learning & Play" jumps to that section |
| TC-SHOP-09 | Spelling | Mom on Board card says "moms-to-be" |

### Content pages (TC-CONTENT)

| ID | What is checked | Expected result |
|---|---|---|
| TC-CONTENT-01 | FAQ | Answers open on tap; 17.5 cm size "coming soon"; knee pads and toys 1 to 3 years; teethers 3 months |
| TC-CONTENT-02 | About | Story "began in 2023 in Musiri"; 3 promises |
| TC-CONTENT-03 | Contact | Email link, address, Amazon and Flipkart order-help buttons |
| TC-CONTENT-04 | Policy pages (×4) | Heading, "Last updated", mentions Amazon.in and Flipkart, contact email |
| TC-CONTENT-05 | Returns & Shipping | Say the marketplace return/refund and shipping policies apply |
| TC-CONTENT-07 | Privacy page | care.peppynose@gmail.com in "Emails you send us" is a mailto link |
| TC-CONTENT-06 | Leftover text | No "mums", "Draft", "To be added", "goes here", "Ekta", "Mitali" or "Verified 5★" on any page |

## Manual test cases (need the live site or a real phone)

These can't be automated from the build environment, which cannot reach www.peppynose.com, Amazon or Flipkart.

| ID | Steps | Expected result |
|---|---|---|
| TC-MAN-01 | Open https://www.peppynose.com on a phone and a computer | Padlock shows; home page loads with the family image |
| TC-MAN-02 | Open http://peppynose.com (no www) | Redirects to https://www.peppynose.com |
| TC-MAN-03 | On the Shop page, tap 3 Amazon and 3 Flipkart buttons | Each opens the correct product page in a new tab |
| TC-MAN-04 | Compare the Amazon prices on the buttons with the live listings | Prices match (update the site if a price changed) |
| TC-MAN-05 | Look at the Pexels photos (home "Expecting" section, bottom shop band, About page) | Photos load and suit the brand |
| TC-MAN-06 | Share https://www.peppynose.com in WhatsApp | Preview shows the family banner with the Peppynose logo and title |
| TC-MAN-07 | Open https://www.peppynose.com/anything | Peppynose 404 page with "Back to home" |
| TC-MAN-08 | Tap the email address on the Contact page | Mail app opens to care.peppynose@gmail.com |
| TC-MAN-09 | Tap "Instagram" in the footer | peppynose_toystore Instagram page opens in a new tab |
