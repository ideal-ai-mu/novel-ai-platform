# 小说 AI 工作台（Novel AI Studio）

AI 辅助长篇小说创作的 Windows 桌面应用。章节管理、人物/设定百科、伏笔库、时间线、人物关系图与 AI 辅助写作，**所有数据保存在本机**。

## 下载与安装

- **下载**：前往 [Releases 页面](https://github.com/ideal-ai-mu/novel-ai-platform/releases) 下载最新的 `Novel-AI-Studio-Setup-*.exe`。
- **安装步骤、首次配置、常见问题**：见 **[安装说明](docs/安装说明.md)**。

## 使用说明

各功能的操作方式见 **[使用说明](docs/使用说明.md)**。

## 配置 AI（API）

AI 功能使用**你自己的** AI 接口，应用本身不含 AI 额度，配置一次即可长期使用。

**第 1 步：准备一个 API**

用官方 OpenAI，或任意「OpenAI 兼容」（支持 `/chat/completions` 接口）的服务。到对应平台的控制台创建并复制一个 **API Key**，记下它的 **Base URL** 和可用 **模型名**。

常见服务（具体地址与模型名以各家官方文档为准）：

| 服务 | Base URL（示例） | 连接方式 |
|------|------------------|----------|
| OpenAI 官方 | `https://api.openai.com/v1` | 添加 OpenAI |
| DeepSeek | `https://api.deepseek.com` | OpenAI 兼容 |
| 通义千问（阿里百炼） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | OpenAI 兼容 |
| Kimi（月之暗面） | `https://api.moonshot.cn/v1` | OpenAI 兼容 |
| 中转 / 第三方聚合 API | 由中转服务商提供（通常以 `/v1` 结尾） | OpenAI 兼容 |

> **中转 API（第三方聚合 / 代理）**：把 OpenAI、Claude、国产模型等用统一的「OpenAI 兼容」接口转发，方便国内访问。用法与其它兼容连接相同——选「添加 OpenAI 兼容连接」，Base URL 和 API Key 用中转方提供的，模型名按其支持的填（如 `gpt-4o`、`claude-3-5-sonnet`、`deepseek-chat`）。请选择稳定可信的中转，注意内容会经其转发。

1. 打开任意一本书 → 进入写作界面 → **「设置」标签 → 「AI 连接」**。
2. 点 **「添加 OpenAI」**（官方）或 **「添加 OpenAI 兼容连接」**（其它服务）。
3. 填写：
   - **连接名称**：随便取个好记的名字（如「DeepSeek」）；
   - **Base URL**：上表对应的地址；
   - **API Key**：你复制的密钥（**只保存在本机**，不会上传）；
   - **支持的模型**：点击拉取模型列表并选一个默认模型（如 `gpt-4o-mini`、`deepseek-chat` 等）。
4. 保存后，写作界面的续写、改写、润色、灵感、纠错等 AI 功能即可使用。

**第 3 步（可选）：自定义提示词**

在 **「设置 → 提示词管理」** 里可调整续写、改写、润色、全章、灵感、纠错、关系图、时间线等各类 AI 的提示词。

> 排错：若 AI 报错或无响应，优先检查 Base URL 是否正确（多数兼容服务以 `/v1` 结尾）、API Key 是否有效、所选模型该服务是否支持、本机网络能否访问该接口。

## 功能概览

- **作品管理**：创建/打开作品、回收站（恢复 / 永久删除）。
- **章节与写作**：章节增删恢复、双模式正文编辑器、自动保存、实时字数统计。
- **AI 辅助写作**：续写、改写、润色、全章生成、灵感、AI 纠错、一键总结（基于你自己的 OpenAI / OpenAI 兼容接口）。
- **人物与设定百科**：人物档案、世界观设定，供查阅与 AI 参考。
- **规划 / 伏笔库 / 人物关系图 / 时间线**：大纲与创作计划、伏笔全生命周期、关系网络、逐章时间脉络，多项支持 AI 自动生成。
- **数据本地存储**：单一数据库文件，存放位置可自定义（设置 → 数据存放位置）。

## 面向开发者

环境：Node 18+（推荐 20）、Windows。

```bash
npm install        # 安装依赖
npm run dev        # 启动开发模式（Vite + Electron）
npm run typecheck  # 类型检查（主进程 + 渲染层）
npm run build      # 构建渲染层与主进程到 dist/
npm run dist       # 打包生成 Windows 安装包（输出到 release/）
```
