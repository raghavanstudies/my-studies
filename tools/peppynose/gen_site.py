"""Generate the Peppynose 5-page site from one product list (data from the catalogue PDF, 21 Oct 2026)."""
import html
import sys
from pathlib import Path

OUT = Path(sys.argv[1])

AMZ_STORE = 'https://www.amazon.in/stores/Peppynose/page/D8588934-1A65-4756-BB2F-4FAB88D7B018'
FK_STORE = 'https://www.flipkart.com/search?q=peppynose'
amz = lambda asin: f'https://www.amazon.in/dp/{asin}'
FK = {
    'bob1': 'https://www.flipkart.com/peppynose-sticker-decal-car/p/itmfd1ff36559f4c?pid=CSKHMN38K2PKU5HZ',
    'bob2': 'https://www.flipkart.com/peppynose-sticker-decal-car/p/itmfd1ff36559f4c?pid=CSKHRUTAZSWZJGWS',
    'mob': 'https://www.flipkart.com/peppynose-sticker-decal-car/p/itm8b858189d10ff?pid=CSKHRM5DRQMEJKVE',
    'gift': 'https://www.flipkart.com/peppynose-baby-silicone-neem-wood-teether-combo-complete-gift-set-6-pieces/p/itm64326c77f02d7?pid=TSOHRUVTHASV6DWJ',
    'fishbird': 'https://www.flipkart.com/peppynose-baby-silicone-neem-wood-teether-combo-fish-bird-3-pieces/p/itm8bc9988a3b215?pid=TSOHRUVVFP3F6WMH',
    'carcloud': 'https://www.flipkart.com/peppynose-baby-silicone-neem-wood-teether-combo-car-cloud-3-pieces/p/itmfb77118dc08e6?pid=TSOHRUVWQN5HEWYG',
    'black2': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-black/p/itm85e14399640f4?pid=BNPHRUYF9WQQNTSM',
    'black4': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-black/p/itm55dda0db13dad?pid=BNPHRUYFVHK8F7HZ',
    'gray2': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-gray/p/itm85e14399640f4?pid=BNPHRUYFGBRBG9ZD',
    'gray4': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-gray/p/itm55dda0db13dad?pid=BNPHRUYFN7CCEAB4',
    'mint4': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-mint/p/itm55dda0db13dad?pid=BNPHRUYFVV4VSYPM',
    'blue2': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-blue/p/itm85e14399640f4?pid=BNPHRUYHVEGTVF3Q',
    'blue4': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-blue/p/itm55dda0db13dad?pid=BNPHRUYGJHYMAQKG',
    'yellow2': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-yellow/p/itm85e14399640f4?pid=BNPHRUYJCAVBNDET',
    'yellow4': 'https://www.flipkart.com/peppynose-baby-crawling-knee-pads-yellow/p/itm55dda0db13dad?pid=BNPHRUYKZPGK93DQ',
}

# category id, title, intro, cover image, products
# product: name, image, description, rating line or None, [(option label, price, amazon url or None, flipkart url or None)]
CATS = [
    ('car-signs', 'Car Safety Signs', 'Reversible 2-in-1 signs that tell other drivers to take extra care: "Bump on Board" during pregnancy, "Baby on Board" after.', 'bob-car', [
        ('Baby on Board & Bump on Board Sign', 'bob-1', '2-in-1 reversible, 14.5 × 14.5 cm, 300 GSM laminated board with suction cup.',
         '4.4 out of 5 on Amazon.in · 140 ratings', [('Pack of 1', '₹249', amz('B0GP6XP68R'), FK['bob1']), ('Pack of 2', '₹399', amz('B0H2QVVDRX'), FK['bob2'])]),
        ('Mom on Board & Baby on Board Sign', 'mob', '2-in-1 reversible, "Mom on Board" for mums-to-be, 14.5 cm, with suction cup.',
         '4.2 out of 5 on Amazon.in · 35 ratings', [('Pack of 1', '₹249', amz('B0GVZFQ2Y5'), FK['mob'])]),
        ('Baby on Board Sign — Large', 'bob-large', '2-in-1 reversible, larger 17.5 × 17.5 cm, 300 GSM laminated board.',
         None, [('Pack of 1', '₹399', amz('B0H2QZDKN7'), None), ('Pack of 2', '₹399', amz('B0H2R147K2'), None)]),
    ]),
    ('teethers', 'Teethers', 'Silicone and neem wood teether combos, BPA-free, for babies 3 months and up.', 'teether-fishbird-life', [
        ('Teether Complete Gift Set (6 pieces)', 'teether-gift', 'Silicone teether ring with 5 neem wood shapes. A lovely baby gift.',
         None, [('Gift set of 6', '₹649', amz('B0H8FF5D9M'), FK['gift'])]),
        ('Teether Fish & Bird Combo (3 pieces)', 'teether-fishbird', 'Silicone teether ring with neem wood fish and bird.',
         None, [('Combo of 3', '₹299', amz('B0H8FFYVTG'), FK['fishbird'])]),
        ('Teether Car & Cloud Combo (3 pieces)', 'teether-carcloud', 'Silicone teether ring with neem wood car and cloud.',
         None, [('Combo of 3', '₹299', amz('B0H8FGM8R3'), FK['carcloud'])]),
    ]),
    ('knee-pads', 'Baby Knee Pads', 'Soft cotton knee and elbow protectors for crawling babies, in packs of 2 or 4.', 'knee-blue-life', [
        ('Knee Pads — Blue Smiley', 'knee-blue', 'Soft cotton knee & elbow protector with a smiley face.', None,
         [('Pack of 2', '₹179', amz('B0H6SN9GGM'), FK['blue2']), ('Pack of 4', '₹340', amz('B0H6SFL34Q'), FK['blue4'])]),
        ('Knee Pads — Yellow Smiley', 'knee-yellow', 'Soft cotton knee & elbow protector with a smiley face.', None,
         [('Pack of 2', '₹179', amz('B0H6SSTPH3'), FK['yellow2']), ('Pack of 4', '₹340', amz('B0H6SVQ5JL'), FK['yellow4'])]),
        ('Knee Pads — Mint Dotted', 'knee-mint', 'Soft cotton knee & elbow protector with dotted grip.', None,
         [('Pack of 4', '₹340', amz('B0H757K755'), FK['mint4'])]),
        ('Knee Pads — Gray Dotted', 'knee-gray', 'Soft cotton knee & elbow protector with dotted grip.', None,
         [('Pack of 2', '₹179', amz('B0H6SNM4ZR'), FK['gray2']), ('Pack of 4', '₹340', amz('B0H6SMPC3J'), FK['gray4'])]),
        ('Knee Pads — Black Dotted', 'knee-black', 'Soft cotton knee & elbow protector with dotted grip.', None,
         [('Pack of 2', '₹179', amz('B0H6SH8ZVQ'), FK['black2']), ('Pack of 4', '₹340', amz('B0H6SSPWSR'), FK['black4'])]),
    ]),
    ('play', 'Learning & Play', 'Toys for drawing, pretend play and learning letters and numbers.', 'kitchen', [
        ('Wooden Kitchen Play Set', 'kitchen', 'Eco-friendly, non-toxic, 15 pieces for pretend play.', None, [('Set of 15', '₹399', amz('B0DJKLV73B'), None)]),
        ('Alphabet & Number Foam Mat', 'foam-mat', '36 interlocking foam pieces for learning through play.', None, [('36 pieces', '₹229', amz('B0DJRKW3T9'), None)]),
        ('LCD Writing Tablet — Blue', 'lcd-blue', '8.5-inch reusable LCD screen for mess-free drawing.', None, [('1 tablet', '₹199', amz('B0DK17XHX3'), None)]),
        ('LCD Writing Tablet — Multicolour', 'lcd-pink', 'Reusable doodle board for writing and drawing.', None, [('1 tablet', '₹199', amz('B0DJKQ6NJT'), None)]),
    ]),
]

