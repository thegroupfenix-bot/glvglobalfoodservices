/**
 * GLV Global Food Services — i18n Engine
 * Supports: es | en | pt | ar | zh
 *
 * Usage on existing pages (span-based):
 *   setLang('pt')  → applies body.lang-pt class; CSS shows [lang-pt] spans
 *
 * Usage on new pages (data-i18n):
 *   <h1 data-i18n="portal.title">Portal de Clientes</h1>
 *   GLV.i18n.apply('pt')
 *
 * Scalable for Portal Clientes, Portal Proveedores, SAT/ERP frontends.
 */

(function (global) {
  'use strict';

  const SUPPORTED = ['es', 'en', 'pt', 'ar', 'zh'];
  const DEFAULT_LANG = 'es';
  const STORAGE_KEY = 'glv-lang';
  const RTL_LANGS = ['ar'];

  /* ── Embedded translations (mirror of i18n/*.json) ──────────────────────── */
  const TRANSLATIONS = {
    es: {
      nav: { portal: 'Portal Clientes', quote: 'Cotizar', home: 'Inicio' },
      hero: { eyebrow: 'Distribución & Importación de Alimentos · Miami, Florida', cta_primary: 'Solicitar Cotización', cta_secondary: 'Ver Servicios →' },
      stats: { fcl: 'FCL Distribuidos', entities: 'Entidades Globales', countries: 'Países Destino', ops: 'Operaciones' },
      about: { eyebrow: 'Sobre Nosotros · Miami, Florida', title: 'Miami. El Hub que conecta mundos.', cta: 'Iniciar Operación →' },
      holding: { eyebrow: 'Estructura Corporativa' },
      services: { eyebrow: '6 Líneas de Negocio', title: 'Un canal USA. Seis plataformas.', lines: { 1: { title: 'Huevo & Proteínas', link: 'Ver Línea I' }, 2: { title: 'Coco & Aceites', link: 'Ver Línea II' }, 3: { title: 'Granos & Cereales', link: 'Ver Línea III' }, 4: { title: 'Animales Vivos & Cortes', link: 'Ver Línea IV' }, 5: { title: 'Frutas Tropicales', link: 'Ver Línea V' }, 6: { title: 'Comercio Internacional', link: 'Ver Línea VI' } } },
      markets: { eyebrow: 'Mercados Destino · Desde Miami', title: 'Compradores serios en todo el mundo' },
      process: { eyebrow: 'Proceso Operativo · Miami Hub', title: 'Proceso de principio a fin' },
      form: { eyebrow: 'Cotización Rápida · Miami', title: 'Cotice con nosotros hoy', subtitle: 'Respondemos en menos de 24 horas. Solo compradores serios con capacidad de FCL.', name: 'Nombre completo *', company: 'Empresa · País *', product: 'Producto de interés *', destination: 'Destino *', volume: 'Volumen requerido', incoterm: 'Incoterm preferido', payment: 'Método de pago', message: 'Mensaje adicional', btn_email: 'Enviar por Email', btn_pdf: 'Descargar Cotización de Referencia (PDF)', success: 'Mensaje enviado. Nos comunicamos en menos de 24 horas.', sending: 'Enviando solicitud...' },
      contact: { office: 'Oficina Principal', holding: 'Parte del Holding' },
      footer: { products: 'Productos', contact: 'Contacto & Operaciones', tagline: 'Canal USA del GLV Global Holding.', rights: 'Todos los derechos reservados.' },
      portal: { badge: 'Próximamente', title: 'Portal de Clientes', desc: 'Estamos construyendo una plataforma exclusiva para clientes de GLV Global Food Services LLC.', notify: '¿Desea ser notificado cuando el portal esté disponible?', cta: 'Contáctenos ahora →', features: { register: { title: 'Registro de Clientes', desc: 'Alta segura de empresas importadoras y distribuidoras con verificación' }, kyc: { title: 'KYC / Due Diligence', desc: 'Proceso de conocimiento del cliente con cumplimiento regulatorio internacional' }, docs: { title: 'Seguimiento Documental', desc: 'Estado en tiempo real de certificados, BL, facturas y permisos sanitarios' }, quotes: { title: 'Cotizaciones en Línea', desc: 'Solicite y reciba cotizaciones formales con historial y comparativas' }, download: { title: 'Descarga de Documentos', desc: 'Acceso seguro a documentos de exportación, certificados USDA/FDA y contratos' } } }
    },
    en: {
      nav: { portal: 'Client Portal', quote: 'Get Quote', home: 'Home' },
      hero: { eyebrow: 'Food Distribution & Import · Miami, Florida', cta_primary: 'Request a Quote', cta_secondary: 'Our Services →' },
      stats: { fcl: 'FCL Distributed', entities: 'Global Entities', countries: 'Destination Countries', ops: 'Operations' },
      about: { eyebrow: 'About Us · Miami, Florida', title: 'Miami. The Hub that connects worlds.', cta: 'Start an Operation →' },
      holding: { eyebrow: 'Corporate Structure' },
      services: { eyebrow: '6 Business Lines', title: 'One USA channel. Six platforms.', lines: { 1: { title: 'Eggs & Proteins', link: 'View Line I' }, 2: { title: 'Coconut & Oils', link: 'View Line II' }, 3: { title: 'Grains & Cereals', link: 'View Line III' }, 4: { title: 'Live Animals & Cuts', link: 'View Line IV' }, 5: { title: 'Tropical Fruits', link: 'View Line V' }, 6: { title: 'International Trade', link: 'View Line VI' } } },
      markets: { eyebrow: 'Target Markets · From Miami', title: 'Serious buyers worldwide' },
      process: { eyebrow: 'Operations Process · Miami Hub', title: 'Process end to end' },
      form: { eyebrow: 'Quick Quote · Miami', title: 'Get a quote today', subtitle: 'We respond in less than 24 hours. Serious buyers with FCL capacity only.', name: 'Full Name *', company: 'Company · Country *', product: 'Product of interest *', destination: 'Destination *', volume: 'Required Volume', incoterm: 'Preferred Incoterm', payment: 'Payment Method', message: 'Additional message', btn_email: 'Send by Email', btn_pdf: 'Download Reference Quote (PDF)', success: "Message sent. We'll get back to you within 24 hours.", sending: 'Sending request...' },
      contact: { office: 'Main Office', holding: 'Part of Holding' },
      footer: { products: 'Products', contact: 'Contact & Operations', tagline: 'USA channel of GLV Global Holding.', rights: 'All rights reserved.' },
      portal: { badge: 'Coming Soon', title: 'Client Portal', desc: 'We are building an exclusive platform for GLV Global Food Services LLC clients.', notify: 'Would you like to be notified when the portal is available?', cta: 'Contact us now →', features: { register: { title: 'Client Registration', desc: 'Secure onboarding for importing companies and distributors with verification' }, kyc: { title: 'KYC / Due Diligence', desc: 'Client verification process with international regulatory compliance' }, docs: { title: 'Document Tracking', desc: 'Real-time status of certificates, BL, invoices and sanitary permits' }, quotes: { title: 'Online Quotes', desc: 'Request and receive formal quotes with history and comparisons' }, download: { title: 'Document Download', desc: 'Secure access to export documents, USDA/FDA certificates and contracts' } } }
    },
    pt: {
      nav: { portal: 'Portal de Clientes', quote: 'Cotar', home: 'Início' },
      hero: { eyebrow: 'Distribuição & Importação de Alimentos · Miami, Flórida', cta_primary: 'Solicitar Cotação', cta_secondary: 'Nossos Serviços →' },
      stats: { fcl: 'FCL Distribuídos', entities: 'Entidades Globais', countries: 'Países de Destino', ops: 'Operações' },
      about: { eyebrow: 'Sobre Nós · Miami, Flórida', title: 'Miami. O Hub que conecta mundos.', cta: 'Iniciar Operação →' },
      holding: { eyebrow: 'Estrutura Corporativa' },
      services: { eyebrow: '6 Linhas de Negócio', title: 'Um canal EUA. Seis plataformas.', lines: { 1: { title: 'Ovos & Proteínas', link: 'Ver Linha I' }, 2: { title: 'Coco & Óleos', link: 'Ver Linha II' }, 3: { title: 'Grãos & Cereais', link: 'Ver Linha III' }, 4: { title: 'Animais Vivos & Cortes', link: 'Ver Linha IV' }, 5: { title: 'Frutas Tropicais', link: 'Ver Linha V' }, 6: { title: 'Comércio Internacional', link: 'Ver Linha VI' } } },
      markets: { eyebrow: 'Mercados de Destino · A partir de Miami', title: 'Compradores sérios em todo o mundo' },
      process: { eyebrow: 'Processo Operacional · Hub Miami', title: 'Processo de ponta a ponta' },
      form: { eyebrow: 'Cotação Rápida · Miami', title: 'Cotar com a gente hoje', subtitle: 'Respondemos em menos de 24 horas. Somente compradores sérios com capacidade de FCL.', name: 'Nome completo *', company: 'Empresa · País *', product: 'Produto de interesse *', destination: 'Destino *', volume: 'Volume necessário', incoterm: 'Incoterm preferido', payment: 'Método de pagamento', message: 'Mensagem adicional', btn_email: 'Enviar por E-mail', btn_pdf: 'Baixar Cotação de Referência (PDF)', success: 'Mensagem enviada. Entraremos em contato em menos de 24 horas.', sending: 'Enviando solicitação...' },
      contact: { office: 'Escritório Principal', holding: 'Parte do Holding' },
      footer: { products: 'Produtos', contact: 'Contato & Operações', tagline: 'Canal EUA do GLV Global Holding. Distribuição e importação de alimentos certificados de Miami, Flórida.', rights: 'Todos os direitos reservados.' },
      portal: { badge: 'Em Breve', title: 'Portal de Clientes', desc: 'Estamos construindo uma plataforma exclusiva para os clientes da GLV Global Food Services LLC. Gerencie suas operações de importação em um só lugar.', notify: 'Deseja ser notificado quando o portal estiver disponível?', cta: 'Entre em contato agora →', features: { register: { title: 'Cadastro de Clientes', desc: 'Cadastro seguro de empresas importadoras e distribuidoras com verificação' }, kyc: { title: 'KYC / Due Diligence', desc: 'Processo de verificação do cliente com conformidade regulatória internacional' }, docs: { title: 'Acompanhamento Documental', desc: 'Status em tempo real de certificados, BL, faturas e licenças sanitárias' }, quotes: { title: 'Cotações Online', desc: 'Solicite e receba cotações formais com histórico e comparativos' }, download: { title: 'Download de Documentos', desc: 'Acesso seguro a documentos de exportação, certificados USDA/FDA e contratos' } } }
    },
    ar: {
      nav: { portal: 'بوابة العملاء', quote: 'اطلب عرضاً', home: 'الرئيسية' },
      hero: { eyebrow: 'توزيع واستيراد الأغذية · ميامي، فلوريدا', cta_primary: 'طلب عرض سعر', cta_secondary: '← خدماتنا' },
      stats: { fcl: 'حاوية موزعة', entities: 'كيانات عالمية', countries: 'دول وجهة', ops: 'عمليات' },
      about: { eyebrow: 'عنّا · ميامي، فلوريدا', title: 'ميامي. المحور الذي يربط العالم.', cta: '← ابدأ عملية' },
      holding: { eyebrow: 'الهيكل المؤسسي' },
      services: { eyebrow: '٦ خطوط أعمال', title: 'قناة أمريكية واحدة. ست منصات.', lines: { 1: { title: 'البيض والبروتينات', link: 'الخط الأول' }, 2: { title: 'جوز الهند والزيوت', link: 'الخط الثاني' }, 3: { title: 'الحبوب والحبوب الكاملة', link: 'الخط الثالث' }, 4: { title: 'الحيوانات الحية وقطع اللحوم', link: 'الخط الرابع' }, 5: { title: 'الفواكه الاستوائية', link: 'الخط الخامس' }, 6: { title: 'التجارة الدولية', link: 'الخط السادس' } } },
      markets: { eyebrow: 'الأسواق المستهدفة · من ميامي', title: 'مشترون جادون في جميع أنحاء العالم' },
      process: { eyebrow: 'العملية التشغيلية · مركز ميامي', title: 'العملية من البداية إلى النهاية' },
      form: { eyebrow: 'عرض سعر سريع · ميامي', title: 'احصل على عرض سعر اليوم', subtitle: 'نرد في أقل من 24 ساعة. المشترون الجادون فقط.', name: 'الاسم الكامل *', company: 'الشركة · البلد *', product: 'المنتج المطلوب *', destination: 'الوجهة *', volume: 'الكمية المطلوبة', incoterm: 'الإنكوترم المفضل', payment: 'طريقة الدفع', message: 'رسالة إضافية', btn_email: 'إرسال بالبريد', btn_pdf: 'تحميل عرض السعر المرجعي (PDF)', success: 'تم إرسال الرسالة. سنرد في أقل من 24 ساعة.', sending: 'جارٍ الإرسال...' },
      contact: { office: 'المكتب الرئيسي', holding: 'جزء من المجموعة' },
      footer: { products: 'المنتجات', contact: 'الاتصال والعمليات', tagline: 'الذراع الأمريكية لمجموعة GLV القابضة.', rights: 'جميع الحقوق محفوظة.' },
      portal: { badge: 'قريباً', title: 'بوابة العملاء', desc: 'نبني منصة حصرية لعملاء GLV Global Food Services LLC.', notify: 'هل تريد أن يتم إخطارك عند توفر البوابة؟', cta: 'اتصل بنا الآن ←', features: { register: { title: 'تسجيل العملاء', desc: 'تسجيل آمن لشركات الاستيراد والتوزيع مع التحقق' }, kyc: { title: 'KYC / العناية الواجبة', desc: 'عملية التحقق من العميل مع الامتثال التنظيمي الدولي' }, docs: { title: 'تتبع الوثائق', desc: 'الحالة في الوقت الفعلي للشهادات والبوالص والفواتير' }, quotes: { title: 'عروض الأسعار عبر الإنترنت', desc: 'طلب واستلام عروض أسعار رسمية مع السجل والمقارنات' }, download: { title: 'تحميل الوثائق', desc: 'وصول آمن إلى وثائق التصدير وشهادات USDA/FDA' } } }
    },
    zh: {
      nav: { portal: '客户门户', quote: '获取报价', home: '首页' },
      hero: { eyebrow: '食品配送与进口 · 迈阿密，佛罗里达', cta_primary: '请求报价', cta_secondary: '我们的服务 →' },
      stats: { fcl: '已分发集装箱', entities: '全球实体', countries: '目的地国家', ops: '全天候运营' },
      about: { eyebrow: '关于我们 · 迈阿密，佛罗里达', title: '迈阿密。连接世界的枢纽。', cta: '开始业务 →' },
      holding: { eyebrow: '公司架构' },
      services: { eyebrow: '6条业务线', title: '一个美国渠道。六个平台。', lines: { 1: { title: '鸡蛋与蛋白质', link: '查看业务线 I' }, 2: { title: '椰子与油脂', link: '查看业务线 II' }, 3: { title: '谷物与粮食', link: '查看业务线 III' }, 4: { title: '活体动物与肉类切割', link: '查看业务线 IV' }, 5: { title: '热带水果', link: '查看业务线 V' }, 6: { title: '国际贸易', link: '查看业务线 VI' } } },
      markets: { eyebrow: '目标市场 · 从迈阿密出发', title: '全球各地的认真买家' },
      process: { eyebrow: '运营流程 · 迈阿密中心', title: '从头到尾的全流程' },
      form: { eyebrow: '快速报价 · 迈阿密', title: '今天获取报价', subtitle: '24小时内回复。仅限有FCL采购能力的认真买家。', name: '姓名 *', company: '公司 · 国家 *', product: '感兴趣的产品 *', destination: '目的地 *', volume: '所需数量', incoterm: '首选国际贸易术语', payment: '付款方式', message: '附加信息', btn_email: '发送邮件', btn_pdf: '下载参考报价单 (PDF)', success: '消息已发送。我们将在24小时内回复您。', sending: '正在发送...' },
      contact: { office: '总部', holding: '集团成员' },
      footer: { products: '产品', contact: '联系与运营', tagline: 'GLV全球控股集团美国渠道。', rights: '保留所有权利。' },
      portal: { badge: '即将推出', title: '客户门户', desc: '我们正在为GLV Global Food Services LLC客户构建专属平台。', notify: '您希望在门户上线时收到通知吗？', cta: '立即联系我们 →', features: { register: { title: '客户注册', desc: '进口企业和分销商的安全注册与验证' }, kyc: { title: 'KYC / 尽职调查', desc: '符合国际监管要求的客户验证流程' }, docs: { title: '文件跟踪', desc: '证书、提单、发票和卫生许可的实时状态' }, quotes: { title: '在线报价', desc: '申请并接收正式报价，含历史记录和比较' }, download: { title: '文件下载', desc: '安全访问出口文件、USDA/FDA证书和合同' } } }
    }
  };

  /* ── Deep key resolver: get('portal.features.kyc.title', 'pt') ─────────── */
  function get(key, lang) {
    lang = lang || currentLang();
    var t = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];
    return key.split('.').reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : null;
    }, t);
  }

  function currentLang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  /* ── Apply to [data-i18n] elements (new pages: Portal Clientes, etc.) ──── */
  function applyDataI18n(lang) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = get(key, lang);
      if (val !== null) {
        if (el.children.length === 0) {
          el.textContent = val;
        } else {
          el.innerHTML = val;
        }
      }
    });

    /* HTML lang + dir attribute */
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  }

  /* ── Main setLang function (used by existing pages too) ─────────────────── */
  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;

    /* Body class for CSS span system (existing pages) */
    var body = document.body;
    body.className = body.className
      .split(' ')
      .filter(function (c) { return c.indexOf('lang-') !== 0; })
      .join(' ');
    body.classList.add('lang-' + lang);

    /* RTL */
    document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;

    /* Active button highlight */
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.classList.remove('active');
      var t = b.textContent.trim();
      if (
        (lang === 'es' && t === 'ES') ||
        (lang === 'en' && t === 'EN') ||
        (lang === 'pt' && t === 'PT') ||
        (lang === 'ar' && (t === 'عربي' || b.textContent.includes('عربي'))) ||
        (lang === 'zh' && (t === '中文' || b.textContent.includes('中文')))
      ) {
        b.classList.add('active');
      }
    });

    /* data-i18n elements (new pages) */
    applyDataI18n(lang);

    localStorage.setItem(STORAGE_KEY, lang);
  }

  /* ── Auto-restore on page load ──────────────────────────────────────────── */
  function init() {
    var saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    setLang(saved);
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */
  global.GLV = global.GLV || {};
  global.GLV.i18n = { get: get, apply: applyDataI18n, currentLang: currentLang, TRANSLATIONS: TRANSLATIONS };

  /* Export setLang globally so existing inline onclick="setLang('pt')" works */
  global.setLang = setLang;

  /* Run on DOMContentLoaded or immediately if already loaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}(typeof window !== 'undefined' ? window : this));
