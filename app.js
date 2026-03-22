// ============================================================================
// MAP APPLICATION - Complete from scratch
// Features: Pan, Draw (point/line/polygon), Import/Export GeoJSON
// Optimizations: Tile caching, canvas rendering, efficient redraw
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    TILE_SERVER: 'https://a.basemaps.cartocdn.com/light_all',
    TILE_SIZE: 256,
    DEFAULT_ZOOM: 8,
    DEFAULT_CENTER: { lat: 53.349805, lon: -6.26031 }, // Ireland
    MAX_CACHE_TILES: 100,
    DRAW_STYLES: {
        point: { color: '#FF0000', size: 6 },
        line: { color: '#0000FF', width: 2 },
        polygon: { fillColor: '#00FF00', strokeColor: '#000000', strokeWidth: 2, alpha: 0.3 }
    }
};

// ============================================================================
// STATE
// ============================================================================
const state = {
    mode: 'pan', // pan, point, line, polygon
    zoom: CONFIG.DEFAULT_ZOOM,
    center: { ...CONFIG.DEFAULT_CENTER },
    
    // Layers system
    layers: [
        {
            id: 'default',
            name: 'Default Layer',
            visible: true,
            drawings: {
                points: [],
                lines: [],
                polygons: []
            }
        }
    ],
    currentLayerId: 'default',
    
    // Undo/redo stacks (store snapshots of layers only)
    history: [],        // past states for undo
    redoStack: [],      // states for redo
    
    // Current drawing
    currentLine: [],
    currentPolygon: [],

    // Measurement
    measurement: {
        mode: 'none', // none, distance, area
        points: [],
        value: 0,
        unit: ''
    },
    
    // Pan/drag
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    
    // Tile cache
    tileCache: {},
    cacheStats: { hits: 0, misses: 0 }
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');

// --- history helpers ----------------------------------------------------
function saveState() {
    // push deep copy of current layers
    state.history.push(JSON.parse(JSON.stringify(state.layers)));
    // limit history size
    if (state.history.length > 100) {
        state.history.shift();
    }
    // clear redo when new action happens
    state.redoStack.length = 0;
    updateUndoRedoButtons();
}

function undo() {
    if (state.history.length === 0) return;
    // keep current state for redo
    state.redoStack.push(JSON.parse(JSON.stringify(state.layers)));
    state.layers = state.history.pop();
    render();
    updateUndoRedoButtons();
    updateLayersPanel();
}

function redo() {
    if (state.redoStack.length === 0) return;
    state.history.push(JSON.parse(JSON.stringify(state.layers)));
    state.layers = state.redoStack.pop();
    render();
    updateUndoRedoButtons();
    updateLayersPanel();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = state.history.length === 0;
    if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
}

// ============================================================================
// LAYER MANAGEMENT
// ============================================================================

function getCurrentLayer() {
    return state.layers.find(layer => layer.id === state.currentLayerId) || state.layers[0];
}

function addLayer(name = null) {
    const layerName = name || `Layer ${state.layers.length + 1}`;
    const layerId = 'layer_' + Date.now();
    const newLayer = {
        id: layerId,
        name: layerName,
        visible: true,
        drawings: {
            points: [],
            lines: [],
            polygons: []
        }
    };
    state.layers.push(newLayer);
    state.currentLayerId = layerId;
    updateLayersPanel();
    render();
}

function removeLayer(layerId) {
    if (state.layers.length <= 1) {
        alert('Cannot remove the last layer');
        return;
    }
    
    const index = state.layers.findIndex(layer => layer.id === layerId);
    if (index === -1) return;
    
    saveState();
    state.layers.splice(index, 1);
    
    // If we removed the current layer, switch to the first one
    if (state.currentLayerId === layerId) {
        state.currentLayerId = state.layers[0].id;
    }
    
    updateLayersPanel();
    render();
}

function toggleLayerVisibility(layerId) {
    const layer = state.layers.find(layer => layer.id === layerId);
    if (layer) {
        layer.visible = !layer.visible;
        updateLayersPanel();
        render();
    }
}

function setCurrentLayer(layerId) {
    if (state.layers.find(layer => layer.id === layerId)) {
        state.currentLayerId = layerId;
        updateLayersPanel();
    }
}

function renameLayer(layerId, newName) {
    const layer = state.layers.find(layer => layer.id === layerId);
    if (layer) {
        layer.name = newName.trim() || 'Unnamed Layer';
        updateLayersPanel();
    }
}

function getAllDrawings() {
    // Combine all visible layers' drawings for rendering
    const allDrawings = {
        points: [],
        lines: [],
        polygons: []
    };
    
    state.layers.forEach(layer => {
        if (layer.visible) {
            allDrawings.points.push(...layer.drawings.points);
            allDrawings.lines.push(...layer.drawings.lines);
            allDrawings.polygons.push(...layer.drawings.polygons);
        }
    });
    
    return allDrawings;
}

function updateLayersPanel() {
    const layersPanel = document.getElementById('layersPanel');
    if (!layersPanel) return;
    
    layersPanel.innerHTML = '';
    
    state.layers.forEach(layer => {
        const layerDiv = document.createElement('div');
        layerDiv.className = 'layer-item';
        if (layer.id === state.currentLayerId) {
            layerDiv.classList.add('active');
        }
        
        const count = layer.drawings.points.length + layer.drawings.lines.length + layer.drawings.polygons.length;
        
        layerDiv.innerHTML = `
            <input type="checkbox" ${layer.visible ? 'checked' : ''} 
                   onchange="toggleLayerVisibility('${layer.id}')">
            <span class="layer-name" onclick="setCurrentLayer('${layer.id}')" 
                  ondblclick="renameLayerPrompt('${layer.id}', '${layer.name.replace(/'/g, "\\'")}')">
                ${layer.name}
            </span>
            <span class="layer-count">(${count})</span>
            <button class="layer-remove" onclick="removeLayer('${layer.id}')" 
                    ${state.layers.length <= 1 ? 'disabled' : ''}>×</button>
        `;
        
        layersPanel.appendChild(layerDiv);
    });
}

function renameLayerPrompt(layerId, currentName) {
    const newName = prompt('Enter new layer name:', currentName);
    if (newName !== null && newName.trim() !== '') {
        renameLayer(layerId, newName);
    }
}

// Set canvas to match window size
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
}

