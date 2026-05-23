// =============================================
// ASTRID ATS v2.0 — Dynamic Stowage Simulator
// =============================================

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zpbcddciudckzauzclbe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YLjHM5sczbAt_DL6_aBxwA_kIxuPa4V';

// --- STATE ---
let lang = localStorage.getItem('ats_lang') || 'en';
let namesData = {};
let namesArray = [];
let cargoSearchIndex = []; // { id, label, norm, compact }
let labelToCargoId = new Map();
let matrixData = {};
let proceduresData = {};
let dataLoaded = false;
let sbClient = null;
let currentUser = null;
let isDemoUser = false;

// Vessel Simulator State
let vesselTanks = {}; // tankId -> tank object
let vesselLayout = { rows: 9, cols: 'PS', preset: 'preset-18' };
let adjacencyGraph = {}; // tankId -> list of adjacent tankIds
let activeEditingTankId = null;
let disclaimerAccepted = false;
let filterMode = 'all'; // 'all', 'selected', 'custom'
let filterCustomTanks = new Set();

const DAILY_FREE_LIMIT = 1;
const FREE_STEPS_SHOWN = 2;

// --- COATING RULES ---
const coatingRules = {
  tank: {
    zinc: {
      danger_keywords: ['CHM-29','CHM-30','CHM-31'],
      caution_keywords: ['CHM-20','CHM-21'],
      danger_msg_tr: '🚫 KRİTİK: Bu protokol ASİT içermektedir. Çinko Silikat kaplamalar asitle temas etmemelidir.',
      danger_msg_en: '🚫 CRITICAL: This protocol contains ACID. Zinc Silicate coatings must not contact acid.',
      caution_msg_tr: '⚠ DİKKAT: Bu protokol güçlü ALKALİ içermektedir. Konsantrasyonu doğrulayın.',
      caution_msg_en: '⚠ CAUTION: This protocol contains strong ALKALI. Verify concentration.'
    },
    epoxy: {
      caution_keywords: ['SLV'],
      caution_msg_tr: '⚠ DİKKAT: Solvent protokolü. Epoksi kaplama uyumluluğunu üretici listesinden doğrulayın.',
      caution_msg_en: '⚠ CAUTION: Solvent protocol. Verify epoxy coating compatibility with manufacturer list.'
    },
    uncoated: {
      danger_keywords: ['CHM-29','CHM-30','CHM-31'],
      caution_keywords: ['CHM-'],
      danger_msg_tr: '🚫 UYARI: Asit protokolü. Kaplamasız çelik tankta ciddi aşınma riski.',
      danger_msg_en: '🚫 WARNING: Acid protocol. Serious corrosion risk in uncoated steel tank.',
      caution_msg_tr: '⚠ DİKKAT: Kimyasal protokol. Kaplamasız çelikte temas süresini minimize edin.',
      caution_msg_en: '⚠ CAUTION: Chemical protocol. Minimize contact time in uncoated steel.'
    }
  },
  line: {
    zinc: {
      danger_keywords: ['CHM-29','CHM-30','CHM-31'],
      caution_keywords: ['CHM-20','CHM-21'],
      danger_msg_tr: '🚫 KRİTİK HAT UYUMSUZLUĞU: Asit içeren protokoller Çinko Silikat hatlarda korozyona yol açar.',
      danger_msg_en: '🚫 CRITICAL LINE CONFLICT: Acid protocols cause severe corrosion in Zinc Silicate lines.',
      caution_msg_tr: '⚠ HAT UYARISI: Güçlü alkali protokolü. Çinko Silikat hatlar için sınırlı temas önerilir.',
      caution_msg_en: '⚠ LINE CAUTION: Strong alkali protocol. Limited contact recommended for Zinc Silicate lines.'
    },
    epoxy: {
      caution_keywords: ['SLV'],
      caution_msg_tr: '⚠ DİKKAT HAT: Solvent protokolü. Epoksi hat kaplamasının solvent direnç listesini kontrol edin.',
      caution_msg_en: '⚠ CAUTION LINE: Solvent protocol. Verify epoxy pipe compatibility with manufacturer guide.'
    },
    stainless: {
      // Stainless steel is fully compatible with all protocols
    },
    rubber: {
      caution_keywords: ['SLV'],
      caution_msg_tr: '⚠ HAT: Kauçuk astarlı hatlar solventle uyumsuz olabilir.',
      caution_msg_en: '⚠ LINE: Rubber-lined pipes may be incompatible with solvents.'
    },
    carbon_steel: {
      caution_keywords: ['CHM-29','CHM-30','CHM-31'],
      caution_msg_tr: '⚠ HAT: Karbon çelik hatlarda asit geçiş süresini minimize edin.',
      caution_msg_en: '⚠ LINE: Minimize acid transit time in carbon steel lines.'
    }
  }
};

