# 🧪 测试模块

NanoBanana Storyboarder 测试套件，覆盖**前端单元测试**、**后端单元测试**和**端到端 (E2E) 测试**三个层级。

---

## 📁 目录结构

```
tests/
├── frontend/               # 前端单元测试 (Vitest)
│   ├── api.test.ts          # API 调用层
│   ├── asset-tags.test.ts   # 资产标签解析逻辑
│   ├── helpers.test.ts      # 工具函数
│   └── scene-manager.test.ts# 场景管理器
│
├── server/                  # 后端单元测试 (Vitest)
│   ├── audio.test.ts        # 音频生成
│   ├── core-lenses.test.ts  # 核心镜头库
│   ├── helpers.test.ts      # 后端工具函数
│   ├── image.test.ts        # 图片生成
│   ├── model-manager.test.ts# 模型管理器
│   ├── pipeline.test.ts     # AI 流水线逻辑
│   ├── providers.test.ts    # AI Provider 适配
│   ├── routes.test.ts       # Express 路由
│   ├── t8star-utils.test.ts # T8Star 工具函数
│   ├── validators.test.ts   # 参数校验
│   ├── video.test.ts        # 视频生成
│   └── tsconfig.json        # 测试专用 TS 配置
│
└── e2e/                     # 端到端测试 (Playwright)
    ├── fixtures/             # Mock 数据
    │   ├── mock-analyze-response.json
    │   ├── mock-beatsheet-response.json
    │   ├── mock-extract-assets.json
    │   ├── mock-prompts-response.json
    │   ├── mock-scene-image.json
    │   └── sample-novel.txt
    ├── test-helpers.ts       # 共享工具（拦截器、超时配置）
    ├── flow1-style-setup.spec.ts
    ├── flow2-narrative-pipeline.spec.ts
    ├── flow3-multimedia.spec.ts
    ├── flow4-request-chain.spec.ts
    ├── flow5-persistence.spec.ts
    └── flow6-automation.spec.ts
```

---

## 🚀 运行命令

### 单元测试

| 命令 | 说明 |
|------|------|
| `npm run test` | 运行前端单元测试 |
| `npm run test:watch` | 前端单元测试（监听模式） |
| `npm run test:server` | 运行后端单元测试 |
| `npm run test:all` | 前端 + 后端全部单元测试 |

### E2E 测试

| 命令 | 说明 |
|------|------|
| `npm run test:e2e` | E2E 测试（无头模式，Mock API） |
| `npm run test:e2e:headed` | E2E 测试（有头模式，Mock API） |
| `npm run test:e2e:ui` | Playwright UI 模式（可视化调试） |
| `npm run test:e2e:real` | E2E 测试（有头模式，**真实 API**） |
| `npm run test:e2e:real:headless` | E2E 测试（无头模式，**真实 API**） |

---

## 🏗️ 技术栈与配置

| 层级 | 框架 | 配置文件 |
|------|------|----------|
| 前端单元测试 | Vitest 4.x | `vitest.config.ts` |
| 后端单元测试 | Vitest 4.x + Supertest | `server/vitest.config.ts` |
| E2E 测试 | Playwright 1.58+ | `playwright.config.ts` |

### Playwright 配置要点

- **浏览器**: Chromium (Desktop Chrome)
- **串行执行**: `workers: 1`, `fullyParallel: false`
- **开发服务器**: 自动检测 `http://localhost:3000`
- **截图**: 仅失败时保存
- **视频**: 仅失败时保留
- **Trace**: 首次重试时记录

---

## 🧩 E2E 测试场景概览

### Flow 1: 视觉资产预设 (`flow1-style-setup.spec.ts`)

验证风格设置阶段的数据流，对应 Agent A1 (Visual DNA) + Agent A2 (选角)。

| 编号 | 测试内容 |
|------|----------|
| 1.1 | Visual DNA — 风格选择触发 visual-dna API |
| 1.2 | 自定义风格 — workStyle/textureStyle 正确传递 |
| 1.3 | 参考图分析 — 上传入口存在 |
| 1.4 | 资产提取 (Agent A2) — extract-assets 参数验证 |
| 1.5 | BeatSheet 资产补充提取 |
| 1.6 | 画面比例设置 — 9:16 / 16:9 切换 |
| 1.7 | 旁白语音设置 — 下拉选项验证 |

### Flow 2: 多智能体核心流水线 (`flow2-narrative-pipeline.spec.ts`)

验证 Agent 1 → Agent 2 → Agent 3 → QC 的完整数据串联。

| 编号 | 测试内容 |
|------|----------|
| 2.1 | Agent 1 — text + language + episodeCount 传入 analyze |
| 2.2 | Agent 1→2 — NarrativeBlueprint 传入 beat-sheet 含 style |
| 2.3 | Agent 2 — beat-sheet 返回后 chunk 状态变化 |
| 2.4 | Agent 2→3 — beatSheet + assets + style 传入 prompts |
| 2.5 | Agent 3 — prompts 返回 Scene[] 渲染为 SceneCard |
| 2.6 | 集数设置 — episodeCount 正确传入 |
| 2.7 | 状态流转 — 生成后 chunk 面板和 header 可见 |