resizeCanvas();
window.addEventListener('resize', () => {
    resizeCanvas();
    render();
});

// ============================================================================
// TILES & COORDINATES
// ============================================================================

// Convert lat/lon to tile coordinates
function latLonToTile(lat, lon, zoom) {
    const x = (lon + 180) / 360 * Math.pow(2, zoom);
    const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    return { x, y };
}

// Load or get tile from cache
function getTile(x, y, zoom) {
    const key = `${zoom}-${x}-${y}`;
    const cached = state.tileCache[key];
    
    if (cached && cached.complete && cached.naturalHeight > 0) {
        state.cacheStats.hits++;
        return cached;
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => {
        state.tileCache[key] = img;
        // Keep cache size under control
        if (Object.keys(state.tileCache).length > CONFIG.MAX_CACHE_TILES) {
            const keys = Object.keys(state.tileCache);
            delete state.tileCache[keys[0]];
        }
        state.cacheStats.misses++;
        render();
    });
    img.addEventListener('error', () => {
        console.warn(`Failed to load tile: ${key}`);
    });
    
    img.src = `${CONFIG.TILE_SERVER}/${zoom}/${x}/${y}.png`;
    return img;
}

// Measurement utilities
function toRad(value) {
    return value * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function computeDistance(points) {
    if (!points || points.length < 2) return 0;
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
        distance += haversineDistance(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
    }
    return distance;
}

function computePolygonArea(points) {
    // Spherical excess approximation (valid for small/medium polygons)
    if (!points || points.length < 3) return 0;
    const R = 6371000;
    const totalPoints = points.length;
    let sum = 0;

    for (let i = 0; i < totalPoints; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % totalPoints];
        const lon1 = toRad(p1.lon);
        const lat1 = toRad(p1.lat);
        const lon2 = toRad(p2.lon);
        const lat2 = toRad(p2.lat);
        sum += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    const area = Math.abs(sum) * R * R / 2;
    return area;
}

function updateMeasurementDisplay() {
    const modeText = state.measurement.mode === 'none' ? 'none' : state.measurement.mode;
    document.getElementById('measurementMode').textContent = modeText;

    let valueText = '0';
    if (state.measurement.mode === 'distance') {
        const m = computeDistance(state.measurement.points);
        state.measurement.value = m;
        state.measurement.unit = m >= 1000 ? 'km' : 'm';
        if (m >= 1000) {
            valueText = `${(m / 1000).toFixed(3)} km`;
        } else {
            valueText = `${m.toFixed(2)} m`;
        }
    } else if (state.measurement.mode === 'area') {
        const m2 = computePolygonArea(state.measurement.points);
        state.measurement.value = m2;
        state.measurement.unit = m2 >= 1000000 ? 'km²' : 'm²';
        if (m2 >= 1000000) {
            valueText = `${(m2 / 1000000).toFixed(3)} km²`;
        } else {
            valueText = `${m2.toFixed(2)} m²`;
        }
    } else {
        state.measurement.value = 0;
        state.measurement.unit = '';
    }

    document.getElementById('measurementValue').textContent = valueText;
}

function setMeasurementMode(mode) {
    state.measurement.mode = mode;
    state.measurement.points = [];
    state.measurement.value = 0;
    state.measurement.unit = '';
    updateMeasurementButtonStyles();
    updateMeasurementDisplay();
    render();
}

function clearMeasurement() {
    state.measurement.mode = 'none';
    state.measurement.points = [];
    state.measurement.value = 0;
    state.measurement.unit = '';
    updateMeasurementButtonStyles();
    updateMeasurementDisplay();
    render();
}

function updateMeasurementButtonStyles() {
    document.getElementById('distanceBtn').classList.toggle('active', state.measurement.mode === 'distance');
    document.getElementById('areaBtn').classList.toggle('active', state.measurement.mode === 'area');
    document.getElementById('panBtn').classList.remove('active');
    document.getElementById('pointBtn').classList.remove('active');
    document.getElementById('lineBtn').classList.remove('active');
    document.getElementById('polygonBtn').classList.remove('active');
}

// ============================================================================
// RENDERING
// ============================================================================

function render() {
    const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
    
    // Clear canvas
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Get the center tile coordinates
    const centerTile = latLonToTile(state.center.lat, state.center.lon, state.zoom);
    const tileSize = CONFIG.TILE_SIZE;
    
    // Calculate how many tiles we need
    const tilesHorizontal = Math.ceil(canvasWidth / tileSize) + 2;
    const tilesVertical = Math.ceil(canvasHeight / tileSize) + 2;
    
    // Get offset for smooth panning
    const fracX = centerTile.x - Math.floor(centerTile.x);
    const fracY = centerTile.y - Math.floor(centerTile.y);
    const startPixelX = (canvasWidth / 2) - (fracX * tileSize);
    const startPixelY = (canvasHeight / 2) - (fracY * tileSize);
    
    // Draw tile grid
    for (let dy = -Math.floor(tilesVertical / 2); dy <= Math.ceil(tilesVertical / 2); dy++) {
        for (let dx = -Math.floor(tilesHorizontal / 2); dx <= Math.ceil(tilesHorizontal / 2); dx++) {
            const maxTiles = Math.pow(2, state.zoom);
            const tileX = ((Math.floor(centerTile.x) + dx) % maxTiles + maxTiles) % maxTiles;
            const tileY = Math.floor(centerTile.y) + dy;
            
            const pixelX = startPixelX + (dx * tileSize);
            const pixelY = startPixelY + (dy * tileSize);
            
            const tile = getTile(tileX, tileY, state.zoom);
            
            // Draw tile
            if (tile.complete && tile.naturalHeight > 0) {
                ctx.drawImage(tile, pixelX, pixelY, tileSize, tileSize);
            } else {
                // Placeholder
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 1;
                ctx.strokeRect(pixelX, pixelY, tileSize, tileSize);
            }
        }
    }
    
    // Draw all saved geometries
    renderDrawings();
    
    // Update info panel
    updateInfoPanel();
}

function renderDrawings() {
    const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
    
    // Get combined drawings from all visible layers
    const drawings = getAllDrawings();
    
    // Convert map coordinates to canvas pixel coordinates
    const worldToCanvas = (lat, lon) => {
        const tile = latLonToTile(lat, lon, state.zoom);
        const centerTile = latLonToTile(state.center.lat, state.center.lon, state.zoom);
        
        const fracX = centerTile.x - Math.floor(centerTile.x);
        const fracY = centerTile.y - Math.floor(centerTile.y);
        const startPixelX = (canvasWidth / 2) - (fracX * CONFIG.TILE_SIZE);
        const startPixelY = (canvasHeight / 2) - (fracY * CONFIG.TILE_SIZE);
        
        const pixelX = startPixelX + (tile.x - Math.floor(centerTile.x)) * CONFIG.TILE_SIZE;
        const pixelY = startPixelY + (tile.y - Math.floor(centerTile.y)) * CONFIG.TILE_SIZE;
        
        return { x: pixelX, y: pixelY };
    };
    
    // Draw points
    drawings.points.forEach(point => {
        const pixel = worldToCanvas(point.lat, point.lon);
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, CONFIG.DRAW_STYLES.point.size, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.DRAW_STYLES.point.color;
        ctx.fill();
    });
    
    // Draw lines
    drawings.lines.forEach(line => {
        if (line.length < 2) return;
        ctx.beginPath();
        let first = true;
        line.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            if (first) {
                ctx.moveTo(pixel.x, pixel.y);
                first = false;
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        ctx.strokeStyle = CONFIG.DRAW_STYLES.line.color;
        ctx.lineWidth = CONFIG.DRAW_STYLES.line.width;
        ctx.stroke();
    });
    
    // Draw polygons
    drawings.polygons.forEach(polygon => {
        if (polygon.length < 3) return;
        ctx.beginPath();
        let first = true;
        polygon.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            if (first) {
                ctx.moveTo(pixel.x, pixel.y);
                first = false;
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        ctx.closePath();
        ctx.fillStyle = CONFIG.DRAW_STYLES.polygon.fillColor;
        ctx.globalAlpha = CONFIG.DRAW_STYLES.polygon.alpha;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = CONFIG.DRAW_STYLES.polygon.strokeColor;
        ctx.lineWidth = CONFIG.DRAW_STYLES.polygon.strokeWidth;
        ctx.stroke();
    });

    // Measurement overlay
    if (state.measurement.points.length > 0) {
        const points = state.measurement.points;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = state.measurement.mode === 'area' ? '#FF6600' : '#0066FF';
        ctx.fillStyle = 'rgba(255, 102, 0, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const pixel = worldToCanvas(points[i].lat, points[i].lon);
            if (i === 0) ctx.moveTo(pixel.x, pixel.y);
            else ctx.lineTo(pixel.x, pixel.y);
        }
        if (state.measurement.mode === 'area' && points.length > 2) {
            const firstPixel = worldToCanvas(points[0].lat, points[0].lon);
            ctx.lineTo(firstPixel.x, firstPixel.y);
            ctx.fill();
        }
        ctx.stroke();

        // Points
        points.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
        ctx.restore();
    }
    
    // Draw current line being drawn
    if (state.currentLine.length > 0) {
        ctx.beginPath();
        let first = true;
        state.currentLine.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            if (first) {
                ctx.moveTo(pixel.x, pixel.y);
                first = false;
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        ctx.strokeStyle = CONFIG.DRAW_STYLES.line.color;
        ctx.lineWidth = CONFIG.DRAW_STYLES.line.width;
        ctx.stroke();
        
        // Draw points on current line
        state.currentLine.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = CONFIG.DRAW_STYLES.line.color;
            ctx.fill();
        });
    }
    
    // Draw current polygon being drawn
    if (state.currentPolygon.length > 0) {
        ctx.beginPath();
        let first = true;
        state.currentPolygon.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            if (first) {
                ctx.moveTo(pixel.x, pixel.y);
                first = false;
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        if (state.currentPolygon.length > 1) {
            const lastPixel = worldToCanvas(state.currentPolygon[0].lat, state.currentPolygon[0].lon);
            ctx.lineTo(lastPixel.x, lastPixel.y);
        }
        ctx.strokeStyle = CONFIG.DRAW_STYLES.polygon.strokeColor;
        ctx.lineWidth = CONFIG.DRAW_STYLES.polygon.strokeWidth;
        ctx.stroke();
        
        // Draw points on current polygon
        state.currentPolygon.forEach(point => {
            const pixel = worldToCanvas(point.lat, point.lon);
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = CONFIG.DRAW_STYLES.polygon.strokeColor;
            ctx.fill();
        });
    }
}

function updateInfoPanel() {
    const drawings = getAllDrawings();
    document.getElementById('zoomLevel').textContent = state.zoom;
    document.getElementById('centerCoords').textContent = `${state.center.lat.toFixed(2)}, ${state.center.lon.toFixed(2)}`;
    document.getElementById('pointCount').textContent = drawings.points.length;
    document.getElementById('lineCount').textContent = drawings.lines.length;
    document.getElementById('polygonCount').textContent = drawings.polygons.length;
    updateMeasurementDisplay();
}

// ============================================================================
// USER INTERACTION
// ============================================================================

function setMode(newMode) {
    // Clear measurement mode when using drawing/pan modes, or set it explicitly
    if (newMode === 'distance' || newMode === 'area') {
        state.mode = newMode;
        setMeasurementMode(newMode);
    } else {
        state.mode = newMode;
        setMeasurementMode('none');
        // Update button styles
        document.getElementById('panBtn').classList.remove('active');
        document.getElementById('pointBtn').classList.remove('active');
        document.getElementById('lineBtn').classList.remove('active');
        document.getElementById('polygonBtn').classList.remove('active');
        document.getElementById('distanceBtn').classList.remove('active');
        document.getElementById('areaBtn').classList.remove('active');

        if (newMode === 'pan') document.getElementById('panBtn').classList.add('active');
        if (newMode === 'point') document.getElementById('pointBtn').classList.add('active');
        if (newMode === 'line') document.getElementById('lineBtn').classList.add('active');
        if (newMode === 'polygon') document.getElementById('polygonBtn').classList.add('active');

        state.currentLine = [];
        state.currentPolygon = [];
    }

    render();
}

function zoomIn() {
    state.zoom = Math.min(state.zoom + 1, 20);
    render();
}

function zoomOut() {
    state.zoom = Math.max(state.zoom - 1, 0);
    render();
}

function resetView() {
    state.zoom = CONFIG.DEFAULT_ZOOM;
    state.center = { ...CONFIG.DEFAULT_CENTER };
    render();
}

function clearAll() {
    if (confirm('Clear all drawings from all layers?')) {
        saveState();
        state.layers.forEach(layer => {
            layer.drawings = { points: [], lines: [], polygons: [] };
        });
        render();
    }
}

// ============================================================================
// CANVAS EVENTS
// ============================================================================

canvas.addEventListener('mousedown', (e) => {
    if (state.mode === 'pan') {
        state.isDragging = true;
        state.dragStart = { x: e.clientX, y: e.clientY };
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (state.isDragging && state.mode === 'pan') {
        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        
        const tileSize = CONFIG.TILE_SIZE;
        const tilesAtZoom = Math.pow(2, state.zoom);
        
        // Convert pixels to degrees
        const pixelsPerDegree = (tileSize * tilesAtZoom) / 360;
        state.center.lon -= (dx / pixelsPerDegree);
        state.center.lat += (dy / pixelsPerDegree);
        
        state.dragStart = { x: e.clientX, y: e.clientY };
        render();
    }
});

canvas.addEventListener('mouseup', () => {
    state.isDragging = false;
});
// Keyboard shortcuts (global)
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
    } else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z'))) {
        e.preventDefault();
        redo();
    }
});
canvas.addEventListener('mouseleave', () => {
    state.isDragging = false;
});

