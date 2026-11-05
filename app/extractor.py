"""从 URL 提取结构化元数据。"""

import json
import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup

from curl_cffi import requests
import trafilatura


def _get(obj, *names):
    for name in names:
        val = getattr(obj, name, None)
        if val:
            return val
    return None


def _clean_date(date_str: str) -> str:
    """清洗日期格式，去掉 ISO 8601 的时分秒。"""
    if not date_str:
        return date_str
    # 尝试匹配 YYYY-MM-DD
    match = re.search(r"(\d{4}-\d{2}-\d{2})", date_str)
    if match:
        return match.group(1)
    # 尝试匹配 YYYY-MM
    match = re.search(r"(\d{4}-\d{2})", date_str)
    if match:
        return match.group(1)
    # 如果匹配不到，直接返回原字符串（可能已经是 2024年 或 15 Jan 2024）
    return date_str


def _parse_json_ld(soup: BeautifulSoup, result: dict) -> None:
    """解析页面中的 JSON-LD (Schema.org) 数据。"""
    scripts = soup.find_all("script", type="application/ld+json")
    for script in scripts:
        if not script.string:
            continue
        try:
            data = json.loads(script.string)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                
                # 标题（限制长度，防止 Wikipedia 的冗长描述被当作标题）
                if not result["title"] and item.get("headline"):
                    headline = str(item["headline"])
                    if len(headline) < 150: 
                        result["title"] = headline
                elif not result["title"] and item.get("name"):
                    name = str(item["name"])
                    if len(name) < 150:
                        result["title"] = name

                # 作者
                if not result["author"] and item.get("author"):
                    author = item["author"]
                    if isinstance(author, list) and len(author) > 0:
                        result["author"] = str(author[0].get("name", ""))
                    elif isinstance(author, dict):
                        result["author"] = str(author.get("name", ""))
                    elif isinstance(author, str):
                        result["author"] = author

                # 日期
                if not result["date"] and item.get("datePublished"):
                    result["date"] = str(item["datePublished"])

                # 出版商 / 站点名
                if not result["publisher"] and item.get("publisher"):
                    pub = item["publisher"]
                    if isinstance(pub, dict):
                        result["publisher"] = str(pub.get("name", ""))
                    elif isinstance(pub, str):
                        result["publisher"] = pub
                
                if not result["siteName"] and item.get("isPartOf"):
                    part = item["isPartOf"]
                    if isinstance(part, dict) and part.get("name"):
                        result["siteName"] = str(part["name"])
        except Exception:
            pass


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
        "url": url, "author": None, "title": None, "siteName": None, 
        "publisher": None, "date": None, "error": None,
    }

    html = None
    try:
        resp = requests.get(url, impersonate="chrome", timeout=15, allow_redirects=True)
        resp.raise_for_status()
        html = resp.text
    except requests.exceptions.Timeout:
        result["error"] = "Request timed out (15s). The site might be unreachable or blocking access."
        return result
    except requests.exceptions.RequestException as exc:
        result["error"] = f"Network error: {exc}"
        return result
    except Exception as exc:
        result["error"] = f"Download failed: {exc}"
        return result

    if not html:
        result["error"] = "Empty response from server."
        return result

    try:
        soup = BeautifulSoup(html, "html.parser")
        
        # 1. 优先从 JSON-LD 提取
        _parse_json_ld(soup, result)

        # 2. Trafilatura 提取
        meta = trafilatura.extract_metadata(html)
        if meta:
            if not result["title"]: result["title"] = _get(meta, "title")
            if not result["author"]: result["author"] = _get(meta, "author")
            if not result["date"]: result["date"] = _get(meta, "date")
            if not result["siteName"]: result["siteName"] = _get(meta, "sitename", "site_name")

        # 3. 标准 Meta 标签补齐
        _from_meta_tags(soup, result)

    except Exception:
        pass

    # 4. 域名兜底
    if not result["siteName"]:
        host = urlparse(url).hostname or ""
        if host.startswith("www."):
            host = host[4:]
        result["siteName"] = host or None

    # 5. 清洗多余空白，并格式化日期
    for k in result:
        if isinstance(result[k], str):
            result[k] = result[k].strip()
            
    if result["date"]:
        result["date"] = _clean_date(result["date"])

    return result