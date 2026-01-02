const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

// 定義 URL
const BASE_URL = 'https://buy.houseprice.tw/list/%E6%A1%83%E5%9C%92%E5%B8%82_city/%E4%B8%AD%E5%A3%A2%E5%8D%80-%E5%A4%A7%E5%9C%92%E5%8D%80-%E6%A1%83%E5%9C%92%E5%8D%80_zip/%E4%BD%8F%E5%AE%85_use/%E9%9B%BB%E6%A2%AF%E5%A4%A7%E6%A8%93_type/2-_room/5-_floor/-1200_price/20-_age/nearmrt_filter/publish-desc_sort/';

/**
 * 從單個頁面提取房屋信息
 */
async function scrapeListing(page, pageNum) {
  try {
    const url = BASE_URL + '?p=' + pageNum;
    console.log(`抓取第 ${pageNum} 頁...`);
    
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // 等待房屋列表加載
    await page.waitForSelector('a[href*="/listings/"]', { timeout: 10000 });
    
    const listings = await page.evaluate(() => {
      const items = [];
      const elements = document.querySelectorAll('a[href*="/listings/"]');
      
      elements.forEach((el) => {
        try {
          const link = el.getAttribute('href');
          if (!link || !link.includes('/listings/')) return;
          
          // 提取房屋信息
          const titleEl = el.textContent || '';
          const priceEl = el.parentElement?.querySelector('.price')?.textContent || 'N/A';
          const areaEl = el.parentElement?.querySelector('.area')?.textContent || 'N/A';
          const roomEl = el.parentElement?.querySelector('.room')?.textContent || 'N/A';
          
          items.push({
            id: link.split('/listings/')[1]?.split('/')[0] || Date.now() + Math.random(),
            url: 'https://buy.houseprice.tw' + link,
            title: titleEl.trim(),
            price: priceEl.trim(),
            area: areaEl.trim(),
            room: roomEl.trim(),
            scrapedAt: new Date().toISOString()
          });
        } catch (e) {
          console.error('解析房屋失敗:', e.message);
        }
      });
      
      return items;
    });
    
    return listings;
  } catch (error) {
    console.error(`抓取第 ${pageNum} 頁失敗:`, error.message);
    return [];
  }
}

/**
 * 抓取所有分頁的房屋信息
 */
async function fetchAllListings() {
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const allListings = [];
    let pageNum = 1;
    let hasNextPage = true;
    
    while (hasNextPage && pageNum <= 50) { // 限制最多50頁
      const listings = await scrapeListing(page, pageNum);
      
      if (listings.length === 0) {
        hasNextPage = false;
      } else {
        allListings.push(...listings);
        pageNum++;
        
        // 延遲以避免過度頻繁的請求
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    await browser.close();
    return allListings;
  } catch (error) {
    console.error('抓取列表失敗:', error);
    if (browser) await browser.close();
    throw error;
  }
}

// 主程序
if (require.main === module) {
  fetchAllListings().then((listings) => {
    console.log(`\n共抓取 ${listings.length} 個房屋`);
    
    // 將數據保存到 data/current-listings.json
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const outputPath = path.join(dataDir, 'current-listings.json');
    fs.writeFileSync(outputPath, JSON.stringify(listings, null, 2));
    console.log(`數據已保存到 ${outputPath}`);
  }).catch((error) => {
    console.error('程序出錯:', error);
    process.exit(1);
  });
}

module.exports = { fetchAllListings };
