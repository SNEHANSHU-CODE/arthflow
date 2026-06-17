"""
router.py
Single entry point for all import routes.

Registers:
  POST /api/import/pdf    -> pdf_parser
  POST /api/import/csv    -> csv_parser
  POST /api/import/excel  -> excel_parser
"""

import logging
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.concurrency import run_in_threadpool

from .shared.schemas import ImportResponse
from .parsers.pdf_parser   import parse_pdf, PDFPasswordError
from .parsers.csv_parser   import parse_csv
from .parsers.excel_parser import parse_excel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["Import"])

_PDF_MIME   = {"application/pdf"}
_CSV_MIME   = {"text/csv", "text/plain", "application/csv", "application/octet-stream"}
_EXCEL_MIME = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
}


def _validate_extension(filename: str, allowed: set[str]) -> None:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '.{ext}'. Allowed: {sorted(allowed)}"
        )


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

@router.post("/pdf", response_model=ImportResponse, summary="Import transactions from PDF")
async def import_pdf(
    file:     UploadFile      = File(...),
    password: Optional[str]  = Form(None),   # optional password for encrypted PDFs
):
    _validate_extension(file.filename or "", {"pdf"})

    try:
        pdf_bytes    = await file.read()
        transactions = await run_in_threadpool(parse_pdf, pdf_bytes, password=password or None)

    except PDFPasswordError as e:
        # Return structured response — frontend checks needs_password flag
        return ImportResponse(
            success=False,
            count=0,
            transactions=[],
            message=str(e),
            needs_password=True,
        )
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except ValueError as e:
        return ImportResponse(success=False, count=0, transactions=[], message=str(e))
    except Exception as e:
        logger.error("PDF import error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {e}")

    if not transactions:
        return ImportResponse(
            success=False, count=0, transactions=[],
            message="No transactions found. The PDF format may not be supported."
        )

    return ImportResponse(
        success=True,
        count=len(transactions),
        transactions=transactions,
        message=f"Extracted {len(transactions)} transactions.",
    )


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

@router.post("/csv", response_model=ImportResponse, summary="Import transactions from CSV")
async def import_csv(file: UploadFile = File(...)):
    _validate_extension(file.filename or "", {"csv"})

    try:
        csv_bytes    = await file.read()
        transactions = await run_in_threadpool(parse_csv, csv_bytes)
    except ValueError as e:
        return ImportResponse(success=False, count=0, transactions=[], message=str(e))
    except Exception as e:
        logger.error("CSV import error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to process CSV: {e}")

    if not transactions:
        return ImportResponse(
            success=False, count=0, transactions=[],
            message="No transactions found in CSV."
        )

    return ImportResponse(
        success=True,
        count=len(transactions),
        transactions=transactions,
        message=f"Extracted {len(transactions)} transactions.",
    )


# ---------------------------------------------------------------------------
# Excel
# ---------------------------------------------------------------------------

@router.post("/excel", response_model=ImportResponse, summary="Import transactions from Excel")
async def import_excel(file: UploadFile = File(...)):
    _validate_extension(file.filename or "", {"xlsx", "xls"})

    try:
        excel_bytes  = await file.read()
        transactions = await run_in_threadpool(parse_excel, excel_bytes)
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except ValueError as e:
        return ImportResponse(success=False, count=0, transactions=[], message=str(e))
    except Exception as e:
        logger.error("Excel import error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to process Excel: {e}")

    if not transactions:
        return ImportResponse(
            success=False, count=0, transactions=[],
            message="No transactions found in Excel file."
        )

    return ImportResponse(
        success=True,
        count=len(transactions),
        transactions=transactions,
        message=f"Extracted {len(transactions)} transactions.",
    )