"""RefGen 本地服务入口。

- POST /api/extract         从 URL 提取元数据
- POST /api/parse-citation  解析粘贴的 citation 文本
- GET  /                    返回前端页面
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.extractor import extract_metadata_from_url
from app.citation_parser import parse_citation_text

app = FastAPI(title="RefGen", description="Local citation generator")

# 本地使用时前端与后端同源，CORS 仅作为将来部署的预留
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractRequest(BaseModel):
    url: str


class ParseCitationRequest(BaseModel):
    text: str


@app.post("/api/extract")
async def api_extract(req: ExtractRequest):
    return extract_metadata_from_url(req.url.strip())


@app.post("/api/parse-citation")
async def api_parse_citation(req: ParseCitationRequest):
    return parse_citation_text(req.text)


# 挂载静态资源（必须放在所有 API 路由之后）
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")