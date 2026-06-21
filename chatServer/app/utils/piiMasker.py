"""
piiMasker.py
============
Standalone PII masking utility for the RAG pipeline.

Responsibilities
----------------
- Detect and replace PII in text before embedding/storing in vector DB
- Replace PII with typed placeholders: [EMAIL], [PHONE], [SSN], etc.
- Preserve document structure and meaning — only values are masked
- Zero external dependencies — pure Python + stdlib re

Design principles
-----------------
- Stateless — every call is independent
- Import freely from any service
- Ordered by specificity: more specific patterns run before general ones
  (e.g. SSN before generic number, email before URL)
- All patterns compiled once at module load for performance

Usage
-----
    from app.utils.piiMasker import PIIMasker

    masked_text = PIIMasker.mask(text)

    # With audit log (returns what was found)
    masked_text, findings = PIIMasker.mask_with_report(text)
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from typing import List, Tuple

logger = logging.getLogger(__name__)


# ── PII Finding (for audit/reporting) ────────────────────────────────────────

@dataclass
class PIIFinding:
    """Represents a single detected PII item."""
    pii_type:    str   # e.g. "EMAIL", "PHONE", "SSN"
    placeholder: str   # e.g. "[EMAIL]"
    count:       int   # how many times this type was found


# ── Pattern definitions ───────────────────────────────────────────────────────

@dataclass
class _PIIPattern:
    name:        str           # Label used in placeholder e.g. "EMAIL"
    pattern:     re.Pattern    # compiled regex
    placeholder: str           # replacement token


def _p(name: str, regex: str, flags: int = re.IGNORECASE) -> _PIIPattern:
    """Helper — compile and wrap a pattern."""
    return _PIIPattern(
        name=name,
        pattern=re.compile(regex, flags),
        placeholder=f"[{name}]",
    )


# Order matters — more specific patterns FIRST
_PATTERNS: List[_PIIPattern] = [

    # ── Financial identifiers ─────────────────────────────────────────────────

    # Credit / debit card numbers (Visa, MC, Amex, Discover)
    # Matches with spaces, dashes, or no separator
    _p("CARD_NUMBER",
       r"\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))"
       r"(?:[- ]?[0-9]{4}){3}\b"),

    # IBAN — international bank account (up to 34 chars)
    _p("IBAN",
       r"\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]{0,16})\b"),

    # Indian bank account numbers (9–18 digits)
    _p("BANK_ACCOUNT",
       r"\b(?:account\s*(?:no|number|#)?[:\s]*)?[0-9]{9,18}\b",
       re.IGNORECASE),

    # SWIFT / BIC code
    _p("SWIFT_BIC",
       r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b"),

    # ── Government / national IDs ─────────────────────────────────────────────

    # US Social Security Number
    _p("SSN",
       r"\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b"),

    # Indian Aadhaar (12 digits, may be space-separated in groups of 4)
    _p("AADHAAR",
       r"\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b"),

    # Indian PAN card (alphanumeric 10-char)
    _p("PAN",
       r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"),

    # Passport number — generic (letter(s) + 6-9 digits)
    _p("PASSPORT",
       r"\b[A-Z]{1,2}[0-9]{6,9}\b"),

    # US Driver license (varies by state — broad catch)
    _p("DRIVERS_LICENSE",
       r"\b[A-Z]{1,2}[0-9]{5,9}\b"),

    # ── Contact information ───────────────────────────────────────────────────

    # Email address
    _p("EMAIL",
       r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),

    # Phone numbers — international and local formats
    # Covers: +91-9876543210, (123) 456-7890, 123.456.7890, +1 800 555 1234
    _p("PHONE",
       r"\b(?:\+?[0-9]{1,3}[\s\-.])?(?:\(?[0-9]{2,4}\)?[\s\-.])?[0-9]{3,4}[\s\-.]?[0-9]{4}\b"),

    # ── Location / address ────────────────────────────────────────────────────

    # US ZIP code (5 digit or ZIP+4)
    _p("ZIP_CODE",
       r"\b[0-9]{5}(?:-[0-9]{4})?\b"),

    # Indian PIN code (6 digits starting 1-8)
    _p("PIN_CODE",
       r"\b[1-8][0-9]{5}\b"),

    # Street address patterns — "123 Main Street", "B-204, Sector 5"
    _p("ADDRESS",
       r"\b\d{1,5}[,\s]+(?:[A-Za-z0-9\s,\-\.]+)?(?:street|st|avenue|ave|road|rd|"
       r"lane|ln|drive|dr|court|ct|boulevard|blvd|sector|nagar|colony|layout|"
       r"apartment|apt|flat|house|floor|building|block)\b",
       re.IGNORECASE),

    # ── Network / digital ─────────────────────────────────────────────────────

    # IPv4 address
    _p("IP_ADDRESS",
       r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}"
       r"(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b"),

    # MAC address
    _p("MAC_ADDRESS",
       r"\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b"),
]


# ── Masker ────────────────────────────────────────────────────────────────────

class PIIMasker:
    """
    Masks PII in text by replacing detected values with typed placeholders.

    All methods are class methods — no instantiation needed.

    Examples
    --------
    >>> PIIMasker.mask("Contact john@example.com or call +91-9876543210")
    'Contact [EMAIL] or call [PHONE]'

    >>> text, findings = PIIMasker.mask_with_report("SSN: 123-45-6789")
    >>> findings[0].pii_type
    'SSN'
    """

    @classmethod
    def mask(cls, text: str) -> str:
        """
        Replace all detected PII in text with placeholders.

        Parameters
        ----------
        text : str
            Raw text (from OCR, PDF extraction, CSV row, etc.)

        Returns
        -------
        str
            Text with PII replaced. Structure and non-PII content preserved.
        """
        if not text or not text.strip():
            return text

        masked, _ = cls._apply_patterns(text)
        return masked

    @classmethod
    def mask_with_report(cls, text: str) -> Tuple[str, List[PIIFinding]]:
        """
        Same as mask() but also returns a list of PIIFinding objects
        describing what was detected.

        Returns
        -------
        (masked_text, findings)
        findings is empty list if nothing was detected.
        """
        if not text or not text.strip():
            return text, []

        return cls._apply_patterns(text)

    @classmethod
    def mask_chunks(cls, texts: List[str]) -> List[str]:
        """
        Mask a list of text chunks (e.g. all chunks from one document).
        Returns a new list — originals are not modified.
        """
        return [cls.mask(t) for t in texts]

    @classmethod
    def has_pii(cls, text: str) -> bool:
        """
        Quick check — returns True if any PII pattern matches.
        Useful for logging/audit without full masking.
        """
        for p in _PATTERNS:
            if p.pattern.search(text):
                return True
        return False

    # ── Internal ──────────────────────────────────────────────────────────────

    @classmethod
    def _apply_patterns(cls, text: str) -> Tuple[str, List[PIIFinding]]:
        """Apply all patterns in order, collect findings."""
        findings: List[PIIFinding] = []
        masked = text

        for p in _PATTERNS:
            matches = p.pattern.findall(masked)
            if matches:
                count = len(matches)
                masked = p.pattern.sub(p.placeholder, masked)
                findings.append(PIIFinding(
                    pii_type=p.name,
                    placeholder=p.placeholder,
                    count=count,
                ))
                logger.debug("PII masked: %s × %d", p.name, count)

        if findings:
            total = sum(f.count for f in findings)
            types  = ", ".join(f"{f.pii_type}×{f.count}" for f in findings)
            logger.info("🔒 PII masked — %d item(s): %s", total, types)

        return masked, findings