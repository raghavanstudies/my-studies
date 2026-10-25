/* Where the account API lives.
   Live pages call the shop Worker. On localhost and 127.0.0.1 the pages and
   the API are the same host, so the override below clears this for tests
   and `wrangler dev`. Do not put secrets in this file. It is published with
   the static site. Setup steps are in shop/README.md under "Accounts". */
window.PN_AUTH_API = "https://api.peppynose.com";
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.PN_AUTH_API = "";