// --- TRANSLATIONS ---
const T = {
  en: {
    hero_tag: 'AUTOMATIC TANK CLEANING PROTOCOL SYSTEM',
    hero_sub: 'Select vessel configuration and cargo to generate your cleaning protocol',
    disc_text: 'Reference tool only. All protocols must be verified by qualified Chief Officer or Surveyor. Astrid ATS bears no liability for cargo contamination or damage.',
    nav_subscribe: 'LICENSING',
    nav_login: 'LOGIN',
    nav_logout: 'LOG OUT',
    tab_config: '⚙️ CONFIG',
    tab_editor: '📝 TANK EDITOR',
    tab_eco: '📈 ECO-WASH',
    tab_certs: '📜 CERTIFICATES',
    lbl_vessel_config: 'VESSEL CONFIGURATION & PARAMETERS',
    lbl_presets: 'Vessel Presets',
    lbl_total_holds: 'Total Cargo Holds (Rows: 1-20)',
    lbl_include_slops: 'Include Aft Slop Tanks (Slop P / Slop S)',
    lbl_schematic_builder: 'FLEXIBLE TANK SCHEMATIC BUILDER',
    lbl_schematic_desc: 'Enable/disable Port, Center, or Starboard tanks for each hold row to match your exact Certificate of Fitness.',
    lbl_vessel_metadata: 'VESSEL METADATA',
    lbl_vessel_name: 'Vessel Name',
    lbl_imo_number: 'IMO Number',
    lbl_chief_officer: 'Chief Officer Name',
    lbl_company_logo: 'Company Logo (Image URL)',
    lbl_eco_constants: 'ECO-CALCULATOR CONSTANTS',
    lbl_fuel_cost: 'Fuel Cost ($/MT)',
    lbl_slop_fee: 'Slop Fee ($/m³)',
    lbl_fw_cost: 'FW Cost ($/m³)',
    lbl_detergent_cost: 'Detergent ($/L)',
    lbl_nozzle_flow: 'Nozzle Flow (m³/h)',
    lbl_ambient_temp: 'Ambient Temp (°C)',
    lbl_sea_temp: 'Sea Water Temp (°C)',
    lbl_boiler_efficiency: 'Boiler Efficiency (%)',
    btn_simulate_run: 'SIMULATE & RUN PROTOCOLS',
    lbl_tank_details: 'TANK DETAILS EDITOR',
    lbl_active_hold: 'ACTIVE HOLD:',
    lbl_editor_no_selection: 'Please click on any tank in the bird\'s-eye ship plan on the left to edit its cargo, coating, and WWT status.',
    lbl_coating_type: 'Tank Coating',
    lbl_line_coating: 'Line/Pipe Coating',
    lbl_capacity: 'Capacity (m³)',
    lbl_cargo_sequence: 'CARGO SEQUENCE',
    lbl_last_cargo: 'LAST CARGO',
    lbl_next_cargo: 'NEXT CARGO',
    lbl_heated_cargo: '🔥 HEATED CARGO (ACTIVE HEATING)',
    lbl_wwt_status: 'WALL WASH TEST (WWT) STATUS',
    wwt_hydrocarbons: '🧪 Hydrocarbons (Pass / Water White)',
    wwt_chlorides: '🧂 Chlorides (< 5 ppm)',
    wwt_permanganate: '⏱️ Permanganate Time Test (Pass)',
    wwt_ph: '📈 pH Neutrality (6.5 - 7.5)',
    btn_save_config: 'SAVE CONFIGURATION',
    btn_clear_config: 'CLEAR',
    btn_clear_all_tanks: '🧹 CLEAR ALL TANKS',
    lbl_report_title: 'FLEET SIMULATION REPORT',
    lbl_cost_report: '📊 ECO-WASH COST REPORT',
    tbl_resource: 'RESOURCE',
    tbl_qty: 'QTY',
    tbl_cost: 'COST',
    res_fw: 'Fresh Water',
    res_fuel: 'Boiler Fuel',
    res_slop: 'Slop Disposal',
    res_detergent: 'Detergents',
    res_total_est: 'TOTAL ESTIMATE',
    lbl_additive_sheet: '📦 ADDITIVE ORDER SHEET',
    lbl_detailed_protocols: 'DETAILED PROTOCOLS BY TANK',
    lbl_vetting_certs: 'VESSEL VETTING CERTIFICATES',
    lbl_certs_desc: 'Certificates are automatically generated for cargo holds that have passed all 4 Wall Wash Tests (WWT). Click "Print" to export individual certificates to A4 paper.',
    lbl_footer_sub: 'Tank Cleaning Protocol System',
    lbl_footer_tagline: 'POWERED BY A NEXT-GEN TOPOLOGICAL SOLVER DYNAMICALLY MATCHING OVER 168,000+ WASH COMBINATIONS IN MILLISECONDS, OPTIMIZING VESSEL TURNAROUNDS AND CARGO VETTING GLOBALLY.',
    modal_title: 'PROFESSIONAL DISCLAIMER',
    modal_body: `This protocol is provided for reference purposes only. By proceeding, you confirm that:<ul><li>You are a qualified marine officer or surveyor</li><li>You will verify this protocol against your vessel's Certificate of Fitness</li><li>Final responsibility rests entirely with you</li><li>ASTRID ATS bears no liability for any cargo loss or damage</li></ul>`,
    modal_cancel: 'CANCEL',
    modal_confirm: 'I UNDERSTAND & ACCEPT',
    err_coating: 'Please select tank and line coating types.',
    err_select: 'Please select valid cargo names from the list.',
    err_notfound: 'No protocol found for this cargo combination.',
    err_loading: 'Data is loading, please wait...',
    intensity_levels: ['','Minimal','Very Light','Light','Light Standard','Standard','Standard Intensive','Intensive','Very Intensive','Ultra Intensive','Maximum'],
    step_prefix: 'STEP',
    lbl_engine_title: 'ASTRID DYNAMIC ENGINE v2.0 PRO',
    lbl_engine_desc: 'Active Database: 168,000+ Wash Combinations Mapped dynamically in <5ms. Next-Gen Topological Wash-Path Solver optimizes time, water, and fuel consumption.',
    placeholder_search: 'Search cargo...',
    err_incomplete_last: 'Last Cargo is not specified.',
    err_incomplete_next: 'Next Cargo is not specified.',
    err_no_protocol: 'No cleaning protocol found in the database.',
    err_db_procedure_missing: 'Procedure detail is missing from the database.',
    lbl_filter_tanks: 'FILTER CARGO TANKS',
    btn_filter_all: 'ALL',
    btn_filter_selected: 'SELECTED',
    btn_filter_custom: 'CUSTOM',
    lbl_fallback_badge: '⚠️ SIMILAR CARGO REFERENCE',
    lbl_derived_from: 'Derived from'
  },
  tr: {
    hero_tag: 'OTOMATİK TANK TEMİZLEME PROTOKOL SİSTEMİ',
    hero_sub: 'Gemi konfigürasyonunu ve kargoyu seçerek temizleme protokolünüzü oluşturun',
    disc_text: 'Yalnızca referans aracı. Tüm protokoller yetkili Baş Zabit veya Sörveyör tarafından doğrulanmalıdır. Astrid ATS hiçbir kargo kaybı veya hasarından sorumlu tutulamaz.',
    nav_subscribe: 'LİSANSLAMA',
    nav_login: 'GİRİŞ YAP',
    nav_logout: 'ÇIKIŞ YAP',
    tab_config: '⚙️ AYARLAR',
    tab_editor: '📝 TANK EDİTÖRÜ',
    tab_eco: '📈 EKO-YIKAMA',
    tab_certs: '📜 SERTİFİKALAR',
    lbl_vessel_config: 'GEMİ KONFİGÜRASYONU VE PARAMETRELERİ',
    lbl_presets: 'Hazır Gemi Şablonları',
    lbl_total_holds: 'Toplam Kargo Ambarı Sayısı (Sıra: 1-20)',
    lbl_include_slops: 'Aft Slop Tanklarını Dahil Et (Slop P / Slop S)',
    lbl_schematic_builder: 'ESNEK TANK ŞABLON OLUŞTURUCU',
    lbl_schematic_desc: 'Geminizin Uygunluk Sertifikasına (CoF) tam uyması için her bir sıra için İskele (P), Merkez (C) veya Sancak (S) tanklarını açın/kapatın.',
    lbl_vessel_metadata: 'GEMİ METADATASI',
    lbl_vessel_name: 'Gemi Adı',
    lbl_imo_number: 'IMO Numarası',
    lbl_chief_officer: 'Baş Zabit Adı',
    lbl_company_logo: 'Şirket Logosu (Resim URL\'si)',
    lbl_eco_constants: 'EKO-HESAPLAYICI SABİTLERİ',
    lbl_fuel_cost: 'Yakıt Maliyeti ($/MT)',
    lbl_slop_fee: 'Slop Bertaraf Ücreti ($/m³)',
    lbl_fw_cost: 'Tatlı Su Maliyeti ($/m³)',
    lbl_detergent_cost: 'Deterjan Maliyeti ($/L)',
    lbl_nozzle_flow: 'Butterworth Debisi (m³/h)',
    lbl_ambient_temp: 'Çevre Sıcaklığı (°C)',
    lbl_sea_temp: 'Deniz Suyu Sıcaklığı (°C)',
    lbl_boiler_efficiency: 'Kazan Verimliliği (%)',
    btn_simulate_run: 'SİMÜLE ET VE PROTOKOLLERİ ÇALIŞTIR',
    lbl_tank_details: 'TANK DETAY EDİTÖRÜ',
    lbl_active_hold: 'AKTİF TANK:',
    lbl_editor_no_selection: 'Kargo, kaplama ve WWT durumunu düzenlemek için lütfen soldaki kuş bakışı gemi planındaki herhangi bir tanka tıklayın.',
    lbl_coating_type: 'Tank Kaplaması',
    lbl_line_coating: 'Hat (Boru) Kaplaması',
    lbl_capacity: 'Kapasite (m³)',
    lbl_cargo_sequence: 'KARGO SIRALAMASI',
    lbl_last_cargo: 'SON YÜK',
    lbl_next_cargo: 'SONRAKİ YÜK',
    lbl_heated_cargo: '🔥 ISITILAN KARGO (AKTİF ISITMA)',
    lbl_wwt_status: 'DUVAR YIKAMA TESTİ (WWT) DURUMU',
    wwt_hydrocarbons: '🧪 Hidrokarbon Testi (Geçti / Su Beyazı)',
    wwt_chlorides: '🧂 Klorür Testi (< 5 ppm)',
    wwt_permanganate: '⏱️ Permanganat Süre Testi (Geçti)',
    wwt_ph: '📈 pH Nötrlük Kontrolü (6.5 - 7.5)',
    btn_save_config: 'KONFİGÜRASYONU KAYDET',
    btn_clear_config: 'TEMİZLE',
    btn_clear_all_tanks: '🧹 TÜMÜNÜ TEMİZLE',
    lbl_report_title: 'FİLO SİMÜLASYON RAPORU',
    lbl_cost_report: '📊 EKO-YIKAMA MALİYET RAPORU',
    tbl_resource: 'KAYNAK',
    tbl_qty: 'MİKTAR',
    tbl_cost: 'MALİYET',
    res_fw: 'Tatlı Su',
    res_fuel: 'Kazan Yakıtı',
    res_slop: 'Slop Bertarafı',
    res_detergent: 'Deterjanlar',
    res_total_est: 'TOPLAM TAHMİN',
    lbl_additive_sheet: '📦 KATKI MADDESİ SİPARİŞ FORMU',
    lbl_detailed_protocols: 'TANKLARA GÖRE DETAYLI PROTOKOLLER',
    lbl_vetting_certs: 'GEMİ VETTING SERTİFİKALARI',
    lbl_certs_desc: 'Sertifikalar, 4 Duvar Yıkama Testini (WWT) de geçen kargo tankları için otomatik olarak oluşturulur. Münferit sertifikaları A4 kağıdına yazdırmak için "Yazdır" butonuna tıklayın.',
    lbl_footer_sub: 'Tank Temizleme Protokol Sistemi',
    lbl_footer_tagline: 'SANİYELER İÇERİSİNDE 168 BİNİ AŞKIN YIKAMA KOMBİNASYONUNU DİNAMİK OLARAK ANALİZ EDEN VE DÜNYA ÇAPINDA GEMİ TURAROUND SÜRELERİNİ OPTİMİZE EDEN YENİ NESİL TOPOLOJİK ÇÖZÜCÜ İLE GÜÇLENDİRİLMİŞTİR.',
    modal_title: 'PROFESYONEL SORUMLULUK REDDİ',
    modal_body: `Bu protokol yalnızca referans amaçlıdır. Devam ederek şunları onaylıyorsunuz:<ul><li>Yetkili denizcilik personeli veya sörveyörüsünüz</li><li>Bu protokolü geminizdeki Uygunluk Sertifikası ile doğrulayacaksınız</li><li>Nihai sorumluluk tamamen size aittir</li><li>ASTRID ATS hiçbir kargo kaybı veya hasarından sorumlu tutulamaz</li></ul>`,
    modal_cancel: 'İPTAL',
    modal_confirm: 'ANLIYORUM VE KABUL EDİYORUM',
    err_coating: 'Lütfen tank ve hat kaplama tipini seçin.',
    err_select: 'Lütfen listeden geçerli yük isimleri seçin.',
    err_notfound: 'Bu yük kombinasyonu için protokol bulunamadı.',
    err_loading: 'Veriler yükleniyor, lütfen bekleyin...',
    intensity_levels: ['','Minimal','Çok Hafif','Hafif','Standart Hafif','Standart','Standart Yoğun','Yoğun','Çok Yoğun','Ultra Yoğun','Maksimum'],
    step_prefix: 'ADIM',
    lbl_engine_title: 'ASTRID DİNAMİK MOTORU v2.0 PRO',
    lbl_engine_desc: 'Aktif Veritabanı: <5ms içinde 168.000\'den fazla Temizleme Kombinasyonu dinamik olarak çözülür. Yeni Nesil Topolojik Yıkama Yolu Çözücü zaman, su ve yakıtı optimize eder.',
    placeholder_search: 'Yük ara...',
    err_incomplete_last: 'Son yük (Last Cargo) belirtilmemiş.',
    err_incomplete_next: 'Sonraki yük (Next Cargo) belirtilmemiş.',
    err_no_protocol: 'Veritabanında temizlik protokolü bulunamadı.',
    err_db_procedure_missing: 'Prosedür detayları veritabanında eksik.',
    lbl_filter_tanks: 'KARGO TANKLARINI FİLTRELE',
    btn_filter_all: 'TÜMÜ',
    btn_filter_selected: 'SEÇİLİ',
    btn_filter_custom: 'ÖZEL',
    lbl_fallback_badge: '⚠️ BENZER GRUP REFERANSI',
    lbl_derived_from: 'referansından türetilmiştir'
  },
  es: {
    hero_tag: 'SISTEMA AUTOMÁTICO DE PROTOCOLOS DE LIMPIEZA DE TANQUES',
    hero_sub: 'Seleccione la configuración del buque y la carga para generar su protocolo de limpieza',
    disc_text: 'Solo herramienta de referencia. Todos los protocolos deben ser verificados por un Primer Oficial o Inspector calificado. Astrid ATS no asume ninguna responsabilidad.',
    nav_subscribe: 'LICENCIAS',
    nav_login: 'INICIAR SESIÓN',
    nav_logout: 'CERRAR SESIÓN',
    tab_config: '⚙️ CONFIG',
    tab_editor: '📝 EDITOR DE TANQUES',
    tab_eco: '📈 ECO-LAVADO',
    tab_certs: '📜 CERTIFICADOS',
    lbl_vessel_config: 'CONFIGURACIÓN Y PARÁMETROS DEL BUQUE',
    lbl_presets: 'Preajustes del Buque',
    lbl_total_holds: 'Total de Tanques de Carga (Filas: 1-20)',
    lbl_include_slops: 'Incluir tanques de decantación de popa (Slop P / Slop S)',
    lbl_schematic_builder: 'CREADOR FLEXIBLE DE ESQUEMA DE TANQUES',
    lbl_schematic_desc: 'Active o desactive los tanques de babor (P), centro (C) o estribor (S) para cada fila a fin de coincidir con su Certificado de Aptitud.',
    lbl_vessel_metadata: 'METADATOS DEL BUQUE',
    lbl_vessel_name: 'Nombre del Buque',
    lbl_imo_number: 'Número IMO',
    lbl_chief_officer: 'Nombre del Primer Oficial',
    lbl_company_logo: 'Logo de la Empresa (URL de Imagen)',
    lbl_eco_constants: 'CONSTANTES DEL ECO-CALCULADOR',
    lbl_fuel_cost: 'Costo del Combustible ($/MT)',
    lbl_slop_fee: 'Tarifa de Slops ($/m³)',
    lbl_fw_cost: 'Costo de Agua Dulce ($/m³)',
    lbl_detergent_cost: 'Costo de Detergente ($/L)',
    lbl_nozzle_flow: 'Flujo de Butterworth (m³/h)',
    lbl_ambient_temp: 'Temp. Ambiente (°C)',
    lbl_sea_temp: 'Temp. del Agua de Mar (°C)',
    lbl_boiler_efficiency: 'Eficiencia de la Caldera (%)',
    btn_simulate_run: 'SIMULAR Y EJECUTAR PROTOCOLOS',
    lbl_tank_details: 'EDITOR DE DETALLES DEL TANQUE',
    lbl_active_hold: 'TANQUE ACTIVO:',
    lbl_editor_no_selection: 'Haga clic en cualquier tanque en el plano del barco a la izquierda para editar su carga, revestimiento y estado de WWT.',
    lbl_coating_type: 'Revestimiento del Tanque',
    lbl_line_coating: 'Revestimiento de Tuberías',
    lbl_capacity: 'Capacidad (m³)',
    lbl_cargo_sequence: 'SECUENCIA DE CARGA',
    lbl_last_cargo: 'ÚLTIMA CARGA',
    lbl_next_cargo: 'SIGUIENTE CARGA',
    lbl_heated_cargo: '🔥 CARGA CALENTADA (CALEFACCIÓN ACTIVA)',
    lbl_wwt_status: 'ESTADO DE PRUEBA DE LAVADO DE PARED (WWT)',
    wwt_hydrocarbons: '🧪 Hidrocarburos (Aprobado / Agua Clara)',
    wwt_chlorides: '🧂 Cloruros (< 5 ppm)',
    wwt_permanganate: '⏱️ Tiempo de Permanganato (Aprobado)',
    wwt_ph: '📈 Neutralidad del pH (6.5 - 7.5)',
    btn_save_config: 'GUARDAR CONFIGURACIÓN',
    btn_clear_config: 'LIMPIAR',
    btn_clear_all_tanks: '🧹 LIMPIAR TODOS',
    lbl_report_title: 'INFORME DE SIMULACIÓN DE FLOTA',
    lbl_cost_report: '📊 INFORME DE COSTO DE ECO-LAVADO',
    tbl_resource: 'RECURSO',
    tbl_qty: 'CANTIDAD',
    tbl_cost: 'COSTO',
    res_fw: 'Agua Dulce',
    res_fuel: 'Combustible de Caldera',
    res_slop: 'Eliminación de Slops',
    res_detergent: 'Detergentes',
    res_total_est: 'ESTIMACIÓN TOTAL',
    lbl_additive_sheet: '📦 HOJA DE ORDEN DE ADITIVOS',
    lbl_detailed_protocols: 'PROTOCOLOS DETALLADOS POR TANQUE',
    lbl_vetting_certs: 'CERTIFICADOS DE INSPECCIÓN DEL BUQUE',
    lbl_certs_desc: 'Los certificados se generan automáticamente para los tanques de carga que han aprobado las 4 pruebas de lavado de pared (WWT). Haga clic en "Imprimir" para exportarlos en A4.',
    lbl_footer_sub: 'Sistema de Protocolos de Limpieza de Tanques',
    lbl_footer_tagline: 'IMPULSADO POR UN RESOLVEDOR TOPOLÓGICO DE ÚLTIMA GENERACIÓN QUE COMPARA DINÁMICAMENTE MÁS DE 168,000 COMBINACIONES EN MILISEGUNDOS, OPTIMIZANDO TIEMPOS Y COSTOS A NIVEL GLOBAL.',
    modal_title: 'DESCARGO DE RESPONSABILIDAD PROFESIONAL',
    modal_body: `Este protocolo se proporciona únicamente con fines de referencia. Al proceder, usted confirma que:<ul><li>Es un oficial de marina o inspector calificado</li><li>Verificará este protocolo con el Certificado de Aptitud de su buque</li><li>La responsabilidad final recae enteramente en usted</li><li>ASTRID ATS no asume responsabilidad alguna por pérdidas o daños en la carga</li></ul>`,
    modal_cancel: 'CANCELAR',
    modal_confirm: 'ENTIENDO Y ACEPTO',
    err_coating: 'Seleccione los tipos de revestimiento del tanque y la tubería.',
    err_select: 'Seleccione nombres de carga válidos de la lista.',
    err_notfound: 'No se encontró ningún protocolo para esta combinación de carga.',
    err_loading: 'Cargando datos, por favor espere...',
    intensity_levels: ['','Mínimo','Muy Ligero','Ligero','Estándar Ligero','Estándar','Estándar Intensivo','Intensivo','Muy Intensivo','Ultra Intensivo','Máximo'],
    step_prefix: 'PASO',
    lbl_engine_title: 'MOTOR DINÁMICO ASTRID v2.0 PRO',
    lbl_engine_desc: 'Base de datos activa: Más de 168,000 combinaciones analizadas en <5ms. El resolvedor topológico de última generación optimiza tiempo, agua y combustible.',
    placeholder_search: 'Buscar carga...',
    err_incomplete_last: 'No se ha especificado la última carga.',
    err_incomplete_next: 'No se ha especificado la siguiente carga.',
    err_no_protocol: 'No se encontró ningún protocolo de limpieza en la base de datos.',
    err_db_procedure_missing: 'Falta el detalle del procedimiento en la base de datos.',
    lbl_filter_tanks: 'FILTRAR TANQUES DE CARGA',
    btn_filter_all: 'TODOS',
    btn_filter_selected: 'SELECCIONADO',
    btn_filter_custom: 'PERSONALIZADO',
    lbl_fallback_badge: '⚠️ REFERENCIA DE CARGA SIMILAR',
    lbl_derived_from: 'Derivado de'
  },
  el: {
    hero_tag: 'ΑΥΤΟΜΑΤΟ ΣΥΣΤΗΜΑ ΠΡΩΤΟΚΟΛΛΩΝ ΚΑΘΑΡΙΣΜΟΥ ΔΕΞΑΜΕΝΩΝ',
    hero_sub: 'Επιλέξτε διαμόρφωση πλοίου και φορτίο για να δημιουργήσετε το πρωτόκολλο καθαρισμού σας',
    disc_text: 'Εργαλείο αναφοράς μόνο. Όλα τα πρωτόκολλα πρέπει να επαληθεύονται από εξουσιοδοτημένο Υποπλοίαρχο ή Επιθεωρητή. Η Astrid ATS δεν φέρει καμία ευθύνη.',
    nav_subscribe: 'ΑΔΕΙΟΔΟΤΗΣΗ',
    nav_login: 'ΣΥΝΔΕΣΗ',
    nav_logout: 'ΑΠΟΣΥΝΔΕΣΗ',
    tab_config: '⚙️ ΡΥΘΜΙΣΕΙΣ',
    tab_editor: '📝 ΕΠΕΞΕΡΓΑΣΤΗΣ',
    tab_eco: '📈 EKO-ΠΛΥΣΗ',
    tab_certs: '📜 ΠΙΣΤΟΠΟΙΗΤΙΚΑ',
    lbl_vessel_config: 'ΔΙΑΜΟΡΦΩΣΗ & ΠΑΡΑΜΕΤΡΟΙ ΠΛΟΙΟΥ',
    lbl_presets: 'Πρότυπα Πλοίου',
    lbl_total_holds: 'Σύνολο Δεξαμενών Φορτίου (Σειρές: 1-20)',
    lbl_include_slops: 'Συμπερίληψη Δεξαμενών Slop (Slop P / Slop S)',
    lbl_schematic_builder: 'ΕΥΕΛΙΚΤΟΣ ΣΧΕΔΙΑΣΤΗΣ ΔΕΞΑΜΕΝΩΝ',
    lbl_schematic_desc: 'Ενεργοποιήστε/απενεργοποιήστε τις δεξαμενές αριστερά (P), κέντρο (C) ή δεξιά (S) για κάθε σειρά ώστε να ταιριάζει με το Πιστοποιητικό Καταλληλότητας.',
    lbl_vessel_metadata: 'ΜΕΤΑΔΕΔΟΜΕΝΑ ΠΛΟΙΟΥ',
    lbl_vessel_name: 'Όνομα Πλοίου',
    lbl_imo_number: 'Αριθμός IMO',
    lbl_chief_officer: 'Όνομα Υποπλοιάρχου',
    lbl_company_logo: 'Λογότυπο Εταιρείας (URL εικόνας)',
    lbl_eco_constants: 'ΣΤΑΘΕΡΕΣ ECO-ΥΠΟΛΟΓΙΣΤΗ',
    lbl_fuel_cost: 'Κόστος Καυσίμου ($/MT)',
    lbl_slop_fee: 'Κόστος Slops ($/m³)',
    lbl_fw_cost: 'Κόστος Γλυκού Νερού ($/m³)',
    lbl_detergent_cost: 'Κόστος Απορρυπαντικού ($/L)',
    lbl_nozzle_flow: 'Παροχή Butterworth (m³/h)',
    lbl_ambient_temp: 'Θερμοκρασία Περιβάλλοντος (°C)',
    lbl_sea_temp: 'Θερμοκρασία Θάλασσας (°C)',
    lbl_boiler_efficiency: 'Απόδοση Λέβητα (%)',
    btn_simulate_run: 'ΠΡΟΣΟΜΟΙΩΣΗ & ΕΚΤΕΛΕΣΗ ΠΡΩΤΟΚΟΛΛΩΝ',
    lbl_tank_details: 'ΕΠΕΞΕΡΓΑΣΤΗΣ ΔΕΞΑΜΕΝΗΣ',
    lbl_active_hold: 'ΕΝΕΡΓΗ ΔΕΞΑΜΕΝΗ:',
    lbl_editor_no_selection: 'Κάντε κλικ σε οποιαδήποτε δεξαμενή στο σχέδιο του πλοίου στα αριστερά για να επεξεργαστείτε το φορτίο, την επίστρωση και την κατάσταση WWT.',
    lbl_coating_type: 'Επίστρωση Δεξαμενής',
    lbl_line_coating: 'Επίστρωση Σωληνώσεων',
    lbl_capacity: 'Χωρητικότητα (m³)',
    lbl_cargo_sequence: 'ΑΛΛΗΛΟΥΧΙΑ ΦΟΡΤΙΩΝ',
    lbl_last_cargo: 'ΤΕΛΕΥΤΑΙΟ ΦΟΡΤΙΟ',
    lbl_next_cargo: 'ΕΠΟΜΕΝΟ ΦΟΡΤΙΟ',
    lbl_heated_cargo: '🔥 ΘΕΡΜΑΙΝΟΜΕΝΟ ΦΟΡΤΙΟ (ΕΝΕΡΓΗ ΘΕΡΜΑΝΣΗ)',
    lbl_wwt_status: 'ΚΑΤΑΣΤΑΣΗ WALL WASH TEST (WWT)',
    wwt_hydrocarbons: '🧪 Υδρογονάνθρακες (Επιτυχές / Διαυγές)',
    wwt_chlorides: '🧂 Χλωρίδια (< 5 ppm)',
    wwt_permanganate: '⏱️ Χρόνος Υπερμαγγανικού (Επιτυχές)',
    wwt_ph: '📈 Ουδετερότητα pH (6.5 - 7.5)',
    btn_save_config: 'ΑΠΟΘΗΚΕΥΣΗ ΡΥΘΜΙΣΕΩΝ',
    btn_clear_config: 'ΚΑΘΑΡΙΣΜΟΣ',
    btn_clear_all_tanks: '🧹 ΚΑΘΑΡΙΣΜΟΣ ΟΛΩΝ',
    lbl_report_title: 'ΕΚΘΕΣΗ ΠΡΟΣΟΜΟΙΩΣΗΣ ΣΤΟΛΟΥ',
    lbl_cost_report: '📊 ΕΚΘΕΣΗ ΚΟΣΤΟΥΣ ECO-ΠΛΥΣΗΣ',
    tbl_resource: 'ΚΑΤΗΓΟΡΙΑ',
    tbl_qty: 'ΠΟΣΟΤΗΤΑ',
    tbl_cost: 'ΚΟΣΤΟΣ',
    res_fw: 'Γλυκό Νερό',
    res_fuel: 'Καύσιμο Λέβητα',
    res_slop: 'Διάθεση Slops',
    res_detergent: 'Καθαριστικά',
    res_total_est: 'ΣΥΝΟΛΙΚΗ ΕΚΤΙΜΗΣΗ',
    lbl_additive_sheet: '📦 ΦΥΛΛΟ ΠΑΡΑΓΓΕΛΙΑΣ ΠΡΟΣΘΕΤΩΝ',
    lbl_detailed_protocols: 'ΛΕΠΤΟΜΕΡΗ ΠΡΩΤΟΚΟΛΛΑ ΑΝΑ ΔΕΞΑΜΕΝΗ',
    lbl_vetting_certs: 'ΠΙΣΤΟΠΟΙΗΤΙΚΑ ΕΠΙΘΕΩΡΗΣΗΣ ΠΛΟΙΟΥ',
    lbl_certs_desc: 'Τα πιστοποιητικά δημιουργούνται αυτόματα για τις δεξαμενές που έχουν περάσει και τα 4 Wall Wash Tests (WWT). Κάντε κλικ στο "Εκτύπωση" για εξαγωγή σε A4.',
    lbl_footer_sub: 'Σύστημα Πρωτοκόλλων Καθαρισμού Δεξαμενών',
    lbl_footer_tagline: 'ΤΡΟΦΟΔΟΤΕΙΤΑΙ ΑΠΟ ΕΝΑΝ ΤΟΠΟΛΟΓΙΚΟ ΕΠΙΛΥΤΗ ΕΠΟΜΕΝΗΣ ΓΕΝΙΑΣ ΠΟΥ ΑΝΑΛΥΕΙ ΔΥΝΑΜΙΚΑ 168.000+ ΣΥΝΔΥΑΣΜΟΥΣ ΠΛΥΣΗΣ ΣΕ ΧΙΛΙΟΣΤΑ ΤΟΥ ΔΕΥΤΕΡΟΛΕΠΤΟΥ.',
    modal_title: 'ΕΠΑΓΓΕΛΜΑΤΙΚΗ ΑΠΟΠΟΙΗΣΗ ΕΥΘΥΝΗΣ',
    modal_body: `Αυτό το πρωτόκολλο παρέχεται μόνο για σκοπούς αναφοράς. Προχωρώντας, επιβεβαιώνετε ότι:<ul><li>Είστε πιστοποιημένος αξιωματικός καταστρώματος ή πραγματογνώμονας</li><li>Θα επαληθεύσετε αυτό το πρωτόκολλο με το Πιστοποιητικό Καταλληλότητας του πλοίου σας</li><li>Η τελική ευθύνη βαρύνει εξ ολοκλήρου εσάς</li><li>Η ASTRID ATS δεν φέρει καμία ευθύνη για απώλεια ή ζημιά φορτίου</li></ul>`,
    modal_cancel: 'ΑΚΥΡΩΣΗ',
    modal_confirm: 'ΚΑΤΑΝΟΩ & ΑΠΟΔΕΧΟΜΑΙ',
    err_coating: 'Παρακαλώ επιλέξτε τύπο επίστρωσης δεξαμενής και σωληνώσεων.',
    err_select: 'Παρακαλώ επιλέξτε έγκυρα φορτία από τη λίστα.',
    err_notfound: 'Δεν βρέθηκε πρωτόκολλο για αυτόν τον συνδυασμό φορτίων.',
    err_loading: 'Τα δεδομένα φορτώνονται, παρακαλώ περιμένετε...',
    intensity_levels: ['','Ελάχιστη','Πολύ Ελαφριά','Ελαφριά','Ελαφριά Τυπική','Τυπική','Τυπική Έντονη','Έντονη','Πολύ Έντονη','Εξαιρετικά Έντονη','Μέγιστη'],
    step_prefix: 'ΒΗΜΑ',
    lbl_engine_title: 'ΔΥΝΑΜΙΚΗ ΜΗΧΑΝΗ ASTRID v2.0 PRO',
    lbl_engine_desc: 'Ενεργή βάση δεδομένων: 168.000+ συνδυασμοί αναλύονται σε <5ms. Ο επιλυτής τοπολογικής διαδρομής επόμενης γενιάς βελτιστοποιεί χρόνο, νερό και καύσιμο.',
    placeholder_search: 'Αναζήτηση φορτίου...',
    err_incomplete_last: 'Δεν έχει καθοριστεί το προηγούμενο φορτίο.',
    err_incomplete_next: 'Δεν έχει καθοριστεί το επόμενο φορτίο.',
    err_no_protocol: 'Δεν βρέθηκε πρωτόκολλο καθαρισμού στη βάση δεδομένων.',
    err_db_procedure_missing: 'Λείπουν οι λεπτομέρειες της διαδικασίας από τη βάση δεδομένων.',
    lbl_filter_tanks: 'ΦΙΛΤΡΑΡΙΣΜΑ ΔΕΞΑΜΕΝΩΝ ΦΟΡΤΙΟΥ',
    btn_filter_all: 'ΟΛΑ',
    btn_filter_selected: 'ΕΠΙΛΕΓΜΕΝΟ',
    btn_filter_custom: 'ΠΡΟΣΑΡΜΟΣΜΕΝΟ',
    lbl_fallback_badge: '⚠️ ΑΝΑΦΟΡΑ ΠΑΡΟΜΟΙΟΥ ΦΟΡΤΙΟΥ',
    lbl_derived_from: 'Προέρχεται από'
  },
  ru: {
    hero_tag: 'АВТОМАТИЧЕСКАЯ СИСТЕМА ПРОТОКОЛОВ ОЧИСТКИ ТАНКОВ',
    hero_sub: 'Выберите конфигурацию судна и груз для создания протокола очистки',
    disc_text: 'Только для справочных целей. Все протоколы должны быть проверены квалифицированным Старшим Помощником или Сюрвейером. Astrid ATS не несет ответственности.',
    nav_subscribe: 'ЛИЦЕНЗИРОВАНИЕ',
    nav_login: 'ВОЙТИ',
    nav_logout: 'ВЫЙТИ',
    tab_config: '⚙️ НАСТРОЙКИ',
    tab_editor: '📝 РЕДАКТОР',
    tab_eco: '📈 ЭКО-МОЙКА',
    tab_certs: '📜 СЕРТИФИКАТЫ',
    lbl_vessel_config: 'КОНФИГУРАЦИЯ И ПАРАМЕТРЫ СУДНА',
    lbl_presets: 'Шаблоны Судов',
    lbl_total_holds: 'Всего Грузовых Танков (Ряды: 1-20)',
    lbl_include_slops: 'Включить кормовые слоп-танки (Slop P / Slop S)',
    lbl_schematic_builder: 'ГИБКИЙ КОНСТРУКТОР ТАНКОВ',
    lbl_schematic_desc: 'Включайте или отключайте Левый (P), Средний (C) или Правый (S) танк для каждого ряда в соответствии с вашим Свидетельством о годности судна (CoF).',
    lbl_vessel_metadata: 'МЕТАДАННЫЕ СУДНА',
    lbl_vessel_name: 'Название Судна',
    lbl_imo_number: 'Номер ИМО',
    lbl_chief_officer: 'Имя Старшего Помощника',
    lbl_company_logo: 'Логотип Компании (Ссылка на изображение)',
    lbl_eco_constants: 'ПАРАМЕТРЫ ЭКО-КАЛЬКУЛЯТОРА',
    lbl_fuel_cost: 'Стоимость Топлива ($/MT)',
    lbl_slop_fee: 'Сбор за Сброс Смывок ($/m³)',
    lbl_fw_cost: 'Стоимость Пресной Воды ($/m³)',
    lbl_detergent_cost: 'Стоимость Детергента ($/L)',
    lbl_nozzle_flow: 'Расход Butterworth (m³/h)',
    lbl_ambient_temp: 'Темп. Среды (°C)',
    lbl_sea_temp: 'Темп. Морской Воды (°C)',
    lbl_boiler_efficiency: 'КПД Котла (%)',
    btn_simulate_run: 'СИМУЛИРОВАТЬ И ЗАПУСТИТЬ ПРОТОКОЛЫ',
    lbl_tank_details: 'РЕДАКТИРОВАНИЕ ТАНКА',
    lbl_editor_no_selection: 'Пожалуйста, выберите любой танк на схеме судна слева, чтобы отредактировать его груз, покрытие и статус теста WWT.',
    lbl_active_hold: 'АКТИВНЫЙ ТАНК:',
    lbl_coating_type: 'Покрытие Танка',
    lbl_line_coating: 'Покрытие Трубопровода',
    lbl_capacity: 'Объем (м³)',
    lbl_cargo_sequence: 'ПОСЛЕДОВАТЕЛЬНОСТЬ ГРУЗОВ',
    lbl_last_cargo: 'ПОСЛЕДНИЙ ГРУЗ',
    lbl_next_cargo: 'СЛЕДУЮЩИЙ ГРУЗ',
    lbl_heated_cargo: '🔥 ПОДОГРЕВАЕМЫЙ ГРУЗ (АКТИВНЫЙ ПОДОГРЕВ)',
    lbl_wwt_status: 'РЕЗУЛЬТАТ ТЕСТА СМЫВКИ СТЕН (WWT)',
    wwt_hydrocarbons: '🧪 Углеводороды (Пройдено / Чистый)',
    wwt_chlorides: '🧂 Хлориды (< 5 ppm)',
    wwt_permanganate: '⏱️ Перманганатное Время (Пройдено)',
    wwt_ph: '📈 Проверка pH (6.5 - 7.5)',
    btn_save_config: 'СОХРАНИТЬ КОНФИГУРАЦИЮ',
    btn_clear_config: 'ОЧИСТИТЬ',
    btn_clear_all_tanks: '🧹 ОЧИСТИТЬ ВСЕ',
    lbl_report_title: 'ОТЧЕТ ПО СИМУЛЯЦИИ ФЛОТА',
    lbl_cost_report: '📊 СМЕТА РАСХОДОВ НА ЭКО-МОЙКУ',
    tbl_resource: 'РЕСУРС',
    tbl_qty: 'ОБЪЕМ',
    tbl_cost: 'СТОИМОСТЬ',
    res_fw: 'Пресная Вода',
    res_fuel: 'Топливо Котла',
    res_slop: 'Сброс Смывок',
    res_detergent: 'Моющие Средства',
    res_total_est: 'ОБЩАЯ СУММА',
    lbl_additive_sheet: '📦 ЛИСТ ЗАКАЗА ХИМИКАТОВ',
    lbl_detailed_protocols: 'ДЕТАЛЬНЫЕ ПРОТОКОЛЫ ПО ТАНКАМ',
    lbl_vetting_certs: 'СЕРТИФИКАТЫ ПРОВЕРКИ ТАНКОВ',
    lbl_certs_desc: 'Сертификаты генерируются автоматически для грузовых танков, успешно прошедших все 4 теста смывки стен (WWT). Нажмите "Печать" для экспорта в A4.',
    lbl_footer_sub: 'Система Протоколов Очистки Танков',
    lbl_footer_tagline: 'РАБОТАЕТ НА БАЗЕ ТОПОЛОГИЧЕСКОГО РЕШАТЕЛЯ НОВОГО ПОКОЛЕНИЯ, АНАЛИЗИРУЮЩЕГО БОЛЕЕ 168 000 КОМБИНАЦИЙ МОЙКИ ЗА МИЛЛИСЕКУНДЫ.',
    modal_title: 'ПРОФЕССИОНАЛЬНЫЙ ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ',
    modal_body: `Этот протокол предоставляется только для справки. Продолжая, вы подтверждаете, что:<ul><li>Вы являетесь квалифицированным судоводителем или сюрвейером</li><li>Вы сверите этот протокол со Свидетельством о годности вашего судна</li><li>Окончательная ответственность лежит исключительно на вас</li><li>ASTRID ATS не несет ответственности за любую потерю или повреждение груза</li></ul>`,
    modal_cancel: 'ОТМЕНА',
    modal_confirm: 'Я ПОНИМАЮ И ПРИНИМАЮ',
    err_coating: 'Пожалуйста, выберите типы покрытия танка и трубопроводов.',
    err_select: 'Пожалуйста, выберите корректные грузы из списка.',
    err_notfound: 'Протокол для данной комбинации грузов не найден.',
    err_loading: 'Загрузка данных, пожалуйста, подождите...',
    intensity_levels: ['','Минимальная','Очень Легкая','Легкая','Легкая Стандартная','Стандартная','Стандартная Интенсивная','Интенсивная','Очень Интенсивная','Ультра Интенсивная','Максимальная'],
    step_prefix: 'ШАГ',
    lbl_engine_title: 'ДИНАМИЧЕСКИЙ ДВИЖОК ASTRID v2.0 PRO',
    lbl_engine_desc: 'Активная база данных: более 168 000 комбинаций анализируются менее чем за 5 мс. Топологический решатель оптимизирует время, воду и топливо.',
    placeholder_search: 'Поиск груза...',
    err_incomplete_last: 'Предыдущий груз не указан.',
    err_incomplete_next: 'Следующий груз не указан.',
    err_no_protocol: 'Протокол очистки не найден в базе данных.',
    err_db_procedure_missing: 'Детали процедуры отсутствуют в базе данных.',
    lbl_filter_tanks: 'ФИЛЬТР ГРУЗОВЫХ ТАНКОВ',
    btn_filter_all: 'ВСЕ',
    btn_filter_selected: 'ВЫБРАННЫЙ',
    btn_filter_custom: 'ВЫБОР',
    lbl_fallback_badge: '⚠️ ПОДОБНЫЙ КЛАСС ГРУЗА',
    lbl_derived_from: 'Получено из'
  },
  zh: {
    hero_tag: '自动洗舱协议系统',
    hero_sub: '选择船舶配置和货物以生成您的洗舱协议',
    disc_text: '仅供参考。所有洗舱协议必须由合格的大副或验舱师核实。Astrid ATS 不承担任何货损责任。',
    nav_subscribe: '许可服务',
    nav_login: '登录',
    nav_logout: '退出登录',
    tab_config: '⚙️ 船舶配置',
    tab_editor: '📝 储罐编辑',
    tab_eco: '📈 环保洗舱',
    tab_certs: '📜 验舱证书',
    lbl_vessel_config: '船舶配置与参数',
    lbl_presets: '预设船舶类型',
    lbl_total_holds: '货物舱室总数 (排数: 1-20)',
    lbl_include_slops: '包含尾部残油舱 (Slop P / Slop S)',
    lbl_schematic_builder: '灵活舱室图纸定制器',
    lbl_schematic_desc: '为您在每个货舱排中启用或禁用左舷 (P)、中央 (C) 或右舷 (S) 储罐，以匹配您的适装证书 (Certificate of Fitness)。',
    lbl_vessel_metadata: '船舶元数据',
    lbl_vessel_name: '船名',
    lbl_imo_number: 'IMO 编号',
    lbl_chief_officer: '大副姓名',
    lbl_company_logo: '公司徽标 (图片 URL)',
    lbl_eco_constants: '环保计算常数',
    lbl_fuel_cost: '燃油成本 ($/吨)',
    lbl_slop_fee: '废液处理费 ($/m³)',
    lbl_fw_cost: '淡水成本 ($/m³)',
    lbl_detergent_cost: '清洁剂成本 ($/升)',
    lbl_nozzle_flow: '洗舱机流量 (m³/h)',
    lbl_ambient_temp: '环境温度 (°C)',
    lbl_sea_temp: '海水温度 (°C)',
    lbl_boiler_efficiency: '锅炉效率 (%)',
    btn_simulate_run: '模拟计算并运行洗舱协议',
    lbl_tank_details: '舱室详情编辑器',
    lbl_editor_no_selection: '请点击左侧俯视船舶图纸中的任何储罐，以编辑其货物、涂层和壁洗测试 (WWT) 状态。',
    lbl_active_hold: '活动储罐:',
    lbl_coating_type: '舱壁涂层',
    lbl_line_coating: '管路涂层',
    lbl_capacity: '容量 (m³)',
    lbl_cargo_sequence: '装载货物序列',
    lbl_last_cargo: '前度货物',
    lbl_next_cargo: '拟载货物',
    lbl_heated_cargo: '🔥 加热货物 (主动加热中)',
    lbl_wwt_status: '壁洗测试 (WWT) 状态',
    wwt_hydrocarbons: '🧪 碳氢化合物测试 (合格 / 水白)',
    wwt_chlorides: '🧂 氯化物测试 (< 5 ppm)',
    wwt_permanganate: '⏱️ 高锰酸钾时间测试 (合格)',
    wwt_ph: '📈 pH 中性度检查 (6.5 - 7.5)',
    btn_save_config: '保存配置信息',
    btn_clear_config: '清除',
    btn_clear_all_tanks: '🧹 清除所有舱',
    lbl_report_title: '船队模拟报告',
    lbl_cost_report: '📊 环保洗舱成本报告',
    tbl_resource: '资源类别',
    tbl_qty: '计划数量',
    tbl_cost: '估算成本',
    res_fw: '淡水消耗',
    res_fuel: '锅炉燃油',
    res_slop: '废液排放',
    res_detergent: '专用洗舱化学品',
    res_total_est: '总计预估费用',
    lbl_additive_sheet: '📦 添加剂采购计划单',
    lbl_detailed_protocols: '按舱划分的详细洗舱协议',
    lbl_vetting_certs: '船舶审核适航证书',
    lbl_certs_desc: '为通过了全部 4 项壁洗测试 (WWT) 的货舱自动生成清洁度证书。点击“打印”可将其以标准的 A4 纸张格式导出。',
    lbl_footer_sub: '船舶舱室洗舱协议生成系统',
    lbl_footer_tagline: '由新一代拓扑路径求解器提供支持，在几毫秒内动态计算 168,000+ 种组合，优化全球船舶的周转时间。',
    modal_title: '专业免责声明',
    modal_body: `本协议仅供参考。继续操作即表示您确认：<ul><li>您是合格的航海高级船员或验船师</li><li>您将根据本船的适装证书核对此洗舱协议</li><li>最终的责任完全由您自己承担</li><li>ASTRID ATS 对任何货物污染或损失概不负责</li></ul>`,
    modal_cancel: '取消',
    modal_confirm: '我已阅读并接受',
    err_coating: '请选择舱室和管路的涂层类型。',
    err_select: '请从下拉列表中选择有效的货物名称。',
    err_notfound: '未找到此货物组合的洗舱协议。',
    err_loading: '数据加载中，请稍候...',
    intensity_levels: ['','微量级','极轻度','轻度','轻度标准','标准洗舱','标准强化','重度洗舱','极重度','超极重度','最大洗舱烈度'],
    step_prefix: '步骤',
    lbl_engine_title: 'ASTRID 动态引擎 v2.0 专业版',
    lbl_engine_desc: '活跃数据库: 在 <5 毫秒内动态匹配 168,000+ 种清洗组合。新一代拓扑清洗路径求解器优化时间、淡水与燃油消耗。',
    placeholder_search: '搜索货物...',
    err_incomplete_last: '未指定前度货物。',
    err_incomplete_next: '未指定拟载货物。',
    err_no_protocol: '数据库中未找到洗舱协议。',
    err_db_procedure_missing: '数据库中缺少步骤详情。',
    lbl_filter_tanks: '过滤货舱',
    btn_filter_all: '全部',
    btn_filter_selected: '已选',
    btn_filter_custom: '自定义',
    lbl_fallback_badge: '⚠️ 类似货物参考',
    lbl_derived_from: '衍生自'
  }
};

