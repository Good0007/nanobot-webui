# nanobot-ai 升级到 0.1.5 的 WebUI 配置补丁分析

本文基于以下三部分信息整理：
- nanobot v0.1.5 release 说明
- 本地 nanobot 源码 v0.1.5
- 当前 nanobot-webui 的补丁、API、Settings 页面实现

目标是明确：
- 当前 WebUI 已经覆盖了哪些配置能力
- 0.1.5 新增后，哪些配置能力仍然没有可视化入口
- 后续 WebUI 需要新增、修改、删除哪些补丁和前后端代码

## 结论摘要

当前 WebUI 已经覆盖了以下配置面：
- Agent 基础参数：模型、provider、max_tokens、temperature、max_iterations、context_window_tokens、reasoning_effort、workspace
- Agent 运行参数：restrict_to_workspace、exec_timeout、path_append、web_search_api_key、web_proxy、send_progress、send_tool_hints
- Provider 管理：普通 provider、custom provider、api_key、api_base、extra_headers、模型列表
- Channel 管理：单个 channel 的启停和逐项配置编辑
- MCP Server 管理：新增、编辑、删除、启停、JSON 导入
- S3 配置、raw config 编辑、workspace 文件编辑、skills 开关

但 0.1.5 后，仍然有一批重要配置没有专门 UI：
- web tools 的完整配置
- exec sandbox 和 exec enable
- SSRF 白名单
- Dream memory 配置
- 0.1.5 新增 provider 的 UI 可见性，尤其是 xiaomi_mimo 和 qianfan
- channels 的部分顶层配置，如 send_max_retries、transcription_provider

结论上，WebUI 不是缺一个大功能，而是缺少几个“配置面”入口。最优做法不是继续把这些值塞进 raw JSON，而是把 Settings 页拆成更清晰的运行时配置分区。

## 已有覆盖面

### 1. Agent 与运行时

当前 Settings 页已经能改这些值：
- model
- provider
- max_tokens
- temperature
- max_iterations
- context_window_tokens
- reasoning_effort
- workspace
- send_progress
- send_tool_hints
- restrict_to_workspace
- exec_timeout
- path_append
- web_search_api_key
- web_proxy

对应实现主要在：
- [web/src/pages/Settings.tsx](../web/src/pages/Settings.tsx)
- [webui/api/routes/config.py](../webui/api/routes/config.py)
- [webui/api/models.py](../webui/api/models.py)

### 2. Provider 管理

当前已经支持：
- builtin provider 编辑
- custom provider 创建、编辑、删除
- extra_headers
- provider models 列表

对应实现主要在：
- [web/src/pages/Settings.tsx](../web/src/pages/Settings.tsx)
- [webui/api/routes/providers.py](../webui/api/routes/providers.py)
- [webui/api/models.py](../webui/api/models.py)
- [webui/utils/webui_config.py](../webui/utils/webui_config.py)

### 3. Channel、MCP、Cron、S3、Raw Config

当前已存在且基本够用的页面：
- Channels 页面：单个 channel 的配置和启停
- MCPServers 页面：MCP 服务器管理
- CronJobs 页面：任务调度，已经包含 deliver 开关
- SystemConfig 页面：S3、导入导出、raw config、日志、workspace 文件

对应实现主要在：
- [web/src/pages/Channels.tsx](../web/src/pages/Channels.tsx)
- [web/src/pages/MCPServers.tsx](../web/src/pages/MCPServers.tsx)
- [web/src/pages/CronJobs.tsx](../web/src/pages/CronJobs.tsx)
- [web/src/pages/SystemConfig.tsx](../web/src/pages/SystemConfig.tsx)

## 0.1.5 新增后仍缺失的配置面

下面按优先级列出建议补齐项。

