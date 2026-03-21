# Map Application

A lightweight, high-performance map application with drawing and GeoJSON support. 

[![Live Site](https://img.shields.io/badge/Live-Site-brightgreen)](https://blazingvx.github.io/MyMap/)

## Features

### Core Functionality
- ✅ **Pan** - Drag to navigate around the map
- ✅ **Zoom** - In/Out controls with mouse wheel support for desktop
- ✅ **Drawing** - Draw points, lines, and polygons
  - Points: Click to place
  - Lines: Click multiple times, double-click to finish
  - Polygons: Click to create vertices, double-click to finish
- ✅ **Reset View** - Return to default center and zoom level
- ✅ **GeoJSON Import** - Load saved maps from GeoJSON files
- ✅ **GeoJSON Export** - Save drawings to GeoJSON format
- ✅ **Clear** - Remove all drawings

### Performance Optimizations
- **Tile Caching** - Recently viewed tiles cached in memory for instant retrieval
- **Canvas Rendering** - Efficient 2D canvas API for fast drawing
- **Minimal Redraws** - Only redraw when necessary
- **Service Worker** - Offline support and network optimization
  - Automatically caches tiles for offline use
  - Works without internet connection for previously viewed areas

### Mobile Support
- Touch panning
- Pinch zoom (two-finger gesture)
- Responsive UI for tablets and phones

## Usage

### Drawing Workflows

#### Draw Points
1. Click "• Point" button
2. Click on map to place points
3. Points appear as red dots

#### Draw Lines
1. Click "— Line" button
2. Click multiple times to create line segments
3. Double-click to finish the line
4. Lines render in blue

#### Draw Polygons
1. Click "▲ Polygon" button
2. Click to create polygon vertices
3. Double-click to finish when you've placed 3+ points
4. Polygons render with green fill and black border

#### Pan Mode
1. Click "🔧 Pan" button (default mode)
2. Click and drag to pan around
3. Or use Pan mode to switch away from drawing

### Import/Export

#### Export Drawings
1. Click "📤 Export" button
2. Downloads a `.geojson` file with all drawings
3. File is named `map_data_[timestamp].geojson`

#### Import Drawings
1. Click "📥 Import" button
2. Select a `.geojson` or `.json` file
3. All features are loaded onto the map

#### Clear All
1. Click "🗑️ Clear" button
2. Confirms before deleting all drawings

## Map Information

The info panel (bottom-right) shows:
- Current zoom level (0-20)
- Map center coordinates
- Count of each drawing type

## Technical Details

### File Structure
- `index.html` - UI with canvas and toolbar
- `app.js` - Complete application logic (~600 lines)
- `sw.js` - Service Worker for caching

### Tile Source
Uses CartoDB Light map tiles:
```
https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png
```

### Performance Metrics
- **First Load**: 1-3 seconds (depends on network)
- **Pan/Zoom**: 60 fps with cached tiles
- **Saved Tile Access**: < 1ms per tile
- **Max Cached Tiles**: 100 in memory

### Browser Support
- Chrome/Chromium 60+
- Firefox 50+
- Safari 10+
- Edge 15+

## GeoJSON Format

### Export Format
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [lon, lat]
      },
      "properties": {}
    }
  ]
}
```

### Supported Import Types
- `Point` → Renders as red dots
- `LineString` → Renders as blue lines
- `Polygon` → Renders as green polygons

## Keyboard Shortcuts
- <kbd>Ctrl</kbd> + <kbd>Z</kbd> : Undo drawing
- <kbd>Ctrl</kbd> + <kbd>Y</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> : Redo drawing
- `R` : Reset view
- `+` : Zoom in
- `-` : Zoom out
- `Delete` : Clear all

## Tips & Tricks

1. **Smooth Panning**: Hold down mouse and drag smoothly across the map
2. **Precise Drawing**: Zoom in before drawing for better precision
3. **Multiple Sessions**: Separate exports can be combined by editing JSON
4. **Offline Use**: Once tiles are loaded, they're cached for offline viewing
5. **Batch Editing**: Export, edit JSON file, then re-import

## Known Limitations

- Maximum 20 zoom levels (standard for XYZ tiles)
- Drawing accuracy depends on zoom level
- Undo/Redo for drawing actions (buttons added)
- No layer support (all drawings rendered together)
- No feature properties editor

## Future Enhancements

- [x] Undo/Redo
- [ ] Feature properties editor
- [ ] Multiple layers
- [x] Keyboard shortcuts
- [ ] Drawing tools (rectangle, circle)
- [x] Measurement tools
- [ ] Heatmap support
- [ ] Custom tile sources

## License

Free to use and modify .