### Flow 3: 多媒体生成 (`flow3-multimedia.spec.ts`)

验证图片 / 视频 / 音频三条并行生成链路。

### Flow 4: 前后端请求链路 (`flow4-request-chain.spec.ts`)

验证 FE → ModelManager → Provider → Express → 外部 API 的数据通路。

| 编号 | 测试内容 |
|------|----------|
| 4.1 | 参数校验 — 缺 text 返回 400 |
| 4.2 | 参数校验 — 缺 style 返回 400 |
| 4.3 | 速率限制 — 超 100 次/分返回 429 |
| 4.4 | 服务器可达性 — 前端页面正常加载 |
| 4.5 | 错误传播 — 后端 500 不导致前端白屏 |

### Flow 5: 数据持久化 (`flow5-persistence.spec.ts`)

验证 IndexedDB 保存/恢复机制。

| 编号 | 测试内容 |
|------|----------|
| 5.1 | 会话保存 — 生成后 IndexedDB 有数据 |
| 5.2 | 页面刷新恢复 — F5 后结构完整 |
| 5.3 | IndexedDB 数据库可访问 |
| 5.4 | 清除缓存按钮可用 |

### Flow 6: 自动化状态机 (`flow6-automation.spec.ts`)

验证 `useAutomation` 全自动流水线状态流转。

| 编号 | 测试内容 |
|------|----------|
| 6.1 | 完整流水线 — analyze → beat-sheet → prompts 依次调用 |
| 6.2 | 数据串联 — 前一步输出作为后一步输入 |
| 6.3 | 场景渲染 — 流水线完成后 SceneCard 出现 |
| 6.4 | 工作流按钮链 — 关键按钮存在 |
| 6.5 | 错误恢复 — API 失败后页面不白屏 |

---

## 🔀 Mock 模式 vs 真实 API 模式

E2E 测试支持**双模式运行**，通过环境变量 `REAL_API` 控制：

| 特性 | Mock 模式（默认） | 真实 API 模式 |
|------|-------------------|---------------|
| 环境变量 | 无需设置 | `REAL_API=true` |
| API 行为 | 拦截并返回 fixtures 数据 | 请求转发至真实后端 |
| 单步等待 | 3 秒 | 60 秒 |
| 流水线等待 | 8 秒 | 120 秒 |
| 媒体等待 | 5 秒 | 90 秒 |
| 测试超时 | 2 分钟 | 5 分钟 |
| 操作超时 | 15 秒 | 120 秒 |

### 工作原理

`test-helpers.ts` 提供的 `interceptApi()` 函数在两种模式下行为不同：
- **Mock 模式**: 拦截请求 → 捕获请求体 → 返回 fixture 数据
- **Real 模式**: 拦截请求 → 捕获请求体 → `route.continue()` 转发至真实服务器

---

## 📋 后端单元测试覆盖范围

| 文件 | 覆盖模块 |
|------|----------|
| `routes.test.ts` | Express 路由参数校验与响应格式 |
| `pipeline.test.ts` | AI 多智能体流水线逻辑 |
| `providers.test.ts` | Gemini / 外部 AI Provider 适配层 |
| `model-manager.test.ts` | 模型选择与路由管理 |
| `image.test.ts` | 图片生成与处理 |
| `video.test.ts` | 视频生成（含异步轮询） |
| `audio.test.ts` | 音频 / TTS 生成 |
| `core-lenses.test.ts` | 核心镜头库 |
| `validators.test.ts` | 请求参数校验器 |
| `helpers.test.ts` | 后端通用工具函数 |
| `t8star-utils.test.ts` | T8Star 平台工具函数 |

---

## 📋 前端单元测试覆盖范围

| 文件 | 覆盖模块 |
|------|----------|
| `api.test.ts` | 前端 API 调用封装 |
| `asset-tags.test.ts` | 资产标签 `@图像` 解析与匹配 |
| `helpers.test.ts` | 前端通用工具函数 |
| `scene-manager.test.ts` | 场景状态管理 |

---

## 💡 编写新测试指南

### 添加 E2E 测试

1. 在 `tests/e2e/` 下创建 `flowN-xxx.spec.ts`
2. 导入 `test-helpers.ts` 中的共享工具
3. 使用 `interceptApi()` 同时支持 Mock 和 Real 模式
4. Mock 数据放入 `tests/e2e/fixtures/`

### 添加后端单元测试

1. 在 `tests/server/` 下创建 `xxx.test.ts`
2. 使用 `supertest` 测试 Express 路由
3. 使用 `vi.mock()` mock 外部依赖

### 添加前端单元测试

1. 在 `tests/frontend/` 下创建 `xxx.test.ts`
2. 路径别名 `@` 指向 `src/` 目录
3. 测试环境为 `node`（非 `jsdom`）

---

## 📊 测试报告

- **E2E 报告**: 运行后生成在 `playwright-report/` 目录，`npx playwright show-report` 查看
- **测试截图/视频**: 失败用例的截图和视频保存在 `test-results/`
