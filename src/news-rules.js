// Sentinelle BRVM : notation automatique des actualités, sans IA.
// 1) repère les sociétés cotées citées dans le titre ; 2) classe l'actualité ; 3) note son impact de -2 à +2.
// Ajoute des noms ou des mots-clés ici si une actualité est mal reconnue.

const ALIASES = {
  ABJC: ['Servair'], BBGC: ['Bridge Bank'], BICB: ['BIIC'], BICC: ['BICICI', 'BICI CI', 'BICI Côte', 'BICI Cote'],
  BNBC: ['Bernabé', 'Bernabe'], BOAB: ['BOA Bénin', 'BOA Benin', 'Bank of Africa Bénin', 'Bank of Africa Benin'],
  BOABF: ['BOA Burkina', 'Bank of Africa Burkina'], BOAC: ["BOA Côte d'Ivoire", 'BOA CI', "Bank of Africa Côte d'Ivoire", 'BOA-CI'],
  BOAM: ['BOA Mali', 'Bank of Africa Mali'], BOAN: ['BOA Niger', 'Bank of Africa Niger'], BOAS: ['BOA Sénégal', 'BOA Senegal', 'Bank of Africa Sénégal'],
  CABC: ['Sicable'], CBIBF: ['Coris Bank'], CFAC: ['CFAO'], CIEC: ['CIE CI', "Compagnie Ivoirienne d'Electricité", 'CIE'],
  ECOC: ['Ecobank CI', "Ecobank Côte d'Ivoire", 'Ecobank Cote'], ETIT: ['Ecobank Transnational', 'ETI'], FTSC: ['Filtisac'],
  LNBB: ['Loterie Nationale du Bénin', 'LNB'], NEIC: ['NEI-CEDA', 'NEI CEDA'], NSBC: ['NSIA Banque'], NTLC: ['Nestlé CI', "Nestlé Côte", 'Nestle CI'],
  ONTBF: ['Onatel'], ORAC: ['Orange CI', "Orange Côte d'Ivoire", 'Orange Cote'], ORGT: ['Oragroup'], PALC: ['Palm CI', 'PALMCI', 'Palmci'],
  PRSC: ['Tractafric'], SAFC: ['SAFCA'], SCRC: ['Sucrivoire'], SDCC: ['SODECI', 'Sodeci'], SDSC: ['Africa Global Logistics', 'AGL CI', 'AGL'],
  SEMC: ['SIEM', 'Eviosys', 'Crown Siem'], SGBC: ['SGBCI', 'Société Générale CI', "Société Générale Côte d'Ivoire", 'Societe Generale CI'],
  SHEC: ['Vivo Energy'], SIBC: ['SIB', 'Société Ivoirienne de Banque'], SICC: ['SICOR', 'Sicor'], SIVC: ['Erium', 'Air Liquide CI'],
  SLBC: ['Solibra'], SMBC: ['SMB CI', 'Société Multinationale de Bitumes', 'SMB'], SNTS: ['Sonatel'], SOGC: ['SOGB'], SPHC: ['SAPH'],
  STAC: ['SETAO'], STBC: ['SITAB'], SVOC: ['Movis'], TTLC: ['TotalEnergies Marketing CI', "TotalEnergies Marketing Côte d'Ivoire", 'Total CI'],
  TTLS: ['TotalEnergies Marketing Sénégal', 'TotalEnergies Marketing Senegal', 'Total Sénégal'], UNLC: ['Unilever CI', "Unilever Côte"], UNXC: ['Uniwax']
};
// Secteurs touchés par des thèmes macro (impact indirect, noté prudemment)
const THEMES = [
  {re: /p[ée]trole|baril|carburant|prix à la pompe/i, tickers: ['TTLC', 'TTLS', 'SHEC', 'SMBC'], cat: 'Matières premières'},
  {re: /caoutchouc|h[ée]v[ée]a/i, tickers: ['SPHC', 'SOGC'], cat: 'Matières premières'},
  {re: /huile de palme|palmier/i, tickers: ['PALC', 'SOGC'], cat: 'Matières premières'},
  {re: /sucre/i, tickers: ['SCRC'], cat: 'Matières premières'},
  {re: /t[ée]l[ée]com|ARTCI|ARTP|mobile money/i, tickers: ['SNTS', 'ORAC', 'ONTBF'], cat: 'Secteur'}
];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = Object.entries(ALIASES).map(([t, names]) => ({t, re: new RegExp('(^|[^\\p{L}])(' + names.map(esc).join('|') + ')(?=$|[^\\p{L}])', 'u')}));

