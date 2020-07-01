
exports['gi0.PINF.it/build/v0'] = async function (LIB, CLASSES) {

    const PATH = LIB.PATH;
    const FS = LIB.FS_EXTRA;
    const COLORS = LIB.COLORS;
    const PUPPETEER = require("puppeteer");

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

    class BuildStep extends CLASSES.BuildStep {

        async onEveryBuild (result, build, target, instance, home, workspace) {

            if (build.method === 'start') {

                const url = `http://localhost:${build.config.port}/${LIB.PATH.relative(workspace.path, target.path)}`;

                loadUrl(url);

            } else
            if (build.method === 'stop') {

                const { browser } = await ensureStarted();
                if (browser) {
                    await browser.close();
                }

            } else {
                throw new Error(`Unknown method '${build.method}'!`);
            }
        }
    }

    return BuildStep;
}
