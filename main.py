"""
Research Paper AI Agent - Backend Service
=========================================
Production-ready FastAPI service that:
1. Queries the official arXiv API (http://export.arxiv.org/api/query)
2. Fetches relevant research papers (title, authors, abstract, PDF link, publication date)
3. Orchestrates Gemini (via the google-genai SDK) to extract:
   - Key methodology
   - Benchmark datasets used
   - Core findings/contributions
   - Identified limitations/research gaps
4. Synthesizes a structured comparative matrix and executive overview

Tech Stack: Python 3.10+, FastAPI, Pydantic v2, google-genai, HTTPX
"""

import os
import sys
import time
import logging
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List, Optional

import io
import httpx
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("arxiv-research-agent")

# ---------------------------------------------------------------------------
# Google GenAI SDK Initialization
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

genai_client = None
try:
    from google import genai
    from google.genai import types

    if GEMINI_API_KEY:
        genai_client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info("google-genai Client successfully initialized with GEMINI_API_KEY.")
    else:
        # Client will attempt to pick up GEMINI_API_KEY or GOOGLE_API_KEY from environment
        try:
            genai_client = genai.Client()
            logger.info("google-genai Client initialized from default environment.")
        except Exception as env_err:
            logger.warning("GEMINI_API_KEY not configured yet: %s", env_err)
except ImportError:
    logger.error("google-genai package not found. Please install with: pip install google-genai")

# ---------------------------------------------------------------------------
# Pydantic Response & Request Models
# ---------------------------------------------------------------------------

class PaperItem(BaseModel):
    arxiv_id: str = Field(description="Unique arXiv identifier or DOI")
    title: str = Field(description="Title of the research paper")
    authors: List[str] = Field(description="List of paper authors")
    abstract: str = Field(description="Full text abstract from arXiv")
    pdf_url: str = Field(description="Direct link to paper PDF")
    arxiv_url: str = Field(description="arXiv landing page URL")
    published_date: str = Field(description="ISO formatted publication date")
    primary_category: Optional[str] = Field(default=None, description="Primary arXiv category e.g., cs.AI, cs.LG")


class PaperAnalysis(BaseModel):
    arxiv_id: str = Field(description="arXiv ID referencing the analyzed paper")
    paper_title: str = Field(description="Title of the analyzed paper")
    key_methodology: str = Field(description="Core technical approach, algorithms, model architectures, or frameworks used")
    benchmark_datasets: List[str] = Field(description="Benchmark datasets, evaluation suites, or empirical testbeds utilized")
    core_findings: List[str] = Field(description="Key experimental results, algorithmic improvements, or theoretical proofs")
    limitations_and_gaps: List[str] = Field(description="Acknowledged drawbacks, computational bottlenecks, or open research gaps")


class ComparativeMatrixRow(BaseModel):
    paper_id: str = Field(description="arXiv ID for cross-reference")
    paper_title: str = Field(description="Clean title of paper")
    authors_short: str = Field(description="Lead author et al. format e.g., 'Vaswani et al.'")
    year: str = Field(description="Publication year e.g., '2024'")
    methodology: str = Field(description="Concise description of the proposed method")
    datasets: str = Field(description="Comma-separated key benchmarks/datasets")
    primary_contribution: str = Field(description="The singular biggest milestone/claim of this work")
    limitations: str = Field(description="Primary limitation or constraint")
    pdf_url: str = Field(description="Direct link to PDF")


class ExecutiveSynthesis(BaseModel):
    query_topic: str = Field(description="Topic investigated")
    overview: str = Field(description="High-level synthesis of recent developments across retrieved papers")
    state_of_the_art: str = Field(description="Current state of the art based on collective findings")
    emergent_trends: List[str] = Field(description="Key recurring patterns, paradigm shifts, or technological trends")
    identified_research_gaps: List[str] = Field(description="Unresolved problems and high-impact avenues for future research")
    practical_takeaway: str = Field(description="Actionable guidance for engineers and researchers building systems today")


