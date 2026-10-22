# Peppynose website: test cases

Site: www.peppynose.com (files in `peppynose/`, Tamil pages in `peppynose/ta/`, Hindi pages in `peppynose/hi/`; V3 adds `buy/` pages and `pregnancy-tracker.html` in each language). Automated tests are in `specs/` and run every page in a real Chromium browser at two sizes: **desktop (1280 px)** and **mobile (390 px)**.

**Last run: 22 October 2026 (re-test fixes), 426 passed, 0 failed** (tests that apply to only one screen size are skipped on the other by design). Run twice in a row, both green.

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
| TC-SITE-08 | Accessibility | Every image has alt text (only decorative ones may be empty: the header parrot, the loader and the flying birds) |
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
| TC-V2-07 | WhatsApp and help-chat buttons | Hide when a buy button, QR code or footer link passes under them, so they never cover one while scrolling the shop, with the cookie banner open and closed |
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

### Website V4: tracker tabs, analytics with consent, help chat, parrot loader, scroll animations (TC-V4)

| ID | What is checked | Expected result |
|---|---|---|
| TC-V4-01 | All 72 pages | Load analytics-config.js, analytics.js and chatbot.js; motion.js on all but the buy pages; "Cookie settings" link in the footer; no tracking code written into any page |
| TC-V4-02 | Cookie banner | Shows on a first visit in the page language (EN/TA/HI) with a link to that language's privacy page; nothing is requested from Google or Microsoft before "Accept" |
| TC-V4-03 | Placeholder IDs | With the placeholder IDs G-XXXXXXXXXX / CLARITY_PROJECT_ID (served by the test), "Accept" loads nothing |
| TC-V4-04 | Real IDs | Before "Accept": 0 requests; after: Google Analytics and Clarity load (2 requests); ads consent always "denied" |
| TC-V4-05 | Decline / change mind | "Decline": no banner on the next page, nothing loads; "Cookie settings" reopens the banner; declining after accepting reloads the page and stops all requests |
| TC-V4-06 | Click events | Amazon, Flipkart, WhatsApp and buy-page events carry the product, language and page |
| TC-V4-07 | Tracker first screen | Due date 126 days ahead: "Week 22", the week 22 picture (only that one picture requested), "Baby is about the size of a small papaya", "126 days to go", "Share with family"; form hidden; baby pictures not requested yet; disclaimer above and below |
| TC-V4-08 | Tracker tabs | Checkups: 7 reminders, the 18–22 week scan marked "Now"; To-do: a tick survives reload; "Clear my data" removes the date and ticks |
| TC-V4-09 | Share card | "Share with family" saves a 1080 × 1080 PNG made on the device and opens WhatsApp with no phone number |
| TC-V4-10 | Tracker in Tamil and Hindi | First screen, To-do ticks and reload work, no script errors |
| TC-V4-11 | Baby sizes | Before week 4: "Baby sizes start from week 4."; week 35: bunch of bananas; after 40: "Baby is ready to meet you!" |
| TC-V4-12 | Chat button position | Above the WhatsApp button, same right edge, never overlapping, no sideways scroll (320–1280 px) |
| TC-V4-13 | Help chat | Tapped question and typed question get the right answers; an unknown question offers WhatsApp with the question filled in; phone number never shown; Escape closes |
| TC-V4-14 | Help chat in Tamil and Hindi | Typed "teether cleaning" in Tamil and Hindi finds the teether care answer |
| TC-V4-15 | Parrot loader | Three parrot/perch layers, gone within about a second, first page in a tab only, never on buy pages |
| TC-V4-16 | Scroll animations | Progress bar, reveals and flying birds on big screens; hero photo never animated; every faded-in item is fully visible after scrolling (7 pages, EN/TA/HI); no birds on phones; nothing at all with reduced motion |
| TC-V4-17 | Privacy page | Analytics section in all 3 languages; "Last updated: October 2026"; no phone number |
| TC-V4-18 | V4.1: no pregnancy data in analytics | After using the tracker and "Share with family" (EN/TA/HI), the tracker_used and share_card_created events carry only language, page and share method: no week, trimester, due date or input mode |
| TC-V4-19 | V4.1: no Clarity on tracker pages | With real IDs and "Accept", the 3 tracker pages load Google Analytics only, never Microsoft Clarity; other pages load both; tracker section keeps data-clarity-mask |
| TC-V4-20 | V4.1: no sideways scroll with big text | Home EN/TA/HI at 320, 360, 390, 412 px with text at 100%, 115%, 130%, motion on and off: page never wider than the screen |
| TC-V4-21 | V4.1: tablet and desktop unchanged | At 768, 1024 and 1280 px the home page layout is identical with and without the new phone-only CSS block |
| TC-V4-22 | Real analytics IDs (G-TQ3T4P57SJ, z1i2qcz3dc) | IDs are live in analytics-config.js; nothing loads before "Accept"; after it Google Analytics and Clarity load; the 3 tracker pages load Google Analytics only |
| TC-V4-23 | 37 tracker pictures | week04.webp … week40.webp all load from /assets/tracker/, WebP, 800 × 800 |
| TC-V4-24 | Right picture per week | Weeks 4, 13 and 40 show their own picture; before week 4 the peach placeholder shows and no picture is requested |
| TC-V4-25 | Whole picture, lazy-loaded | Rounded-square frame (not a circle), so the full illustration shows; loading="lazy"; result card stops below the sticky header |
| TC-V4-26 | 3D tilt and zoom (computer) | Picture tilts towards the mouse (max 12°) and goes flat when the mouse leaves; click or Enter opens the zoom with the right picture and label; Escape and ✕ close it |
| TC-V4-27 | 3D tilt and zoom (phone, Tamil and Hindi) | Phone motion tilts gently (max 8°); tap zooms, tap closes; Tamil/Hindi alt text; no sideways scroll |
| TC-V4-28 | Reduced motion | No tilt at all; zoom still works |
| TC-V4-29 | Share card with picture | The 1080 × 1080 card shows the week picture; analytics events still carry no pregnancy data |
| TC-V4-30 | "Share my week" privacy (EN/TA/HI) | The link's href is just https://wa.me/ (no share text); clicking opens WhatsApp with the message; analytics events carry no week, days or link text |
| TC-V4-31 | Week without a picture | After week 22, choosing week 2 or past week 40 shows the placeholder; the old picture is no longer zoomable and has no label |

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
| TC-MAN-18 | Open www.peppynose.com in a new private window on a phone | Cookie banner in the page language; parrots hop in for under a second |
| TC-MAN-19 | Pregnancy tracker on a phone: tap "Share with family" | Share sheet (or download) with the week card; WhatsApp opens with no phone number |
| TC-MAN-20 | Tap the round blue "?" button, ask a question in English, Tamil and Hindi | Sensible answer, or "Chat on WhatsApp" if nothing fits |
| TC-MAN-21 | After pasting the real IDs: open the site, tap Accept, tap an Amazon button | GA4 Realtime shows page_view and amazon_click within a minute; Clarity shows the visit within about 2 hours |
| TC-MAN-22 | Pregnancy tracker on a phone: enter a due date, tilt the phone, drag the picture, tap it | The picture tilts gently and zooms on tap (iPhone asks once to allow motion); tap again to close |
