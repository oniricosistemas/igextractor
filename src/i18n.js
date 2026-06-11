'use strict';

const fs   = require('fs');
const path = require('path');
const { ENV_FILE: ENV } = require('./license');

function maskKey(key) {
  if (!key || key.length <= 8) return key;
  return key.slice(0, 4) + '****...' + key.slice(-4);
}

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
    extractionFailed:      msg => `Extraction failed: ${msg}`,
    storiesNoUserId:        'User ID not found, cannot download stories',
    storiesNotFound:        'No active stories found for this profile',
    needProfileAfterFlag:   'Please provide a username after --profile or -p',
    missingSessionIdValue:  'Missing value for --session-id',
    tryAgainOrBack:      'What would you like to do?',
    optTryAgain:         '  Try another username',
    optGoBack:           '  Back to main menu',

    askSessionAll:       'Instagram session ID (leave blank to skip):',
    sessionSaved:        'Session ID saved.',
    sessionHint:         'A session ID is required to access Instagram. Get it from your browser cookies.',
    sessionMasked:       sessionId => `Session ID: ${'*'.repeat(12)}...${sessionId.slice(-6)} (saved)`,

    authRequired:        '⚠️ AUTHENTICATION REQUIRED',
    authSessionExpired:  'Your Instagram session has expired (device detection). We need a new sessionid from your real browser (Chrome/Edge/Firefox).',
    authSteps1:          '1. Open Instagram in your browser and log in (www.instagram.com).',
    authSteps2:          '2. Open DevTools: press F12 or right-click -> Inspect.',
    authSteps3:          '3. Go to the "Application" tab (or "Storage" in some versions).',
    authSteps4:          '4. In the left menu, expand "Cookies" -> "https://www.instagram.com".',
    authSteps5:          '5. Find the "sessionid" cookie and copy its value (a long string).',
    authPaste:           '\nPaste the sessionid below and press Enter:\n',
    authNoSessionId:       'No session ID provided. Aborting.',
    authValidSession:      'Valid Session ID (200 OK with data)! Saving...',
    authRateLimitAccept:   'Rate limit (429) - session ID seems valid, saving...',
    authStatusOk:          'Status 200 OK - saving session ID...',
    authRejected:          'The session ID was rejected by Instagram (require_login: true). Not saving. Try a more recent one.',
    authValidationFailed:  status => `Could not validate (status: ${status}). Not saving. Try again.`,
    authValidationError:   msg => `Validation error: ${msg} - session ID not saved.`,
    authSessionIdPrompt:   'Session ID: ',
    commentSpinnerProgress: (current, total, code, msg) => `Post ${current}/${total} (${code}): ${msg}`,
    commentSpinnerFetching: 'Fetching comments...',
    commentSpinnerCount:    count => `Found ${count} comments...`,
    commentSpinnerError:    code => `Post ${code}: error`,
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
    summaryMetric:       'Metric',
    summaryValue:        'Value',
    summaryUsername:     'Username',
    summaryOutput:       'Output directory',
    summaryImages:       'Images downloaded',
    summaryReels:        'Reels',
    summaryCaptions:     'Captions',
    summaryStories:      'Stories downloaded',
    summaryComments:     'Comments saved',
    summaryFollowers:    'Followers saved',
    summaryFollowing:    'Following saved',
    allDone:             dir => `All done! Files saved to: ${dir}`,

    apiKeyMgmt:          'API Key Management',
    currentKey:          key => `Current key: ${key}`,
    extractingProfile:   username => `Extracting @${username}`,
    authBrowserSteps:    'Chrome/Firefox: F12 -> Application -> Cookies -> instagram.com -> sessionid',
    nonInteractiveStart: username => `Starting non-interactive extraction for: ${username}...`,
    nonInteractiveEnd:   username => `Extraction completed for ${username}`,
    nonInteractiveFail:  msg => `Extraction failed: ${msg}`,
    invalidDownloadLimit:'Invalid --download-limit value, using default.',
    invalidScanLimit:    'Invalid --scan-limit value, using default.',
    invalidMaxAgeDays:   'Invalid --max-age-days value, using default.',
    missingOutputDir:    'Missing value for --output-dir, using default.',
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
    validatingDots:      key => `Validating key: ${maskKey(key)}`,
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
    reelLabel:           'Reel',
    commentLabel:        'comments',
    captionLabel:        'Captions',
    followerLabel:       'Followers',
    followingLabel:      'Following',

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
    downloadingImagesReels: 'Downloading Images + Reels',
    downloadedReels:     n => `Downloaded ${n} reels`,
    noReelsFound:        'No reels found for this profile.',
    savedCaptionsTxt:    'captions.txt saved (human-readable)',
    storiesSoon:         'Stories download: coming soon.', // legacy
    noMediaId:           'No user ID available — cannot fetch media.',
    skippedItems:        count => `Skipped ${count} items`,
    notInGrid:           'not in grid',
    gridMismatch:        (nullIndices, total) => `Grid capture mismatch occurred (${nullIndices}/${total} items missing index). Audit file saved.`,
    strictGridEmpty:     'No downloadable posts found in strict-grid mode. Disabling strict-grid and retrying full feed...',
    navFailFirstGoto: 'Navigation failed: unexpected URL after first goto',
  navFailSessionGoto: 'Navigation failed: unexpected URL after session goto',
  emptyResponse: 'Empty response from Instagram',
  noJsonPayload: 'No JSON payload received from all fetch attempts',
  debugEnabled: 'Debug mode enabled',

  sessionExpired: 'Session expired. Run interactively to relogin.',
    strictGridFailLoud:  username => `No downloadable posts found in strict-grid mode for @${username}. Aborting.`,

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

    // UI box titles & tagline
    tagline:            v => `  Instagram Data Extraction Tool  v${v}  `,
    boxInfo:            ' ℹ INFO ',
    boxSuccess:         ' ✓ SUCCESS ',
    boxWarning:         ' ⚠ WARNING ',
    boxError:           ' ✗ ERROR ',
    boxPro:             ' ★ PRO ',
    profileCardTitle:   ' Instagram Profile ',
    proFeatureHeader:   ' ★ PRO FEATURE REQUIRED ',
    summaryOldest:        'Oldest post',
    summaryNewest:        'Newest post',
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
    extractionFailed:      msg => `Error en la extraccion: ${msg}`,
    storiesNoUserId:        'No se encontro el ID de usuario, no se pueden descargar las stories',
    storiesNotFound:        'No se encontraron stories activas para este perfil',
    needProfileAfterFlag:   'Por favor, ingrese un usuario despues de --profile o -p',
    missingSessionIdValue:  'Falta el valor para --session-id',
    tryAgainOrBack:      'Que queres hacer?',
    optTryAgain:         '  Intentar con otro usuario',
    optGoBack:           '  Volver al menu principal',

    askSessionAll:       'Session ID de Instagram (dejá en blanco para omitir):',
    sessionSaved:        'Session ID guardado.',
    sessionHint:         'Un session ID es necesario para acceder a Instagram. Obtenerlo de las cookies del browser.',
    noSessionWarn:       'No se ingreso session ID. El acceso al perfil puede fallar. Se recomienda agregarlo.',
    sessionMasked:       sessionId => `Session ID: ${'*'.repeat(12)}...${sessionId.slice(-6)} (guardado)`,
    authNoSessionId:       'No se proporcionó un sessionid. Abortando.',
    authValidSession:      '¡Session ID válido (200 OK con datos)! Guardando...',
    authRateLimitAccept:   'Rate limit (429) - el sessionid parece válido, guardando...',
    authStatusOk:          'Status 200 OK - guardando sessionid...',
    authRejected:          'El sessionid fue rechazado por Instagram (require_login: true). No se guarda. Probá con uno más reciente.',
    authValidationFailed:  status => `No se pudo validar (status: ${status}). No se guarda. Probá de nuevo.`,
    authValidationError:   msg => `Error validando: ${msg} - no se guardó el sessionid.`,
    authSessionIdPrompt:   'Session ID: ',
    commentSpinnerProgress: (current, total, code, msg) => `Progreso ${current}/${total} (${code}): ${msg}`,
    commentSpinnerFetching: 'Obteniendo comentarios...',
    commentSpinnerCount:    count => `Encontrados ${count} comentarios...`,
    commentSpinnerError:    code => `Post ${code}: error`,

    authRequired:        '⚠️ AUTENTICACION REQUERIDA',
    authSessionExpired:  'Instagram ha invalidado tu sesion actual (deteccion de dispositivo). Necesitamos un NUEVO sessionid desde tu navegador real (Chrome/Edge/Firefox).',
    authSteps1:          '1. Abri Instagram en tu navegador y logueate (www.instagram.com).',
    authSteps2:          '2. Abri las DevTools: presiona F12 o clic derecho -> Inspeccionar.',
    authSteps3:          '3. Anda a la pestania "Application" (o "Almacenamiento" en espanol).',
    authSteps4:          '4. En el menu izquierdo, expandi "Cookies" -> "https://www.instagram.com".',
    authSteps5:          '5. Busca la cookie llamada "sessionid" y copia su valor (es un string largo).',
    authPaste:           '\nPegá el sessionid aca abajo y presiona Enter:\n',

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
    summaryMetric:       'Métrica',
    summaryValue:        'Valor',
    summaryUsername:     'Usuario',
    summaryOutput:       'Directorio de salida',
    summaryImages:       'Imagenes descargadas',
    summaryReels:        'Reels',
    summaryCaptions:     'Textos',
    summaryStories:      'Stories descargados',
    summaryComments:     'Comentarios guardados',
    summaryFollowers:    'Seguidores guardados',
    summaryFollowing:    'Seguidos guardados',
    allDone:             dir => `Listo! Archivos guardados en: ${dir}`,

    apiKeyMgmt:          'Gestion de API Key',
    currentKey:          key => `Key actual: ${key}`,
    extractingProfile:   username => `Extrayendo @${username}`,
    authBrowserSteps:    'Chrome/Firefox: F12 -> Aplicacion -> Cookies -> instagram.com -> sessionid',
    nonInteractiveStart: username => `Iniciando extraccion no interactiva para: ${username}...`,
    nonInteractiveEnd:   username => `Extraccion completada para ${username}`,
    nonInteractiveFail:  msg => `Error en la extraccion: ${msg}`,
    invalidDownloadLimit:'Valor invalido para --download-limit, usando el predeterminado.',
    invalidScanLimit:    'Valor invalido para --scan-limit, usando el predeterminado.',
    invalidMaxAgeDays:   'Valor invalido para --max-age-days, usando el predeterminado.',
    missingOutputDir:    'Falta el valor para --output-dir, usando el predeterminado.',
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
    validatingDots:      key => `Validando key: ${maskKey(key)}`,
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
    reelLabel:           'Reel',
    commentLabel:        'comentarios',
    captionLabel:        'Descripciones',
    followerLabel:       'Seguidores',
    followingLabel:      'Seguidos',

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
    downloadingImagesReels: 'Descargando Imagenes + Reels',
    downloadedReels:     n => `Se descargaron ${n} reels`,
    noReelsFound:        'No se encontraron reels en este perfil.',
    savedCaptionsTxt:    'captions.txt guardado (formato legible)',
    storiesSoon:         'Descarga de Stories: proximamente.', // legacy
    noMediaId:           'Sin ID de usuario — no se puede obtener el contenido.',
    skippedItems:        count => `Se saltaron ${count} elementos`,
    notInGrid:           'no están en la cuadrícula',
    gridMismatch:        (nullIndices, total) => `Se produjo una discrepancia en la captura de cuadrícula (${nullIndices}/${total} elementos sin índice). Archivo de auditoría guardado.`,
    strictGridEmpty:     'No se encontraron publicaciones descargables en modo de cuadrícula estricta. Desactivando modo estricto y reintentando con el feed completo...',
    navFailFirstGoto: 'Navegación fallida: URL inesperada tras el primer goto',
  navFailSessionGoto: 'Navegación fallida: URL inesperada tras el goto de sesión',
  emptyResponse: 'Respuesta vacía de Instagram',
  noJsonPayload: 'No se recibió ningún payload JSON en todos los intentos de extracción',
  debugEnabled: 'Modo debug activado',

  sessionExpired: 'Sesión expirada. Ejecuta el modo interactivo para volver a loguearte.',

    strictGridFailLoud:  username => `No se encontraron posts descargables en modo strict-grid para @${username}. Abortando.`,

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

    // UI box titles & tagline
    tagline:            v => `  Herramienta de Extracción de Datos de Instagram  v${v}  `,
    boxInfo:            ' ℹ INFO ',
    boxSuccess:         ' ✓ SUCCESS ',
    boxWarning:         ' ⚠ WARNING ',
    boxError:           ' ✗ ERROR ',
    boxPro:             ' ★ PRO ',
    profileCardTitle:   ' Perfil de Instagram ',
    proFeatureHeader:   ' ★ FUNCIÓN PRO REQUERIDA ',
    summaryOldest:        'Post más antiguo',
    summaryNewest:        'Post más reciente',
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

module.exports = { t, setLang, getLang, loadSavedLang, saveLang, STRINGS, maskKey };
