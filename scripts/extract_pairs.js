import fs from 'node:fs';
import csv from 'csv-parser';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, '..', 'src', 'twcs.csv');       // adjust if your CSV lives elsewhere
const OUT = join(__dirname, '..', 'data', 'pairs.json');
const BRAND = 'AmazonHelp';
const TARGET = 1000;

const brandRows = new Map();          // brand tweet_id -> row
const customersToFetch = new Set();   // customer tweet_ids to look up

console.log(`Pass 1: scanning for @${BRAND} replies...`);
let rowCount = 0;

fs.createReadStream(CSV)
  .pipe(csv())
  .on('data', (row) => {
    rowCount++;
    if (row.author_id === BRAND && row.inbound === 'False') {
      brandRows.set(row.tweet_id, row);
      if (row.in_response_to_tweet_id) {
        customersToFetch.add(row.in_response_to_tweet_id);
      }
    }
  })
  .on('end', () => {
    console.log(`Scanned ${rowCount} rows. Found ${brandRows.size} ${BRAND} replies.`);
    console.log(`Pass 2: fetching ${customersToFetch.size} customer tweets...`);

    const customerRows = new Map();
    fs.createReadStream(CSV)
      .pipe(csv())
      .on('data', (row) => {
        if (customersToFetch.has(row.tweet_id)) {
          customerRows.set(row.tweet_id, row);
        }
      })
      .on('end', () => {
        const pairs = [];
        for (const [, brand] of brandRows) {
          const customer = customerRows.get(brand.in_response_to_tweet_id);
          if (!customer) continue;
          if (!/@amazonhelp/i.test(customer.text)) continue;
          pairs.push({
            tweet_id: customer.tweet_id,
            customer_text: customer.text,
            brand_reply: brand.text,
            thread_id: customer.tweet_id,
          });
          if (pairs.length >= TARGET) break;
        }
        fs.writeFileSync(OUT, JSON.stringify(pairs, null, 2));
        console.log(`Wrote ${pairs.length} pairs to ${OUT}`);
        if (pairs[0]) {
          console.log('\nSample pair:');
          console.log('  customer:', pairs[0].customer_text.slice(0, 120));
          console.log('  brand   :', pairs[0].brand_reply.slice(0, 120));
        }
      });
  });