class ResearchSynthesisResponse(BaseModel):
    query: str = Field(description="The user's original research topic or search query")
    total_papers_fetched: int = Field(description="Number of papers retrieved from arXiv")
    executive_synthesis: ExecutiveSynthesis = Field(description="Cross-paper synthesis summary")
    comparative_matrix: List[ComparativeMatrixRow] = Field(description="Structured rows for comparative analysis table")
    analyzed_papers: List[PaperAnalysis] = Field(description="Deep technical extractions for each paper")
    paper_list: List[PaperItem] = Field(description="Raw paper metadata with links")
    model_used: str = Field(description="Gemini model employed for agent reasoning")
    execution_time_seconds: float = Field(description="Total latency in seconds")
    timestamp: str = Field(description="ISO-8601 generation timestamp")


class SinglePDFAnalysisResponse(BaseModel):
    paper_title: str = Field(description="Title extracted from the research paper")
    authors: List[str] = Field(description="List of authors extracted from the paper")
    abstract_summary: str = Field(description="Executive summary of the abstract")
    methodology_breakdown: List[str] = Field(description="Step-by-step technical methodology breakdown")
    strengths: List[str] = Field(description="Key strengths and advantages of the proposed approach")
    weaknesses: List[str] = Field(description="Identified limitations, gaps, and evaluation weaknesses")
    bibtex_entries: List[str] = Field(description="One or more ready-to-use BibTeX citation entries")
    page_count: int = Field(description="Total pages extracted from uploaded PDF")
    characters_extracted: int = Field(description="Length of raw text extracted from PDF")
    filename: str = Field(description="Name of the uploaded file")
    model_used: str = Field(default="gemini-3.8-flash", description="Gemini model used for analysis")
    timestamp: str = Field(description="ISO-8601 analysis timestamp")


class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=2,
        max_length=300,
        description="Research topic, domain, or keyword query (e.g. 'Transformer optimization for edge devices')",
        examples=["Transformer optimization for edge devices", "Direct Preference Optimization in LLMs"]
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Number of relevant papers to retrieve and synthesize from arXiv (default: 5)"
    )


# ---------------------------------------------------------------------------
# arXiv Client & Feed Parser
# ---------------------------------------------------------------------------
ARXIV_API_BASE = "https://export.arxiv.org/api/query"
ATOM_NS = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/xmlns/arxiv}"


async def fetch_arxiv_papers(query: str, max_results: int = 5) -> List[PaperItem]:
    """
    Queries arXiv Atom API for the top relevant research papers.
    Implements URL encoding, namespaces parsing, and metadata sanitization.
    """
    clean_query = query.strip()
    # Build search query: search across all fields (ti: title, abs: abstract, all: general)
    # Using 'all:query' handles multi-word research topics well
    formatted_query = f"all:{clean_query}"
    params = {
        "search_query": formatted_query,
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    url = f"{ARXIV_API_BASE}?{urllib.parse.urlencode(params)}"
    logger.info("Querying arXiv API: %s", url)

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch from arXiv API: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to reach official arXiv API: {str(exc)}"
            )

    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as pe:
        logger.error("Failed to parse arXiv XML response: %s", pe)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Received malformed XML response from arXiv API"
        )

    papers: List[PaperItem] = []

    for entry in root.findall(f"{ATOM_NS}entry"):
        id_elem = entry.find(f"{ATOM_NS}id")
        raw_id_url = id_elem.text.strip() if id_elem is not None and id_elem.text else ""
        # Extract the pure arXiv ID from http://arxiv.org/abs/2305.12345v1 -> 2305.12345
        arxiv_id = raw_id_url.split("/abs/")[-1] if "/abs/" in raw_id_url else raw_id_url.split("/")[-1]

        title_elem = entry.find(f"{ATOM_NS}title")
        raw_title = title_elem.text if title_elem is not None and title_elem.text else "Untitled"
        # arXiv titles frequently contain internal newlines and multiple spaces
        title = " ".join(raw_title.split())

        summary_elem = entry.find(f"{ATOM_NS}summary")
        raw_summary = summary_elem.text if summary_elem is not None and summary_elem.text else ""
        abstract = " ".join(raw_summary.split())

        published_elem = entry.find(f"{ATOM_NS}published")
        published_date = published_elem.text.strip() if published_elem is not None and published_elem.text else ""

        # Extract authors
        authors: List[str] = []
        for author_elem in entry.findall(f"{ATOM_NS}author"):
            name_elem = author_elem.find(f"{ATOM_NS}name")
            if name_elem is not None and name_elem.text:
                authors.append(name_elem.text.strip())

        # Extract PDF and Web Links
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        arxiv_url = f"https://arxiv.org/abs/{arxiv_id}"

        for link_elem in entry.findall(f"{ATOM_NS}link"):
            link_title = link_elem.attrib.get("title")
            link_type = link_elem.attrib.get("type")
            href = link_elem.attrib.get("href", "")
            if link_title == "pdf" or link_type == "application/pdf":
                pdf_url = href.replace("http://", "https://")
            elif link_elem.attrib.get("rel") == "alternate":
                arxiv_url = href.replace("http://", "https://")

        # Category
        cat_elem = entry.find(f"{ARXIV_NS}primary_category")
        category = cat_elem.attrib.get("term") if cat_elem is not None else None

        if not authors:
            authors = ["Anonymous / Consortium"]

        papers.append(
            PaperItem(
                arxiv_id=arxiv_id,
                title=title,
                authors=authors,
                abstract=abstract,
                pdf_url=pdf_url,
                arxiv_url=arxiv_url,
                published_date=published_date,
                primary_category=category
            )
        )

    return papers


