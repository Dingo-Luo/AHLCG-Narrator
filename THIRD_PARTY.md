# 上游来源与署名

- [Arkham Cards campaign data](https://github.com/zzorba/arkham-cards-data)：战役数据、剧情、选择、条件、准备、结局、社区翻译及 schema。本项目保留已整理的中文内容及来源版本记录。
- [ArkhamDB JSON data (zzorba fork)](https://github.com/zzorba/arkhamdb-json-data)：卡牌数据与中文社区翻译。本项目保留已整理的中文卡牌内容及来源版本记录。
- [ArkhamDB](https://arkhamdb.com)：游戏卡图。图片下载前的确切 URL、下载文件路径及校验值记录在 `data/sources.json`。
- [Arkham Cards application](https://github.com/zzorba/ArkhamCards)：交互理念参考；本项目没有复制其 React Native 应用代码。

来源 commit 与卡图 SHA-256 见 `data/sources.json` 及相应来源清单。原始上游快照已移除，不将整理后的内容声称为本项目原创。

中文内容由已有上游简体及繁体译文整理而来，没有执行繁简字符转换。当前直接维护中文字段，不再保存英文原文键或多语言目录。未有中文译文的字段位置见 `data/chinese-content-audit.json`。

本次检查未在上述两个数据仓库的根目录识别到明确的 LICENSE 文件；未据此声称内容已取得特定开源许可证授权。公开发布、再分发及生成配音前，应进一步确认适用的内容使用条款。游戏文字、卡图及相关商标的权利仍归其各自权利人所有。

本项目为非官方玩家工具，未获得 Fantasy Flight Games 或 Arkham Cards 的认可或背书。

网页可选加载 Google Fonts 的 Noto Serif SC 字体；网络不可用时自动使用系统宋体/衬线字体。卡图与当前内容库在本地，不需要 Google Fonts 才能使用。

职业 SVG 图标提取自 Arkham Cards 的 `assets/arkhamicons-config.json`，保留原始路径；来源 commit 与校验值见 `data/investigator-icon-sources.json`。调查员选择使用对应职业的彩色图标。

基础版与卡尔克萨新增剧情来源分别记于 `data/core-sources.json`、`data/expansion-sources.json`，含来源版本及卡图 SHA-256。卡尔克萨固定采用上游新版战役合集（reprint）分支与对应幕间。不保留旧版原始文件。敦威治已有剧情版本和存档固定版本保持兼容，新增卡图另存来源清单。没有对上游中文执行繁简转换。
