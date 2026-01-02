const fs = require('fs');
const path = require('path');

function checkChanges() {
  const dataDir = path.join(__dirname, '../data');
  const currentFile = path.join(dataDir, 'latest-snapshot.json');
  
  if (!fs.existsSync(currentFile)) {
    console.log('⚠️ 第一次运行');
    return { isFirstRun: true };
  }

  const current = JSON.parse(fs.readFileSync(currentFile, 'utf-8'));
  
  const result = {
    isFirstRun: false,
    timestamp: new Date().toISOString(),
    previousTimestamp: current.timestamp,
    status: '✅ 成功'
  };

  console.log('📄 检查完成');
  console.log(JSON.stringify(result, null, 2));
  
  return result;
}

try {
  checkChanges();
} catch (error) {
  console.error('❌ 错誤:', error.message);
  process.exit(1);
}