const POS = /hausse|progress|bondi|grimpe|envol|record|am[ée]lior|croissance|augment|rebond|b[ée]n[ée]fice en hausse|dépasse|solide|contrat|acquisition|relèvement|surperform/i;
const NEG = /baisse|recul|chute|perte|d[ée]ficit|repli|d[ée]grad|plonge|effondr|sanction|suspen|litige|contentieux|d[ée]prime|n[ée]gati|amende|abaiss|alerte|retard|peu dynamique|fl[ée]chi/i;

export function scoreNews(title) {
  const tickers = [];
  for (const {t, re} of MATCHERS) if (re.test(title)) tickers.push(t);
  let cat = 'Marché';
  if (/dividende|coupon|d[ée]tachement/i.test(title)) cat = 'Dividende';
  else if (/b[ée]n[ée]fice|r[ée]sultat|chiffre d'affaires|PNB|produit net|revenus|marge|EBITDA|trimestre|semestre|exercice/i.test(title)) cat = 'Résultats';
  else if (/augmentation de capital|introduction en bourse|IPO|OPV|fusion|acquisition|cession|emprunt obligataire/i.test(title)) cat = 'Opération financière';
  else if (/gouvernance|conseil d'administration|directeur g[ée]n[ée]ral|nomination|assembl[ée]e g[ée]n[ée]rale/i.test(title) || /\b(AGO|AGE)\b/.test(title)) cat = 'Gouvernance';
  else if (/BCEAO|inflation|PIB|croissance [ée]conomique|budget|FMI|dette|taux directeur|production industrielle/i.test(title)) cat = 'Macro';
  let themeHit = null;
  if (!tickers.length) for (const th of THEMES) if (th.re.test(title)) { themeHit = th; break; }

  const pos = POS.test(title), neg = NEG.test(title);
  let dir = pos && !neg ? 1 : neg && !pos ? -1 : 0;
  // Dividende en hausse ou annoncé : plutôt positif ; dividende en baisse ou supprimé : négatif
  if (cat === 'Dividende' && dir === 0) dir = /suppr|pas de dividende|sans dividende/i.test(title) ? -1 : 1;
  // Ampleur : un pourcentage cité de 20 % ou plus double l'impact
  const pm = title.match(/(\d+(?:[.,]\d+)?)\s?%/);
  const big = pm && parseFloat(pm[1].replace(',', '.')) >= 20;
  let impact = 0;
  if (tickers.length && (cat === 'Résultats' || cat === 'Dividende' || cat === 'Opération financière')) impact = dir * (big ? 2 : 1);
  else if (tickers.length) impact = dir;                         // autre actualité de société : impact modéré
  else if (themeHit) { impact = 0; }                             // thème macro : signalé, pas noté
  if (themeHit) cat = themeHit.cat;
  const summary = tickers.length
    ? (impact > 0 ? 'Nouvelle favorable pour la société citée' : impact < 0 ? 'Nouvelle défavorable pour la société citée' : 'Information sans effet clair sur le cours')
      + (cat !== 'Marché' ? ` (${cat.toLowerCase()})` : '') + (big ? ', avec une variation chiffrée importante.' : '.')
    : themeHit ? `Thème qui peut toucher indirectement ${themeHit.tickers.join(', ')} : à surveiller, non noté.` : 'Pas de société cotée concernée directement.';
  return {tickers, impact: Math.max(-2, Math.min(2, impact)), cat, summary, themes: themeHit ? themeHit.tickers : []};
}
