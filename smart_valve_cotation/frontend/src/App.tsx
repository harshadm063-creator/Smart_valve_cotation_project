import { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  DollarSign,
  Plus,
  RefreshCw,
  Download,
  Copy,
  Trash2,
  Search,
  Filter,
  Sliders,
  Settings,
  ArrowRight,
  Info,
  Check,
  FileCheck,
  Eye,
  FileSpreadsheet
} from 'lucide-react';

import type {
  EquipmentConfig,
  BOMItem,
  EstimateCalculationResponse,
  QuotationDetail,
  QuotationSummary,
  ExtractionResponse,
  MaterialItem,
  ProcessingRateItem,
  BoughtOutItem,
  ActuationPackage
} from './types';

import {
  extractPdfSpecifications,
  calculateEstimatePreview,
  saveEstimate,
  listEstimates,
  getEstimate,
  updateEstimate,
  duplicateEstimate,
  recalculateEstimate,
  issueQuotation,
  getQuotationPdfUrl,
  listMaterials,
  updateMaterial,
  listProcessingRates,
  updateProcessingRate,
  listBoughtOutItems,
  createBoughtOutItem,
  listActuationPackages
} from './api';

// Currency formatter
function formatINR(val: number = 0): string {
  try {
    const s = Math.round(val).toString();
    const lastThree = s.substring(s.length - 3);
    const otherNumbers = s.substring(0, s.length - 3);
    if (otherNumbers !== '') {
      return '₹' + otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
    }
    return '₹' + lastThree;
  } catch {
    return `₹${val.toFixed(2)}`;
  }
}