canvas.addEventListener('click', (e) => {
    if (state.mode === 'pan' || state.isDragging) return;
    
    // Convert click to map coordinates
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    
    const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
    
    const centerTile = latLonToTile(state.center.lat, state.center.lon, state.zoom);
    const fracX = centerTile.x - Math.floor(centerTile.x);
    const fracY = centerTile.y - Math.floor(centerTile.y);
    const startPixelX = (canvasWidth / 2) - (fracX * CONFIG.TILE_SIZE);
    const startPixelY = (canvasHeight / 2) - (fracY * CONFIG.TILE_SIZE);
    
    const tileX = Math.floor(centerTile.x) + (pixelX - startPixelX) / CONFIG.TILE_SIZE;
    const tileY = Math.floor(centerTile.y) + (pixelY - startPixelY) / CONFIG.TILE_SIZE;
    
    // Convert tile coordinates to lat/lon
    const lon = (tileX / Math.pow(2, state.zoom)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * tileY) / Math.pow(2, state.zoom);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    
    if (state.mode === 'point') {
        saveState();
        const currentLayer = getCurrentLayer();
        currentLayer.drawings.points.push({ lat, lon });
        render();
    } else if (state.mode === 'line') {
        state.currentLine.push({ lat, lon });
        render();
    } else if (state.mode === 'polygon') {
        state.currentPolygon.push({ lat, lon });
        render();
    } else if (state.mode === 'distance' || state.mode === 'area') {
        state.measurement.points.push({ lat, lon });
        updateMeasurementDisplay();
        render();
    }
});

