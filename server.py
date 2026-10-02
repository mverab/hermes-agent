import os
from starlette.applications import Starlette
from starlette.responses import FileResponse, JSONResponse
from starlette.routing import Route

CLIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "media", "clip.mp4")


async def stream(req):
    print("RANGE", req.query_params.get("path"), req.headers.get("range"), flush=True)
    return FileResponse(CLIP, media_type="video/mp4")


async def ping(req):
    return JSONResponse({"ok": True})


app = Starlette(routes=[Route("/api/files/stream", stream, methods=["GET", "HEAD"]), Route("/api/ping", ping)])
