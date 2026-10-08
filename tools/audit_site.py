#!/usr/bin/env python3
"""Read-only static QA for the dependency-free Once Again website.

Writes only output/site-qa/static-audit.json. Network availability, layout,
interactions, payment-app scanning, and actual payment are browser/manual checks.
Use --check-js to ask Node to check JavaScript syntax without executing it.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
from urllib.parse import unquote, urlsplit


MAIN_PAGES = ("index.html", "jieshao.html", "ztdh.html", "scene1.html")
SITE_HOST = "zxwusheng.github.io"
VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
PAYMENT_BASELINE = {
    "alipay.png": {
        "channel": "支付宝",
        "bytes": 479872,
        "dimensions": [1080, 1680],
        "base64_characters": 639832,
        "sha256": "3f73ea9670837c05015b1511050aa2c39f2e6c1bdc1b33d3b806896930061554",
    },
    "wechat.png": {
        "channel": "微信支付",
        "bytes": 203033,
        "dimensions": [1263, 1719],
        "base64_characters": 270712,
        "sha256": "150fd17f9a7d83628d53f9bbaed95cf67f31f175fc4b096b13ef962f9e3e38f5",
    },
}
LEGACY_SCRIPT_IDS = {"logo-lightbox-script", "mc-item-source-fallback"}
CSS_URL_PATTERN = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)
CSS_IMPORT_PATTERN = re.compile(r"@import\s+(['\"])(.*?)\1", re.I)


def normalized_text(value: str) -> str:
    return " ".join(value.split())


class PageParser(HTMLParser):
    def __init__(self, path: Path, root: Path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.root = root
        self.name = path.relative_to(root).as_posix()
        self.source = path.read_text(encoding="utf-8-sig")
        self.ids: dict[str, list[int]] = {}
        self.anchor_names: set[str] = set()
        self.references: list[dict] = []
        self.elements: list[dict] = []
        self.metadata: dict[str, list[str]] = {}
        self.canonical: list[str] = []
        self.navs: list[dict] = []
        self.footers: list[dict] = []
        self.inline_scripts: list[dict] = []
        self.inline_styles: list[dict] = []
        self.title = ""
        self.stack: list[dict] = []
        self.feed(self.source)
        self.close()

    def handle_starttag(self, tag, attrs):
        attr = {key: value or "" for key, value in attrs}
        line = self.getpos()[0]
        element = {"tag": tag, "attrs": attr, "line": line, "text": ""}
        self.elements.append(element)
        if attr.get("id"):
            self.ids.setdefault(attr["id"], []).append(line)
        if tag == "a" and attr.get("name"):
            self.anchor_names.add(attr["name"])
        for attribute in ("href", "src", "poster", "data-preview-src"):
            if attribute in attr:
                self.references.append({"tag": tag, "attribute": attribute,
                                        "url": attr[attribute], "line": line})
        if tag == "meta":
            name = attr.get("name", attr.get("property", "")).lower()
            if name:
                self.metadata.setdefault(name, []).append(attr.get("content", ""))
            if name == "og:image":
                self.references.append({"tag": "meta", "attribute": "og:image",
                                        "url": attr.get("content", ""), "line": line})
        if tag == "link" and "canonical" in attr.get("rel", "").split():
            self.canonical.append(attr.get("href", ""))
        if tag == "nav":
            element["links"] = []
            self.navs.append(element)
        if tag == "footer":
            element["links"] = []
            self.footers.append(element)
        if tag == "a":
            for ancestor in self.stack:
                if ancestor["tag"] in ("nav", "footer"):
                    ancestor["links"].append(element)
        if tag == "script" and not attr.get("src"):
            self.inline_scripts.append(element)
        if tag == "style":
            self.inline_styles.append(element)
        if tag not in VOID_ELEMENTS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        for ancestor in self.stack:
            if ancestor["tag"] in ("nav", "footer", "a", "script", "style", "title"):
                ancestor["text"] += data
        if any(element["tag"] == "title" for element in self.stack):
            self.title += data

    @property
    def primary_nav(self):
        return next((nav for nav in self.navs if nav["attrs"].get("id") == "navLinks"),
                    self.navs[0] if self.navs else None)


def resolve_reference(root: Path, origin: Path, url: str):
    """Resolve local URLs after removing queries and decoding percent escapes."""
    parts = urlsplit(url.strip())
    if parts.scheme in ("data", "mailto", "tel", "blob", "about"):
        return None, "non-file", ""
    if parts.scheme == "javascript":
        return None, "javascript", ""
    if parts.netloc and parts.hostname and parts.hostname.lower() != SITE_HOST:
        return None, "external", ""
    if parts.scheme and parts.scheme not in ("http", "https", "file"):
        return None, "unsupported-scheme", ""
    raw_path = unquote(parts.path)
    fragment = unquote(parts.fragment)
    if not raw_path:
        return origin.resolve(), "local", fragment
    if raw_path.startswith("/") or parts.netloc:
        target = root / raw_path.lstrip("/")
    else:
        target = origin.parent / raw_path
    if raw_path.endswith("/"):
        target /= "index.html"
    target = target.resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return target, "outside-root", fragment
    return target, "local", fragment


def extract_css_references(css: str):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    urls = [match.group(2).strip() for match in CSS_URL_PATTERN.finditer(css)]
    urls += [match.group(2).strip() for match in CSS_IMPORT_PATTERN.finditer(css)]
    return [url for url in urls if url and not url.startswith(("#", "var("))]


def audit(root: Path, check_js: bool, node: str | None):
    issues: list[dict] = []
    page_cache: dict[Path, PageParser] = {}
    external_urls: set[str] = set()
    reference_results: list[dict] = []
    css_files: set[Path] = set()
    js_files: set[Path] = set()
    resource_scopes: dict[Path, set[str]] = {}

    def add(scope, file, code, message, line=None, level="error"):
        item = {"scope": scope, "file": file, "level": level,
                "code": code, "message": message}
        if line is not None:
            item["line"] = line
        issues.append(item)

    def parse(path):
        path = path.resolve()
        if path not in page_cache:
            page_cache[path] = PageParser(path, root)
        return page_cache[path]

    root_html = sorted(root.glob("*.html"))
    for name in MAIN_PAGES:
        if not (root / name).is_file():
            add("main", name, "missing-page", "Required main page is missing.")
    pages = [parse(path) for path in root_html]

    def check_reference(origin, reference, scope):
        url = reference["url"]
        line = reference.get("line")
        file_name = origin.relative_to(root).as_posix()
        try:
            target, kind, fragment = resolve_reference(root, origin, url)
        except ValueError as error:
            add(scope, file_name, "invalid-url", str(error), line)
            return
        display_reference = dict(reference)
        if url.startswith("data:"):
            display_reference["url"] = url.partition(",")[0] + ",<omitted>"
            display_reference["encoded_characters"] = len(url)
        result = {"source": file_name, "scope": scope, **display_reference, "kind": kind}
        if kind == "external":
            external_urls.add(url)
        elif kind == "javascript":
            add(scope, file_name, "javascript-url", "Inline executable URL: " + url, line)
        elif kind == "outside-root":
            add(scope, file_name, "outside-root", "Reference leaves the site root: " + url, line)
        elif kind == "local":
            result["target"] = target.relative_to(root).as_posix()
            result["exists"] = target.is_file()
            if reference.get("attribute") == "href" and url.strip() == "#":
                add(scope, file_name, "placeholder-href", "href=\"#\" has no usable target.", line)
            if not url.strip():
                add(scope, file_name, "empty-reference", "Empty " + reference["attribute"], line)
            if not target.is_file():
                add(scope, file_name, "missing-resource", "Missing local target: " + url, line)
            else:
                if target.suffix.lower() == ".css":
                    css_files.add(target)
                    resource_scopes.setdefault(target, set()).add(scope)
                if target.suffix.lower() == ".js":
                    js_files.add(target)
                    resource_scopes.setdefault(target, set()).add(scope)
                if fragment and target.suffix.lower() in (".html", ".htm"):
                    destination = parse(target)
                    exists = fragment in destination.ids or fragment in destination.anchor_names
                    result["anchor_exists"] = exists
                    if not exists:
                        add(scope, file_name, "missing-anchor", "Missing anchor: " + url, line)
        reference_results.append(result)

    for page in pages:
        scope = "main" if page.name in MAIN_PAGES else "inactive"
        for name, lines in page.ids.items():
            if len(lines) > 1:
                add(scope, page.name, "duplicate-id", f"Duplicate ID {name!r}: lines {lines}.", lines[0])
        for reference in page.references:
            check_reference(page.path, reference, scope)
        for element in page.elements:
            attrs = element["attrs"]
            for controlled_id in attrs.get("aria-controls", "").split():
                if controlled_id not in page.ids:
                    add(scope, page.name, "missing-aria-target", "aria-controls target missing: " + controlled_id,
                        element["line"])
            inline_handlers = [key for key in attrs if key.startswith("on") and len(key) > 2]
            if inline_handlers:
                add(scope, page.name, "inline-event-handler", "Review inline event handler(s): " + ", ".join(inline_handlers),
                    element["line"], "warning")
        for script in page.inline_scripts:
            script_id = script["attrs"].get("id", "")
            source = script["text"]
            legacy = script_id in LEGACY_SCRIPT_IDS
            legacy |= "menuButton" in source and "addEventListener" in source
            legacy |= "website-theme" in source and "localStorage" in source
            legacy |= "teamEdgeDock" in source and "getElementById" in source
            if legacy:
                add(scope, page.name, "legacy-initializer", "Old shared behavior remains in an inline script: " + (script_id or "unnamed"),
                    script["line"])
        for style in page.inline_styles:
            for url in extract_css_references(style["text"]):
                check_reference(page.path, {"tag": "style", "attribute": "css-url", "url": url,
                                             "line": style["line"]}, scope)
        for element in page.elements:
            for url in extract_css_references(element["attrs"].get("style", "")):
                check_reference(page.path, {"tag": element["tag"], "attribute": "style-url", "url": url,
                                             "line": element["line"]}, scope)
        if scope != "main":
            continue
        for name in ("description", "og:title", "og:description", "og:type", "og:url", "og:image"):
            values = page.metadata.get(name, [])
            if len(values) != 1 or not values[0].strip():
                add(scope, page.name, "missing-or-duplicate-meta", f"Expected one nonempty {name} meta tag.")
        if len(page.canonical) != 1:
            add(scope, page.name, "canonical-count", "Expected exactly one canonical URL.")
        else:
            canonical = page.canonical[0]
            parts = urlsplit(canonical)
            valid_paths = ("/", "/index.html") if page.name == "index.html" else ("/" + page.name,)
            if parts.scheme != "https" or (parts.hostname or "").lower() != SITE_HOST or unquote(parts.path) not in valid_paths:
                add(scope, page.name, "canonical-target", "Canonical must identify this page on the published HTTPS site.")
            if page.metadata.get("og:url", [""])[0].rstrip("/") != canonical.rstrip("/"):
                add(scope, page.name, "og-url-mismatch", "og:url differs from canonical.")
        if not normalized_text(page.title):
            add(scope, page.name, "missing-title", "Page title is missing.")
        if not page.primary_nav:
            add(scope, page.name, "missing-navigation", "Primary navigation is missing.")
        menu = next((element for element in page.elements if element["attrs"].get("id") == "menuButton"), None)
        if not menu or menu["attrs"].get("aria-controls") != "navLinks" or menu["attrs"].get("aria-expanded") not in ("true", "false"):
            add(scope, page.name, "menu-aria", "Menu button needs aria-controls=navLinks and aria-expanded.")
        if len(page.footers) != 1:
            add(scope, page.name, "footer-count", "Expected one shared footer.")

    visited_css: set[Path] = set()
    while css_files - visited_css:
        css_path = sorted(css_files - visited_css)[0]
        visited_css.add(css_path)
        css_scope = "main" if "main" in resource_scopes.get(css_path, set()) else "inactive"
        for url in extract_css_references(css_path.read_text(encoding="utf-8-sig")):
            check_reference(css_path, {"tag": "css", "attribute": "css-url", "url": url}, css_scope)

    main_parsers = {page.name: page for page in pages if page.name in MAIN_PAGES}
    homepage = main_parsers.get("index.html")
    if homepage:
        baseline_nav = [(link["attrs"].get("href", ""), normalized_text(link["text"]))
                        for link in (homepage.primary_nav or {}).get("links", [])]
        baseline_footer = normalized_text(homepage.footers[0]["text"]) if homepage.footers else ""
        baseline_footer_links = [(link["attrs"].get("href", ""), normalized_text(link["text"]))
                                 for link in homepage.footers[0]["links"]] if homepage.footers else []
        for name, page in main_parsers.items():
            nav = [(link["attrs"].get("href", ""), normalized_text(link["text"]))
                   for link in (page.primary_nav or {}).get("links", [])]
            if nav != baseline_nav:
                add("main", name, "navigation-mismatch", "Navigation destinations/order/text differ from index.html.")
            footer = normalized_text(page.footers[0]["text"]) if page.footers else ""
            footer_links = [(link["attrs"].get("href", ""), normalized_text(link["text"]))
                            for link in page.footers[0]["links"]] if page.footers else []
            if footer != baseline_footer or footer_links != baseline_footer_links:
                add("main", name, "footer-mismatch", "Footer text or destinations differ from index.html.")

    payment_results = []
    for name, baseline in PAYMENT_BASELINE.items():
        path = root / "assets" / "payments" / name
        record = {"file": path.relative_to(root).as_posix(), "baseline": baseline,
                  "baseline_source": "Decoded existing scene1.html Base64 PNG captured before extraction"}
        if not path.is_file():
            add("main", record["file"], "missing-payment-image", "Original payment PNG is missing.")
        else:
            data = path.read_bytes()
            actual_hash = hashlib.sha256(data).hexdigest()
            dimensions = list(struct.unpack(">II", data[16:24])) if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24 else None
            record.update({"bytes": len(data), "sha256": actual_hash, "dimensions": dimensions,
                           "original_bytes_preserved": actual_hash == baseline["sha256"]})
            if actual_hash != baseline["sha256"] or len(data) != baseline["bytes"] or dimensions != baseline["dimensions"]:
                add("main", record["file"], "payment-baseline-mismatch", "PNG differs from the original embedded payment artwork.")
        payment_results.append(record)
    sponsor = main_parsers.get("scene1.html")
    if sponsor:
        if "data:image/" in sponsor.source and ";base64," in sponsor.source:
            add("main", sponsor.name, "embedded-payment-image", "Base64 image remains in the sponsor HTML.")
        preview_buttons = [element for element in sponsor.elements if element["tag"] == "button" and "data-image-preview" in element["attrs"]]
        expected_previews = {"assets/payments/" + name for name in PAYMENT_BASELINE}
        actual_previews = {element["attrs"].get("data-preview-src", "") for element in preview_buttons}
        if len(preview_buttons) != 2 or actual_previews != expected_previews:
            add("main", sponsor.name, "payment-preview-controls", "Expected one original-image preview button per payment channel.")

    javascript_checks = {"requested": check_js, "status": "not-run", "results": []}
    if check_js:
        node_path = node or shutil.which("node")
        if not node_path:
            javascript_checks["status"] = "unavailable"
            add("main", "JavaScript", "node-unavailable", "Node syntax checks were requested but Node was unavailable.")
        else:
            def check_node(label, scope, source=None, path=None, module=False):
                command = [node_path, "--check"]
                if source is not None:
                    if module:
                        command.append("--input-type=module")
                    command.append("-")
                else:
                    command.append(str(path))
                try:
                    result = subprocess.run(command, input=source, text=True, encoding="utf-8",
                                            capture_output=True, cwd=root, timeout=30, check=False)
                    item = {"source": label, "scope": scope, "passed": result.returncode == 0,
                            "exit_code": result.returncode}
                    if result.returncode:
                        item["diagnostic"] = (result.stderr or result.stdout).strip()
                        add(scope, label, "javascript-syntax", item["diagnostic"])
                except (OSError, subprocess.TimeoutExpired) as error:
                    item = {"source": label, "scope": scope, "passed": False, "diagnostic": str(error)}
                    add(scope, label, "javascript-check-unavailable", str(error))
                javascript_checks["results"].append(item)

            for js_path in sorted(js_files):
                js_scope = "main" if "main" in resource_scopes.get(js_path, set()) else "inactive"
                check_node(js_path.relative_to(root).as_posix(), js_scope, path=js_path)
            for page in pages:
                page_scope = "main" if page.name in MAIN_PAGES else "inactive"
                for script in page.inline_scripts:
                    script_type = script["attrs"].get("type", "").lower()
                    if script_type not in ("", "text/javascript", "application/javascript", "module"):
                        continue
                    check_node(f"{page.name}:inline:{script['line']}", page_scope,
                               source=script["text"], module=script_type == "module")
            javascript_checks["status"] = "passed" if all(item["passed"] for item in javascript_checks["results"] if item["scope"] == "main") else "failed"

    resource_sizes = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if path.is_file() and path.suffix.lower() in (".css", ".js") and not any(
                part.startswith(".") or part in ("node_modules", "tmp", "output") for part in relative.parts):
            resource_sizes.append({"file": relative.as_posix(), "bytes": path.stat().st_size})
    page_results = []
    for page in pages:
        nav = page.primary_nav
        page_results.append({
            "file": page.name, "scope": "main" if page.name in MAIN_PAGES else "inactive",
            "bytes": page.path.stat().st_size, "title": normalized_text(page.title),
            "id_count": len(page.ids), "reference_count": len(page.references),
            "inline_script_count": len(page.inline_scripts), "metadata": page.metadata,
            "canonical": page.canonical,
            "navigation": [{"href": link["attrs"].get("href", ""), "text": normalized_text(link["text"])}
                           for link in (nav or {}).get("links", [])],
            "footer_text": [normalized_text(footer["text"]) for footer in page.footers],
        })
    main_errors = sum(item["scope"] == "main" and item["level"] == "error" for item in issues)
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "root": str(root), "main_pages": list(MAIN_PAGES),
        "summary": {"passed": main_errors == 0, "main_errors": main_errors,
                    "main_warnings": sum(item["scope"] == "main" and item["level"] == "warning" for item in issues),
                    "inactive_issues": sum(item["scope"] == "inactive" for item in issues),
                    "local_references_checked": sum(item["kind"] == "local" for item in reference_results)},
        "pages": page_results, "issues": issues, "references": reference_results,
        "external_urls": {"status": "not-network-tested", "urls": sorted(external_urls)},
        "payment_artwork": payment_results, "resource_sizes": resource_sizes,
        "javascript_syntax": javascript_checks,
        "limits": ["Static inspection does not verify browser layout or runtime interactions.",
                   "External URLs are inventoried; this script does not send network requests.",
                   "Matching payment hashes verifies preserved pixels, not payment-app scanning or payment.",
                   "Inactive root variants are reported separately and do not fail the live-page audit."],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--check-js", action="store_true", help="Check external and inline JavaScript syntax with Node.")
    parser.add_argument("--node", help="Node executable path; otherwise use the PATH executable.")
    args = parser.parse_args()
    root = args.root.resolve()
    report = audit(root, args.check_js, args.node)
    output = root / "output" / "site-qa" / "static-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(output), **report["summary"],
                      "javascript_syntax": report["javascript_syntax"]["status"]}, ensure_ascii=False))
    return 0 if report["summary"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
