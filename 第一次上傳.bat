@echo off
cd /d "%~dp0"
if exist .git (
  echo Already set up. Use deploy bat instead.
  pause
  exit /b
)
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/0jerryqq-star/whos-in-today.git
git push -u origin main
echo.
echo Done. Now import whos-in-today on vercel.com/new
pause