// --- DECRYPTION KEY RETRIEVAL ---
async function fetchDecryptionKey() {
  if (!sbClient || !currentUser) return null;
  try {
    const { data, error } = await sbClient
      .from('app_config')
      .select('value')
      .eq('key', 'decryption_key')
      .maybeSingle();
    if (error) {
      console.error("Error fetching decryption key:", error);
      return null;
    }
    return data ? data.value : null;
  } catch (e) {
    console.error("Failed to fetch key:", e);
    return null;
  }
}

function showDecryptionError() {
  document.body.style.display = 'block';
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #050810; color: #fff; font-family: sans-serif; padding: 20px; box-sizing: border-box;">
      <div style="max-width: 480px; width: 100%; background: #0b111e; border: 1px solid rgba(255, 75, 75, 0.15); padding: 40px 30px; border-radius: 12px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
        <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
        <h2 style="margin: 0 0 15px; font-weight: 700; letter-spacing: -0.5px; color: #ff4b4b;">
          ${lang === 'tr' ? 'ŞİFRE ÇÖZME HATASI' : 'DECRYPTION KEY ERROR'}
        </h2>
        <p style="font-size: 0.95rem; color: #94a3b8; line-height: 1.6; margin: 0 0 25px;">
          ${lang === 'tr' 
            ? 'Yıkama veritabanı şifre çözme anahtarı alınamadı veya doğrulanamadı. Lütfen Supabase veritabanında "app_config" tablosunun kurulu olduğundan emin olun.' 
            : 'The wash database decryption key could not be retrieved or verified. Please ensure the "app_config" table is properly configured in Supabase.'}
        </p>
        <button onclick="handleLogout()" 
                style="display: inline-block; width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">
          ${lang === 'tr' ? 'Çıkış Yap' : 'Log Out'}
        </button>
      </div>
    </div>
  `;
}

// --- SUPABASE AUTH ---
async function initSupabase() {
  try {
    const { createClient } = supabase;
    sbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data } = await sbClient.auth.getSession();
    if (data?.session) {
      currentUser = data.session.user;
      isDemoUser = currentUser && currentUser.email && currentUser.email.toLowerCase().includes('demo');
      await loadSubscription();
      if (subscriptionStatus !== 'active') {
        showB2BLicenseBlock();
        return;
      }
      
      const key = await fetchDecryptionKey();
      if (!key) {
        showDecryptionError();
        return;
      }
      
      const success = await loadData(key);
      if (!success) {
        showDecryptionError();
        return;
      }
      
      applyDefaultPresetOnLoad();
      updateNavAuth(true);
      document.body.style.display = 'block';
    } else {
      currentUser = null;
      isDemoUser = false;
      subscriptionStatus = null;
      subscriptionPlan = null;
      updateNavAuth(false);
      window.location.href = 'login.html';
      return;
    }

    sbClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        window.location.href = 'login.html';
      } else {
        currentUser = session?.user || null;
        isDemoUser = currentUser && currentUser.email && currentUser.email.toLowerCase().includes('demo');
        await loadSubscription();
        updateNavAuth(!!currentUser);
        if (subscriptionStatus !== 'active') {
          showB2BLicenseBlock();
        } else {
          if (!dataLoaded) {
            const key = await fetchDecryptionKey();
            if (!key) {
              showDecryptionError();
              return;
            }
            const success = await loadData(key);
            if (!success) {
              showDecryptionError();
              return;
            }
            applyDefaultPresetOnLoad();
          }
          document.body.style.display = 'block';
        }
      }
    });
  } catch(e) {
    currentUser = null;
    isDemoUser = false;
    subscriptionStatus = null;
    subscriptionPlan = null;
    updateNavAuth(false);
    window.location.href = 'login.html';
  }
}

function showB2BLicenseBlock() {
  document.body.style.display = 'block';
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #050810; color: #fff; font-family: sans-serif; padding: 20px; box-sizing: border-box;">
      <div style="max-width: 480px; width: 100%; background: #0b111e; border: 1px solid rgba(0, 212, 255, 0.15); padding: 40px 30px; border-radius: 12px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
        <div style="font-size: 3rem; margin-bottom: 20px;">🔒</div>
        <h2 style="margin: 0 0 15px; font-weight: 700; letter-spacing: -0.5px; color: #00d4ff;">
          ${lang === 'tr' ? 'LİSANS AKTİVASYONU GEREKLİ' : 'LICENSE ACTIVATION REQUIRED'}
        </h2>
        <p style="font-size: 0.95rem; color: #94a3b8; line-height: 1.6; margin: 0 0 25px;">
          ${lang === 'tr' 
            ? `Hesabınız başarıyla oluşturuldu (${currentUser.email}). Ancak bu gemi hesabı için henüz aktif bir B2B lisansı tanımlanmamıştır.` 
            : `Your account has been successfully created (${currentUser.email}). However, an active B2B Vessel License is not yet assigned to this account.`}
        </p>
        <p style="font-size: 0.9rem; color: #cbd5e1; line-height: 1.6; margin: 0 0 30px;">
          ${lang === 'tr'
            ? 'Lisansınızı aktif etmek ve tam sürüm erişimi sağlamak için lütfen şirket yöneticinizle veya satış birimimizle iletişime geçin:'
            : 'To activate your license and enable full fleet simulator access, please contact your company administrator or our sales department:'}
        </p>
        <a href="mailto:sales@astridats.com?subject=B2B License Activation Request - ${currentUser.email}" 
           style="display: inline-block; width: 100%; background: #00d4ff; color: #050810; padding: 12px 20px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 0.9rem; box-sizing: border-box;">
          sales@astridats.com
        </a>
        <button onclick="handleLogout()" 
                style="display: inline-block; width: 100%; margin-top: 15px; background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">
          ${lang === 'tr' ? 'Farklı Hesapla Giriş Yap' : 'Log In with Different Account'}
        </button>
      </div>
    </div>
  `;
}

function updateNavAuth(loggedIn) {
  const loginBtn = document.getElementById('btn-login-nav');
  const logoutBtn = document.getElementById('btn-logout-nav');
  const subscribeBtn = document.getElementById('pricing-nav-btn');
  const t = T[lang] || T['en'];

  if (loginBtn) {
    loginBtn.textContent = t.auth_btn_login || 'LOGIN';
    loginBtn.style.display = loggedIn ? 'none' : '';
  }
  if (logoutBtn) {
    logoutBtn.textContent = t.auth_btn_logout || 'LOG OUT';
    logoutBtn.style.display = loggedIn ? '' : 'none';
  }

  if (subscribeBtn) {
    if (!loggedIn) {
      subscribeBtn.textContent = t.pricing_btn || 'SUBSCRIBE';
      subscribeBtn.href = 'pricing.html';
      subscribeBtn.classList.remove('nav-pill-active', 'nav-pill-lifetime');
      subscribeBtn.classList.add('nav-pill-accent');
      subscribeBtn.style.cursor = 'pointer';
      subscribeBtn.style.pointerEvents = '';
    } else if (subscriptionStatus === 'active' && subscriptionPlan === 'lifetime') {
      subscribeBtn.textContent = '✓ LIFETIME';
      subscribeBtn.href = 'javascript:void(0)';
      subscribeBtn.classList.remove('nav-pill-accent');
      subscribeBtn.classList.add('nav-pill-lifetime');
      subscribeBtn.style.cursor = 'default';
      subscribeBtn.style.pointerEvents = 'none';
    } else if (subscriptionStatus === 'active' && subscriptionPlan === 'annual') {
      subscribeBtn.textContent = '✓ ANNUAL';
      subscribeBtn.href = 'pricing.html';
      subscribeBtn.title = t.upgrade_tooltip || 'Upgrade to Lifetime';
      subscribeBtn.classList.remove('nav-pill-accent');
      subscribeBtn.classList.add('nav-pill-active');
      subscribeBtn.style.cursor = 'pointer';
      subscribeBtn.style.pointerEvents = '';
    } else {
      subscribeBtn.textContent = t.pricing_btn || 'SUBSCRIBE';
      subscribeBtn.href = 'pricing.html';
      subscribeBtn.classList.remove('nav-pill-active', 'nav-pill-lifetime');
      subscribeBtn.classList.add('nav-pill-accent');
      subscribeBtn.style.cursor = 'pointer';
      subscribeBtn.style.pointerEvents = '';
    }
  }
}

async function handleLogout() {
  if (sbClient) await sbClient.auth.signOut().catch(() => {});
  currentUser = null;
  updateNavAuth(false);
  window.location.href = 'index.html';
}

let subscriptionStatus = null; 
let subscriptionPlan = null;   

async function loadSubscription() {
  if (!sbClient || !currentUser) {
    subscriptionStatus = null;
    subscriptionPlan = null;
    return;
  }
  try {
    const { data, error } = await sbClient
      .from('subscriptions')
      .select('status, plan, ends_at')
      .eq('user_email', currentUser.email.toLowerCase())
      .maybeSingle();
    if (error) {
      subscriptionStatus = null;
      subscriptionPlan = null;
      return;
    }
    if (data) {
      if (data.ends_at && new Date(data.ends_at) < new Date()) {
        subscriptionStatus = 'expired';
      } else {
        subscriptionStatus = data.status;
      }
      subscriptionPlan = data.plan;
    } else {
      subscriptionStatus = null;
      subscriptionPlan = null;
    }
  } catch(e) {
    subscriptionStatus = null;
    subscriptionPlan = null;
  }
}

function isSubscribed() {
  return subscriptionStatus === 'active';
}

function getTodayKey() {
  const uid = currentUser ? currentUser.id : 'guest';
  return 'ats_usage_' + uid + '_' + new Date().toISOString().split('T')[0];
}

function getUsageCount() {
  return parseInt(localStorage.getItem(getTodayKey()) || '0');
}

function incrementUsage() {
  localStorage.setItem(getTodayKey(), (getUsageCount() + 1).toString());
}

// --- INITIALIZE & THEME ---
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  applyLang();
  setupInputListeners();
  await initSupabase();
});

function initTheme() {
  const theme = localStorage.getItem('ats_theme') || 'dark';
  const btn = document.getElementById('btn-theme-toggle');
  if (theme === 'light') {
    document.body.classList.add('light-mode');
    if (btn) {
      btn.textContent = '🌙';
      btn.title = 'Toggle Dark Mode';
    }
  } else {
    document.body.classList.remove('light-mode');
    if (btn) {
      btn.textContent = '☀️';
      btn.title = 'Toggle Light Mode';
    }
  }
}

function toggleTheme() {
  const body = document.body;
  const btn = document.getElementById('btn-theme-toggle');
  if (body.classList.contains('light-mode')) {
    body.classList.remove('light-mode');
    localStorage.setItem('ats_theme', 'dark');
    if (btn) {
      btn.textContent = '☀️';
      btn.title = 'Toggle Light Mode';
    }
  } else {
    body.classList.add('light-mode');
    localStorage.setItem('ats_theme', 'light');
    if (btn) {
      btn.textContent = '🌙';
      btn.title = 'Toggle Dark Mode';
    }
  }
}

// ---- DATA LOADING ----
function rc4(key, str) {
  let s = [], i, J = 0, res = '';
  for (i = 0; i < 256; i++) {
    s[i] = i;
  }
  for (i = 0; i < 256; i++) {
    J = (J + s[i] + key.charCodeAt(i % key.length)) % 256;
    let temp = s[i];
    s[i] = s[J];
    s[J] = temp;
  }
  i = 0;
  J = 0;
  for (let y = 0; y < str.length; y++) {
    i = (i + 1) % 256;
    J = (J + s[i]) % 256;
    let temp = s[i];
    s[i] = s[J];
    s[J] = temp;
    res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[J]) % 256]);
  }
  return res;
}

async function loadData(decryptionKey) {
  try {
    namesData = window.ATS_CARGO_INDEX || {};
    const [matrixRes, procsRes] = await Promise.all([
      fetch('data/matrix_lookup.enc'),
      fetch('data/procedures.enc')
    ]);
    if (!matrixRes.ok || !procsRes.ok) {
      throw new Error("Failed to fetch encrypted database files");
    }
    const matrixBase64 = await matrixRes.text();
    const procsBase64 = await procsRes.text();
    
    // Decrypt matrix_lookup
    const matrixBinary = atob(matrixBase64.trim());
    const matrixDecryptedBinary = rc4(decryptionKey, matrixBinary);
    const matrixJson = decodeURIComponent(escape(matrixDecryptedBinary));
    matrixData = JSON.parse(matrixJson);
    
    // Decrypt procedures
    const procsBinary = atob(procsBase64.trim());
    const procsDecryptedBinary = rc4(decryptionKey, procsBinary);
    const procsJson = decodeURIComponent(escape(procsDecryptedBinary));
    proceduresData = JSON.parse(procsJson);

    namesArray = Object.values(namesData).sort((a,b) => {
      return (a.display || a.name || '').localeCompare(b.display || b.name || '');
    });
    buildCargoSearchIndex();
    populateCargoDatalist();
    dataLoaded = true;
    return true;
  } catch(err) {
    console.error("Data decryption failed:", err);
    showError(T[lang].err_loading);
    return false;
  }
}

// ---- LANGUAGE TRANSLATIONS ----
function setLang(l) {
  lang = l;
  localStorage.setItem('ats_lang', l);
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('btn-' + l);
  if (activeBtn) activeBtn.classList.add('active');
  applyLang();
  
  // Re-simulate if active tab is tab-eco
  const tabEco = document.getElementById('tab-eco');
  if (tabEco && !tabEco.classList.contains('hidden')) {
    calculateFleetProtocols();
  }
}

function applyLang() {
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('btn-' + lang);
  if (activeBtn) activeBtn.classList.add('active');
  
  document.documentElement.lang = lang;
  
  const t = T[lang] || T['en'];
  
  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.getAttribute('data-translate');
    if (t[key]) {
      if (key === 'modal_body' || key === 'lbl_schematic_desc' || key === 'lbl_certs_desc') {
        el.innerHTML = t[key];
      } else {
        el.textContent = t[key];
      }
    }
  });

  document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
    const key = el.getAttribute('data-translate-placeholder');
    if (t[key]) {
      el.placeholder = t[key];
    }
  });

  updateNavAuth(!!currentUser);
  
  const tabEco = document.getElementById('tab-eco');
  if (tabEco && !tabEco.classList.contains('hidden')) {
    if (Object.keys(vesselTanks).some(id => vesselTanks[id].lastCargoId && vesselTanks[id].nextCargoId)) {
      calculateFleetProtocols();
    }
  }
  
  const tabCerts = document.getElementById('tab-certs');
  if (tabCerts && !tabCerts.classList.contains('hidden')) {
    if (Object.keys(vesselTanks).some(id => vesselTanks[id].lastCargoId && vesselTanks[id].nextCargoId)) {
      calculateFleetProtocols();
    }
  }
}

// ---- CARGO SYNONYM INDEX SEARCH ----
function normalizeCargoText(value) {
  return (value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCargoCompact(value) {
  return normalizeCargoText(value).replace(/\s/g, '');
}

function buildCargoSearchIndex() {
  cargoSearchIndex = [];
  labelToCargoId = new Map();

  const addLabel = (id, label) => {
    const text = (label || '').trim();
    if (!text || text.length < 2) return;
    const norm = normalizeCargoText(text);
    const compact = normalizeCargoCompact(text);
    if (!norm) return;
    const key = norm;
    if (!labelToCargoId.has(key)) labelToCargoId.set(key, id);
    labelToCargoId.set(compact, id);
    cargoSearchIndex.push({ id, label: text, norm, compact });
  };

  Object.values(namesData).forEach(rec => {
    const id = String(rec.id);
    addLabel(id, rec.display);
    addLabel(id, rec.name);
    if (rec.alt) addLabel(id, rec.alt);
    (rec.synonyms || []).forEach(s => addLabel(id, s));
  });
}

function populateCargoDatalist() {
  const dl = document.getElementById('cargo-list');
  if (!dl) return;
  dl.innerHTML = '';
  const seen = new Set();
  cargoSearchIndex
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(entry => {
      const key = `${entry.id}|${entry.label}`;
      if (seen.has(key)) return;
      seen.add(key);
      const opt = document.createElement('option');
      opt.value = entry.label;
      opt.label = `#${entry.id} · ${entry.label}`;
      dl.appendChild(opt);
    });
}

function scoreCargoMatch(queryNorm, queryCompact, entry) {
  if (!queryNorm) return 0;
  let score = 0;
  if (entry.norm === queryNorm || entry.compact === queryCompact) score = 1000;
  else if (entry.norm.startsWith(queryNorm) || entry.compact.startsWith(queryCompact)) score = 800;
  else if (entry.norm.includes(queryNorm) || entry.compact.includes(queryCompact)) score = 500;

  const qTokens = queryNorm.split(' ').filter(t => t.length > 2);
  if (qTokens.length) {
    const matched = qTokens.filter(t => entry.norm.includes(t) || entry.compact.includes(t));
    if (matched.length === qTokens.length) {
      score = Math.max(score, 300 + matched.length * 10);
      if (entry.norm.length <= queryNorm.length + 15) score += 80;
    } else if (matched.length) {
      score = Math.max(score, 100 + matched.length * 5);
    }
  }
  return score;
}

function findCargoByQuery(raw) {
  const queryNorm = normalizeCargoText(raw);
  const queryCompact = normalizeCargoCompact(raw);
  if (!queryNorm) return null;

  const directId = labelToCargoId.get(queryNorm) || labelToCargoId.get(queryCompact);
  if (directId && namesData[directId]) return namesData[directId];

  let bestId = null;
  let bestScore = 0;
  let bestLabelLen = Infinity;
  const byId = {};

  cargoSearchIndex.forEach(entry => {
    const score = scoreCargoMatch(queryNorm, queryCompact, entry);
    if (score > (byId[entry.id]?.score || 0)) {
      byId[entry.id] = { score, labelLen: entry.label.length };
    }
  });

  Object.entries(byId).forEach(([id, meta]) => {
    if (meta.score > bestScore || (meta.score === bestScore && meta.labelLen < bestLabelLen)) {
      bestScore = meta.score;
      bestLabelLen = meta.labelLen;
      bestId = id;
    }
  });

  return bestScore >= 100 && bestId ? namesData[bestId] : null;
}

function resolveCargoId(raw, datasetId) {
  if (datasetId && namesData[datasetId]) return datasetId;
  const found = findCargoByQuery(raw);
  return found ? String(found.id) : null;
}

// ---- INPUT LISTENERS ----
function setupInputListeners() {
  ['last','next'].forEach(which => {
    const el = document.getElementById(`editor-input-${which}`);
    if (el) {
      el.addEventListener('input', () => validateEditorInput(which));
      el.addEventListener('change', () => validateEditorInput(which));
    }
  });

  const settingIds = [
    'vessel-name', 'vessel-imo', 'officer-name', 'company-logo',
    'coeff-fuel', 'coeff-slop', 'coeff-fw', 'coeff-detergent',
    'coeff-flow', 'coeff-eff', 'coeff-temp', 'coeff-sea-temp'
  ];
  settingIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', saveSettingsState);
      el.addEventListener('change', saveSettingsState);
    }
  });
}

function validateEditorInput(which) {
  const inputEl = document.getElementById(`editor-input-${which}`);
  const indEl = document.getElementById(`editor-ind-${which}`);
  if (!inputEl) return;
  const val = inputEl.value.trim();

  const found = findCargoByQuery(val);
  if (found) {
    indEl.textContent = `#${found.id}`;
    indEl.classList.add('found');
    inputEl.dataset.cargoId = found.id;
  } else {
    indEl.textContent = val.length > 0 ? '?' : '—';
    indEl.classList.remove('found');
    delete inputEl.dataset.cargoId;
  }
}

// ---- B2B STOWAGE GRID DESIGNER ----
function applyVesselPreset() {
  const preset = document.getElementById('vessel-preset').value;
  const customFields = document.getElementById('custom-builder-fields');
  
  if (preset === 'custom') {
    customFields.classList.remove('hidden');
    const rowsInput = document.getElementById('custom-rows');
    if (rowsInput && vesselLayout && vesselLayout.rows) {
      rowsInput.value = vesselLayout.rows;
    }
    onCustomRowsChange(); // Initialize custom inputs if not already done
    return;
  }
  customFields.classList.add('hidden');
  
  let targetRows = 9;
  if (preset === 'preset-32' || preset === 'preset-48') {
    targetRows = isDemoUser ? 4 : 16;
  } else if (preset === 'preset-18' || preset === 'preset-26') {
    targetRows = isDemoUser ? 4 : 9;
  }

  if (isDemoUser) {
    showError(lang === 'tr' ? 'Demo hesapları maksimum 4 hold ile sınırlandırılmıştır.' : 'Demo accounts are capped at a maximum of 4 holds.');
  } else {
    hideError();
  }

  if (preset === 'preset-32') {
    vesselLayout.rows = targetRows;
    vesselLayout.preset = 'preset-32';
    vesselLayout.rowsData = [];
    for (let r = 1; r <= targetRows; r++) {
      vesselLayout.rowsData.push({ row: r, P_num: r, C_num: null, S_num: r });
    }
  } else if (preset === 'preset-48') {
    vesselLayout.rows = targetRows;
    vesselLayout.preset = 'preset-48';
    vesselLayout.rowsData = [];
    for (let r = 1; r <= targetRows; r++) {
      const hasC = (r !== 1 && r !== targetRows);
      vesselLayout.rowsData.push({ row: r, P_num: r, C_num: hasC ? r : null, S_num: r });
    }
  } else if (preset === 'preset-18') {
    vesselLayout.rows = targetRows;
    vesselLayout.preset = 'preset-18';
    vesselLayout.rowsData = [];
    for (let r = 1; r <= targetRows; r++) {
      vesselLayout.rowsData.push({ row: r, P_num: r, C_num: null, S_num: r });
    }
  } else if (preset === 'preset-26') {
    vesselLayout.rows = targetRows;
    vesselLayout.preset = 'preset-26';
    vesselLayout.rowsData = [];
    for (let r = 1; r <= targetRows; r++) {
      const hasC = (r !== 1 && r !== targetRows);
      vesselLayout.rowsData.push({ row: r, P_num: r, C_num: hasC ? r : null, S_num: r });
    }
  }
  
  // Apply includeSlops if checked
  const chk = document.getElementById('vessel-include-slops');
  vesselLayout.includeSlops = chk ? chk.checked : false;
  updateSlopsInLayout();
  
  renderRowConfigInputs();
  rebuildVesselFromConfigs();
}

function toggleSlopTanks() {
  const chk = document.getElementById('vessel-include-slops');
  vesselLayout.includeSlops = chk ? chk.checked : false;
  
  updateSlopsInLayout();
  
  renderRowConfigInputs();
  rebuildVesselFromConfigs();
}

function updateSlopsInLayout() {
  if (!vesselLayout.rowsData) vesselLayout.rowsData = [];
  vesselLayout.rowsData = vesselLayout.rowsData.filter(r => r.row !== 'Slop');
  
  if (vesselLayout.includeSlops) {
    vesselLayout.rowsData.push({ row: 'Slop', P: true, C: false, S: true, isSlop: true });
  }
}

function onCustomRowsChange() {
  const rowsInput = document.getElementById('custom-rows');
  if (!rowsInput) return;
  let numRows = parseInt(rowsInput.value) || 6;
  if (numRows < 1) numRows = 1;
  if (isDemoUser && numRows > 4) {
    numRows = 4;
    showError(lang === 'tr' ? 'Demo hesapları maksimum 4 hold ile sınırlandırılmıştır.' : 'Demo accounts are capped at a maximum of 4 holds.');
    rowsInput.value = 4;
  } else if (numRows > 20) {
    numRows = 20;
    rowsInput.value = 20;
  } else {
    hideError();
  }
  
  vesselLayout.rows = numRows;
  vesselLayout.preset = 'custom';
  
  // Force update the preset dropdown to custom
  const selectPreset = document.getElementById('vessel-preset');
  if (selectPreset) selectPreset.value = 'custom';

  const currentRowsData = vesselLayout.rowsData || [];
  const newRowsData = [];
  for (let r = 1; r <= numRows; r++) {
    const existing = currentRowsData.find(item => item.row === r);
    if (existing) {
      newRowsData.push(existing);
    } else {
      newRowsData.push({ row: r, P_num: r, C_num: null, S_num: r });
    }
  }
  vesselLayout.rowsData = newRowsData;
  
  // Re-apply slops if checked
  const chk = document.getElementById('vessel-include-slops');
  vesselLayout.includeSlops = chk ? chk.checked : false;
  updateSlopsInLayout();
  
  renderRowConfigInputs();
  rebuildVesselFromConfigs();
}

function changeRowTankNumber(rowNum, type, val) {
  const rowData = vesselLayout.rowsData.find(r => String(r.row) === String(rowNum));
  if (rowData) {
    rowData[type] = val ? parseInt(val) : null;
    rebuildVesselFromConfigs();
  }
}

function toggleSlopRowTank(tankType) {
  const rowData = vesselLayout.rowsData.find(r => r.row === 'Slop');
  if (rowData) {
    const chk = document.getElementById(`chk-rSlop-${tankType}`);
    rowData[tankType] = chk ? chk.checked : false;
    rebuildVesselFromConfigs();
  }
}

function toggleRowEnabled(rowNum) {
  const rowData = vesselLayout.rowsData.find(r => String(r.row) === String(rowNum));
  if (rowData) {
    const chk = document.getElementById(`chk-row-enable-${rowNum}`);
    rowData.enabled = chk ? chk.checked : true;
    
    // Set preset to custom since we altered the configuration
    const selectPreset = document.getElementById('vessel-preset');
    if (selectPreset) selectPreset.value = 'custom';
    vesselLayout.preset = 'custom';
    
    rebuildVesselFromConfigs();
    renderRowConfigInputs();
  }
}

