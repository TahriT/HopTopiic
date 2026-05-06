"""Parse SRT and VTT caption files into transcript segments."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class CaptionSegment:
    text: str
    start: float  # seconds
    end: float    # seconds


def parse_srt(content: str) -> list[CaptionSegment]:
    """Parse SubRip (.srt) caption file content."""
    segments: list[CaptionSegment] = []
    blocks = re.split(r"\n\s*\n", content.strip())

    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 2:
            continue

        # Find the timestamp line
        ts_line = None
        text_lines: list[str] = []
        for i, line in enumerate(lines):
            if "-->" in line:
                ts_line = line
                text_lines = lines[i + 1:]
                break

        if not ts_line:
            continue

        match = re.match(
            r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})",
            ts_line.strip(),
        )
        if not match:
            continue

        g = match.groups()
        start = int(g[0]) * 3600 + int(g[1]) * 60 + int(g[2]) + int(g[3]) / 1000
        end = int(g[4]) * 3600 + int(g[5]) * 60 + int(g[6]) + int(g[7]) / 1000

        text = " ".join(line.strip() for line in text_lines if line.strip())
        # Strip HTML tags (common in SRT)
        text = re.sub(r"<[^>]+>", "", text)

        if text:
            segments.append(CaptionSegment(text=text, start=start, end=end))

    return segments


def parse_vtt(content: str) -> list[CaptionSegment]:
    """Parse WebVTT (.vtt) caption file content."""
    segments: list[CaptionSegment] = []

    # Remove WEBVTT header and any metadata
    content = re.sub(r"^WEBVTT[^\n]*\n", "", content.strip())
    content = re.sub(r"^NOTE[^\n]*\n(?:[^\n]+\n)*\n", "", content, flags=re.MULTILINE)

    blocks = re.split(r"\n\s*\n", content.strip())

    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 2:
            continue

        ts_line = None
        text_lines: list[str] = []
        for i, line in enumerate(lines):
            if "-->" in line:
                ts_line = line
                text_lines = lines[i + 1:]
                break

        if not ts_line:
            continue

        # VTT allows HH:MM:SS.mmm or MM:SS.mmm
        match = re.match(
            r"(?:(\d{1,2}):)?(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.](\d{3})",
            ts_line.strip(),
        )
        if not match:
            continue

        g = match.groups()
        start = (int(g[0] or 0)) * 3600 + int(g[1]) * 60 + int(g[2]) + int(g[3]) / 1000
        end = (int(g[4] or 0)) * 3600 + int(g[5]) * 60 + int(g[6]) + int(g[7]) / 1000

        text = " ".join(line.strip() for line in text_lines if line.strip())
        text = re.sub(r"<[^>]+>", "", text)

        if text:
            segments.append(CaptionSegment(text=text, start=start, end=end))

    return segments


def parse_captions(content: str, filename: str = "") -> list[CaptionSegment]:
    """Auto-detect format and parse captions."""
    lower = filename.lower()
    if lower.endswith(".vtt") or content.strip().startswith("WEBVTT"):
        return parse_vtt(content)
    return parse_srt(content)
