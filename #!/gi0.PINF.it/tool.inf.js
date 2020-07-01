
exports['gi0.pinf.it/core/v0/tool'] = async function (workspace, LIB) {

    const PATH = require("path");
    const FS = require("fs-extra");
    const PUPPETEER = require("puppeteer");
    const COLORS = require("colors");
    const CHOKIDAR = require('chokidar');

    async function ensureStarted () {
        if (!ensureStarted._instance) {

            let browser = await PUPPETEER.launch({
                headless: false,
                devtools: false,
                defaultViewport: null
            });        

            const origClose = browser.close;
            browser.close = async function () {
                await origClose.call(browser);
                browser = null;
            }

            const page = await browser.newPage();

            // TODO: Track URLs loaded and listen for change events from expressjs routers
            //       which emit URL change events if files used to build resource change.

            page.on('console', function (msg) {
                console.log.apply(console, [
                    COLORS.bold.magenta(`BROWSER:`)
                ].concat(msg.args().map(function (arg) {
                    return COLORS.magenta(arg._remoteObject.value);
                })));
            });

            ensureStarted._instance = {
                browser: browser,
                page: page,
                isReady: function () {
                    return !!browser;
                }
            };
        }
        return ensureStarted._instance;
    }

    let loadUrlQueue = Promise.resolve();
    let loadedOnce = false;
    const loadUrl = LIB.LODASH.debounce(function (url) {

        loadUrlQueue = loadUrlQueue.then(async function () {

            const { page, browser, isReady } = await ensureStarted();

            if (!isReady()) {
                return;
            }

            if (!loadedOnce) {

                console.log(COLORS.bold.magenta(`Loading URL:`, url));
                page.goto(url);

                loadedOnce = true;
            } else {

                console.log(COLORS.bold.magenta(`Reloading Browser`));
                page.reload();
            }

            await new Promise(function (resolve) {
                page.once('domcontentloaded', resolve);
            });
        });

    }, 250);

    return async function (instance) {

        if (/\/runner\/v0$/.test(instance.kindId)) {

            let watcher = null;

            return async function (invocation) {

                if (invocation.method === 'run') {

                    if (invocation.mount.path === 'start') {

                        const url = invocation.value;

                        loadUrl(url);

                        if (
                            invocation.config.config &&
                            invocation.config.config.reloadOnWorkspaceChange
                        ) {

                            watcher = CHOKIDAR.watch('.', {
                                cwd: invocation.pwd,
                                ignored: /\/(\.~[^\/]*|\._[^\/]*|\.git)\//,
                                ignoreInitial: true
                            });

                            watcher.on('all', function (event, path) {
    //console.error("event, path::", event, path);
                                if (event === 'add') {
                                    return;
                                }

                                loadUrl(url);
                            });
                        }

                        return {
                            value: true
                        };
                    } else
                    if (invocation.mount.path === 'stop') {

                        if (watcher) {
                            await watcher.close();
                            watcher = null;
                        }

                        const { browser } = await ensureStarted();
                        if (browser) {
                            await browser.close();
                        }

                        return {
                            value: true
                        };
                    }
                }
            };
        }
    };
}
