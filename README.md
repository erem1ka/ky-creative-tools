# 快影创作工具集

快手内部图像/视频处理工具集合。

## 技术栈

- Vite + React + TypeScript
- TailwindCSS
- React Router v6
- 快手内部 Appwrite（可选）

## 开发

```bash
# 配置 npm 源
npm config set registry https://npm.corp.kuaishou.com/

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

部署到快手 frontend-cloud 静态站点：

- **线上地址**：https://image-tools.frontend-cloud.corp.kuaishou.com
- **项目 ID**：542

```bash
# 构建
npm run build

# 部署
npx -y @codeflicker/frontend-cloud-cli@latest deploy
```

## 工具列表

| 工具 | 说明 |
|------|------|
| AI 生图 | GPT-Image-2 文生图（仅 dev 模式可用） |
| 比例修改 | AI 智能修改图片比例，扩展背景区域 |
| 视频创作 | 文生视频、图生视频、AI 脚本 |
| 视频转动图 | 视频 → WebP/GIF 动图 |
| 视频下载 | 批量解析下载短视频 |
| 图片压缩 | 调整质量压缩图片 |
| 格式转换 | 图片批量格式互转 |
| 自由裁剪 | 拖拽选区裁剪，支持锁定比例 |
| 添加水印 | 自定义文字水印 |
| 去水印 | 标记水印区域，智能修复去除 |
| 尺寸调整 | 精确调整宽高 |
| 颜色提取 | 提取图片主色调，生成调色板 |
| 占位图生成 | Lorem Picsum 随机风景照 |
| 头像生成 | DiceBear 多种风格头像 |

## 作者

张峻烨