// Double click to finish line/polygon
canvas.addEventListener('dblclick', (e) => {
    if (state.mode === 'line' && state.currentLine.length > 1) {
        saveState();
        const currentLayer = getCurrentLayer();
        currentLayer.drawings.lines.push([...state.currentLine]);
        state.currentLine = [];
        render();
    } else if (state.mode === 'polygon' && state.currentPolygon.length > 2) {
        saveState();
        const currentLayer = getCurrentLayer();
        currentLayer.drawings.polygons.push([...state.currentPolygon]);
        state.currentPolygon = [];
        render();
    }
});

// ============================================================================
// GEOJSON IMPORT/EXPORT
// ============================================================================

function exportGeoJSON() {
    try {
        const features = [];
        
        // Export from all layers
        state.layers.forEach(layer => {
            // Export points
            layer.drawings.points.forEach((point, idx) => {
                features.push({
                    type: 'Feature',
                    properties: {
                        name: `Point ${idx + 1}`,
                        layerId: layer.id,
                        layerName: layer.name,
                        timestamp: new Date().toISOString()
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [point.lon, point.lat]
                    }
                });
            });
            
            // Export lines
            layer.drawings.lines.forEach((line, idx) => {
                features.push({
                    type: 'Feature',
                    properties: {
                        name: `Line ${idx + 1}`,
                        layerId: layer.id,
                        layerName: layer.name,
                        vertices: line.length,
                        timestamp: new Date().toISOString()
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: line.map(p => [p.lon, p.lat])
                    }
                });
            });
            
            // Export polygons
            layer.drawings.polygons.forEach((polygon, idx) => {
                features.push({
                    type: 'Feature',
                    properties: {
                        name: `Polygon ${idx + 1}`,
                        layerId: layer.id,
                        layerName: layer.name,
                        vertices: polygon.length,
                        timestamp: new Date().toISOString()
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [polygon.map(p => [p.lon, p.lat])]
                    }
                });
            });
        });
        
        // Create GeoJSON FeatureCollection
        const geojson = {
            type: 'FeatureCollection',
            features: features,
            properties: {
                exported: new Date().toISOString(),
                center: {
                    lat: state.center.lat,
                    lon: state.center.lon
                },
                zoom: state.zoom,
                totalFeatures: features.length,
                layers: state.layers.map(layer => ({
                    id: layer.id,
                    name: layer.name,
                    visible: layer.visible,
                    featureCount: layer.drawings.points.length + layer.drawings.lines.length + layer.drawings.polygons.length
                }))
            }
        };
        
        if (features.length === 0) {
            alert('No drawings to export');
            return;
        }
        
        // Convert to JSON string with formatting
        const jsonString = JSON.stringify(geojson, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = 'map_data_' + Date.now() + '.geojson';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert(`✓ Exported ${features.length} feature${features.length !== 1 ? 's' : ''} from ${state.layers.length} layer${state.layers.length !== 1 ? 's' : ''}`);
        
    } catch (err) {
        console.error('Export error:', err);
        alert('Error exporting GeoJSON: ' + err.message);
    }
}

function importGeoJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson,.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                let geojson = JSON.parse(event.target.result);
                
                // Validate GeoJSON structure
                if (!geojson) {
                    alert('Error: Invalid GeoJSON file');
                    return;
                }
                
                // Handle both FeatureCollection and single Feature
                let features = [];
                if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
                    features = geojson.features;
                } else if (geojson.type === 'Feature') {
                    features = [geojson];
                } else if (Array.isArray(geojson)) {
                    features = geojson;
                } else {
                    alert('Error: GeoJSON must be a Feature, FeatureCollection, or array');
                    return;
                }
                
                if (features.length === 0) {
                    alert('No features found in GeoJSON file');
                    return;
                }
                
                let importedCount = 0;
                let errorCount = 0;
                
                // Group features by layer
                const layerGroups = {};
                
                features.forEach((feature, index) => {
                    try {
                        // Validate feature structure
                        if (!feature || !feature.geometry) {
                            console.warn(`Feature ${index} has no geometry`);
                            return;
                        }
                        
                        const geometry = feature.geometry;
                        const type = geometry.type;
                        const coordinates = geometry.coordinates;
                        const properties = feature.properties || {};
                        
                        if (!coordinates) {
                            console.warn(`Feature ${index} has no coordinates`);
                            return;
                        }
                        
                        // Determine layer for this feature
                        let layerId = properties.layerId || 'imported';
                        let layerName = properties.layerName || 'Imported Layer';
                        
                        if (!layerGroups[layerId]) {
                            layerGroups[layerId] = {
                                id: layerId,
                                name: layerName,
                                visible: true,
                                drawings: {
                                    points: [],
                                    lines: [],
                                    polygons: []
                                }
                            };
                        }
                        
                        const layer = layerGroups[layerId];
                        
                        if (type === 'Point' || type === 'point') {
                            // Point: [lon, lat]
                            if (Array.isArray(coordinates) && coordinates.length >= 2) {
                                layer.drawings.points.push({
                                    lon: coordinates[0],
                                    lat: coordinates[1]
                                });
                                importedCount++;
                            }
                        } 
                        else if (type === 'LineString' || type === 'linestring') {
                            // LineString: [[lon, lat], [lon, lat], ...]
                            if (Array.isArray(coordinates) && coordinates.length >= 2) {
                                const line = coordinates.map(c => ({
                                    lon: c[0],
                                    lat: c[1]
                                }));
                                layer.drawings.lines.push(line);
                                importedCount++;
                            }
                        } 
                        else if (type === 'Polygon' || type === 'polygon') {
                            // Polygon: [[[lon, lat], ...], ...] - first array is outer ring
                            if (Array.isArray(coordinates) && coordinates.length > 0) {
                                const outerRing = coordinates[0];
                                if (Array.isArray(outerRing) && outerRing.length >= 3) {
                                    const polygon = outerRing.map(c => ({
                                        lon: c[0],
                                        lat: c[1]
                                    }));
                                    layer.drawings.polygons.push(polygon);
                                    importedCount++;
                                }
                            }
                        }
                        else {
                            console.warn(`Unsupported geometry type: ${type}`);
                            errorCount++;
                        }
                    } catch (featureErr) {
                        console.error(`Error processing feature ${index}:`, featureErr);
                        errorCount++;
                    }
                });
                
                // Add imported layers to state
                saveState();
                Object.values(layerGroups).forEach(layer => {
                    // Check if layer already exists
                    const existingLayer = state.layers.find(l => l.id === layer.id);
                    if (existingLayer) {
                        // Merge with existing layer
                        existingLayer.drawings.points.push(...layer.drawings.points);
                        existingLayer.drawings.lines.push(...layer.drawings.lines);
                        existingLayer.drawings.polygons.push(...layer.drawings.polygons);
                    } else {
                        // Add as new layer
                        state.layers.push(layer);
                    }
                });
                
                // Render updated map
                render();
                updateLayersPanel();
                
                // Show results
                const layerCount = Object.keys(layerGroups).length;
                if (importedCount > 0) {
                    let msg = `✓ Imported ${importedCount} feature${importedCount !== 1 ? 's' : ''} into ${layerCount} layer${layerCount !== 1 ? 's' : ''}`;
                    if (errorCount > 0) {
                        msg += ` (${errorCount} errors)`;
                    }
                    alert(msg);
                } else {
                    alert('No valid features to import');
                }
                
            } catch (err) {
                console.error('Import error:', err);
                alert('Error reading GeoJSON file: ' + err.message);
            }
        };
        reader.onerror = () => {
            alert('Error reading file');
        };
        reader.readAsText(file);
    });
    input.click();
}

