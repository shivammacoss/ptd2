import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "services.admin.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        reload_dirs=[os.path.join(os.path.dirname(__file__))],
    )