| 优先级 | 配置面 | 当前状态 | 建议动作 |
| --- | --- | --- | --- |
| P0 | Provider 名单 | provider 页面使用手写 allowlist，0.1.5 新增的 xiaomi_mimo、qianfan 不会自动出现 | 改成从 provider registry 和 ProvidersConfig 驱动，至少补上 xiaomi_mimo、qianfan，同时顺手补齐 stepfun、mistral、ovms 等遗漏项 |
| P0 | web tools 完整配置 | 目前只暴露 web_search_api_key 和 web_proxy | 新增一个 Web Tools 配置分区，暴露 enable、search.provider、search.base_url、search.max_results、search.timeout、proxy |
| P0 | exec 完整配置 | 目前只暴露 exec_timeout、path_append、restrict_to_workspace | 新增 exec.enable 和 exec.sandbox 的可视化入口；timeout、path_append、restrict_to_workspace 保留 |
| P0 | SSRF 白名单 | 当前没有 UI，只有 raw config 可改 | 新增安全配置分区，编辑 tools.ssrf_whitelist |
| P1 | Dream memory | 当前没有单独 UI，只能靠 raw config | 新增 Dream 分区，暴露 interval_h、model_override、max_batch_size、max_iterations |
| P1 | channels 顶层配置 | 目前只做单个 channel 的逐项编辑 | 新增 channels 全局分区，至少暴露 send_max_retries、transcription_provider |
| P2 | API server 配置 | 目前只公开 gateway，不公开 api.host、api.port、api.timeout | 如果希望 WebUI 变成完整运维面板，再补 API server 分区 |

## 0.1.5 对应源码变化分析

### 1. 新 provider

v0.1.5 provider registry 中新增或明确强化了这些 provider：
- xiaomi_mimo
- qianfan
- github_copilot 已经不是 openai_compat 兜底，而是独立 backend

对 WebUI 的影响：
- provider 页面如果继续用硬编码名单，会漏掉新 provider
- provider selector 也会因为名单不完整而无法展示这些 provider 的配置

建议：
- 改成 registry 驱动，不再手写名单
- 继续保留 custom provider 的编辑逻辑

### 2. web tools

v0.1.5 的 web tools 重点变化是：
- WebSearchTool 和 WebFetchTool 改成更规范的参数 schema
- web search 增加了更明确的 timeout 和 provider 行为
- 搜索 Jina fallback、DuckDuckGo fallback、URL 校验、图片处理都更完整

对 WebUI 的影响：
- 仅显示 api key 和 proxy 不够
- 应当把 search provider、base_url、max_results、timeout 一并暴露

### 3. memory / Dream

v0.1.5 的 memory 子系统已经演进成两层结构：
- 运行中历史与长期记忆分离
- Dream 负责后台 consolidation
- 旧 HISTORY.md 会迁移到新的 history.jsonl 结构

对 WebUI 的影响：
- 这是一个真正的新运行时能力，不只是内部重构
- 如果不把 Dream 配置暴露出来，用户就只能走 raw config

### 4. 配置安全

v0.1.5 中 config 相关的安全点包括：
- ${VAR} 环境变量插值
- SSRF 白名单
- exec 沙箱与非 root 运行

对 WebUI 的影响：
- env 插值本身不需要新控件，raw config 已能覆盖
- 但 SSRF 白名单和 exec sandbox 都值得做成显式表单，不然很容易被忽略

## 需要增加的代码动作

### A. 后端 API 与模型

建议新增或扩展这些内容：
- 在 [webui/api/models.py](../webui/api/models.py) 里扩展 AgentSettingsRequest 和 AgentSettingsResponse，加入 web tools、exec、Dream、SSRF、channels 顶层字段
- 在 [webui/api/routes/config.py](../webui/api/routes/config.py) 里把这些字段读写进 nanobot Config
- 在 [webui/api/routes/providers.py](../webui/api/routes/providers.py) 里把 provider 名单改成 registry 驱动
- 如有需要，在 [webui/api/routes/channels.py](../webui/api/routes/channels.py) 里增加对 channels 顶层字段的读写端点，而不是只靠单个 channel 的 dict 编辑

### B. 前端 Settings 页面

建议把 Settings 页拆成更清晰的分区：
- Agent 基础
- Web Tools
- Exec / Sandbox
- Security / SSRF
- Dream Memory
- Providers

