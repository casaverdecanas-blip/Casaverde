// cabin.js
let sliders = {};
let autoIntervals = {};

function initSlider(sliderId, photos) {
    const track = document.getElementById(`track-${sliderId}`);
    const dotsContainer = document.getElementById(`dots-${sliderId}`);
    if (!track || !photos.length) return;
    
    track.innerHTML = '';
    dotsContainer.innerHTML = '';
    
    photos.forEach((photo, idx) => {
        const slide = document.createElement('div');
        slide.className = 'slider-slide';
        slide.innerHTML = `<img src="${photo.url}" alt="${photo.desc}" onclick="openModal('${photo.url}')"><div class="slider-caption">${photo.desc}</div>`;
        track.appendChild(slide);
        
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.onclick = () => goToSlide(sliderId, idx);
        dotsContainer.appendChild(dot);
    });
    
    sliders[sliderId] = { currentIndex: 0, total: photos.length };
    updateSlider(sliderId);
    
    if (photos.length > 1) {
        startAutoSlide(sliderId);
        const container = document.getElementById(`slider-container-${sliderId}`);
        if (container) {
            container.addEventListener('mouseenter', () => pauseAutoSlide(sliderId));
            container.addEventListener('mouseleave', () => startAutoSlide(sliderId));
        }
    }
}

function updateSlider(sliderId) {
    const track = document.getElementById(`track-${sliderId}`);
    const dots = document.querySelectorAll(`#dots-${sliderId} .dot`);
    if (!track) return;
    const index = sliders[sliderId].currentIndex;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function startAutoSlide(sliderId) {
    if (autoIntervals[sliderId]) clearInterval(autoIntervals[sliderId]);
    if (sliders[sliderId]?.total <= 1) return;
    autoIntervals[sliderId] = setInterval(() => {
        if (!sliders[sliderId]) return;
        let newIndex = sliders[sliderId].currentIndex + 1;
        if (newIndex >= sliders[sliderId].total) newIndex = 0;
        sliders[sliderId].currentIndex = newIndex;
        updateSlider(sliderId);
    }, 4500 + Math.random() * 1500);
}

function pauseAutoSlide(sliderId) {
    if (autoIntervals[sliderId]) { clearInterval(autoIntervals[sliderId]); autoIntervals[sliderId] = null; }
}

function prevSlide(sliderId) {
    pauseAutoSlide(sliderId);
    sliders[sliderId].currentIndex = (sliders[sliderId].currentIndex - 1 + sliders[sliderId].total) % sliders[sliderId].total;
    updateSlider(sliderId);
    startAutoSlide(sliderId);
}

function nextSlide(sliderId) {
    pauseAutoSlide(sliderId);
    sliders[sliderId].currentIndex = (sliders[sliderId].currentIndex + 1) % sliders[sliderId].total;
    updateSlider(sliderId);
    startAutoSlide(sliderId);
}

function goToSlide(sliderId, index) {
    pauseAutoSlide(sliderId);
    sliders[sliderId].currentIndex = index;
    updateSlider(sliderId);
    startAutoSlide(sliderId);
}

function openModal(url) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    modal.innerHTML = `<img src="${url}" style="max-width:90%;max-height:90%;border-radius:8px;">`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
}

async function loadCabinCategories(cabinId) {
    const container = document.getElementById('categories-container');
    container.innerHTML = '<div style="text-align:center; padding:20px;">Cargando fotos...</div>';
    
    try {
        const snapshot = await db.ref(`${DB_PATH}/apartments/${cabinId}/categories`).once('value');
        const categories = snapshot.val() || {};
        
        container.innerHTML = '';
        
        if (Object.keys(categories).length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No hay fotos disponibles aún</div>';
            return;
        }
        
        for (const [catId, catData] of Object.entries(categories)) {
            const photos = catData.photos || [];
            if (photos.length === 0) continue;
            
            const sliderId = `${cabinId}_${catId}`;
            const section = document.createElement('div');
            section.className = 'category-section';
            section.id = `slider-container-${sliderId}`;
            section.innerHTML = `
                <h3>${catData.name}</h3>
                <div class="slider-container">
                    <button class="slider-btn slider-prev" onclick="prevSlide('${sliderId}')">‹</button>
                    <div class="slider-track" id="track-${sliderId}"></div>
                    <button class="slider-btn slider-next" onclick="nextSlide('${sliderId}')">›</button>
                    <div class="slider-dots" id="dots-${sliderId}"></div>
                </div>
            `;
            container.appendChild(section);
            initSlider(sliderId, photos);
        }
        
        if (container.innerHTML === '') {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No hay fotos disponibles aún</div>';
        }
        
    } catch (error) {
        console.error('Error loading categories:', error);
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#e74c3c;">Error al cargar fotos</div>';
    }
}