# Peppynose website: test cases

Site: www.peppynose.com (files in `peppynose/`, Tamil pages in `peppynose/ta/`, Hindi pages in `peppynose/hi/`; V3 adds `buy/` pages and `pregnancy-tracker.html` in each language). Automated tests are in `specs/` and run every page in a real Chromium browser at two sizes: **desktop (1280 px)** and **mobile (390 px)**.

**Last run: 21 October 2026 (website V3), 373 passed, 0 failed** (tests that apply to only one screen size are skipped on the other by design). Run twice in a row, both green.

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
| TC-SITE-02 | Header menu | Home, Shop, About, FAQ, Pregnancy tracker, Contact in order; current page underlined (the language switch is not counted as a menu link) |
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
| TC-SEO-01 | Tags on every page | canonical and og:url = the page's own www.peppynose.com address; og:type "website"; twitter:card "summary_large_image"; og:image = banner with `?v=2`; hreflang links for en, ta, hi and x-default; title and description present |
| TC-SEO-02 | Unique titles | All 9 pages have different titles and descriptions |
| TC-SEO-03 | Sharing banner | images/og-banner.jpg is exactly 1200 × 630 |
| TC-SEO-04 | robots.txt | Allows all crawlers and points to sitemap.xml |
| TC-SEO-05 | sitemap.xml | Lists exactly 69 pages (9 pages + tracker + 13 buy pages, × English, Tamil, Hindi), each with 4 language links, and each one loads |
| TC-SEO-06 | 404 page | Unknown address returns 404; 404 page shows "wandered off", is marked noindex, has no canonical, "Back to home" goes to the home page |

### Home page (TC-HOME)

| ID | What is checked | Expected result |
|---|---|---|
| TC-HOME-01 | Hero | Heading "With you at every little stage."; Amazon store and Flipkart buttons; "4.4/5 from 140 ratings on Amazon.in" |
| TC-HOME-02 | Hero image | Teether photo loads (16:9 on desktop, 4:5 on phones); old family image gone; Mom on Board card says "See price on Amazon.in" and links to B0GVZFQ2Y5 |
| TC-HOME-03 | Scrolling banner | Says "Verified 4★ & 5★ reviews", never "Verified 5★ reviews" |
| TC-HOME-04 | Reviews | Exactly 2: Bhaskar ★★★★★ (Amazon.in) and Pratik Kamble ★★★★☆ (Flipkart); no Ekta or Mitali |
| TC-HOME-05 | Shop by age | 5 tiles with the right links; tapping "Crawling babies" opens the Shop with 5 knee pads |
| TC-HOME-06 | Stage sections | 4 sections; every Amazon and Flipkart button says "Check price"; no ₹ price |
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
| TC-SHOP-07 | Buy buttons | All 18 Amazon buttons and all 15 Flipkart buttons say "Check price" (marketplace prices change with offers); no ₹ anywhere on the page; no shared single price |
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

### Website V2: languages, WhatsApp, Instagram (TC-V2)

Runs on all 30 pages (10 English + 10 Tamil + 10 Hindi) where it says so.

| ID | What is checked | Expected result |
|---|---|---|
| TC-V2-01 | Every page, 3 languages | Loads, no script errors, every image loads, every local file exists, no sideways scrolling at 360, 390, 768 and 1440 px |
| TC-V2-02 | Every page, 3 languages | No ₹ price; footer logo shown; WhatsApp button shown; phone number never visible, never a `tel:` link, only inside the wa.me link; buttons say "Check price" / "விலை அறிய" / "कीमत देखें" |
| TC-V2-03 | Search engines | 27 pages each have their own canonical and en/ta/hi/x-default hreflang; 404 pages have none |
| TC-V2-04 | Buy links | Amazon and Flipkart links are exactly the same in English, Tamil and Hindi |
| TC-V2-05 | Hero photo | 16:9 shape on desktop, 4:5 on phones |
| TC-V2-06 | Home pages | Trust badges row and Instagram section (6 posts, each opens Instagram in a new tab) on the 3 home pages |
| TC-V2-07 | WhatsApp button | Hides near the footer, so it never covers a buy button or footer link while scrolling the shop |
| TC-V2-08 | Footer on phones | Footer links at least 40 px tall and do not overlap |
| TC-V2-09 | Language switch | Shown only on the 3 home pages |
| TC-V2-10 | Remembered language | Choosing Tamil or Hindi is remembered on other pages and the next visit; choosing EN switches back |
| TC-V2-11 | English default | With no saved choice, the site stays in English (no redirect) |
| TC-V2-12 | Tamil browser | A Tamil-language browser still sees English, plus a one-time suggestion to view in Tamil (home page only, not shown again on reload); never an automatic redirect |
| TC-V2-13 | Phone menu | Menu shows the language switch; still closes with Escape and outside tap |
| TC-V2-14 | Privacy page | Mentions WhatsApp chat messages and says no phone number is listed (English, Tamil, Hindi) |

### Website V3: logo, QR codes, buy pages, pregnancy tracker, loader (TC-V3)