建议保留当前已有的：
- Providers 列表和模型编辑器
- Gateway 配置
- Workspace 文件编辑

### C. Provider 页面

Provider 页建议直接读后端返回的数据，不再维护手写 provider 名单。

这样有两个好处：
- 新增 provider 时前端不会漏项
- provider registry、schema、UI 三边更容易保持一致

### D. 文案与国际化

需要同步补一批翻译键：
- Web Tools
- Sandbox
- SSRF whitelist
- Dream memory
- provider 新项名称

## 需要删除或收敛的代码动作

这里的删除不是删功能，而是删掉容易漏项的硬编码：

1. 删除 [webui/api/routes/providers.py](../webui/api/routes/providers.py) 中的手写 provider 白名单，改成从 registry 或 schema 自动生成。
2. 删除 Settings 页中只靠单个输入框承载复杂运行时配置的做法，把 web tools、exec、Dream、security 拆成独立分组。
3. 保留 raw config 编辑器，不建议删除；它仍然是新字段的兜底入口。

## 补丁逐项扫描

下面按当前 WebUI 的补丁逐个对照 v0.1.5 的上游实现，判断是否继续保留、是否存在覆盖缺口、是否需要同步改造。

| 补丁 | 目的 | 与 v0.1.5 的对照结果 | 结论 |
| --- | --- | --- | --- |
| [webui/patches/config.py](../webui/patches/config.py) | 支持 webui_config.json 里的 custom providers | 上游 Config._match_provider 仍然只认 builtin providers；custom providers 仍然需要这层拦截 | 保留，低风险 |
| [webui/patches/provider.py](../webui/patches/provider.py) | custom provider 的 OpenAI 兼容回退和 Responses API fallback | v0.1.5 的 openai_compat_provider 已增强响应解析和 max_retries=0，但没有替代这层 custom provider 路由 | 保留，低风险 |
| [webui/patches/session.py](../webui/patches/session.py) | session 删除、last_message 预览、sub_tool 过滤 | 上游 session manager 仍未提供 WebUI 需要的删除和预览能力；sub_tool 仍需过滤 | 保留，低风险 |
| [webui/patches/channels.py](../webui/patches/channels.py) | allow_from 语义放宽、DingTalk/Feishu 展示、Telegram conflict 处理 | 上游 BaseChannel.is_allowed 仍是空列表拒绝访问；ChannelManager 校验也未变 | 保留，低风险 |
| [webui/patches/skills.py](../webui/patches/skills.py) | disabled skills 注入到系统 prompt | 上游 skills loader 仍没有 WebUI 状态联动 | 保留，低风险 |
| [webui/patches/mcp_dynamic.py](../webui/patches/mcp_dynamic.py) | per-server MCP stack 与单 server 动态启停 | 上游仍是按 agent 级别的 MCP 管理，未提供 WebUI 需要的逐 server 热切换 | 保留，低风险 |
| [webui/patches/subagent.py](../webui/patches/subagent.py) | Web 通道 subagent 进度、结果回传、保存 turn | 这里和 v0.1.5 上游差异最大：上游已新增 GlobTool、GrepTool、exec_config.enable、exec_config.sandbox、web_config.enable、fail_on_tool_error 等行为，但当前 WebUI patch 仍在重写整段 _run_subagent，且没有完整复刻这些新逻辑 | 必须改造，存在兼容性风险 |

### 补丁兼容性风险说明

当前最需要修正的是 [webui/patches/subagent.py](../webui/patches/subagent.py)。原因不是功能缺失，而是它用“整段复制 + 局部修改”的方式覆盖了上游 _run_subagent，而 v0.1.5 的上游实现已经继续演进，具体包括：
- 新增 GlobTool 和 GrepTool
- ExecTool 受 exec_config.enable 控制
- ExecTool 支持 sandbox
- WebSearchTool 和 WebFetchTool 受 web_config.enable 控制
- fail_on_tool_error 行为已显式化

