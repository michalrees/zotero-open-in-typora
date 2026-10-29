# Zotero Open in Typora

在 Zotero 中右键论文条目下的子笔记，选择 **用 Typora 打开**，即可使用本地 Typora 查看、编辑对应的 Markdown 文件，并通过 Better Notes 双向同步。

## 环境要求

- Zotero 10.0.x（接口按 10.0.6 核对）
- 已安装并启用 [Better Notes](https://github.com/windingwind/zotero-better-notes)（接口按 3.3.3 核对）
- 本地安装 Typora；当前默认程序路径为 Linux 的 `/opt/typora/Typora`

当前版本以 Linux 为目标。已通过模拟行为测试和安装包检查，尚未完成真实 Zotero 会话中的安装与端到端验证。

## 安装

1. 从 [dist](dist/) 下载 `open-notes-in-typora-1.0.0.xpi`（打开文件页面后点击 Download raw file）。
2. Zotero → **工具 → 插件 → 齿轮 → 从文件安装插件**，选择该文件。
3. 在条目列表中展开论文，右键一篇子笔记 → **用 Typora 打开**。
4. 在 Typora 中编辑并保存，保持 Zotero 运行。

## 文件与同步

- 已有 Better Notes 同步关系：沿用原 Markdown 文件及路径。
- 新笔记首次打开：在 `~/local/Yu/Paper/年份 - 作者 - 标题 [条目键]/` 创建文件并登记同步。
- 笔记内图片由 Better Notes 导出；不复制论文 PDF。
- 每 5 秒请求 Better Notes 同步通过本插件打开过的笔记，无需 Zotero 窗口处于前台；重启后仍保留这些笔记的同步检查。
- Zotero 中正在打开编辑的笔记会被后台同步跳过，编辑完成后关闭该笔记编辑视图即可。
- 双方同时修改时由 Better Notes 处理差异合并；打开前仍有未解决差异会提示处理，不强行覆盖。
- 已登记的同步文件丢失时提示修复原路径，不静默创建替代文件。
- 仅为选中的单篇子笔记显示菜单，不对论文父条目或 PDF 附件显示。
- 卸载插件不删除笔记、Markdown 或 Better Notes 同步关系。

## 配置

在 Zotero 的设置 → 高级 → 配置编辑器中添加或修改以下字符串首选项：

| 首选项 | 用途 | 默认值 |
| --- | --- | --- |
| `extensions.openNotesInTypora.executable` | Typora 可执行文件绝对路径 | `/opt/typora/Typora` |
| `extensions.openNotesInTypora.root` | 新笔记导出根目录的绝对路径 | 当前用户主目录下的 `local/Yu/Paper` |

既有同步关系不受根目录设置变更影响。`extensions.openNotesInTypora.managedNoteIDs` 为插件维护的笔记 ID 列表。

## 开发

无需安装 npm 依赖。使用 Node.js 18+ 和 Python 3：

```bash
node --test test.cjs
python3 build.py
```

构建产物位于 `dist/`。构建脚本仅打包 `manifest.json` 和 `bootstrap.js`，使用固定 ZIP 时间戳以便复现。

测试覆盖新笔记导出、已有文件复用、外部修改保护、文件丢失、同名文件恢复、菜单显示条件、后台同步及依赖不可用等分支。测试使用模拟接口，不能替代 Zotero 中的实际安装测试。

## 修改来源

创作来自GPT
