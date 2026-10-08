//
// vim: set autoindent expandtab ts=4 sw=4 sts=4:
//

// console.debug("autoresume: init background script");

const alarmPrefix = "autoresume-";
const alarmMonitor = alarmPrefix + "monitor";
const alarmPopup = alarmPrefix + "popup";
const notificationId = "Auto Resume Notification";

// Get logo for compositing with progress icon
const logoImage = new Image();
logoImage.src = "icons/autoresume-48.png";
const pctFmt = new Intl.NumberFormat(undefined, {
                                        style: "percent",
                                        maximumFractionDigits: 0});

// Color handling routines
function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
    const toHex = x => Math.round((x + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function generateSplitIconColor(originalHex) {
    const { h, s, l } = hexToHsl(originalHex);
    let topLightness = l > 50 ? 20 : 85;
    let topSaturation = l > 50 ? Math.max(s, 75) : Math.max(s, 85);
    return hslToHex(h, topSaturation, topLightness);
}

// Redraw progress in icon
function drawIcon(progress) {
    // Create context for rendering icon
    const canvas = document.createElement("canvas");
    const width = logoImage.width;
    canvas.width = width;
    const height = logoImage.height;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    // Because the icon arrow does not occupy the whole height,
    // we limit (approximately) the part of the icon that we modify
    const minF = 0.15;
    const maxF = 0.9;

    // Get the alternate color.  Should get the color from
    // the image, but we "know" the correct color.
    const altColor = generateSplitIconColor("#0099FF");

    // The idea is that the download starts with Firefox theme blue
    // and turns to default color depending on progress. When the
    // dowload is near complete, there should be almost no Firefox blue.

    // 1. Draw the logo
    ctx.drawImage(logoImage, 0, 0, width, height);

    if (progress >= 0) {
        // 2. Draw the progress fill draining from top to bottom
        const fillHeight = height * (maxF - minF) * (1.0 - progress);
        const fillY = height * maxF - fillHeight;
        ctx.fillStyle = altColor;
        ctx.fillRect(0, fillY, width, fillHeight);

        // 3. Use the logo as a mask to remove unwanted fill
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(logoImage, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
        browser.action.setTitle({title: "Auto Resume Downloads: " +
                                        pctFmt.format(progress)});
    } else
        browser.action.setTitle({title: ""});

    // 5. Extract pixel data and update icon
    const imageData = ctx.getImageData(0, 0, width, height);
    browser.action.setIcon({ imageData: imageData });
}

// Update progress in icon
async function updateProgress(progress) {
    if (!logoImage.complete)
        logoImage.onload = () => drawIcon(progress);
    else
        drawIcon(progress);
}

// Restore options state
async function getSavedOptions() {
    // value for options should match those in popup/choose_downloads.html
    let options = {
            auto:true,
            logEvents:true,
            notifyResume:false,
            notifyInterrupt:false,
            interval:30,
            monitorInterval:0,
            debug:browser.runtime.getManifest().version.includes("pre")
    };
    let result = await browser.storage.local.get({'options':options});
    for (let opt in result.options)
        options[opt] = result.options[opt];
    return options;
}

// Restore list of monitored downloads
async function getSavedIds(options) {
    let result = await browser.storage.local.get({'autoresume':{}});
    if (options.debug)
        console.debug("autoresume: recovered ids");
    let ids = result.autoresume;
    let dls = await browser.downloads.search({});
    let changed = false;
    // Remove all no-longer-present downloads
    for (let dlId in ids) {
        let dl = dls.find((d) => d.id.toString() == dlId);
        if (!dl) {
            delete ids[dlId];
            changed = true;
        }
    }
    // Add any new downloads
    let now = new Date().getTime();
    for (let dl of dls) {
        if (dl.state != "complete") {
            let dlId = dl.id.toString();
            if (!(dlId in ids) || ids[dlId].auto === undefined) {
                // For inexplicable reasons, sometimes the download
                // start time is in the future.  We just assume
                // that it started now.
                let start = dl.startTime;
                if (start > now) {
                    if (options.debug) {
                        console.debug("autoresume: future download " +
                                      "start time: " + new Date(start));
                        console.debug("autoresume: now: " + new Date(now));
                    }
                    start = now;
                }
                // Convert old version data to new version
                ids[dlId] = { auto: options.auto,
                              initTime: start,
                              initSize: dl.bytesReceived,
                              endTime: null };
                changed = true;
            }
        }
    }
    if (changed)
        await browser.storage.local.set({autoresume:ids});
    return ids;
}

async function reloadDownloads(options, ids) {
    let query = {"orderBy": ["-startTime"]};
    async function show(dls) {
        let totalSize = 0;
        let totalRecv = 0;
        for (let dl of dls) {
            if (dl.state != "in_progress" && dl.state != "interrupted")
                continue;
            totalSize += dl.totalBytes;
            totalRecv += dl.bytesReceived;
        }
        if (totalSize > 0)
            updateProgress(totalRecv / totalSize);
        else
            updateProgress(-1);
        let msg = {command:"show-downloads",
                   downloads:dls,
                   auto:ids,
                   options:options};
        await browser.runtime.sendMessage(msg).then(ignore, ignore);
        resetAlarm(options, dls);
    }
    await browser.downloads.search(query).then(show, onError);
}

async function resetAlarm(options, dls) {
    let running = false;
    for (let dl of dls)
        if (dl.state == "in_progress" || dl.state == "interrupted") {
            running = true;
            break;
        }
    if (options.monitorInterval && running) {
        let pim = options.monitorInterval / 60.0;
        browser.alarms.get(alarmMonitor).then(async (alarm) => {
            if (!alarm) {
                if (options.debug)
                    console.debug("create alarm: " + alarmMonitor +
                                  " period: " + pim + " minutes");
                browser.alarms.create(alarmMonitor,
                                            {periodInMinutes:pim});
            }
        });
    } else {
        if (options.debug)
            console.debug("clear alarm: " + alarmMonitor);
        browser.alarms.clear(alarmMonitor);
    }
}

async function reloadOptions(options) {
    msg = {command:"show-options",
           options:options};
    await browser.runtime.sendMessage(msg).then(ignore, ignore);
}

function ignore(value) {
    return;
}

function onResume() {
    let options = getSavedOptions();
    if (options.debug)
        console.log("autoresume: download resumed");
}

function onError(error) {
    console.error("autoresume: " + error.message);
}

function basename(path) {
    return path.replace(/^.*[\\\/]/, '');
}

// Process requests from UI
browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    let options = await getSavedOptions();
    if (options.debug) {
        console.info("autoresume: background received command: " + msg.command);
        // console.debug(msg);
    }
    if (msg.command == "popup") {
        // Send "show-downloads" message with latest list of downloads.
        let ids = await getSavedIds(options);
        await reloadDownloads(options, ids);
    } else if (msg.command == "update") {
        // Remove download id from autoresume list if not selected.
        // Add if selected.
        let ids = await getSavedIds(options);
        if (ids[msg.id].auto !== msg.selected) {
            ids[msg.id].auto = msg.selected;
            await browser.storage.local.set({autoresume:ids});
        }
    } else if (msg.command == "options") {
        // Send "show-options" message with current options.
        await reloadOptions(options);
    } else if (msg.command == "option-auto") {
        options.auto = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-log-events") {
        options.logEvents = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-notify-resume") {
        options.notifyResume = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-notify-interrupt") {
        options.notifyInterrupt = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-interval") {
        let interval = parseInt(msg.value);
        // Should match option.html limits
        if (!isNaN(interval) && interval >= 5 && interval <= 600) {
            options.interval = interval
            await browser.storage.local.set({options:options});
        }
    } else if (msg.command == "option-monitor-interval") {
        let interval = parseInt(msg.value);
        // Should match option.html limits
        if (!isNaN(interval) && interval >= 0 && interval <= 60) {
            if (interval != options.monitorInterval) {
                options.monitorInterval = interval
                browser.storage.local.set({options:options}).then(() => {
                    if (options.debug) {
                        if (interval)
                            console.debug("monitor alarm: " + interval + "s");
                        else
                            console.debug("monitor alarm: off");
                    }
                });
                let ids = await getSavedIds(options);
                await reloadDownloads(options, ids);
            }
        }
    } else if (msg.command == "option-notify-debug") {
        options.debug = msg.selected;
        await browser.storage.local.set({options:options});
    }
    sendResponse(true);
    return true;
});

// Listen for download stopped/paused/failed events
// and automatically resume if possible.

browser.downloads.onCreated.addListener(async (dl) => {
    let options = await getSavedOptions();
    if (options.debug) {
        console.info("autoresume: download created: " +
                     basename(dl.filename));
        console.debug(dl);
    }
    let ids = await getSavedIds(options);
    await reloadDownloads(options, ids);
});

browser.downloads.onChanged.addListener(async (dlDelta) => {
    if (!dlDelta.state)
        return;
    let options = await getSavedOptions();
    if (options.debug)
        console.info("autoresume: download changed: " +
                     dlDelta.id + ": " +
                     dlDelta.state.previous + " -> " +
                     dlDelta.state.current);
    let ids = await getSavedIds(options);
    let dlId = dlDelta.id.toString();
    if (dlDelta.state.current == "complete") {
        // Remove from autoresume list
        if (dlId in ids) {
            ids[dlId].endTime = new Date().toISOString();
            await browser.storage.local.set({autoresume:ids});
        }
        await reloadDownloads(options);
    } else if (dlDelta.state.current == "interrupted") {
        if (dlId in ids) {
            ids[dlId].endTime = new Date().toISOString();
            await browser.storage.local.set({autoresume:ids});
        }
        // If a download is interrupted, see if we can restart it
        let interval = options.interval / 60.0;
        let name = alarmPrefix + dlDelta.id.toString();
        browser.alarms.create(name, {delayInMinutes:interval});
        if (options.debug) {
            console.info("autoresume: download " + dlDelta.id.toString() +
                          " interrupted at " + 
                          new Date().toLocaleTimeString());
            console.debug(dlDelta);
        }
        if (options.notifyInterrupt || options.logEvents) {
            browser.downloads.search({id:dlDelta.id}).then((dls) => {
                if (options.debug) {
                    console.debug("autoresume: notify interrupt");
                    console.debug(dls);
                }
                if (dls.length == 0)
                    return;
                let dl = dls[0];
                let msg = "Download for " + basename(dl.filename) +
                         " interrupted at " +
                         new Date().toLocaleTimeString();
                if (dl.error)
                    msg += " (" + dl.error + ")";
                if (options.notifyInterrupt) {
                    let n = {type:"basic",
                             iconUrl:"icons/autoresume-96.png",
                             title:"Download Resumed",
                             message:msg};
                    browser.notifications.create(notificationId, n);
                }
                if (options.logEvents)
                    console.log("autoresume: " + msg);
            });
        }
    } else if (dlDelta.state.current == "in_progress") {
        if (dlId in ids && ids[dlId].endTime) {
            ids[dlId].endTime = null;
            await browser.storage.local.set({autoresume:ids});
        }
    }
});

browser.alarms.onAlarm.addListener(async (alarmInfo) => {
    let options = await getSavedOptions();
    if (options.debug)
        console.debug("autoresume: received alarm: " + alarmInfo.name);
    if (!alarmInfo.name.startsWith(alarmPrefix))
        return;
    if (alarmInfo.name == alarmMonitor) {
        if (options.debug)
            console.debug("autoresume: update download rates");
        let ids = await getSavedIds(options);
        await reloadDownloads(options, ids);
        return;
    }
    let name = alarmInfo.name.substring(alarmPrefix.length);
    let id = parseInt(name);
    browser.downloads.search({id:id}).then((dls) => {
        // There should only be one item in dls array
        for (let dl of dls) {
            if (dl.state == "interrupted" && dl.canResume) {
                if (options.notifyResume || options.logEvents) {
                    let msg = "Download for " + basename(dl.filename) +
                              " resumed at " +
                              new Date().toLocaleTimeString();
                    if (options.notifyResume) {
                        let n = {type:"basic",
                                 iconUrl:"icons/autoresume-96.png",
                                 title:"Download Resumed",
                                 message:msg};
                        browser.notifications.create(notificationId, n);
                    }
                    if (options.logEvents)
                        console.log("autoresume: " + msg);
                }
                browser.downloads.resume(dl.id).then(onResume, onError);
            }
        }
    });
});

function redisplay() {
    getSavedOptions().then((options) => {
        getSavedIds(options).then((ids) => {
            reloadDownloads(options, ids);
        });
    });
}

// Popup script creates a port when it starts up.
// We use its life cycle to update and clean up as needed.
browser.runtime.onConnect.addListener((port) => {
    if (port.name === alarmPopup) {
        // console.log("popup created");
        redisplay();
    }
});

redisplay();
