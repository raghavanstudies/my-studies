/* Peppynose V4 FAQ helper: a small chat button above the WhatsApp button. Fixed answers in EN / TA / HI,
   simple keyword matching for typed questions, and "Chat on WhatsApp" when no answer fits.
   Vanilla JS, no third-party service. Nothing typed is stored or sent anywhere (only open/closed state in sessionStorage).
   Facts come only from the current site pages (FAQ, products). */
(() => {
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const root = lang === 'en' ? '/' : '/' + lang + '/';
  const WA = 'https://wa.me/917448704660?text=';
  const EMAIL = 'care.peppynose@gmail.com';
  const QA = [
    { id: 'where_to_buy', k: ['buy', 'where', 'shop', 'order', 'store', 'amazon', 'flipkart', 'வாங்க', 'எங்கே', 'கடை', 'ஸ்டோர்', 'खरीद', 'कहाँ', 'दुकान', 'स्टोर'],
      q: { en: 'Where can I buy Peppynose products?', ta: 'Peppynose பொருட்களை எங்கே வாங்கலாம்?', hi: 'Peppynose के प्रोडक्ट कहाँ से खरीदें?' },
      a: { en: 'On Amazon.in and Flipkart. Every product on this site has a button that opens it there. Our own store is coming soon.',
           ta: 'Amazon.in மற்றும் Flipkart-இல் வாங்கலாம். இந்தத் தளத்தில் ஒவ்வொரு பொருளுக்கும் அங்கே திறக்கும் பொத்தான் உள்ளது. எங்கள் சொந்த ஸ்டோர் விரைவில் வருகிறது.',
           hi: 'Amazon.in और Flipkart पर। इस साइट पर हर प्रोडक्ट के साथ एक बटन है जो उसे वहाँ खोलता है। हमारा अपना स्टोर जल्द आ रहा है।' },
      link: { href: 'products.html', t: { en: 'See all products', ta: 'எல்லாப் பொருட்களும்', hi: 'सभी प्रोडक्ट देखें' } } },
    { id: 'which_sign', k: ['which', 'sign', 'mom on board', 'baby on board', 'bump', 'board', 'reversible', 'pregnan', 'பலகை', 'அடையாள', 'எந்த', 'साइन', 'कौन', 'बोर्ड'],
      q: { en: 'Which Baby / Mom on Board sign should I choose?', ta: 'எந்த Baby / Mom on Board பலகையைத் தேர்வு செய்வது?', hi: 'कौन-सा Baby / Mom on Board साइन चुनें?' },
      a: { en: 'Both are 2-in-1 and reversible. The Mom on Board sign is for pregnancy, and you flip it to Baby on Board later. The Baby on Board & Bump on Board sign flips from bump to baby. Size 14.5 × 14.5 cm, packs of 1 or 2. A larger 17.5 × 17.5 cm size is coming soon.',
           ta: 'இரண்டுமே 2-in-1, இருபுறமும் பயன்படுத்தலாம். Mom on Board பலகை கர்ப்ப காலத்துக்கு; பிறகு திருப்பி Baby on Board ஆகப் பயன்படுத்தலாம். Baby on Board & Bump on Board பலகை bump-இலிருந்து baby-க்குத் திரும்பும். அளவு 14.5 × 14.5 செ.மீ., 1 அல்லது 2 பேக். பெரிய 17.5 × 17.5 செ.மீ. அளவு விரைவில் வரும்.',
           hi: 'दोनों 2-in-1 हैं और पलटकर इस्तेमाल होते हैं। Mom on Board साइन प्रेग्नेंसी के लिए है, बाद में इसे पलटकर Baby on Board बना लें। Baby on Board & Bump on Board साइन bump से baby में पलटता है। साइज़ 14.5 × 14.5 सेमी, 1 या 2 का पैक। बड़ा 17.5 × 17.5 सेमी साइज़ जल्द आ रहा है।' },
      link: { href: 'products.html#car-signs', t: { en: 'See the signs', ta: 'பலகைகளைப் பார்க்க', hi: 'साइन देखें' } } },
    { id: 'stick_remove_sign', k: ['stick', 'attach', 'suction', 'remove', 'glass', 'window', 'fix', 'ஒட்ட', 'பொருத்த', 'அகற்ற', 'கண்ணாடி', 'சக்ஷன்', 'चिपका', 'लगा', 'हटा', 'शीशे', 'सक्शन'],
      q: { en: 'How do I stick and remove the car sign?', ta: 'காரில் பலகையை எப்படி ஒட்டுவது, எடுப்பது?', hi: 'कार साइन कैसे लगाएँ और हटाएँ?' },
      a: { en: 'It attaches with a suction cup on the rear windshield. Press the cup on clean, dry glass. To remove it, lift the edge of the cup gently. You can move it to another car.',
           ta: 'பின் கண்ணாடியில் சக்ஷன் கப் மூலம் ஒட்டிக்கொள்ளும். சுத்தமான, உலர்ந்த கண்ணாடியில் கப்பை அழுத்துங்கள். எடுக்க, கப்பின் ஓரத்தை மெதுவாகத் தூக்குங்கள். வேறு காருக்கும் மாற்றலாம்.',
           hi: 'यह पीछे के शीशे पर सक्शन कप से लगता है। साफ़, सूखे शीशे पर कप दबाएँ। हटाने के लिए कप का किनारा धीरे से उठाएँ। इसे दूसरी कार में भी लगा सकते हैं।' } },
    { id: 'teether_care', k: ['clean', 'wash', 'care', 'teether', 'hygien', 'neem', 'silicone', 'சுத்த', 'கழுவ', 'பல் கடி', 'டீதர்', 'साफ', 'साफ़', 'धो', 'टीदर', 'देखभाल'],
      q: { en: 'How do I clean and care for the teether?', ta: 'டீதரை எப்படிச் சுத்தம் செய்து பராமரிப்பது?', hi: 'टीदर को कैसे साफ़ करें और संभालें?' },
      a: { en: 'Our teethers are BPA-free silicone with neem wood shapes. In general: wash with mild soap and clean water, rinse well and let it air-dry. Check it before every use and stop using it if it is damaged. Please follow the care notes on the Amazon.in or Flipkart listing.',
           ta: 'எங்கள் டீதர்கள் BPA-free சிலிகான் மற்றும் வேப்ப மர வடிவங்கள். பொதுவாக: மிதமான சோப்பும் சுத்தமான தண்ணீரும் கொண்டு கழுவி, நன்றாக அலசி, காற்றில் உலர விடுங்கள். ஒவ்வொரு முறையும் பயன்படுத்தும் முன் சரிபார்த்து, சேதமாக இருந்தால் பயன்படுத்த வேண்டாம். Amazon.in அல்லது Flipkart பக்கத்தில் உள்ள பராமரிப்புக் குறிப்புகளைப் பின்பற்றுங்கள்.',
           hi: 'हमारे टीदर BPA-free सिलिकॉन और नीम की लकड़ी के आकार वाले हैं। आम तौर पर: हल्के साबुन और साफ़ पानी से धोएँ, अच्छी तरह खंगालें और हवा में सूखने दें। हर बार इस्तेमाल से पहले जाँचें और खराब हो तो इस्तेमाल न करें। Amazon.in या Flipkart पेज पर दिए देखभाल निर्देश मानें।' },
      link: { href: 'products.html#teethers', t: { en: 'See teethers', ta: 'டீதர்களைப் பார்க்க', hi: 'टीदर देखें' } } },
    { id: 'teether_age', k: ['age', 'month', 'old', 'suitable', 'when', 'வயது', 'மாத', 'எப்போது', 'उम्र', 'महीने', 'कब'],
      q: { en: 'From what age are the teethers?', ta: 'டீதர்கள் எந்த வயதிலிருந்து?', hi: 'टीदर किस उम्र से हैं?' },
      a: { en: 'From 3 months. Always stay with your baby while they use a teether. Fish & Bird and Car & Cloud combos have 3 pieces each; the Complete Gift Set has 6.',
           ta: '3 மாதத்திலிருந்து. டீதர் பயன்படுத்தும்போது எப்போதும் குழந்தையுடன் இருங்கள். Fish & Bird, Car & Cloud காம்போக்களில் தலா 3 துண்டுகள்; Complete Gift Set-இல் 6.',
           hi: '3 महीने से। टीदर इस्तेमाल करते समय हमेशा बच्चे के पास रहें। Fish & Bird और Car & Cloud कॉम्बो में 3-3 पीस हैं; Complete Gift Set में 6।' } },
    { id: 'knee_pad_size', k: ['knee', 'pad', 'size', 'crawl', 'fit', 'முழங்கால்', 'அளவு', 'தவழ', 'घुटन', 'नी पैड', 'साइज़', 'साइज', 'रेंग'],
      q: { en: 'What size are the knee pads?', ta: 'முழங்கால் பேட்கள் என்ன அளவு?', hi: 'नी पैड किस साइज़ के हैं?' },
      a: { en: 'They are made for little ones aged 1 to 3 years, in soft cotton, and protect knees and elbows while crawling. Colours: Blue Smiley, Yellow Smiley, Gray Dotted and Black Dotted (packs of 2 or 4) and Mint Dotted (pack of 4). For exact measurements, please see the listing.',
           ta: '1 முதல் 3 வயது குழந்தைகளுக்கானவை; மென்மையான காட்டன்; தவழும்போது முழங்கால், முழங்கையைப் பாதுகாக்கும். நிறங்கள்: Blue Smiley, Yellow Smiley, Gray Dotted, Black Dotted (2 அல்லது 4 பேக்), Mint Dotted (4 பேக்). சரியான அளவுகளுக்கு பொருள் பக்கத்தைப் பாருங்கள்.',
           hi: 'ये 1 से 3 साल के बच्चों के लिए हैं, मुलायम कॉटन के, और रेंगते समय घुटनों व कोहनियों को बचाते हैं। रंग: Blue Smiley, Yellow Smiley, Gray Dotted और Black Dotted (2 या 4 का पैक) और Mint Dotted (4 का पैक)। सही नाप के लिए प्रोडक्ट पेज देखें।' },
      link: { href: 'products.html#knee-pads', t: { en: 'See knee pads', ta: 'பேட்களைப் பார்க்க', hi: 'नी पैड देखें' } } },
    { id: 'delivery_returns', k: ['deliver', 'ship', 'return', 'refund', 'exchange', 'cancel', 'track', 'டெலிவரி', 'திருப்ப', 'பணம்', 'அனுப்ப', 'डिलीवरी', 'वापस', 'रिफ़ंड', 'रिफंड', 'लौटा'],
      q: { en: 'Who handles delivery and returns?', ta: 'டெலிவரி, ரிட்டர்ன் யார் பார்த்துக்கொள்வார்கள்?', hi: 'डिलीवरी और रिटर्न कौन संभालता है?' },
      a: { en: 'Amazon.in or Flipkart, depending on where you ordered, under that marketplace’s delivery and return policy. You can request a return from your order page there.',
           ta: 'நீங்கள் எங்கே ஆர்டர் செய்தீர்களோ அந்த Amazon.in அல்லது Flipkart, அவர்களின் டெலிவரி மற்றும் ரிட்டர்ன் கொள்கைப்படி. ரிட்டர்னை அங்கேயுள்ள உங்கள் ஆர்டர் பக்கத்தில் கேட்கலாம்.',
           hi: 'जहाँ से आपने ऑर्डर किया, वही Amazon.in या Flipkart, अपनी डिलीवरी और रिटर्न पॉलिसी के अनुसार। रिटर्न वहीं अपने ऑर्डर पेज से माँग सकते हैं।' },
      link: { href: 'returns.html', t: { en: 'Returns & refunds', ta: 'ரிட்டர்ன் & பணம் திரும்ப', hi: 'रिटर्न और रिफ़ंड' } } },
    { id: 'tracker_info', k: ['tracker', 'week', 'due', 'pregnan', 'baby size', 'வாரம்', 'கர்ப்ப', 'டிராக்கர்', 'हफ़्त', 'हफ्त', 'गर्भ', 'प्रेग्नेंसी', 'ट्रैकर'],
      q: { en: 'What is the pregnancy tracker?', ta: 'கர்ப்ப வார டிராக்கர் என்றால் என்ன?', hi: 'प्रेग्नेंसी ट्रैकर क्या है?' },
      a: { en: 'A free tool: enter your due date or the first day of your last period to see your week, baby’s size, days to go, checkup reminders and a weekly to-do. Your date stays on your phone. It is general information, not medical advice.',
           ta: 'இலவசக் கருவி: உங்கள் பிரசவ தேதி அல்லது கடைசி மாதவிடாயின் முதல் நாளை உள்ளிட்டால் உங்கள் வாரம், குழந்தையின் அளவு, மீதமுள்ள நாட்கள், பரிசோதனை நினைவூட்டல்கள், வாராந்திர செய்ய வேண்டியவை தெரியும். தேதி உங்கள் போனிலேயே இருக்கும். இது பொதுவான தகவல், மருத்துவ ஆலோசனை அல்ல.',
           hi: 'एक मुफ़्त टूल: अपनी ड्यू डेट या आख़िरी पीरियड का पहला दिन डालें और अपना हफ़्ता, बच्चे का आकार, बचे दिन, चेकअप रिमाइंडर और हफ़्ते की टू-डू सूची देखें। तारीख़ आपके फ़ोन में ही रहती है। यह सामान्य जानकारी है, डॉक्टरी सलाह नहीं।' },
      link: { href: 'pregnancy-tracker.html', t: { en: 'Open the tracker', ta: 'டிராக்கரைத் திறக்க', hi: 'ट्रैकर खोलें' } } },
    { id: 'contact', k: ['contact', 'email', 'mail', 'talk', 'help', 'complain', 'தொடர்பு', 'மின்னஞ்சல்', 'உதவி', 'संपर्क', 'ईमेल', 'मदद', 'बात'],
      q: { en: 'How do I contact Peppynose?', ta: 'Peppynose-ஐ எப்படித் தொடர்புகொள்வது?', hi: 'Peppynose से कैसे संपर्क करें?' },
      a: { en: 'Email us at ' + EMAIL + ' or chat with us on WhatsApp.', ta: EMAIL + ' என்ற மின்னஞ்சலுக்கு எழுதுங்கள் அல்லது WhatsApp-இல் பேசுங்கள்.', hi: EMAIL + ' पर ईमेल करें या WhatsApp पर बात करें।' },
      link: { href: 'mailto:' + EMAIL, t: { en: EMAIL, ta: EMAIL, hi: EMAIL } } }
  ];
  const U = {
    en: { btn: 'Questions? Ask here', title: 'Quick answers', hello: 'Hi! Tap a question or type your own.', ph: 'Type your question', send: 'Ask', close: 'Close', none: 'Sorry, I don’t have an answer for that. Please chat with us on WhatsApp.', wa: 'Chat on WhatsApp', more: 'More questions', note: 'Answers are fixed. Nothing you type is saved or sent.' , waText: 'Hi Peppynose, I have a question' },
    ta: { btn: 'கேள்விகள்? இங்கே கேளுங்கள்', title: 'விரைவுப் பதில்கள்', hello: 'வணக்கம்! ஒரு கேள்வியைத் தட்டுங்கள் அல்லது உங்கள் கேள்வியை எழுதுங்கள்.', ph: 'உங்கள் கேள்வியை எழுதுங்கள்', send: 'கேள்', close: 'மூடு', none: 'மன்னிக்கவும், இதற்கான பதில் என்னிடம் இல்லை. WhatsApp-இல் எங்களுடன் பேசுங்கள்.', wa: 'WhatsApp-இல் பேச', more: 'மேலும் கேள்விகள்', note: 'பதில்கள் முன்பே எழுதப்பட்டவை. நீங்கள் எழுதுவது சேமிக்கப்படுவதோ அனுப்பப்படுவதோ இல்லை.', waText: 'வணக்கம் Peppynose, எனக்கு ஒரு கேள்வி உள்ளது' },
    hi: { btn: 'सवाल? यहाँ पूछें', title: 'झटपट जवाब', hello: 'नमस्ते! कोई सवाल चुनें या अपना सवाल लिखें।', ph: 'अपना सवाल लिखें', send: 'पूछें', close: 'बंद करें', none: 'माफ़ कीजिए, इसका जवाब मेरे पास नहीं है। कृपया WhatsApp पर हमसे बात करें।', wa: 'WhatsApp पर बात करें', more: 'और सवाल', note: 'जवाब पहले से लिखे हैं। आप जो लिखते हैं, वह न सेव होता है न भेजा जाता है।', waText: 'नमस्ते Peppynose, मेरा एक सवाल है' }
  }[lang] || null;
  if (!U) return;
  const tr = o => o[lang] || o.en;
  const track = (n, p) => window.pnTrack && window.pnTrack(n, p);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const href = h => /^(mailto:|https?:)/.test(h) ? h : root + h;
  const waHref = q => WA + encodeURIComponent(U.waText + (q ? ': ' + q : ''));

  const wrap = document.createElement('div');
  wrap.className = 'pn-chat'; wrap.lang = lang; wrap.setAttribute('data-clarity-mask', 'True');   // Clarity never sees the chat text
  wrap.innerHTML =
    `<button type="button" class="pn-chat-btn" aria-expanded="false" aria-controls="pn-chat-panel" aria-label="${esc(U.btn)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5"/><circle cx="12" cy="16.3" r=".6" fill="currentColor"/></svg></button>
     <div class="pn-chat-panel" id="pn-chat-panel" role="dialog" aria-label="${esc(U.title)}" hidden>
       <div class="pn-chat-h"><b>${esc(U.title)}</b><button type="button" class="pn-chat-x" aria-label="${esc(U.close)}">✕</button></div>
       <div class="pn-chat-log" aria-live="polite"></div>
       <form class="pn-chat-f"><input type="text" maxlength="120" aria-label="${esc(U.ph)}" placeholder="${esc(U.ph)}" autocomplete="off"><button type="submit">${esc(U.send)}</button></form>
       <p class="pn-chat-note">${esc(U.note)}</p>
     </div>`;
  document.body.appendChild(wrap);
  const btn = wrap.querySelector('.pn-chat-btn'), panel = wrap.querySelector('.pn-chat-panel'), log = wrap.querySelector('.pn-chat-log');
  const form = wrap.querySelector('form'), input = form.querySelector('input');
  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'pn-m ' + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  const chips = () => add('chips', QA.map(x => `<button type="button" data-q="${x.id}">${esc(tr(x.q))}</button>`).join(''));
  const waBtn = q => `<a class="pn-chat-wa" href="${waHref(q)}" target="_blank" rel="noopener">${esc(U.wa)}</a>`;
  const answer = (x, typed) => {
    add('me', esc(typed || tr(x.q)));
    add('bot', `<p>${esc(tr(x.a))}</p>` + (x.link ? `<a class="pn-chat-link" href="${href(x.link.href)}">${esc(tr(x.link.t))}</a>` : '') + waBtn(''));
    track('chatbot_question', { question_id: x.id, how: typed ? 'typed' : 'tapped' });
    add('more', `<button type="button" class="pn-more">${esc(U.more)}</button>`);
  };
  const norm = s => s.toLowerCase().normalize('NFC');
  const match = s => {
    const t = norm(s); let best = null, score = 0;
    QA.forEach(x => { const n = x.k.reduce((a, k) => a + (t.includes(norm(k)) ? (k.length > 4 ? 2 : 1) : 0), 0); if (n > score) { score = n; best = x; } });
    return best;
  };
  let started = false;
  const setOpen = o => {
    panel.hidden = !o; btn.setAttribute('aria-expanded', String(o)); wrap.classList.toggle('open', o);
    try { sessionStorage.setItem('pn_chat_open', o ? '1' : '0'); } catch (e) {}
    if (o) { if (!started) { started = true; add('bot', `<p>${esc(U.hello)}</p>`); chips(); } track('chatbot_open', {}); setTimeout(() => input.focus({ preventScroll: true }), 50); }
  };
  btn.addEventListener('click', () => setOpen(panel.hidden));
  wrap.querySelector('.pn-chat-x').addEventListener('click', () => { setOpen(false); btn.focus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });
  log.addEventListener('click', e => {
    const b = e.target.closest('button[data-q]'); if (b) { answer(QA.find(x => x.id === b.dataset.q)); return; }
    if (e.target.closest('.pn-more')) { e.target.closest('.pn-m').remove(); chips(); return; }
    if (e.target.closest('.pn-chat-wa')) track('faq_whatsapp_handoff', {});
  });
  form.addEventListener('submit', e => {
    e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = '';
    const x = match(v);
    if (x) answer(x, v);
    else { add('me', esc(v)); add('bot', `<p>${esc(U.none)}</p>` + waBtn(v)); track('chatbot_question', { question_id: 'no_match', how: 'typed' }); add('more', `<button type="button" class="pn-more">${esc(U.more)}</button>`); }
  });
  try { if (sessionStorage.getItem('pn_chat_open') === '1' && innerWidth > 760) setOpen(true); } catch (e) {}

  // Hide the chat button (like the WhatsApp button) while a buy button, the footer etc. passes under it.
  if ('IntersectionObserver' in window) {
    let io; const hits = new Set();
    const setup = () => {
      if (io) io.disconnect(); hits.clear(); wrap.classList.remove('pn-chat-hide');
      const r = btn.getBoundingClientRect(), pad = 10;
      io = new IntersectionObserver(es => { es.forEach(x => x.isIntersecting ? hits.add(x.target) : hits.delete(x.target)); wrap.classList.toggle('pn-chat-hide', hits.size > 0 && panel.hidden); },
        { rootMargin: `-${Math.max(0, Math.floor(r.top - pad))}px -${Math.max(0, Math.floor(innerWidth - r.right - pad))}px -${Math.max(0, Math.floor(innerHeight - r.bottom - pad))}px -${Math.max(0, Math.floor(r.left - pad))}px` });
      document.querySelectorAll('.buy, .actions, .btn, .ig-grid, .agebar, .chips, footer, .pn-qr').forEach(el => io.observe(el));
    };
    setup(); let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(setup, 150); });
  }
})();