# Genuine 4★/5★ reviews, verbatim from the catalogue PDF
REVIEWS = [
    ('Good product. Size is also good for car. Easy Visible to others.', 'Ekta Verma', '4 June 2026', 'Amazon.in', 'Baby on Board sign'),
    ('It’s good easy to remove and attach to another car as well if needed.', 'Bhaskar', '17 October 2026', 'Amazon.in', 'Mom on Board sign'),
    ('Suction is nice and stays intact on glass', 'Mitali Kadam', '8 June 2026', 'Amazon.in', 'Baby on Board sign'),
    ('Overall good and value for money products', 'Pratik Kamble, Raigad', 'Flipkart', 'Flipkart', 'Baby on Board sign'),
]

BEST = [('car-signs', 0), ('knee-pads', 0), ('teethers', 0), ('play', 0)]
BEST_IMG = {'car-signs': 'bob-1', 'knee-pads': 'knee-blue-life', 'teethers': 'teether-gift', 'play': 'kitchen'}

e = html.escape
NAV = [('index.html', 'Home'), ('products.html', 'Shop'), ('about.html', 'About'), ('faq.html', 'FAQ'), ('contact.html', 'Contact')]


def page(file, title, desc, body):
    nav = '\n'.join(f'          <a href="{h}"{" aria-current=\"page\"" if h == file else ""}>{t}</a>' for h, t in NAV)
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{e(desc)}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:image" content="https://www.peppynose.com/logo.png">
  <link rel="icon" href="favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <div class="wrap bar">
      <a class="brand" href="index.html"><img src="logo-mark.png" alt="">Peppynose<sup>™</sup></a>
      <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
      <nav class="nav" id="nav">
{nav}
      </nav>
    </div>
  </header>

  <main>
{body}
  </main>

  <footer>
    <div class="wrap">
      <div class="foot">
        <div><img src="logo.png" alt="Peppynose logo"></div>
        <div>
          <h4>Explore</h4>
          <ul><li><a href="products.html">Shop all products</a></li><li><a href="about.html">About us</a></li><li><a href="faq.html">FAQ</a></li><li><a href="contact.html">Contact</a></li></ul>
        </div>
        <div>
          <h4>Buy online</h4>
          <ul><li><a href="{AMZ_STORE}" target="_blank" rel="noopener">Amazon.in store</a></li><li><a href="{FK_STORE}" target="_blank" rel="noopener">Flipkart</a></li></ul>
        </div>
      </div>
      <div class="copy"><span>© <span id="year">2026</span> Peppynose™. All rights reserved.</span><span>Prices shown are from Amazon.in and may change. Lifestyle photos: Pexels.</span></div>
    </div>
  </footer>
  <script>
    document.getElementById('year').textContent = new Date().getFullYear();
    const b = document.querySelector('.menu-btn'), n = document.getElementById('nav');
    b.addEventListener('click', () => b.setAttribute('aria-expanded', n.classList.toggle('open')));
  </script>
