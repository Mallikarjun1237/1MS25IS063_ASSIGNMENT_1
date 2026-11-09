import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Upload,
  FileText,
  Sparkles,
  Table,
  ChevronDown,
  ChevronRight,
  Download,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
  FileCode2,
  Terminal,
  BookmarkCheck,
  TrendingUp,
  SlidersHorizontal,
  CheckCircle2,
  FileUp,
  X,
  Layers,
  GraduationCap,
  ArrowRight
} from 'lucide-react';

interface PaperItem {
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string;
  pdf_url: string;
  arxiv_url: string;
  published_date: string;
  primary_category?: string;
}

interface ComparativeMatrixRow {
  paper_id: string;
  paper_title: string;
  authors_short: string;
  year: string;
  methodology: string;
  datasets: string;
  primary_contribution: string;
  limitations: string;
  pdf_url: string;
}

interface PaperAnalysis {
  arxiv_id: string;
  paper_title: string;
  key_methodology: string;
  benchmark_datasets: string[];
  core_findings: string[];
  limitations_and_gaps: string[];
}

interface ExecutiveSynthesis {
  query_topic: string;
  overview: string;
  state_of_the_art: string;
  emergent_trends: string[];
  identified_research_gaps: string[];
  practical_takeaway: string;
}

interface MultiPaperResponse {
  query: string;
  total_papers_fetched: number;
  executive_synthesis: ExecutiveSynthesis;
  comparative_matrix: ComparativeMatrixRow[];
  analyzed_papers: PaperAnalysis[];
  paper_list: PaperItem[];
  model_used: string;
  execution_time_seconds: number;
  cached?: boolean;
  timestamp: string;
}

interface SinglePDFResponse {
  paper_title: string;
  authors: string[];
  abstract_summary: string;
  methodology_breakdown: string[];
  strengths: string[];
  weaknesses: string[];
  bibtex_entries: string[];
  page_count: number;
  characters_extracted: number;
  filename: string;
  model_used: string;
  timestamp: string;
}

const PRESET_TOPICS = [
  'Transformer optimization for edge devices',
  'Direct Preference Optimization in LLMs',
  'State Space Models (Mamba) vs Transformers',
  'Low-Rank Adaptation (LoRA) parameter efficiency',
  'Diffusion models for robotic manipulation',
];