# ---------------------------------------------------------------------------
# Gemini Agent Synthesis
# ---------------------------------------------------------------------------

async def synthesize_papers_with_gemini(query: str, papers: List[PaperItem]) -> dict:
    """
    Orchestrates the Gemini model using the google-genai SDK to analyze paper abstracts
    and produce structured research synthesis.
    """
    if not papers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No academic papers found on arXiv for topic: '{query}'"
        )

    # Prepare detailed dossier of retrieved papers
    dossier_text = f"USER RESEARCH TOPIC: {query}\n\n"
    dossier_text += f"RETRIEVED {len(papers)} PAPERS FROM ARXIV:\n"
    dossier_text += "=" * 60 + "\n\n"

    for idx, p in enumerate(papers, start=1):
        dossier_text += f"PAPER #{idx}:\n"
        dossier_text += f"ID: {p.arxiv_id}\n"
        dossier_text += f"Title: {p.title}\n"
        dossier_text += f"Authors: {', '.join(p.authors[:5])}{' et al.' if len(p.authors) > 5 else ''}\n"
        dossier_text += f"Published: {p.published_date}\n"
        dossier_text += f"Primary Category: {p.primary_category or 'N/A'}\n"
        dossier_text += f"PDF: {p.pdf_url}\n"
        dossier_text += f"Abstract:\n{p.abstract}\n"
        dossier_text += "-" * 50 + "\n\n"

    system_instruction = (
        "You are an elite Academic Research Intelligence Agent and PhD peer reviewer. "
        "Your task is to analyze research papers retrieved from arXiv for a specific research topic. "
        "You must extract four foundational dimensions for each paper:\n"
        "1. Key methodology (precise algorithms, architectures, techniques)\n"
        "2. Benchmark datasets used (exact benchmark names, e.g. GLUE, ImageNet, SQuAD, custom)\n"
        "3. Core findings/contributions (empirical speedups, accuracy gains, theoretical bounds)\n"
        "4. Identified limitations/research gaps (memory overhead, edge cases, scalability limits)\n\n"
        "You must also produce:\n"
        "- An Executive Synthesis summarizing the state-of-the-art, collective trends, and research gaps\n"
        "- A Comparative Analysis Matrix formatted as clean tabular rows comparing all papers\n\n"
        "Adhere strictly to the JSON schema requested."
    )

    prompt = (
        f"{dossier_text}\n"
        "Analyze the provided research papers and output a structured JSON response with:\n"
        "{\n"
        '  "executive_synthesis": {\n'
        '    "query_topic": "string",\n'
        '    "overview": "Comprehensive 2-3 paragraph synthesis",\n'
        '    "state_of_the_art": "Summary of current SOTA frontier based on these papers",\n'
        '    "emergent_trends": ["trend 1", "trend 2", "trend 3"],\n'
        '    "identified_research_gaps": ["gap 1", "gap 2", "gap 3"],\n'
        '    "practical_takeaway": "Actionable takeaway for engineers/practitioners implementing these ideas"\n'
        "  },\n"
        '  "comparative_matrix": [\n'
        "    {\n"
        '      "paper_id": "arxiv_id",\n'
        '      "paper_title": "title",\n'
        '      "authors_short": "Lead Author et al.",\n'
        '      "year": "YYYY",\n'
        '      "methodology": "concise methodology summary",\n'
        '      "datasets": "benchmark datasets evaluated",\n'
        '      "primary_contribution": "core milestone or contribution",\n'
        '      "limitations": "noted trade-off or limitation",\n'
        '      "pdf_url": "link to pdf"\n'
        "    }\n"
        "  ],\n"
        '  "analyzed_papers": [\n'
        "    {\n"
        '      "arxiv_id": "arxiv_id",\n'
        '      "paper_title": "title",\n'
        '      "key_methodology": "Detailed breakdown of the core technique, architecture or mechanism",\n'
        '      "benchmark_datasets": ["dataset A", "dataset B"],\n'
        '      "core_findings": ["finding 1", "finding 2"],\n'
        '      "limitations_and_gaps": ["limitation 1", "limitation 2"]\n'
        "    }\n"
        "  ]\n"
        "}\n"
    )

    # Check for client availability
    client = genai_client
    if not client:
        # Re-check environment variable at call time
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GEMINI_API_KEY environment variable is not configured. Please set GEMINI_API_KEY to run the AI Agent."
            )
        from google import genai
        client = genai.Client(api_key=api_key)

    try:
        logger.info("Calling Gemini model '%s' for research synthesis...", MODEL_NAME)
        # Using the official @google/genai SDK GenerateContentConfig with JSON response MIME type
        from google.genai import types
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
        )

        response = client.models.generateContent(
            model=MODEL_NAME,
            contents=prompt,
            config=config
        )

        response_text = response.text
        if not response_text:
            raise ValueError("Gemini returned an empty response")

        # Parse JSON
        import json
        clean_json_str = response_text.strip()
        if clean_json_str.startswith("```json"):
            clean_json_str = clean_json_str[7:]
        if clean_json_str.startswith("```"):
            clean_json_str = clean_json_str[3:]
        if clean_json_str.endswith("```"):
            clean_json_str = clean_json_str[:-3]
        clean_json_str = clean_json_str.strip()

        data = json.loads(clean_json_str)
        return data

    except Exception as exc:
        logger.exception("Gemini API call or parsing failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini AI Agent analysis failed: {str(exc)}"
        )


