A股量化雷达 H5 V3.0 云端版
================================

功能
----
1. 手机/电脑H5
2. A股实时行情代理
3. 个股报价
4. 日K线
5. MA5/MA10/MA20/MA60
6. RSI
7. MACD DIF/DEA
8. 量化评分（0~100）
9. 市场强势榜/异动榜
10. Cloudflare Worker 云端API
11. Cron自动预热行情缓存

部署
----
推荐 Cloudflare Workers。

方式A：本地命令行
1. 安装 Node.js
2. 在本目录执行：
   npx wrangler login
   npx wrangler deploy
3. 部署成功后使用 Cloudflare 提供的 workers.dev 地址。

方式B：GitHub + Cloudflare
把整个项目上传GitHub，再在 Cloudflare Workers/Pages 中连接仓库并部署。

重要
----
- 本项目默认使用公开行情接口进行数据获取，不需要填写 Finnhub Key。
- 上游行情接口可能存在访问频率、字段变化或临时不可用情况，因此程序做了缓存和错误处理，但不保证永久稳定。
- 量化评分只是技术指标组合，不构成投资建议，也不保证收益。
- Cron按UTC运行；配置中的 1-7 点UTC对应北京时间约09:00-15:00（夏令时等不影响北京时间本地定义，但Cloudflare Cron本身始终按UTC执行）。
- V3.0当前重点是行情、K线、技术指标、量化评分和异动雷达；新闻/公告/板块资金流可在下一增量版本接入。

API
---
/api/health
/api/market
/api/snapshot
/api/search/600519
/api/quote/600519
/api/kline/600519

目录
----
worker.js
public/index.html
wrangler.toml
README_部署.txt
