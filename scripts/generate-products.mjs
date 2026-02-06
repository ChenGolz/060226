#!/usr/bin/env node
/**
 * Generate products JSON from a TSV file.
 * Required columns (header):
 *  product name | brand name | brand site | Amazon.com link | Amazon.co.uk link | price_min_usd | price_max_usd
 * Optional:
 *  category | notes | cruelty_free (true/false)
 *
 * Usage:
 *  node scripts/generate-products.mjs data/products.tsv > data/products.json
 */
import fs from 'node:fs';

function parseBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['true','1','yes','y'].includes(s);
}

function parseTSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split('\t').map(s => s.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);

  const iPname = idx('product name');
  const iBname = idx('brand name');
  const iSite  = idx('brand site');
  const iUS    = idx('amazon.com link');
  const iUK    = idx('amazon.co.uk link');
  const iMin   = idx('price_min_usd');
  const iMax   = idx('price_max_usd');
  const iCat   = idx('category');
  const iNotes = idx('notes');
  const iCF    = idx('cruelty_free');

  if (iPname < 0 || iBname < 0 || iMin < 0) throw new Error('Missing required columns.');

  return lines.map(line => {
    const cols = line.split('\t');
    const name = (cols[iPname] || '').trim();
    const brand = (cols[iBname] || '').trim();
    const website = iSite >= 0 ? (cols[iSite] || '').trim() : '';
    const amazonCom = iUS >= 0 ? (cols[iUS] || '').trim() : '';
    const amazonUk = iUK >= 0 ? (cols[iUK] || '').trim() : '';
    const priceMin = Number((cols[iMin] || '').trim());
    const priceMax = iMax >= 0 ? Number((cols[iMax] || '').trim()) : null;

    return {
      name,
      brand,
      website,
      amazonCom,
      amazonUk,
      priceMin: Number.isFinite(priceMin) ? priceMin : null,
      priceMax: Number.isFinite(priceMax) ? priceMax : null,
      category: iCat >= 0 ? (cols[iCat] || '').trim() : '',
      notes: iNotes >= 0 ? (cols[iNotes] || '').trim() : '',
      crueltyFree: iCF >= 0 ? parseBool(cols[iCF]) : true,
      brandWebsiteLabel: 'Website'
    };
  }).filter(x => x.name && x.brand);
}

const path = process.argv[2];
if (!path) {
  console.error('Provide a TSV path. Example: node scripts/generate-products.mjs data/products.tsv');
  process.exit(1);
}
const tsv = fs.readFileSync(path, 'utf8');
let products = parseTSV(tsv)
  .sort((a,b) => (Number(a.priceMin ?? Infinity) - Number(b.priceMin ?? Infinity)) || a.name.localeCompare(b.name));

const output = {
  sortDefault: 'priceMinAsc',
  products
};
process.stdout.write(JSON.stringify(output, null, 2));
