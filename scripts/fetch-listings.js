const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 基础 URL
const BASE_URL = 'https://buy.houseprice.tw/list/%E6%A1%83%E5%9C%92%E5%B8%82_city/%E4%B8%AD%E5%A3%A2%E5%8D%80-%E5%A4%A7%E5%9C%92%E5%8D%80-%E6%A1%83%E5%9C%92%E5%8D%80_zip/%E4%BD%8F%E5%AE%85_use/%E9%9B%BB%E6%A2%AF%E5%A4%A7%E6%A8%93_type/2-_room/5-_floor/-1200_price/20-_age/nearmrt_filter/publish-desc_sort/?p=';

// 伪装 User Agent
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * 从单个页面提取房屋信息
 */
async function fetchPage(pageNum) {
  try {
    const url = BASE_URL + pageNum;
    console.log(`提取第 ${pageNum} 页...`);
    
    const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(response.data);
    
    const listings = [];
    
    // 提取房屋信息 - 获取所有房屋卡片容器
    // 网站使用 Vue 渲染，寻找包含房屋信息的 div 容器
    $('a[href*="/house/"]').each((i, el) => {
      try {
        const $item = $(el);
        const href = $item.attr('href');
        
        // 跳过非房屋链接
        if (!href || !href.includes('/house/')) return;
        
        // 获取标题和价格信息
        const titleEl = $item.find('h2, h3, .title');
        const title = titleEl.text().trim();
        
        // 获取价格 (通常在右侧)
        const priceText = $item.text();
        const priceMatch = priceText.match(/(\d+,?\d*)\s*萬/);
        const price = priceMatch ? priceMatch[1] : 'N/A';
        
        // 获取面积和位置
        const detailMatch = priceText.match(/([\d.]+)坪/);
        const area = detailMatch ? detailMatch[1] : 'N/A';
        
        if (title && href) {
          // 使用链接的哈希值作为唯一ID
          const id = 'listing_' + Math.abs(href.split('/')[3] || Math.random()).toString(36);
          
          listings.push({
            id,
            title: title.substring(0, 100),
            price,
            area,
            link: href.startsWith('http') ? href : 'https://buy.houseprice.tw' + href,
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
    console.log(`第 ${page} 页: 提取 ${pageListings.length} 个房屋对象`);
    
    // 为了不超载源、每个页面之间等待 1 秒
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return allListings;
}

/**
 * 对比新旧数据并找出新增/丢失的房屋对象
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
      console.log(`创建数据目录: ${dataDir}`);
    }
    
    // 提取所有页面的数据
    const currentListings = await fetchAllListings();
    console.log(`\n总计提取: ${currentListings.length} 个房屋对象`);
    
    // 保存当前数据
    const snapshot = {
      timestamp: new Date().toISOString(),
      totalCount: currentListings.length,
      listings: currentListings
    };
    
    fs.writeFileSync(currentFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`\n当前快照已保存: ${currentFile}`);
    
    // 比较旧数据（如果有）
    if (fs.existsSync(previousFile)) {
      const previousSnapshot = JSON.parse(fs.readFileSync(previousFile, 'utf-8'));
      const previousListings = previousSnapshot.listings || [];
      
      const changes = compareListings(currentListings, previousListings);
      
      fs.writeFileSync(changesFile, JSON.stringify(changes, null, 2), 'utf-8');
      
      console.log('\n=== 变化汇报 ===');
      console.log(`新增房屋: ${changes.newCount}`);
      console.log(`丢失房屋: ${changes.deletedCount}`);
      console.log(`价格改变: ${changes.priceChangeCount}`);
      
      if (changes.newListings.length > 0) {
        console.log('\n新增房屋:');
        changes.newListings.slice(0, 5).forEach(l => {
          console.log(` - ${l.title} | ${l.price}`);
        });
      }
    } else {
      console.log('\n第一次运行，无旧数据比较');
    }
    
    // 保存当前数据作为下一次的旧数据
    fs.copyFileSync(currentFile, previousFile);
    console.log('\n当前数据已保存为下一次比较基准');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

main();
