// ========================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ========================================
// Ya no necesitas definirla, ya está en config.js
console.log("Mi API Key es:", API_KEY);

const container = document.getElementById('video-feed');

// Categorías para variedad de contenido
const CATEGORÍAS = ['ferrari','nasa','concert','travel','space',];

// Control de carga y estado
let currentCategoryIndex = 0;
let currentPage = 1;
let isLoading = false;
let videosCache = [];
let observer;

// Configuración de calidad adaptativa
const QUALITY_CONFIG = {
    // Detectar conexión del usuario
    getOptimalQuality: () => {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            // Si la conexión es lenta, usar SD
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                return 'sd';
            }
            // Si es rápida, usar HD
            if (connection.effectiveType === '4g') {
                return 'hd';
            }
        }
        // Por defecto, empezar con SD y mejorar gradualmente
        return 'sd';
    },

    // Función para obtener la mejor calidad disponible
    getBestVideoUrl: (videoFiles, preferredQuality = 'sd') => {
        // Prioridades de calidad
        const qualityPriority = preferredQuality === 'hd'
            ? ['hd', 'sd', 'tiny']
            : ['sd', 'hd', 'tiny'];

        for (let quality of qualityPriority) {
            const video = videoFiles.find(v => v.quality === quality);
            if (video) return { url: video.link, quality: quality };
        }

        // Fallback al primer video disponible
        return videoFiles[0] ? { url: videoFiles[0].link, quality: videoFiles[0].quality } : null;
    }
};

// ========================================
// PANTALLA DE CARGA OPTIMIZADA
// ========================================

window.addEventListener("load", () => {
    setTimeout(() => {
        const splash = document.getElementById("splash-screen");
        const topbar = document.getElementById("topbar");

        splash.style.opacity = 0;
        splash.style.transition = "opacity 0.5s ease-out";

        setTimeout(() => {
            splash.style.display = "none";
            topbar.style.display = "flex";

            // Iniciar carga inicial DESPUÉS de ocultar splash
            inicializarVideos();
        }, 500);
    }, 2000);
});

// ========================================
// SISTEMA DE CARGA INTELIGENTE
// ========================================

async function inicializarVideos() {
    // Cargar solo los primeros 3 videos para inicio rápido
    await cargarVideosIniciales();
    configurarIntersectionObserver();
    configurarScrollInfinito();
}

async function cargarVideosIniciales() {
    isLoading = true;

    try {
        // Cargar solo de la primera categoría inicialmente
        const category = CATEGORÍAS[currentCategoryIndex];
        await cargarVideosPorCategoria(category, 3); // Solo 3 videos iniciales

        // Precargar discretamente algunos más en background
        setTimeout(() => precargarSiguientesVideos(), 2000);

    } catch (error) {
        console.error('Error cargando videos iniciales:', error);
    } finally {
        isLoading = false;
    }
}

