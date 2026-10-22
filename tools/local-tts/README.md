# IndexTTS 本地配音安装包

此工具用于在本地运行 IndexTTS 2.5，并按现有剧情编号生成中文 MP3。当前尚未完成模型下载，也没有生成 IndexTTS 样本。

当前电脑已检测到 NVIDIA RTX 5000 Ada Laptop GPU，显存约16GB，适合尝试 GPU 推理。源码与模型版本已固定在 `settings.json`，避免后续上游变化影响重现。

## 安装

先确认已安装 Git 与 uv。当前电脑已有两者；在另一台电脑上可从 [Git](https://git-scm.com/downloads/win) 与 [uv](https://docs.astral.sh/uv/getting-started/installation/) 官方说明安装。

在本文件夹打开终端，运行：

```powershell
.\install.cmd
```

默认运行目录为 `%LOCALAPPDATA%\AHLCG-Narrator\IndexTTS-2.5`，不把大模型放进网页项目或 OneDrive。安装器创建独立 Python 3.11.13 环境，按上游锁定版本安装 CUDA PyTorch 与 WebUI，并下载模型及示例声音。下载和安装需要数GB空间；仅模型文件约7.72GiB，完整环境会占更多空间。

Windows 安装不启用 DeepSpeed、FlashAttention 或自定义 CUDA 编译。用系统证书库校验下载，不关闭 TLS 校验。临时构建目录采用短路径，避免已遇到的 antlr4 Windows 长路径错误。

可指定安装目录：

```powershell
.\install.cmd -RuntimeDir "D:\AI\IndexTTS-2.5"
```

先只检查命令和计划路径，不执行安装：

```powershell
.\install.cmd -CheckOnly
```

## 当前工作网络的限制

这台电脑上，Hugging Face 的模型文件下载被组织的 Zscaler 网关返回 HTTP403 阻止，涉及 `us.aws.cdn.hf.co`。源码可以下载，但权重不行。

安装器不能解决该安全策略。请使用经批准的模型获取方式，例如 IT 放行，或提供已获批准的本地模型文件。不修改或绕过网关设置，也不自动切换第三方镜像。

需要先安装环境、暂时不下载模型时：

```powershell
.\install.cmd -SkipModelDownload
```

以后取得下载许可后，重新运行安装命令即可继续。也可把批准的模型放入运行目录的以下结构：

```text
IndexTTS-2.5/
  .venv/
  examples/
    voice_04.wav
    ...其余上游示例文件
  checkpoints/
    config.yaml
    gpt.pth
    codec.pth
    s2mel.pth
    feat1.pt
    feat2.pt
    wav2vec2bert_stats.pt
    multilingual_zh_ja_yue_char_del.tiktoken
    qwen0.6bemo4-merge/
      ...该模型目录的完整文件
    hf_cache/
      campplus_cn_common.bin
      w2v-bert-2.0/
        config.json
        preprocessor_config.json
        model.safetensors
      bigvgan/
        config.json
        bigvgan_generator.pt
```

主模型来源为 [IndexTeam/IndexTTS-2.5](https://huggingface.co/IndexTeam/IndexTTS-2.5)。辅助模型来自官方仓库 `facebook/w2v-bert-2.0`、`funasr/campplus` 与 `nvidia/bigvgan_v2_22khz_80band_256x`。示例音频来自上游项目提供的演示文件。

`preflight.py` 会列出缺失文件；这里只检查文件是否存在，最终模型加载及实际推理仍需完整安装后验证。

## 启动本地界面

```powershell
.\start-ui.cmd
```

模型加载后访问 `http://127.0.0.1:7860`。只监听本机，不开放公网分享。保留终端窗口，按 Ctrl+C 停止。默认使用半精度，并加载本地情绪模型。启动前会检查文件，运行时设置离线模式。

## 生成之前的样本

```powershell
.\generate.cmd
```

默认读取 `2-0-0-1-1` 的原始中文，使用上游 `voice_04.wav` 作为演示参考音色，保持正常速度 `duration_factor=1.0`。不会读取或使用任何 Google、MiniMax 或 FreeTTS 密钥。

默认参考声音只用于验证运行效果；IndexTTS 通过参考录音决定音色，不能仅靠一段文字提示设计任意声音。选定自己希望使用的参考录音后：

```powershell
.\generate.cmd -Reference "D:\Voice\narrator.wav"
```

最好使用干净、单人、无背景音乐的短录音。不要使用末尾含 FreeTTS 标记的整段音频作为参考。可在界面中试听并调整情绪，再固定同一参考声音制作战役。

如需温和的文字情绪指导，可运行：

```powershell
.\generate.cmd -Reference "D:\Voice\narrator.wav" -EmotionText "声音平静克制，带有轻微的不安和悬疑感。"
```

该参数控制情绪，不保证逐字执行音色、角色或表演方面的所有自然语言指令。语速仍为正常速度。

输出位置：

```text
assets/audio/zh-CN/2/0/indextts/2-0-0-1-1.03a0d13640dd.mp3
assets/audio/zh-CN/2/0/indextts/2-0-0-1-1.03a0d13640dd.wav
data/narration/samples/2-0-0-1-1.indextts.json
```

保留 WAV 母版，并使用随环境安装的 FFmpeg 转成 MP3。原 Google 与 FreeTTS 样本不会被覆盖。样本标记为草稿，不改写 `data/narration/audio.json` 的批准列表。

生成其他段落时指定编号：

```powershell
.\generate.cmd -Id "2-5-4-2-1" -Reference "D:\Voice\narrator.wav"
```

已存在的样本不会默认覆盖。确实要重新制作时加 `-Force`。脚本只处理 `speak: true` 的段落，不为规则文字录音。

## 关于独立 ZIP 包

ZIP 包包含本工具及现有配音索引，不包含整套网页、Python 环境或模型。解压后安装并生成，音频会保存在解压根目录的 `assets/audio/...` 中。把选定音频与草稿元数据按相同相对路径复制回原网页项目即可。

## 验证状态

已检查 PowerShell 语法、Python 语法、路径规划与 `2-0-0-1-1` 的文本校验。受模型下载阻挡，本机尚未验证模型加载、声音效果或生成耗时。

上游说明：[IndexTTS 仓库](https://github.com/index-tts/index-tts)。

### Python 下载报 UnknownIssuer

安装器会临时移除可能由 Conda 设置的 `SSL_CERT_FILE` / `SSL_CERT_DIR`，让 uv 使用 Windows 系统信任库，结束后恢复原值。若仍失败，请由 IT 检查组织证书是否正确安装到 Windows 信任库；不要关闭证书校验。修复后重新运行相同安装命令即可。