这意味着：
- 如果直接按当前 patch 保持不变，WebUI 可能会把上游新行为吃掉
- 最安全的做法是把 progress/announce/save_turn 相关逻辑拆成 hook 或最小侵入式包装，而不是继续维护一份完整复制版 _run_subagent

### 已覆盖但建议继续保留的点

以下补丁在 v0.1.5 下仍然属于 WebUI 专属逻辑，不建议删：
- custom provider 动态注入
- session 删除和 last_message 预览
- WebUI 风格的 allow_from 语义
- disabled skills 的运行时过滤
- MCP per-server 动态启停

### 没有发现的直接冲突

除了 subagent 的整段覆盖风险外，当前没有发现以下补丁与 v0.1.5 有直接冲突：
- config patch 的 custom provider 匹配逻辑
- provider patch 的 OpenAI Responses fallback
- session patch 的 sub_tool 过滤
- channels patch 的 Telegram / Feishu / DingTalk 适配
- skills patch 的 prompt 过滤
- mcp_dynamic patch 的 server stack 管理

## 修正版实施建议

如果按“确保没有遗漏和兼容性问题”的标准推进，实施顺序建议改成：

1. 先把 [webui/patches/subagent.py](../webui/patches/subagent.py) 迁移成最小侵入式包装，补回 v0.1.5 上游新增的 GlobTool、GrepTool、sandbox、web_config.enable、fail_on_tool_error 行为
2. 再补齐 Settings 页新增分区：Web Tools、Exec Sandbox、SSRF、Dream、channels 顶层配置
3. 再把 provider 页面改成 registry 驱动，避免 xiaomi_mimo、qianfan、stepfun、mistral、ovms 漏出
4. 最后回归验证 raw config、custom provider、skills、MCP、cron、channels 仍然可用

## 扫描结论

综合补丁扫描结果来看：
- 实施计划没有“完全覆盖所有补丁”的风险，反而是 subagent 这一处存在明显的上游兼容性缺口
- 其余补丁大多仍然需要保留，属于 WebUI 专属增强，不应该在 0.1.5 升级中删除
- 需要新增 UI 的配置面是明确的，不需要靠 raw config 才能完成升级


## 当前补丁是否需要保留

建议保留现有 patch 集合，0.1.5 下没有明确可以直接删掉的核心补丁：

- [webui/patches/config.py](../webui/patches/config.py) 仍然需要，用于 custom provider 动态注入
- [webui/patches/provider.py](../webui/patches/provider.py) 仍然需要，用于 custom provider 和 Responses API 回退
- [webui/patches/session.py](../webui/patches/session.py) 仍然需要，用于 session 删除和 sub_tool 兼容
- [webui/patches/channels.py](../webui/patches/channels.py) 仍然需要，用于 WebUI 的 allow_from 语义和子代理结果展示
- [webui/patches/skills.py](../webui/patches/skills.py) 仍然需要，用于 disabled skills
- [webui/patches/mcp_dynamic.py](../webui/patches/mcp_dynamic.py) 仍然需要，用于按 server 动态加载和卸载 MCP tools
- [webui/patches/subagent.py](../webui/patches/subagent.py) 仍然需要，用于 Web 通道的 subagent 进度和结果回传

也就是说，这次升级的重点不是删 patch，而是补齐配置面，并把 provider 页面从硬编码名单改成数据驱动。

## 建议实施顺序

1. 先修 provider 名单，避免 xiaomi_mimo 和 qianfan 直接不可见
2. 再补 web tools、exec、SSRF、Dream 的 API 和 Settings 分区
3. 最后补 channels 顶层字段和文案国际化
4. 完成后回归检查 raw config、provider、自定义 provider、cron、MCP、skills 是否仍然可用

## 验收标准

升级完成后，WebUI 应满足下面这些条件：
- v0.1.5 新增的 provider 至少能在 UI 中被配置和保存
- web tools 不再只有 api key 和 proxy 两个字段
- exec sandbox、SSRF whitelist、Dream 配置可以在 UI 中直接编辑
- raw config 仍然可作为兜底入口
- 现有 provider、channels、MCP、cron、skills 的页面不退化
