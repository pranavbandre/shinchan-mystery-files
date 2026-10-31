import { useEffect, useMemo, useState } from "react";
import {
  Home, PlusCircle, FileText, Lightbulb, Scale, Clock3, ClipboardCheck,
  ChartNoAxesColumn, Search, Bell, ChevronRight, Plus, Folder, FolderOpen,
  Globe, CircleCheck, Link2, ArrowRight, X, Trash2, ExternalLink,
  Settings, Menu, Check, Sparkles
} from "lucide-react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

const initialCases = [
  { id: "RES-001", title: "Government Scholarship Research", category: "Education", sources: 4, status: "In progress", date: "Today", tone: "yellow" },
  { id: "RES-002", title: "AI in Healthcare Research", category: "Technology", sources: 6, status: "Completed", date: "Yesterday", tone: "blue" },
  { id: "RES-003", title: "Sustainable Packaging Study", category: "Environment", sources: 3, status: "In progress", date: "28 Oct", tone: "pink" },
];

const navItems = [
  { id: "dashboard", label: "Research Dashboard", icon: Home },
  { id: "investigations", label: "New Investigation", icon: PlusCircle },
  { id: "sources", label: "Evidence Sources", icon: FileText },
  { id: "gaps", label: "Missing Information", icon: Lightbulb },
  { id: "conflicts", label: "Conflicting Claims", icon: Scale },
  { id: "outdated", label: "Outdated Sources", icon: Clock3 },
  { id: "checklist", label: "Verification Checklist", icon: ClipboardCheck },
  { id: "reports", label: "Research Reports", icon: ChartNoAxesColumn },
];

