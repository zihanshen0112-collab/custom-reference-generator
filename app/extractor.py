"""从 URL 提取结构化元数据。

策略优先级：
1. trafilatura —— 综合 Open Graph / Schema.org / Dublin Core
2. BeautifulSoup —— 补齐标准 meta 标签
3. 域名兜底 —— siteName 缺失时用 hostname 推断
"""

from urllib.parse import urlparse
import random

import trafilatura
from trafilatura.settings import use_config
from bs4 import BeautifulSoup


# 轮换常见浏览器 UA，降低被默认 UA 识别为爬虫的概率
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]


def _get(obj, *names):
    #安全地从 trafilatura metadata 对象读取属性（兼容版本差异）。
    for name in names:
        val = getattr(obj, name, None)
        if val:
            return val
    return None


def _from_meta_tags(soup: BeautifulSoup, result: dict) -> None:
    #用 BeautifulSoup 从标准 meta 标签补齐缺失字段。
    # 网站名称
    if not result["siteName"]:
        for prop in ("og:site_name", "application-name", "apple-mobile-web-app-title"):
            tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
            if tag and tag.get("content"):
                result["siteName"] = tag["content"].strip()
                break

    # 作者
    if not result["author"]:
        for attrs in (
            {"name": "author"},
            {"name": "citation_author"},
            {"property": "article:author"},
            {"name": "twitter:creator"},
        ):
            tag = soup.find("meta", attrs=attrs)
            if tag and tag.get("content"):
                result["author"] = tag["content"].strip()
                break

    # 日期
    if not result["date"]:
        for attrs in (
            {"property": "article:published_time"},
            {"property": "og:article:published_time"},
            {"name": "citation_publication_date"},
            {"name": "date"},
            {"itemprop": "datePublished"},
        ):
            tag = soup.find("meta", attrs=attrs)
            if tag and tag.get("content"):
                result["date"] = tag["content"].strip()
                break

    # 标题
    if not result["title"]:
        if soup.title and soup.title.string:
            result["title"] = soup.title.string.strip()
        else:
            tag = soup.find("meta", property="og:title")
            if tag and tag.get("content"):
                result["title"] = tag["content"].strip()


def extract_metadata_from_url(url: str) -> dict:
    #从 URL 提取元数据。返回字段可能为 None。
    result = {
        "url": url,
        "author": None,
        "title": None,
        "siteName": None,
        "date": None,
        "error": None,
    }

    # ---------- 1. 下载网页 ----------
    html = None
    try:
        # 配置超时，避免单个请求拖垮本地服务
        config = use_config()
        config.set("DEFAULT", "EXTRACTION_TIMEOUT", "15")
        html = trafilatura.fetch_url(
            url,
            config=config,
            user_agent=random.choice(_USER_AGENTS),
        )
    except Exception as exc:
        result["error"] = f"Download failed: {exc}"
        return result

    if not html:
        result["error"] = (
            "Could not download the page "
            "(blocked, requires JavaScript, or invalid URL)."
        )
        return result

    # ---------- 2. Trafilatura 主导提取 ----------
    try:
        meta = trafilatura.extract_metadata(html)
        if meta:
            result["title"] = _get(meta, "title")
            result["author"] = _get(meta, "author")
            result["date"] = _get(meta, "date")
            result["siteName"] = _get(meta, "sitename", "site_name")
    except Exception:
        pass

    # ---------- 3. BeautifulSoup 补齐 ----------
    try:
        soup = BeautifulSoup(html, "html.parser")
        _from_meta_tags(soup, result)
    except Exception:
        pass

    # ---------- 4. 域名兜底 ----------
    if not result["siteName"]:
        host = urlparse(url).hostname or ""
        if host.startswith("www."):
            host = host[4:]
        result["siteName"] = host or None

    return result