'use strict';

const fs   = require('fs');
const path = require('path');
const ENV  = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.igextractor.env');

const STRINGS = {
  en: {
    checkingLicense:     'Checking license...',
    wakingServer:        'Connecting to license server...',
    proVerified:         'Pro license verified.',
    offlineMode:         'Offline mode - using cached Pro status.',
    keyInvalid:          'API key found but invalid/revoked. Running on Free plan.',

    planLineFree:        'Free plan active. 10 images max. No proxy, comments, followers or following.',
    planLinePro:         'All features unlocked. Unlimited downloads.',
    offlineGrace:        'License server unreachable. Using cached Pro status (offline grace mode).',
    whatToDo:            'What would you like to do?',
    menuExtract:         '  Extract Instagram profile data',
    menuApiKey:          '  Add / update API key',
    menuExit:            '  Exit',
    goodbye:             'Goodbye!',

    extractSetup:        'Profile Extraction',
    askUsername:         'Instagram username (without @):',
    usernameEmpty:       'Username cannot be empty.',

    validatingProfile:   username => `Verifying @${username}...`,
    profileFound:        username => `Profile @${username} found!`,
    profileNotFound:     username => `Profile @${username} not found. It may be private, suspended, or the username is incorrect.`,
    profileFetchError:   msg => `Profile fetch error: ${msg}`,
    abortingExtraction:  'Aborting extraction.',
    tryAgainOrBack:      'What would you like to do?',
    optTryAgain:         '  Try another username',
    optGoBack:           '  Back to main menu',

    askSessionAll:       'Instagram session ID (leave blank to skip):',
    sessionSaved:        'Session ID saved.',
    sessionHint:         'A session ID is required to access Instagram. Get it from your browser cookies.',
    noSessionWarn:       'No session ID provided. Profile access may fail. Consider adding one.',

    askWhatDownload:     'What to download?',
    optImages:           'Images',
    optImagesMax:        ' (max 10)',
    optStories:          'Stories',
    optComments:         'Comments',
    optFollowers:        'Followers',
    optFollowing:        'Following',
    proOnly:             'PRO only',
    askProxy:            'Proxy URL (optional, leave blank to skip):',
    askSession:          'Instagram session ID (optional, improves access):',
    askOutputDir:        'Output directory (leave blank for current dir):',
    confirmExtract:      username => `Start extraction for @${username}?`,
    cancelled:           'Extraction cancelled.',
    extractAnother:      'Extract another profile?',

    downloadingImages:   'Downloading Images',
    fetchingPostList:    'Fetching post list...',
    noMediaFound:        'No media found.',
    downloadedImages:    n => `Downloaded ${n} images`,

    downloadingStories:  'Downloading Stories',
    fetchingStories:     'Fetching stories...',
    noStoriesFound:      'No stories found (profile may be private or has no active stories).',
    downloadedStories:   n => `Downloaded ${n} stories -> stories/`,

    downloadingComments: 'Downloading Comments',
    noPostsFound:        'No posts found.',
    savedComments:       (n, p) => `Saved ${n} comments from ${p} posts -> comments.json`,

    downloadingFollowers:'Downloading Followers',
    downloadingFollowing:'Downloading Following',
    noUserId:            'Could not determine user ID. Skipping.',
    fetchingFollowers:   'Fetching followers list (this may take a while)...',
    fetchingFollowing:   'Fetching following list (this may take a while)...',
    fetchedCount:        (n, type) => `\r  Fetched ${n} ${type}...`,
    savedFollowers:      n => `Saved ${n} followers -> followers.json`,
    savedFollowing:      n => `Saved ${n} following -> following.json`,

    savedMetadata:       'Profile metadata -> profile.json',

    downloadingCaptions: 'Downloading Post Captions',
    savedCaptions:       n => `Saved captions for ${n} posts -> captions.json`,
    optCaptions:         'Post captions',

    extractComplete:     'Extraction Complete',
    summaryUsername:     'Username',
    summaryOutput:       'Output directory',
    summaryImages:       'Images downloaded',
    summaryStories:      'Stories downloaded',
    summaryComments:     'Comments saved',
    summaryFollowers:    'Followers saved',
    summaryFollowing:    'Following saved',
    allDone:             dir => `All done! Files saved to: ${dir}`,

    apiKeyMgmt:          'API Key Management',
    currentKey:          key => `Current key: ${key}`,
    noKey:               'No API key configured (running on Free plan).',
    chooseAction:        'Choose an action:',
    setKey:              '  Enter / update API key',
    removeKey:           '  Remove API key',
    backMenu:            '  Back to main menu',
    confirmRemove:       'Remove API key and revert to Free plan?',
    keyRemoved:          'API key removed. Now running on Free plan.',
    enterKey:            'Enter your IGX API key (format: IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX):',
    invalidFormat:       'Invalid key format. Expected: IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    validatingKey:       'Validating key...',
    keySavedOffline:     'Could not reach license server. Key saved (will validate on next online startup).',
    proActivated:        'PRO LICENSE ACTIVATED!\n\nAll features are now unlocked.\nRestart igextractor to apply your new plan.',
    keyInvalidNotSaved:  msg => `Invalid or revoked key: ${msg || 'Unknown error'}. Key not saved.`,

    upgradeRequired:     feat => `"${feat}" requires a Pro license.\n\nAdd your key: igextractor -apiKey YOUR-IGX-KEY`,

    usageTitle:          ' IGExtractor ',
    usageHeader:         'Usage:',
    usageExamplesHeader: 'Examples:',
    usageInit:           '  igextractor init               - Start the interactive TUI',
    usageApiKey:         '  igextractor -apiKey <KEY>      - Save a Pro API key',
    usageEx1:            '  $ igextractor init',
    usageEx2:            '  $ igextractor -apiKey IGX-A1B2C3D4-E5F6A7B8-C9D0E1F2',
    usageFreeLine:       'Free plan: 10 images, no proxy, no comments/followers/following.',
    usageProLine:        'Pro plan: Unlimited. All features. Proxy support.',

    noKeyProvided:       'Please provide an API key: igextractor -apiKey YOUR-KEY',
    validatingDots:      key => `Validating key: ${key.slice(0, 12)}...`,
    keySavedTo:          f => `Key saved to: ${f}`,
    keyInvalidCli:       msg => `Invalid key: ${msg || 'Key not recognized'}`,

    selectLanguage:      'Select language / Seleccionar idioma:',
    proBadge:            ' PRO PLAN ',
    freeBadge:           ' FREE PLAN ',

    planPro:             'Pro (unlimited)',
    planFree:            'Free (max 10 images)',
    outputDir:           dir => `Output directory: ${dir}`,
    planLabel:           p => `Plan: ${p}`,
    imageLabel:          'image',
    storyLabel:          'story',
    commentLabel:        'comments',

    fetchingProfile:     'Fetching profile information...',

    // Pro features
    fetchingComments:    'Fetching comments...',
    fetchingFollowers:   'Fetching followers...',
    fetchingFollowing:   'Fetching following...',
    savedComments:       (n, p) => `Saved ${n} comments from ${p} posts -> comments.json`,
    savedFollowers:      n => `Saved ${n} followers -> followers.json`,
    savedFollowing:      n => `Saved ${n} following -> following.json`,
    noComments:          'No comments found.',
    askCommentLimit:     'Max posts to fetch comments from (default: 10):',
    commentLimitInfo:    n => `Comments: fetching from last ${n} posts.`,
    noFollowers:         'No followers found (profile may be private).',
    noFollowing:         'No following found.',
    proRequired:         feat => `"${feat}" requires Pro plan.`,

    // Media type & limit
    askMediaType:        'What media types to download?',
    optPhotos:           'Photos',
    optReels:            'Reels (videos)',
    optBoth:             'Photos + Reels',
    askDownloadLimit:    'Max items to download (0 = plan maximum):',
    invalidLimit:        'Enter a number (0 for no limit)',
    limitFree:           n => `Free plan: up to ${n} items total between photos and reels.`,
    limitCustom:         n => `Limit set to ${n} items.`,

    // Spinner strings
    spinLaunching:       'Launching browser',
    spinLoadingProfile:  'Loading profile',
    spinLoadingPosts:    'Loading posts',
    spinScrolling:       'Scrolling for more posts',

    // Download status
    downloadingReels:    'Downloading Reels',
    downloadedReels:     n => `Downloaded ${n} reels`,
    noReelsFound:        'No reels found for this profile.',
    savedCaptionsTxt:    'captions.txt saved (human-readable)',
    storiesSoon:         'Stories download: coming soon.', // legacy
    noMediaId:           'No user ID available — cannot fetch media.',

    // Free limit warning (in ui.js)
    freeLimitTitle:      'Free plan limit:',
    freeLimitUpgrade:    'Upgrade to',
    freeLimitRun:        'Run:',
    freeLimitPro:        '★ PRO',
    freeLimitRemove:     'to remove all limits.',

    // Profile card labels
    cardPosts:           'Posts      ',
    cardFollowers:       'Followers  ',
    cardFollowing:       'Following  ',
    cardPrivate:         'Private    ',
    cardVerified:        'Verified   ',
    cardYes:             'Yes',
    cardNo:              'No',
  },

  es: {
    checkingLicense:     'Verificando licencia...',
    wakingServer:        'Conectando con el servidor de licencias...',
    proVerified:         'Licencia Pro verificada.',
    offlineMode:         'Modo sin conexion - usando estado Pro en cache.',
    keyInvalid:          'Se encontro una API key pero no es valida o fue revocada. Ejecutando en plan Gratuito.',

    planLineFree:        'Plan Gratuito activo. Maximo 10 imagenes. Sin proxy, comentarios, seguidores ni seguidos.',
    planLinePro:         'Todas las funciones desbloqueadas. Descargas ilimitadas.',
    offlineGrace:        'Servidor de licencias inaccesible. Usando estado Pro en cache (modo sin conexion).',
    whatToDo:            'Que queres hacer?',
    menuExtract:         '  Extraer datos de un perfil de Instagram',
    menuApiKey:          '  Agregar / actualizar API key',
    menuExit:            '  Salir',
    goodbye:             'Hasta luego!',

    extractSetup:        'Extraccion de Perfil',
    askUsername:         'Nombre de usuario de Instagram (sin @):',
    usernameEmpty:       'El nombre de usuario no puede estar vacio.',

    validatingProfile:   username => `Verificando @${username}...`,
    profileFound:        username => `Perfil @${username} encontrado!`,
    profileNotFound:     username => `Perfil @${username} no encontrado. Puede ser privado, estar suspendido, o el usuario no existe.`,
    profileFetchError:   msg => `Error al obtener perfil: ${msg}`,
    abortingExtraction:  'Abortando la extraccion.',
    tryAgainOrBack:      'Que queres hacer?',
    optTryAgain:         '  Intentar con otro usuario',
    optGoBack:           '  Volver al menu principal',

    askSessionAll:       'Session ID de Instagram (dejá en blanco para omitir):',
    sessionSaved:        'Session ID guardado.',
    sessionHint:         'Un session ID es necesario para acceder a Instagram. Obtenerlo de las cookies del browser.',
    noSessionWarn:       'No se ingreso session ID. El acceso al perfil puede fallar. Se recomienda agregarlo.',

    askWhatDownload:     'Que queres descargar?',
    optImages:           'Imagenes',
    optImagesMax:        ' (max. 10)',
    optStories:          'Stories',
    optComments:         'Comentarios',
    optFollowers:        'Seguidores',
    optFollowing:        'Seguidos',
    proOnly:             'Solo PRO',
    askProxy:            'URL del proxy (opcional, deja en blanco para omitir):',
    askSession:          'Session ID de Instagram (opcional, mejora el acceso):',
    askOutputDir:        'Directorio de salida (deja en blanco para usar el actual):',
    confirmExtract:      username => `Iniciar extraccion para @${username}?`,
    cancelled:           'Extraccion cancelada.',
    extractAnother:      'Extraer otro perfil?',

    downloadingImages:   'Descargando Imagenes',
    fetchingPostList:    'Obteniendo lista de publicaciones...',
    noMediaFound:        'No se encontraron publicaciones.',
    downloadedImages:    n => `Se descargaron ${n} imagenes`,

    downloadingStories:  'Descargando Stories',
    fetchingStories:     'Obteniendo stories...',
    noStoriesFound:      'No se encontraron stories (el perfil puede ser privado o no tener stories activos).',
    downloadedStories:   n => `Se descargaron ${n} stories -> stories/`,

    downloadingComments: 'Descargando Comentarios',
    noPostsFound:        'No se encontraron publicaciones.',
    savedComments:       (n, p) => `Se guardaron ${n} comentarios de ${p} publicaciones -> comments.json`,

    downloadingFollowers:'Descargando Seguidores',
    downloadingFollowing:'Descargando Seguidos',
    noUserId:            'No se pudo determinar el ID del usuario. Saltando.',
    fetchingFollowers:   'Obteniendo lista de seguidores (puede tardar un poco)...',
    fetchingFollowing:   'Obteniendo lista de seguidos (puede tardar un poco)...',
    fetchedCount:        (n, type) => `\r  Se obtuvieron ${n} ${type}...`,
    savedFollowers:      n => `Se guardaron ${n} seguidores -> followers.json`,
    savedFollowing:      n => `Se guardaron ${n} seguidos -> following.json`,

    savedMetadata:       'Metadatos del perfil -> profile.json',

    downloadingCaptions: 'Descargando Textos de Publicaciones',
    savedCaptions:       n => `Textos guardados de ${n} publicaciones -> captions.json`,
    optCaptions:         'Textos de publicaciones',

    extractComplete:     'Extraccion Completa',
    summaryUsername:     'Usuario',
    summaryOutput:       'Directorio de salida',
    summaryImages:       'Imagenes descargadas',
    summaryStories:      'Stories descargados',
    summaryComments:     'Comentarios guardados',
    summaryFollowers:    'Seguidores guardados',
    summaryFollowing:    'Seguidos guardados',
    allDone:             dir => `Listo! Archivos guardados en: ${dir}`,

    apiKeyMgmt:          'Gestion de API Key',
    currentKey:          key => `Key actual: ${key}`,
    noKey:               'No hay API key configurada (ejecutando en plan Gratuito).',
    chooseAction:        'Elegi una accion:',
    setKey:              '  Ingresar / actualizar API key',
    removeKey:           '  Eliminar API key',
    backMenu:            '  Volver al menu principal',
    confirmRemove:       'Eliminar la API key y volver al plan Gratuito?',
    keyRemoved:          'API key eliminada. Ejecutando en plan Gratuito.',
    enterKey:            'Ingresa tu API key de IGX (formato: IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX):',
    invalidFormat:       'Formato de key invalido. Se espera: IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    validatingKey:       'Validando key...',
    keySavedOffline:     'No se pudo alcanzar el servidor de licencias. Key guardada (se validara al reconectarse).',
    proActivated:        'LICENCIA PRO ACTIVADA!\n\nTodas las funciones estan desbloqueadas.\nReinicia igextractor para aplicar tu nuevo plan.',
    keyInvalidNotSaved:  msg => `Key invalida o revocada: ${msg || 'Error desconocido'}. Key no guardada.`,

    upgradeRequired:     feat => `"${feat}" requiere una licencia Pro.\n\nAgregar tu key: igextractor -apiKey TU-KEY`,

    usageTitle:          ' IGExtractor ',
    usageHeader:         'Uso:',
    usageExamplesHeader: 'Ejemplos:',
    usageInit:           '  igextractor init               - Iniciar la TUI interactiva',
    usageApiKey:         '  igextractor -apiKey <KEY>      - Guardar una API key Pro',
    usageEx1:            '  $ igextractor init',
    usageEx2:            '  $ igextractor -apiKey IGX-A1B2C3D4-E5F6A7B8-C9D0E1F2',
    usageFreeLine:       'Plan Gratuito: 10 imagenes, sin proxy, sin comentarios/seguidores/seguidos.',
    usageProLine:        'Plan Pro: Ilimitado. Todas las funciones. Soporte de proxy.',

    noKeyProvided:       'Por favor proporciona una API key: igextractor -apiKey TU-KEY',
    validatingDots:      key => `Validando key: ${key.slice(0, 12)}...`,
    keySavedTo:          f => `Key guardada en: ${f}`,
    keyInvalidCli:       msg => `Key invalida: ${msg || 'Key no reconocida'}`,

    selectLanguage:      'Select language / Seleccionar idioma:',
    proBadge:            ' PLAN PRO ',
    freeBadge:           ' PLAN GRATUITO ',

    planPro:             'Pro (ilimitado)',
    planFree:            'Gratuito (max. 10 imagenes)',
    outputDir:           dir => `Directorio de salida: ${dir}`,
    planLabel:           p => `Plan: ${p}`,
    imageLabel:          'imagen',
    storyLabel:          'story',
    commentLabel:        'comentarios',

    fetchingProfile:     'Obteniendo informacion del perfil...',

    // Pro features
    fetchingComments:    'Obteniendo comentarios...',
    fetchingFollowers:   'Obteniendo seguidores...',
    fetchingFollowing:   'Obteniendo seguidos...',
    savedComments:       (n, p) => `Se guardaron ${n} comentarios de ${p} publicaciones -> comments.json`,
    savedFollowers:      n => `Se guardaron ${n} seguidores -> followers.json`,
    savedFollowing:      n => `Se guardaron ${n} seguidos -> following.json`,
    noComments:          'No se encontraron comentarios.',
    askCommentLimit:     'Maximo de posts de los que obtener comentarios (default: 10):',
    commentLimitInfo:    n => `Comentarios: se obtendran de los ultimos ${n} posts.`,
    noFollowers:         'No se encontraron seguidores (perfil puede ser privado).',
    noFollowing:         'No se encontraron seguidos.',
    proRequired:         feat => `"${feat}" requiere plan Pro.`,

    // Media type & limit
    askMediaType:        'Que tipo de contenido descargar?',
    optPhotos:           'Fotos',
    optReels:            'Reels (videos)',
    optBoth:             'Fotos + Reels',
    askDownloadLimit:    'Maximo a descargar (0 = maximo del plan):',
    invalidLimit:        'Ingresa un numero (0 para sin limite)',
    limitFree:           n => `Plan gratuito: hasta ${n} elementos entre fotos y reels.`,
    limitCustom:         n => `Limite establecido en ${n} elementos.`,

    // Spinner strings
    spinLaunching:       'Iniciando navegador',
    spinLoadingProfile:  'Cargando perfil',
    spinLoadingPosts:    'Cargando publicaciones',
    spinScrolling:       'Cargando mas publicaciones',

    // Download status
    downloadingReels:    'Descargando Reels',
    downloadedReels:     n => `Se descargaron ${n} reels`,
    noReelsFound:        'No se encontraron reels en este perfil.',
    savedCaptionsTxt:    'captions.txt guardado (formato legible)',
    storiesSoon:         'Descarga de Stories: proximamente.', // legacy
    noMediaId:           'Sin ID de usuario — no se puede obtener el contenido.',

    // Free limit warning (in ui.js)
    freeLimitTitle:      'Limite plan gratuito:',
    freeLimitUpgrade:    'Actualizate a',
    freeLimitRun:        'Ejecuta:',
    freeLimitPro:        '★ PRO',
    freeLimitRemove:     'para desbloquear todo.',

    // Profile card labels
    cardPosts:           'Posts      ',
    cardFollowers:       'Seguidores ',
    cardFollowing:       'Seguidos   ',
    cardPrivate:         'Privado    ',
    cardVerified:        'Verificado ',
    cardYes:             'Si',
    cardNo:              'No',
  },
};

// ─── Active language ──────────────────────────────────────────────────────────
let _lang = 'en';

function setLang(lang) { if (STRINGS[lang]) _lang = lang; }
function getLang()     { return _lang; }

function t(key, ...args) {
  const val = STRINGS[_lang]?.[key] ?? STRINGS['en']?.[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

function loadSavedLang() {
  try {
    if (!fs.existsSync(ENV)) return null;
    const content = fs.readFileSync(ENV, 'utf8').replace(/^\uFEFF/, '');
    const m = content.match(/IGX_LANG=([a-z]{2})/);
    return m ? m[1] : null;
  } catch { return null; }
}

function saveLang(lang) {
  try {
    let content = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').replace(/^\uFEFF/, '') : '';
    content = content.replace(/IGX_LANG=[^\n]*\n?/g, '');
    content += `IGX_LANG=${lang}\n`;
    fs.writeFileSync(ENV, content, { mode: 0o600 });
  } catch {}
}

module.exports = { t, setLang, getLang, loadSavedLang, saveLang, STRINGS };
