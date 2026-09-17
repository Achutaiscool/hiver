
import { createReadStream, createWriteStream, mkdirSync} from "fs"
import { dirname } from "path"
import { fileURLToPath } from "url"
import csv from "csv-parser"
import dotenv from "dotenv"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BRAND = process.env.BRAND_NAME || 'AmazonHelp'
const MAX_SAMPLES = 1000
const INPUT_CSV = 'twcs.csv'
const OUTPUT_DIR = 'data'
const OUTPUT_FILE = `${OUTPUT_DIR}/raw_sample.json`

try{
  mkdirSync(OUTPUT_DIR,{ recursive: true})
}
catch(err){
  console.log(err)
}

let count = 0 
const writeStream = createWriteStream(OUTPUT_FILE)

createReadStream(INPUT_CSV).pipe(csv()).on('data', (row)=>{
 /* const isBrandReply = row.author_id === BRAND */
  const isCustomerTweet = row.inbound === 'True' && /*!isBrandReply &&*/ row.text && row.text.includes(`@AmazonHelp`)

  if ((/*isBrandReply ||*/ isCustomerTweet) && count < MAX_SAMPLES){
    const enrichedRow ={
      ...row,
      inbound: row.inbound === 'True',
     /* speaker: isBrandReply? 'brand' : 'customer'*/
      thread_id: row.in_response_to_tweet_id || row.response_to_tweet_id || row.tweet_id
    }

    writeStream.write(JSON.stringify(enrichedRow)+'\n')
    count++
  }
})
.on('end',()=>{
    console.log(`Extracted ${count} tweets to ${OUTPUT_FILE}`)
    writeStream.end()
  })
.on('error', (err)=>{
    console.log(`Error`,err.message)
    process.exit(1)
  })