| ID | What is checked | Expected result |
|---|---|---|
| TC-V3-01 | 42 new pages (tracker + 13 buy pages × 3 languages) | Load with no script errors; every image and local file exists; no sideways scrolling at 360/390/768/1440 px; own canonical and en/ta/hi/x-default hreflang; no ₹; phone number never shown, no `tel:` link |
| TC-V3-02 | Buy pages | Amazon/Flipkart buttons match the product list exactly in all 3 languages (Amazon-only products show one button); open in a new tab; WhatsApp button shown |
| TC-V3-03 | "Scan to buy" QR codes | 13 on the Shop page and 4 on home, per language; each links to its buy page and uses that language's QR image; none on "coming soon" or "out of stock" products; tapping one opens the buy page |
| TC-V3-04 | Real logo | Colourful Peppynose lettering (640 px image, alt "Peppynose") shows in the header of every page |
| TC-V3-05 | Loader | Baby-face loader is gone within about a second, and shows only on the first page in a tab |
| TC-V3-06 | Loader, reduced motion | Never shown when the phone asks for reduced motion |
| TC-V3-07 | Tracker links | "Pregnancy tracker" in the menu and footer (EN/TA/HI); home has the tracker band and the store line "Shop now on Flipkart & Amazon. Our own store is coming soon."; the band's button opens the tracker, which is marked as the current page |
| TC-V3-08 | Tracker, due date 140 days ahead | Week 20, second trimester, "20 weeks and 0 days", 140 days to go, a tip, Mom on Board suggestion; "Share my week" opens WhatsApp with no phone number |
| TC-V3-09 | Tracker, last-period mode | 35 weeks ago gives week 35, third trimester, Baby on Board and teether suggestions; remembered after reload; "Clear my data" removes it |
| TC-V3-10 | Tracker, bad dates | Empty date or impossible date shows a friendly error and no result |
| TC-V3-11 | Tracker in Tamil and Hindi | Works with no script errors; share link opens WhatsApp |
| TC-V3-12 | Phone header | On the 3 home pages at 320–430 px the language buttons sit on a second row and never cover the logo or Menu button; lettering never squashed (also checked at 768 and 1024 px) |
| TC-V3-13 | Saved language | A visitor who chose Tamil and scans an English QR code lands on the Tamil buy page |
| TC-V3-14 | Tracker edge cases and privacy | Due today: week 40, "Due date reached"; 5 weeks ahead: week 35; 300 days ahead: error; nothing is sent anywhere (only Google Fonts) |
| TC-V3-15 | Tamil home "Scan to buy" caption (TC-23 fix) | At 1001–1239 px the Tamil caption sits under the QR code and stays inside the card; other widths and languages keep it beside the QR |

## Manual test cases (need the live site or a real phone)

These can't be automated from the build environment, which cannot reach www.peppynose.com, Amazon or Flipkart.

| ID | Steps | Expected result |
|---|---|---|
| TC-MAN-01 | Open https://www.peppynose.com on a phone and a computer | Padlock shows; home page loads with the baby teether photo |
| TC-MAN-02 | Open http://peppynose.com (no www) | Redirects to https://www.peppynose.com |
| TC-MAN-03 | On the Shop page, tap 3 Amazon and 3 Flipkart buttons | Each opens the correct product page in a new tab |
| TC-MAN-04 | Tap "Check price" on 3 products | Buttons say "Check price" and the listing shows the current price |
| TC-MAN-05 | Look at the Pexels photos (home "Expecting" section, bottom shop band, About page) | Photos load and suit the brand |
| TC-MAN-06 | Share https://www.peppynose.com in WhatsApp | Preview shows the new banner with the Peppynose logo and title (WhatsApp may keep an old preview for a few days) |
| TC-MAN-07 | Open https://www.peppynose.com/anything | Peppynose 404 page with "Back to home" |
| TC-MAN-08 | Tap the email address on the Contact page | Mail app opens to care.peppynose@gmail.com |
| TC-MAN-09 | Tap "Instagram" in the footer | peppynose_toystore Instagram page opens in a new tab |
| TC-MAN-10 | On a phone, tap "Chat with us" | WhatsApp opens a chat with Peppynose with "Hi Peppynose, I have a question" typed in |
| TC-MAN-11 | Open the Tamil and Hindi home pages on a phone | Tamil and Hindi letters look clean (no boxes or broken letters) |
| TC-MAN-12 | Tap each of the 6 Instagram pictures | Each opens the right Instagram post in a new tab |
| TC-MAN-13 | Choose தமிழ், close the browser, open www.peppynose.com again | Opens in Tamil; tapping EN goes back to English |
| TC-MAN-14 | Point a phone camera at 3 QR codes on the Shop page (laptop screen) | Each opens the matching buy page in the same language |
| TC-MAN-15 | Open www.peppynose.com in a new private window | The baby face shows briefly, then the page; the next page has no face |
| TC-MAN-16 | Pregnancy tracker on a phone: enter a due date, tap "Share my week" | WhatsApp opens with the message, you pick who to send it to |
| TC-MAN-17 | Look at the top-left logo on a phone with large text and in dark mode | Colourful lettering is sharp and readable; language buttons never cover it |
