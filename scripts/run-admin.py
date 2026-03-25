"""Run admin API locally (port 8001).

First time: pip install -r requirements.txt   (or run .\\run.ps1 — it installs if uvicorn is missing)
Windows Store python: use .\\run.ps1 or install from python.org with PATH.
Docker: docker compose up -d admin-api
"""
import os
import sys

if __name__ == "__main__":
    admin_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(admin_dir)
    if admin_dir not in sys.path:
        sys.path.insert(0, admin_dir)

    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        reload_dirs=[admin_dir],
    )
