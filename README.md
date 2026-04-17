# 图像工具集

快手内部图像处理工具集合。

## 技术栈

- Vite + React + TypeScript
- TailwindCSS
- React Router
- 快手内部 Appwrite（可选）

## 开发

```bash
# 配置 npm 源
npm config set registry https://npm.corp.kuaishou.com/

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build
```

## 部署

```bash
# 构建
npm run build

# 部署到快手 frontend-cloud
npx -y @codeflicker/frontend-cloud-cli@latest deploy
```

## 工具列表

| 工具 | 说明 |
|------|------|
| 比例扩展 | AI 智能扩展图片背景 |
| 图片压缩 | 调整质量压缩图片 |
| 格式转换 | 图片/视频批量格式互转 |
| 自由裁剪 | 拖拽选区自由裁剪 |
| 添加水印 | 自定义文字水印 |
| 尺寸调整 | 精确调整宽高 |
| 颜色提取 | 提取图片主色调 |
| 占位图生成 | Lorem Picsum 随机风景 |
| 头像生成 | DiceBear 多种风格 |

## 作者

张峻烨
