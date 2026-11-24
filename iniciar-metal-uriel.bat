@echo off
chcp 65001 >nul
title Metal-Uriel v2.0 - Arranque Plug & Play (UNID Admisiones)
echo ============================================================
echo   METAL-URIEL v2.0 - INSTALADOR Y ARRANQUE PLUG ^& PLAY
echo   Universidad Interamericana para el Desarrollo (UNID)
echo ============================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo Descargalo desde https://nodejs.org/ ^(version LTS v20+^) y vuelve a ejecutar este archivo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js detectado: %NODE_VER%

if not exist "node_modules" (
    echo.
    echo [1/3] Instalando dependencias de Node.js por primera vez...
    call npm install --omit=dev
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Fallo npm install. Verifica tu conexion a internet.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencias node_modules listas.
)

if not exist ".env" (
    echo [2/3] Creando archivo .env virgen desde .env.example...
    copy /Y ".env.example" ".env" >nul
    echo       Al abrirse el navegador, completa el Asistente de Configuracion.
) else (
    echo [2/3] Archivo .env detectado.
)

if not exist "logs" mkdir logs

echo [3/3] Iniciando servidor Metal-Uriel en http://localhost:3000 ...
echo       ^(Presiona Ctrl+C para detenerlo, o usa PM2 para modo servidor 24/7^)
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
node index.js
pause
