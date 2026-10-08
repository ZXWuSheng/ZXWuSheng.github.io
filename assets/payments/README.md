# 赞助收款码资源

这两张 PNG 从 `scene1.html` 的既有 Base64 数据直接解码提取，未裁切、缩放、重绘或重新编码。收款内容与支付渠道保持原样。

| 文件 | 渠道 | 像素尺寸 | 字节数 | SHA-256 |
| --- | --- | --- | --- | --- |
| `alipay.png` | 支付宝 | 1080 × 1680 | 479872 | `3f73ea9670837c05015b1511050aa2c39f2e6c1bdc1b33d3b806896930061554` |
| `wechat.png` | 微信支付 | 1263 × 1719 | 203033 | `150fd17f9a7d83628d53f9bbaed95cf67f31f175fc4b096b13ef962f9e3e38f5` |

提取前后 SHA-256 已一致；这验证图片字节和收款内容未被修改，不代表已完成支付应用扫码或实际付款测试。

PowerShell 校验：

```powershell
Get-FileHash -LiteralPath assets/payments/alipay.png,assets/payments/wechat.png -Algorithm SHA256
```

后续若需要更换收款码，应单独审查收款信息及支付渠道，并更新此校验清单。
