# 上游来源与署名

- [Arkham Cards campaign data](https://github.com/zzorba/arkham-cards-data)：战役数据、剧情、选择、条件、准备、结局、社区翻译及 schema。原文件保存在 `data/upstream/arkham-cards-data/`。
- [ArkhamDB JSON data (zzorba fork)](https://github.com/zzorba/arkhamdb-json-data)：卡牌数据与中文社区翻译。原文件保存在 `data/upstream/arkhamdb-json-data/`。
- [ArkhamDB](https://arkhamdb.com)：游戏卡图。图片下载前的确切 URL、下载文件路径及校验值记录在 `data/sources.json`。
- [Arkham Cards application](https://github.com/zzorba/ArkhamCards)：交互理念参考；本项目没有复制其 React Native 应用代码。

确切上游 commit 与文件 SHA-256 见 `data/sources.json`。保留原 README 与原始数据结构，不将上游内容声称为本项目原创。

简体卡牌译文直接取自 ArkhamDB 数据仓库的独立 `translations/zh-cn` 目录，来源版本单独记录，不替换进行中存档固定的战役版本。没有执行繁简字符转换。当前 10 位可选调查员及 13 张可玩密谋/推进卡已核对；审计见 `data/simplified-chinese-audit.json`。其他卡包的上游译文仍可能不完整。

本次检查未在上述两个数据仓库的根目录识别到明确的 LICENSE 文件；未据此声称内容已取得特定开源许可证授权。公开发布、再分发及生成配音前，应进一步确认适用的内容使用条款。游戏文字、卡图及相关商标的权利仍归其各自权利人所有。

本项目为非官方玩家工具，未获得 Fantasy Flight Games 或 Arkham Cards 的认可或背书。

网页可选加载 Google Fonts 的 Noto Serif SC 字体；网络不可用时自动使用系统宋体/衬线字体。卡图与当前内容库在本地，不需要 Google Fonts 才能使用。

职业 SVG 图标提取自 Arkham Cards 的 `assets/arkhamicons-config.json`，保留原始路径；来源 commit 与校验值见 `data/investigator-icon-sources.json`。调查员选择使用对应职业的彩色图标。
