@echo off
setlocal

REM Starts a simple local server so JSON fetch() works (avoids file:// CORS issues)
REM Requires Python installed (Windows: "py" launcher)

echo.
echo Starting local server on http://localhost:8000/
echo Press Ctrl+C to stop.
echo.

py -m http.server 8000

endlocal