export default function App() {
  // Navigation tabs: 'dashboard', 'new', 'bom_editor', 'results', 'preview', 'saved', 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new' | 'bom_editor' | 'results' | 'preview' | 'saved' | 'admin'>('dashboard');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dashboard state
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // New quotation input mode: 'pdf' or 'manual'
  const [inputMode, setInputMode] = useState<'pdf' | 'manual'>('manual');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResponse | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Active Equipment Configuration state
  const [currentConfig, setCurrentConfig] = useState<EquipmentConfig>({
    customer_name: 'National Thermal Power Corporation',
    contact_person: 'Mr. Rajesh Sharma',
    email: 'rsharma@ntpc.co.in',
    phone: '+91 98765 43210',
    project_name: 'Supercritical Thermal FGD Unit',
    rfq_number: 'RFQ-NTPC-FGD-2026-904',
    delivery_location: 'Ramagundam Site, Telangana',
    equipment_type: 'Rack & Pinion Damper',
    tag_number: 'DMP-FGD-ISOL-01',
    quantity: 1,
    length: 1600,
    width_diameter: 1400,
    depth: 450,
    body_material: 'IS 2062',
    flap_disc_material: 'SS 304 L',
    actuation_type: 'Pneumatic',
    remarks: 'Flue gas application with graphite packing and metallic seats.',
    tax_percent: 18,
    margin_percent: 15,
    status: 'Draft',
    custom_bom: []
  });

  // Active calculation / estimate details
  const [estimateResult, setEstimateResult] = useState<EstimateCalculationResponse | null>(null);
  const [savedQuoteDetail, setSavedQuoteDetail] = useState<QuotationDetail | null>(null);

  // Admin state
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [procRates, setProcRates] = useState<ProcessingRateItem[]>([]);
  const [boughtOutItems, setBoughtOutItems] = useState<BoughtOutItem[]>([]);
  const [actuationPackages, setActuationPackages] = useState<ActuationPackage[]>([]);

  // Load initial options & dashboard quotations
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      const quoteList = await listEstimates();
      setQuotations(quoteList);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to initialize app');
    } finally {
      setLoading(false);
    }
  }

  async function refreshQuotations() {
    try {
      const list = await listEstimates(searchQuery, filterType, filterStatus);
      setQuotations(list);
    } catch (err: any) {
      console.error(err);
    }
  }

  // Flash message handler
  function showToast(msg: string, isError = false) {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 6000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  // --- PDF Import & Extraction Workflow ---
  async function handleFileUpload(file: File) {
    setPdfFile(file);
    setIsExtracting(true);
    setErrorMsg(null);
    try {
      const result = await extractPdfSpecifications(file);
      setExtractionResult(result);
      
      // Auto-populate detected fields into currentConfig
      const fields = result.extracted_fields;
      setCurrentConfig(prev => ({
        ...prev,
        customer_name: fields.customer_name?.value || prev.customer_name,
        rfq_number: fields.rfq_number?.value || prev.rfq_number,
        equipment_type: fields.equipment_type?.value || prev.equipment_type,
        tag_number: fields.tag_number?.value || prev.tag_number,
        quantity: fields.quantity?.value ? Number(fields.quantity.value) : prev.quantity,
        length: fields.length?.value ? Number(fields.length.value) : prev.length,
        width_diameter: fields.width_diameter?.value ? Number(fields.width_diameter.value) : prev.width_diameter,
        depth: fields.depth?.value ? Number(fields.depth.value) : prev.depth,
        body_material: fields.body_material?.value || prev.body_material,
        flap_disc_material: fields.flap_disc_material?.value || prev.flap_disc_material,
        actuation_type: fields.actuation_type?.value || prev.actuation_type,
      }));

      showToast(`Successfully parsed "${file.name}". Please verify extracted parameters below.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to parse technical specification PDF', true);
    } finally {
      setIsExtracting(false);
    }
  }

  // Quick test button for sample PDF
  async function loadSamplePdf() {
    try {
      setIsExtracting(true);
      const res = await fetch('/api/v1/sample-spec-pdf');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_customer_damper_spec.pdf', { type: 'application/pdf' });
      await handleFileUpload(sampleFile);
    } catch (err: any) {
      showToast('Could not load sample PDF. You can upload any customer specification PDF directly.', true);
      setIsExtracting(false);
    }
  }

  // --- Calculation & BOM Generation ---
  async function handleProceedToBOM() {
    // Validate required dimensions
    if (!currentConfig.length || currentConfig.length < 100) {
      showToast('Please enter a valid length (minimum 100 mm)', true);
      return;
    }
    if (!currentConfig.width_diameter || currentConfig.width_diameter < 100) {
      showToast('Please enter a valid width/diameter (minimum 100 mm)', true);
      return;
    }
    if (!currentConfig.depth || currentConfig.depth < 50) {
      showToast('Please enter a valid casing depth (minimum 50 mm)', true);
      return;
    }

    try {
      setLoading(true);
      const res = await calculateEstimatePreview(currentConfig);
      setEstimateResult(res);
      setCurrentConfig(prev => ({ ...prev, custom_bom: res.bom_items }));
      setActiveTab('bom_editor');
      showToast('Standard Bill of Materials generated according to engineering rules.');
    } catch (err: any) {
      showToast(err.message || 'Error generating BOM', true);
    } finally {
      setLoading(false);
    }
  }

  // --- Real-time Recalculate BOM changes ---
  async function handleRecalculateBOM(updatedBom: BOMItem[]) {
    try {
      const updatedConfig = { ...currentConfig, custom_bom: updatedBom };
      setCurrentConfig(updatedConfig);
      const res = await calculateEstimatePreview(updatedConfig);
      setEstimateResult(res);
    } catch (err: any) {
      showToast(err.message || 'Recalculation error', true);
    }
  }

  // --- Save / Issue Quotation ---
  async function handleSaveQuotation(status: string = 'Draft') {
    try {
      setLoading(true);
      const payload = {
        ...currentConfig,
        custom_bom: estimateResult?.bom_items || currentConfig.custom_bom,
        status: status
      };
      
      let saved: QuotationDetail;
      if (savedQuoteDetail && savedQuoteDetail.id) {
        saved = await updateEstimate(savedQuoteDetail.id, payload);
      } else {
        saved = await saveEstimate(payload);
      }

      setSavedQuoteDetail(saved);
      showToast(`Quotation ${saved.quote_number} (Rev ${saved.revision}) saved as ${saved.status}!`);
      await refreshQuotations();
      setActiveTab('preview');
    } catch (err: any) {
      showToast(err.message || 'Failed to save quotation', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSavedQuote(id: number) {
    try {
      setLoading(true);
      const detail = await getEstimate(id);
      setSavedQuoteDetail(detail);
      setCurrentConfig({
        customer_name: detail.customer_name,
        contact_person: detail.contact_person,
        email: detail.email,
        phone: detail.phone,
        project_name: detail.project_name,
        rfq_number: detail.rfq_number,
        delivery_location: detail.delivery_location,
        equipment_type: detail.equipment_type,
        tag_number: detail.tag_number,
        quantity: detail.quantity,
        length: detail.length,
        width_diameter: detail.width_diameter,
        depth: detail.depth,
        body_material: detail.body_material,
        flap_disc_material: detail.flap_disc_material,
        actuation_type: detail.actuation_type,
        remarks: detail.remarks,
        tax_percent: detail.cost_breakdown.tax_percent,
        margin_percent: detail.cost_breakdown.margin_percent,
        status: detail.status,
        custom_bom: detail.bom_items
      });
      // Run preview calculation
      const res = await calculateEstimatePreview({
        ...detail,
        custom_bom: detail.bom_items,
        tax_percent: detail.cost_breakdown.tax_percent,
        margin_percent: detail.cost_breakdown.margin_percent
      });
      setEstimateResult(res);
      setActiveTab('preview');
    } catch (err: any) {
      showToast(err.message || 'Failed to open quotation', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleDuplicateQuote(id: number) {
    try {
      setLoading(true);
      const dup = await duplicateEstimate(id);
      showToast(`Duplicated into new draft ${dup.quote_number}`);
      await refreshQuotations();
      await handleLoadSavedQuote(dup.id);
    } catch (err: any) {
      showToast(err.message || 'Duplicate failed', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecalculateCurrentRates(id: number) {
    try {
      setLoading(true);
      const rec = await recalculateEstimate(id);
      showToast(`Recalculated ${rec.quote_number} with latest database rates (now Revision R${rec.revision})`);
      await refreshQuotations();
      await handleLoadSavedQuote(rec.id);
    } catch (err: any) {
      showToast(err.message || 'Recalculation failed', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleIssueCurrentQuote() {
    if (!savedQuoteDetail) return;
    try {
      setLoading(true);
      const issued = await issueQuotation(savedQuoteDetail.id);
      setSavedQuoteDetail(issued);
      showToast(`Quotation ${issued.quote_number} successfully marked as Officially ISSUED!`);
      await refreshQuotations();
    } catch (err: any) {
      showToast(err.message || 'Failed to issue quotation', true);
    } finally {
      setLoading(false);
    }
  }

  // --- Admin Data Load ---
  async function loadAdminData() {
    try {
      setLoading(true);
      const [mats, prs, bo, acts] = await Promise.all([
        listMaterials(),
        listProcessingRates(),
        listBoughtOutItems(),
        listActuationPackages()
      ]);
      setMaterials(mats);
      setProcRates(prs);
      setBoughtOutItems(bo);
      setActuationPackages(acts);
    } catch (err: any) {
      showToast(err.message || 'Failed to load pricing database', true);
    } finally {
      setLoading(false);
    }
  }

  // Calculate dashboard stats
  const totalQuotesCount = quotations.length;
  const draftQuotesCount = quotations.filter(q => q.status === 'Draft').length;
  const completedQuotesCount = quotations.filter(q => q.status === 'Validated' || q.status === 'Issued').length;
  const totalEstimatedValue = quotations.reduce((acc, q) => acc + q.final_amount, 0);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between shrink-0 shadow-xl border-r border-slate-800">
        <div>
          {/* Brand Logo & Name */}
          <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center text-slate-900 font-black shadow-md text-xl tracking-tighter">
              SV
            </div>
            <div>
              <h1 className="font-bold text-base text-white tracking-tight leading-tight">
                Smart Valve & Damper
              </h1>
              <p className="text-xs text-amber-400 font-medium tracking-wide uppercase">
                Estimation Platform
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1 text-sm font-medium">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setSavedQuoteDetail(null);
                setActiveTab('new');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'new'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Create New Quotation</span>
            </button>

            {estimateResult && (
              <>
                <button
                  onClick={() => setActiveTab('bom_editor')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeTab === 'bom_editor'
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>BOM & Weight Editor</span>
                </button>

                <button
                  onClick={() => setActiveTab('results')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeTab === 'results'
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Cost Estimation</span>
                </button>
              </>
            )}

            {savedQuoteDetail && (
              <button
                onClick={() => setActiveTab('preview')}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <FileCheck className="h-4 w-4" />
                <span>Quotation Preview</span>
              </button>
            )}

            <button
              onClick={() => {
                refreshQuotations();
                setActiveTab('saved');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'saved'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Saved Quotations</span>
            </button>

            <button
              onClick={() => {
                loadAdminData();
                setActiveTab('admin');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'admin'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Pricing Administration</span>
            </button>
          </nav>
        </div>

        {/* System Status Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-300">Engine Online</span>
            </span>
            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">
              v1.0.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Compliant with ASME & AMCA engineering estimation standards.
          </p>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-slate-100">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <span className="font-medium text-slate-800">Smart Valve</span>
            <span>/</span>
            <span className="capitalize font-semibold text-amber-600">
              {activeTab === 'new' ? 'New Quotation Setup' : activeTab.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setSavedQuoteDetail(null);
                setActiveTab('new');
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Quotation</span>
            </button>
          </div>
        </header>

        {/* Notification Toast Banners */}
        {errorMsg && (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-3 mx-6 mt-4 rounded-r-md flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2 text-rose-800 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700 text-xs font-bold">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 mx-6 mt-4 rounded-r-md flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2 text-emerald-800 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 text-xs font-bold">✕</button>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="p-6 space-y-6">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Quotations</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{totalQuotesCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Draft Estimates</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{draftQuotesCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Validated / Issued</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{completedQuotesCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pipeline Value</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totalEstimatedValue)}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Recent Quotations Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Recent Engineering Quotations</h2>
                  <p className="text-xs text-slate-500">Live estimates generated from the centralized cost database</p>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customer, quote #..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && refreshQuotations()}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-52"
                    />
                  </div>
                  <button
                    onClick={refreshQuotations}
                    className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600"
                    title="Refresh list"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {quotations.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">No quotations found in the database</p>
                  <p className="text-xs text-slate-400 mt-1">Get started by creating your first technical quotation.</p>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="mt-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs px-4 py-2 rounded-lg"
                  >
                    Create New Quotation
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Quote No</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Equipment Type</th>
                        <th className="py-3 px-4">Size Class</th>
                        <th className="py-3 px-4">Calculated Wt</th>
                        <th className="py-3 px-4">Estimated Value</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quotations.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {q.quote_number} <span className="text-[10px] text-slate-400 font-normal">R{q.revision}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-800">{q.customer_name}</span>
                            {q.project_name && <span className="block text-[11px] text-slate-400">{q.project_name}</span>}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700">{q.equipment_type}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              q.size_category === 'SMALL' ? 'bg-blue-50 text-blue-700' :
                              q.size_category === 'MEDIUM' ? 'bg-amber-50 text-amber-700' :
                              'bg-purple-50 text-purple-700'
                            }`}>
                              {q.size_category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">{q.total_weight_kg.toFixed(1)} kg</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{formatINR(q.final_amount)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              q.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' :
                              q.status === 'Validated' ? 'bg-blue-100 text-blue-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {q.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1">
                            <button
                              onClick={() => handleLoadSavedQuote(q.id)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-700"
                              title="View & Preview"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicateQuote(q.id)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-700"
                              title="Duplicate Quote"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={getQuotationPdfUrl(q.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block p-1 hover:bg-amber-100 text-amber-700 rounded"
                              title="Download Quotation PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: NEW QUOTATION (Option A: PDF Import, Option B: Manual) */}
        {activeTab === 'new' && (
          <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-200 gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Create New Quotation</h2>
                <p className="text-xs text-slate-500">Configure equipment specifications to generate verified BOM and manufacturing cost.</p>
              </div>

              {/* Mode Toggle Button */}
              <div className="bg-slate-200 p-1 rounded-lg flex space-x-1 text-xs font-semibold">
                <button
                  onClick={() => setInputMode('pdf')}
                  className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all ${
                    inputMode === 'pdf' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Option A: PDF Import</span>
                </button>
                <button
                  onClick={() => setInputMode('manual')}
                  className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all ${
                    inputMode === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Option B: Manual Configuration</span>
                </button>
              </div>
            </div>

            {/* OPTION A: PDF UPLOADER & EXTRACTION REVIEW */}
            {inputMode === 'pdf' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-amber-500 transition-colors">
                  <UploadCloud className="h-10 w-10 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">
                    Upload Customer Specification PDF
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Supports digital specification sheets, equipment data sheets, and RFQ inquiries.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm">
                      Select PDF File
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>

                    <button
                      onClick={loadSamplePdf}
                      disabled={isExtracting}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold px-4 py-2 rounded-lg border border-amber-300 shadow-xs"
                    >
                      {isExtracting ? 'Extracting...' : 'Load NTPC Damper Test PDF'}
                    </button>
                  </div>

                  {pdfFile && (
                    <p className="mt-3 text-xs text-slate-600 font-mono">
                      Selected: <strong>{pdfFile.name}</strong> ({(pdfFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                {/* Extraction Results Grid */}
                {extractionResult && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                          <FileCheck className="h-4 w-4 text-emerald-600" />
                          <span>Extracted Specifications Review</span>
                        </h3>
                        <p className="text-xs text-slate-500">
                          Verify extracted values below. Never assume unverified fields without checking.
                        </p>
                      </div>
                      <span className="text-[11px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
                        Document Pages: {extractionResult.total_pages}
                      </span>
                    </div>

                    {/* Extracted Fields Table */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {Object.entries(extractionResult.extracted_fields).map(([key, field]) => (
                        <div key={key} className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 flex flex-col justify-between">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{field.label}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              field.status === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                              field.status === 'uncertain' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-200 text-slate-600'
                            }`}>
                              {field.status} ({(field.confidence * 100).toFixed(0)}%)
                            </span>
                          </div>

                          <div className="mt-2">
                            <input
                              type="text"
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setExtractionResult(prev => prev ? ({
                                  ...prev,
                                  extracted_fields: {
                                    ...prev.extracted_fields,
                                    [key]: { ...field, value: val }
                                  }
                                }) : null);
                                setCurrentConfig(prev => ({ ...prev, [key]: val }));
                              }}
                              className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-amber-500"
                            />
                          </div>

                          {field.source_snippet && (
                            <p className="mt-1 text-[10px] text-slate-400 truncate" title={field.source_snippet}>
                              Snippet: "{field.source_snippet}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Additional Extracted Information (pressure, temp, fluid) */}
                    {extractionResult.additional_information.length > 0 && (
                      <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 text-xs">
                        <h4 className="font-bold text-amber-900 mb-1 flex items-center space-x-1.5">
                          <Info className="h-3.5 w-3.5 text-amber-700" />
                          <span>Additional Engineering Specifications Detected:</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {extractionResult.additional_information.map((item, idx) => (
                            <div key={idx} className="bg-white/80 p-2 rounded border border-amber-200/60">
                              <span className="font-semibold text-slate-700">{item.label}: </span>
                              <span className="text-slate-900">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SPECIFICATION ENTRY FORM */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* Section 1: Customer Information */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">
                  1. Customer & Project Reference
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Company / Customer Name *</label>
                    <input
                      type="text"
                      value={currentConfig.customer_name}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, customer_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. NTPC Ltd"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={currentConfig.contact_person || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, contact_person: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. Chief Engineer"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email / Phone</label>
                    <input
                      type="text"
                      value={currentConfig.email || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, email: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. engineer@client.com"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Project Name</label>
                    <input
                      type="text"
                      value={currentConfig.project_name || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, project_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. FGD Unit 2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Customer RFQ / Inquiry No.</label>
                    <input
                      type="text"
                      value={currentConfig.rfq_number || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, rfq_number: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. RFQ-2026-904"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Delivery Destination</label>
                    <input
                      type="text"
                      value={currentConfig.delivery_location || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, delivery_location: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. Ramagundam Site"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Equipment Configuration */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">
                  2. Technical Equipment Parameters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Equipment Type *</label>
                    <select
                      value={currentConfig.equipment_type}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, equipment_type: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="Rack & Pinion Damper">Rack & Pinion Damper</option>
                      <option value="Butterfly Valve">Butterfly Valve</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Equipment Tag No.</label>
                    <input
                      type="text"
                      value={currentConfig.tag_number || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, tag_number: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. DMP-FGD-01"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Quantity (Units) *</label>
                    <input
                      type="number"
                      min="1"
                      value={currentConfig.quantity}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Dimensions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Length (L) <span className="text-slate-400 font-normal">[mm]</span> *
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={currentConfig.length}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, length: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Valid range: 300 - 10000 mm</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Width / Diameter (W) <span className="text-slate-400 font-normal">[mm]</span> *
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={currentConfig.width_diameter}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, width_diameter: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Valid range: 300 - 10000 mm</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Depth / Face-to-Face (D) <span className="text-slate-400 font-normal">[mm]</span> *
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="2000"
                      value={currentConfig.depth}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, depth: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Valid range: 100 - 2000 mm</span>
                  </div>
                </div>

                {/* Materials and Actuation */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Body / Shell Material *</label>
                    <select
                      value={currentConfig.body_material}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, body_material: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="IS 2062">IS 2062 (Carbon Steel - ₹72/kg)</option>
                      <option value="SS 304 L">SS 304 L (Stainless Steel - ₹250/kg)</option>
                      <option value="SS 316 L">SS 316 L (Austenitic - ₹310/kg)</option>
                      <option value="SS 410">SS 410 (Martensitic - ₹120/kg)</option>
                      <option value="EN8">EN8 (Medium Carbon Steel - ₹95/kg)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Flap / Disc Material *</label>
                    <select
                      value={currentConfig.flap_disc_material}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, flap_disc_material: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="SS 304 L">SS 304 L (Stainless Steel - ₹250/kg)</option>
                      <option value="SS 316 L">SS 316 L (Austenitic - ₹310/kg)</option>
                      <option value="IS 2062">IS 2062 (Carbon Steel - ₹72/kg)</option>
                      <option value="SS 410">SS 410 (Martensitic - ₹120/kg)</option>
                      <option value="EN8">EN8 (Medium Carbon Steel - ₹95/kg)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Actuation Type *</label>
                    <select
                      value={currentConfig.actuation_type}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, actuation_type: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="Pneumatic">Pneumatic Actuator</option>
                      <option value="Electrical">Electrical Motorized Actuator</option>
                      <option value="Manual">Manual (Gearbox / Handwheel)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 text-xs">
                  <label className="block font-semibold text-slate-700 mb-1">Special Engineering Remarks</label>
                  <textarea
                    rows={2}
                    value={currentConfig.remarks || ''}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, remarks: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                    placeholder="Enter special leakage requirements, coating specifications, or warranty terms..."
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleSaveQuotation('Draft')}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs"
                  >
                    Save Draft
                  </button>

                  <button
                    type="button"
                    onClick={handleProceedToBOM}
                    disabled={loading}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>Continue to BOM & Estimation</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BOM AND COMPONENT EDITOR */}
        {activeTab === 'bom_editor' && estimateResult && (
          <div className="p-6 max-w-6xl mx-auto w-full space-y-5">
            {/* Engineering Classification Summary Header */}
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                  {estimateResult.size_category} CATEGORY
                </span>
                <h2 className="text-lg font-bold mt-1 tracking-tight">
                  {estimateResult.equipment_type} — Bill of Materials (BOM)
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Governing Classification: {estimateResult.governing_dimension}
                </p>
              </div>

              <div className="flex items-center space-x-4 bg-slate-800/80 px-4 py-2.5 rounded-lg border border-slate-700">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Weight</p>
                  <p className="text-base font-mono font-bold text-amber-400">
                    {estimateResult.total_weight_kg.toFixed(2)} kg
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-700"></div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Components</p>
                  <p className="text-base font-mono font-bold text-white">
                    {estimateResult.bom_items.length} Parts
                  </p>
                </div>
              </div>
            </div>

            {/* Warnings Alert */}
            {estimateResult.warnings && estimateResult.warnings.length > 0 && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3.5 rounded-r-lg space-y-1">
                <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Engineering Notice & Cost Assumptions:</span>
                </div>
                {estimateResult.warnings.map((w, idx) => (
                  <p key={idx} className="text-xs text-amber-800 pl-6">• {w}</p>
                ))}
              </div>
            )}

            {/* Interactive BOM Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Verified Component Items</h3>
                  <p className="text-xs text-slate-500">Edit dimensions, shapes, and material grades with real-time recalculated weights.</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      // Add new custom item
                      const newItem: BOMItem = {
                        id: (estimateResult.bom_items.length + 1),
                        part_name: 'Custom Fabricated Part',
                        category: 'Auxiliary',
                        shape: 'plate',
                        material_grade: currentConfig.body_material,
                        length: 500,
                        width: 200,
                        thickness: 10,
                        diameter: 0,
                        wall_thickness: 0,
                        quantity: 1,
                        unit_machining_rate: 100
                      };
                      handleRecalculateBOM([...estimateResult.bom_items, newItem]);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Custom Part</span>
                  </button>

                  <button
                    onClick={() => {
                      // Restore standard BOM
                      handleProceedToBOM();
                    }}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 flex items-center space-x-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Restore Standard BOM</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Part Name</th>
                      <th className="py-2.5 px-3">Shape</th>
                      <th className="py-2.5 px-3">Material</th>
                      <th className="py-2.5 px-3">Dimensions (mm)</th>
                      <th className="py-2.5 px-3">Qty</th>
                      <th className="py-2.5 px-3">Unit Wt</th>
                      <th className="py-2.5 px-3">Total Wt</th>
                      <th className="py-2.5 px-3">Raw Mat</th>
                      <th className="py-2.5 px-3">Cutting</th>
                      <th className="py-2.5 px-3">Machining</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {estimateResult.bom_items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.part_name}
                            onChange={(e) => {
                              const updated = [...estimateResult.bom_items];
                              updated[idx].part_name = e.target.value;
                              handleRecalculateBOM(updated);
                            }}
                            className="w-36 font-semibold text-slate-800 border border-slate-200 rounded px-1.5 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={item.shape}
                            onChange={(e) => {
                              const updated = [...estimateResult.bom_items];
                              updated[idx].shape = e.target.value as any;
                              handleRecalculateBOM(updated);
                            }}
                            className="border border-slate-200 rounded px-1.5 py-1 text-xs"
                          >
                            <option value="plate">Plate</option>
                            <option value="round_bar">Round Bar</option>
                            <option value="pipe">Pipe/Tube</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={item.material_grade}
                            onChange={(e) => {
                              const updated = [...estimateResult.bom_items];
                              updated[idx].material_grade = e.target.value;
                              handleRecalculateBOM(updated);
                            }}
                            className="border border-slate-200 rounded px-1.5 py-1 text-xs"
                          >
                            <option value="IS 2062">IS 2062</option>
                            <option value="SS 304 L">SS 304 L</option>
                            <option value="SS 316 L">SS 316 L</option>
                            <option value="SS 410">SS 410</option>
                            <option value="EN8">EN8</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          {item.shape === 'plate' && (
                            <div className="flex items-center space-x-1 font-mono text-[11px]">
                              <span>L:</span>
                              <input
                                type="number"
                                value={item.length}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].length = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-14 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                              <span>W:</span>
                              <input
                                type="number"
                                value={item.width}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].width = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-14 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                              <span>T:</span>
                              <input
                                type="number"
                                value={item.thickness}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].thickness = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-12 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                            </div>
                          )}

                          {item.shape === 'round_bar' && (
                            <div className="flex items-center space-x-1 font-mono text-[11px]">
                              <span>Ø:</span>
                              <input
                                type="number"
                                value={item.diameter}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].diameter = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-14 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                              <span>L:</span>
                              <input
                                type="number"
                                value={item.length}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].length = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-16 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                            </div>
                          )}

                          {item.shape === 'pipe' && (
                            <div className="flex items-center space-x-1 font-mono text-[11px]">
                              <span>OD:</span>
                              <input
                                type="number"
                                value={item.diameter}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].diameter = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-14 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                              <span>Wall:</span>
                              <input
                                type="number"
                                value={item.wall_thickness}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].wall_thickness = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-12 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                              <span>L:</span>
                              <input
                                type="number"
                                value={item.length}
                                onChange={(e) => {
                                  const updated = [...estimateResult.bom_items];
                                  updated[idx].length = parseFloat(e.target.value) || 0;
                                  handleRecalculateBOM(updated);
                                }}
                                className="w-14 border border-slate-200 rounded px-1 py-0.5 text-xs"
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...estimateResult.bom_items];
                              updated[idx].quantity = parseInt(e.target.value) || 1;
                              handleRecalculateBOM(updated);
                            }}
                            className="w-12 border border-slate-200 rounded px-1.5 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">{item.unit_weight?.toFixed(2)} kg</td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900">{item.total_weight?.toFixed(2)} kg</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{formatINR(item.raw_material_cost)}</td>
                        <td className="py-2 px-3 text-slate-600">{formatINR(item.cutting_cost)}</td>
                        <td className="py-2 px-3 text-slate-600">
                          <input
                            type="number"
                            value={item.unit_machining_rate}
                            onChange={(e) => {
                              const updated = [...estimateResult.bom_items];
                              updated[idx].unit_machining_rate = parseFloat(e.target.value) || 0;
                              handleRecalculateBOM(updated);
                            }}
                            className="w-16 border border-slate-200 rounded px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => {
                              const updated = estimateResult.bom_items.filter((_, i) => i !== idx);
                              handleRecalculateBOM(updated);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Remove part"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveTab('new')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Equipment Form
              </button>

              <button
                onClick={() => setActiveTab('results')}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
              >
                <span>View Complete Cost Estimate</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: COST ESTIMATION RESULTS */}
        {activeTab === 'results' && estimateResult && (
          <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
            {/* Top Engineering Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calculated Equipment Weight</p>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {estimateResult.total_weight_kg.toFixed(2)} <span className="text-sm font-normal text-slate-500">kg</span>
                </p>
                <span className="text-[11px] text-slate-400 mt-1 block">For {currentConfig.quantity} configured unit(s)</span>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Engineering Size Class</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`px-2.5 py-1 rounded text-sm font-bold ${
                    estimateResult.size_category === 'SMALL' ? 'bg-blue-100 text-blue-800' :
                    estimateResult.size_category === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {estimateResult.size_category}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block truncate" title={estimateResult.governing_dimension}>
                  {estimateResult.governing_dimension}
                </span>
              </div>

              <div className="bg-amber-500 rounded-xl p-5 text-slate-950 shadow-md">
                <p className="text-xs font-bold uppercase tracking-wider opacity-90">Final Estimated Price (INR)</p>
                <p className="text-2xl font-black mt-1 tracking-tight">
                  {formatINR(estimateResult.cost_breakdown.final_amount)}
                </p>
                <span className="text-[11px] font-medium opacity-90 mt-1 block">
                  Includes {estimateResult.cost_breakdown.margin_percent}% margin & {estimateResult.cost_breakdown.tax_percent}% GST
                </span>
              </div>
            </div>

            {/* Itemized 7 Cost Heads Breakdown Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Transparent Cost Head Breakdown</h3>
                  <p className="text-xs text-slate-500">Itemized calculation from raw material to bought-out and actuation</p>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Cost Head Description</th>
                    <th className="py-2.5 px-4">Calculation Basis / Engineering Metric</th>
                    <th className="py-2.5 px-4 text-right">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  <tr>
                    <td className="py-3 px-4 text-slate-400">1</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Raw Material Cost</td>
                    <td className="py-3 px-4 text-slate-500">Component weights × Material rates per kg</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      {formatINR(estimateResult.cost_breakdown.raw_material_cost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">2</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Laser / Profile Cutting Cost</td>
                    <td className="py-3 px-4 text-slate-500">Calculated weight × Profile cutting rate (₹10/kg)</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult.cost_breakdown.cutting_cost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">3</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Precision Machining Charges</td>
                    <td className="py-3 px-4 text-slate-500">Machining rate per piece across all BOM items</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult.cost_breakdown.machining_cost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">4</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Fabrication & Assembly Charges</td>
                    <td className="py-3 px-4 text-slate-500">Base ₹96/kg × Applicable Material Multiplier</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult.cost_breakdown.fabrication_cost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">5</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Surface Preparation & Finishing</td>
                    <td className="py-3 px-4 text-slate-500">Total weight × Finishing rate (₹20/kg)</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult.cost_breakdown.finishing_cost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">6</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Bought-Out Engineering Items</td>
                    <td className="py-3 px-4 text-slate-500">Racks, pinions, bearings, seals for {estimateResult.size_category} class</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult.cost_breakdown.bought_out_cost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">7</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Automation & Actuation Package</td>
                    <td className="py-3 px-4 text-slate-500">{currentConfig.actuation_type} Actuator + Gearbox + Mounting</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult.cost_breakdown.actuation_cost)}
                    </td>
                  </tr>

                  {/* Subtotal */}
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <td colSpan={3} className="py-3 px-4 text-slate-900 text-right">
                      Manufacturing Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 text-sm">
                      {formatINR(estimateResult.cost_breakdown.subtotal)}
                    </td>
                  </tr>

                  {/* Commercial Controls: Margin & Tax */}
                  <tr className="bg-white">
                    <td colSpan={2} className="py-2.5 px-4 text-slate-700 font-semibold">
                      Approved Engineering Margin (%):
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={currentConfig.margin_percent || 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setCurrentConfig(prev => ({ ...prev, margin_percent: val }));
                            handleRecalculateBOM(estimateResult.bom_items);
                          }}
                          className="w-16 border border-slate-300 rounded px-2 py-1 text-xs"
                        />
                        <span className="text-slate-500">% margin</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                      {formatINR(estimateResult.cost_breakdown.margin_amount)}
                    </td>
                  </tr>

                  <tr className="bg-white">
                    <td colSpan={2} className="py-2.5 px-4 text-slate-700 font-semibold">
                      Applicable GST / Taxes (%):
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={currentConfig.tax_percent || 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setCurrentConfig(prev => ({ ...prev, tax_percent: val }));
                            handleRecalculateBOM(estimateResult.bom_items);
                          }}
                          className="w-16 border border-slate-300 rounded px-2 py-1 text-xs"
                        />
                        <span className="text-slate-500">% GST</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                      {formatINR(estimateResult.cost_breakdown.tax_amount)}
                    </td>
                  </tr>

                  {/* Final Amount */}
                  <tr className="bg-amber-100 font-black border-t-2 border-amber-400">
                    <td colSpan={3} className="py-3.5 px-4 text-slate-950 text-right text-sm">
                      FINAL COMMERCIAL ESTIMATE:
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-base text-slate-950">
                      {formatINR(estimateResult.cost_breakdown.final_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveTab('bom_editor')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to BOM Editor
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleSaveQuotation('Draft')}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs"
                >
                  Save as Draft
                </button>

                <button
                  onClick={() => handleSaveQuotation('Validated')}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
                >
                  <FileText className="h-4 w-4" />
                  <span>Generate & Review Quotation</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: QUOTATION PREVIEW & PDF DOWNLOAD */}
        {activeTab === 'preview' && savedQuoteDetail && (
          <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 bg-emerald-100 text-emerald-800 rounded-lg flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {savedQuoteDetail.quote_number} (Rev R{savedQuoteDetail.revision})
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    savedQuoteDetail.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    Status: {savedQuoteDetail.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={getQuotationPdfUrl(savedQuoteDetail.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Quotation PDF</span>
                </a>

                {savedQuoteDetail.status !== 'Issued' && (
                  <button
                    onClick={handleIssueCurrentQuote}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Issue Official Quote</span>
                  </button>
                )}

                <button
                  onClick={() => handleRecalculateCurrentRates(savedQuoteDetail.id)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg flex items-center space-x-1"
                  title="Recalculate with active DB rates"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>New Revision</span>
                </button>
              </div>
            </div>

            {/* Document Preview Card (mimics PDF layout) */}
            <div className="bg-white rounded-xl border border-slate-300 shadow-md p-8 space-y-6 text-slate-800">
              {/* Document Header */}
              <div className="flex justify-between items-start border-b-2 border-amber-500 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">INDUSTRIAL FLOW & DAMPER TECHNOLOGIES</h2>
                  <p className="text-xs text-slate-500">Engineering Solutions & Flow Control Systems</p>
                  <p className="text-xs text-slate-400">Chennai Industrial Area Phase II, India</p>
                </div>
                <div className="text-right">
                  <h3 className="text-sm font-bold text-slate-900">TECHNICAL & COMMERCIAL QUOTATION</h3>
                  <p className="text-xs font-mono font-semibold text-amber-600 mt-1">{savedQuoteDetail.quote_number}</p>
                  <p className="text-xs text-slate-500">Revision: R{savedQuoteDetail.revision} | Date: {new Date(savedQuoteDetail.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Client & Equipment Summary */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[10px] mb-1">Customer / Project</h4>
                  <p className="font-semibold text-slate-800">{savedQuoteDetail.customer_name}</p>
                  <p className="text-slate-500">Contact: {savedQuoteDetail.contact_person || 'Commercial Dept'}</p>
                  <p className="text-slate-500">Project: {savedQuoteDetail.project_name || 'Standard Plant Supply'}</p>
                  <p className="text-slate-500">RFQ: {savedQuoteDetail.rfq_number || 'Direct Inquiry'}</p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[10px] mb-1">Equipment Details</h4>
                  <p className="font-semibold text-slate-800">{savedQuoteDetail.equipment_type}</p>
                  <p className="text-slate-500">Tag: {savedQuoteDetail.tag_number || 'TAG-01'} | Qty: {savedQuoteDetail.quantity} Nos</p>
                  <p className="text-slate-500">Dimensions: {savedQuoteDetail.length} × {savedQuoteDetail.width_diameter} × {savedQuoteDetail.depth} mm</p>
                  <p className="text-slate-500">Materials: Body {savedQuoteDetail.body_material} / Flap {savedQuoteDetail.flap_disc_material}</p>
                  <p className="font-mono text-slate-700">Calculated Weight: {savedQuoteDetail.total_weight_kg.toFixed(2)} kg</p>
                </div>
              </div>

              {/* Commercial Breakdown */}
              <div>
                <h4 className="font-bold text-slate-900 text-xs mb-2">Commercial Summary & Cost Breakdown</h4>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Cost Head</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3 text-right">Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    <tr>
                      <td className="py-2 px-3">1. Raw Materials</td>
                      <td className="py-2 px-3 text-slate-500">Fabricated plate, bar & tube components</td>
                      <td className="py-2 px-3 text-right font-mono">{formatINR(savedQuoteDetail.cost_breakdown.raw_material_cost)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">2. Processing & Machining</td>
                      <td className="py-2 px-3 text-slate-500">Laser cutting + Precision machining charges</td>
                      <td className="py-2 px-3 text-right font-mono">{formatINR(savedQuoteDetail.cost_breakdown.cutting_cost + savedQuoteDetail.cost_breakdown.machining_cost)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">3. Fabrication & Finishing</td>
                      <td className="py-2 px-3 text-slate-500">Base fabrication rate + Surface preparation</td>
                      <td className="py-2 px-3 text-right font-mono">{formatINR(savedQuoteDetail.cost_breakdown.fabrication_cost + savedQuoteDetail.cost_breakdown.finishing_cost)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">4. Bought-Out Items</td>
                      <td className="py-2 px-3 text-slate-500">Standard bearings, seals, racks & hardware</td>
                      <td className="py-2 px-3 text-right font-mono">{formatINR(savedQuoteDetail.cost_breakdown.bought_out_cost)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">5. Automation & Actuation</td>
                      <td className="py-2 px-3 text-slate-500">{savedQuoteDetail.actuation_type} Actuator Package</td>
                      <td className="py-2 px-3 text-right font-mono">{formatINR(savedQuoteDetail.cost_breakdown.actuation_cost)}</td>
                    </tr>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                      <td colSpan={2} className="py-2 px-3 text-right">Subtotal:</td>
                      <td className="py-2 px-3 text-right font-mono">{formatINR(savedQuoteDetail.cost_breakdown.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1.5 px-3 text-right text-slate-600">GST ({savedQuoteDetail.cost_breakdown.tax_percent}%):</td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-700">{formatINR(savedQuoteDetail.cost_breakdown.tax_amount)}</td>
                    </tr>
                    <tr className="bg-amber-100 font-black">
                      <td colSpan={2} className="py-2.5 px-3 text-right text-slate-900 text-sm">TOTAL QUOTATION VALUE:</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-900 text-sm">{formatINR(savedQuoteDetail.cost_breakdown.final_amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Standard Commercial Terms */}
              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg space-y-1">
                <p><strong>1. Price Basis:</strong> Ex-Works Manufacturing Works.</p>
                <p><strong>2. Validity:</strong> 30 Days from date of quotation.</p>
                <p><strong>3. Delivery:</strong> 4 to 6 weeks from receipt of approved drawing and technical clarity.</p>
                <p><strong>4. Payment Terms:</strong> 30% advance with purchase order, balance 70% against proforma invoice before dispatch.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SAVED QUOTATIONS */}
        {activeTab === 'saved' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Saved Quotations Repository</h2>
                <p className="text-xs text-slate-500">Search, filter, revise, and download previous engineering estimates.</p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={filterType}
                  onChange={(e) => {
                    setFilterType(e.target.value);
                  }}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 text-slate-700"
                >
                  <option value="">All Equipment</option>
                  <option value="Rack & Pinion Damper">Rack & Pinion Damper</option>
                  <option value="Butterfly Valve">Butterfly Valve</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                  }}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Validated">Validated</option>
                  <option value="Issued">Issued</option>
                </select>

                <button
                  onClick={refreshQuotations}
                  className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1"
                >
                  <Filter className="h-3 w-3" />
                  <span>Apply</span>
                </button>
              </div>
            </div>

            {/* List Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Quote No</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Equipment</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Size Class</th>
                    <th className="py-3 px-4">Total Weight</th>
                    <th className="py-3 px-4">Quotation Value</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {quotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {q.quote_number} <span className="text-[10px] text-slate-400 font-normal">R{q.revision}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">{q.customer_name}</span>
                        {q.project_name && <span className="block text-[10px] text-slate-400">{q.project_name}</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{q.equipment_type}</td>
                      <td className="py-3 px-4 text-slate-500">{new Date(q.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {q.size_category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{q.total_weight_kg.toFixed(1)} kg</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatINR(q.final_amount)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          q.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' :
                          q.status === 'Validated' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => handleLoadSavedQuote(q.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-700"
                          title="View Quotation"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicateQuote(q.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-700"
                          title="Duplicate"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRecalculateCurrentRates(q.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-700"
                          title="Recalculate with latest DB rates"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={getQuotationPdfUrl(q.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block p-1 hover:bg-amber-100 text-amber-700 rounded"
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: PRICING & MATERIAL ADMINISTRATION */}
        {activeTab === 'admin' && (
          <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Material & Pricing Administration</h2>
              <p className="text-xs text-slate-500">
                Maintain raw material rates, densities, processing charges, and bought-out component rules.
              </p>
            </div>

            {/* 1. Raw Materials Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Material Specifications & Rates</h3>
                  <p className="text-xs text-slate-500">Live densities, raw material rates in ₹/kg, and fabrication multipliers</p>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Material Grade</th>
                    <th className="py-2.5 px-4">Density (kg/mm³)</th>
                    <th className="py-2.5 px-4">Raw Rate (₹/kg)</th>
                    <th className="py-2.5 px-4">Fab Multiplier</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {materials.map((m) => (
                    <tr key={m.name}>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{m.name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        <input
                          type="number"
                          step="0.00000001"
                          value={m.density}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMaterials(prev => prev.map(item => item.name === m.name ? { ...item, density: val } : item));
                          }}
                          className="w-32 border border-slate-200 rounded px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="number"
                          value={m.raw_rate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMaterials(prev => prev.map(item => item.name === m.name ? { ...item, raw_rate: val } : item));
                          }}
                          className="w-24 border border-slate-200 rounded px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        <input
                          type="number"
                          step="0.05"
                          value={m.fab_multiplier}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMaterials(prev => prev.map(item => item.name === m.name ? { ...item, fab_multiplier: val } : item));
                          }}
                          className="w-20 border border-slate-200 rounded px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={async () => {
                            if (!m.id) return;
                            try {
                              await updateMaterial(m.id, {
                                density: m.density,
                                raw_rate: m.raw_rate,
                                fab_multiplier: m.fab_multiplier
                              });
                              showToast(`Updated material ${m.name}`);
                            } catch (err: any) {
                              showToast(err.message, true);
                            }
                          }}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded text-xs border border-amber-200"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. Processing Rates */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900 text-sm">Processing & Labor Rates</h3>
                <p className="text-xs text-slate-500">Fabrication, surface finishing, and laser cutting rates</p>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Processing Operation</th>
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Rate (₹/kg)</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {procRates.map((pr) => (
                    <tr key={pr.code}>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{pr.name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{pr.code}</td>
                      <td className="py-2.5 px-4">
                        <input
                          type="number"
                          value={pr.rate_per_kg}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setProcRates(prev => prev.map(item => item.code === pr.code ? { ...item, rate_per_kg: val } : item));
                          }}
                          className="w-24 border border-slate-200 rounded px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={async () => {
                            try {
                              await updateProcessingRate(pr.code, pr.rate_per_kg);
                              showToast(`Updated ${pr.name}`);
                            } catch (err: any) {
                              showToast(err.message, true);
                            }
                          }}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded text-xs border border-amber-200"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 3. Bought-Out Component Rule Creator (e.g. for Medium Butterfly Valve!) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Bought-Out Component Rules</h3>
                  <p className="text-xs text-slate-500">Configure bearings, seals, and hardware per equipment & size category.</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <p className="font-semibold">
                  Rule Requirement: The baseline system flags missing Medium Butterfly Valve bought-out rules.
                </p>
                <p className="mt-0.5 text-blue-800">
                  You can authorize and create an explicit configuration for Medium Butterfly Valves below to automatically price them without fallback warnings!
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  const item: BoughtOutItem = {
                    equipment_type: target.equipment_type.value,
                    size_category: target.size_category.value,
                    item_name: target.item_name.value,
                    quantity: parseInt(target.quantity.value) || 1,
                    unit_rate: parseFloat(target.unit_rate.value) || 0,
                    unit: 'piece',
                    notes: target.notes.value
                  };
                  try {
                    await createBoughtOutItem(item);
                    showToast(`Created rule: ${item.item_name} for ${item.equipment_type} (${item.size_category})`);
                    target.reset();
                    loadAdminData();
                  } catch (err: any) {
                    showToast(err.message, true);
                  }
                }}
                className="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs"
              >
                <div>
                  <label className="block font-semibold mb-1">Equipment</label>
                  <select name="equipment_type" className="w-full border border-slate-300 rounded p-1.5 bg-white">
                    <option value="Butterfly Valve">Butterfly Valve</option>
                    <option value="Rack & Pinion Damper">Rack & Pinion Damper</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Size Category</label>
                  <select name="size_category" className="w-full border border-slate-300 rounded p-1.5 bg-white">
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="SMALL">SMALL</option>
                    <option value="LARGE">LARGE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Component Name</label>
                  <input name="item_name" required placeholder="e.g. Medium Trunnion Bearings" className="w-full border border-slate-300 rounded p-1.5" />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Quantity</label>
                  <input name="quantity" type="number" defaultValue="2" min="1" className="w-full border border-slate-300 rounded p-1.5" />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Unit Rate (₹)</label>
                  <input name="unit_rate" type="number" defaultValue="4500" step="100" className="w-full border border-slate-300 rounded p-1.5" />
                </div>

                <div className="flex items-end">
                  <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold p-1.5 rounded">
                    + Add Rule
                  </button>
                </div>
              </form>

              {/* Table of active bought-out rules */}
              <div className="mt-4 overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Equipment</th>
                      <th className="py-2 px-3">Size Class</th>
                      <th className="py-2 px-3">Item Name</th>
                      <th className="py-2 px-3">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {boughtOutItems.map((bo, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3">{bo.equipment_type}</td>
                        <td className="py-1.5 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-semibold">
                            {bo.size_category}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-slate-800">{bo.item_name}</td>
                        <td className="py-1.5 px-3">{bo.quantity} {bo.unit}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{formatINR(bo.unit_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Actuation Packages Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Configured Actuation Packages</h3>
                <p className="text-xs text-slate-500">Actuator, gearbox, and mounting charges by equipment & size</p>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Equipment</th>
                      <th className="py-2 px-3">Actuation Type</th>
                      <th className="py-2 px-3">Size Class</th>
                      <th className="py-2 px-3 text-right">Actuator</th>
                      <th className="py-2 px-3 text-right">Gearbox</th>
                      <th className="py-2 px-3 text-right">Misc</th>
                      <th className="py-2 px-3 text-right font-bold">Total Package</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {actuationPackages.map((act, idx) => {
                      const totalPkg = act.actuator_cost + act.gearbox_cost + act.misc_cost;
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3">{act.equipment_type}</td>
                          <td className="py-1.5 px-3 font-semibold text-slate-800">{act.actuation_type}</td>
                          <td className="py-1.5 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-semibold">
                              {act.size_category}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono">{formatINR(act.actuator_cost)}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{formatINR(act.gearbox_cost)}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{formatINR(act.misc_cost)}</td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">{formatINR(totalPkg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
