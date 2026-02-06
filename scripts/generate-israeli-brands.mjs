#!/usr/bin/env node
/**
 * Generate Israeli brands JSON from a TSV file.
 * Required columns (header):
 *  brand name | brand site | Amazon.com link | Amazon.co.uk link
 * Optional:
 *  rep_price_usd | price_tier
 *
 * Usage:
 *  node scripts/generate-israeli-brands.mjs data/israeli-brands.tsv > data/israeli-brands.json
 */
import fs from 'node:fs';

function priceTierFromUsd(usd) {
  const p = Number(usd);
  if (!Number.isFinite(p) || p <= 0) return 3;
  if (p <= 12) return 1;
  if (p <= 25) return 2;
  if (p <= 45) return 3;
  if (p <= 80) return 4;
  return 5;
}

function parseTSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split('\t').map(s => s.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);

  const iName = idx('brand name');
  const iSite = idx('brand site');
  const iUS = idx('amazon.com link');
  const iUK = idx('amazon.co.uk link');
  const iPrice = idx('rep_price_usd');
  const iTier = idx('price_tier');

  if (iName < 0 || iSite < 0) throw new Error('Missing required columns: brand name, brand site');

  return lines.map(line => {
    const cols = line.split('\t');
    const name = (cols[iName] || '').trim();
    const website = (cols[iSite] || '').trim();
    const amazonCom = iUS >= 0 ? (cols[iUS] || '').trim() : '';
    const amazonUk = iUK >= 0 ? (cols[iUK] || '').trim() : '';

    const explicitTier = iTier >= 0 ? Number((cols[iTier] || '').trim()) : NaN;
    const repPriceUsd = iPrice >= 0 ? Number((cols[iPrice] || '').trim()) : NaN;
    const priceTier = Number.isFinite(explicitTier) ? Math.max(1, Math.min(5, explicitTier))
                      : priceTierFromUsd(repPriceUsd);

    return {
      name,
      website,
      amazonCom,
      amazonUk,
      repPriceUsd: Number.isFinite(repPriceUsd) ? repPriceUsd : null,
      priceTier,
      websiteLabel: 'Website'
    };
  }).filter(x => x.name);
}

const path = process.argv[2];
if (!path) {
  console.error('Provide a TSV path. Example: node scripts/generate-israeli-brands.mjs data/intl.tsv');
  process.exit(1);
}
const tsv = fs.readFileSync(path, 'utf8');
const brands = parseTSV(tsv)
  .sort((a,b) => (a.priceTier - b.priceTier) || a.name.localeCompare(b.name));

const output = {
  pageNote: 'All brands on this list are also top rated in Amazon.',
  sortDefault: 'priceTierAsc',
  brands
};
process.stdout.write(JSON.stringify(output, null, 2));