</body>
</html>
'''


def buy_buttons(a, f, small=True):
    s = ' small' if small else ''
    out = []
    if a:
        out.append(f'<a class="btn amazon{s}" href="{a}" target="_blank" rel="noopener">Amazon</a>')
    if f:
        out.append(f'<a class="btn flipkart{s}" href="{f}" target="_blank" rel="noopener">Flipkart</a>')
    return '<div class="buy">' + ''.join(out) + '</div>'


AGES = [('all', 'All'), ('pregnancy', 'Pregnancy'), ('newborn', 'Newborn'), ('months3', '3 months+'), ('crawling', 'Crawling babies'), ('kids', 'Toddlers & kids')]
AGE_OF = {'Baby on Board & Bump on Board Sign': 'pregnancy newborn', 'Mom on Board & Baby on Board Sign': 'pregnancy newborn', 'Baby on Board Sign — Large': 'pregnancy newborn'}
CAT_AGE = {'car-signs': 'pregnancy newborn', 'teethers': 'months3', 'knee-pads': 'crawling', 'play': 'kids'}


def product_card(cat_title, p, img=None, cover=False, ages=''):
    name, image, desc, rating, opts = p
    img = img or image
    rating_html = f'<div class="rating"><span class="stars">★</span> {e(rating)}</div>' if rating else ''
    opt_html = '\n'.join(
        f'<div class="opt"><div class="opt-top"><span>{label}</span><b>{price}</b></div>{buy_buttons(a, f)}</div>'
        for label, price, a, f in opts)
    return f'''          <article class="card" data-ages="{ages}">
            <div class="ph{' cover' if cover else ''}"><span class="tag">{e(cat_title)}</span><img src="images/{img}.webp" alt="Peppynose {e(name)}" loading="lazy"></div>
            <div class="body"><h3>{e(name)}</h3><p>{e(desc)}</p>{rating_html}
              <div class="opts">{opt_html}</div></div>
          </article>'''


def best_card(cid, idx):
    c = next(x for x in CATS if x[0] == cid)
    name, image, desc, rating, opts = c[4][idx]
    img = BEST_IMG[cid]
    cover = img.endswith('-life')
    prices = [o[1] for o in opts]
    price = prices[0] if len(set(prices)) == 1 else f'<small>from</small> {min(prices, key=lambda s: int(s[1:]))}'
    _, _, a, f = opts[0]
    rating_html = f'<div class="rating"><span class="stars">★</span> {e(rating)}</div>' if rating else ''
    return f'''          <article class="card">
            <div class="ph{' cover' if cover else ''}"><span class="tag">{e(c[1])}</span><img src="images/{img}.webp" alt="Peppynose {e(name)}" loading="lazy"></div>
            <div class="body"><h3>{e(name)}</h3><p>{e(desc)}</p>{rating_html}<div class="price">{price}</div>{buy_buttons(a, f, small=False)}</div>
          </article>'''


def review_card(r):
    text, who, when, src, prod = r
    when_html = '' if when == src else f' · {e(when)}'
    return f'''          <figure class="review"><span class="stars">★★★★★</span><blockquote>“{e(text)}”</blockquote>
            <figcaption class="who"><strong>{e(who)}</strong>{e(prod)}{when_html}<br><span class="src">Verified purchase · {e(src)}</span></figcaption></figure>'''


def home():
    cats = '\n'.join(f'''          <a class="cat" href="products.html#{cid}"><div class="ph"><img src="images/{cover}.webp" alt="" loading="lazy"></div><h3>{t}</h3><span>{len(prods)} products →</span></a>'''
                     for cid, t, _, cover, prods in CATS)
    best = '\n'.join(best_card(c, i) for c, i in BEST)
    revs = '\n'.join(review_card(r) for r in REVIEWS)
    body = f'''    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <span class="eyebrow">Baby &amp; kids essentials</span>
          <h1>Gentle care for your <em>little one</em></h1>
          <p class="lead">Thoughtful everyday products for babies, toddlers and parents-to-be: car safety signs, soft crawling knee pads, natural teethers and learning toys.</p>
          <div class="actions">
            <a class="btn amazon" href="{AMZ_STORE}" target="_blank" rel="noopener">Shop on Amazon.in</a>
            <a class="btn flipkart" href="{FK_STORE}" target="_blank" rel="noopener">Shop on Flipkart</a>
          </div>
        </div>
        <div class="arch">
          <img src="images/teether-gift-life.webp" alt="Baby playing with a Peppynose silicone and neem wood teether">
          <div class="float"><b>4.4★</b><span>Baby on Board sign<br>140 ratings on Amazon.in</span></div>
        </div>
      </div>
    </section>

    <div class="trust">
      <div class="wrap">
        <div><strong>BPA-free</strong>silicone teethers</div>
        <div><strong>Soft cotton</strong>knee pads</div>
        <div><strong>2-in-1</strong>reversible car signs</div>
        <div><strong>Amazon &amp; Flipkart</strong>delivery and returns</div>
      </div>
    </div>

    <section>
      <div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">Shop by category</span><h2>Made for every little stage</h2></div><p>From the first car ride home to first steps and first words.</p></div>
        <div class="cats">
{cats}
        </div>
      </div>
    </section>

    <section class="tint">
      <div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">Best sellers</span><h2>Parents’ favourites</h2></div><a class="btn ghost" href="products.html">Shop all products</a></div>
        <div class="grid">
{best}
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">Reviews</span><h2>What parents say</h2></div><p>Genuine reviews from verified buyers on Amazon.in and Flipkart.</p></div>
        <div class="reviews">
{revs}
        </div>
      </div>
    </section>

    <section class="tint-mint">
      <div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">Our promise</span><h2>Little things, made with care</h2></div></div>
        <div class="promise">
          <div><h3>Safe and gentle</h3><p>BPA-free silicone, natural neem wood and soft cotton, chosen for little hands, gums and knees.</p></div>
          <div><h3>Simple and useful</h3><p>Products that solve real everyday moments, like a 2-in-1 sign that works before and after baby arrives.</p></div>
          <div><h3>Easy to buy</h3><p>Order on Amazon.in or Flipkart with the delivery and returns you already trust.</p></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap story">
        <img src="images/teether-fishbird-life.webp" alt="" loading="lazy">
        <div>
          <span class="eyebrow">Our story</span>
          <h2>Why we started Peppynose</h2>
          <p><span class="draft">Draft text</span><br>Peppynose was started to make the small, everyday moments of early parenthood a little easier, with products that are gentle, useful and good value. Your own story goes here.</p>
          <a class="btn ghost" href="about.html">Read our story</a>
        </div>
      </div>
    </section>

    <div class="wrap">
      <div class="band">
        <h2>Shop Peppynose online</h2>
        <p>See our full range, latest prices and offers.</p>
        <div class="actions">
          <a class="btn amazon" href="{AMZ_STORE}" target="_blank" rel="noopener">Amazon.in store</a>
          <a class="btn flipkart" href="{FK_STORE}" target="_blank" rel="noopener">Flipkart</a>
        </div>
      </div>
    </div>'''
    return page('index.html', 'Peppynose — Gentle baby & kids essentials',
                'Peppynose makes gentle baby and kids essentials: Baby on Board car signs, crawling knee pads, silicone & neem wood teethers and learning toys. Shop on Amazon.in and Flipkart.', body)


def products():
    chips = '\n'.join(f'          <a href="#{cid}">{t}</a>' for cid, t, *_ in CATS)
    agebtns = '\n'.join(f'          <button class="agebtn" data-age="{k}">{e(l)}</button>' for k, l in AGES)
    groups = '\n'.join(f'''    <div class="group" id="{cid}">
      <div class="wrap">
        <h2>{t}</h2>
        <p>{e(intro)}</p>
        <div class="grid three">
{chr(10).join(product_card(t, p, ages=AGE_OF.get(p[0], CAT_AGE[cid])) for p in prods)}
        </div>
      </div>
    </div>''' for cid, t, intro, _, prods in CATS)
    body = f'''    <div class="page-head">
      <div class="wrap">
        <span class="eyebrow">Shop</span>
        <h1>All products</h1>
        <p>Every Peppynose product, with a button for each pack size. Tap Amazon or Flipkart to buy. Prices are from Amazon.in.</p>
        <div class="agebar" role="group" aria-label="Filter by age">
          <span>Shop by age:</span>
{agebtns}
        </div>
        <nav class="chips">
{chips}
        </nav>
      </div>
    </div>
{groups}
    <script>
      const btns = document.querySelectorAll('.agebtn');
      function filterAge(a) {{
        btns.forEach(b => b.classList.toggle('on', b.dataset.age === a));
        document.querySelectorAll('.group').forEach(g => {{
          let n = 0;
          g.querySelectorAll('.card').forEach(c => {{ const show = a === 'all' || c.dataset.ages.split(' ').includes(a); c.hidden = !show; n += show; }});
          g.hidden = n === 0;
        }});
        document.querySelector('.chips').hidden = a !== 'all';
      }}
      btns.forEach(b => b.addEventListener('click', () => {{ filterAge(b.dataset.age); history.replaceState(null, '', b.dataset.age === 'all' ? 'products.html' : '?age=' + b.dataset.age); }}));
      filterAge(new URLSearchParams(location.search).get('age') || 'all');
    </script>'''
    return page('products.html', 'Shop all products — Peppynose',
                'All Peppynose baby and kids products: car safety signs, teethers, crawling knee pads and learning toys, on Amazon.in and Flipkart.', body)


def about():
    body = '''    <div class="page-head">
      <div class="wrap"><span class="eyebrow">About us</span><h1>Little things for <em>little ones</em></h1></div>
    </div>
    <section style="padding-top:24px">
      <div class="wrap story">
        <img src="https://images.pexels.com/photos/30701846/pexels-photo-30701846.jpeg?auto=compress&cs=tinysrgb&w=1000" alt="Mother holding her newborn baby in soft light" loading="lazy" onerror="this.onerror=null;this.src='images/teether-gift-life.webp'">
        <div>
          <span class="draft">Draft text — to be replaced with your story</span>
          <h2>Our story</h2>
          <p>Peppynose™ is an Indian brand of baby and kids essentials. We make simple, gentle products for the everyday moments of early parenthood: a sign for the car on the way home from the hospital, soft pads for crawling knees, natural teethers, and toys for learning through play.</p>
          <p>Who started Peppynose, when and why goes here.</p>
        </div>
      </div>
    </section>
    <section class="tint-mint">
      <div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">What we believe</span><h2>Our promise to parents</h2></div></div>
        <div class="promise">
          <div><h3>Safe and gentle</h3><p>BPA-free silicone, natural neem wood and soft cotton, chosen for little hands, gums and knees.</p></div>
          <div><h3>Simple and useful</h3><p>Products that solve real everyday moments for babies and parents.</p></div>
          <div><h3>Honest value</h3><p>Fair prices, and real reviews from verified buyers.</p></div>
        </div>
      </div>
    </section>'''
    return page('about.html', 'About us — Peppynose', 'The story behind Peppynose, an Indian brand of baby and kids essentials.', body)


def faq():
    qa = [
        ('Buying', [
            ('Where can I buy Peppynose products?', 'On Amazon.in and Flipkart. Every product on this site has a button that opens it on the marketplace.'),
            ('Who handles delivery, returns and refunds?', 'Amazon.in or Flipkart, depending on where you ordered, under that marketplace’s delivery and return policy. You can request a return from your order page there.'),
            ('Why can’t I buy directly on this website?', 'We sell through Amazon.in and Flipkart so you get their fast delivery, secure payment and easy returns.'),
        ]),
        ('Car safety signs', [
            ('What does 2-in-1 reversible mean?', 'One side says "Bump on Board" (or "Mom on Board") for pregnancy, and the other says "Baby on Board" for after your baby arrives. Just flip it.'),
            ('What sizes are available?', '14.5 × 14.5 cm and a larger 17.5 × 17.5 cm, in packs of 1 or 2.'),
            ('How does it attach to the car?', 'With a suction cup on the rear windshield. It can be removed and moved to another car.'),
        ]),
        ('Teethers', [
            ('From what age can my baby use the teethers?', 'From 3 months. The silicone is BPA-free and the shapes are neem wood.'),
            ('What is in each teether combo?', 'Fish & Bird and Car & Cloud combos have 3 pieces each. The Complete Gift Set has 6 pieces.'),
        ]),
        ('Knee pads', [
            ('What are the knee pads made of?', 'Soft cotton. They protect knees and elbows while your baby crawls.'),
            ('Which colours and packs are available?', 'Blue Smiley, Yellow Smiley, Gray Dotted and Black Dotted in packs of 2 or 4, and Mint Dotted in a pack of 4.'),
        ]),
    ]
    blocks = '\n'.join(f'        <h2>{t}</h2>\n' + '\n'.join(f'        <details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in items) for t, items in qa)
    body = f'''    <div class="page-head">
      <div class="wrap"><span class="eyebrow">Help</span><h1>Frequently asked questions</h1><p>Quick answers about buying, delivery and our products.</p></div>
    </div>
    <div class="wrap faq">
{blocks}
      <p style="margin-top:40px;color:var(--muted)">Still have a question? <a href="contact.html">Contact us</a>.</p>
    </div>'''
    return page('faq.html', 'FAQ — Peppynose', 'Answers to common questions about buying Peppynose products, delivery, returns, car signs, teethers and knee pads.', body)


def contact():
    body = f'''    <div class="page-head">
      <div class="wrap"><span class="eyebrow">Contact</span><h1>We’d love to <em>hear from you</em></h1><p>Questions about a product, bulk or gift orders, or feedback.</p></div>
    </div>
    <div class="wrap contact-grid">
      <div class="contact-card"><span class="draft">To be added</span><h3>Email</h3><p>Your business email address.</p></div>
      <div class="contact-card"><span class="draft">To be added</span><h3>WhatsApp</h3><p>Your WhatsApp business number, with a tap-to-chat button.</p></div>
      <div class="contact-card"><span class="draft">To be added</span><h3>Instagram</h3><p>Your Instagram handle.</p></div>
    </div>
    <section>
      <div class="wrap">
        <div class="band" style="background:var(--peach-soft)">
          <h2>Help with an order?</h2>
          <p>For delivery, returns or refunds, contact the marketplace you ordered from. They handle every order.</p>
          <div class="actions"><a class="btn amazon" href="https://www.amazon.in/gp/css/order-history" target="_blank" rel="noopener">Amazon.in orders</a><a class="btn flipkart" href="https://www.flipkart.com/account/orders" target="_blank" rel="noopener">Flipkart orders</a></div>
        </div>
      </div>
    </section>'''
    return page('contact.html', 'Contact — Peppynose', 'Get in touch with Peppynose.', body)

# home_v4


# ---- Home page v4: richer, more attractive layout (overrides home() above) ----
STAGES = [
    ('01', 'Expecting & bringing baby home', 'Car Safety Signs', 'car-signs', 'https://images.pexels.com/photos/36152506/pexels-photo-36152506.jpeg?auto=compress&cs=tinysrgb&w=1000|bob-1', 'peach',
     'Let other drivers know there’s a little one on board. One 2-in-1 sign says “Bump on Board” during pregnancy, then flips to “Baby on Board”.',
     [('Baby on Board & Bump on Board Sign', 'bob-1', '₹249', amz('B0GP6XP68R'), FK['bob1']), ('Mom on Board & Baby on Board Sign', 'mob', '₹249', amz('B0GVZFQ2Y5'), FK['mob'])]),
    ('02', 'Teething', 'Teethers', 'teethers', 'teether-gift-life', 'mint',
     'BPA-free silicone with natural neem wood shapes, made for little hands and sore gums from 3 months.',
     [('Complete Gift Set (6 pieces)', 'teether-gift', '₹649', amz('B0H8FF5D9M'), FK['gift']), ('Fish & Bird Combo (3 pieces)', 'teether-fishbird', '₹299', amz('B0H8FFYVTG'), FK['fishbird'])]),
    ('03', 'Crawling', 'Baby Knee Pads', 'knee-pads', 'knee-yellow-life', 'sky',
     'Soft cotton knee and elbow protectors in smiley and dotted designs, for brave little explorers.',
     [('Knee Pads — Blue Smiley, pack of 2', 'knee-blue', '₹179', amz('B0H6SN9GGM'), FK['blue2']), ('Knee Pads — Yellow Smiley, pack of 2', 'knee-yellow', '₹179', amz('B0H6SSTPH3'), FK['yellow2'])]),
    ('04', 'Playing & learning', 'Learning & Play', 'play', 'kitchen', 'sand',
     'Pretend play, first letters and mess-free drawing: toys that make learning fun.',
     [('Wooden Kitchen Play Set', 'kitchen', '₹399', amz('B0DJKLV73B'), None), ('Alphabet & Number Foam Mat', 'foam-mat', '₹229', amz('B0DJRKW3T9'), None)]),
]

ICON = {
    'leaf': '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/></svg>',
    'heart': '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    'box': '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
}


def stage_row(i, st):
    num, stage, cat, cid, img, tone, text, prods = st
    items = '\n'.join(f'''              <div class="mini"><img src="images/{pimg}.webp" alt="" loading="lazy"><div><strong>{e(name)}</strong><span>{price}</span>{buy_buttons(a, f)}</div></div>'''
                      for name, pimg, price, a, f in prods)
    if img.startswith('http'):
        src, fb, cover = img.split('|')[0], img.split('|')[1], ''
    else:
        src, fb, cover = f'images/{img}.webp', '', '' if img.endswith('-life') else ' contain'
    onerr = f''' onerror="this.onerror=null;this.src='images/{fb}.webp';this.parentNode.classList.add('contain')"''' if fb else ''
    return f'''        <div class="stage{' flip' if i % 2 else ''}">
          <div class="stage-ph tone-{tone}{cover}"><img src="{src}" alt="" loading="lazy"{onerr}><span class="stage-num">{num}</span></div>
          <div class="stage-txt">
            <span class="eyebrow">{e(stage)}</span>
            <h3>{e(cat)}</h3>
            <p>{e(text)}</p>
            <div class="minis">
{items}
            </div>
            <a class="link-arrow" href="products.html#{cid}">See all {e(cat.lower())} →</a>
          </div>
        </div>'''


def home():
    best = '\n'.join(best_card(c, i) for c, i in BEST)
    feat = REVIEWS[0]
    small = '\n'.join(review_card(r) for r in REVIEWS[1:])
    marquee_items = ['BPA-free silicone', 'Natural neem wood', 'Soft cotton knee pads', '2-in-1 reversible car signs', 'Verified 5★ reviews', 'Delivered by Amazon.in & Flipkart']
    mq = ''.join(f'<span>{e(t)}</span><i>✦</i>' for t in marquee_items)
    stages = '\n'.join(stage_row(i, s) for i, s in enumerate(STAGES))
    body = f'''    <div class="announce">Rated <b>4.4 out of 5</b> by 140 Amazon.in buyers · Baby on Board sign</div>

    <section class="hero2">
      <div class="blob b1"></div><div class="blob b2"></div>
      <div class="wrap hero2-grid">
        <div class="hero2-txt">
          <span class="pill-tag">For moms, from bump to big kid</span>
          <h1>With you at every<br><em>little</em> stage.</h1>
          <p class="lead">From pregnancy to first crawls, first teeth and first words, Peppynose™ makes gentle, useful things for you and your little one.</p>
          <div class="actions">
            <a class="btn amazon" href="{AMZ_STORE}" target="_blank" rel="noopener">Shop on Amazon.in</a>
            <a class="btn flipkart" href="{FK_STORE}" target="_blank" rel="noopener">Shop on Flipkart</a>
          </div>
          <div class="proof"><span class="stars">★★★★☆</span><span><b>4.4/5</b> from 140 ratings on Amazon.in</span></div>
        </div>
        <div class="hero3-art">
          <img src="images/hero-family.webp" alt="A smiling Indian mother with her child as a baby, a toddler and a school-going kid">
          <a class="fcard fc3" href="{amz('B0GVZFQ2Y5')}" target="_blank" rel="noopener"><img src="images/mob.webp" alt=""><span><b>Mom on Board sign</b>For moms-to-be · ₹249</span></a>
          <span class="spark s1">✦</span>
        </div>
      </div>
    </section>

    <div class="marquee" aria-hidden="true"><div class="track">{mq}{mq}</div></div>

    <section class="ages-p">
      <div class="wrap">
        <div class="center-head"><span class="eyebrow">Shop by age</span><h2>Find what’s right <em>for now</em></h2></div>
        <div class="agegrid-p">
          <a href="products.html?age=pregnancy"><span>🤰</span><b>Pregnancy</b><small>Car signs</small></a>
          <a href="products.html?age=newborn"><span>👶</span><b>Newborn</b><small>Car signs</small></a>
          <a href="products.html?age=months3"><span>🦷</span><b>3 months+</b><small>Teethers</small></a>
          <a href="products.html?age=crawling"><span>🧸</span><b>Crawling babies</b><small>Knee pads</small></a>
          <a href="products.html?age=kids"><span>🧩</span><b>Toddlers &amp; kids</b><small>Learning toys</small></a>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="center-head"><span class="eyebrow">Made for every little stage</span><h2>From bump to baby, <em>one stage</em> at a time</h2><p>Everything we make is designed around a real moment, from pregnancy to your baby’s first years.</p></div>
        <div class="stages">
{stages}
        </div>
      </div>
    </section>

    <section class="tint">
      <div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">Best sellers</span><h2>Parents’ favourites</h2></div><a class="btn ghost" href="products.html">Shop all products</a></div>
        <div class="grid">
{best}
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="center-head"><span class="eyebrow">Reviews</span><h2>Loved by parents</h2><p>Genuine reviews from verified buyers, word for word.</p></div>
        <figure class="feature-review">
          <span class="stars">★★★★★</span>
          <blockquote>“{e(feat[0])}”</blockquote>
          <figcaption><strong>{e(feat[1])}</strong> · {e(feat[4])} · {e(feat[2])} · <span class="src">Verified purchase · {e(feat[3])}</span></figcaption>
        </figure>
        <div class="reviews three">
{small}
        </div>
      </div>
    </section>

    <section class="tint-mint">
      <div class="wrap">
        <div class="center-head"><span class="eyebrow">Our promise</span><h2>Little things, made with care</h2></div>
        <div class="promise2">
          <div><span class="ic">{ICON['leaf']}</span><h3>Safe and gentle</h3><p>BPA-free silicone, natural neem wood and soft cotton, chosen for little hands, gums and knees.</p></div>
          <div><span class="ic">{ICON['heart']}</span><h3>Simple and useful</h3><p>Products for real everyday moments, like a 2-in-1 sign that works before and after baby arrives.</p></div>
          <div><span class="ic">{ICON['box']}</span><h3>Easy to buy</h3><p>Order on Amazon.in or Flipkart with the delivery and returns you already trust.</p></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="band2">
          <div class="band2-txt">
            <h2>Shop Peppynose <em>online</em></h2>
            <p>See our full range, latest prices and offers on your favourite marketplace.</p>
            <div class="actions">
              <a class="btn amazon" href="{AMZ_STORE}" target="_blank" rel="noopener">Amazon.in store</a>
              <a class="btn flipkart" href="{FK_STORE}" target="_blank" rel="noopener">Flipkart</a>
            </div>
          </div>
          <div class="band2-ph"><img src="https://images.pexels.com/photos/6392892/pexels-photo-6392892.jpeg?auto=compress&cs=tinysrgb&w=1000" alt="Mother and baby resting together" loading="lazy" onerror="this.onerror=null;this.src='images/teether-fishbird-life.webp'"><img src="images/knee-mint-life.webp" alt="" loading="lazy"></div>
        </div>
      </div>
    </section>'''
    return page('index.html', 'Peppynose — Gentle baby & kids essentials',
                'Peppynose makes gentle baby and kids essentials: Baby on Board car signs, crawling knee pads, silicone & neem wood teethers and learning toys. Shop on Amazon.in and Flipkart.', body)

# home_v5


# ---- Home page v5: bold "bento" design (overrides home() above) ----
KNEE_COLOURS = [
    ('blue', 'Blue Smiley', '#9cc3ea', [('Pack of 2', '₹179', amz('B0H6SN9GGM'), FK['blue2']), ('Pack of 4', '₹340', amz('B0H6SFL34Q'), FK['blue4'])]),
    ('yellow', 'Yellow Smiley', '#f2b51d', [('Pack of 2', '₹179', amz('B0H6SSTPH3'), FK['yellow2']), ('Pack of 4', '₹340', amz('B0H6SVQ5JL'), FK['yellow4'])]),
    ('mint', 'Mint Dotted', '#7fd1b9', [('Pack of 4', '₹340', amz('B0H757K755'), FK['mint4'])]),
    ('gray', 'Gray Dotted', '#9a9a9a', [('Pack of 2', '₹179', amz('B0H6SNM4ZR'), FK['gray2']), ('Pack of 4', '₹340', amz('B0H6SMPC3J'), FK['gray4'])]),
    ('black', 'Black Dotted', '#2b2b2b', [('Pack of 2', '₹179', amz('B0H6SH8ZVQ'), FK['black2']), ('Pack of 4', '₹340', amz('B0H6SSPWSR'), FK['black4'])]),
]
PEXELS_MOM = 'https://images.pexels.com/photos/6392989/pexels-photo-6392989.jpeg?auto=compress&cs=tinysrgb&w=900'


def v5_pack_rows(opts):
    return ''.join(f'<div class="v5-pack"><span>{label}</span><b>{price}</b>{buy_buttons(a, f)}</div>' for label, price, a, f in opts)


def home_bold():
    swatches = ''.join(
        f'<button class="sw{" on" if i == 0 else ""}" style="--c:{hexc}" data-k="{k}" aria-label="{name}"><span></span>{name}</button>'
        for i, (k, name, hexc, _) in enumerate(KNEE_COLOURS))
    packs = ''.join(
        f'<div class="v5-packs" data-k="{k}"{"" if i == 0 else " hidden"}>{v5_pack_rows(opts)}</div>'
        for i, (k, _, _, opts) in enumerate(KNEE_COLOURS))
    reviews = ''.join(
        f'<figure class="v5-rev"><span class="stars">★★★★★</span><blockquote>“{e(t)}”</blockquote><figcaption><b>{e(w)}</b> · {e(p)}<br><small>Verified purchase · {e(s)}</small></figcaption></figure>'
        for t, w, d, s, p in REVIEWS)
    body = f'''  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&display=swap" rel="stylesheet">
  <div class="v5">
    <section class="v5-hero">
      <div class="wrap bento">
        <div class="t t-head">
          <span class="chip">👶 For moms-to-be &amp; little ones</span>
          <h1>Made for moms.<br>Loved by <span class="hl">babies.</span></h1>
          <p>Car signs for the drive home, soft knee pads for first crawls, natural teethers for first teeth, and toys for first words.</p>
          <div class="actions">
            <a class="btn amazon" href="{AMZ_STORE}" target="_blank" rel="noopener">Shop on Amazon.in</a>
            <a class="btn flipkart" href="{FK_STORE}" target="_blank" rel="noopener">Shop on Flipkart</a>
          </div>
        </div>
        <div class="t t-photo"><img src="{PEXELS_MOM}" alt="A mother holding her baby close" onerror="this.onerror=null;this.src='images/teether-gift-life.webp'"></div>
        <div class="t t-rate"><b>4.4<small>/5</small></b><span class="stars">★★★★☆</span><p>140 ratings on Amazon.in<br>for our Baby on Board sign</p></div>
        <a class="t t-sign" href="{amz('B0GP6XP68R')}" target="_blank" rel="noopener"><img src="images/bob-1.webp" alt=""><div><small>Best seller</small><b>2-in-1 Bump / Baby on Board sign</b><span>₹249 →</span></div></a>
        <div class="t t-crawl"><img src="images/knee-yellow-life.webp" alt="Baby crawling in yellow smiley knee pads"></div>
        <div class="t t-fact"><b>BPA-free</b><span>silicone &amp; natural neem wood teethers</span></div>
        <div class="t t-teeth"><img src="images/bob-car-wide.webp" alt="Peppynose Baby on Board sign on a car rear window"><span class="t-label">2-in-1 Baby on Board sign · seen by every driver behind you</span></div>
      </div>
    </section>

    <section class="v5-ages">
      <div class="wrap">
        <h2 class="v5-h2">Shop by age</h2>
        <div class="v5-agegrid">
          <a href="products.html?age=pregnancy" class="c-pink"><b>🤰</b><span>Pregnancy</span></a>
          <a href="products.html?age=newborn" class="c-yellow"><b>👶</b><span>Newborn</span></a>
          <a href="products.html?age=months3" class="c-mint"><b>🦷</b><span>3 months+</span></a>
          <a href="products.html?age=crawling" class="c-blue"><b>🧸</b><span>Crawling babies</span></a>
          <a href="products.html?age=kids" class="c-pink"><b>🧩</b><span>Toddlers &amp; kids</span></a>
        </div>
      </div>
    </section>

    <section class="v5-cats">
      <div class="wrap">
        <h2 class="v5-h2">Shop by little moment</h2>
        <div class="v5-catgrid">
          <a class="v5-cat c-yellow" href="products.html#car-signs"><div><small>Pregnancy &amp; first drive</small><h3>Car Safety Signs</h3><span>from ₹249 →</span></div><img src="images/mob.webp" alt=""></a>
          <a class="v5-cat c-mint" href="products.html#teethers"><div><small>3+ months</small><h3>Teethers</h3><span>from ₹299 →</span></div><img src="images/teether-gift.webp" alt=""></a>
          <a class="v5-cat c-blue" href="products.html#knee-pads"><div><small>Crawling</small><h3>Knee Pads</h3><span>from ₹179 →</span></div><img src="images/knee-blue.webp" alt=""></a>
          <a class="v5-cat c-pink" href="products.html#play"><div><small>Play &amp; learn</small><h3>Toys</h3><span>from ₹199 →</span></div><img src="images/kitchen.webp" alt=""></a>
        </div>
      </div>
    </section>

    <section class="v5-sign">
      <div class="wrap v5-split">
        <img class="v5-sign-img" src="images/bob-compare.webp" alt="One Peppynose sign replaces two: Bump on Board and Baby on Board">
        <div>
          <span class="chip">Our best seller · 4.4★ on Amazon.in</span>
          <h2 class="v5-h2">One sign.<br>Bump to baby.</h2>
          <p>Show “Bump on Board” while you’re expecting, then flip it to “Baby on Board” for the drive home. Bright yellow, 300 GSM laminated board, strong suction cup.</p>
          <div class="v5-packs">{v5_pack_rows([('14.5 cm · pack of 1', '₹249', amz('B0GP6XP68R'), FK['bob1']), ('14.5 cm · pack of 2', '₹399', amz('B0H2QVVDRX'), FK['bob2']), ('Mom on Board · pack of 1', '₹249', amz('B0GVZFQ2Y5'), FK['mob'])])}</div>
        </div>
      </div>
    </section>

    <section class="v5-knee">
      <div class="wrap v5-split">
        <div>
          <span class="chip">Baby Knee Pads · soft cotton</span>
          <h2 class="v5-h2">Pick a colour,<br>start crawling.</h2>
          <p>Soft cotton knee and elbow protectors for brave little explorers. Tap a colour to see it.</p>
          <div class="swatches">{swatches}</div>
          {packs}
        </div>
        <div class="v5-knee-ph"><img id="kneeImg" src="images/knee-blue-life.webp" alt="Baby crawling in Peppynose knee pads"></div>
      </div>
    </section>

    <section class="v5-teeth">
      <div class="wrap">
        <h2 class="v5-h2 center">Teething, made gentler</h2>
        <p class="center sub">BPA-free silicone ring with natural neem wood shapes. For babies 3 months and up.</p>
        <div class="v5-teethgrid">
          <div class="v5-tcard"><img src="images/teether-gift.webp" alt=""><h3>Complete Gift Set</h3><p>6 pieces · a lovely baby gift</p>{v5_pack_rows([('Set of 6', '₹649', amz('B0H8FF5D9M'), FK['gift'])])}</div>
          <div class="v5-tcard"><img src="images/teether-fishbird.webp" alt=""><h3>Fish &amp; Bird Combo</h3><p>3 pieces</p>{v5_pack_rows([('Combo', '₹299', amz('B0H8FFYVTG'), FK['fishbird'])])}</div>
          <div class="v5-tcard"><img src="images/teether-carcloud.webp" alt=""><h3>Car &amp; Cloud Combo</h3><p>3 pieces</p>{v5_pack_rows([('Combo', '₹299', amz('B0H8FGM8R3'), FK['carcloud'])])}</div>
        </div>
      </div>
    </section>

    <section class="v5-reviews">
      <div class="wrap">
        <h2 class="v5-h2 center">Parents say it best</h2>
        <p class="center sub">Real reviews from verified buyers, word for word.</p>
        <div class="v5-revgrid">{reviews}</div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="v5-band">
          <img src="logo-mark.png" alt="">
          <h2>Find us on Amazon.in &amp; Flipkart</h2>
          <p>Fast delivery, secure payment and easy returns, the way you already shop.</p>
          <div class="actions"><a class="btn amazon" href="{AMZ_STORE}" target="_blank" rel="noopener">Amazon.in store</a><a class="btn flipkart" href="{FK_STORE}" target="_blank" rel="noopener">Flipkart</a></div>
        </div>
      </div>
    </section>
  </div>
  <script>
    document.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => {{
      document.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.v5-knee .v5-packs').forEach(p => p.hidden = p.dataset.k !== b.dataset.k);
      document.getElementById('kneeImg').src = 'images/knee-' + b.dataset.k + '-life.webp';
    }}));
  </script>'''
    return page('index-bold.html', 'Peppynose — Made for moms, loved by babies',
                'Peppynose baby essentials: 2-in-1 Bump on Board / Baby on Board car signs, soft crawling knee pads, BPA-free teethers and learning toys. Shop on Amazon.in and Flipkart.', body)


for name, fn in [('index.html', home), ('index-bold.html', home_bold), ('products.html', products), ('about.html', about), ('faq.html', faq), ('contact.html', contact)]:
    (OUT / name).write_text(fn())
print('written to', OUT)