// ============================================================================
// TOUCH/MOBILE SUPPORT
// ============================================================================

let touchStartDistance = 0;

canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && state.mode === 'pan') {
        state.isDragging = true;
        state.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    
    if (e.touches.length === 1 && state.isDragging && state.mode === 'pan') {
        const dx = e.touches[0].clientX - state.dragStart.x;
        const dy = e.touches[0].clientY - state.dragStart.y;
        
        const tileSize = CONFIG.TILE_SIZE;
        const tilesAtZoom = Math.pow(2, state.zoom);
        const pixelsPerDegree = (tileSize * tilesAtZoom) / 360;
        
        state.center.lon -= (dx / pixelsPerDegree);
        state.center.lat += (dy / pixelsPerDegree);
        
        state.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        render();
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > touchStartDistance + 20) {
            zoomIn();
            touchStartDistance = distance;
        } else if (distance < touchStartDistance - 20) {
            zoomOut();
            touchStartDistance = distance;
        }
    }
});

canvas.addEventListener('touchend', () => {
    state.isDragging = false;
});

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('✓ Service Worker registered'))
        .catch(err => console.log('✗ Service Worker failed:', err.message));
}

// Initialize
setMode('pan');
updateLayersPanel();
render();
// record the empty initial drawing state and update buttons
saveState();
updateUndoRedoButtons();
