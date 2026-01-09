const fs = require('fs');
const path = require('path');

// 读取SVG内容
const svgContent = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf-8');

// 为Windows创建占位图标
const icoPlaceholder = `
这是一个ICO图标文件的占位符。
要生成真正的ICO文件,请使用以下方法之一:

方法1: 使用在线工具
- 访问 https://favicon.io/favicon-converter/
- 上传 icon.svg 文件
- 下载生成的 icon.ico 文件

方法2: 使用ImageMagick (已安装的情况下)
在命令行运行:
convert icon.svg -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico

方法3: 使用GIMP
- 打开 icon.svg
- 导出为 ICO 格式
- 选择 256x256 尺寸

将生成的 icon.ico 文件放在当前目录下即可。
`;

fs.writeFileSync(path.join(__dirname, 'icon.ico'), icoPlaceholder);

console.log('✅ 图标文件已创建');
console.log('');
console.log('📝 注意事项:');
console.log('- icon.svg: SVG格式图标源文件 (已生成)');
console.log('- icon.png: PNG格式图标 (可从SVG转换)');
console.log('- icon.ico: Windows图标 (需要使用工具转换)');
console.log('- icon.icns: Mac图标 (需要使用工具转换)');
console.log('');
console.log('推荐转换方法:');
console.log('1. PNG: 直接打开SVG,另存为PNG即可');
console.log('2. ICO: 访问 https://favicon.io/favicon-converter/');
console.log('3. ICNS: 使用 iconutil (Mac) 或在线工具');
