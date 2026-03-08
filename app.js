// Get the map container and set the canvas size to window size
const mapContainer = document.getElementById('map');
let mapWidth = window.innerWidth;
let mapHeight = window.innerHeight;

// Create canvas and set the map dimensions
let mapCanvas = document.createElement('canvas');
const dpr = window.devicePixelRatio || 1; // Handle high-DPI screens
mapCanvas.width = mapWidth * dpr;
mapCanvas.height = mapHeight * dpr;
mapCanvas.style.width = mapWidth + 'px';
mapCanvas.style.height = mapHeight + 'px';
mapContainer.appendChild(mapCanvas);
let ctx = mapCanvas.getContext('2d');
ctx.scale(dpr, dpr); // Scale canvas context for high-DPI

// Store map properties (coordinates, zoom level)
let map = {
    zoom: 8, // Set to an appropriate zoom level for Ireland
    center: { lat: 53.349805, lon: -6.26031 },  // Coordinates for the center of Ireland
    scale: 256,  // Tile size (in pixels)
};

// Store user-drawn objects
let drawnObjects = {
    points: [],
    lines: [],
    polygons: []
};

// Drawing mode state
let drawingMode = null;
let currentLine = [];
let currentPolygon = [];
let isDragging = false;
let lastMousePosition = { x: 0, y: 0 };

// Tile cache to avoid redundant network requests
let tileCache = {};

// Convert latitude/longitude to tile coordinates
function latLonToTile(lat, lon, zoom) {
    const x = (lon + 180) / 360 * Math.pow(2, zoom);
    const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    return { x: Math.floor(x), y: Math.floor(y) };
}

// Helper function to load map tiles with caching
function loadMapTile(x, y, zoom) {
    const tileKey = `${zoom}-${x}-${y}`;
    if (tileCache[tileKey]) {
        return tileCache[tileKey];  // Return cached tile
    }
    const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    const img = new Image();
    img.src = url;
    tileCache[tileKey] = img;  // Cache tile
    return img;
}

// Redraw the base map with a specific zoom and center
function drawBaseMap() {
    const tileCoords = latLonToTile(map.center.lat, map.center.lon, map.zoom);
    const tile = loadMapTile(tileCoords.x, tileCoords.y, map.zoom);
    
    tile.onload = function () {
        ctx.clearRect(0, 0, mapWidth, mapHeight);  // Clear previous tiles
        ctx.drawImage(tile, 0, 0, map.scale, map.scale);
        drawDrawnObjects();  // Redraw objects (points, lines, polygons) over the tiles
    };
}

// Redraw only the drawn objects (not the base map)
function drawDrawnObjects() {
    drawnObjects.points.forEach(function (point) {
        drawPoint(point[0], point[1]);
    });

    drawnObjects.lines.forEach(function (line) {
        drawLine(line);
    });

    drawnObjects.polygons.forEach(function (polygon) {
        drawPolygon(polygon);
    });
}

// Debounce function to reduce resize event firing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Update map size on window resize with debouncing
const handleResize = debounce(function () {
    mapWidth = window.innerWidth;
    mapHeight = window.innerHeight;
    mapCanvas.width = mapWidth * dpr;
    mapCanvas.height = mapHeight * dpr;
    mapCanvas.style.width = mapWidth + 'px';
    mapCanvas.style.height = mapHeight + 'px';
    ctx.scale(dpr, dpr);
    drawBaseMap();
}, 250);

window.addEventListener('resize', handleResize);

// Pan the map based on dragging
function startPan(event) {
    if (isDragging) {
        const dx = event.offsetX - lastMousePosition.x;
        const dy = event.offsetY - lastMousePosition.y;

        map.center.lon -= (dx / map.scale) * 360 / Math.pow(2, map.zoom);
        map.center.lat += (dy / map.scale) * 360 / Math.pow(2, map.zoom);

        lastMousePosition = { x: event.offsetX, y: event.offsetY };
        drawBaseMap();
    }
}

// Enable dragging to pan the map
mapCanvas.addEventListener('mousedown', function (event) {
    isDragging = true;
    lastMousePosition = { x: event.offsetX, y: event.offsetY };
    mapCanvas.style.cursor = 'move';  // Change cursor on drag
});

// Disable dragging on mouseup
mapCanvas.addEventListener('mouseup', function () {
    isDragging = false;
    mapCanvas.style.cursor = 'pointer';  // Reset cursor after drag
});

