@echo off
cd /d "%~dp0"
git add .
git commit -m "update app"
git push
echo Done. Vercel will redeploy automatically.
pause