function renderRowConfigInputs() {
  const container = document.getElementById('vessel-row-config-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (!vesselLayout.rowsData) {
    vesselLayout.rowsData = [];
  }
  
  const generateSelectOptions = (currentVal) => {
    let html = `<option value="">-</option>`;
    for (let i = 1; i <= 30; i++) {
      html += `<option value="${i}" ${String(currentVal) === String(i) ? 'selected' : ''}>${i}</option>`;
    }
    return html;
  };
  
  vesselLayout.rowsData.forEach(rowData => {
    const rowEl = document.createElement('div');
    rowEl.className = 'row-config-item';
    
    if (rowData.row === 'Slop') {
      rowEl.innerHTML = `
        <span class="row-config-label" style="font-family: var(--mono); font-size: 0.8rem; font-weight: 700; color: var(--text2);">SLOP TANKS</span>
        <div class="row-config-chks" style="display: flex; gap: 15px;">
          <label style="display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 0.75rem; cursor: pointer; color: var(--text);">
            <input type="checkbox" id="chk-rSlop-P" ${rowData.P ? 'checked' : ''} onchange="toggleSlopRowTank('P')"> P
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 0.75rem; cursor: pointer; color: var(--text);">
            <input type="checkbox" id="chk-rSlop-C" ${rowData.C ? 'checked' : ''} onchange="toggleSlopRowTank('C')"> C
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 0.75rem; cursor: pointer; color: var(--text);">
            <input type="checkbox" id="chk-rSlop-S" ${rowData.S ? 'checked' : ''} onchange="toggleSlopRowTank('S')"> S
          </label>
        </div>
      `;
    } else {
      const isEnabled = rowData.enabled !== false;
      rowEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between; width: 100%;">
          <label style="display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 0.75rem; font-weight: 700; color: ${isEnabled ? 'var(--text2)' : 'var(--text3)'}; cursor: pointer; margin: 0;">
            <input type="checkbox" id="chk-row-enable-${rowData.row}" ${isEnabled ? 'checked' : ''} onchange="toggleRowEnabled('${rowData.row}')" style="margin: 0; cursor: pointer;">
            HOLD ${rowData.row}
          </label>
          <div class="row-config-selects" style="display: flex; gap: 8px; align-items: center; ${isEnabled ? '' : 'opacity: 0.4; pointer-events: none;'}">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-family: var(--mono); font-size: 0.7rem; color: var(--text3);">P:</span>
              <select class="select-input" style="padding: 2px 4px; font-size: 0.75rem; font-family: var(--mono); width: 45px; background: var(--bg2); border: 1px solid var(--border2); color: var(--text); border-radius: 4px;" onchange="changeRowTankNumber('${rowData.row}', 'P_num', this.value)" ${isEnabled ? '' : 'disabled'}>
                ${generateSelectOptions(rowData.P_num)}
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-family: var(--mono); font-size: 0.7rem; color: var(--text3);">C:</span>
              <select class="select-input" style="padding: 2px 4px; font-size: 0.75rem; font-family: var(--mono); width: 45px; background: var(--bg2); border: 1px solid var(--border2); color: var(--text); border-radius: 4px;" onchange="changeRowTankNumber('${rowData.row}', 'C_num', this.value)" ${isEnabled ? '' : 'disabled'}>
                ${generateSelectOptions(rowData.C_num)}
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-family: var(--mono); font-size: 0.7rem; color: var(--text3);">S:</span>
              <select class="select-input" style="padding: 2px 4px; font-size: 0.75rem; font-family: var(--mono); width: 45px; background: var(--bg2); border: 1px solid var(--border2); color: var(--text); border-radius: 4px;" onchange="changeRowTankNumber('${rowData.row}', 'S_num', this.value)" ${isEnabled ? '' : 'disabled'}>
                ${generateSelectOptions(rowData.S_num)}
              </select>
            </div>
          </div>
        </div>
      `;
    }
    container.appendChild(rowEl);
  });
}

function rebuildVesselFromConfigs() {
  const oldTanks = { ...vesselTanks };
  vesselTanks = {};
  
  if (!vesselLayout.rowsData) return;
  
  vesselLayout.rowsData.forEach(rowData => {
    const r = rowData.row;
    const isSlop = (r === 'Slop');
    
    if (isSlop) {
      if (rowData.P) {
        const id = 'SlopP';
        vesselTanks[id] = oldTanks[id] || createDefaultTankState(id, 500);
      }
      if (rowData.C) {
        const id = 'SlopC';
        vesselTanks[id] = oldTanks[id] || createDefaultTankState(id, 600);
      }
      if (rowData.S) {
        const id = 'SlopS';
        vesselTanks[id] = oldTanks[id] || createDefaultTankState(id, 500);
      }
    } else {
      if (rowData.enabled !== false) {
        if (rowData.P_num) {
          const id = rowData.P_num + 'P';
          vesselTanks[id] = oldTanks[id] || createDefaultTankState(id, 1200);
        }
        if (rowData.C_num) {
          const id = rowData.C_num + 'C';
          vesselTanks[id] = oldTanks[id] || createDefaultTankState(id, 1500);
        }
        if (rowData.S_num) {
          const id = rowData.S_num + 'S';
          vesselTanks[id] = oldTanks[id] || createDefaultTankState(id, 1200);
        }
      }
    }
  });
  
  buildAdjacencyGraph();
  renderVesselGrid();
  checkFleetReactivity();
  saveVesselState();
}

function createDefaultTankState(id, capacity) {
  return {
    id: id,
    capacity: capacity,
    coating: id.includes('C') ? 'zinc' : 'epoxy',
    lineCoating: 'stainless',
    lastCargoId: null,
    lastCargoName: '',
    nextCargoId: null,
    nextCargoName: '',
    heated: false,
    wwt: { hydrocarbons: false, chlorides: false, permanganate: false, ph: false }
  };
}

function addAdjacency(t1, t2) {
  if (!vesselTanks[t1] || !vesselTanks[t2]) return;
  if (!adjacencyGraph[t1]) adjacencyGraph[t1] = [];
  if (!adjacencyGraph[t2]) adjacencyGraph[t2] = [];
  if (!adjacencyGraph[t1].includes(t2)) adjacencyGraph[t1].push(t2);
  if (!adjacencyGraph[t2].includes(t1)) adjacencyGraph[t2].push(t1);
}

function buildAdjacencyGraph() {
  adjacencyGraph = {};
  const tankIds = Object.keys(vesselTanks);
  tankIds.forEach(id => {
    adjacencyGraph[id] = [];
  });
  
  const rowsData = vesselLayout.rowsData || [];
  for (let i = 0; i < rowsData.length; i++) {
    const rowData = rowsData[i];
    if (rowData.row !== 'Slop' && rowData.enabled === false) continue;
    const isSlop = (rowData.row === 'Slop');
    
    const tP = isSlop ? (rowData.P ? 'SlopP' : null) : (rowData.P_num ? rowData.P_num + 'P' : null);
    const tC = isSlop ? (rowData.C ? 'SlopC' : null) : (rowData.C_num ? rowData.C_num + 'C' : null);
    const tS = isSlop ? (rowData.S ? 'SlopS' : null) : (rowData.S_num ? rowData.S_num + 'S' : null);
    
    // Intrarow adjacencies
    if (tC) {
      if (tP) addAdjacency(tP, tC);
      if (tS) addAdjacency(tS, tC);
    } else {
      if (tP && tS) addAdjacency(tP, tS);
    }
    
    // Interrow adjacencies to next row in the layout list
    if (i + 1 < rowsData.length) {
      const nextRowData = rowsData[i + 1];
      const nextIsSlop = (nextRowData.row === 'Slop');
      
      const nP = nextIsSlop ? (nextRowData.P ? 'SlopP' : null) : (nextRowData.P_num ? nextRowData.P_num + 'P' : null);
      const nC = nextIsSlop ? (nextRowData.C ? 'SlopC' : null) : (nextRowData.C_num ? nextRowData.C_num + 'C' : null);
      const nS = nextIsSlop ? (nextRowData.S ? 'SlopS' : null) : (nextRowData.S_num ? nextRowData.S_num + 'S' : null);
      
      if (tP && nP) addAdjacency(tP, nP);
      if (tS && nS) addAdjacency(tS, nS);
      if (tC && nC) addAdjacency(tC, nC);
      
      if (tC && !nC) {
        if (nP) addAdjacency(tC, nP);
        if (nS) addAdjacency(tC, nS);
      }
      if (!tC && nC) {
        if (tP) addAdjacency(tP, nC);
        if (tS) addAdjacency(tS, nC);
      }
    }
  }
}

function renderVesselGrid() {
  const gridEl = document.getElementById('vessel-stowage-grid');
  if (!gridEl) return;
  gridEl.innerHTML = '';
  
  if (!vesselLayout.rowsData) return;
  
  vesselLayout.rowsData.forEach(rowData => {
    if (rowData.row !== 'Slop' && rowData.enabled === false) return;
    const rowEl = document.createElement('div');
    const isSlop = (rowData.row === 'Slop');
    
    // Determine if Center tank exists in this row
    const hasC = isSlop ? rowData.C : (rowData.C_num !== null);
    
    if (hasC) {
      rowEl.className = 'vessel-row row-pcs';
      
      // Port
      const pId = isSlop ? 'SlopP' : (rowData.P_num ? rowData.P_num + 'P' : null);
      if (pId && vesselTanks[pId]) {
        appendTankCard(rowEl, pId);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tank-placeholder';
        rowEl.appendChild(placeholder);
      }
      
      // Center
      const cId = isSlop ? 'SlopC' : (rowData.C_num ? rowData.C_num + 'C' : null);
      if (cId && vesselTanks[cId]) {
        appendTankCard(rowEl, cId);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tank-placeholder';
        rowEl.appendChild(placeholder);
      }
      
      // Starboard
      const sId = isSlop ? 'SlopS' : (rowData.S_num ? rowData.S_num + 'S' : null);
      if (sId && vesselTanks[sId]) {
        appendTankCard(rowEl, sId);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tank-placeholder';
        rowEl.appendChild(placeholder);
      }
    } else {
      rowEl.className = 'vessel-row row-ps';
      
      // Port
      const pId = isSlop ? 'SlopP' : (rowData.P_num ? rowData.P_num + 'P' : null);
      if (pId && vesselTanks[pId]) {
        appendTankCard(rowEl, pId);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tank-placeholder';
        rowEl.appendChild(placeholder);
      }
      
      // Starboard
      const sId = isSlop ? 'SlopS' : (rowData.S_num ? rowData.S_num + 'S' : null);
      if (sId && vesselTanks[sId]) {
        appendTankCard(rowEl, sId);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tank-placeholder';
        rowEl.appendChild(placeholder);
      }
    }
    
    gridEl.appendChild(rowEl);
  });
}

function appendTankCard(parentEl, tankId) {
  const tank = vesselTanks[tankId];
  if (!tank) return;
  
  const card = document.createElement('div');
  card.className = `tank-card ${tank.coating}`;
  if (activeEditingTankId === tankId) {
    card.classList.add('active-editing');
  }
  card.id = `card-${tankId}`;
  card.onclick = () => openTankModal(tankId);
  
  let cargoInfo = tank.nextCargoName 
    ? `<div class="tank-cargo-label">#${tank.nextCargoId} ${tank.nextCargoName}</div>`
    : `<div class="tank-cargo-label" style="color: var(--text3); font-style: italic;">— Empty —</div>`;
    
  let indicators = '';
  if (tank.heated) {
    indicators += `<span class="ind-heated" title="Active Heating">🔥</span>`;
  }
  
  const wwtPass = tank.wwt.hydrocarbons && tank.wwt.chlorides && tank.wwt.permanganate && tank.wwt.ph;
  if (wwtPass) {
    indicators += `<span class="ind-wwt-pass" title="WWT Passed" style="color: var(--green);">🧪✓</span>`;
  }
  
  let displayName = tankId;
  if (tankId === 'SlopP') displayName = 'Slop P';
  if (tankId === 'SlopC') displayName = 'Slop C';
  if (tankId === 'SlopS') displayName = 'Slop S';
  
  card.innerHTML = `
    <div class="tank-card-top">
      <span class="tank-name-label">${displayName}</span>
      <span class="tank-cap-label">${tank.capacity} m³</span>
    </div>
    ${cargoInfo}
    <div class="tank-card-indicators" id="ind-wrap-${tankId}">
      ${indicators}
    </div>
  `;
  
  parentEl.appendChild(card);
}

function openTankModal(tankId) {
  // Clear other active highlights
  document.querySelectorAll('.tank-card').forEach(card => {
    card.classList.remove('active-editing');
  });
  
  // Highlight current card
  const activeCard = document.getElementById(`card-${tankId}`);
  if (activeCard) activeCard.classList.add('active-editing');
  
  activeEditingTankId = tankId;
  const tank = vesselTanks[tankId];
  if (!tank) return;
  
  let displayName = tankId;
  if (tankId === 'SlopP') displayName = 'Slop P';
  if (tankId === 'SlopC') displayName = 'Slop C';
  if (tankId === 'SlopS') displayName = 'Slop S';
  
  document.getElementById('editor-tank-name').textContent = displayName;
  document.getElementById('editor-coating').value = tank.coating;
  document.getElementById('editor-line-coating').value = tank.lineCoating || 'stainless';
  document.getElementById('editor-capacity').value = tank.capacity;
  
  const lastInput = document.getElementById('editor-input-last');
  const nextInput = document.getElementById('editor-input-next');
  
  lastInput.value = tank.lastCargoName || '';
  nextInput.value = tank.nextCargoName || '';
  
  lastInput.dataset.cargoId = tank.lastCargoId || '';
  nextInput.dataset.cargoId = tank.nextCargoId || '';
  
  document.getElementById('editor-heated').checked = tank.heated;
  
  document.getElementById('wwt-hydrocarbons').checked = tank.wwt.hydrocarbons;
  document.getElementById('wwt-chlorides').checked = tank.wwt.chlorides;
  document.getElementById('wwt-permanganate').checked = tank.wwt.permanganate;
  document.getElementById('wwt-ph').checked = tank.wwt.ph;
  
  validateEditorInput('last');
  validateEditorInput('next');
  
  // Show active form, hide empty state
  document.getElementById('editor-no-selection').classList.add('hidden');
  document.getElementById('editor-active-form').classList.remove('hidden');
  
  // Switch tab to editor
  switchDashboardTab('tab-editor');
}

function closeTankModal() {
  document.querySelectorAll('.tank-card').forEach(card => {
    card.classList.remove('active-editing');
  });
  
  document.getElementById('editor-no-selection').classList.remove('hidden');
  document.getElementById('editor-active-form').classList.add('hidden');
  activeEditingTankId = null;
}

function saveTankConfig() {
  if (!activeEditingTankId) return;
  const tank = vesselTanks[activeEditingTankId];
  if (!tank) return;
  
  tank.coating = document.getElementById('editor-coating').value;
  tank.lineCoating = document.getElementById('editor-line-coating').value;
  tank.capacity = parseInt(document.getElementById('editor-capacity').value) || 1000;
  
  const lastInput = document.getElementById('editor-input-last');
  const nextInput = document.getElementById('editor-input-next');
  
  const lastCargoObj = findCargoByQuery(lastInput.value.trim());
  const nextCargoObj = findCargoByQuery(nextInput.value.trim());
  
  tank.lastCargoId = lastCargoObj ? String(lastCargoObj.id) : null;
  tank.lastCargoName = lastCargoObj ? lastCargoObj.display : '';
  
  tank.nextCargoId = nextCargoObj ? String(nextCargoObj.id) : null;
  tank.nextCargoName = nextCargoObj ? nextCargoObj.display : '';
  
  tank.heated = document.getElementById('editor-heated').checked;
  
  tank.wwt.hydrocarbons = document.getElementById('wwt-hydrocarbons').checked;
  tank.wwt.chlorides = document.getElementById('wwt-chlorides').checked;
  tank.wwt.permanganate = document.getElementById('wwt-permanganate').checked;
  tank.wwt.ph = document.getElementById('wwt-ph').checked;
  
  checkFleetReactivity();
  renderVesselGrid();
  saveVesselState();
  
  // Highlight active tank card with temporary "just-saved" animation
  const cardEl = document.getElementById(`card-${activeEditingTankId}`);
  if (cardEl) {
    cardEl.classList.add('just-saved');
    setTimeout(() => cardEl.classList.remove('just-saved'), 1500);
  }
}

function clearActiveTankConfig() {
  if (!activeEditingTankId) return;
  const tank = vesselTanks[activeEditingTankId];
  if (!tank) return;
  
  tank.lastCargoId = null;
  tank.lastCargoName = '';
  tank.nextCargoId = null;
  tank.nextCargoName = '';
  tank.heated = false;
  tank.wwt = { hydrocarbons: false, chlorides: false, permanganate: false, ph: false };
  if (tank.timeSheet) {
    tank.timeSheet = {};
  }
  
  // Update inputs in UI
  document.getElementById('editor-input-last').value = '';
  document.getElementById('editor-input-next').value = '';
  document.getElementById('editor-input-last').dataset.cargoId = '';
  document.getElementById('editor-input-next').dataset.cargoId = '';
  document.getElementById('editor-ind-last').textContent = '—';
  document.getElementById('editor-ind-next').textContent = '—';
  document.getElementById('editor-heated').checked = false;
  
  document.getElementById('wwt-hydrocarbons').checked = false;
  document.getElementById('wwt-chlorides').checked = false;
  document.getElementById('wwt-permanganate').checked = false;
  document.getElementById('wwt-ph').checked = false;
  
  validateEditorInput('last');
  validateEditorInput('next');
  
  checkFleetReactivity();
  renderVesselGrid();
  saveVesselState();
  
  const cardEl = document.getElementById(`card-${activeEditingTankId}`);
  if (cardEl) {
    cardEl.classList.add('just-saved');
    setTimeout(() => cardEl.classList.remove('just-saved'), 1500);
  }
}

function clearAllTanksConfig() {
  const confirmMsg = lang === 'tr' 
    ? 'Tüm tankların planlanan yük ve WWT verilerini sıfırlamak istediğinize emin misiniz?' 
    : 'Are you sure you want to clear all planned cargo and WWT configurations for all tanks?';
  
  if (!confirm(confirmMsg)) return;
  
  Object.keys(vesselTanks).forEach(id => {
    const tank = vesselTanks[id];
    tank.lastCargoId = null;
    tank.lastCargoName = '';
    tank.nextCargoId = null;
    tank.nextCargoName = '';
    tank.heated = false;
    tank.wwt = { hydrocarbons: false, chlorides: false, permanganate: false, ph: false };
    if (tank.timeSheet) {
      tank.timeSheet = {};
    }
  });
  
  if (activeEditingTankId) {
    document.getElementById('editor-input-last').value = '';
    document.getElementById('editor-input-next').value = '';
    document.getElementById('editor-input-last').dataset.cargoId = '';
    document.getElementById('editor-input-next').dataset.cargoId = '';
    document.getElementById('editor-ind-last').textContent = '—';
    document.getElementById('editor-ind-next').textContent = '—';
    document.getElementById('editor-heated').checked = false;
    
    document.getElementById('wwt-hydrocarbons').checked = false;
    document.getElementById('wwt-chlorides').checked = false;
    document.getElementById('wwt-permanganate').checked = false;
    document.getElementById('wwt-ph').checked = false;
    
    validateEditorInput('last');
    validateEditorInput('next');
  }
  
  checkFleetReactivity();
  renderVesselGrid();
  saveVesselState();
}

// ---- COF RULE-BASED CHEMICAL CLASSIFIER ----
function classifyCargo(cargoId) {
  const res = { isAcid: false, isAlkaline: false, isPolymer: false, isWaterReactive: false };
  if (!cargoId || !namesData[cargoId]) return res;
  
  const rec = namesData[cargoId];
  const searchStr = [
    rec.name || '',
    rec.display || '',
    rec.alt || '',
    ...(rec.synonyms || [])
  ].join(' ').toUpperCase();
  
  if (/\bACID\b|ACRYLIC|FORMIC|SULPHURIC|DESCALER|PHOSPHORIC/.test(searchStr)) {
    res.isAcid = true;
  }
  if (/AMINE|AMINO|AMMONIA|HYDROXIDE|MORPHOLINE|ALKANOLAMINE|CAUSTIC|POTASSIUM|SODIUM/.test(searchStr)) {
    res.isAlkaline = true;
  }
  if (/ACRYLATE|ACRYLONITRILE|STYRENE|VINYL|PROPENOATE|BUTADIENE|ISOPRENE/.test(searchStr)) {
    res.isPolymer = true;
  }
  if (/WATER-REACT|ANHYDROUS|REACTS DANGEROUSLY WITH WATER/.test(searchStr)) {
    res.isWaterReactive = true;
  }
  
  return res;
}

// ---- BULKHEAD REACTIVITY ENGINE ----
function checkFleetReactivity() {
  const warnings = [];
  const tankIds = Object.keys(vesselTanks);
  
  tankIds.forEach(id => {
    const el = document.getElementById(`card-${id}`);
    if (el) el.classList.remove('alert-active');
  });
  
  const classifications = {};
  tankIds.forEach(id => {
    const tank = vesselTanks[id];
    if (tank.nextCargoId) {
      classifications[id] = classifyCargo(tank.nextCargoId);
    }
  });
  
  const seenPairs = new Set();
  
  tankIds.forEach(id => {
    const tank = vesselTanks[id];
    const classif = classifications[id];
    
    // Check tank specific coating warnings if there's loaded cargo
    if (tank.nextCargoId) {
      const tempKey = `${tank.lastCargoId}_${tank.nextCargoId}`;
      const code = matrixData[tempKey] || '';
      
      const coatingWarns = checkSingleTankCoating(tank.coating, code);
      coatingWarns.forEach(w => {
        warnings.push({
          type: w.type,
          msg: `⚠️ TANK ${id} COATING CONFLICT: ${w.msg}`
        });
        document.getElementById(`card-${id}`)?.classList.add('alert-active');
      });

      const lineWarns = checkSingleLineCoating(tank.lineCoating || 'stainless', code);
      lineWarns.forEach(w => {
        warnings.push({
          type: w.type,
          msg: `⚠️ TANK ${id} LINE CONFLICT: ${w.msg}`
        });
        document.getElementById(`card-${id}`)?.classList.add('alert-active');
      });
    }

    if (!classif) return;
    
    const adjs = adjacencyGraph[id] || [];
    adjs.forEach(adjId => {
      const adjTank = vesselTanks[adjId];
      const adjClassif = classifications[adjId];
      if (!adjClassif) return;
      
      const pairKey = [id, adjId].sort().join('-');
      if (seenPairs.has(pairKey)) return;
      
      // Acid + Alkaline
      if ((classif.isAcid && adjClassif.isAlkaline) || (classif.isAlkaline && adjClassif.isAcid)) {
        seenPairs.add(pairKey);
        warnings.push({
          type: 'danger',
          msg: lang === 'tr'
            ? `🚫 KRİTİK: Komşu tanklar arasında reaksiyon riski! Tank ${id} (${tank.nextCargoName}) ile Tank ${adjId} (${adjTank.nextCargoName}) ortak bulkhead paylaşıyor.`
            : `🚫 CRITICAL: Acid & Alkaline reactivity risk through common bulkhead! Tank ${id} (${tank.nextCargoName}) and Tank ${adjId} (${adjTank.nextCargoName}) are adjacent.`
        });
        document.getElementById(`card-${id}`)?.classList.add('alert-active');
        document.getElementById(`card-${adjId}`)?.classList.add('alert-active');
      }
      
      // Heated + Polymerizing
      const isHeatedConflict = (tank.heated && adjClassif.isPolymer) || (adjTank.heated && classif.isPolymer);
      if (isHeatedConflict) {
        seenPairs.add(pairKey);
        warnings.push({
          type: 'danger',
          msg: lang === 'tr'
            ? `🔥 ISI TEHLİKESİ: Polimerleşen kargo yanında sıcak kargo riski! Tank ${id} (${tank.nextCargoName}) ile Tank ${adjId} (${adjTank.nextCargoName}) komşu.`
            : `🔥 THERMAL HAZARD: Polymerizing cargo adjacent to heated cargo! Tank ${id} (${tank.nextCargoName}) and Tank ${adjId} (${adjTank.nextCargoName}) are adjacent.`
        });
        document.getElementById(`card-${id}`)?.classList.add('alert-active');
        document.getElementById(`card-${adjId}`)?.classList.add('alert-active');
      }
    });
  });
  
  const warnEl = document.getElementById('fleet-compat-warnings');
  if (!warnEl) return;
  if (warnings.length > 0) {
    warnEl.innerHTML = warnings.map(w =>
      `<div class="compat-warn-item ${w.type === 'danger' ? 'danger' : 'caution'}">
        <span class="compat-warn-icon">⚠️</span>
        <span>${w.msg}</span>
      </div>`
    ).join('');
    
    const buffer = generateBufferSuggestion();
    if (buffer) {
      warnEl.innerHTML += `
        <div class="compat-warn-item caution">
          <span class="compat-warn-icon">💡</span>
          <span>${buffer}</span>
        </div>
      `;
    }
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }
}

function checkSingleTankCoating(tankCoating, protocolCode) {
  const warnings = [];
  const tankRules = coatingRules.tank[tankCoating];
  if (tankRules) {
    const isDanger = tankRules.danger && tankRules.danger.includes(protocolCode);
    const isCaution = tankRules.caution && tankRules.caution.includes(protocolCode);
    const isDangerKw = tankRules.danger_keywords && tankRules.danger_keywords.some(kw => protocolCode.includes(kw));
    const isCautionKw = tankRules.caution_keywords && tankRules.caution_keywords.some(kw => protocolCode.includes(kw));

    if (isDanger || isDangerKw) {
      warnings.push({ type: 'danger', msg: lang === 'tr' ? tankRules.danger_msg_tr : tankRules.danger_msg_en });
    } else if (isCaution || isCautionKw) {
      warnings.push({ type: 'caution', msg: lang === 'tr' ? tankRules.caution_msg_tr : tankRules.caution_msg_en });
    }
  }
  return warnings;
}

function checkSingleLineCoating(lineCoating, protocolCode) {
  const warnings = [];
  const lineRules = coatingRules.line[lineCoating];
  if (lineRules) {
    const isDanger = lineRules.danger && lineRules.danger.includes(protocolCode);
    const isCaution = lineRules.caution && lineRules.caution.includes(protocolCode);
    const isDangerKw = lineRules.danger_keywords && lineRules.danger_keywords.some(kw => protocolCode.includes(kw));
    const isCautionKw = lineRules.caution_keywords && lineRules.caution_keywords.some(kw => protocolCode.includes(kw));

    if (isDanger || isDangerKw) {
      warnings.push({ type: 'danger', msg: lang === 'tr' ? lineRules.danger_msg_tr : lineRules.danger_msg_en });
    } else if (isCaution || isCautionKw) {
      warnings.push({ type: 'caution', msg: lang === 'tr' ? lineRules.caution_msg_tr : lineRules.caution_msg_en });
    }
  }
  return warnings;
}

function generateBufferSuggestion() {
  const emptyTanks = Object.keys(vesselTanks).filter(id => !vesselTanks[id].nextCargoId);
  if (emptyTanks.length === 0) return null;
  
  if (lang === 'tr') {
    return `Kargo yerleşim çakışmasını önlemek için kargolardan birini boş olan <strong>${emptyTanks.join(', ')}</strong> tanklarından birine taşıyarak arada boş bir hold (buffer) bırakmayı deneyin.`;
  } else {
    return `To prevent stowage conflict, try moving one of the cargos to an empty buffer tank: <strong>${emptyTanks.join(', ')}</strong>.`;
  }
}

// ---- ECO-WASH PARSER & CALCULATION MOTOR ----
function parseWashSteps(instructions) {
  const result = {
    fwVolume: 0,
    swVolume: 0,
    ambientVolume: 0,
    warmVolume: 0,
    hotVolume: 0,
    warmAvgTemp: 0,
    hotAvgTemp: 0,
    warmStepsCount: 0,
    hotStepsCount: 0,
    detergentVolume: 0,
    totalHours: 0
  };
  
  if (!instructions) return result;
  
  const lines = instructions.split(/\n/);
  lines.forEach(line => {
    const isFW = /FW|fresh\s+water|tatlı\s+su/i.test(line);
    const isSW = /SW|seawater|deniz\s+suyu/i.test(line);
    const isWaterWash = /wash|rinse|butterworth|butterworthing|duralama|yıkama/i.test(line);
    
    if (!isWaterWash && !isFW && !isSW) return;
    
    let durationHours = 0.5;
    const minMatch = line.match(/(\d+)\s*-\s*(\d+)\s*(min|minute|dk|dakika)/i);
    const minSingleMatch = line.match(/(\d+)\s*(min|minute|dk|dakika)/i);
    const hrMatch = line.match(/(\d+\.\d+|\d+)\s*(hr|hour|saat)/i);
    
    if (minMatch) {
      const avgMins = (parseInt(minMatch[1]) + parseInt(minMatch[2])) / 2;
      durationHours = avgMins / 60;
    } else if (minSingleMatch) {
      durationHours = parseInt(minSingleMatch[1]) / 60;
    } else if (hrMatch) {
      durationHours = parseFloat(hrMatch[1]);
    }
    
    result.totalHours += durationHours;
    
    let isAmbient = true;
    let isWarm = false;
    let isHot = false;
    let temp = 15;
    
    const tempMatch = line.match(/(\d+)\s*-\s*(\d+)\s*°/);
    const tempSingleMatch = line.match(/(\d+)\s*°/);
    
    if (tempMatch) {
      temp = (parseInt(tempMatch[1]) + parseInt(tempMatch[2])) / 2;
    } else if (tempSingleMatch) {
      temp = parseInt(tempSingleMatch[1]);
    }
    
    if (temp >= 40 && temp < 65) {
      isAmbient = false;
      isWarm = true;
    } else if (temp >= 65) {
      isAmbient = false;
      isHot = true;
    }
    
    const isChem = /detergent|chemical|alkaline|acid|solvent|deterjan|kimyasal|alkali|asit/i.test(line);
    
    if (isFW) {
      result.fwVolume += durationHours;
    } else {
      result.swVolume += durationHours;
    }
    
    if (isAmbient) result.ambientVolume += durationHours;
    if (isWarm) {
      result.warmVolume += durationHours;
      result.warmAvgTemp += temp;
      result.warmStepsCount++;
    }
    if (isHot) {
      result.hotVolume += durationHours;
      result.hotAvgTemp += temp;
      result.hotStepsCount++;
    }
    
    if (isChem) {
      result.detergentVolume += durationHours;
    }
  });
  
  if (result.warmStepsCount > 0) result.warmAvgTemp /= result.warmStepsCount;
  if (result.hotStepsCount > 0) result.hotAvgTemp /= result.hotStepsCount;
  
  return result;
}

function resolveMatrixProtocol(lastId, nextId) {
  const directKey = `${lastId}_${nextId}`;
  let code = matrixData[directKey];
  if (code && code !== 'nan' && code !== 'ATS-PROT-nan') {
    return { code, isFallback: false, fallbackSourceId: null };
  }
  
  const lastCargo = namesData[lastId];
  if (!lastCargo) return null;
  
  const lastText = [
    lastCargo.name || '',
    lastCargo.display || '',
    lastCargo.alt || '',
    ...(lastCargo.synonyms || [])
  ].join(' ').toUpperCase();
  
  let siblings = [];
  
  if (/FUELOIL|FUEL OIL|DIESEL|AVTUR|JET|GASOIL|ULS|IFO|MFO|CRUDE/.test(lastText)) {
    siblings = ['165', '359', '22', '83', '414', '170']; 
  } else if (/ACID|ACETIC|FORMIC|SULPHURIC|PHOSPHORIC|ACRYLIC/.test(lastText)) {
    siblings = ['1', '7', '40', '160']; 
  } else if (/AMINE|AMINO|EDA|DETA|AEEA|AMMONIA|MORPHOLINE/.test(lastText)) {
    siblings = ['15', '138', '96', '180'];
  } else if (/ALCOHOL|METHANOL|ETHANOL|GLYCOL|PROPANOL|BUTANOL|DECANOL/.test(lastText)) {
    siblings = ['122', '141', '73', '18'];
  } else if (/ACETONE|KETONE|MEK|DAA/.test(lastText)) {
    siblings = ['3', '76', '100'];
  }
  
  for (let sibId of siblings) {
    if (sibId === lastId) continue;
    const sibKey = `${sibId}_${nextId}`;
    const sibCode = matrixData[sibKey];
    if (sibCode && sibCode !== 'nan' && sibCode !== 'ATS-PROT-nan') {
      return { code: sibCode, isFallback: true, fallbackSourceId: sibId };
    }
  }
  
  return null;
}

function getCargoMarpolCategory(cargoId) {
  if (!cargoId || !namesData[cargoId]) return null;
  const rec = namesData[cargoId];
  
  const searchStr = [
    rec.name || '',
    rec.display || '',
    rec.alt || '',
    ...(rec.synonyms || [])
  ].join(' ').toUpperCase();
  
  if (/\bANNEX\s*I\b|MARPOL\s*:\s*A1|\bFUELOIL\b|\bDIESEL\b|\bGASOIL\b|\bCRUDE\b|\bAVTUR\b|\bJET\b|\bIFO\b|\bMFO\b/.test(searchStr)) {
    return 'Annex I';
  }
  
  const catX = searchStr.includes('MARPOL: X') || /\bCAT\s*X\b|\bCATEGORY\s*X\b/.test(searchStr);
  if (catX) return 'Annex II Cat X';
  
  const catY = searchStr.includes('MARPOL: Y') || /\bCAT\s*Y\b|\bCATEGORY\s*Y\b/.test(searchStr);
  if (catY) return 'Annex II Cat Y';
  
  const catZ = searchStr.includes('MARPOL: Z') || /\bCAT\s*Z\b|\bCATEGORY\s*Z\b/.test(searchStr);
  if (catZ) return 'Annex II Cat Z';

  const catOS = searchStr.includes('MARPOL: OS') || /\bCAT\s*OS\b|\bCATEGORY\s*OS\b|\bOTHER\s*SUBSTANCES\b/.test(searchStr);
  if (catOS) return 'Annex II Cat OS';
  
  if (/ACID|AMINE|ALCOHOL|KETONE|CHEMICAL/.test(searchStr)) {
    return 'Annex II Cat Y';
  }
  
  return 'Annex II Cat Z';
}

function generateSafetyHeroDetails(category, safetyNote, lastCargoId) {
  const noteUpper = (safetyNote || '').toUpperCase();
  let ppeText = '';
  let isgottText = '';
  let marpolText = '';
  
  let ppeStandards = [];
  let isgottStandards = [];
  let marpolStandards = [];

  const isHighPpe = category === 'SLV' || category === 'CHM' || noteUpper.includes('PPE') || noteUpper.includes('KKD') || noteUpper.includes('SUIT') || noteUpper.includes('ELBİSE') || noteUpper.includes('INTENSIVE') || noteUpper.includes('YOĞUN');
  const isHighIsgott = category === 'SLV' || noteUpper.includes('LEL') || noteUpper.includes('FLAMMABLE') || noteUpper.includes('FIRE') || noteUpper.includes('YANGIN') || noteUpper.includes('GAS-FREE') || noteUpper.includes('GAZ-SERBEST');
  
  const marpolCat = getCargoMarpolCategory(lastCargoId);

  if (lang === 'tr') {
    // PPE
    if (isHighPpe) {
      ppeText = '🛡️ <strong>Tam Kimyasal Koruma:</strong> Solunum maskesi, kimyasal dayanıklı tulum/elbise, gözlük, koruyucu eldiven ve antistatik çizme zorunludur.';
      ppeStandards = ['EN 14605 (Tip 3)', 'EN ISO 374-1', 'EN 1149-5', 'EN 136 (Tip 3)'];
    } else {
      ppeText = '🛡️ <strong>Standart Koruma:</strong> Baret, koruyucu gözlük, iş eldiveni ve çelik burunlu emniyet ayakkabısı yeterlidir.';
      ppeStandards = ['EN ISO 13688', 'EN 388', 'EN ISO 20345'];
    }
    
    // ISGOTT
    if (isHighIsgott) {
      isgottText = '⚓ <strong>Yangın ve Gaz Alarmı:</strong> Parlama tehlikesi! Kapalı mahale girmeden önce LEL &lt;%1 ve O2 &gt;%20 olmalı, tüm ekipmanlar topraklanmalı ve ex-proof kullanılmalıdır.';
      isgottStandards = ['ISGOTT Bölüm 10.4', 'ISGOTT Bölüm 3', 'LEL <%1', 'O2 >%20'];
    } else {
      isgottText = '⚓ <strong>Mahal Giriş Kontrolü:</strong> Standart kapalı mahal giriş kontrol listesi, mahal havalandırması ve atmosfer ölçümü yapılmalıdır.';
      isgottStandards = ['ISGOTT Bölüm 10.1', 'ISGOTT Bölüm 10.3'];
    }
    
    // MARPOL
    if (marpolCat === 'Annex I') {
      marpolText = '🌊 <strong>MARPOL Ek-1 Uyum (Petrol/Oils):</strong> Petrol sınıfı yük yıkama suları deşarjı Ek-1 kurallarına tabidir. Yıkama suları slop tankında toplanmalı, sadece onaylı ODME (Yağ Deşarj İzleme) sistemi kontrolünde, 15 ppm sınırına uyularak ve en yakın karadan 50 mil açıkta tahliye edilebilir.';
      marpolStandards = ['MARPOL Ek-1', 'ODME İzleme', '15 ppm Sınırı'];
    } else if (marpolCat === 'Annex II Cat X') {
      marpolText = '🌊 <strong>MARPOL Ek-2 Kategori X (Yüksek Tehlike):</strong> Yüksek derecede zehirli madde. Tahliye limanında zorunlu prewash (ön yıkama) yapılmalı ve tüm yıkama suları karadaki atık alım tesisine (reception facility) basılmalıdır. Denize deşarj kesinlikle yasaktır.';
      marpolStandards = ['MARPOL Ek-2 Kural 13.6', 'Kategori X', 'Atık Kabul Tesisi'];
    } else if (marpolCat === 'Annex II Cat Y') {
      marpolText = '🌊 <strong>MARPOL Ek-2 Kategori Y (Orta Tehlike):</strong> Orta derecede zararlı madde. Tahliye limanında ön yıkama gerekebilir. Slop tankına stripping yapılmalıdır. Deniz deşarjı sadece karadan 12 mil açıkta, en az 25m derinlikte ve minimum 7 knot hızla giderken onaylı su altı deşarj nozulu ile yapılabilir.';
      marpolStandards = ['MARPOL Ek-2 Kural 13.2', 'Kategori Y', '12 Mil / 7 Knot'];
    } else if (marpolCat === 'Annex II Cat OS') {
      marpolText = '🌊 <strong>MARPOL Ek-2 Kategori OS (Zararsız):</strong> Çevreye zararsız sınıf yük. Özel bir deşarj kısıtlaması yoktur, standart marpol kurallarına göre açık denizde denize tahliyesi yapılabilir.';
      marpolStandards = ['MARPOL Ek-2', 'Kategori OS', 'Genel Deşarj'];
    } else { // Annex II Cat Z or default
      marpolText = '🌊 <strong>MARPOL Ek-2 Kategori Z (Düşük Tehlike):</strong> Düşük derecede zararlı madde. Kalıntılar slop tankına alınmalıdır. Karadan 12 mil açıkta, en az 25m su derinliğinde ve en az 7 knot gemi hızında denize deşarjına izin verilir.';
      marpolStandards = ['MARPOL Ek-2 Kural 13.2', 'Kategori Z', '12 Mil / 7 Knot'];
    }
  } else {
    // PPE
    if (isHighPpe) {
      ppeText = '🛡️ <strong>Heavy Chem Protection:</strong> Full chemical suit, breathing apparatus, chemical-resistant gloves, goggles, and anti-static boots mandatory.';
      ppeStandards = ['EN 14605 (Type 3)', 'EN ISO 374-1', 'EN 1149-5', 'EN 136 (Type 3)'];
    } else {
      ppeText = '🛡️ <strong>Standard Deck PPE:</strong> Hard hat, protective safety glasses, work gloves, and steel-toe safety shoes.';
      ppeStandards = ['EN ISO 13688', 'EN 388', 'EN ISO 20345'];
    }
    
    // ISGOTT
    if (isHighIsgott) {
      isgottText = '⚓ <strong>Critical Gas/Fire Hazard:</strong> Flammable vapors! Confirm LEL &lt;1% and O2 &gt;20.8% before entry. Ensure tank grounding and ex-proof equipment only.';
      isgottStandards = ['ISGOTT Ch 10.4', 'ISGOTT Chapter 3', 'LEL <1%', 'O2 >20.8%'];
    } else {
      isgottText = '⚓ <strong>Enclosed Space Entry:</strong> Standard hot work/entry permit checklist and continuous mechanical ventilation mandatory.';
      isgottStandards = ['ISGOTT Ch 10.1', 'ISGOTT Ch 10.3'];
    }
    
    // MARPOL
    if (marpolCat === 'Annex I') {
      marpolText = '🌊 <strong>MARPOL Annex I (Petroleum/Oils):</strong> Petroleum-class cargo wash water is subject to Annex I rules. Residues must be routed to slop tank; discharge permitted only via approved ODME control, below 15 ppm limits, and >50 NM from nearest land.';
      marpolStandards = ['MARPOL Annex I', 'ODME Monitoring', '15 ppm Limit'];
    } else if (marpolCat === 'Annex II Cat X') {
      marpolText = '🌊 <strong>MARPOL Annex II Cat X (High Hazard):</strong> Highly noxious substance. Mandatory prewash must be performed at discharge port, and all residues transferred to shore reception facility. Sea discharge strictly prohibited.';
      marpolStandards = ['MARPOL Annex II Reg 13.6', 'Category X', 'Reception Facility'];
    } else if (marpolCat === 'Annex II Cat Y') {
      marpolText = '🌊 <strong>MARPOL Annex II Cat Y (Moderate Hazard):</strong> Moderate pollution hazard. Discharge port prewash may be required. Strip residues to slop. Sea discharge allowed only >12 NM from land, depth >25m, minimum speed 7 knots, via underwater outlet.';
      marpolStandards = ['MARPOL Annex II Reg 13.2', 'Category Y', '12 NM / 7 Knots'];
    } else if (marpolCat === 'Annex II Cat OS') {
      marpolText = '🌊 <strong>MARPOL Annex II Cat OS (Non-Noxious):</strong> Cargo belongs to other substances. No specific chemical discharge restriction; standard open sea discharge rules apply.';
      marpolStandards = ['MARPOL Annex II', 'Category OS', 'General Discharge'];
    } else { // Annex II Cat Z or default
      marpolText = '🌊 <strong>MARPOL Annex II Cat Z (Minor Hazard):</strong> Minor pollution hazard. Residues must be stripped to slop tank. Discharge to sea allowed outside 12 NM, minimum speed 7 knots, water depth >25m.';
      marpolStandards = ['MARPOL Annex II Reg 13.2', 'Category Z', '12 NM / 7 Knots'];
    }
  }
  
  return { ppeText, isgottText, marpolText, ppeStandards, isgottStandards, marpolStandards };
}


function appendTankErrorCard(id, tank, errorMsg) {
  const container = document.getElementById('tank-protocols-container');
  if (!container) return;
  const card = document.createElement('div');
  card.className = 'tank-protocol-card error-card';
  card.setAttribute('data-tank-id', id);
  card.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  card.style.background = 'rgba(239, 68, 68, 0.03)';
  
  if (id === activeEditingTankId) {
    card.style.borderColor = 'var(--accent)';
    card.style.boxShadow = '0 0 12px var(--accent-glow)';
  }
  
  const lastCargo = tank.lastCargoName || '—';
  const nextCargo = tank.nextCargoName || '—';
  
  card.innerHTML = `
    <div class="tank-prot-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div class="tank-prot-meta">
        <span class="tank-prot-tag" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">TANK ${id}</span>
        <span class="tank-prot-cargo-seq" style="color: var(--text2); font-weight: 700;">${lastCargo} ➡️ ${nextCargo}</span>
      </div>
    </div>
    <div class="safety-panel" style="padding: 16px; border: 1px solid rgba(239, 68, 68, 0.25); background: rgba(239, 68, 68, 0.05); display: flex; align-items: center; gap: 12px; margin-top: 10px;">
      <div class="safety-icon" style="font-size: 1.4rem; color: #ef4444;">⚠️</div>
      <div class="safety-content">
        <div class="safety-title" style="font-size: 0.65rem; color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">WARNING / UYARI</div>
        <p class="safety-text" style="font-size: 0.8rem; color: #f87171; margin: 4px 0 0 0; line-height: 1.4;">${errorMsg}</p>
      </div>
    </div>
  `;
  container.appendChild(card);
}

function setFilterMode(mode) {
  filterMode = mode;
  document.querySelectorAll('.filter-mode-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('btn-filter-' + mode);
  if (activeBtn) activeBtn.classList.add('active');
  
  if (mode === 'selected') {
    if (activeEditingTankId) {
      filterCustomTanks.clear();
      filterCustomTanks.add(activeEditingTankId);
    }
  } else if (mode === 'all') {
    filterCustomTanks.clear();
  }
  
  applyProtocolFilters();
}

function toggleCustomFilterTank(id) {
  if (filterMode !== 'custom') {
    filterMode = 'custom';
    document.querySelectorAll('.filter-mode-btn').forEach(btn => btn.classList.remove('active'));
    const customBtn = document.getElementById('btn-filter-custom');
    if (customBtn) customBtn.classList.add('active');
    filterCustomTanks.clear();
  }
  
  if (filterCustomTanks.has(id)) {
    filterCustomTanks.delete(id);
  } else {
    filterCustomTanks.add(id);
  }
  
  applyProtocolFilters();
}

function applyProtocolFilters() {
  const cards = document.querySelectorAll('.tank-protocol-card');
  cards.forEach(card => {
    const tankId = card.getAttribute('data-tank-id');
    let show = false;
    
    if (filterMode === 'all') {
      show = true;
    } else if (filterMode === 'selected') {
      show = (tankId === activeEditingTankId);
    } else if (filterMode === 'custom') {
      show = filterCustomTanks.has(tankId);
    }
    
    if (show) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
  
  updateFilterBadgesUI();
}

function updateFilterBadgesUI() {
  document.querySelectorAll('.filter-badge').forEach(badge => {
    const id = badge.textContent.trim();
    let isActive = false;
    
    if (filterMode === 'all') {
      isActive = true;
    } else if (filterMode === 'selected') {
      isActive = (id === activeEditingTankId);
    } else if (filterMode === 'custom') {
      isActive = filterCustomTanks.has(id);
    }
    
    if (isActive) {
      badge.classList.add('active');
    } else {
      badge.classList.remove('active');
    }
  });
}

function renderFilterBadges() {
  const wrap = document.getElementById('filter-badges-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  
  const activeTankIds = Object.keys(vesselTanks).filter(id => {
    const t = vesselTanks[id];
    return t.lastCargoId || t.lastCargoName || t.nextCargoId || t.nextCargoName;
  });
  
  activeTankIds.forEach(id => {
    const badge = document.createElement('div');
    badge.className = 'filter-badge';
    badge.textContent = id;
    badge.onclick = () => toggleCustomFilterTank(id);
    wrap.appendChild(badge);
  });
}

function calculateFleetProtocols() {
  if (!disclaimerAccepted) {
    showDisclaimerModal();
    return;
  }
  const tankIds = Object.keys(vesselTanks);
  
  const priceFuel = parseFloat(document.getElementById('coeff-fuel').value) || 650;
  const priceSlop = parseFloat(document.getElementById('coeff-slop').value) || 45;
  const priceFW = parseFloat(document.getElementById('coeff-fw').value) || 5;
  const priceDetergent = parseFloat(document.getElementById('coeff-detergent').value) || 12;
  const flowRate = parseFloat(document.getElementById('coeff-flow').value) || 15;
  const tempAmbient = parseFloat(document.getElementById('coeff-temp').value) || 15;
  const tempSea = parseFloat(document.getElementById('coeff-sea-temp').value) || 12;
  const efficiency = parseFloat(document.getElementById('coeff-eff').value) || 82;
  
  const initialWaterTemp = 0.8 * tempSea + 0.2 * tempAmbient;
  
  let totalFWVol = 0;
  let totalSWVol = 0;
  let totalFuelMT = 0;
  let totalSlopVol = 0;
  let totalDetergentL = 0;
  let totalHours = 0;
  let totalTanksPlanned = 0;
  
  const protocolsContainer = document.getElementById('tank-protocols-container');
  if (protocolsContainer) protocolsContainer.innerHTML = '';
  
  const certContainer = document.getElementById('wwt-certificates-container');
  if (certContainer) certContainer.innerHTML = '';
  
  function isAllowedDemoCargo(cargoId) {
    return ['1', '3', '8', '15', '24'].includes(String(cargoId));
  }

  tankIds.forEach(id => {
    const tank = vesselTanks[id];
    const hasLast = !!(tank.lastCargoId && tank.lastCargoName);
    const hasNext = !!(tank.nextCargoId && tank.nextCargoName);
    const isActive = hasLast || hasNext;
    
    if (!isActive) return;
    
    const tDict = T[lang] || T['en'];
    
    if (!hasLast) {
      appendTankErrorCard(id, tank, tDict.err_incomplete_last || 'Last Cargo is not specified.');
      totalTanksPlanned++;
      return;
    }
    if (!hasNext) {
      appendTankErrorCard(id, tank, tDict.err_incomplete_next || 'Next Cargo is not specified.');
      totalTanksPlanned++;
      return;
    }
    
    const resolved = resolveMatrixProtocol(tank.lastCargoId, tank.nextCargoId);
    if (!resolved) {
      appendTankErrorCard(id, tank, tDict.err_no_protocol || 'No cleaning protocol found in the database.');
      totalTanksPlanned++;
      return;
    }
    const protocolCode = resolved.code;
    const isFallback = resolved.isFallback;
    const fallbackSourceId = resolved.fallbackSourceId;
    
    let proc = proceduresData[protocolCode];
    if (!proc) {
      appendTankErrorCard(id, tank, (tDict.err_db_procedure_missing || 'Procedure detail is missing.') + ` (${protocolCode})`);
      totalTanksPlanned++;
      return;
    }
    
    let isMasked = false;
    if (isDemoUser) {
      if (!isAllowedDemoCargo(tank.lastCargoId) || !isAllowedDemoCargo(tank.nextCargoId)) {
        isMasked = true;
      }
    }
    
    if (isMasked) {
      proc = {
        ...proc,
        instructions: lang === 'tr'
          ? "ADIM 1: [🔒 DEMO SÜRÜMÜ — LİSANS AKTİVASYONU GEREKLİ]\nBu yıkama prosedürü gizlenmiştir. Demo sürümünde, yalnızca seçili demo yükleri için tam prosedürleri görüntüleyebilirsiniz: Aseton, Asetik Asit, Akrilonitril, Aminoetiletanolamin, Benzen.\nTüm veritabanına ve 168.000+ kombinasyona erişmek için lütfen sales@astridats.com üzerinden lisansınızı aktif edin."
          : "STEP 1: [🔒 DEMO VERSION — LICENSE ACTIVATION REQUIRED]\nThis wash procedure is masked. In the demo version, you can only view complete wash procedures for a select subset of demo cargoes: Acetone, Acetic Acid, Acrylonitrile, Aminoethylethanolamine, Benzene.\nTo access the full database and 168,000+ combinations, please activate your license via sales@astridats.com.",
        safety_note: lang === 'tr'
          ? "[🔒 DEMO SÜRÜMÜ — LİSANS AKTİVASYONU GEREKLİ] Tüm güvenlik yönergelerini, uyumluluk uyarılarını ve kimyasal özellikleri açmak için lütfen V2.0 PRO tam sürümüne yükseltin."
          : "[🔒 DEMO VERSION — LICENSE ACTIVATION REQUIRED] Please upgrade to the full V2.0 PRO version to unlock all safety guidelines, compatibility alerts, and chemical specifications."
      };
    }
    
    totalTanksPlanned++;
    let parsed = parseWashSteps(proc.instructions);
    if (isMasked) {
      parsed = {
        fwVolume: 0,
        swVolume: 0,
        ambientVolume: 0,
        warmVolume: 0,
        hotVolume: 0,
        warmAvgTemp: 0,
        hotAvgTemp: 0,
        warmStepsCount: 0,
        hotStepsCount: 0,
        detergentVolume: 0,
        totalHours: 0
      };
    }
    
    const nozzleCount = 2;
    const fwVol = parsed.fwVolume * flowRate * nozzleCount;
    const swVol = parsed.swVolume * flowRate * nozzleCount;
    const totalWaterVol = fwVol + swVol;
    
    totalFWVol += fwVol;
    totalSWVol += swVol;
    totalSlopVol += totalWaterVol;
    
    let heatEnergyKJ = 0;
    if (parsed.warmVolume > 0) {
      const warmVol = parsed.warmVolume * flowRate * nozzleCount;
      const dT = Math.max(0, parsed.warmAvgTemp - initialWaterTemp);
      heatEnergyKJ += warmVol * 1025 * 4.184 * dT;
    }
    if (parsed.hotVolume > 0) {
      const hotVol = parsed.hotVolume * flowRate * nozzleCount;
      const dT = Math.max(0, parsed.hotAvgTemp - initialWaterTemp);
      heatEnergyKJ += hotVol * 1025 * 4.184 * dT;
    }
    
    const fuelKG = heatEnergyKJ / (42700 * (efficiency / 100));
    const fuelMT = fuelKG / 1000;
    totalFuelMT += fuelMT;
    
    let detL = 0;
    if (parsed.detergentVolume > 0) {
      const chemWaterVol = parsed.detergentVolume * flowRate * nozzleCount;
      detL = chemWaterVol * 1000 * 0.01; // 1% concentration
      totalDetergentL += detL;
    }
    
    totalHours = Math.max(totalHours, parsed.totalHours);
    
    appendTankProtocolCard(id, tank, proc, protocolCode, parsed, totalWaterVol, fuelMT, detL, isFallback, fallbackSourceId);
    
    const wwtPass = tank.wwt.hydrocarbons && tank.wwt.chlorides && tank.wwt.permanganate && tank.wwt.ph;
    if (wwtPass) {
      if (isDemoUser && isMasked) {
        // Do not generate clean certificate for unauthorized cargoes in demo mode
      } else {
        appendWWTCard(id, tank);
      }
    }
  });
  
  if (totalTanksPlanned === 0) {
    const errorMsg = lang === 'tr' 
      ? 'Simülasyon başlatılamadı!\n\nLütfen sol taraftaki gemi şemasından bir tanka tıklayın ve Tank Editöründen en az bir tank için "Last Cargo" (Önceki Yük) ve "Next Cargo" (Sonraki Yük) seçimi yapın.'
      : 'Simulation could not be started!\n\nPlease click on a tank from the ship schematic on the left and select "Last Cargo" and "Next Cargo" for at least one tank in the Tank Editor.';
    alert(errorMsg);
    showError(lang === 'tr' ? 'Lütfen en az bir tank için Last/Next Cargo planlayın.' : 'Please configure Last/Next Cargo for at least one tank.');
    return;
  }
  
  hideError();

  const costFW = totalFWVol * priceFW;
  const costFuel = totalFuelMT * priceFuel;
  const costSlop = totalSlopVol * priceSlop;
  const costDetergent = totalDetergentL * priceDetergent;
  const totalCost = costFW + costFuel + costSlop + costDetergent;
  
  document.getElementById('res-fw-qty').textContent = `${totalFWVol.toFixed(1)} m³`;
  document.getElementById('res-fw-cost').textContent = `$${costFW.toFixed(2)}`;
  
  document.getElementById('res-fuel-qty').textContent = `${totalFuelMT.toFixed(2)} MT`;
  document.getElementById('res-fuel-cost').textContent = `$${costFuel.toFixed(2)}`;
  
  document.getElementById('res-slop-qty').textContent = `${totalSlopVol.toFixed(1)} m³`;
  document.getElementById('res-slop-cost').textContent = `$${costSlop.toFixed(2)}`;
  
  document.getElementById('res-chem-qty').textContent = `${totalDetergentL.toFixed(1)} L`;
  document.getElementById('res-chem-cost').textContent = `$${costDetergent.toFixed(2)}`;
  
  document.getElementById('res-total-duration').textContent = `${totalHours.toFixed(1)} Hours`;
  document.getElementById('res-total-cost').textContent = `$${totalCost.toFixed(2)}`;
  
  document.getElementById('order-qty-liters').textContent = `${totalDetergentL.toFixed(0)} Liters`;
  const drumsCount = Math.ceil(totalDetergentL / 200);
  document.getElementById('order-qty-drums').textContent = `(${drumsCount} Drums - 200L each)`;
  
  let specText = 'Neutral emulsifier / Caustic soda additive';
  const hasAlkalineWash = tankIds.some(id => {
    const t = vesselTanks[id];
    if (t.lastCargoId && t.nextCargoId) {
      const code = matrixData[`${t.lastCargoId}_${t.nextCargoId}`];
      return code && (code.includes('CHM-20') || code.includes('CHM-21'));
    }
    return false;
  });
  if (hasAlkalineWash) {
    specText = 'Heavy Duty Caustic Emulsifier (KOH/NaOH Based)';
  } else {
    const hasSolventWash = tankIds.some(id => {
      const t = vesselTanks[id];
      if (t.lastCargoId && t.nextCargoId) {
        const code = matrixData[`${t.lastCargoId}_${t.nextCargoId}`];
        return code && code.includes('SLV-');
      }
      return false;
    });
    if (hasSolventWash) {
      specText = 'Hydrocarbon Solvent Cleaner (Mineral Spirit/Naphtha)';
    }
  }
  document.getElementById('order-type-spec').textContent = specText;
  
  const vName = document.getElementById('vessel-name').value || 'ASTRID SPIRIT';
  const vImo = document.getElementById('vessel-imo').value || '9876543';
  const vOff = document.getElementById('officer-name').value || 'C/O Ahmet Yilmaz';
  
  const elPrintVesselName = document.getElementById('print-vessel-name');
  if (elPrintVesselName) elPrintVesselName.textContent = vName.toUpperCase();
  const elPrintVesselMeta = document.getElementById('print-vessel-meta');
  if (elPrintVesselMeta) elPrintVesselMeta.textContent = `IMO ${vImo} | Chief Officer: ${vOff}`;
  
  renderFilterBadges();
  applyProtocolFilters();
  
  switchDashboardTab('tab-eco');
}

// ---- PROCEDURES TRANSLATOR HELPER ----
function translateProcedureTitle(proc, targetLang) {
  if (targetLang === 'tr' && proc.title_tr) return proc.title_tr;
  if (targetLang === 'en') return proc.title;
  
  const title = proc.title;
  const titleGlossary = {
    "Self-Clean Standard": { es: "Limpieza estándar por el buque", el: "Τυπικός αυτοκαθαρισμός", ru: "Стандартная самоочистка", zh: "标准自清洁" },
    "Self-Clean Max Standard": { es: "Limpieza máxima por el buque", el: "Μέγιστος αυτοκαθαρισμός", ru: "Максимальная самоочистка", zh: "最大标准自清洁" },
    "Cold Seawater Butterworthing": { es: "Lavado butterworth con agua de mar fría", el: "Πλύση butterworth με κρύο θαλασσινό νερό", ru: "Мойка буттервортом холодной морской водой", zh: "冷海水洗舱机洗舱" },
    "Cold Seawater Butterworth - Intensive": { es: "Lavado butterworth intensivo con agua de mar fría", el: "Εντατική πλύση butterworth με κρύο θαλασσινό νερό", ru: "Интенсивная мойка холодной морской водой", zh: "冷海水洗舱机洗舱 - 强化" },
    "Cold Seawater Butterworth - Light": { es: "Lavado butterworth ligero con agua de mar fría", el: "Ελαφριά πλύση butterworth με κρύο θαλασσινό νερό", ru: "Легкая мойка холодной морской водой", zh: "冷海水洗舱机洗舱 - 轻度" },
    "Warm Seawater Butterworth": { es: "Lavado butterworth con agua de mar templada", el: "Πλύση butterworth με ζεστό θαλασσινό νερό", ru: "Мойка буттервортом теплой морской водой", zh: "温海水洗舱机洗舱" },
    "Warm Seawater Butterworth - Intensive": { es: "Lavado butterworth intensivo con agua de mar templada", el: "Εντατική πλύση butterworth με ζεστό θαλασσινό νερό", ru: "Интенсивная мойка теплой морской водой", zh: "温海水洗舱机洗舱 - 强化" },
    "Warm Seawater Butterworth - Light": { es: "Lavado butterworth ligero con agua de mar templada", el: "Ελαφριά πλύση butterworth με ζεστό θαλασσινό νερό", ru: "Легкая мойка теплой морской водой", zh: "温海水洗舱机洗舱 - 轻度" },
    "Hot Water Butterworth": { es: "Lavado butterworth con agua caliente", el: "Πλύση butterworth με ζεστό νερό", ru: "Мойка буттервортом горячей водой", zh: "热水洗舱机洗舱" },
    "Hot Water Butterworth - Intensive": { es: "Lavado butterworth intensivo con agua caliente", el: "Εντατική πλύση butterworth με ζεστό νερό", ru: "Интенсивная мойка горячей водой", zh: "热水洗舱机洗舱 - 强化" }
  };
  
  if (titleGlossary[title] && titleGlossary[title][targetLang]) {
    return titleGlossary[title][targetLang];
  }
  
  let translated = title;
  const genericReplacements = {
    "Wash Protocol": { es: "Protocolo de lavado", el: "Πρωτόκολλο πλύσης", ru: "Протокол мойки", zh: "洗舱协议" },
    "Standard": { es: "Estándar", el: "Τυπικό", ru: "Стандарт", zh: "标准" },
    "Intensive": { es: "Intensivo", el: "Εντατικό", ru: "Интенсив", zh: "强化" },
    "Light": { es: "Ligero", el: "Ελαφρύ", ru: "Легкий", zh: "轻度" }
  };
  
  Object.entries(genericReplacements).forEach(([enWord, langObj]) => {
    if (langObj[targetLang]) {
      translated = translated.replace(new RegExp(enWord, 'g'), langObj[targetLang]);
    }
  });
  return translated;
}

function translateProcedureText(text, targetLang) {
  if (!text) return '';
  // For Turkish, we will run the translation glossary engine to translate English steps to Turkish
  if (targetLang === 'en') return text;
  
  const lines = text.split('\n');
  const translatedLines = lines.map(line => {
    let clean = line.replace(/^(STEP|ADIM)\s*\d+:\s*/i, '').trim();
    const numMatch = line.match(/^(STEP|ADIM)\s*(\d+)/i);
    const stepNum = numMatch ? numMatch[2] : '';
    const prefix = T[targetLang].step_prefix || 'STEP';
    
    if (targetLang === 'tr') {
      const trGlossary = {
        "Confirm gas-free status and strip all cargo residues completely.": "Gazdan arındırılmış durumu doğrulayın ve tüm yük kalıntılarını tamamen tahliye edin.",
        "Ensure tank is fully stripped of cargo.": "Tankın yükten tamamen arındırıldığından emin olun.",
        "Strip tank completely.": "Tankı tamamen tahliye edin.",
        "Strip tank, lines and manifolds fully dry.": "Tankı, devreleri ve manifoldları tamamen kuruyana kadar tahliye edin.",
        "Strip tank completely dry.": "Tankı tamamen kurulayana kadar tahliye edin.",
        "Strip all cargo lines, crossovers and manifolds.": "Tüm yük devrelerini, crossover'ları ve manifoldları tahliye edin.",
        "Strip all wash water to slop tank or reception facility.": "Tüm yıkama suyunu slop tankına veya liman kabul tesisine tahliye edin.",
        "Strip all wash water to slop tank or designated reception.": "Tüm yıkama suyunu slop tankına veya belirlenmiş kabul tesisine tahliye edin.",
        "Strip wash water completely to slop tank or designated reception.": "Yıkama suyunu tamamen slop tankına veya belirlenmiş kabul tesisine tahliye edin.",
        "Strip wash water completely.": "Yıkama suyunu tamamen tahliye edin.",
        "Strip completely. Re-inspect all areas.": "Tamamen tahliye edin. Tüm alanları yeniden denetleyin.",
        "Strip completely to slop. Inspect for residues.": "Tamamen slop tankına tahliye edin. Kalıntıları denetleyin.",
        "Visual inspection of tank bottom and pump sump.": "Tank tabanının ve pompa kuyusunun (sump) görsel denetimi.",
        "Inspect pump sumps, heating coil connections, and tank bottom for residues.": "Pompa kuyularını, ısıtma serpantini bağlantılarını ve tank tabanını kalıntılar için denetleyin.",
        "Visual inspection of tank bottom and pump sump. No significant residue should remain.": "Tank tabanının ve pompa kuyusunun görsel denetimi. Önemli bir kalıntı kalmamalıdır.",
        "Special protocol for hazardous or toxic chemical residues. Mandatory prewash before port entry. Strict waste disposal. Specialized PPE.": "Tehlikeli veya toksik kimyasal kalıntılar için özel protokol. Limana girişten önce zorunlu ön yıkama. Sıkı atık bertarafı. Özel KKD.",
        "Ultra-high standard for inspection-grade requirements. All stages documented. Multi-stage hot water washing. Surveyor inspection. Wall-wash test required.": "Sörvey denetim gereksinimleri için ultra yüksek standart. Tüm aşamalar belgelenir. Çok aşamalı sıcak su yıkaması. Sörveyör denetimi. Duvar yıkama testi (Wall-wash) gereklidir.",
        "Standard product tanker cleaning. Hot water wash with full tank internal attention. Line and manifold cleaning integral. Clean petroleum loading preparation.": "Standart ürün tankeri temizliği. Tam tank içi temizlik ile sıcak su yıkaması. Entegre devre ve manifold temizliği. Temiz petrol yükleme hazırlığı."
      };
      
      if (trGlossary[clean]) {
        return `${prefix} ${stepNum}: ${trGlossary[clean]}`;
      }
      
      const flushMatch = clean.match(/Flush all cargo lines, manifolds and crossovers with wash water for (\d+) minutes\./i);
      if (flushMatch) {
        return `${prefix} ${stepNum}: Tüm yük devrelerini, crossover'ları ve manifoldları ${flushMatch[1]} dakika boyunca yıkama suyu ile yıkayın.`;
      }
      const coldFWMatch = clean.match(/Cold fresh water final rinse (\d+)-(\d+) minutes\.\s*Strip dry\./i) || clean.match(/Cold fresh water final rinse (\d+)-(\d+) minutes\.\n?Strip dry\./i);
      if (coldFWMatch) {
        return `${prefix} ${stepNum}: Soğuk tatlı su ile son durulama ${coldFWMatch[1]}-${coldFWMatch[2]} dakika. Kuruyana kadar tahliye edin.`;
      }
      const ventMatch = clean.match(/Ventilate minimum (\d+) hours\.\s*Confirm safe atmosphere before entry\./i);
      if (ventMatch) {
        return `${prefix} ${stepNum}: En az ${ventMatch[1]} saat havalandırın. Girişten önce güvenli atmosferi doğrulayın.`;
      }
      const tempDurMatch = clean.match(/Temperature range:\s*([\w\-]+)°C\.\s*Duration:\s*(\d+)-(\d+)\s*minutes\./i);
      if (tempDurMatch) {
        return `${prefix} ${stepNum}: Sıcaklık aralığı: ${tempDurMatch[1]}°C. Süre: ${tempDurMatch[2]}-${tempDurMatch[3]} dakika.`;
      }
      const tempDurSingleMatch = clean.match(/Temperature range:\s*([\w\-]+)°C\.\s*Duration:\s*(\d+)\s*minutes\./i);
      if (tempDurSingleMatch) {
        return `${prefix} ${stepNum}: Sıcaklık aralığı: ${tempDurSingleMatch[1]}°C. Süre: ${tempDurSingleMatch[2]} dakika.`;
      }
      const tempVariesMatch = clean.match(/Temperature range:\s*varies\.\s*Duration:\s*(\d+)-(\d+)\s*minutes\./i);
      if (tempVariesMatch) {
        return `${prefix} ${stepNum}: Sıcaklık aralığı: değişken. Süre: ${tempVariesMatch[1]}-${tempVariesMatch[2]} dakika.`;
      }
    }
    
    const lineGlossary = {
      "Confirm gas-free status and strip all cargo residues completely.": {
        es: "Confirmar el estado libre de gas y vaciar completamente todos los residuos de carga.",
        el: "Επιβεβαιώστε την κατάσταση gas-free και αδειάστε πλήρως όλα τα υπολείμματα φορτίου.",
        ru: "Подтвердите отсутствие газов и полностью удалите остатки груза из танка.",
        zh: "确认无毒无气状态，并完全扫舱清除所有残留物。"
      },
      "Ensure tank is fully stripped of cargo.": {
        es: "Asegurarse de que el tanque esté completamente vacío de carga.",
        el: "Βεβαιωθείτε ότι η δεξαμενή έχει αδειάσει πλήρως από το φορτίο.",
        ru: "Убедитесь, что из танка полностью удален весь груз.",
        zh: "确保货舱内的货物已完全排空。"
      },
      "Strip tank completely.": {
        es: "Vaciar el tanque por completo.",
        el: "Αδειάστε τελείως τη δεξαμενή.",
        ru: "Полностью осушите танк.",
        zh: "对储罐进行完全扫舱。"
      },
      "Strip tank, lines and manifolds fully dry.": {
        es: "Vaciar el tanque, las tuberías y los colectores completamente secos.",
        el: "Αδειάστε τελείως τη δεξαμενή, τις γραμμές και τις πολλαπλές.",
        ru: "Осушите танк, трубопроводы и коллекторы досуха.",
        zh: "扫舱将储罐、管线和集管完全排干。"
      },
      "Strip tank completely dry.": {
        es: "Vaciar el tanque completamente seco.",
        el: "Αδειάστε τελείως τη δεξαμενή.",
        ru: "Высушить танк осушением полностью.",
        zh: "扫舱排干储罐。"
      },
      "Strip all cargo lines, crossovers and manifolds.": {
        es: "Vaciar todas las tuberías de carga, cruces y colectores.",
        el: "Αδειάστε όλες τις γραμμές φορτίου, τις διασταυρώσεις και τις πολλαπλές.",
        ru: "Осушите все грузовые трубопроводы, переходы и коллекторы.",
        zh: "扫舱所有货物管线、交叉管和集管。"
      },
      "Strip all wash water to slop tank or reception facility.": {
        es: "Aspirar toda el agua de lavado al tanque de slops o instalación de recepción.",
        el: "Αδειάστε όλο το νερό πλύσης στη δεξαμενή slop ή σε εγκατάσταση υποδοχής.",
        ru: "Откачайте всю промывочную воду в слоп-танк или береговое приемное устройство.",
        zh: "将所有洗舱水扫舱排至废液柜 (Slop Tank) 或接收设施。"
      },
      "Strip all wash water to slop tank or designated reception.": {
        es: "Aspirar toda el agua de lavado al tanque de slops o recepción designada.",
        el: "Αδειάστε όλο το νερό πλύσης στη δεξαμενή slop ή σε καθορισμένη υποδοχή.",
        ru: "Откачайте всю промывочную воду в слоп-танк или назначенное приемное устройство.",
        zh: "将所有洗舱水扫舱排至废液柜或指定接收地。"
      },
      "Strip wash water completely to slop tank or designated reception.": {
        es: "Aspirar el agua de lavado por completo al tanque de slops o recepción designada.",
        el: "Αδειάστε τελείως το νερό πλύσης στη δεξαμενή slop ή σε καθορισμένη υποδοχή.",
        ru: "Полностью откачайте промывочную воду в слоп-танк или назначенное приемное устройство.",
        zh: "将洗舱水完全扫舱排至废液柜或指定接收地。"
      },
      "Strip wash water completely.": {
        es: "Aspirar el agua de lavado por completo.",
        el: "Αδειάστε τελείως το νερό πλύσης.",
        ru: "Полностью откачайте промывочную воду.",
        zh: "完全扫舱排除洗舱 waste 水。"
      },
      "Strip completely. Re-inspect all areas.": {
        es: "Vaciar por completo. Volver a inspeccionar todas las áreas.",
        el: "Αδειάστε τελείως. Επιθεωρήστε ξανά όλες τις περιοχές.",
        ru: "Осушите полностью. Повторно осмотрите все участки.",
        zh: "完全扫舱。重新检验所有区域。"
      },
      "Strip completely to slop. Inspect for residues.": {
        es: "Vaciar por completo a slops. Inspeccionar en busca de residuos.",
        el: "Αδειάστε τελείως στο slop. Επιθεωρήστε για υπολείμματα.",
        ru: "Полностью откачайте в слоп. Осмотрите на наличие остатков.",
        zh: "完全扫舱排至废液柜。检查是否有残留物。"
      },
      "Visual inspection of tank bottom and pump sump.": {
        es: "Inspección visual del fondo del tanque y pozo de la bomba.",
        el: "Οπτική επιθεώρηση του πυθμένα της δεξαμενής και του φρεατίου της αντλίας.",
        ru: "Визуальный осмотр дна танка и зумпфа насоса.",
        zh: "目视检验舱底 and 泵阱。"
      },
      "Inspect pump sumps, heating coil connections, and tank bottom for residues.": {
        es: "Inspeccionar los pozos de las bombas, conexiones de serpentines de calefacción y fondo del tanque en busca de residuos.",
        el: "Επιθεωρήστε τα φρεάτια των αντλιών, τις συνδέσεις των θερμαντικών στοιχείων και τον πυθμένα της δεξαμενής για υπολείμματα.",
        ru: "Осмотрите зумпфы насосов, соединения змеевиков подогрева и дно танка на наличие остатков.",
        zh: "检查泵阱、加热盘管连接处和舱底是否有残留物。"
      },
      "Visual inspection of tank bottom and pump sump. No significant residue should remain.": {
        es: "Inspección visual del fondo del tanque y pozo de la bomba. No deben quedar residuos significativos.",
        el: "Οπτική επιθεώρηση του πυθμένα της δεξαμενής και του φρεατίου της αντλίας. Δεν πρέπει να απομένουν σημαντικά υπολείμματα.",
        ru: "Визуальный осмотр дна танка и зумпфа насоса. Не должно оставаться значительных остатков груза.",
        zh: "舱底和泵阱的外观检验。不应留有任何明显的残留物。"
      },
      "Special protocol for hazardous or toxic chemical residues. Mandatory prewash before port entry. Strict waste disposal. Specialized PPE.": {
        es: "Protocolo especial para residuos químicos peligrosos o tóxicos. Prelavado obligatorio antes de la entrada al puerto. Disposición estricta de residuos. EPP especializado.",
        el: "Ειδικό πρωτόκολλο για επικίνδυνα ή τοξικά χημικά υπολείμματα. Υποχρεωτική προπλύση πριν από την είσοδο στο λιμάνι. Αυστηρή διάθεση αποβλήτων. Εξειδικευμένα ΜΑΠ.",
        ru: "Специальный протокол для опасных или токсичных химических остатков. Обязательная предварительная мойка перед заходом в порт. Строгая утилизация отходов. Специальные СИЗ.",
        zh: "针对危险或有毒化学品残留的特殊协议。入港前强制预洗。严格的废物处置。专用个人防护装备。"
      },
      "Ultra-high standard for inspection-grade requirements. All stages documented. Multi-stage hot water washing. Surveyor inspection. Wall-wash test required.": {
        es: "Estándar ultra alto para requisitos de grado de inspección. Todas las etapas documentadas. Lavado con agua caliente en múltiples etapas. Inspección del inspector. Se requiere prueba de wall-wash.",
        el: "Εξαιρετικά υψηλό πρότυπο για απαιτήσεις επιθεώρησης. Όλα τα στάδια τεκμηριώνονται. Πλύση με ζεστό νερό πολλαπλών σταδίων. Επιθεώρηση πραγματογνώμονα. Απαιτείται wall-wash test.",
        ru: "Сверхвысокий стандарт для требований инспекционного класса. Все этапы документируются. Многоэтапная мойка горячей водой. Инспекция сюрвейера. Требуется тест wall-wash.",
        zh: "检验级要求的超高标准。所有阶段均有记录。多阶段热水洗舱。验舱师检验。需要进行壁洗测试 (WWT)。"
      },
      "Standard product tanker cleaning. Hot water wash with full tank internal attention. Line and manifold cleaning integral. Clean petroleum loading preparation.": {
        es: "Limpieza estándar de petroleros de productos. Lavado con agua caliente con atención interna completa del tanque. Limpieza de líneas y colectores integrada. Preparación para la carga de petróleo limpio.",
        el: "Τυπικός καθαρισμός δεξαμενόπλοιων προϊόντων. Πλύση με ζεστό νερό με πλήρη προσοχή στο εσωτερικό της δεξαμενής. Ολοκληρωμένος καθαρισμός γραμμών και πολλαπλών. Προετοιμασία για φόρτωση καθαρού πετρελαίου.",
        ru: "Стандартная очистка танкеров-продуктовозов. Мойка горячей водой с полным охватом внутренних поверхностей танка. Интегральная очистка трубопроводов и коллекторов. Подготовка к погрузке чистых нефтепродуктов.",
        zh: "标准成品油轮清洗。热水洗舱，全面关注储罐内部。管线和集管清洗一体化。清洁石油装载准备。"
      }
    };
    
    if (lineGlossary[clean] && lineGlossary[clean][targetLang]) {
      return `${prefix} ${stepNum}: ${lineGlossary[clean][targetLang]}`;
    }
    
    const flushMatch = clean.match(/Flush all cargo lines, manifolds and crossovers with wash water for (\d+) minutes\./i);
    if (flushMatch) {
      const mins = flushMatch[1];
      if (targetLang === 'es') return `${prefix} ${stepNum}: Lavar todas las tuberías de carga, colectores y cruces con agua de lavado durante ${mins} minutos.`;
      if (targetLang === 'el') return `${prefix} ${stepNum}: Ξεπλύνετε όλες τις γραμμές φορτίου, τις πολλαπλές και τις διασταυρώσεις με νερό πλύσης για ${mins} λεπτά.`;
      if (targetLang === 'ru') return `${prefix} ${stepNum}: Промойте все грузовые трубопроводы, коллекторы и переходы промывочной водой в течение ${mins} минут.`;
      if (targetLang === 'zh') return `${prefix} ${stepNum}: 用洗舱水冲洗所有货物管线、集管和交叉口 ${mins} 分钟。`;
    }
    
    const coldFWMatch = clean.match(/Cold fresh water final rinse (\d+)-(\d+) minutes\.\s*Strip dry\./i) || clean.match(/Cold fresh water final rinse (\d+)-(\d+) minutes\.\n?Strip dry\./i);
    if (coldFWMatch) {
      const minStart = coldFWMatch[1];
      const minEnd = coldFWMatch[2];
      if (targetLang === 'es') return `${prefix} ${stepNum}: Enjuague final con agua dulce fría durante ${minStart}-${minEnd} minutos. Secar por aspiración.`;
      if (targetLang === 'el') return `${prefix} ${stepNum}: Τελικό ξέπλυμα με κρύο γλυκό νερό για ${minStart}-${minEnd} λεπτά. Αδειάστε τελείως.`;
      if (targetLang === 'ru') return `${prefix} ${stepNum}: Финишное ополаскивание холодной пресной водой в течение ${minStart}-${minEnd} минут. Высушить осушением.`;
      if (targetLang === 'zh') return `${prefix} ${stepNum}: 冷淡水最后冲洗 ${minStart}-${minEnd} 分钟。扫舱干燥。`;
    }
    
    const ventMatch = clean.match(/Ventilate minimum (\d+) hours\.\s*Confirm safe atmosphere before entry\./i);
    if (ventMatch) {
      const hrs = ventMatch[1];
      if (targetLang === 'es') return `${prefix} ${stepNum}: Ventilar un mínimo de ${hrs} horas. Confirmar atmósfera segura antes de entrar.`;
      if (targetLang === 'el') return `${prefix} ${stepNum}: Αερίστε τουλάχιστον ${hrs} ώρες. Επιβεβαιώστε την ασφαλή ατμόσφαιρα πριν από την είσοδο.`;
      if (targetLang === 'ru') return `${prefix} ${stepNum}: Вентилируйте минимум ${hrs} часов. Подтвердите безопасность атмосферы перед входом.`;
      if (targetLang === 'zh') return `${prefix} ${stepNum}: 通风至少 ${hrs} 小时。进入前确认舱内空气安全。`;
    }
    
    const tempDurMatch = clean.match(/Temperature range:\s*([\w\-]+)°C\.\s*Duration:\s*(\d+)-(\d+)\s*minutes\./i);
    if (tempDurMatch) {
      const range = tempDurMatch[1];
      const durMin = tempDurMatch[2];
      const durMax = tempDurMatch[3];
      if (targetLang === 'es') return `${prefix} ${stepNum}: Rango de temperatura: ${range}°C. Duración: ${durMin}-${durMax} minutos.`;
      if (targetLang === 'el') return `${prefix} ${stepNum}: Εύρος θερμοκρασίας: ${range}°C. Διάρκεια: ${durMin}-${durMax} λεπτά.`;
      if (targetLang === 'ru') return `${prefix} ${stepNum}: Диапазон температур: ${range}°C. Продолжительность: ${durMin}-${durMax} минут.`;
      if (targetLang === 'zh') return `${prefix} ${stepNum}: 温度范围: ${range}°C。持续时间: ${durMin}-${durMax} 分钟。`;
    }
    
    const tempDurSingleMatch = clean.match(/Temperature range:\s*([\w\-]+)°C\.\s*Duration:\s*(\d+)\s*minutes\./i);
    if (tempDurSingleMatch) {
      const range = tempDurSingleMatch[1];
      const dur = tempDurSingleMatch[2];
      if (targetLang === 'es') return `${prefix} ${stepNum}: Rango de temperatura: ${range}°C. Duración: ${dur} minutos.`;
      if (targetLang === 'el') return `${prefix} ${stepNum}: Εύρος θερμοκρασίας: ${range}°C. Διάρκεια: ${dur} λεπτά.`;
      if (targetLang === 'ru') return `${prefix} ${stepNum}: Диапазон температур: ${range}°C. Продолжительность: ${dur} минут.`;
      if (targetLang === 'zh') return `${prefix} ${stepNum}: 温度范围: ${range}°C。持续时间: ${dur} 分钟。`;
    }
    
    const tempVariesMatch = clean.match(/Temperature range:\s*varies\.\s*Duration:\s*(\d+)-(\d+)\s*minutes\./i);
    if (tempVariesMatch) {
      const durMin = tempVariesMatch[1];
      const durMax = tempVariesMatch[2];
      if (targetLang === 'es') return `${prefix} ${stepNum}: Rango de temperatura: variable. Duración: ${durMin}-${durMax} minutos.`;
      if (targetLang === 'el') return `${prefix} ${stepNum}: Εύρος θερμοκρασίας: ποικίλλει. Διάρκεια: ${durMin}-${durMax} λεπτά.`;
      if (targetLang === 'ru') return `${prefix} ${stepNum}: Диапазон температур: варьируется. Продолжительность: ${durMin}-${durMax} минут.`;
      if (targetLang === 'zh') return `${prefix} ${stepNum}: 温度范围: 变化。持续时间: ${durMin}-${durMax} 分钟。`;
    }
    
    let wordsTranslated = clean;
    const wordGlossary = {
      "STEP": { es: "PASO", el: "ΒΗΜΑ", ru: "ШАГ", zh: "步骤", tr: "ADIM" },
      "minutes": { es: "minutos", el: "λεπτά", ru: "минут", zh: "分钟", tr: "dakika" },
      "minute": { es: "minuto", el: "λεπτό", ru: "минута", zh: "分钟", tr: "dakika" },
      "mins": { es: "minutos", el: "λεπτά", ru: "минут", zh: "分钟", tr: "dakika" },
      "hours": { es: "horas", el: "ώρες", ru: "часов", zh: "小时", tr: "saat" },
      "hour": { es: "hora", el: "ώρα", ru: "час", zh: "小时", tr: "saat" },
      "wash": { es: "lavado", el: "πλύση", ru: "мойка", zh: "清洗", tr: "yıkama" },
      "rinse": { es: "enjuague", el: "ξέπλυμα", ru: "ополаскивание", zh: "冲洗", tr: "durulama" },
      "seawater": { es: "agua de mar", el: "θαλασσινό νερό", ru: "морская вода", zh: "海水", tr: "deniz suyu" },
      "fresh water": { es: "agua dulce", el: "γλυκό νερό", ru: "пресная вода", zh: "淡水", tr: "tatlı su" },
      "hot water": { es: "agua caliente", el: "ζεστό νερό", ru: "горячая вода", zh: "热水", tr: "sıcak su" },
      "cold water": { es: "agua fría", el: "κρύο νερό", ru: "холодная вода", zh: "冷水", tr: "soğuk su" },
      "ventilate": { es: "ventilar", el: "αερίστε", ru: "вентилировать", zh: "通风", tr: "havalandırın" }
    };
    
    Object.entries(wordGlossary).forEach(([enWord, langObj]) => {
      if (langObj[targetLang]) {
        wordsTranslated = wordsTranslated.replace(new RegExp(enWord, 'gi'), langObj[targetLang]);
      }
    });
    
    return `${prefix} ${stepNum}: ${wordsTranslated}`;
  });
  
  return translatedLines.join('\n');
}

function translateSafetyNote(note, targetLang) {
  if (!note) return '';
  if (targetLang === 'en') return note;
  
  const clean = note.trim();
  if (targetLang === 'tr') {
    const trNoteGlossary = {
      "High temperature burn hazard. No personnel in tank during operation.": "Yüksek sıcaklık yanma tehlikesi. Operasyon sırasında tankta personel bulunmamalıdır.",
      "MARPOL Category X/Y. Prewash mandatory. Port reception required. Notify port authorities.": "MARPOL Kategori X/Y. Ön yıkama zorunludur. Liman atık alım tesisi gereklidir. Liman yetkililerine bildirin.",
      "Chemical compatibility check mandatory. PPE required.": "Kimyasal uyumluluk kontrolü zorunludur. KKD gereklidir.",
      "Independent surveyor required. Wall-wash mandatory before loading.": "Bağımsız sörveyör gereklidir. Yüklemeden önce duvar yıkama testi (Wall-wash) zorunludur.",
      "Monitor tank temperature. Ensure gas-free before entry.": "Tank sıcaklığını izleyin. Girişten önce gazdan arındırılmış (gas-free) olduğundan emin olun.",
      "Prepare for wall-wash inspection. Independent surveyor may be required.": "Duvar yıkama testi (Wall-wash) denetimine hazırlanın. Bağımsız sörveyör gerekebilir.",
      "ISGOTT compliance required. COQ preparation may be needed.": "ISGOTT uyumluluğu gereklidir. COQ (Kalite Belgesi) hazırlığı gerekebilir.",
      "Superintendent inspection required. Certificate of fitness may be required.": "Enspektör denetimi gereklidir. Uygunluk belgesi (CoF) gerekebilir.",
      "Test for nitrogen/amine traces if next cargo is sensitive. pH monitoring.": "Sonraki yük hassassa azot/amin kalıntıları için test edin. pH izleme.",
      "Specialist chemical knowledge required. MSDS on board. pH verification mandatory.": "Uzman kimyasal bilgisi gereklidir. MSDS gemide olmalıdır. pH doğrulaması zorunludur.",
      "Chloride test of final wash water recommended.": "Son yıkama suyunun klorür testi yapılması önerilir.",
      "FOSFA/NIOP standards for edible oils. Tank certified for food-grade. No zinc or lead paints.": "Yemeklik yağlar için FOSFA/NIOP standartları. Tank gıda sınıfı için sertifikalandırılmalıdır. Çinko veya kurşun boya kullanılmamalıdır.",
      "Monitor temperature continuously. Do not exceed coating temperature limit.": "Sıcaklığı sürekli izleyin. Kaplama sıcaklık sınırını aşmayın.",
      "Oil residue to slop per MARPOL Annex I.": "MARPOL Ek I uyarınca slop tankına yağ kalıntısı tahliyesi.",
      "Continuous temperature monitoring mandatory. Deviation may damage coating.": "Sürekli sıcaklık izleme zorunludur. Sapma olması kaplamaya zarar verebilir."
    };
    return trNoteGlossary[clean] || clean;
  }
  const noteGlossary = {
    "High temperature burn hazard. No personnel in tank during operation.": {
      es: "Peligro de quemaduras por alta temperatura. No permitir personal en el tanque durante la operación.",
      el: "Κίνδυνος εγκαύματος υψηλής θερμοκρασίας. Απαγορεύεται η παρουσία προσωπικού στη δεξαμενή κατά τη λειτουργία.",
      ru: "Опасность ожога высокой температурой. Вход персонала в танк во время работы запрещен.",
      zh: "高温灼伤危险。操作期间舱内严禁有人员。"
    },
    "MARPOL Category X/Y. Prewash mandatory. Port reception required. Notify port authorities.": {
      es: "Categoría MARPOL X/Y. Prelavado obligatorio. Se requiere recepción en puerto. Notificar a las autoridades portuarias.",
      el: "Κατηγορία MARPOL X/Y. Υποχρεωτική προπλύση. Απαιτείται ευκολία υποδοχής λιμένος. Ειδοποιήστε τις λιμενικές αρχές.",
      ru: "Категория МАРПОЛ X/Y. Предварительная мойка обязательна. Требуется береговое приемное устройство. Уведомить портовые власти.",
      zh: "马普尔 (MARPOL) 类别 X/Y。强制预洗。需要港口接收设施。通知港口当局。"
    },
    "Chemical compatibility check mandatory. PPE required.": {
      es: "Verificación de compatibilidad química obligatoria. Se requiere EPP.",
      el: "Υποχρεωτικός έλεγχος χημικής συμβατότητας. Απαιτούνται ΜΑΠ.",
      ru: "Проверка химической совместимости обязательна. Требуются СИЗ.",
      zh: "强制性化学兼容性检查。需要个人防护装备 (PPE)。"
    },
    "Independent surveyor required. Wall-wash mandatory before loading.": {
      es: "Se requiere inspector independiente. Wall-wash obligatorio antes de la carga.",
      el: "Απαιτείται ανεξάρτητος πραγματογνώμονας. Υποχρεωτικό wall-wash test πριν από τη φόρτωση.",
      ru: "Требуется независимый сюрвейер. Тест wall-wash обязателен перед погрузкой.",
      zh: "需要独立验舱师。装货前必须进行壁洗测试。"
    },
    "Monitor tank temperature. Ensure gas-free before entry.": {
      es: "Monitorear la temperatura del tanque. Asegurar que esté libre de gas antes de entrar.",
      el: "Παρακολουθήστε τη θερμοκρασία της δεξαμενής. Βεβαιωθείτε ότι είναι gas-free πριν από την είσοδο.",
      ru: "Контролируйте температуру танка. Убедитесь в отсутствии газов перед входом.",
      zh: "监控储罐温度。进入前确保无毒无气。"
    },
    "Prepare for wall-wash inspection. Independent surveyor may be required.": {
      es: "Preparar para inspección de wall-wash. Puede requerirse un inspector independiente.",
      el: "Προετοιμαστείτε για επιθεώρηση wall-wash. Ενδέχεται να απαιτείται ανεξάρτητος πραγματογνώμονας.",
      ru: "Подготовиться к инспекции wall-wash. Может потребоваться независимый сюрвейер.",
      zh: "准备壁洗测试检验。可能需要独立验舱师。"
    },
    "ISGOTT compliance required. COQ preparation may be needed.": {
      es: "Se requiere cumplimiento de ISGOTT. Puede ser necesaria la preparación del COQ (Certificado de Calidad).",
      el: "Απαιτείται συμμόρφωση με το ISGOTT. Ενδέχεται να απαιτείται προετοιμασία COQ.",
      ru: "Требуется соблюдение требований ISGOTT. Может потребоваться подготовка сертификата качества (COQ).",
      zh: "需要遵守 ISGOTT 标准。可能需要准备质量证书 (COQ)。"
    },
    "Superintendent inspection required. Certificate of fitness may be required.": {
      es: "Se requiere inspección del superintendente. Puede requerirse un certificado de aptitud.",
      el: "Απαιτείται επιθεώρηση από τον αρχιπλοίαρχο. Ενδέχεται να απαιτείται πιστοποιητικό καταλληλότητας (CoF).",
      ru: "Требуется инспекция суперинтенданта. Может потребоваться сертификат годности.",
      zh: "需要机务主管检验。可能需要适装证书 (Certificate of Fitness)。"
    },
    "Test for nitrogen/amine traces if next cargo is sensitive. pH monitoring.": {
      es: "Prueba de trazas de nitrógeno/aminas si la siguiente carga es sensible. Monitoreo de pH.",
      el: "Έλεγχος για ίχνη αζώτου/αμινών εάν το επόμενο φορτίο είναι ευαίσθητο. Παρακολούθηση pH.",
      ru: "Тест на следы азота/аминов, если следующий груз чувствителен. Мониторинг pH.",
      zh: "如果拟载货物敏感，则测试氮/胺微量残留。监测 pH 值。"
    },
    "Specialist chemical knowledge required. MSDS on board. pH verification mandatory.": {
      es: "Se requiere conocimiento químico especializado. MSDS a bordo. Verificación de pH obligatoria.",
      el: "Απαιτείται εξειδικευμένη χημική γνώση. MSDS επί του πλοίου. Υποχρεωτική επαλήθευση pH.",
      ru: "Требуются специальные химические знания. Лист безопасности (MSDS) на борту. Проверка pH обязательна.",
      zh: "需要专业的化学知识。船上备有化学品安全说明书 (MSDS)。强制验证 pH 值。"
    },
    "Chloride test of final wash water recommended.": {
      es: "Se recomienda la prueba de cloruros del agua de lavado final.",
      el: "Συνιστάται δοκιμή χλωριδίων στο τελικό νερό πλύσης.",
      ru: "Рекомендуется тест на хлориды в финальной промывочной воде.",
      zh: "建议对最后的洗舱水进行氯化物测试。"
    },
    "FOSFA/NIOP standards for edible oils. Tank certified for food-grade. No zinc or lead paints.": {
      es: "Estándares FOSFA/NIOP para aceites comestibles. Tanque certificado para grado alimentario. Sin pinturas de zinc o plomo.",
      el: "Πρότυπα FOSFA/NIOP για βρώσιμα έλαια. Δεξαμενή πιστοποιημένη για τρόφιμα. Χωρίς βαφές ψευδαργύρου ή μολύβδου.",
      ru: "Стандарты FOSFA/NIOP для пищевых масел. Танк сертифицирован для пищевых продуктов. Без цинковых или свинцовых красок.",
      zh: "适用于食用油的位置 (FOSFA/NIOP) 标准。储罐经食品级认证。无锌或无铅涂料。"
    },
    "Monitor temperature continuously. Do not exceed coating temperature limit.": {
      es: "Monitorear la temperatura continuamente. No exceder el límite de temperatura del revestimiento.",
      el: "Παρακολουθήστε τη θερμοκρασία συνεχώς. Μην υπερβαίνετε το όριο θερμοκρασίας της επίστρωσης.",
      ru: "Непрерывно контролируйте температуру. Не превышайте температурный лимит покрытия.",
      zh: "持续监测温度。不要超过涂层温度限制。"
    },
    "Oil residue to slop per MARPOL Annex I.": {
      es: "Residuos de petróleo a slops según el Anexo I de MARPOL.",
      el: "Υπολείμματα πετρελαίου στο slop σύμφωνα με το Παράρτημα Ι της MARPOL.",
      ru: "Нефтяные остатки в слоп-танк в соответствии с Приложением I к МАРПОЛ.",
      zh: "根据马普尔 (MARPOL) 附录 I 将油类残留物排至废液柜。"
    },
    "Continuous temperature monitoring mandatory. Deviation may damage coating.": {
      es: "Monitoreo continuo de temperatura obligatorio. La desviación puede dañar el revestimiento.",
      el: "Υποχρεωτική συνεχής παρακολούθηση θερμοκρασίας. Απόκλιση μπορεί να καταστρέψει την επίστρωση.",
      ru: "Непрерывный температурный контроль обязателен. Отклонение может повредить покрытие.",
      zh: "必须持续进行温度监测。偏差可能会损坏涂层。"
    }
  };
  
  if (noteGlossary[clean] && noteGlossary[clean][targetLang]) {
    return noteGlossary[clean][targetLang];
  }
  
  return clean;
}

function appendTankProtocolCard(id, tank, proc, code, parsed, waterVol, fuelMT, detL, isFallback = false, fallbackSourceId = null) {
  const container = document.getElementById('tank-protocols-container');
  if (!container) return;
  const card = document.createElement('div');
  card.className = 'tank-protocol-card';
  card.setAttribute('data-tank-id', id);
  if (id === activeEditingTankId) {
    card.style.borderColor = 'var(--accent)';
    card.style.boxShadow = '0 0 12px var(--accent-glow)';
  }
  
  const title = translateProcedureTitle(proc, lang);
  const rawInstructions = proc.instructions;
  const translatedInst = (lang === 'tr' && proc.instructions_tr)
    ? proc.instructions_tr
    : translateProcedureText(rawInstructions, lang);
  
  const stepsList = translatedInst.split(/\n/).filter(s => s.trim()).map((stepLine, i) => {
    const cleanLine = stepLine.replace(/^(STEP|ADIM|PASO|ΒΗΜΑ|ШАГ|步骤)\s*\d+:\s*/i, '').trim();
    const numMatch = stepLine.match(/^(STEP|ADIM|PASO|ΒΗΜΑ|ШАГ|步骤)\s*(\d+)/i);
    const stepNum = numMatch ? numMatch[2] : String(i+1);
    const stepPrefix = T[lang].step_prefix || 'STEP';
    
    // Fetch time sheet data
    const timeData = (tank.timeSheet && tank.timeSheet[i]) || { commenced: '', completed: '', remarks: '' };
    
    // Localized labels
    const logTimeVal = lang === 'tr' ? 'ZAMAN RAPORU:' : (lang === 'es' ? 'REGISTRO DE TIEMPO:' : (lang === 'el' ? 'ΚΑΤΑΓΡΑΦΗ ΧΡΟΝΟΥ:' : (lang === 'ru' ? 'ЛОГ ВРЕМЕНИ:' : (lang === 'zh' ? '时间日志:' : 'LOG TIME:'))));
    const commencedVal = lang === 'tr' ? 'Başlangıç:' : (lang === 'es' ? 'Comenzó:' : (lang === 'el' ? 'Έναρξη:' : (lang === 'ru' ? 'Начало:' : (lang === 'zh' ? '开始:' : 'Commenced:'))));
    const completedVal = lang === 'tr' ? 'Bitiş:' : (lang === 'es' ? 'Completado:' : (lang === 'el' ? 'Ολοκλήρωση:' : (lang === 'ru' ? 'Заverşeno:' : (lang === 'zh' ? '完成:' : 'Completed:'))));
    const remarksVal = lang === 'tr' ? 'Açıklama:' : (lang === 'es' ? 'Observaciones:' : (lang === 'el' ? 'Παρατηρήσεις:' : (lang === 'ru' ? 'Примечания:' : (lang === 'zh' ? '备注:' : 'Remarks:'))));

    return `
      <div class="step-card">
        <div class="step-top-row">
          <div class="step-num-col"><div class="step-num-text">${stepPrefix} ${stepNum}</div></div>
          <div class="step-body">${cleanLine}</div>
        </div>
        <div class="step-timesheet">
          <span class="timesheet-label">${logTimeVal}</span>
          <div class="timesheet-field">
            <label>${commencedVal}</label>
            <input type="text" class="timesheet-input" placeholder="e.g. 17:12" value="${timeData.commenced}" oninput="updateTimeSheet('${id}', ${i}, 'commenced', this.value)">
          </div>
          <div class="timesheet-field">
            <label>${completedVal}</label>
            <input type="text" class="timesheet-input" placeholder="e.g. 19:36" value="${timeData.completed}" oninput="updateTimeSheet('${id}', ${i}, 'completed', this.value)">
          </div>
          <div class="timesheet-field remarks-field">
            <label>${remarksVal}</label>
            <input type="text" class="timesheet-input" placeholder="e.g. residues stripped" value="${timeData.remarks}" oninput="updateTimeSheet('${id}', ${i}, 'remarks', this.value)">
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  const safetyRaw = proc.safety_note;
  const safety = (lang === 'tr' && proc.safety_note_tr)
    ? proc.safety_note_tr
    : translateSafetyNote(safetyRaw, lang);
  
  const btnPrintVal = lang === 'tr' ? '🖨️ RAPORU YAZDIR' : (lang === 'es' ? '🖨️ IMPRIMIR RAPORTE' : (lang === 'el' ? '🖨️ ΕΚΤΥΠΩΣΗ' : (lang === 'ru' ? '🖨️ ПЕЧАТЬ ЛОГА' : (lang === 'zh' ? '🖨️ 打印日志' : '🖨️ PRINT LOG'))));

  let fallbackText = '';
  if (isFallback) {
    let siblingName = '—';
    if (fallbackSourceId && namesData[fallbackSourceId]) {
      siblingName = namesData[fallbackSourceId].display || namesData[fallbackSourceId].name || '—';
    }
    const tDict = T[lang] || T['en'];
    if (lang === 'tr') {
      fallbackText = `${tDict.lbl_fallback_badge || '⚠️ BENZER GRUP REFERANSI'} (${siblingName} ${tDict.lbl_derived_from || 'referansından türetilmiştir'})`;
    } else {
      fallbackText = `${tDict.lbl_fallback_badge || '⚠️ SIMILAR CARGO REFERENCE'} (${tDict.lbl_derived_from || 'Derived from'} ${siblingName})`;
    }
  }

  const safetyDetails = generateSafetyHeroDetails(proc.category || '', safety, tank.lastCargoId);
  const ppeTitle = lang === 'tr' ? '🛡️ KKD UYUMLULUĞU' : '🛡️ PPE COMPLIANCE';
  const isgottTitle = lang === 'tr' ? '⚓ ISGOTT GÜVENLİĞİ' : '⚓ ISGOTT SAFETY';
  const marpolTitle = lang === 'tr' ? '🌊 MARPOL ÇEVRE' : '🌊 MARPOL ENVIRONMENT';

  const ppePills = (safetyDetails.ppeStandards || []).map(s => `<span class="standard-pill">${s}</span>`).join('');
  const isgottPills = (safetyDetails.isgottStandards || []).map(s => `<span class="standard-pill">${s}</span>`).join('');
  const marpolPills = (safetyDetails.marpolStandards || []).map(s => `<span class="standard-pill">${s}</span>`).join('');

  const safetyHeroCardsHtml = `
    <div class="safety-hero-cards" style="margin-top: 16px;">
      <div class="hero-card kkd-card">
        <div>
          <div class="hero-card-title">${ppeTitle}</div>
          <div class="hero-card-content">${safetyDetails.ppeText}</div>
        </div>
        <div class="hero-card-standards">${ppePills}</div>
      </div>
      <div class="hero-card isgott-card">
        <div>
          <div class="hero-card-title">${isgottTitle}</div>
          <div class="hero-card-content">${safetyDetails.isgottText}</div>
        </div>
        <div class="hero-card-standards">${isgottPills}</div>
      </div>
      <div class="hero-card marpol-card">
        <div>
          <div class="hero-card-title">${marpolTitle}</div>
          <div class="hero-card-content">${safetyDetails.marpolText}</div>
        </div>
        <div class="hero-card-standards">${marpolPills}</div>
      </div>
    </div>
  `;

  card.innerHTML = `
    <div class="tank-prot-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div class="tank-prot-meta">
        <span class="tank-prot-tag">TANK ${id}</span>
        <span class="tank-prot-cargo-seq">${tank.lastCargoName} ➡️ ${tank.nextCargoName}</span>
        ${isFallback ? `<span class="fallback-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px; padding: 2px 6px; font-size: 0.6rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; vertical-align: middle;">${fallbackText}</span>` : ''}
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <span class="tank-prot-code" style="font-size: 0.65rem; color: var(--text3);">${code} (${title})</span>
        <button class="timesheet-print-btn" onclick="printTimeSheet('${id}')" style="background: rgba(37,99,235,0.12); color: var(--accent); border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; font-family: var(--mono); font-size: 0.65rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
          ${btnPrintVal}
        </button>
      </div>
    </div>
    
    <div class="intensity-row" style="margin-bottom: 16px; padding: 8px 12px;">
      <span class="intensity-label" style="font-size: 0.6rem;">WASH ESTIMATES:</span>
      <span class="intensity-level" style="font-size: 0.7rem; color: var(--accent);">
        💧 ${waterVol.toFixed(0)} m³ Water | ⛽ ${fuelMT.toFixed(2)} MT Fuel | ⏱️ ${parsed.totalHours.toFixed(1)} Hrs
      </span>
    </div>
    
    <div class="steps-container" style="margin-bottom: 16px;">
      ${stepsList}
    </div>
    
    <div class="safety-panel" style="padding: 16px; margin-bottom: 16px;">
      <div class="safety-icon" style="font-size: 1.2rem;">⚠️</div>
      <div class="safety-content">
        <div class="safety-title" style="font-size: 0.6rem;">SAFETY NOTES</div>
        <p class="safety-text" style="font-size: 0.8rem; color: #cc9988;">${safety}</p>
      </div>
    </div>

    ${safetyHeroCardsHtml}
  `;
  
  container.appendChild(card);
}

function appendWWTCard(id, tank) {
  const container = document.getElementById('wwt-certificates-container');
  if (!container) return;
  const card = document.createElement('div');
  card.className = 'wwt-cert-card';
  card.id = `wwt-cert-card-${id}`;
  
  const vName = document.getElementById('vessel-name').value || 'ASTRID SPIRIT';
  const vImo = document.getElementById('vessel-imo').value || '9876543';
  const vOff = document.getElementById('officer-name').value || 'C/O Ahmet Yilmaz';
  const dateStr = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : (lang === 'ru' ? 'ru-RU' : 'en-US'));
  
  const certT = {
    cert_title: { en: 'TANK CLEANLINESS CERTIFICATE', tr: 'TANK TEMİZLİK SERTİFİKASI', es: 'CERTIFICADO DE LIMPIEZA DE TANQUE', el: 'ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΚΑΘΑΡΟΤΗΤΑΣ ΔΕΞΑΜΕΝΗΣ', ru: 'СЕРТИФИКАТ ЧИСТОТЫ ТАНКА', zh: '储罐清洁度证书' },
    cert_sub: { en: 'ISSUED ACCORDING TO ISGOTT STANDARD VETTING', tr: 'ISGOTT STANDART VETTING PROTOKOLÜNE GÖRE DÜZENLENMİŞTİR', es: 'EMITIDO DE ACUERDO CON LA EVALUACIÓN ESTÁNDAR ISGOTT', el: 'ΕΚΔΟΘΗΚΕ ΣΥΜΦΩΝΑ ΜΕ ΤΟ ΠΡΟΤΥΠΟ ISGOTT', ru: 'ВЫДАНО В СООТВЕТСТВИИ СО СТАНДАРТОМ ПРОВЕРКИ ISGOTT', zh: '根据 ISGOTT 标准审查发布' },
    vessel: { en: 'VESSEL:', tr: 'GEMİ:', es: 'BUQUE:', el: 'ΠΛΟΙΟ:', ru: 'СУДНО:', zh: '船名:' },
    imo: { en: 'IMO NUMBER:', tr: 'IMO NUMARASI:', es: 'NÚMERO IMO:', el: 'ΑΡΙΘΜΟΣ IMO:', ru: 'НОМЕР ИМО:', zh: 'IMO 编号:' },
    hold: { en: 'CARGO HOLD:', tr: 'KARGO TANKI:', es: 'TANQUE DE CARGA:', el: 'ΔΕΞΑΜΕΝΗ ΦΟΡΤΙΟΥ:', ru: 'ГРУЗОВОЙ ТАНК:', zh: '货舱:' },
    date: { en: 'DATE ISSUED:', tr: 'DÜZENLENME TARİHİ:', es: 'FECHA DE EMISIÓN:', el: 'ΗΜΕΡΟΜΗΝΙΑ ΕΚΔΟΣΗΣ:', ru: 'ДАТА ВЫДАЧИ:', zh: '签发日期:' },
    last: { en: 'LAST CARGO:', tr: 'SON YÜK:', es: 'ÚLTIMA CARGA:', el: 'ΤΕΛΕΥΤΑΙΟ ΦΟΡΤΙΟ:', ru: 'ПОСЛЕДНИЙ ГРУЗ:', zh: '前度货物:' },
    next: { en: 'NEXT CARGO:', tr: 'SONRAKİ YÜK:', es: 'SIGUIENTE CARGA:', el: 'ΕΠΟΜΕΝΟ ΦΟΡΤΙΟ:', ru: 'СЛЕДУЮЩИЙ ГРУЗ:', zh: '拟载货物:' },
    hydro: { en: '🧪 Hydrocarbons Test:', tr: '🧪 Hidrokarbon Testi:', es: '🧪 Prueba de Hidrocarburos:', el: '🧪 Δοκιμή Υδρογονανθράκων:', ru: '🧪 Тест на углеводороды:', zh: '🧪 碳氢化合物测试:' },
    hydro_val: { en: 'PASSED (Water White)', tr: 'GEÇTİ (Su Beyazı)', es: 'APROBADO (Blanco Agua)', el: 'ΕΠΙΤΥΧΕΣ (Διαυγές)', ru: 'ПРОЙДЕНО (Прозрачный)', zh: '合格 (水白)' },
    chlor: { en: '🧂 Chlorides Test:', tr: '🧂 Klorür Testi:', es: '🧂 Prueba de Cloruros:', el: '🧂 Δοκιμή Χλωριδίων:', ru: '🧂 Тест на хлориды:', zh: '🧂 氯化物测试:' },
    chlor_val: { en: 'PASSED (< 5 ppm)', tr: 'GEÇTİ (< 5 ppm)', es: 'APROBADO (< 5 ppm)', el: 'ΕΠΙΤΥΧΕΣ (< 5 ppm)', ru: 'ПРОЙДЕНО (< 5 ppm)', zh: '合格 (< 5 ppm)' },
    perm: { en: '⏱️ Permanganate Test:', tr: '⏱️ Permanganat Testi:', es: '⏱️ Prueba de Permanganato:', el: '⏱️ Δοκιμή Υπερμαγγανικού:', ru: '⏱️ Перманганатный тест:', zh: '⏱️ 高锰酸钾时间测试:' },
    perm_val: { en: 'PASSED (> 30 Mins)', tr: 'GEÇTİ (> 30 Dk)', es: 'APROBADO (> 30 Mins)', el: 'ΕΠΙΤΥΧΕΣ (> 30 Λεπτά)', ru: 'ПРОЙДЕНО (> 30 мин)', zh: '合格 (> 30 分钟)' },
    ph: { en: '📈 pH Neutrality Check:', tr: '📈 pH Nötrlük Kontrolü:', es: '📈 Control de pH Neutro:', el: '📈 Έλεγχος Ουδετερότητας pH:', ru: '📈 Проверка нейтральности pH:', zh: '📈 pH 中性度检查:' },
    ph_val: { en: 'PASSED (6.5 - 7.5)', tr: 'GEÇTİ (6.5 - 7.5)', es: 'APROBADO (6.5 - 7.5)', el: 'ΕΠΙΤΥΧΕΣ (6.5 - 7.5)', ru: 'ПРОЙДЕНО (6.5 - 7.5)', zh: '合格 (6.5 - 7.5)' },
    officer: { en: 'Chief Officer (Deck Department)', tr: 'Baş Zabit (Güverte Departmanı)', es: 'Primer Oficial (Departamento de Cubierta)', el: 'Υποπλοίαρχος (Τμήμα Καταστρώματος)', ru: 'Старший помощник (Палубная команда)', zh: '大副 (甲板货运部)' },
    inspector: { en: 'Port Inspector / Surveyor', tr: 'Liman Enspektörü / Sörveyör', es: 'Inspector de Puerto / Surveyor', el: 'Επιθεωρητής Λιμένος / Πραγματογνώμονας', ru: 'Портовый инспектор / Сюрвейер', zh: '港口检验官 / 验舱师' },
    rep: { en: 'Independent Representative', tr: 'Bağımsız Temsilci', es: 'Representante Independiente', el: 'Ανεξάρτητος Εκπρόσωπος', ru: 'Независимый представитель', zh: '第三方独立代表' },
    print: { en: '🖨️ PRINT / SAVE AS PDF', tr: '🖨️ YAZDIR / PDF OLARAK KAYDET', es: '🖨️ IMPRIMIR / GUARDAR COMO PDF', el: '🖨️ ΕΚΤΥΠΩΣΗ / ΑΠΟΘΗΚΕΥΣΗ ΩΣ PDF', ru: '🖨️ ПЕЧАТЬ / СОХРАНИТЬ КАК PDF', zh: '🖨️ 打印 / 保存为 PDF' }
  };
  
  const getVal = (key) => (certT[key] && certT[key][lang]) ? certT[key][lang] : certT[key]['en'];
  
  card.innerHTML = `
    <div class="wwt-cert-header">
      <div class="wwt-cert-title">${getVal('cert_title')}</div>
      <div class="wwt-cert-subtitle">${getVal('cert_sub')}</div>
    </div>
    <div class="wwt-cert-grid">
      <span class="wwt-cert-lbl">${getVal('vessel')}</span><span class="wwt-cert-val">${vName.toUpperCase()}</span>
      <span class="wwt-cert-lbl">${getVal('imo')}</span><span class="wwt-cert-val">${vImo}</span>
      <span class="wwt-cert-lbl">${getVal('hold')}</span><span class="wwt-cert-val">TANK ${id}</span>
      <span class="wwt-cert-lbl">${getVal('date')}</span><span class="wwt-cert-val">${dateStr}</span>
      <span class="wwt-cert-lbl">${getVal('last')}</span><span class="wwt-cert-val">${tank.lastCargoName}</span>
      <span class="wwt-cert-lbl">${getVal('next')}</span><span class="wwt-cert-val">${tank.nextCargoName}</span>
    </div>
    <div class="wwt-cert-tests">
      <div class="wwt-cert-test-line"><span>${getVal('hydro')}</span><strong>${getVal('hydro_val')}</strong></div>
      <div class="wwt-cert-test-line"><span>${getVal('chlor')}</span><strong>${getVal('chlor_val')}</strong></div>
      <div class="wwt-cert-test-line"><span>${getVal('perm')}</span><strong>${getVal('perm_val')}</strong></div>
      <div class="wwt-cert-test-line"><span>${getVal('ph')}</span><strong>${getVal('ph_val')}</strong></div>
    </div>
    <div class="wwt-cert-signatures">
      <div>
        <div style="height: 30px;"></div>
        <div class="wwt-cert-sig-line">${getVal('officer')}</div>
        <div style="font-weight: bold; margin-top: 4px;">${vOff}</div>
      </div>
      <div>
        <div style="height: 30px;"></div>
        <div class="wwt-cert-sig-line">${getVal('inspector')}</div>
        <div style="font-weight: bold; margin-top: 4px;">${getVal('rep')}</div>
      </div>
    </div>
    <div class="cert-actions" style="margin-top: 20px; text-align: center;">
      <button class="cert-print-btn" onclick="printSingleCertificate('${id}')" style="background: #111; color: #fff; border: 1px solid #111; border-radius: 4px; padding: 8px 16px; font-family: 'Space Mono', monospace; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
        ${getVal('print')}
      </button>
    </div>
  `;
  
  container.appendChild(card);
}

// ---- STATE PERSISTENCE ----
function applyDefaultPresetOnLoad() {
  loadSettingsState();
  const savedLayout = localStorage.getItem('ats_vessel_layout');
  const savedTanks = localStorage.getItem('ats_vessel_tanks');
  
  if (savedLayout && savedTanks) {
    try {
      vesselLayout = JSON.parse(savedLayout);
      vesselTanks = JSON.parse(savedTanks);
      
      const selectPreset = document.getElementById('vessel-preset');
      if (selectPreset) selectPreset.value = vesselLayout.preset || 'custom';
      
      if (vesselLayout.preset === 'custom') {
        const customFields = document.getElementById('custom-builder-fields');
        if (customFields) customFields.classList.remove('hidden');
        document.getElementById('custom-rows').value = vesselLayout.rows;
      }
      
      const chkSlops = document.getElementById('vessel-include-slops');
      if (chkSlops) {
        chkSlops.checked = !!vesselLayout.includeSlops;
      }
      
      // Make sure rowsData exists in new format
      if (vesselLayout.rowsData && vesselLayout.rowsData.length > 0) {
        const first = vesselLayout.rowsData[0];
        if (first.row !== 'Slop' && first.P !== undefined) {
          // Upgrade old P/C/S structure to P_num/C_num/S_num
          vesselLayout.rowsData = vesselLayout.rowsData.map(item => {
            if (item.row === 'Slop') return item;
            return {
              row: item.row,
              P_num: item.P ? item.row : null,
              C_num: item.C ? item.row : null,
              S_num: item.S ? item.row : null
            };
          });
        }
      } else {
        vesselLayout.rowsData = [];
        for (let r = 1; r <= vesselLayout.rows; r++) {
          vesselLayout.rowsData.push({
            row: r,
            P_num: vesselTanks[r + 'P'] ? r : null,
            C_num: vesselTanks[r + 'C'] ? r : null,
            S_num: vesselTanks[r + 'S'] ? r : null
          });
        }
        if (vesselLayout.includeSlops) {
          vesselLayout.rowsData.push({
            row: 'Slop',
            P: !!vesselTanks['SlopP'],
            C: !!vesselTanks['SlopC'],
            S: !!vesselTanks['SlopS'],
            isSlop: true
          });
        }
      }
      
      renderRowConfigInputs();
      buildAdjacencyGraph();
      renderVesselGrid();
      checkFleetReactivity();
      return;
    } catch (e) {
      // Fallback
    }
  }
  
  // Fallback defaults if no localStorage exists
  const initialRows = isDemoUser ? 4 : 16;
  const initialPreset = isDemoUser ? 'preset-18' : 'preset-32';
  
  vesselLayout = {
    rows: initialRows,
    preset: initialPreset,
    includeSlops: !isDemoUser,
    rowsData: []
  };
  for (let r = 1; r <= initialRows; r++) {
    vesselLayout.rowsData.push({ row: r, P_num: r, C_num: null, S_num: r });
  }
  if (!isDemoUser) {
    vesselLayout.rowsData.push({ row: 'Slop', P: true, C: false, S: true, isSlop: true });
  }
  
  const selectPreset = document.getElementById('vessel-preset');
  if (selectPreset) selectPreset.value = initialPreset;
  
  const chkSlops = document.getElementById('vessel-include-slops');
  if (chkSlops) chkSlops.checked = !isDemoUser;
  
  renderRowConfigInputs();
  rebuildVesselFromConfigs();
}

function saveVesselState() {
  localStorage.setItem('ats_vessel_layout', JSON.stringify(vesselLayout));
  localStorage.setItem('ats_vessel_tanks', JSON.stringify(vesselTanks));
}

function saveSettingsState() {
  const settings = {
    vesselName: document.getElementById('vessel-name')?.value || '',
    vesselImo: document.getElementById('vessel-imo')?.value || '',
    officerName: document.getElementById('officer-name')?.value || '',
    companyLogo: document.getElementById('company-logo')?.value || '',
    coeffFuel: document.getElementById('coeff-fuel')?.value || '',
    coeffSlop: document.getElementById('coeff-slop')?.value || '',
    coeffFw: document.getElementById('coeff-fw')?.value || '',
    coeffDetergent: document.getElementById('coeff-detergent')?.value || '',
    coeffFlow: document.getElementById('coeff-flow')?.value || '',
    coeffEff: document.getElementById('coeff-eff')?.value || '',
    coeffTemp: document.getElementById('coeff-temp')?.value || '',
    coeffSeaTemp: document.getElementById('coeff-sea-temp')?.value || ''
  };
  localStorage.setItem('ats_settings', JSON.stringify(settings));
}

function loadSettingsState() {
  const savedSettings = localStorage.getItem('ats_settings');
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      if (settings.vesselName !== undefined && document.getElementById('vessel-name')) document.getElementById('vessel-name').value = settings.vesselName;
      if (settings.vesselImo !== undefined && document.getElementById('vessel-imo')) document.getElementById('vessel-imo').value = settings.vesselImo;
      if (settings.officerName !== undefined && document.getElementById('officer-name')) document.getElementById('officer-name').value = settings.officerName;
      if (settings.companyLogo !== undefined && document.getElementById('company-logo')) document.getElementById('company-logo').value = settings.companyLogo;
      if (settings.coeffFuel !== undefined && document.getElementById('coeff-fuel')) document.getElementById('coeff-fuel').value = settings.coeffFuel;
      if (settings.coeffSlop !== undefined && document.getElementById('coeff-slop')) document.getElementById('coeff-slop').value = settings.coeffSlop;
      if (settings.coeffFw !== undefined && document.getElementById('coeff-fw')) document.getElementById('coeff-fw').value = settings.coeffFw;
      if (settings.coeffDetergent !== undefined && document.getElementById('coeff-detergent')) document.getElementById('coeff-detergent').value = settings.coeffDetergent;
      if (settings.coeffFlow !== undefined && document.getElementById('coeff-flow')) document.getElementById('coeff-flow').value = settings.coeffFlow;
      if (settings.coeffEff !== undefined && document.getElementById('coeff-eff')) document.getElementById('coeff-eff').value = settings.coeffEff;
      if (settings.coeffTemp !== undefined && document.getElementById('coeff-temp')) document.getElementById('coeff-temp').value = settings.coeffTemp;
      if (settings.coeffSeaTemp !== undefined && document.getElementById('coeff-sea-temp')) document.getElementById('coeff-sea-temp').value = settings.coeffSeaTemp;
    } catch (e) {
      console.error("Error loading settings state", e);
    }
  }
}

// ---- UTILITIES ----
function showError(msg) {
  const el = document.getElementById('error-msg');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideError() {
  const el = document.getElementById('error-msg');
  if (el) el.classList.add('hidden');
}

// ---- DASHBOARD ACTIONS ----
function switchDashboardTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const pane = document.getElementById(tabId);
  if (pane) pane.classList.remove('hidden');
  
  const btn = document.getElementById('btn-' + tabId);
  if (btn) btn.classList.add('active');

  if (tabId === 'tab-eco') {
    applyProtocolFilters();
  }

  // Reset scroll position of the panel contents to top
  const tabContents = document.querySelector('.tab-contents');
  if (tabContents) {
    tabContents.scrollTop = 0;
  }

  // Smooth scroll window to top for smaller screen responsiveness
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function printSingleCertificate(tankId) {
  const style = document.createElement('style');
  style.id = 'print-single-cert-style';
  style.innerHTML = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #wwt-cert-card-${tankId}, #wwt-cert-card-${tankId} * {
        visibility: visible !important;
      }
      #wwt-cert-card-${tankId} {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        border: 2px solid #000 !important;
        box-shadow: none !important;
        background: #fff !important;
        color: #000 !important;
        padding: 30px !important;
        break-inside: avoid !important;
      }
      #wwt-cert-card-${tankId} .cert-print-btn {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
  window.print();
  setTimeout(() => {
    style.remove();
  }, 1000);
}

// ---- DISCLAIMER MODAL ----
function showDisclaimerModal() {
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const confirmBtn = document.getElementById('modal-confirm-btn');
  
  const t = T[lang] || T['en'];
  if (title) title.textContent = t.modal_title || 'PROFESSIONAL DISCLAIMER';
  if (body) body.innerHTML = t.modal_body || '';
  if (cancelBtn) cancelBtn.textContent = t.modal_cancel || 'CANCEL';
  if (confirmBtn) confirmBtn.textContent = t.modal_confirm || 'I UNDERSTAND & ACCEPT';
  
  if (overlay) overlay.classList.remove('hidden');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function confirmAndRun() {
  disclaimerAccepted = true;
  closeModal();
  calculateFleetProtocols();
}

// ---- TIME SHEET ACTIONS ----
function updateTimeSheet(tankId, stepIndex, field, value) {
  if (!vesselTanks[tankId]) return;
  if (!vesselTanks[tankId].timeSheet) {
    vesselTanks[tankId].timeSheet = {};
  }
  if (!vesselTanks[tankId].timeSheet[stepIndex]) {
    vesselTanks[tankId].timeSheet[stepIndex] = { commenced: '', completed: '', remarks: '' };
  }
  vesselTanks[tankId].timeSheet[stepIndex][field] = value;
  saveVesselState();
}

function printTimeSheet(tankId) {
  const tank = vesselTanks[tankId];
  if (!tank) return;
  
  const vName = document.getElementById('vessel-name').value || 'ASTRID SPIRIT';
  const vImo = document.getElementById('vessel-imo').value || '9876543';
  const vOff = document.getElementById('officer-name').value || 'C/O Ahmet Yilmaz';
  const dateStr = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : (lang === 'ru' ? 'ru-RU' : 'en-US'));

  const key = `${tank.lastCargoId}_${tank.nextCargoId}`;
  const protocolCode = matrixData[key] || 'N/A';
  let proc = proceduresData[protocolCode];
  if (!proc) {
    proc = { instructions: 'No protocol available.', safety_note: '' };
  }
  
  const rawInstructions = proc.instructions;
  const translatedInst = (lang === 'tr' && proc.instructions_tr)
    ? proc.instructions_tr
    : translateProcedureText(rawInstructions, lang);
  
  const printContainer = document.createElement('div');
  printContainer.id = 'print-timesheet-container';
  
  const stepLines = translatedInst.split(/\n/).filter(s => s.trim());
  const stepsRowsHtml = stepLines.map((stepLine, i) => {
    const cleanLine = stepLine.replace(/^(STEP|ADIM|PASO|ΒΗΜΑ|ШАГ|步骤)\s*\d+:\s*/i, '').trim();
    const numMatch = stepLine.match(/^(STEP|ADIM|PASO|ΒΗΜΑ|ШАГ|步骤)\s*(\d+)/i);
    const stepNum = numMatch ? numMatch[2] : String(i+1);
    const stepPrefix = T[lang].step_prefix || 'STEP';
    
    const timeData = (tank.timeSheet && tank.timeSheet[i]) || { commenced: '', completed: '', remarks: '' };
    
    return `
      <tr>
        <td style="border: 1px solid #222; padding: 10px; font-weight: bold; width: 90px; text-align: center; font-family: monospace;">${stepPrefix} ${stepNum}</td>
        <td style="border: 1px solid #222; padding: 10px; text-align: left;">${cleanLine}</td>
        <td style="border: 1px solid #222; padding: 10px; text-align: center; font-family: monospace; width: 110px;">${timeData.commenced || '-'}</td>
        <td style="border: 1px solid #222; padding: 10px; text-align: center; font-family: monospace; width: 110px;">${timeData.completed || '-'}</td>
        <td style="border: 1px solid #222; padding: 10px; text-align: left; min-width: 150px;">${timeData.remarks || '-'}</td>
      </tr>
    `;
  }).join('');

  const titleText = lang === 'tr' ? 'TANK YIKAMA ZAMAN RAPORU (TIME SHEET)' : 'TANK CLEANING TIME SHEET & LOG';
  const vesselLabel = lang === 'tr' ? 'GEMİ ADI:' : 'VESSEL NAME:';
  const imoLabel = lang === 'tr' ? 'IMO NUMARASI:' : 'IMO NUMBER:';
  const holdLabel = lang === 'tr' ? 'KARGO TANKI:' : 'CARGO HOLD:';
  const transitionLabel = lang === 'tr' ? 'YÜK GEÇİŞİ:' : 'CARGO TRANSITION:';
  const dateLabel = lang === 'tr' ? 'TARİH:' : 'DATE:';
  
  const stepCol = lang === 'tr' ? 'İŞLEM ADIMI' : 'STEP';
  const descCol = lang === 'tr' ? 'YIKAMA TALİMATI / AÇIKLAMA' : 'PROCEDURE / DESCRIPTION';
  const startCol = lang === 'tr' ? 'BAŞLANGIÇ' : 'COMMENCED';
  const endCol = lang === 'tr' ? 'BİTİŞ' : 'COMPLETED';
  const remarksCol = lang === 'tr' ? 'NOTLAR / AÇIKLAMALAR' : 'REMARKS';

  const officerLabel = lang === 'tr' ? 'BAŞ ZABİT İMZASI' : 'CHIEF OFFICER SIGNATURE';
  const inspectorLabel = lang === 'tr' ? 'SURVEYÖR İMZASI' : 'INSPECTOR / SURVEYOR SIGNATURE';

  printContainer.innerHTML = `
    <div style="font-family: Arial, sans-serif; color: #000; padding: 30px; background: #fff; max-width: 800px; margin: 0 auto; line-height: 1.4;">
      <div style="text-align: center; border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 1.4rem; letter-spacing: 1px; font-weight: 800;">${titleText}</h2>
        <p style="margin: 4px 0 0 0; font-size: 0.8rem; font-weight: bold; color: #555; text-transform: uppercase;">ASTRID ATS v2.0 PRO — TIME LOGGER REPORT</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 0.85rem;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px;">${vesselLabel}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #ddd;">${vName.toUpperCase()}</td>
          <td style="padding: 6px 0; font-weight: bold; width: 100px; padding-left: 20px;">${dateLabel}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #ddd; width: 150px;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">${imoLabel}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #ddd;">${vImo}</td>
          <td style="padding: 6px 0; font-weight: bold; padding-left: 20px;">${holdLabel}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #ddd; font-weight: bold;">TANK ${tankId}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">${transitionLabel}</td>
          <td colspan="3" style="padding: 6px 0; border-bottom: 1px solid #ddd;"><strong>${tank.lastCargoName}</strong> ➔ <strong>${tank.nextCargoName}</strong></td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 40px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="border: 1px solid #222; padding: 10px; text-align: center; font-weight: bold;">${stepCol}</th>
            <th style="border: 1px solid #222; padding: 10px; text-align: left; font-weight: bold;">${descCol}</th>
            <th style="border: 1px solid #222; padding: 10px; text-align: center; font-weight: bold;">${startCol}</th>
            <th style="border: 1px solid #222; padding: 10px; text-align: center; font-weight: bold;">${endCol}</th>
            <th style="border: 1px solid #222; padding: 10px; text-align: left; font-weight: bold;">${remarksCol}</th>
          </tr>
        </thead>
        <tbody>
          ${stepsRowsHtml}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; margin-top: 60px; font-size: 0.85rem;">
        <div style="width: 45%; text-align: center;">
          <div style="height: 40px;"></div>
          <div style="border-top: 1px solid #000; padding-top: 6px; font-weight: bold;">${officerLabel}</div>
          <div style="font-size: 0.8rem; margin-top: 4px; color: #333;">${vOff}</div>
        </div>
        <div style="width: 45%; text-align: center;">
          <div style="height: 40px;"></div>
          <div style="border-top: 1px solid #000; padding-top: 6px; font-weight: bold;">${inspectorLabel}</div>
          <div style="font-size: 0.8rem; margin-top: 4px; color: #777;">Surveyor / Port Inspector</div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(printContainer);
  
  const style = document.createElement('style');
  style.id = 'print-timesheet-style';
  style.innerHTML = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #print-timesheet-container, #print-timesheet-container * {
        visibility: visible !important;
      }
      #print-timesheet-container {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        background: #fff !important;
      }
    }
  `;
  document.head.appendChild(style);
  
  window.print();
  
  // Cleanup
  setTimeout(() => {
    const styleEl = document.getElementById('print-timesheet-style');
    if (styleEl) styleEl.remove();
    printContainer.remove();
  }, 1000);
}