// Enable dragging on mousemove
mapCanvas.addEventListener('mousemove', startPan);

// Touch support for mobile devices
let touchStartPos = { x: 0, y: 0 };
let touchStartDistance = 0;

mapCanvas.addEventListener('touchstart', function (event) {
    if (event.touches.length === 1) {
        isDragging = true;
        touchStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        mapCanvas.style.cursor = 'move';
    } else if (event.touches.length === 2) {
        // Pinch zoom
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
});

mapCanvas.addEventListener('touchmove', function (event) {
    event.preventDefault();
    if (event.touches.length === 1 && isDragging) {
        const dx = event.touches[0].clientX - touchStartPos.x;
        const dy = event.touches[0].clientY - touchStartPos.y;
        
        map.center.lon -= (dx / map.scale) * 360 / Math.pow(2, map.zoom);
        map.center.lat += (dy / map.scale) * 360 / Math.pow(2, map.zoom);
        
        touchStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        drawBaseMap();
    } else if (event.touches.length === 2) {
        // Pinch zoom
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > touchStartDistance + 10) {
            zoomIn();
            touchStartDistance = distance;
        } else if (distance < touchStartDistance - 10) {
            zoomOut();
            touchStartDistance = distance;
        }
    }
});

mapCanvas.addEventListener('touchend', function () {
    isDragging = false;
    mapCanvas.style.cursor = 'pointer';
});

// Draw a point
function drawPoint(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'red';
    ctx.fill();
}

// Draw a line
function drawLine(line) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) {
        ctx.lineTo(line[i][0], line[i][1]);
    }
    ctx.strokeStyle = 'blue';
    ctx.stroke();
}

// Draw a polygon
function drawPolygon(polygon) {
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i][0], polygon[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = 'green';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.stroke();
}

// Handle drawing mode
function startDrawingPoint() {
    drawingMode = 'point';
    mapCanvas.addEventListener('click', handleDrawing);
}

function startDrawingLine() {
    drawingMode = 'line';
    mapCanvas.addEventListener('click', handleDrawing);
}

function startDrawingPolygon() {
    drawingMode = 'polygon';
    mapCanvas.addEventListener('click', handleDrawing);
}

function handleDrawing(event) {
    const x = event.offsetX;
    const y = event.offsetY;

    if (drawingMode === 'point') {
        drawnObjects.points.push([x, y]);
    } else if (drawingMode === 'line') {
        currentLine.push([x, y]);
        drawnObjects.lines.push(currentLine);
    } else if (drawingMode === 'polygon') {
        currentPolygon.push([x, y]);
        drawnObjects.polygons.push(currentPolygon);
    }

    drawBaseMap();
}

// Zoom In/Out functionality
function zoomIn() {
    map.zoom += 1;
    map.scale = 256 * Math.pow(2, map.zoom);
    drawBaseMap();
}

function zoomOut() {
    map.zoom -= 1;
    map.scale = 256 * Math.pow(2, map.zoom);
    drawBaseMap();
}

// Import data from GeoJSON
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson';
    input.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const geoJSON = JSON.parse(e.target.result);
                processGeoJSON(geoJSON);
            };
            reader.readAsText(file);
        }
    });
    input.click();
}

// Process GeoJSON data
function processGeoJSON(geoJSON) {
    drawnObjects = { points: [], lines: [], polygons: [] };
    geoJSON.features.forEach(function (feature) {
        if (feature.geometry.type === 'Point') {
            drawnObjects.points.push(feature.geometry.coordinates);
        } else if (feature.geometry.type === 'LineString') {
            drawnObjects.lines.push(feature.geometry.coordinates);
        } else if (feature.geometry.type === 'Polygon') {
            drawnObjects.polygons.push(feature.geometry.coordinates[0]);
        }
    });
    drawBaseMap();
}

// Export data to GeoJSON
function exportData() {
    const geoJSON = {
        type: 'FeatureCollection',
        features: []
    };

    drawnObjects.points.forEach(function (point) {
        geoJSON.features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: point
            }
        });
    });

    drawnObjects.lines.forEach(function (line) {
        geoJSON.features.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: line
            }
        });
    });

    drawnObjects.polygons.forEach(function (polygon) {
        geoJSON.features.push({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [polygon]
            }
        });
    });

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geoJSON));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'map_data.geojson');
    downloadAnchorNode.click();
}

// Initial map rendering centered on Ireland
drawBaseMap();
