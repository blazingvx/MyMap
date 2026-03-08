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
    
    // Drawing
    drawings: {
        points: [],
        lines: [],
        polygons: []
    },
    
    // Current drawing
    currentLine: [],
    currentPolygon: [],
    
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
    state.drawings.points.forEach(point => {
        const pixel = worldToCanvas(point.lat, point.lon);
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, CONFIG.DRAW_STYLES.point.size, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.DRAW_STYLES.point.color;
        ctx.fill();
    });
    
    // Draw lines
    state.drawings.lines.forEach(line => {
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
    state.drawings.polygons.forEach(polygon => {
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
    document.getElementById('zoomLevel').textContent = state.zoom;
    document.getElementById('centerCoords').textContent = `${state.center.lat.toFixed(2)}, ${state.center.lon.toFixed(2)}`;
    document.getElementById('pointCount').textContent = state.drawings.points.length;
    document.getElementById('lineCount').textContent = state.drawings.lines.length;
    document.getElementById('polygonCount').textContent = state.drawings.polygons.length;
}

// ============================================================================
// USER INTERACTION
// ============================================================================

function setMode(newMode) {
    state.mode = newMode;
    
    // Update button styles
    document.getElementById('panBtn').classList.remove('active');
    document.getElementById('pointBtn').classList.remove('active');
    document.getElementById('lineBtn').classList.remove('active');
    document.getElementById('polygonBtn').classList.remove('active');
    
    if (newMode === 'pan') document.getElementById('panBtn').classList.add('active');
    if (newMode === 'point') document.getElementById('pointBtn').classList.add('active');
    if (newMode === 'line') document.getElementById('lineBtn').classList.add('active');
    if (newMode === 'polygon') document.getElementById('polygonBtn').classList.add('active');
    
    // Reset current drawing
    state.currentLine = [];
    state.currentPolygon = [];
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
    if (confirm('Clear all drawings?')) {
        state.drawings = { points: [], lines: [], polygons: [] };
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
        state.drawings.points.push({ lat, lon });
    } else if (state.mode === 'line') {
        state.currentLine.push({ lat, lon });
        render();
    } else if (state.mode === 'polygon') {
        state.currentPolygon.push({ lat, lon });
        render();
    }
});

// Double click to finish line/polygon
canvas.addEventListener('dblclick', (e) => {
    if (state.mode === 'line' && state.currentLine.length > 1) {
        state.drawings.lines.push([...state.currentLine]);
        state.currentLine = [];
        render();
    } else if (state.mode === 'polygon' && state.currentPolygon.length > 2) {
        state.drawings.polygons.push([...state.currentPolygon]);
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
        
        // Export points
        state.drawings.points.forEach((point, idx) => {
            features.push({
                type: 'Feature',
                properties: {
                    name: `Point ${idx + 1}`,
                    timestamp: new Date().toISOString()
                },
                geometry: {
                    type: 'Point',
                    coordinates: [point.lon, point.lat]
                }
            });
        });
        
        // Export lines
        state.drawings.lines.forEach((line, idx) => {
            features.push({
                type: 'Feature',
                properties: {
                    name: `Line ${idx + 1}`,
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
        state.drawings.polygons.forEach((polygon, idx) => {
            features.push({
                type: 'Feature',
                properties: {
                    name: `Polygon ${idx + 1}`,
                    vertices: polygon.length,
                    timestamp: new Date().toISOString()
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [polygon.map(p => [p.lon, p.lat])]
                }
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
                totalFeatures: features.length
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
        
        alert(`✓ Exported ${features.length} feature${features.length !== 1 ? 's' : ''}`);
        
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
                        
                        if (!coordinates) {
                            console.warn(`Feature ${index} has no coordinates`);
                            return;
                        }
                        
                        if (type === 'Point' || type === 'point') {
                            // Point: [lon, lat]
                            if (Array.isArray(coordinates) && coordinates.length >= 2) {
                                state.drawings.points.push({
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
                                state.drawings.lines.push(line);
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
                                    state.drawings.polygons.push(polygon);
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
                
                // Render updated map
                render();
                
                // Show results
                if (importedCount > 0) {
                    let msg = `✓ Imported ${importedCount} feature${importedCount !== 1 ? 's' : ''}`;
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
render();