async function cargarVideosPorCategoria(category, limit = 4) {
    const API_URL = `https://api.pexels.com/videos/search?query=${category}&per_page=${limit}&page=${currentPage}`;

    try {
        const response = await fetch(API_URL, {
            headers: { Authorization: API_KEY }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        // Procesar videos con calidad inteligente
        const videosPromises = data.videos.map(video => crearVideoOptimizado(video));
        await Promise.all(videosPromises);

    } catch (error) {
        console.error(`Error cargando categoría ${category}:`, error);
    }
}

async function crearVideoOptimizado(videoData) {
    const optimalQuality = QUALITY_CONFIG.getOptimalQuality();
    const videoInfo = QUALITY_CONFIG.getBestVideoUrl(videoData.video_files, optimalQuality);

    if (!videoInfo) return;

    const videoWrapper = document.createElement('div');
    videoWrapper.classList.add('video-item');

    // Crear video con carga lazy
    const videoElement = document.createElement('video');
    videoElement.dataset.src = videoInfo.url; // No cargar inmediatamente
    videoElement.dataset.quality = videoInfo.quality;
    videoElement.autoplay = false;
    videoElement.loop = true;
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.preload = 'none'; // Importante: no precargar

    // Agregar indicador de calidad
    const qualityBadge = document.createElement('div');
    qualityBadge.className = 'quality-badge';
    qualityBadge.textContent = videoInfo.quality.toUpperCase();
    qualityBadge.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 1px;
        z-index: 10px;
    `;

    videoWrapper.appendChild(videoElement);
    videoWrapper.appendChild(qualityBadge);
    container.appendChild(videoWrapper);

    // Guardar referencia para lazy loading
    videosCache.push({
        element: videoElement,
        wrapper: videoWrapper,
        loaded: false,
        quality: videoInfo.quality
    });
}

// ========================================
// LAZY LOADING Y INTERSECTION OBSERVER
// ========================================

function configurarIntersectionObserver() {
    // Observer para reproducción de videos
    const playObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;

            if (entry.isIntersecting) {
                // Cargar video si no está cargado
                if (!video.src && video.dataset.src) {
                    cargarVideo(video);
                }

                // Reproducir video
                if (video.readyState >= 2) {
                    video.play().catch(console.warn);
                }
            } else {
                // Pausar video fuera de vista
                video.pause();
            }
        });
    }, {
        threshold: 0.7,
        rootMargin: '50px' // Precargar un poco antes
    });

    // Observer para lazy loading
    const loadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                if (!video.src && video.dataset.src) {
                    cargarVideo(video);
                    loadObserver.unobserve(video); // Solo observar una vez
                }
            }
        });
    }, {
        rootMargin: '200px' // Cargar videos 200px antes de que sean visibles
    });

    // Aplicar observers a videos existentes y futuros
    observer = { play: playObserver, load: loadObserver };
    aplicarObserversAVideos();
}

function aplicarObserversAVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        observer.play.observe(video);
        observer.load.observe(video);
    });

    // Reproducir el primer video automáticamente
    if (videos.length > 0 && !videos[0].src) {
        cargarVideo(videos[0]).then(() => {
            videos[0].play().catch(console.warn);
        });
    }
}

async function cargarVideo(videoElement) {
    if (videoElement.src) return; // Ya cargado

    videoElement.src = videoElement.dataset.src;

    return new Promise((resolve) => {
        videoElement.addEventListener('loadeddata', resolve, { once: true });
        videoElement.addEventListener('error', resolve, { once: true });
        videoElement.load();
    });
}

// ========================================
// SCROLL INFINITO OPTIMIZADO
// ========================================

function configurarScrollInfinito() {
    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading) {
                cargarMasVideos();
            }
        });
    }, {
        rootMargin: '300px' // Cargar cuando falten 300px para llegar al final
    });

    // Observar el último video
    const ultimoVideo = container.lastElementChild;
    if (ultimoVideo) {
        scrollObserver.observe(ultimoVideo);
    }
}

async function cargarMasVideos() {
    if (isLoading) return;

    isLoading = true;

    try {
        // Alternar entre categorías para variedad
        currentCategoryIndex = (currentCategoryIndex + 1) % CATEGORÍAS.length;
        if (currentCategoryIndex === 0) currentPage++;

        const category = CATEGORÍAS[currentCategoryIndex];
        await cargarVideosPorCategoria(category, 2); // Solo 2 videos por batch

        // Reconfigurar observers para nuevos videos
        aplicarObserversAVideos();

    } catch (error) {
        console.error('Error cargando más videos:', error);
    } finally {
        isLoading = false;
    }
}

async function precargarSiguientesVideos() {
    // Precargar discretamente en background
    if (isLoading) return;

    const nextCategory = CATEGORÍAS[(currentCategoryIndex + 1) % CATEGORÍAS.length];
    await cargarVideosPorCategoria(nextCategory, 2);
    aplicarObserversAVideos();
}

// ========================================
// MEJORA DE CALIDAD DINÁMICA
// ========================================

function mejorarCalidadVideo(videoElement) {
    if (videoElement.dataset.quality === 'hd') return; // Ya es HD

    // Solo mejorar si el video se está reproduciendo bien
    if (videoElement.readyState === 4 && !videoElement.paused) {
        const wrapper = videoElement.closest('.video-item');
        // Implementar lógica de mejora de calidad aquí
        console.log('Mejorando calidad para video visible');
    }
}

// ========================================
// FUNCIONES DE COMENTARIOS (SIN CAMBIOS)
// ========================================
function toggleComentarios() {
    const ventana = document.getElementById('ventanaComentarios');
    const videoContainer = document.querySelector('.video-container');
    const videoFeed = document.getElementById('video-feed');
    const topbar = document.getElementById('topbar');

    if (ventana.classList.contains('mostrar')) {
        // Cerrar comentarios
        ventana.classList.remove('mostrar');
        videoContainer.classList.remove('comments-active');
        videoFeed.classList.remove('video-reduced');
        topbar.style.display = "flex";
        document.body.classList.remove('oculto-scroll');
        document.body.classList.remove('comments-overlay'); // Quitar overlay oscuro
        setTimeout(() => {
            ventana.classList.add('oculto');
        }, 300);
    } else {
        // Abrir comentarios
        ventana.classList.remove('oculto');
        videoContainer.classList.add('comments-active');
        videoFeed.classList.add('video-reduced');
        topbar.style.display = "none";
        document.body.classList.add('oculto-scroll');
        document.body.classList.add('comments-overlay'); // Agregar overlay oscuro
        setTimeout(() => {
            ventana.classList.add('mostrar');
        }, 10);
    }
}

document.addEventListener('click', function (e) {
    const ventana = document.getElementById('ventanaComentarios');
    const boton = document.getElementById('btnComentarios');
    const videoContainer = document.querySelector('.video-container');
    const videoFeed = document.getElementById('video-feed');
    const topbar = document.getElementById('topbar');

    if (ventana && boton && !ventana.contains(e.target) && !boton.contains(e.target)) {
        // Cerrar comentarios al hacer clic fuera
        ventana.classList.remove('mostrar');
        videoContainer.classList.remove('comments-active');
        videoFeed.classList.remove('video-reduced');
        topbar.style.display = "flex";
        document.body.classList.remove('oculto-scroll');
        document.body.classList.remove('comments-overlay'); // Quitar overlay oscuro
        setTimeout(() => {
            ventana.classList.add('oculto');
        }, 300);
    }
});

// ========================================
// EVENTOS DE INTERACCIÓN (OPTIMIZADOS)
// ========================================

// Usar delegación de eventos para mejor performance
document.addEventListener('click', function (e) {
    // Like buttons
    if (e.target.closest('.like-btn')) {
        const btn = e.target.closest('.like-btn');
        const icon = btn.querySelector('i');
        btn.classList.toggle('liked');
        icon.classList.toggle('bi-heart');
        icon.classList.toggle('bi-heart-fill');
    }

    // Dislike buttons
    if (e.target.closest('.dislike-btn')) {
        const btn = e.target.closest('.dislike-btn');
        const icon = btn.querySelector('i');
        btn.classList.toggle('disliked');
        icon.classList.toggle('bi-hand-thumbs-down');
        icon.classList.toggle('bi-hand-thumbs-down-fill');
    }
});


//ocultar respuestas//
function toggleRespuestas(element) {
    const comentario = element.closest('.contenido-comentario');
    const respuestas = comentario.querySelector('.respuestas');
    respuestas.classList.toggle('oculto');
}


// ========================================
// MONITOREO DE PERFORMANCE (OPCIONAL)
// ========================================

function monitorerarPerformance() {
    // Monitorear uso de memoria
    if (performance.memory) {
        console.log('Memoria usada:', Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB');
    }

    // Limpiar videos no visibles si hay muchos
    if (videosCache.length > 20) {
        limpiarVideosLejanos();
    }
}

function limpiarVideosLejanos() {
    const viewportHeight = window.innerHeight;
    const scrollTop = window.pageYOffset;

    videosCache.forEach((videoInfo, index) => {
        const rect = videoInfo.wrapper.getBoundingClientRect();
        const distanceFromViewport = Math.abs(rect.top - viewportHeight / 2);

        // Si el video está muy lejos, liberar memoria
        if (distanceFromViewport > viewportHeight * 3 && videoInfo.loaded) {
            videoInfo.element.src = '';
            videoInfo.element.load();
            videoInfo.loaded = false;
        }
    });
}

// Ejecutar monitoreo cada 30 segundos
setInterval(monitorerarPerformance, 30000);



// ========================================
// EVENTOS DE BOTONES GUARDADOS
// ========================================

function agregarFavorito() {
    const noti = document.getElementById("notificacionFavorito");
    noti.style.display = "block";

    // Reiniciar animación
    noti.classList.remove("animando");
    void noti.offsetWidth; // trigger reflow
    noti.classList.add("animando");

    // Ocultar después de 2 segundos
    setTimeout(() => {
        noti.style.display = "none";
    }, 2000);
}





// ========================================
// EVENTOS OPEN BARRRA DE COMENTARIOS   
// ========================================
document.getElementById('enviarBtn').addEventListener('click', () => {
    const input = document.getElementById('comentarioInput');
    const texto = input.value.trim();
    if (texto) {
        alert(`Comentario enviado: ${texto}`);
        input.value = '';
    }
});

document.getElementById('emojiBtn').addEventListener('click', () => {
    // Aquí podrías integrar una librería o solo agregar un emoji manualmente
    const input = document.getElementById('comentarioInput');
    input.value += '😊';
    input.focus();
});




// ========================================
// EVENTOS PARA TOGGLE DE COMENTARIOS 50% O PANTALLA COMPLETA
// ========================================
