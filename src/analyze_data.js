import { readFileSync } from 'fs'

const raw = readFileSync('data/raw_sample.json', 'utf-8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line))

const customers = raw.filter( r => r.speaker === 'customer' )
const brands = raw.filter (r => r.speaker === 'brand' )

console.log(`Total tweets: ${raw.length}`)
console.log(`Customer tweets: ${customers.length}`)
console.log(`Brand replies: ${brands.length}`)
console.log(`\n First 5 customer tweets:`)

customers.slice (0,5).forEach((c,i) => {
  console.log(`${i+1}. ${c.text.substring(0,80)}...`)
})