# ---------------------------------------------------------------------------
# FastAPI Application & Middleware
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ArXiv Research Paper AI Agent API",
    description="College Demo Project: Automated academic research retrieval and comparative synthesis using arXiv API and Gemini.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.get("/", tags=["Info"])
async def root():
    """Service status and interactive endpoints guide."""
    return {
        "service": "ArXiv Research Paper AI Agent",
        "status": "online",
        "model": MODEL_NAME,
        "docs_url": "/docs",
        "endpoints": {
            "POST /api/analyze": "Execute full agent: query arXiv + synthesize with Gemini",
            "GET /api/analyze": "Convenience query param runner for testing (?query=...)",
            "GET /api/papers": "Query arXiv directly without LLM synthesis (?query=...)",
            "GET /health": "Health and credentials check"
        }
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Verify backend connectivity and Gemini API key configuration."""
    api_key_configured = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    return {
        "status": "healthy",
        "gemini_api_key_configured": api_key_configured,
        "model": MODEL_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/papers", response_model=List[PaperItem], tags=["arXiv Search"])
async def search_arxiv(
    query: str = Query(..., min_length=2, description="Search topic e.g. 'state space models'"),
    max_results: int = Query(default=5, ge=1, le=10, description="Max papers to fetch")
):
    """Directly fetch papers from the arXiv API without LLM analysis."""
    papers = await fetch_arxiv_papers(query=query, max_results=max_results)
    return papers


@app.post("/api/analyze", response_model=ResearchSynthesisResponse, tags=["Research Agent"])
async def analyze_research_topic(request: QueryRequest):
    """
    Main Research AI Agent pipeline:
    1. Queries arXiv for relevant papers matching the query
    2. Uses Gemini to analyze methodologies, benchmark datasets, core findings, and limitations
    3. Produces a comparative matrix and executive synthesis
    """
    start_time = time.time()
    logger.info("Executing research synthesis for query: '%s' (max_results: %d)", request.query, request.max_results)

    # Step 1: Query arXiv API
    papers = await fetch_arxiv_papers(query=request.query, max_results=request.max_results)

    if not papers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No academic papers found on arXiv matching query: '{request.query}'"
        )

    # Step 2: Use Gemini to analyze and synthesize
    synthesis_data = await synthesize_papers_with_gemini(query=request.query, papers=papers)

    # Step 3: Validate and enrich synthesis response
    exec_data = synthesis_data.get("executive_synthesis", {})
    executive = ExecutiveSynthesis(
        query_topic=exec_data.get("query_topic", request.query),
        overview=exec_data.get("overview", "Synthesis generated across retrieved literature."),
        state_of_the_art=exec_data.get("state_of_the_art", "Current frontier summary."),
        emergent_trends=exec_data.get("emergent_trends", []),
        identified_research_gaps=exec_data.get("identified_research_gaps", []),
        practical_takeaway=exec_data.get("practical_takeaway", "Practical guidelines based on retrieved literature.")
    )

    # Map comparative matrix rows with fallback enrichment
    matrix_rows: List[ComparativeMatrixRow] = []
    for row in synthesis_data.get("comparative_matrix", []):
        paper_id = row.get("paper_id", "")
        # Find matching paper for PDF URL fallback
        matching_paper = next((p for p in papers if p.arxiv_id in paper_id or paper_id in p.arxiv_id), None)
        pdf_url = row.get("pdf_url") or (matching_paper.pdf_url if matching_paper else "")

        matrix_rows.append(
            ComparativeMatrixRow(
                paper_id=paper_id,
                paper_title=row.get("paper_title", "Untitled"),
                authors_short=row.get("authors_short", "Unknown"),
                year=str(row.get("year", "2024")),
                methodology=row.get("methodology", "N/A"),
                datasets=row.get("datasets", "N/A"),
                primary_contribution=row.get("primary_contribution", "N/A"),
                limitations=row.get("limitations", "N/A"),
                pdf_url=pdf_url
            )
        )

    # Map detailed paper extractions
    analyzed_papers: List[PaperAnalysis] = []
    for item in synthesis_data.get("analyzed_papers", []):
        analyzed_papers.append(
            PaperAnalysis(
                arxiv_id=item.get("arxiv_id", ""),
                paper_title=item.get("paper_title", "Untitled"),
                key_methodology=item.get("key_methodology", "N/A"),
                benchmark_datasets=item.get("benchmark_datasets", []),
                core_findings=item.get("core_findings", []),
                limitations_and_gaps=item.get("limitations_and_gaps", [])
            )
        )

    elapsed_time = round(time.time() - start_time, 2)

    return ResearchSynthesisResponse(
        query=request.query,
        total_papers_fetched=len(papers),
        executive_synthesis=executive,
        comparative_matrix=matrix_rows,
        analyzed_papers=analyzed_papers,
        paper_list=papers,
        model_used=MODEL_NAME,
        execution_time_seconds=elapsed_time,
        timestamp=datetime.now(timezone.utc).isoformat()
    )


@app.get("/api/analyze", response_model=ResearchSynthesisResponse, tags=["Research Agent"])
async def analyze_research_topic_get(
    query: str = Query(..., min_length=2, description="Research query e.g. 'Transformer optimization for edge devices'"),
    max_results: int = Query(default=5, ge=1, le=10, description="Max papers to fetch")
):
    """GET convenience endpoint for testing via browser or simple curl commands."""
    return await analyze_research_topic(QueryRequest(query=query, max_results=max_results))


@app.post("/analyze-pdf", response_model=SinglePDFAnalysisResponse, tags=["PDF Analysis"])
@app.post("/api/analyze-pdf", response_model=SinglePDFAnalysisResponse, tags=["PDF Analysis"])
async def analyze_uploaded_pdf(file: UploadFile = File(...)):
    """
    Accept an uploaded PDF research paper, extract its text using pypdf,
    and analyze via Gemini:
    - Title, Authors, Abstract summary
    - Step-by-step methodology breakdown
    - Strengths and Weaknesses
    - BibTeX citation entries
    """
    if not file.filename.lower().endswith(".pdf") and file.content_type not in ["application/pdf", "application/x-pdf", "binary/octet-stream"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded file '{file.filename}' is not a valid PDF document. Please upload a .pdf file."
        )

    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(e)}"
        )

    if len(pdf_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded PDF file is empty (0 bytes)."
        )

    # Extract text using pypdf with robust error handling
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
        if page_count == 0:
            raise ValueError("PDF has 0 pages.")

        extracted_chunks = []
        for idx, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if page_text:
                    extracted_chunks.append(f"[Page {idx + 1}]\n{page_text}")
            except Exception as page_err:
                logger.warning(f"Warning reading page {idx + 1}: {page_err}")

        extracted_text = "\n\n".join(extracted_chunks).strip()
    except Exception as pdf_err:
        logger.error(f"pypdf extraction error: {pdf_err}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error extracting text from PDF: {str(pdf_err)}. Ensure the file is not encrypted or corrupt."
        )

    if not extracted_text or len(extracted_text) < 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract readable text from the uploaded PDF. It may be a scanned image without an embedded OCR text layer."
        )

    # Strip references to save ~50% tokens and eliminate hallucinated author/citation noise
    import re
    text_without_bib = re.split(r'\n\s*(?:References|Bibliography|REFERENCES|BIBLIOGRAPHY)\s*\n', extracted_text)[0]
    trimmed_text = text_without_bib[:22000]

    system_instruction = (
        "You are an expert AI Research Paper Reviewer and Academic Scientist. "
        "Analyze the provided text of a research paper and output a strictly valid JSON object with:\n"
        "1. paper_title: The official paper title (do NOT output conference names, journal titles, or author names as the title)\n"
        "2. authors: Array of author names directly from paper header\n"
        "3. abstract_summary: Concise 2-3 sentence executive summary of the paper's core premise\n"
        "4. methodology_breakdown: Array of step-by-step methodology points (Step 1, Step 2, etc.) explaining how the technique works\n"
        "5. strengths: Array of 3-4 technical strengths, novelties, and empirical advantages\n"
        "6. weaknesses: Array of 3-4 limitations, evaluation gaps, assumptions, or resource overheads\n"
        "7. bibtex_entries: Array of one or more formatted BibTeX citation blocks ready to paste into LaTeX"
    )

    prompt = (
        f"FILENAME: {file.filename}\n"
        f"EXTRACTED TEXT ({len(trimmed_text)} chars from {page_count} pages, references stripped for speed & precision):\n"
        f"{'='*60}\n"
        f"{trimmed_text}\n"
        f"{'='*60}\n\n"
        "Analyze this paper and return the extraction strictly in the following JSON format:\n"
        "{\n"
        '  "paper_title": "string",\n'
        '  "authors": ["Author 1", "Author 2"],\n'
        '  "abstract_summary": "string",\n'
        '  "methodology_breakdown": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],\n'
        '  "strengths": ["Strength 1", "Strength 2"],\n'
        '  "weaknesses": ["Weakness 1", "Weakness 2"],\n'
        '  "bibtex_entries": ["@article{...}"]\n'
        "}\n"
    )

    # Client call
    client = genai_client
    if not client:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GEMINI_API_KEY is not configured on the server."
            )
        from google import genai
        client = genai.Client(api_key=api_key)

    try:
        from google.genai import types
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
        )

        response = client.models.generateContent(
            model=MODEL_NAME,
            contents=prompt,
            config=config
        )

        resp_text = response.text or "{}"
        clean_json = resp_text.strip()
        if clean_json.startswith("```json"): clean_json = clean_json[7:]
        if clean_json.startswith("```"): clean_json = clean_json[3:]
        if clean_json.endswith("```"): clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        import json
        parsed = json.loads(clean_json)

        return SinglePDFAnalysisResponse(
            paper_title=parsed.get("paper_title", file.filename),
            authors=parsed.get("authors", ["Unknown Author"]),
            abstract_summary=parsed.get("abstract_summary", "No abstract summary available."),
            methodology_breakdown=parsed.get("methodology_breakdown", ["Methodology extracted from paper text"]),
            strengths=parsed.get("strengths", ["Novel experimental approach"]),
            weaknesses=parsed.get("weaknesses", ["Evaluated under specific hardware/dataset constraints"]),
            bibtex_entries=parsed.get("bibtex_entries", [f"@misc{{{file.filename[:8]}, title={{{file.filename}}}}}"]),
            page_count=page_count,
            characters_extracted=len(extracted_text),
            filename=file.filename,
            model_used=MODEL_NAME,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    except Exception as exc:
        logger.exception(f"Gemini PDF analysis failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Agent PDF analysis failed: {str(exc)}"
        )


# ---------------------------------------------------------------------------
# CLI Entrypoint for Local Execution
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting ArXiv Research AI Agent on http://0.0.0.0:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
