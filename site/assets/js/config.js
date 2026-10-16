// Everything the club may need to change lives here. After editing, commit — the site redeploys itself.
export default {
  // Google Sheet → File → Share → Publish to web → choose the tab → "Comma-separated values (.csv)" → copy the link.
  // Empty = that tab is not used: no causes (only "Общо за клуба" below), only the BFB schedule, and a
  // "write to us" block instead of partner packages.
  sheet: {
    needs: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSe3OvETse7xrCYwQWFTTL4DGovVGgD8I81-0kpLsCQUe4hNoL39UGp2qSRg2FoZfTu8eh4Vr5xrfIn/pub?gid=1622944424&single=true&output=csv', // tab "Нужди"
    games: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSe3OvETse7xrCYwQWFTTL4DGovVGgD8I81-0kpLsCQUe4hNoL39UGp2qSRg2FoZfTu8eh4Vr5xrfIn/pub?gid=2020671794&single=true&output=csv', // tab "Мачове"
    packages: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSe3OvETse7xrCYwQWFTTL4DGovVGgD8I81-0kpLsCQUe4hNoL39UGp2qSRg2FoZfTu8eh4Vr5xrfIn/pub?gid=1210437501&single=true&output=csv', // tab "Пакети"
  },

  // Online payment link for "Общо за клуба", shown only when the Sheet has no open causes (not connected,
  // unreachable or empty). The club's own general cause is a row in the Sheet, with its link there.
  // Stripe Payment Link recommended; PayPal works too.
  // A link containing PLACEHOLDER shows a disabled "Онлайн дарение – скоро" button.
  generalPayLink: 'https://www.paypal.com/ncp/payment/PLACEHOLDER',

  // Bank transfer. While iban is empty, the site asks donors to write for the bank details.
  bank: {
    recipient: 'БК „Септември-97“',
    iban: '',
    bic: '',
    bankName: '',
  },

  email: 'bmandur11@icloud.com',
  facebookPage: 'https://www.facebook.com/107623030976164',
  siteUrl: 'https://www.septemvri97.eu/',

  // Names the Sheet may use for the club, so its side of a game is highlighted.
  clubNames: ['Септември 97', 'Септември-97', 'БК Септември 97', 'Septemvri 97', 'Septemvri-97', 'BC Septemvri 97'],

  // Only links to these exact hosts become "Дари онлайн" buttons.
  payHosts: ['buy.stripe.com', 'checkout.stripe.com', 'www.paypal.com', 'paypal.com', 'paypal.me', 'www.paypal.me', 'ko-fi.com', 'donorbox.org'],

  // Links next to Sheet games may point to these sites (and their subdomains).
  gameLinkDomains: ['youtube.com', 'youtu.be', 'waba-league.com', 'basketball.bg', 'facebook.com'],
};
