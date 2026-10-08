# 无声无息 · Once Again 官方网站

Minecraft 服务器官方网站，使用独立 HTML、共享 CSS 和原生 JavaScript，保留现有像素风格与深浅主题。网站没有构建步骤或前端运行依赖。

## 页面与预览

| 文件 | 内容 |
| --- | --- |
| `index.html` | 首页、玩法介绍、筹备动态与加入入口 |
| `jieshao.html` | 团队成员、职责与项目介绍 |
| `ztdh.html` | 协作者岗位、报名流程与既有联系方式 |
| `scene1.html` | 赞助说明、支付宝及微信收款码 |

当前发布以上四个主页面。本地保留的旧预览不随正式站点上传。

在仓库根目录启动 HTTP 服务，再打开 [本地首页](http://localhost:8000/)：

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

如果环境没有 `py`，可使用 `python` 或本机 Python 可执行文件路径。通过 HTTP 检查页面跳转、地址参数、图片和主题保存。

GitHub Pages 发布源应指向仓库分支的 `/ (root)` 目录，入口为 `index.html`。保留根目录的 `.nojekyll`，让 HTML、CSS、JavaScript 和图片直接作为静态文件发布。`sitemap.xml`、`robots.txt` 及各页 canonical/Open Graph 信息使用 `https://zxwusheng.github.io/`；站点域名变化时需要同步更新。

## 内容配置

在 `site-config.js` 中维护公开配置：

| 字段 | 用途 |
| --- | --- |
| `serverAddress` | 已确认的服务器地址；留空时显示筹备状态并禁用复制 |
| `communityUrl` | 官方社区入口 |
| `feedbackUrl` | 问题反馈入口 |
| `rulesUrl` | 服务器规则入口 |
| `updates` | 首页动态列表，按新到旧排列 |

未知地址及三个入口继续留空；入口仅接受 HTTP/HTTPS 地址。不要填写示例群号、未经确认的服务器状态或赞助权益。`updates: []` 保留首页已有内容；填写时采用以下结构，并将说明文字替换为真实信息：

```javascript
updates: [
  {
    id: 'update-id',
    title: '填写已确认的标题',
    date: '',
    category: '公告',
    status: '填写真实状态',
    body: '填写已确认的内容'
  }
]
```

`id` 使用小写字母开头的字母、数字及短横线；`title` 和 `body` 必填。日期使用 `YYYY-MM-DD`，未知时留空，页面显示“日期待补充”。条目按填写顺序显示，不会自动排序；标题和内容按普通文本呈现。

招募页已有 QQ / 微信信息位于 `ztdh.html` 的 `#apply` 联系卡片。经确认后维护时，同步修改显示文字与复制按钮的 `data-copy-text`，不新增未经核实的联系方式。岗位、报名模板及合作说明也在该页维护。

## 赞助图片

`assets/payments/alipay.png` 和 `wechat.png` 由原页面 Base64 数据直接解码提取，保留原始 PNG 字节；渠道、尺寸及 SHA-256 记录见 [收款码资源说明](assets/payments/README.md)。赞助页支持放大查看和打开原图，弹窗支持关闭按钮、ESC 与键盘焦点返回。

严禁在视觉或性能优化中替换收款码、重绘二维码、改变收款信息或交换支付渠道。确需更换时，必须单独取得明确授权并审查收款信息，再同步图片、对应按钮、校验记录及 QA 基线。图片哈希一致仅证明原字节保留，扫码识别仍需在实际支付应用中人工验证。

## 共享文件职责

| 文件 | 职责 |
| --- | --- |
| `site-theme.js` | 首次绘制前读取 URL、保存偏好或系统主题 |
| `site-config.js` | 公开地址、入口及动态配置 |
| `site-common.js` | 导航菜单、主题按钮、弹窗、复制、配置入口、动态呈现与图片回退 |
| `site-nav-shared.css` | 导航、图片预览、赞助入口与指针光效样式 |
| `site-mobile-shared.css` | 公共视觉值、响应式布局、焦点及减少动态处理 |
| `site-card-follow.js` | 桌面细指针跟随光效；触摸、粗指针和减少动态偏好下停用 |

页面专用样式继续留在对应 HTML。新增交互优先复用共享脚本，避免给同一控件重复绑定处理器；修改导航、页脚及共享组件时检查四个主页面。保留 UTF-8 中文内容，避免引入不必要的框架或大体积内嵌资源。

## 检查与维护

在根目录运行静态检查：

```powershell
python tools/audit_site.py
python tools/audit_site.py --check-js
```

脚本不修改网站源文件，只生成 `output/site-qa/static-audit.json`；检查本地资源、锚点、元信息、导航/页脚一致性及二维码原始哈希。`--check-js` 需要 Node，仅检查 JavaScript 语法。外部 URL 会列入目录，静态脚本不发送网络请求。

需要模拟慢请求、图片失败或脚本失败时，可使用本地 QA 服务：

```powershell
python tools/qa-server.py --mode slow --port 8001
```

`--mode` 也可选 `missing-images` 或 `no-js`，服务仅监听本机。浏览器访问 `http://127.0.0.1:8001/`。

提交前人工检查四页在 320、375、390、768、1024、1440px 宽度下的内容与跳转，验证深浅主题、移动菜单、键盘焦点、弹窗打开/关闭、复制、图片失败回退、控制台和资源请求。静态检查与语法检查不能替代真实浏览器、Lighthouse 或支付应用扫码测试；记录实际运行的结果，不将未运行项目标为通过。
