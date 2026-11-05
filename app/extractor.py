"""从 URL 提取结构化元数据。"""

from urllib.parse import urlparse
import random
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import trafilatura
from bs4 import BeautifulSoup


_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]


def _get(obj, *names):
    for name in names:
        val = getattr(obj, name, None)
        if val:
            return val
    return None


def _from_meta_tags(soup: BeautifulSoup, result: dict) -> None:
    if not result["siteName"]:
        for prop in ("og:site_name", "application-name"):
            tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
            if tag and tag.get("content"):
                result["siteName"] = tag["content"].strip()
                break

    if not result["author"]:
        for attrs in ({"name": "author"}, {"name": "citation_author"}, {"property": "article:author"}):
            tag = soup.find("meta", attrs=attrs)
            if tag and tag.get("content"):
                result["author"] = tag["content"].strip()
                break

    if not result["date"]:
        for attrs in ({"property": "article:published_time"}, {"name": "citation_publication_date"}):
            tag = soup.find("meta", attrs=attrs)
            if tag and tag.get("content"):
                result["date"] = tag["content"].strip()
                break

    if not result["publisher"]:
        for attrs in ({"property": "article:publisher"}, {"name": "citation_publisher"}):
            tag = soup.find("meta", attrs=attrs)
            if tag and tag.get("content"):
                result["publisher"] = tag["content"].strip()
                break

    if not result["title"]:
        if soup.title and soup.title.string:
            result["title"] = soup.title.string.strip()
        else:
            tag = soup.find("meta", property="og:title")
            if tag and tag.get("content"):
                result["title"] = tag["content"].strip()


def extract_metadata_from_url(url: str) -> dict:
    result = {
        "url": url,
        "author": None,
        "title": None,
        "siteName": None,
        "publisher": None,
        "date": None,
        "error": None,
    }

    # 1. 使用带重试机制的 Session 下载网页
    html = None
    try:
        session = requests.Session()
        # 配置自动重试：总共重试 2 次，遇到 500/502/503/504 自动重试
        retries = Retry(total=2, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
        session.mount("http://", HTTPAdapter(max_retries=retries))
        session.mount("https://", HTTPAdapter(max_retries=retries))

        headers = {
            "User-Agent": random.choice(_USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        # 将超时时间从 15s 提高到 30s，应对国外网站或慢速网络
        resp = session.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        html = resp.text
    except requests.exceptions.Timeout:
        result["error"] = "Request timed out. The site is taking too long to respond."
        return result
    except Exception as exc:
        result["error"] = f"Download failed: {exc}"
        return result

    # 2. Trafilatura 提取
    try:
        meta = trafilatura.extract_metadata(html)
        if meta:
            result["title"] = _get(meta, "title")
            result["author"] = _get(meta, "author")
            result["date"] = _get(meta, "date")
            result["siteName"] = _get(meta, "sitename", "site_name")
    except Exception:
        pass

    # 3. BeautifulSoup 补齐
    try:
        soup = BeautifulSoup(html, "html.parser")
        _from_meta_tags(soup, result)
    except Exception:
        pass

    # 4. 兜底
    if not result["siteName"]:
        host = urlparse(url).hostname or ""
        if host.startswith("www."):
            host = host[4:]
        result["siteName"] = host or None

    return result