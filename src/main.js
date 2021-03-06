var path = require('path');
var events = require('events');
var fs = require('fs');

var electron = require('electron');
var app = electron.app;
var Tray = electron.Tray;
var Menu = electron.Menu;
var globalShortcut = electron.globalShortcut;
var BrowserWindow = electron.BrowserWindow;

var extend = require('extend');
var Positioner = require('electron-positioner');

var options = {
    width: 436,
    height: 600,
    tooltip: 'GifBar',
    'always-on-top': true,
    preloadWindow: true
};

create(options);

function create (opts) {
    if (typeof opts === 'undefined') opts = {dir: app.getAppPath()};
    if (typeof opts === 'string') opts = {dir: opts};
    if (!opts.dir) opts.dir = app.getAppPath();
    if (!(path.isAbsolute(opts.dir))) opts.dir = path.resolve(opts.dir);
    if (!opts.index) opts.index = 'file://' + path.join(opts.dir, 'index.html');
    if (!opts['window-position']) opts['window-position'] = (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter';
    if (typeof opts['show-dock-icon'] === 'undefined') opts['show-dock-icon'] = false;

    // set width/height on opts to be usable before the window is created
    opts.width = opts.width || 400;
    opts.height = opts.height || 400;
    opts.tooltip = opts.tooltip || '';

    app.on('ready', appReady);
    app.on('will-quit', willQuit);

    var shortcut = 'CommandOrControl+Alt+G';

    var menubar = new events.EventEmitter();
    menubar.app = app;

    // Set / get options
    menubar.setOption = function (opt, val) {
        opts[opt] = val;
    };

    menubar.getOption = function (opt) {
        return opts[opt];
    };

    return menubar;

    function appReady () {
        if (app.dock && !opts['show-dock-icon']) app.dock.hide();

        var iconPath = opts.icon || path.join(opts.dir, 'IconTemplate.png');
        if (!fs.existsSync(iconPath)) iconPath = path.join(__dirname, 'IconTemplate.png'); // default cat icon

        var cachedBounds; // cachedBounds are needed for double-clicked event

        menubar.tray = opts.tray || new Tray(iconPath);
        menubar.tray.on('click', clicked);
        menubar.tray.on('double-click', clicked);
        menubar.tray.on('right-click', showDetailMenu);
        menubar.tray.setToolTip(opts.tooltip);

        if (opts.preloadWindow || opts['preload-window']) {
            createWindow();
        }

        globalShortcut.register(shortcut, function() {
            if (menubar.window && menubar.window.isVisible()) return hideWindow();
            showWindow(cachedBounds);
        });

        menubar.showWindow = showWindow;
        menubar.hideWindow = hideWindow;
        menubar.emit('ready');

        function clicked (e, bounds) {
            if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return hideWindow();
            if (menubar.window && menubar.window.isVisible()) return hideWindow();
            cachedBounds = bounds || cachedBounds;
            showWindow(cachedBounds);
        }

        function createWindow () {
            menubar.emit('create-window');
            var defaults = {
                show: false,
                frame: false
            };

            var winOpts = extend(defaults, opts);
            menubar.window = new BrowserWindow(winOpts);

            menubar.positioner = new Positioner(menubar.window);

            if (!opts['always-on-top']) {
                menubar.window.on('blur', hideWindow);
            } else {
                menubar.window.on('blur', emitBlur);
            }

            if (opts['show-on-all-workspaces'] !== false) {
                menubar.window.setVisibleOnAllWorkspaces(true);
            }

            menubar.window.on('close', windowClear);
            menubar.window.loadURL(opts.index);
            menubar.emit('after-create-window');
        }

        function showWindow (trayPos) {
            if (!menubar.window) {
                createWindow();;
            }

            menubar.emit('show');

            if (trayPos && trayPos.x !== 0) {
                // Cache the bounds
                cachedBounds = trayPos;
            } else if (cachedBounds) {
                // Cached value will be used if showWindow is called without bounds data
                trayPos = cachedBounds;
            }

            // Default the window to the right if `trayPos` bounds are undefined or null.
            var noBoundsPosition = null;
            if ((trayPos === undefined || trayPos.x === 0) && opts['window-position'].substr(0, 4) === 'tray') {
                noBoundsPosition = (process.platform === 'win32') ? 'bottomRight' : 'topRight';
            }

            var position = menubar.positioner.calculate(noBoundsPosition || opts['window-position'], trayPos);

            var x = (opts.x !== undefined) ? opts.x : position.x;
            var y = (opts.y !== undefined) ? opts.y : position.y;

            menubar.window.setPosition(x, y);
            menubar.window.show();
            menubar.emit('after-show');
            // Send an event that we have shown the window
            menubar.window.webContents.send('after-show');
            return;
        }

        function hideWindow () {
            if (!menubar.window) return;
            menubar.emit('hide');
            menubar.window.hide();
            menubar.emit('after-hide');
        }

        function windowClear () {
            delete menubar.window;
            menubar.emit('after-close');
        }

        function emitBlur () {
            menubar.emit('focus-lost');
        }

        function showDetailMenu () {
            var contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Toggle DevTools',
                    accelerator: 'Alt+Command+I',
                    click: function() {
                        menubar.window.show();
                        menubar.window.toggleDevTools();
                    }
                },
                {
                    label: 'Quit',
                    accelerator: 'Command+Q',
                    selector: 'terminate:',
                }
            ]);

                menubar.tray.popUpContextMenu(contextMenu);
        }
    }

    function willQuit() {
        globalShortcut.unregister(shortcut);
    }
}