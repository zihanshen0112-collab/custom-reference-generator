"""从用户粘贴的 citation 文本（来自其他生成器）中解析出结构化字段。

启发式解析，无外部依赖。目标是从一段自由格式的引用字符串中
尽量提取出 author / title / siteName / date / url 五个字段，
供用户合并到主元数据面板以补全爬取失败的信息。

支持的常见格式（非穷举）：
- MLA:     Last, First. "Title." Site Name, Publisher, Date, URL.
- APA:     Last, F. (Year, Month Day). Title. Site Name. URL
- Chicago: Last, First. "Title." Site Name. Accessed Date. URL.
"""

import re
from urllib.parse import urlparse


def _clean(text: str) -> str:
    """去除 HTML 标签与实体，压缩空白。"""
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    text = re.sub(r"\s+", " ", text).strip()
    return text


# 日期候选模式，按精度从高到低排列
_DATE_PATTERNS = [
    r"\b(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|"
    r"September|October|November|December)\s+\d{4}\b",
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"
    r"\s+\d{1,2},?\s+\d{4}\b",
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\(\d{4}(?:,\s*(?:January|February|March|April|May|June|July|August|"
    r"September|October|November|December)\s+\d{1,2})?\)",
    r"\b\d{4}\b",
]


def _find_url(text: str):
    """返回 (url, start, end) 或 None。"""
    m = re.search(r"https?://[^\s<>\"')\],]+", text)
    if not m:
        return None
    return m.group(0).rstrip(".,;:"), m.start(), m.end()


def _find_date(text: str) -> str | None:
    for pattern in _DATE_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            d = m.group(0).strip()
            if d.startswith("(") and d.endswith(")"):
                d = d[1:-1].strip()
            return d
    return None


def _find_title(text: str) -> str | None:
    """优先取双引号/单引号内最长的片段作为标题。"""
    quoted = re.findall(r"[\u201c\"]([^\u201c\u201d\"]{2,250})[\u201d\"]", text)
    if not quoted:
        quoted = re.findall(r"'([^']{2,250})'", text)
    if not quoted:
        return None
    return max(quoted, key=len).strip()


def _find_title_fallback(text: str, author: str | None, date: str | None) -> str | None:
    """无引号标题时，用句子边界寻找最像标题的片段（处理 APA 等格式）。"""
    segments = re.split(r"(?<=[.!?])\s+", text)
    for seg in segments:
        seg = seg.strip()
        if not seg or len(seg) < 5 or len(seg) > 250:
            continue
        if author and seg == author:
            continue
        if date and date in seg:
            continue
        if re.match(r"^https?://", seg):
            continue
        # 去掉句中残留的括号日期
        candidate = re.sub(r"\(\d{4}[^)]*\)", "", seg).strip()
        candidate = candidate.rstrip(".,;:")
        if candidate and len(candidate) > 5:
            return candidate
    return None


def _find_author(text: str, title: str | None) -> str | None:
    """标题之前的文本视为作者。"""
    if not title:
        # 无标题时，尝试取第一个句子作为作者（若不太长）
        first = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0].strip()
        first = re.sub(r"[.,;:]+$", "", first).strip()
        if first and len(first) < 150:
            return first
        return None

    # 找到第一个引号的位置
    q = re.search(r"[\u201c\"]|'", text)
    if not q:
        return None
    before = text[: q.start()].strip()
    before = re.sub(r"[.,;:]+$", "", before).strip()
    if before and len(before) < 200:
        return before
    return None


def _find_site_name(
    text: str, title: str | None, date: str | None
) -> str | None:
    """标题闭合引号之后、日期/URL 之前的第一段视为站点名。"""
    if not title:
        return None
    # 定位标题（带引号）在文本中的位置
    q = re.search(r"[\u201c\"][^\u201c\u201d\"]+[\u201d\"]", text)
    if not q:
        return None
    after = text[q.end():].strip()
    after = re.sub(r"^[.,;:]+", "", after).strip()
    # 取到下一个逗号或句号之前
    parts = re.split(r"[,.]", after, maxsplit=1)
    if not parts or not parts[0].strip():
        return None
    candidate = parts[0].strip()
    if len(candidate) >= 100:
        return None
    if re.match(r"^\d", candidate):
        return None
    if date and candidate == date:
        return None
    return candidate


def parse_citation_text(text: str) -> dict:
    """解析任意 citation 字符串，返回结构化字段。"""
    result = {
        "author": None,
        "title": None,
        "siteName": None,
        "date": None,
        "url": None,
    }

    if not text or not text.strip():
        return result

    text = _clean(text)

    # ---------- URL ----------
    url_info = _find_url(text)
    if url_info:
        result["url"] = url_info[0]

    # 移除 URL，避免影响其他字段的启发式判断
    work = text
    if url_info:
        _, s, e = url_info
        work = text[:s] + " " + text[e:]
    work = re.sub(r"\s+", " ", work).strip()
    work = re.sub(r"[.,;:]+$", "", work).strip()

    # ---------- 日期 ----------
    result["date"] = _find_date(work)

    # ---------- 标题 ----------
    result["title"] = _find_title(work)

    # ---------- 作者 ----------
    result["author"] = _find_author(work, result["title"])

    # ---------- 站点名 ----------
    result["siteName"] = _find_site_name(work, result["title"], result["date"])

    # ---------- 兜底：标题为空时用句子边界启发式 ----------
    if not result["title"]:
        result["title"] = _find_title_fallback(work, result["author"], result["date"])

    # ---------- 兜底：站点名缺失时用 URL host ----------
    if not result["siteName"] and result["url"]:
        host = urlparse(result["url"]).hostname or ""
        if host.startswith("www."):
            host = host[4:]
        if host:
            result["siteName"] = host.split(".")[0].title()

    return result