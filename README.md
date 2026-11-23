# 出缺勤人員統計 (whos-in-today)

用 Vite + React 打包的獨立專案,資料存在瀏覽器的 `localStorage`,不需要後端。

## 本機開發

```bash
npm install
npm run dev
```

## 部署到 Vercel(新專案,不影響其他專案)

1. 把這個資料夾初始化成一個「新的」Git repo,推到 GitHub 上一個新的 repository(跟 `my-perfect-pwa` 分開):

   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin <你新建的 GitHub repo 網址>
   git push -u origin main
   ```

2. 到 [vercel.com/new](https://vercel.com/new),點 **Add New... → Project**,選擇剛剛那個新 repo 匯入。
3. Vercel 會自動偵測到 Vite,Framework Preset 選 **Vite** 即可,Build Command / Output Directory 用預設值(`npm run build` / `dist`)。
4. 按 Deploy。完成後會得到一個全新的網址(例如 `whos-in-today.vercel.app`),跟 `my-perfect-pwa` 完全獨立,不會互相覆蓋或影響。