function App() {
  const [page, setPage] = useState("dashboard");
  const [cases, setCases] = useState(() => {
    try {
      const saved = localStorage.getItem("shinchan-research-cases");
      return saved ? JSON.parse(saved) : initialCases;
    } catch { return initialCases; }
  });
  const [activeCase, setActiveCase] = useState("RES-001");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [draftSources, setDraftSources] = useState([]);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [backendStatus, setBackendStatus] = useState("connecting");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [checks, setChecks] = useState([
    { id: 1, text: "Check the credibility of each source", done: false },
    { id: 2, text: "Compare important claims across sources", done: false },
    { id: 3, text: "Check publication dates and updates", done: false },
    { id: 4, text: "Record information that is still missing", done: false },
  ]);

  const selected = cases.find((item) => item.id === activeCase) || cases[0];
  const totalSources = cases.reduce((sum, item) => sum + item.sources, 0);
  const filteredCases = useMemo(() => cases.filter((item) =>
    `${item.title} ${item.category} ${item.id}`.toLowerCase().includes(query.toLowerCase())
  ), [cases, query]);

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(window.__shinchanToast);
    window.__shinchanToast = window.setTimeout(() => setToast(""), 2600);
  };

  // Load investigations and their saved evidence from the FastAPI backend.
  // These GET routes were confirmed working in your Swagger screenshots.
  useEffect(() => {
    let cancelled = false;

    const loadBackendData = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/investigations`);
        if (!response.ok) throw new Error(`Investigations request failed (${response.status})`);

        const investigations = await response.json();
        const hydratedCases = await Promise.all(
          investigations.map(async (item, index) => {
            let sourceList = [];
            try {
              const sourceResponse = await fetch(
                `${API_BASE}/api/investigations/${item.id}/sources`
              );
              if (sourceResponse.ok) {
                const sources = await sourceResponse.json();
                sourceList = Array.isArray(sources) ? sources : [];
              }
            } catch {
              // Keep the investigation visible if its source list cannot load.
            }

            return {
              id: String(item.id),
              backendId: item.id,
              title: item.title || item.question || `Investigation ${item.id}`,
              category: "Research",
              sources: sourceList.length,
              sourceList,
              status: item.status || "In progress",
              date: item.created_at ? new Date(item.created_at).toLocaleDateString() : "Recently",
              tone: ["yellow", "blue", "pink"][index % 3],
            };
          })
        );

        if (cancelled) return;
        setCases(hydratedCases);
        if (hydratedCases.length > 0) {
          setActiveCase((current) =>
            hydratedCases.some((item) => item.id === current) ? current : hydratedCases[0].id
          );
        }
        setBackendStatus("connected");
      } catch (error) {
        if (cancelled) return;
        setBackendStatus("offline");
        console.error("Could not load the FastAPI backend:", error);
      }
    };

    loadBackendData();
    return () => { cancelled = true; };
  }, []);

  const saveCases = (next) => {
    setCases(next);
    try { localStorage.setItem("shinchan-research-cases", JSON.stringify(next)); } catch {}
  };

  const go = (id) => {
    setPage(id);
    setMobileNav(false);
  };

  const startNew = () => {
    setTitleDraft("");
    setDescription("");
    setQuestion("");
    setDraftSources([]);
    setSourceDraft("");
    setModalOpen(true);
  };

  const addDraftSource = () => {
    const value = sourceDraft.trim();
    if (!value) return;
    if (draftSources.some((item) => item.url.toLowerCase() === value.toLowerCase())) {
      notify("This source is already in the list.");
      return;
    }
    setDraftSources((old) => [...old, { id: `${Date.now()}-${old.length}`, url: value }]);
    setSourceDraft("");
  };

  const createCase = async (event) => {
    event.preventDefault();

    const researchTitle = titleDraft.trim();
    const researchQuestion = question.trim();
    const researchDescription = description.trim();

    if (!researchTitle) {
      notify("Enter an investigation title first.");
      return;
    }
    if (!researchQuestion) {
      notify("Enter a research question first.");
      return;
    }

    try {
      const title = researchTitle;

      const response = await fetch(`${API_BASE}/api/investigations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title,
          question: researchQuestion,
          description: researchDescription || null,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed (${response.status})`);
      }

      const created = await response.json();

      const nextCase = {
        id: String(created.id),
        backendId: created.id,
        title: created.title || title,
        question: created.question || researchQuestion,
        description: created.description || researchDescription,
        category: "New research",
        sources: 0,
        sourceList: [],
        status: created.status || "In progress",
        date: created.created_at
          ? new Date(created.created_at).toLocaleDateString()
          : "Just now",
        tone: "yellow",
      };

      setCases((old) => [nextCase, ...old.filter((item) => item.id !== String(created.id))]);
      setActiveCase(String(created.id));
      setModalOpen(false);
      setPage("investigations");
      setTitleDraft("");
      setDescription("");
      setQuestion("");
      setSourceDraft("");
      setDraftSources([]);

      // Save any sources entered in the new-investigation dialog.
      let failedSources = 0;
      for (const source of draftSources) {
        try {
          const sourceResponse = await fetch(
            `${API_BASE}/api/investigations/${created.id}/sources`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ url: source.url }),
            }
          );
          if (!sourceResponse.ok) failedSources += 1;
        } catch {
          failedSources += 1;
        }
      }

      // Refresh the newly created investigation's source list from the backend.
      let savedSources = [];
      try {
        const listResponse = await fetch(
          `${API_BASE}/api/investigations/${created.id}/sources`
        );
        if (listResponse.ok) {
          const result = await listResponse.json();
          savedSources = Array.isArray(result) ? result : [];
        }
      } catch {
        // The investigation itself has already been created successfully.
      }

      setCases((old) => old.map((item) =>
        item.id === String(created.id)
          ? { ...item, sources: savedSources.length, sourceList: savedSources }
          : item
      ));

      if (failedSources > 0) {
        notify(`Investigation created. ${failedSources} source(s) could not be collected; add them again from Evidence Sources.`);
      } else {
        notify("Investigation created and saved.");
      }
    } catch (error) {
      console.error("Could not create investigation:", error);
      notify(`Could not create investigation: ${error.message}`);
    }
  };

  const addSourceToSelected = async () => {
    const value = sourceDraft.trim();
    if (!value) return notify("Paste a source URL or reference first.");
    if (!selected) return notify("Create an investigation first.");
    if (!selected.backendId) {
      return notify("Select an investigation loaded from the backend before adding evidence.");
    }
    if (!/^https?:\/\//i.test(value)) {
      return notify("Enter a complete website URL starting with http:// or https://.");
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/investigations/${selected.backendId}/sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ url: value }),
        }
      );
      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed (${response.status})`);
      }

      const savedSource = await response.json();
      const sourceResponse = await fetch(
        `${API_BASE}/api/investigations/${selected.backendId}/sources`
      );
      if (!sourceResponse.ok) {
        throw new Error("Source was added, but the refreshed source list could not be loaded.");
      }

      const savedSources = await sourceResponse.json();
      const sourceList = Array.isArray(savedSources)
        ? savedSources
        : [...(selected.sourceList || []), savedSource];

      setCases((old) => old.map((item) =>
        item.id === selected.id
          ? { ...item, sources: sourceList.length, sourceList }
          : item
      ));
      setSourceDraft("");
      notify("Evidence source saved.");
    } catch (error) {
      console.error("Could not add evidence source:", error);

      // FastAPI sends validation/errors as JSON such as {"detail":"..."}.
      // Show the useful message instead of the raw JSON in the toast.
      let message = error.message || "Something went wrong.";
      try {
        const parsed = JSON.parse(message);
        message = parsed.detail || parsed.message || message;
      } catch {
        // The error was already plain text.
      }

      if (typeof message !== "string") {
        message = "This source could not be added. Please check the URL and try again.";
      }

      if (message.toLowerCase().includes("already been added")) {
        notify("This website is already in this investigation.");
      } else {
        notify(message);
      }
    }
  };

  // Ask the FastAPI backend to analyse the selected investigation with Gemini.
  const runAnalysis = async () => {
    if (!selected?.backendId) {
      notify("Select an investigation saved in the backend first.");
      return;
    }
    if (!selected.sources) {
      notify("Add at least one evidence source before running AI analysis.");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const controller = new AbortController();
      const analysisTimeout = window.setTimeout(() => controller.abort(), 60000);
      let response;
      try {
        response = await fetch(
          `${API_BASE}/api/investigations/${selected.backendId}/analyze`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }
        );
      } finally {
        window.clearTimeout(analysisTimeout);
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data.detail || data.message || `Analysis failed (${response.status})`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      setAnalysisResult(data);
      notify("Gemini analysis completed successfully.");
    } catch (error) {
      console.error("Gemini analysis failed:", error);
      setAnalysisError(error.name === "AbortError" ? "Analysis took over 60 seconds. Try again, or check the backend/API logs." : (error.message || "Could not analyse this investigation."));
      notify("AI analysis failed. Check the error message on the page.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const currentAnalysis = analysisResult?.analysis || null;
  const missingCount = Array.isArray(currentAnalysis?.missing_information) ? currentAnalysis.missing_information.length : 0;
  const conflictCount = Array.isArray(currentAnalysis?.conflicting_claims) ? currentAnalysis.conflicting_claims.length : 0;
  const renderAnalysisValue = (value) => {
    if (value === null || value === undefined || value === "") return "Not provided";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((entry) => typeof entry === "object" ? JSON.stringify(entry) : String(entry)).join(", ");
    return Object.entries(value).map(([key, entry]) => `${key.replaceAll("_", " ")}: ${renderAnalysisValue(entry)}`).join(" · ");
  };

  const AnalysisItems = ({ items, emptyText }) => (
    Array.isArray(items) && items.length > 0
      ? <div className="analysis-items">
          {items.map((item, index) => (
            <article className="analysis-item" key={item.id || index}>
              {typeof item === "string"
                ? <p>{item}</p>
                : Object.entries(item || {}).map(([key, value]) => (
                    <p key={key}><strong>{key.replaceAll("_", " ")}:</strong> {renderAnalysisValue(value)}</p>
                  ))}
            </article>
          ))}
        </div>
      : <p className="muted-text">{emptyText}</p>
  );

  const openCase = (item) => {
    setActiveCase(item.id);
    setAnalysisResult(null);
    setAnalysisError("");
    go("investigations");
  };

  const deleteCase = async (item) => {
    if (!window.confirm(`Delete “${item.title}” and its saved evidence? This cannot be undone.`)) return;
    if (!item.backendId) {
      notify("This investigation is not saved on the server, so it cannot be deleted here.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/investigations/${item.backendId}`, { method: "DELETE" });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Delete failed (${response.status})`);
      }
      const remaining = cases.filter((entry) => entry.id !== item.id);
      setCases(remaining);
      try { localStorage.setItem("shinchan-research-cases", JSON.stringify(remaining)); } catch {}
      if (activeCase === item.id) {
        setActiveCase(remaining[0]?.id || "");
        setAnalysisResult(null);
        setAnalysisError("");
      }
      notify("Investigation deleted.");
    } catch (error) {
      console.error("Could not delete investigation:", error);
      notify("Could not delete investigation. Check that the server supports deleting investigations.");
    }
  };

  const title = navItems.find((item) => item.id === page)?.label || "Research Dashboard";

  const CaseRow = ({ item }) => (
    <div className="research-row-container" style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
      <button className="research-row" style={{ flex: 1, minWidth: 0 }} onClick={() => openCase(item)}>
        <span className={`folder-tile ${item.tone}`}><Folder size={39} strokeWidth={1.8} /></span>
        <span className="research-row-main">
          <strong>{item.title}</strong>
          <span className="research-row-meta">
            <span><FileText size={17} /> {item.sources} sources</span>
            <span className={item.status === "Completed" ? "status-complete" : "status-progress"}>
              <i /> {item.status}
            </span>
          </span>
        </span>
        <span className={`category-pill ${item.tone}`}>{item.category}</span>
        <span className="research-row-date">{item.date}</span>
        <ChevronRight className="row-chevron" size={22} />
      </button>
      <button type="button" onClick={() => deleteCase(item)} title="Delete investigation" aria-label={`Delete ${item.title}`} style={{ border: "1px solid #f1c9c9", borderRadius: 10, background: "#fff", color: "#b42318", padding: "0 12px", cursor: "pointer" }}>
        <Trash2 size={18} />
      </button>
    </div>
  );

  const EmptyFeature = ({ emoji, kicker, heading, description, action, onAction }) => (
    <div className="feature-empty">
      <div className="empty-emoji">{emoji}</div>
      <span className="section-kicker">{kicker}</span>
      <h2>{heading}</h2>
      <p>{description}</p>
      {action && <button className="red-button" onClick={onAction}><Plus size={18} /> {action}</button>}
    </div>
  );

  return (
    <div className="app-shell">
      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <img src="/shinchan-avatar.png" alt="" className="brand-avatar" />
          <div className="brand-copy">
            <strong>Shinchan’s</strong>
            <b>MYSTERY FILES</b>
            <small>INFORMATION GAP DETECTIVE</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => go(id)}>
              <Icon size={25} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-illustration">
          <img src="/sidebar-art.png" alt="Shinchan and Shiro investigating" />
        </div>

        <button className="settings-link" onClick={() => notify("Settings will be available in a later update.")}>
          <Settings size={24} /> <span>Settings</span>
        </button>
        <div className="sidebar-profile">
          <img src="/shinchan-avatar.png" alt="" />
          <div><strong>Researcher</strong><span>Keep investigating!</span></div>
          <ChevronRight size={24} />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={24} /></button>
          <div className="global-search">
            <Search size={23} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your investigations, sources..." />
            {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}
          </div>
          <div className="topbar-actions" title={backendStatus === "connected" ? "Connected" : backendStatus === "offline" ? "Unavailable" : "Connecting"}>
            <button className="notification-button" onClick={() => notify("You are all caught up.")} aria-label="Notifications"><Bell size={25} /><i /></button>
            <img className="top-avatar" src="/shinchan-avatar.png" alt="Researcher profile" />
          </div>
        </header>

        <div className="page-content">
          {page === "dashboard" && (
            <>
              <section className="hero-banner">
                <div className="hero-copy">
                  <span className="hero-greeting">Hey Researcher!</span>
                  <h1>Ready to uncover<br />what’s <em>missing?</em></h1>
                  <p>Collect sources, find information gaps, detect<br className="desktop-break" /> conflicting claims and verify the truth with AI.</p>
                  <button className="hero-cta" onClick={startNew}><Plus size={25} /> Start a New Investigation</button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <img src="/hero-art.png" alt="" />
                </div>
              </section>

              <section className="stats-grid">
                <div className="stat-card stat-yellow">
                  <div className="stat-icon"><FileText size={35} /></div>
                  <div className="stat-content"><span>Total Investigations</span><strong>{cases.length}</strong><small>Active research topics</small></div>
                  <img src="/stat-mascot.png" alt="" className="stat-decoration mascot-one" />
                  <span className="stat-rays">〃</span>
                </div>
                <div className="stat-card stat-blue">
                  <div className="stat-icon"><Globe size={38} /></div>
                  <div className="stat-content"><span>Evidence Sources</span><strong>{totalSources}</strong><small>Web pages and documents</small></div>
                  <span className="laptop-doodle">▱</span><span className="stat-rays">〃</span>
                </div>
                <div className="stat-card stat-pink">
                  <div className="stat-icon"><Lightbulb size={35} /></div>
                  <div className="stat-content"><span>Missing Information</span><strong>{missingCount}</strong><small>Key gaps identified</small></div>
                  <img src="/stat-missing.png" alt="" className="stat-decoration mascot-missing" />
                  <span className="question-doodle">?</span>
                </div>
                <div className="stat-card stat-green">
                  <div className="stat-icon"><Scale size={37} /></div>
                  <div className="stat-content"><span>Conflicting Claims</span><strong>{conflictCount}</strong><small>Contradictions found</small></div>
                  <img src="/stat-conflict.png" alt="" className="stat-decoration mascot-conflict" />
                  <span className="stat-rays">〃</span>
                </div>
              </section>

              <section className="dashboard-lower">
                <div className="recent-panel">
                  <div className="panel-heading">
                    <div><Folder size={27} fill="#ffd34d" strokeWidth={2.2} /><h2>Recent Investigations</h2></div>
                    <button onClick={() => go("investigations")}>View all <ArrowRight size={19} /></button>
                  </div>
                  <div className="research-list">
                    {filteredCases.slice(0, 3).map((item) => <CaseRow key={item.id} item={item} />)}
                    {filteredCases.length === 0 && <p className="no-results">No investigations match your search.</p>}
                  </div>
                </div>

                <div className="right-column">
                  <div className="quick-panel">
                    <div className="panel-heading compact"><div><span className="bolt">ϟ</span><h2>Quick Actions</h2></div></div>
                    <div className="quick-grid">
                      <button className="quick-action quick-red" onClick={startNew}><span><Plus size={25} /></span><b>New<br />Investigation</b></button>
                      <button className="quick-action quick-blue" onClick={() => go("sources")}><span><Link2 size={25} /></span><b>Add<br />Evidence Source</b></button>
                      <button className="quick-action quick-yellow" onClick={() => go("gaps")}><span><Lightbulb size={25} /></span><b>View<br />Missing Information</b></button>
                      <button className="quick-action quick-green" onClick={() => go("conflicts")}><span><Scale size={25} /></span><b>Check<br />Conflicting Claims</b></button>
                    </div>
                  </div>
                  <div className="tip-panel">
                    <img src="/shinchan-avatar.png" alt="" />
                    <div><h3>Today’s Tip</h3><p>Always check multiple sources.<br />One source can be incomplete<br />or misleading!</p></div>
                    <span className="tip-rays">〃</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {page === "investigations" && (
            <section className="inner-page">
              <div className="inner-title"><span className="section-kicker">YOUR RESEARCH</span><h1>Investigations</h1><p>Create and manage your research topics and their evidence sources.</p></div>
              <div className="inner-toolbar"><button className="red-button" onClick={startNew}><Plus size={18} /> New Investigation</button></div>
              <div className="investigation-list">{filteredCases.map((item) => <CaseRow key={item.id} item={item} />)}</div>
              {filteredCases.length === 0 && <p className="no-results">No investigations match your search.</p>}
              {selected && <div className="selected-card">
                <span className="section-kicker">SELECTED INVESTIGATION</span>
                <h2>{selected.title}</h2>
                <p>{selected.id} · {selected.sources} evidence sources · {selected.status}</p>
                <div className="analysis-actions">
                  <button className="red-button" onClick={runAnalysis} disabled={analysisLoading || !selected.backendId || !selected.sources}>
                    <Sparkles size={18} /> {analysisLoading ? "Analysing (usually takes a little while)..." : "Analyse Investigation"}
                  </button>
                  <button className="text-link" onClick={() => go("sources")}>Manage evidence sources <ArrowRight size={17} /></button>
                </div>
                {!selected.sources && <p className="muted-text">Add at least one evidence source to enable AI analysis.</p>}
                {analysisError && <p className="analysis-error">{analysisError}</p>}
              </div>}
              {currentAnalysis && (
                <section className="content-card analysis-report">
                  <div className="analysis-report-heading">
                    <div><span className="section-kicker">RESEARCH REPORT</span><h2>Analysis Results</h2></div>
                    <span className="analysis-model">{analysisResult.model || "AI analysis"}</span>
                  </div>
                  <h3>AI Summary</h3>
                  <p>{currentAnalysis.summary || "No summary returned."}</p>
                  <h3>Missing Information</h3>
                  <AnalysisItems items={currentAnalysis.missing_information} emptyText="No information gaps were identified." />
                  <h3>Conflicting Claims</h3>
                  <AnalysisItems items={currentAnalysis.conflicting_claims} emptyText="No conflicting claims were identified." />
                  <h3>Potentially Outdated Information</h3>
                  <AnalysisItems items={currentAnalysis.potentially_outdated} emptyText="No potentially outdated information was identified." />
                  <h3>Verification Checklist</h3>
                  <AnalysisItems items={currentAnalysis.verification_checklist} emptyText="No verification tasks were returned." />
                </section>
              )}
            </section>
          )}

          {page === "sources" && (
            <section className="inner-page">
              <div className="inner-title"><span className="section-kicker">COLLECT EVIDENCE</span><h1>Evidence Sources</h1><p>Add web pages and document references to a research investigation.</p></div>
              <div className="content-card source-card">
                <label htmlFor="source-case">SELECT INVESTIGATION</label>
                <select id="source-case" value={activeCase} onChange={(e) => { setActiveCase(e.target.value); setAnalysisResult(null); setAnalysisError(""); }}>
                  {cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <label htmlFor="source-url">SOURCE URL OR REFERENCE</label>
                <div className="source-entry"><Link2 size={20} /><input id="source-url" value={sourceDraft} onChange={(e) => setSourceDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSourceToSelected()} placeholder="Paste a source URL or reference..." /><button onClick={addSourceToSelected}><Plus size={18} /> Add source</button></div>
                <div className="source-note"><CircleCheck size={18} /> Website sources are saved to this investigation. You can review them below.</div>
                <h3>Sources in this investigation</h3>
                {(selected?.sourceList || []).length ? (selected.sourceList || []).map((source) => <div className="source-row" key={source.id}><Globe size={18} /><span><strong>{source.title || source.url}</strong>{source.title && <small className="source-url-text">{source.url}</small>}<small className="source-url-text">{source.status || "Saved"}</small></span><a href={source.url?.startsWith("http") ? source.url : `https://${source.url}`} target="_blank" rel="noreferrer" aria-label="Open source"><ExternalLink size={16} /></a></div>) : <p className="muted-text">No evidence sources have been added to this investigation yet.</p>}
              </div>
            </section>
          )}

          {page === "gaps" && <section className="inner-page"><div className="inner-title"><span className="section-kicker">RESEARCH ANALYSIS</span><h1>Missing Information</h1><p>Information gaps identified by comparing your research question with collected evidence.</p></div>{currentAnalysis ? <div className="content-card analysis-report"><h2>Findings for {selected?.title}</h2><AnalysisItems items={currentAnalysis.missing_information} emptyText="No information gaps were identified." /></div> : <EmptyFeature emoji="💡" kicker="INFORMATION GAP ANALYSIS" heading="Findings will appear here" description="Select an investigation and run Analyse Investigation to identify unanswered questions." action="Go to Investigations" onAction={() => go("investigations")} />}</section>}

          {page === "conflicts" && <section className="inner-page"><div className="inner-title"><span className="section-kicker">CLAIM COMPARISON</span><h1>Conflicting Claims</h1><p>Review statements that differ across your collected evidence sources.</p></div>{currentAnalysis ? <div className="content-card analysis-report"><h2>Findings for {selected?.title}</h2><AnalysisItems items={currentAnalysis.conflicting_claims} emptyText="No conflicting claims were identified." /></div> : <EmptyFeature emoji="⚖️" kicker="CLAIM VERIFICATION" heading="No claim comparisons yet" description="Select an investigation and run AI analysis to compare statements across sources." action="Go to Investigations" onAction={() => go("investigations")} />}</section>}

          {page === "outdated" && <section className="inner-page"><div className="inner-title"><span className="section-kicker">SOURCE REVIEW</span><h1>Outdated Sources</h1><p>Review publication dates and identify evidence that may need an updated reference.</p></div>{currentAnalysis ? <div className="content-card analysis-report"><h2>Findings for {selected?.title}</h2><AnalysisItems items={currentAnalysis.potentially_outdated} emptyText="No potentially outdated information was identified." /></div> : <EmptyFeature emoji="🗓️" kicker="SOURCE FRESHNESS" heading="Date checks will appear here" description="Select an investigation and run AI analysis to review potentially outdated information." action="Go to Investigations" onAction={() => go("investigations")} />}</section>}

          {page === "checklist" && <section className="inner-page"><div className="inner-title"><span className="section-kicker">RESEARCH QUALITY</span><h1>Verification Checklist</h1><p>Track the checks to complete before relying on research findings.</p></div>{currentAnalysis ? <div className="content-card analysis-report"><h2>AI Verification Tasks · {selected?.title}</h2><AnalysisItems items={currentAnalysis.verification_checklist} emptyText="No verification tasks were returned." /></div> : <div className="content-card checklist-card">{checks.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={(e) => setChecks((old) => old.map((x) => x.id === item.id ? { ...x, done: e.target.checked } : x))} /><span className={item.done ? "checked" : ""}>{item.text}</span></label>)}<p className="check-progress">{checks.filter((x) => x.done).length} of {checks.length} verification checks completed</p></div>}</section>}

          {page === "reports" && (
            <section className="inner-page">
              <div className="inner-title">
                <span className="section-kicker">RESEARCH OUTPUT</span>
                <h1>Research Reports</h1>
                <p>Review the latest analysis for your selected investigation.</p>
              </div>
              {currentAnalysis ? (
                <section className="content-card analysis-report">
                  <div className="analysis-report-heading">
                    <div><span className="section-kicker">RESEARCH REPORT</span><h2>{selected?.title || "Investigation report"}</h2></div>
                    <button className="red-button" onClick={() => window.print()}><FileText size={18} /> Print / Save PDF</button>
                  </div>
                  <p>{currentAnalysis.summary || "No summary returned."}</p>
                  <h3>Missing Information</h3>
                  <AnalysisItems items={currentAnalysis.missing_information} emptyText="No information gaps were identified." />
                  <h3>Conflicting Claims</h3>
                  <AnalysisItems items={currentAnalysis.conflicting_claims} emptyText="No conflicting claims were identified." />
                  <h3>Potentially Outdated Information</h3>
                  <AnalysisItems items={currentAnalysis.potentially_outdated} emptyText="No potentially outdated information was identified." />
                  <h3>Verification Checklist</h3>
                  <AnalysisItems items={currentAnalysis.verification_checklist} emptyText="No verification tasks were returned." />
                </section>
              ) : (
                <EmptyFeature emoji="📄" kicker="RESEARCH REPORTS" heading="No report yet" description="Run Analyse Investigation after adding evidence sources. The results will appear here." action="View Investigations" onAction={() => go("investigations")} />
              )}
            </section>
          )}

          <footer className="page-footer"><strong>SHINCHAN’S MYSTERY FILES</strong><span>Collect sources · Find gaps · Verify the truth</span></footer>
        </div>
      </main>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <form className="investigation-modal" onSubmit={createCase}>
            <div className="modal-head"><div><span className="section-kicker">NEW INVESTIGATION</span><h2>What are you researching?</h2></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={22} /></button></div>
            <p className="modal-intro">Give your investigation a title and research question. Description is optional.</p>
            <label htmlFor="research-title">INVESTIGATION TITLE</label>
            <input id="research-title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} placeholder="Example: Scholarship Scam Research" required />
            <label htmlFor="research-description">DESCRIPTION <span className="optional-label">(OPTIONAL)</span></label>
            <textarea id="research-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a short note about what you want to investigate..." rows={2} />
            <label htmlFor="research-question">RESEARCH QUESTION</label>
            <textarea id="research-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Example: How can students identify fake scholarship websites?" rows={3} required />
            <label htmlFor="draft-source">ADD EVIDENCE SOURCES</label>
            <div className="source-entry"><Link2 size={19} /><input id="draft-source" value={sourceDraft} onChange={(e) => setSourceDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraftSource(); } }} placeholder="Paste a source URL or source reference..." /><button type="button" onClick={addDraftSource}><Plus size={18} /> Add</button></div>
            {draftSources.map((source) => <div className="draft-source" key={source.id}><Globe size={16} /><span>{source.url}</span><button type="button" onClick={() => setDraftSources((old) => old.filter((x) => x.id !== source.id))}><Trash2 size={16} /></button></div>)}
            <div className="modal-note"><CircleCheck size={18} /> Your investigation and collected website sources will be saved. You can analyse the evidence after creating it.</div>
            <button className="red-button modal-submit" type="submit"><Plus size={18} /> Create Investigation</button>
          </form>
        </div>
      )}

      {toast && <div className="toast"><Check size={18} /> {toast}</div>}
    </div>
  );
}

export default App;