export default function App() {
  // Mode selection: Multi-paper synthesis vs Single PDF analysis
  const [activeMode, setActiveMode] = useState<'topic' | 'pdf'>('topic');
  const [backendUrl, setBackendUrl] = useState<'relative' | 'localhost'>('relative');

  // Topic search state
  const [query, setQuery] = useState('Transformer optimization for edge devices');
  const [maxResults, setMaxResults] = useState(5);
  const [searchLoading, setSearchLoading] = useState(false);
  const [multiPaperData, setMultiPaperData] = useState<MultiPaperResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [singlePdfData, setSinglePdfData] = useState<SinglePDFResponse | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});
  const [matrixFilter, setMatrixFilter] = useState('');
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [backendCode, setBackendCode] = useState<{ main_py: string; requirements_txt: string } | null>(null);

  // Helper for endpoint resolution
  const getApiEndpoint = (path: string) => {
    if (backendUrl === 'localhost') {
      return `http://localhost:8000${path.startsWith('/') ? path : `/${path}`}`;
    }
    return path;
  };

  // Fetch backend code for viewer
  useEffect(() => {
    fetch('/api/code-viewer')
      .then((r) => r.json())
      .then((d) => setBackendCode(d))
      .catch((err) => console.warn('Code viewer load error:', err));
  }, []);

  // Initial demo search
  useEffect(() => {
    handleSearchTopic('Transformer optimization for edge devices', 5);
  }, []);

  const handleSearchTopic = async (searchQuery?: string, count?: number) => {
    const q = (searchQuery ?? query).trim();
    const num = count ?? maxResults;
    if (!q) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const endpoint = getApiEndpoint('/api/analyze');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, max_results: num }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `HTTP error ${res.status}`);
      }

      const data: MultiPaperResponse = await res.json();
      setMultiPaperData(data);

      // Auto-expand first paper accordion
      if (data.analyzed_papers && data.analyzed_papers.length > 0) {
        setExpandedAccordions({ [data.analyzed_papers[0].arxiv_id]: true });
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setSearchError(err.message || 'Failed to search and synthesize research papers.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePdfUpload = async (fileToUpload?: File) => {
    const target = fileToUpload || pdfFile;
    if (!target) return;

    setPdfLoading(true);
    setPdfError(null);

    const formData = new FormData();
    formData.append('file', target);

    try {
      const endpoint = getApiEndpoint('/analyze-pdf');
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `HTTP error ${res.status}`);
      }

      const data: SinglePDFResponse = await res.json();
      setSinglePdfData(data);
    } catch (err: any) {
      console.error('PDF upload analysis error:', err);
      setPdfError(err.message || 'Failed to parse and analyze PDF document.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setPdfFile(file);
        handlePdfUpload(file);
      } else {
        setPdfError('Please upload a valid .pdf file.');
      }
    }
  };

  const toggleAccordion = (id: string) => {
    setExpandedAccordions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadFile = (filename: string, content: string, mime: string = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate clean Markdown summary for export
  const generateMarkdownSummary = (): string => {
    if (activeMode === 'pdf' && singlePdfData) {
      return `# Research Paper Analysis: ${singlePdfData.paper_title}

**Authors:** ${singlePdfData.authors.join(', ')}  
**File:** \`${singlePdfData.filename}\` (${singlePdfData.page_count} pages, ${singlePdfData.characters_extracted.toLocaleString()} chars)  
**Analyzed via:** ${singlePdfData.model_used} on ${singlePdfData.timestamp.slice(0, 10)}  

---

## 1. Executive Abstract Summary
${singlePdfData.abstract_summary}

---

## 2. Step-by-Step Methodology Breakdown
${singlePdfData.methodology_breakdown.map((step) => `- ${step}`).join('\n')}

---

## 3. Technical Strengths
${singlePdfData.strengths.map((s) => `- [x] ${s}`).join('\n')}

---

## 4. Identified Weaknesses & Evaluation Gaps
${singlePdfData.weaknesses.map((w) => `- [!] ${w}`).join('\n')}

---

## 5. BibTeX Citation
\`\`\`bibtex
${singlePdfData.bibtex_entries.join('\n\n')}
\`\`\`
`;
    }

    if (!multiPaperData) return '';

    const { executive_synthesis, comparative_matrix, analyzed_papers, query } = multiPaperData;

    return `# Academic Literature Synthesis: "${query}"

**Generated by:** ArXiv Research Paper AI Agent (${multiPaperData.model_used})  
**Papers Analyzed:** ${multiPaperData.total_papers_fetched}  
**Date:** ${multiPaperData.timestamp.slice(0, 10)}  

---

## 1. Executive Summary
${executive_synthesis.overview}

### State of the Art (SOTA)
${executive_synthesis.state_of_the_art}

### Emergent Research Trends
${executive_synthesis.emergent_trends.map((t, idx) => `${idx + 1}. ${t}`).join('\n')}

### Identified Research Gaps
${executive_synthesis.identified_research_gaps.map((g) => `- ${g}`).join('\n')}

### Practical Implementation Takeaways
${executive_synthesis.practical_takeaway}

---

## 2. Comparative Analysis Matrix

| Paper Title | Approach / Methodology | Metrics & Datasets | Research Gap / Limitations | Links |
| :--- | :--- | :--- | :--- | :--- |
${comparative_matrix
  .map(
    (row) =>
      `| **${row.paper_title.replace(/\|/g, '-')}** (${row.authors_short}, ${row.year}) | ${row.methodology.replace(/\|/g, '-')} | ${row.datasets.replace(/\|/g, '-')} | ${row.limitations.replace(/\|/g, '-')} | [PDF](${row.pdf_url}) \\| [arXiv: ${row.paper_id}](https://arxiv.org/abs/${row.paper_id}) |`
  )
  .join('\n')}

---

## 3. Deep-Dive Paper Extractions

${analyzed_papers
  .map(
    (p, i) => `### Paper #${i + 1}: ${p.paper_title} (arXiv: ${p.arxiv_id})

**Key Methodology:**  
${p.key_methodology}

**Benchmark Datasets Evaluated:**  
${p.benchmark_datasets.map((d) => `\`${d}\``).join(', ')}

**Core Findings & Contributions:**  
${p.core_findings.map((f) => `- ${f}`).join('\n')}

**Identified Limitations & Gaps:**  
${p.limitations_and_gaps.map((l) => `- ${l}`).join('\n')}
`
  )
  .join('\n---\n')}
`;
  };

  const filteredMatrix = (multiPaperData?.comparative_matrix || []).filter((row) => {
    if (!matrixFilter.trim()) return true;
    const term = matrixFilter.toLowerCase();
    return (
      row.paper_title.toLowerCase().includes(term) ||
      row.methodology.toLowerCase().includes(term) ||
      row.datasets.toLowerCase().includes(term) ||
      row.authors_short.toLowerCase().includes(term) ||
      row.limitations.toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-100 text-base sm:text-lg tracking-tight">
                  Research Paper AI Agent
                </span>
                <span className="bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  FastAPI & Gemini
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                ArXiv Multi-Paper Synthesis & Single-Paper PDF Technical Extraction
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            {/* Backend URL Toggle */}
            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
              <span className="text-[11px]">API Host:</span>
              <button
                onClick={() => setBackendUrl('relative')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  backendUrl === 'relative'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Applet (/api)
              </button>
              <button
                onClick={() => setBackendUrl('localhost')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  backendUrl === 'localhost'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Connects to python main.py running on http://localhost:8000"
              >
                :8000 (Local)
              </button>
            </div>

            <button
              onClick={() => setCodeViewerOpen(!codeViewerOpen)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition font-medium cursor-pointer"
            >
              <FileCode2 className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Backend Code</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Mode Selector Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveMode('topic')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center space-x-2 transition cursor-pointer ${
              activeMode === 'topic'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>1. ArXiv Topic Search & Synthesis</span>
          </button>

          <button
            onClick={() => setActiveMode('pdf')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center space-x-2 transition cursor-pointer ${
              activeMode === 'pdf'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileUp className="w-4 h-4 text-cyan-400" />
            <span>2. Single PDF Paper Analyzer (/analyze-pdf)</span>
            <span className="bg-cyan-950 text-cyan-300 border border-cyan-800/60 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              New
            </span>
          </button>
        </div>

        {/* MODE 1: TOPIC SEARCH & SYNTHESIZE */}
        {activeMode === 'topic' && (
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchTopic();
              }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter research topic (e.g. 'Transformer optimization for edge devices')"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-500 text-sm transition outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300">
                    <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                    <span>Top:</span>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(Number(e.target.value))}
                      className="bg-transparent text-indigo-300 font-semibold focus:outline-none cursor-pointer"
                    >
                      <option value={3} className="bg-slate-900">3 Papers</option>
                      <option value={5} className="bg-slate-900">5 (Default)</option>
                      <option value={8} className="bg-slate-900">8 Papers</option>
                      <option value={10} className="bg-slate-900">10 Papers</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={searchLoading || !query.trim()}
                    className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium text-sm flex items-center justify-center space-x-2 transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    {searchLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Synthesizing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-cyan-200" />
                        <span>Search &amp; Synthesize</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sample Topic Chips */}
              <div className="flex items-center flex-wrap gap-1.5 pt-1 text-xs">
                <span className="text-slate-400 font-medium mr-1 flex items-center">
                  <Lightbulb className="w-3.5 h-3.5 mr-1 text-amber-400" /> Examples:
                </span>
                {PRESET_TOPICS.map((topic) => (
                  <button
                    type="button"
                    key={topic}
                    onClick={() => {
                      setQuery(topic);
                      handleSearchTopic(topic);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition border text-left cursor-pointer ${
                      query === topic
                        ? 'bg-indigo-900/60 border-indigo-500/80 text-indigo-200'
                        : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </form>

            {/* Performance & Accuracy Accelerators Bar */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>
                  In-Memory Cache Active
                </span>
                <span className="text-slate-600">&bull;</span>
                <span className="flex items-center text-cyan-400 font-medium">
                  ⚡ ThinkingLevel: Low (~1s Latency)
                </span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-slate-400">
                  Targeted arXiv Slicing &amp; Clean Atom XML
                </span>
              </div>
              <span className="text-slate-500 text-[10px]">
                Sub-second repeat queries
              </span>
            </div>

            {searchError && (
              <div className="mt-4 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Search Synthesis Error:</p>
                  <p className="mt-1 text-rose-300">{searchError}</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* MODE 2: SINGLE PDF FILE DROPZONE & ANALYZER */}
        {activeMode === 'pdf' && (
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center">
                  <FileUp className="w-5 h-5 mr-2 text-cyan-400" />
                  Upload &amp; Analyze Single Research Paper (PDF)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Connects to the newly added <code>POST /analyze-pdf</code> endpoint. Extracts text via <code>pypdf</code> and prompts Gemini for step-by-step methodology, strengths, weaknesses, and BibTeX citations.
                </p>
              </div>

              {/* Sample PDF Quick Loader for demo convenience */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    setPdfLoading(true);
                    setPdfError(null);
                    // Fetch a real lightweight arXiv sample PDF
                    const response = await fetch('/api/papers?query=Transformer+optimization&max_results=1');
                    const papers: PaperItem[] = await response.json();
                    if (papers.length > 0) {
                      // Generate dummy file from paper abstract for testing
                      const sampleText = `%PDF-1.4 sample\nTitle: ${papers[0].title}\nAuthors: ${papers[0].authors.join(', ')}\nAbstract: ${papers[0].abstract}\nMethodology: Proposed architecture evaluated on benchmark testbeds.`;
                      const mockFile = new File([sampleText], `${papers[0].arxiv_id}_paper.pdf`, { type: 'application/pdf' });
                      setPdfFile(mockFile);
                      await handlePdfUpload(mockFile);
                    }
                  } catch (e: any) {
                    setPdfError('Could not load sample paper. Please select a local PDF file.');
                  } finally {
                    setPdfLoading(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-indigo-300 border border-indigo-900/50 flex items-center space-x-1.5 transition cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Load Sample PDF</span>
              </button>
            </div>

            {/* Dropzone container */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center space-y-3 ${
                pdfFile
                  ? 'border-indigo-500/60 bg-indigo-950/20'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setPdfFile(e.target.files[0]);
                    handlePdfUpload(e.target.files[0]);
                  }
                }}
              />

              <div className="w-12 h-12 rounded-2xl bg-indigo-950 text-indigo-400 flex items-center justify-center border border-indigo-800/50 shadow-inner">
                {pdfLoading ? (
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>

              {pdfFile ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-100 flex items-center justify-center space-x-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>{pdfFile.name}</span>
                    <span className="text-xs text-slate-400 font-normal">
                      ({(pdfFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Click or drop another file to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200">
                    Drag and drop your PDF research paper here, or <span className="text-indigo-400 underline">browse</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Supports academic papers, preprints, conference proceedings (up to 30MB)
                  </p>
                </div>
              )}

              {pdfFile && (
                <button
                  type="button"
                  disabled={pdfLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePdfUpload();
                  }}
                  className="mt-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 shadow transition cursor-pointer"
                >
                  {pdfLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting with pypdf &amp; Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Analyze PDF Now</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {pdfError && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">PDF Analysis Error:</p>
                  <p className="mt-1 text-rose-300">{pdfError}</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Global Export Toolbar */}
        {((activeMode === 'topic' && multiPaperData) || (activeMode === 'pdf' && singlePdfData)) && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              <span className="font-semibold text-slate-200">Export Results:</span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-indigo-400">
                {activeMode === 'topic'
                  ? `${multiPaperData?.total_papers_fetched} Papers Synthesized`
                  : `Single Paper: ${singlePdfData?.filename}`}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => copyToClipboard(generateMarkdownSummary(), 'markdown_copy')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 flex items-center space-x-1.5 cursor-pointer font-medium"
              >
                {copiedKey === 'markdown_copy' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{copiedKey === 'markdown_copy' ? 'Copied Markdown' : 'Copy Markdown'}</span>
              </button>

              <button
                onClick={() =>
                  downloadFile(
                    `research_summary_${activeMode}_${Date.now()}.md`,
                    generateMarkdownSummary(),
                    'text/markdown'
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center space-x-1.5 cursor-pointer font-medium shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Markdown (.md)</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* RESULTS SECTION: MULTI-PAPER SYNTHESIS                  */}
        {/* ======================================================== */}
        {activeMode === 'topic' && multiPaperData && (
          <div className="space-y-6">
            {/* 1. Executive Summary Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/50">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">Executive Summary</h2>
                    <p className="text-xs text-slate-400">
                      Cross-literature synthesis for &ldquo;{multiPaperData.query}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
                    Model: {multiPaperData.model_used}
                  </span>
                  {multiPaperData.cached ? (
                    <span className="text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2.5 py-1 rounded-full font-semibold flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                      ⚡ {multiPaperData.execution_time_seconds}s (Instant Cache)
                    </span>
                  ) : (
                    <span className="text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-800/50 px-2.5 py-1 rounded-full font-medium flex items-center">
                      ⚡ {multiPaperData.execution_time_seconds}s
                    </span>
                  )}
                </div>
              </div>

              {/* Narrative */}
              <div className="text-sm text-slate-300 leading-relaxed space-y-3">
                <p className="whitespace-pre-line">{multiPaperData.executive_synthesis.overview}</p>
              </div>

              {/* SOTA & Takeaways */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1.5" /> State-of-the-Art (SOTA) Frontier
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {multiPaperData.executive_synthesis.state_of_the_art}
                  </p>
                </div>

                <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-4">
                  <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2 flex items-center">
                    <BookmarkCheck className="w-4 h-4 mr-1.5 text-indigo-400" /> Practical Takeaway for Engineers
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {multiPaperData.executive_synthesis.practical_takeaway}
                  </p>
                </div>
              </div>

              {/* Trends & Gaps Pills */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="text-xs font-semibold text-slate-400 mb-2 block">
                    Emergent Research Trends:
                  </span>
                  <div className="space-y-1.5">
                    {multiPaperData.executive_synthesis.emergent_trends.map((t, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg text-slate-300 flex items-start space-x-2"
                      >
                        <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-400 mb-2 block">
                    Identified Research Gaps:
                  </span>
                  <div className="space-y-1.5">
                    {multiPaperData.executive_synthesis.identified_research_gaps.map((g, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-lg text-amber-200/90 flex items-start space-x-2"
                      >
                        <span className="text-amber-400 font-bold shrink-0">&bull;</span>
                        <span>{g}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Comparative Matrix Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center">
                    <Table className="w-5 h-5 mr-2 text-indigo-400" />
                    Comparative Analysis Matrix
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Interactive tabular evaluation across methodology, benchmarks, contributions, and gaps
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={matrixFilter}
                    onChange={(e) => setMatrixFilter(e.target.value)}
                    placeholder="Filter rows..."
                    className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-44"
                  />
                  <span className="text-xs text-slate-500">
                    {filteredMatrix.length} of {multiPaperData.comparative_matrix.length}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300 divide-y divide-slate-800">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                    <tr>
                      <th className="py-3 px-4 min-w-[200px]">Paper Title</th>
                      <th className="py-3 px-4 min-w-[200px]">Approach / Methodology</th>
                      <th className="py-3 px-4 min-w-[150px]">Metrics &amp; Datasets</th>
                      <th className="py-3 px-4 min-w-[200px]">Research Gap / Limitations</th>
                      <th className="py-3 px-4 text-right min-w-[100px]">Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/50">
                    {filteredMatrix.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        {/* Title & citation */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-semibold text-slate-100 text-xs leading-snug">
                            {row.paper_title}
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-indigo-400 mt-1">
                            <span>{row.authors_short}</span>
                            <span>&bull;</span>
                            <span className="text-slate-400">{row.year}</span>
                          </div>
                          <span className="inline-block mt-1 font-mono text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            arXiv:{row.paper_id}
                          </span>
                        </td>

                        {/* Approach */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="text-slate-200 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                            {row.methodology}
                          </div>
                        </td>

                        {/* Metrics & Datasets */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex flex-wrap gap-1">
                            {row.datasets.split(/[,;]/).map((ds, dIdx) => {
                              const clean = ds.trim();
                              if (!clean) return null;
                              return (
                                <span
                                  key={dIdx}
                                  className="bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 px-2 py-0.5 rounded text-[10px] font-medium"
                                >
                                  {clean}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        {/* Research Gap */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="text-amber-300/90 bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-lg leading-relaxed text-[11px]">
                            {row.limitations}
                          </div>
                        </td>

                        {/* Links */}
                        <td className="py-3.5 px-4 align-top text-right">
                          <div className="flex flex-col items-end space-y-1">
                            <a
                              href={row.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50 text-[11px] font-medium transition"
                            >
                              <span>PDF</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={`https://arxiv.org/abs/${row.paper_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                            >
                              arXiv Page
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Deep Dive Collapsible Accordions for Each Paper */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center">
                    <Layers className="w-5 h-5 mr-2 text-indigo-400" />
                    Deep Dive Technical Accordions
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click each paper to expand the detailed methodology, benchmarks, empirical findings, and identified gaps
                  </p>
                </div>
                <button
                  onClick={() => {
                    const allOpen = Object.keys(expandedAccordions).length === multiPaperData.analyzed_papers.length;
                    if (allOpen) {
                      setExpandedAccordions({});
                    } else {
                      const newMap: Record<string, boolean> = {};
                      multiPaperData.analyzed_papers.forEach((p) => (newMap[p.arxiv_id] = true));
                      setExpandedAccordions(newMap);
                    }
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer font-medium"
                >
                  {Object.keys(expandedAccordions).length === multiPaperData.analyzed_papers.length
                    ? 'Collapse All'
                    : 'Expand All'}
                </button>
              </div>

              <div className="space-y-3">
                {multiPaperData.analyzed_papers.map((paper, idx) => {
                  const isOpen = Boolean(expandedAccordions[paper.arxiv_id]);
                  const rawPaper = multiPaperData.paper_list.find((p) => p.arxiv_id === paper.arxiv_id);

                  return (
                    <div
                      key={idx}
                      className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 transition"
                    >
                      {/* Accordion header */}
                      <button
                        type="button"
                        onClick={() => toggleAccordion(paper.arxiv_id)}
                        className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-900/80 transition cursor-pointer select-none"
                      >
                        <div className="flex items-center space-x-3 pr-4">
                          <span className="w-6 h-6 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/50 flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-semibold text-slate-100 text-xs sm:text-sm">
                              {paper.paper_title}
                            </span>
                            <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                              <span className="font-mono text-indigo-400">arXiv:{paper.arxiv_id}</span>
                              {rawPaper && (
                                <>
                                  <span>&bull;</span>
                                  <span>{rawPaper.authors.slice(0, 3).join(', ')}{rawPaper.authors.length > 3 ? ' et al.' : ''}</span>
                                  <span>&bull;</span>
                                  <span className="bg-slate-800 px-1.5 py-0.2 rounded text-[10px]">
                                    {rawPaper.published_date.slice(0, 10)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Accordion Body */}
                      {isOpen && (
                        <div className="p-5 border-t border-slate-800/80 bg-slate-900/40 space-y-4 text-xs">
                          {/* Methodology */}
                          <div>
                            <span className="font-semibold text-indigo-400 uppercase tracking-wider text-[11px] block mb-1.5">
                              🔬 Key Technical Methodology:
                            </span>
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-200 leading-relaxed">
                              {paper.key_methodology}
                            </div>
                          </div>

                          {/* 2-col: Datasets & Findings */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                              <span className="font-semibold text-cyan-400 uppercase tracking-wider text-[11px] block mb-2">
                                📊 Benchmark Datasets &amp; Suites:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {paper.benchmark_datasets.map((d, dIdx) => (
                                  <span
                                    key={dIdx}
                                    className="bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 px-2.5 py-1 rounded text-xs"
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                              <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[11px] block mb-2">
                                🏆 Core Empirical Findings:
                              </span>
                              <ul className="space-y-1 text-slate-300">
                                {paper.core_findings.map((f, fIdx) => (
                                  <li key={fIdx} className="flex items-start space-x-2">
                                    <span className="text-emerald-400 font-bold">&bull;</span>
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Limitations */}
                          <div className="bg-amber-950/20 border border-amber-900/30 p-3.5 rounded-xl text-amber-200/90">
                            <span className="font-semibold text-amber-400 uppercase tracking-wider text-[11px] block mb-1.5">
                              ⚠️ Identified Limitations &amp; Research Gaps:
                            </span>
                            <div className="space-y-1">
                              {paper.limitations_and_gaps.map((l, lIdx) => (
                                <div key={lIdx} className="flex items-start space-x-2">
                                  <span className="text-amber-400 font-bold">&bull;</span>
                                  <span>{l}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Links footer */}
                          {rawPaper && (
                            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-slate-400 text-[11px]">
                              <span className="italic">Category: {rawPaper.primary_category || 'cs.AI'}</span>
                              <div className="flex items-center space-x-3">
                                <a
                                  href={rawPaper.arxiv_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-slate-200 flex items-center space-x-1"
                                >
                                  <span>arXiv Entry</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={rawPaper.pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1"
                                >
                                  <span>Open PDF</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* RESULTS SECTION: SINGLE PDF ANALYSIS (/analyze-pdf)     */}
        {/* ======================================================== */}
        {activeMode === 'pdf' && singlePdfData && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              {/* Paper Header */}
              <div className="border-b border-slate-800 pb-5">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[11px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded">
                    File: {singlePdfData.filename}
                  </span>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    {singlePdfData.page_count} Pages
                  </span>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    {singlePdfData.characters_extracted.toLocaleString()} Characters Extracted
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-100 leading-snug">
                  {singlePdfData.paper_title}
                </h2>
                <p className="text-xs text-indigo-300 font-medium mt-1">
                  Authors: {singlePdfData.authors.join(', ')}
                </p>
              </div>

              {/* Abstract Summary */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center">
                  <FileText className="w-4 h-4 mr-1.5 text-indigo-400" /> Executive Abstract Summary
                </h3>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                  {singlePdfData.abstract_summary}
                </p>
              </div>

              {/* Step-by-Step Methodology Breakdown */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center">
                  <Layers className="w-4 h-4 mr-1.5" /> Step-by-Step Methodology Breakdown
                </h3>
                <div className="space-y-2">
                  {singlePdfData.methodology_breakdown.map((step, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl text-xs text-slate-200 flex items-start space-x-3"
                    >
                      <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strengths & Weaknesses 2-Col */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Technical Strengths &amp; Novelty
                  </h4>
                  <ul className="space-y-1.5 text-xs text-emerald-200/90">
                    {singlePdfData.strengths.map((str, sIdx) => (
                      <li key={sIdx} className="flex items-start space-x-2">
                        <span className="text-emerald-400 font-bold">&check;</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1.5" /> Weaknesses &amp; Identified Gaps
                  </h4>
                  <ul className="space-y-1.5 text-xs text-rose-200/90">
                    {singlePdfData.weaknesses.map((w, wIdx) => (
                      <li key={wIdx} className="flex items-start space-x-2">
                        <span className="text-rose-400 font-bold">&bull;</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* BibTeX Citation Entries */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center">
                    <Terminal className="w-4 h-4 mr-1.5" /> BibTeX Citation Entry
                  </h4>
                  <button
                    onClick={() => copyToClipboard(singlePdfData.bibtex_entries.join('\n\n'), 'pdf_bibtex')}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedKey === 'pdf_bibtex' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'pdf_bibtex' ? 'Copied' : 'Copy BibTeX'}</span>
                  </button>
                </div>
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
                  {singlePdfData.bibtex_entries.join('\n\n')}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* BACKEND CODE DRAWER / MODAL                             */}
        {/* ======================================================== */}
        {codeViewerOpen && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileCode2 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  FastAPI Backend Code (<code>/main.py</code> with <code>/analyze-pdf</code>)
                </h3>
              </div>
              <button
                onClick={() => setCodeViewerOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="font-semibold text-indigo-400">cURL Test for /analyze (arXiv):</span>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto">
{`curl -X POST "http://localhost:8000/api/analyze" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Transformer optimization", "max_results": 5}'`}
                </pre>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="font-semibold text-cyan-400">cURL Test for /analyze-pdf:</span>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto">
{`curl -X POST "http://localhost:8000/analyze-pdf" \\
  -F "file=@paper.pdf"`}
                </pre>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">/main.py</span>
                <button
                  onClick={() => copyToClipboard(backendCode?.main_py || '', 'drawer_code')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                >
                  {copiedKey === 'drawer_code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'drawer_code' ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-300 max-h-96 overflow-y-auto leading-relaxed">
                {backendCode?.main_py || '# Loading main.py...'}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Built with <span className="text-indigo-400">FastAPI</span>,{' '}
            <span className="text-indigo-400">pypdf</span>,{' '}
            <span className="text-indigo-400">arXiv API</span>, and{' '}
            <span className="text-indigo-400">Google GenAI SDK (Gemini 3.8 Flash)</span>
          </div>
          <div>College Demo Project &bull; Academic Literature Synthesis Agent</div>
        </div>
      </footer>
    </div>
  );
}
