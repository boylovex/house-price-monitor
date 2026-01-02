const axios = require('axios');
const fs = require('fs');
const path = require('path');

const URL = 'https://buy.houseprice.tw/list/%E6%A1%83%E5%9C%92%E5%B8%82_city/%E4%B8%AD%E5%A3%A2%E5%8D%80-%E5%A4%A7%E5%9C%92%E5%8D%80-%E6%A1%83%E5%9C%92%E5%8D%80_zip/%E4%BD%8F%E5%AE%85_use/%E9%9B%BB%E6%A2%AF%E5%A4%A7%E6%A8%93_type/2-_room/5-_floor/-1200_price/20-_age/nearmrt_filter/?p=1';

async function fetchListings() {
  try {
    const response = await axios.get(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const snapshot = {
      timestamp: new Date().toISOString(),
      url: URL,
      status: 'success',
      htmlLength: response.data.length
    };

    return snapshot;
  } catch (error) {
    console.error('爆裒错誤:', error.message);
    throw error;
  }
}

async function main() {
  const snapshot = await fetchListings();
  const outputDir = path.join(__dirname, '../data');
  const outputFile = path.join(outputDir, 'latest-snapshot.json');
  
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  
  console.log('✅ 快照已保存');
  console.log('URL: ' + URL);
}

main().catch(error => {
  console.error('错誤:', error);
  process.exit(1);
});
