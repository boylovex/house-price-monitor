const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 框架 URL
const BASE_URL = 'https://buy.houseprice.tw/list/%E6%A1%83%E5%9C%92%E5%B8%82_city/%E4%B8%AD%E5%A3%A2%E5%8D%80-%E5%A4%A7%E5%9C%92%E5%8D%80-%E6%A1%83%E5%9C%92%E5%8D%80_zip/%E4%BD%8F%E5%AE%85_use/%E9%9B%BB%E6%A2%AF%E5%A4%A7%E6%A8%93_type/2-_room/5-_floor/-1200_price/20-_age/nearmrt_filter/?p=';

// 二又 get 应商
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * 从单个页面扥取戺院信息
 */
async function fetchPage(pageNum) {
  try {
    const url = BASE_URL + pageNum;
    console.log(`提取第 ${pageNum} 页...`);
    
    const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(response.data);
    
    const listings = [];
    
    // 提取戺院信息 - 链接元素
    const propertyLinks = $('a[data-qa="listing-link"]');
    
    // 假如 cheerio 上述选择器不成功，则使用根据页面结构的选择器。
    // 估樈会有 div 容器包含戺院详情。
    const items = $('div[class*="listing"]').length > 0 
      ? $('div[class*="listing"]')
      : $('a.listing-item');
    
    items.each((i, el) => {
      try {
        const $item = $(el);
        const link = $item.attr('href') || $item.find('a').attr('href') || '';
        const titleEl = $item.find('h3, .title, .property-title').first();
        const priceEl = $item.find('.price, [class*="price"]').first();
        const areaEl = $item.find('.area, [class*="area"]').first();
        
        const title = titleEl.text().trim();
        const price = priceEl.text().trim();
        const area = areaEl.text().trim();
        
        if (title && price) {
          listings.push({
            id: `listing_${Math.abs(link.hashCode())}`,
            title,
            price,
            area,
            link: link.startsWith('http') ? link : 'https://buy.houseprice.tw' + link,
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        // 跳过错误的项目
      }
    });
    
    return listings;
  } catch (error) {
    console.error(`页面 ${pageNum} 提取失败: ${error.message}`);
    return [];
  }
}

/**
 * 提取所有页面的数据
 */
async function fetchAllListings(maxPages = 13) {
  console.log(`开始提取所有页面（最多 ${maxPages} 页）...`);
  
  const allListings = [];
  
  for (let page = 1; page <= maxPages; page++) {
    const pageListings = await fetchPage(page);
    
    if (pageListings.length === 0) {
      console.log(`第 ${page} 页没有数据，结束提取`);
      break;
    }
    
    allListings.push(...pageListings);
    console.log(`第 ${page} 页: 提取 ${pageListings.length} 个云物件`);
    
    // 为了不超载源、每个页面之间等候 1 秒
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return allListings;
}

/**
 * 对比新旧数据并找出新增/丢失的云物件
 */
function compareListings(currentListings, previousListings) {
  const currentIds = new Set(currentListings.map(l => l.id));
  const previousIds = new Set(previousListings.map(l => l.id));
  
  const newListings = currentListings.filter(l => !previousIds.has(l.id));
  const deletedListings = previousListings.filter(l => !currentIds.has(l.id));
  const priceChanges = [];
  
  // 检查价格改变
  currentListings.forEach(current => {
    const previous = previousListings.find(p => p.id === current.id);
    if (previous && current.price !== previous.price) {
      priceChanges.push({
        id: current.id,
        title: current.title,
        oldPrice: previous.price,
        newPrice: current.price
      });
    }
  });
  
  return {
    newCount: newListings.length,
    deletedCount: deletedListings.length,
    priceChangeCount: priceChanges.length,
    newListings,
    deletedListings,
    priceChanges
  };
}

/**
 * 主函数
 */
async function main() {
  try {
    const dataDir = path.join(__dirname, '../data');
    const currentFile = path.join(dataDir, 'current-listings.json');
    const previousFile = path.join(dataDir, 'previous-listings.json');
    const changesFile = path.join(dataDir, 'changes.json');
    
    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 提取所有页面的数据
    const currentListings = await fetchAllListings();
    console.log(`\n总计提取: ${currentListings.length} 个物件`);
    
    // 保存当前數据
    const snapshot = {
      timestamp: new Date().toISOString(),
      totalCount: currentListings.length,
      listings: currentListings
    };
    
    fs.writeFileSync(currentFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`\n当前轩括已保存：${currentFile}`);
    
    // 比较旧数据（如果有）
    if (fs.existsSync(previousFile)) {
      const previousSnapshot = JSON.parse(fs.readFileSync(previousFile, 'utf-8'));
      const previousListings = previousSnapshot.listings || [];
      
      const changes = compareListings(currentListings, previousListings);
      
      fs.writeFileSync(changesFile, JSON.stringify(changes, null, 2), 'utf-8');
      
      console.log('\n=== 变化汇报 ===');
      console.log(`新增物件: ${changes.newCount}`);
      console.log(`丢失物件: ${changes.deletedCount}`);
      console.log(`价格改变: ${changes.priceChangeCount}`);
      
      if (changes.newListings.length > 0) {
        console.log('\n新增物件:');
        changes.newListings.slice(0, 5).forEach(l => {
          console.log(`  - ${l.title} | ${l.price}`);
        });
      }
    } else {
      console.log('\n第一次运行，无旧数据比较');
    }
    
    // 保存当前数捪作为下一次的旧数捪
    fs.copyFileSync(currentFile, previousFile);
    console.log('\n当前数捪已保存为下一次转比基准');
  } catch (error) {
    console.error('錯误:', error);
    process.exit(1);
  }
}

main();
